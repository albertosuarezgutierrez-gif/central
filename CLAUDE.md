# CLAUDE.md — Central (casa de marcas)

> Raíz del monorepo (repo GitHub aún `ia.rest`). Sin lógica de producto: `packages/*` = módulos
> compartidos, `apps/*` = verticales. Estructura en **`MATRIZ.md`**; estado vivo en
> **`docs/CONTEXTO-SESIONES.md`**.
>
> 📦 **Este fichero es el ÍNDICE + las reglas (recortado el 30/09/2026 para gastar menos tokens:
> se carga en cada sesión y en cada subagente).** La versión íntegra, con cada incidente, medición y
> porqué, está en `docs/claude-md/RAIZ-completo-2026-09-30.md`. **No la leas entera: búscala con
> Grep** (`«CI»`, `«preview»`, `«housesevillana»`…) cuando necesites el detalle de una regla.

## Verticales (cada una con su `CLAUDE.md` y su proyecto Vercel)
- **`apps/ia-rest`** — Voice POS hostelería (`iarest.es`). Consume `core-ai` y `core-fiscal`.
- **`apps/sivra`** — web pública de pisos turísticos; la gestión interna vive en `plataforma` (`/sivra/*`). NO borrar la app.
- **`apps/ialimp`** — SaaS de limpiezas (`app.ialimp.es`). Cliente vivo → ahí sí «preview verde antes de main».
- **`apps/plataforma`** — cuadro de mando (Cuenta → Sociedad → Negocio). BD compartida con sivra+ialimp.
  Es LA pantalla de Alberto, también de la correduría (`/correduria`).
- **`apps/rrhh`** — Portal del Empleado (schema `rrhh`, rol `rrhh_app`). Alta de empresas por `/api/operador/empresas`.
- **`apps/transporte`** — flota/portes (`module-flota` + `module-transporte`, rol `prisma_transporte`).
- **`apps/alquiler`** — alquiler de materiales (`module-alquiler`, rol `prisma_alquiler`).
- **`apps/housesevillana`** — landing de House Sevillana. 🚨 **Dirección: Calle Socorro 24, 41003 Sevilla
  (San Julián). NO es Bustos Tavera 22** (esos son otros dos pisos). `/en` y `/it` se DERIVAN del HTML español
  por diccionario de cadenas exactas: tocar un texto español rompe su traducción. La reescribe el agente SEO
  de sivra (`/api/seo-refresh`). Guardián: `test/regression-house-sevillana-direccion.test.ts`.
- **`apps/almacen`** — almacén de eventos (cliente Joaquín Jaén), `module-materiales`. Tiene `CLAUDE.md` propio.
- **`apps/mariscos`** — trazabilidad pesquera (Mariscos González), `module-pesca`. Pendiente de Vercel/SQL/alta real.
- **`apps/asegura`** — **Grupo ASegura** (correduría). Es la TRASTIENDA: BD de la cartera (schema `seguros`),
  puerto `/api/operador/*` y la única que gasta dinero (Codeoscopic). **Una pantalla nueva de la correduría se
  monta en `plataforma` → `/correduria`**, no aquí. Ver `apps/asegura/CLAUDE.md` y la skill `correduria-crm`.
  - ✍️ Se escribe **«Grupo ASegura»** (A y S mayúsculas: es el monograma). Guardián en `pnpm test:guardia`.
  - 🔤 Tipografía de marca: **Quicksand** (titulares, menús, botones, 600-700) + **Nunito Sans** (cuerpo), sin
    cursivas, cobalto `#3364ee`. En plataforma el lenguaje visual va en todo el cuadro de mando, pero el logo y
    el nombre «Grupo ASegura» solo en `/correduria` (el resto, «Mi grupo»). El correo usa el PNG
    `logotipo-asegura-correo.png` (Gmail no pinta SVG): si tocas el trazo del logo, regenéralo.
  - 🚨 **32.600 fichas ≠ clientes.** Cliente = póliza viva de CIMA EN VIGOR: `esCarteraEnVigor()` de
    `packages/module-seguros/src/cartera-viva.ts` (origen: `esCarteraViva()`). Nunca `clientes.tipo`.
  - 🔑 Rotar la contraseña de un rol de BD y actualizar el `DATABASE_URL` de su proyecto Vercel es UN solo paso.
- **`apps/asegura-portal`** — portal del CLIENTE (rol `prisma_asegura_portal` SIN BYPASSRLS; el aislamiento lo da
  el CÓDIGO). `canal_no_disponible` (503) ≠ «el envío falló» (502). `CLAUDE.md` propio.
- **`apps/asegura-web`** — web pública (`grupoasegura.es` + `www`). **Sin BD a propósito**: el lead va a
  plataforma reenviando `x-forwarded-for`. Analítica fail-CLOSED (sin Cookiebot no se mide). Mediador y colores
  de `module-seguros`/`@central/brand`, nunca a mano. `app.grupoasegura.com` es el CRM de Manuel (ingesta CIMA):
  no se toca. Guardianes en `apps/asegura-web/lib/*.test.ts`.

## Módulos compartidos (`packages/*`, TS puro, scope `@central/*`)
`core-ai`, `core-fiscal`, `core-push` (Web Push), `core-storage`, `core-email`, `core-identity`
(`requireSecret`), `core-telegram` (bot único; enrutado por prefijo de `callback_data`), `core-catastro`,
`brand` (marca por cliente: `emitirRootCss`; alta con la skill `marca-cliente`, colores del logo, nunca a ojo),
y los `module-*` de cada vertical.

## Memoria entre sesiones (el contenedor es efímero)
- Al terminar: entrada nueva ARRIBA en `docs/CONTEXTO-SESIONES.md`, **máx. ~8 líneas**, fecha `(dd/mm/aaaa)`.
  El hook `Stop` la commitea y empuja; si la sesión tocó código sin anotarla, bloquea una vez.
- Meses cerrados en `docs/memoria/AAAA-MM.md`. Decisiones pasadas: `memoria_buscar()` (sigue viva).
- Una sesión de solo charla con una decisión importante no dispara el guardián: anótala a mano.
- `/auditoria-diaria` reconcilia memoria/skills/docs con el código; `/agentes-entrenador` mejora prompts.

## Navegación de código
1. **`code-map`** (tabla `mapa_arquitectura`) para acotar candidatos a coste ~0.
2. **`rastreador-codigo`** (solo lectura, económico): quién llama a qué, qué rompe un cambio, qué tests lo cubren.
3. `Grep`/`Read` directos solo para lo acotado. **Localizar ≠ entender: lee el código antes de tocarlo.**
- El grafo propio se RETIRÓ (21/09/2026): no busques `grafo_*`. **No borres `grafo_embed_textos`**: la usa
  `memoria_buscar`. Graphify (MCP) no se usa.

## Reglas globales permanentes
- **Estilo:** no narres el trabajo; al terminar, UN resumen corto (qué, archivos, tests, pendiente).
- **Mira los PRs ABIERTOS antes de empezar** algo no trivial (`list_pull_requests`). Mirarlos no es mergearlos.
- **Un cepo no está terminado hasta verlo FALLAR:** rompe lo que protege, míralo en rojo, restaura. Un brazo por aserción.
- **Comunicaciones salientes:** NUNCA correo/mensaje a terceros sin OK explícito de Alberto para ESE envío. Por defecto, borrador.
- **Quién mira qué pantalla:** antes de dar por avisada a una persona, comprueba dónde trabaja. Vanesa (Sique Brilla)
  SOLO abre `/invitado/limpieza`; `sivra_ordenes_limpieza.tarea_id` NULL = no lo ve, y se dice.
- **Dato que NO hay ≠ dato que NO se ha mirado:** en columnas de enriquecimiento, `null` = «no se sabe»; nunca
  `?? 0`/`?? []`/🟢. Tres estados (`null` pendiente · `[]`/0 revisado · dato). Ante la duda, el estado conservador.
  Un `catch` que devuelve vacío no autoriza a afirmar ausencia. Hermanos: el dato leído del periodo/unidad
  equivocado (la clave es periodo + unidad) y el valor de cajón (`'otro'`, `'N/A'`): anúlalo antes de escribir
  (`COALESCE(NULLIF(nuevo,'otro'), viejo)`). Lógica del titular en helper puro con test.
- **Agrupar personas por IDENTIDAD:** NIF/id → enlace a ficha → nombre; dos identificadores distintos no se funden jamás.
- **Responsive:** toda UI funciona a ≥320 px (tablas con scroll o cards, botones ≥44 px, modales 95 vw). En plataforma
  el scroller es `LayoutShell`, no `body`: mide ahí. `display:grid` sin columnas → `gridTemplateColumns: 'minmax(0, 1fr)'`.
- **Rendimiento UI:** nada monta cientos de filas de golpe (plegado perezoso, ~50 + «Ver más», recarga sin desmontar).
  Referencia: `apps/plataforma/app/(usuario)/finanzas/GastosTab.tsx`.
- **Dinero en formato español:** `2.162,49€` (puntos de miles también en 4 cifras, coma decimal, € detrás).
  En plataforma, `eur()` de `lib/dinero.ts`.
- **Secretos de auth sin fallback a literal:** `requireSecret()` de `@central/core-identity`. Guardián `regression-secrets`.
- **Los cambios que ROMPEN se hacen AHORA**, mientras no hay clientes en producción.

## Agentes y tokens
- 🧭 **La sesión principal ORDENA y REVISA; los AGENTES EJECUTAN — siempre, en toda sesión** (Alberto, 30/09/2026:
  «todo lo hacen los agentes, tú solo ordenar y revisar; esto se hace siempre», y que no tenga que repetirlo).
  - **Sesión principal:** entiende el encargo, decide, reparte (qué agente, qué archivos PUEDE y cuáles NO), revisa lo
    que devuelve cada agente (diff, tests, cifras) y da el resumen a Alberto. Commitear, empujar y abrir/mergear PRs
    siguen en la sesión (es el control del conjunto).
  - **Todo lo demás, un agente:** explorar/leer código, escribir código y tests, SQL y cambios de datos, docs y
    memoria, diagnosticar CI. **Sin umbral de tamaño**: también el cambio de 1-2 archivos.
  - **Qué agente:** mecánico/bajo riesgo → `agente-mecanico` · código normal → `general-purpose` con `model: sonnet` ·
    localizar → `rastreador-codigo` · afirmar una ausencia/estado o validar un cepo → `verificador-esceptico` ·
    alto riesgo (datos de clientes, emisión, pagos, RLS, migraciones) → `agente-architect`.
    Si sonnet/haiku devuelven 429 de límite semanal, relanza con `model: opus`.
  - **En paralelo** cuando no se pisen archivos; lista explícita de archivos en cada prompt. Si dos agentes tocan
    apps con Prisma a la vez, ninguno corre `prisma generate`/`tsc`: la verificación final la hace UN agente después.
  - Única excepción: consultas de estado triviales (git status, estado de CI de un PR, leer notificaciones), que
    cuestan menos que el prompt de un agente. Ningún agente commitea ni empuja; verifica antes de informar.
- **Ahorro:** pide a cada agente un informe de **≤15 líneas sin volcar código**; en la sesión lee solo el tramo que
  necesitas (offset/limit, `grep`), nunca un JSON o log entero; los logs grandes, a fichero y `grep`.
- **Antes de sacar un PR de draft:** pasada de `code-review` (o `agente-architect` si es alto riesgo).
- Anota cada uso de `agente-mecanico`/`delegar-codigo` (ok o fallo) en `docs/AGENTE-MECANICO-BITACORA.md`.

## CI (detalle e historia: el archivo, sección «CI»)
- **«Expected» ≠ «Failing».** Los pushes con el token de la App pueden no disparar Actions. Orden:
  0) ¿existen los runs? (`list_workflow_runs`; `total_count: 0` de jobs puede ser cola: espera) → si están verdes,
  reintenta el merge; 1) ¿`git ls-remote` ≠ `head.sha`? espera 2-3 min; 2) PR en draft → sácalo **y** empuja
  contenido real (mergear `main` vale); 3) si sigue mudo, mergea `main`; 4) si no, Alberto.
  **Prohibido:** commit vacío, cerrar/reabrir, rama nueva por iniciativa propia, tocar el ruleset o su bypass.
- Requeridos = nombres de JOB: `Análisis estático · Patrones conocidos`, `Lint · TypeCheck · Build`,
  `Tests (packages + guardián)` + `Typecheck · <app>` (el ruleset exige 9; los demás corren). Los `Vercel – *` no.
- ⚠️ **La matriz de `tests.yml` ya NO son 9 apps: son 13** — `ia-rest, ialimp, sivra, plataforma, rrhh, transporte,
  alquiler, almacen, mariscos, asegura, asegura-portal, asegura-web, housesevillana`. Cuéntalas en el workflow antes de
  citar la cifra (lo vigila `test/regression-matriz-typecheck.test.ts`); **una app nueva se añade a la matriz** en su alta.
- **Todo se puede correr en local:** `npx --yes pnpm@10.33.0 install --no-frozen-lockfile`; `pnpm test` (raíz);
  por app `pnpm exec prisma generate` + `pnpm exec tsc --noEmit -p tsconfig.json`; QA y lint/build desde `apps/ia-rest`.
  🚨 El cliente Prisma es UNO para todo el monorepo: regenera el de ESA app antes de su tsc.
  `apps/asegura` tiene DOS schemas (`prisma generate && prisma generate --schema prisma/asegura.prisma`).
- Mira un diff con **tres puntos** (`origin/main...HEAD`). `git push origin <rama>` empuja la rama, no HEAD
  (lo vigila `scripts/guardian-rama.mjs`). Un `completed failure` puede ser jobs `cancelled`: mira los jobs.
  Los `check_suite.completed` que llegan son de Vercel: el estado real es `get_status` + `get_check_runs`.

## Reglas de la matriz (Vercel)
- App nueva = `apps/<app>` con `package.json`/`vercel.json`, proyecto Vercel con Root Directory `apps/<app>` e install
  `npx --yes pnpm@10.33.0 install --no-frozen-lockfile`.
- 🚨 **Todo `apps/<app>/vercel.json` lleva `"ignoreCommand": "node ../../scripts/vercel-ignore-build.mjs apps/<app>"`**
  (sin ella cada push reconstruye TODAS las apps: incidente de ~600 US$). Todas salvo ialimp llevan `--sin-previews`.
- **`[preview]`** fuerza una preview solo si va en el asunto del **último** commit del push **y** ese commit toca la app.
  **Nunca en un commit de merge** (construye las once). `Building` en el comentario de Vercel es intermedio.
- **`Ignored` no es gratis del todo:** cada push a una rama de PR crea 11 deployments contra un cupo de 450/h de
  cuenta. Verifica en local y empuja UNA vez.
- **NUNCA** `apps/` en el `.vercelignore` de la raíz.
- Las apps consumen `packages/*` por `file:`/`workspace:`; no acoples un paquete a una vertical.
