# tarificador-rpa — worker del tarificador RPA de Grupo ASegura

Bot Playwright que cotiza en portales de compañía lo que Codeoscopic/Avant2 no cubre (empieza por
**Allianz ePAC, comunidades**). Una máquina **efímera** de Fly por trabajo (app `asegura-tarificador`,
org `grupo-asegura`, región `cdg`, shared-cpu-2x / 2 GB, `auto_destroy`). La lanza `apps/asegura`
(`lib/tarificador.ts`); la cola es `seguros.tarificacion_trabajos`.

**TARIFICAR ≠ EMITIR.** `src/guard.ts` aborta (→ `error_definitivo`) cualquier navegación o botón que case
con `emit|emisi|contrat|formaliz|suplement|anul|baja`. Los adaptadores pulsan solo con `ctx.pulsar()`.
CAPTCHA → `requiere_humano` (nunca se evita). Reintento: uno, y solo de infraestructura.

## Por qué está FUERA del workspace pnpm
`pnpm-workspace.yaml` = `apps/*` + `packages/*`. Meter aquí Playwright haría que cada `pnpm install` de
cada proyecto Vercel resolviera una dependencia que ninguna app usa. Este servicio tiene su propio
`package-lock.json` y consume `@central/module-tarificacion` por `file:`. No entra en la matriz de
Vercel ni en `tests.yml`: sus reglas puras viven en el package (tests vitest) y sus cepos de forma
(sin `.click()` directo, sin CODEOSCOPIC/DATABASE_URL, fly.toml sin servicios, versión de Playwright
alineada) en `test/regression-tarificador-rpa.test.ts` de la raíz.

Local: `npm ci && npm run typecheck`.

## Alta en Fly (una vez)
```sh
fly apps create asegura-tarificador --org grupo-asegura
# Secretos del worker (los valores NO van en el repo, ni en Vercel, ni en BD):
fly secrets set --app asegura-tarificador --stage \
  TARIFICADOR_WORKER_SECRET=<mismo valor que en Vercel central-asegura> \
  CRED_ALLIANZ_EPAC_USER=<usuario ePAC> \
  CRED_ALLIANZ_EPAC_PASS=<contraseña ePAC>
```
- **Nunca** `DATABASE_URL`, `DIRECT_URL` ni `CODEOSCOPIC_*` en esta app: el runner se niega a arrancar.
- Credencial nueva de otra compañía: `CRED_<CLAVE>_USER` / `_PASS`, con `<CLAVE>` = `credencial_clave` de
  `seguros.companias_integracion` (y el adaptador declara la misma `credencial`).
- Los fly secrets de la app se inyectan en las máquinas creadas por la API de Machines: comprobarlo en el
  primer trabajo real (si faltan, el trabajo acaba `error_definitivo` «faltan los fly secrets»).

## Probar el formulario SIN portal (harness offline)
```sh
npx tsx scripts/probar-formulario.ts /ruta/al/html-de-evidencia.html   # NO se commitea el HTML
```
El HTML es el que guarda el runner en un fallo (`seguros.documentos`, redactado), ya con el contenido de
los marcos: el formulario de ePAC vive en el iframe `appArea` (`src/evidencia.ts`). El harness lo monta sin
red ni JS y comprueba que cada campo de `CAMPOS` resuelve a un control y acepta `fill`/`setChecked`.
No pulsa nada: Calcular, desplegables ndbx, la lectura de ofertas y el avance solo se validan en real.

## Construir la imagen (desde la RAÍZ del monorepo)
```sh
fly deploy . --config services/tarificador-rpa/fly.toml --dockerfile services/tarificador-rpa/Dockerfile \
  --build-only --push --image-label v20261005
```
`--build-only` a propósito: no se crea ninguna máquina permanente. La imagen resultante
(`registry.fly.io/asegura-tarificador:v20261005`) va a la env `TARIFICADOR_FLY_IMAGE` de Vercel.
(`Dockerfile.dockerignore` acota el contexto si el builder lo soporta; si no, sube la raíz entera pero
los `COPY` son explícitos y la imagen es la misma.)

## Envs del orquestador (Vercel `central-asegura`, solo nombres)
`TARIFICADOR_RPA_ACTIVO` (=`1` para encender; apagado por defecto) · `TARIFICADOR_WORKER_SECRET` ·
`FLY_API_TOKEN` (token de despliegue acotado a la app `asegura-tarificador`) · `TARIFICADOR_FLY_APP` ·
`TARIFICADOR_FLY_IMAGE` · `TARIFICADOR_API_URL` (https de asegura que el worker llama).
