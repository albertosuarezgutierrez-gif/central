# Tarificador RPA — Puesta en marcha (05/10/2026)

Worker de Fly + orquestador en asegura. Una máquina efímera por trabajo; cola `seguros.tarificacion_trabajos`.

## 1. Aplicar SQL en Supabase
[ ] Ir a Supabase → proyecto **central** → SQL Editor → crear query con `apps/asegura/prisma/sql/2026-10-05_tarificador_rpa.sql`.
[ ] Verificar: `select count(*) from seguros.tarificacion_trabajos` debe devolver 0. Comprobación: `select count(*) from seguros.companias_integracion` para saber si hay filas que editar.

## 2. Crear app Fly en grupo-asegura
[ ] `fly auth login` (si no está logueado).
[ ] `fly apps create asegura-tarificador --org grupo-asegura` (región por defecto está bien; se fuerza cdg en Dockerfile).

## 3. Establecer secretos de Fly (credenciales + worker)
[ ] Generar secreto del worker: `openssl rand -hex 32` → copiar valor completo.
[ ] ```bash
fly secrets set --app asegura-tarificador --stage \
  TARIFICADOR_WORKER_SECRET=<PON_AQUÍ_el_valor_generado> \
  CRED_ALLIANZ_EPAC_USER=<PON_AQUÍ_usuario_ePAC> \
  CRED_ALLIANZ_EPAC_PASS=<PON_AQUÍ_contraseña_ePAC>
```

## 4. Construir e impulsar imagen
[ ] `cd /home/user/central && fly deploy . --config services/tarificador-rpa/fly.toml --dockerfile services/tarificador-rpa/Dockerfile --build-only --push --image-label v20261005`
[ ] Anotar referencia completa: `registry.fly.io/asegura-tarificador:v20261005`

## 5. Token Fly limitado (para Vercel)
[ ] `fly tokens create deploy -a asegura-tarificador` → copiar el valor completo.

## 6. Variables en Vercel (central-asegura)
[ ] Proyecto: `central-asegura` | Settings | Environment Variables. Añadir:
   - `TARIFICADOR_RPA_ACTIVO` = `0` (apagado hasta paso 7)
   - `TARIFICADOR_WORKER_SECRET` = <valor de paso 3>
   - `FLY_API_TOKEN` = <token de paso 5>
   - `TARIFICADOR_FLY_APP` = `asegura-tarificador`
   - `TARIFICADOR_FLY_IMAGE` = `registry.fly.io/asegura-tarificador:v20261005`
   - `TARIFICADOR_API_URL` = `https://api.grupoasegura.es`
[ ] Redeploy del proyecto.

## 7. Prueba controlada
[ ] `TARIFICADOR_RPA_ACTIVO` = `1` en Vercel; Redeploy.
[ ] Encolar trabajo mínimo (verificar): `curl -X POST https://api.grupoasegura.es/api/operador/tarificador/encolar -H "Authorization: Bearer $OPERADOR_SECRET" -H "Content-Type: application/json" -d '{"correduriaId":"...", "oportunidadId":null, "clienteId":"...", "polizaId":null, "compania":"ALLIANZ_EPAC", "ramo":"comunidades", "riesgo":{...}, "solicitadoPor":"operador"}' | jq`
[ ] Mirar `select * from seguros.tarificacion_trabajos where compania = 'ALLIANZ_EPAC' order by created_at desc limit 1` y comparar precio en ePAC a mano.
[ ] `TARIFICADOR_RPA_ACTIVO` = `0` en Vercel; Redeploy.

## 8. Pendientes (NO bloqueantes)
- Enganchar `barrerTarificadorRpa` a un cron de operador.
- Puente con PR #4305 (filtro `canal='codeoscopic'` en `lib/presupuesto.ts`).

## 9. Reglas de oro
- El bot **NUNCA** pulsa Aceptar en Tarificar, Emitir, Archivar, Proyecto Ampliado.
- Credenciales **SOLO en fly secrets**. Base de datos: ni en env ni en código.
- Si falta una credencial en fly, el trabajo acaba con error `credenciales` (no `error_definitivo`).
