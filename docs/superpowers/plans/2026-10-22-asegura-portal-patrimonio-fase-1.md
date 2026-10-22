# Plan — Patrimonio en asegura-portal, Fase 1

> Spec: `docs/superpowers/specs/2026-10-22-asegura-portal-patrimonio-design.md`. Cada paso lo entrega UN agente, con
> su lista de archivos, sus tests y un cepo visto en ROJO. Ningún agente commitea/empuja; si dos tocan apps con Prisma
> a la vez, ninguno corre `prisma generate`/`tsc` (verifica uno al final). Pasos con SQL o aislamiento = `agente-architect`.
> Regla del portal: el DDL se aplica en el MISMO paso que el despliegue que lo usa; GRANT antes que schema.

## Paso 1 — Paquete puro `@central/module-patrimonio` ✅ (22/10/2026)
- Archivos: `packages/module-patrimonio/{package.json,tsconfig.json}`, `src/{fechas,tipos,gastos-fijos,imputacion,contrato,actualizacion-renta,calendario,rentabilidad,index}.ts` + `*.test.ts`.
  Colateral: `packages/module-contabilidad/src/*.ts` importan con `.ts` (para `node --test`), `pnpm-lock.yaml`.
- Tests: `pnpm --filter @central/module-patrimonio test` (58), también con `TZ=Pacific/Kiritimati` y `TZ=Pacific/Pago_Pago`;
  `pnpm --filter @central/module-contabilidad test`; `tsc` del paquete y de `apps/sivra`; `pnpm test:guardia`.

## Paso 2 — Puro: accesos, infraseguro, enlace del inquilino ✅ (22/10/2026)
- `packages/module-patrimonio/src/acceso.ts`: `nivelesPatrimonio({vinculadas, dueno, autorizaciones})` → `Map<titularId, 'gestion'|'total'>`
  fail-closed (alcance desconocido → nada; revocada/no aceptada → nada; se queda el nivel más alto) y `puede(nivel, accion)`
  con la tabla de §4.
- `src/infraseguro.ts`: `alertaInfraseguro({capitalContinente, valorEstimado, enComunidad, polizaComunidadEnlazada})`
  → `sin_dato | ok | infraseguro` + ratio + faltante. Reutiliza `avisoInfraseguro`/`UMBRAL_INFRASEGURO` de
  `@central/module-tarificacion` si su índice carga con `node --test`; si no, recibe el umbral como parámetro (no duplicar 0,8).
- `src/enlace-inquilino.ts`: qué ve el inquilino (lista blanca de campos) y estados del enlace (anulado, caducado).
- Tests `*.test.ts` de cada uno + rojo.

## Paso 3 — SQL + schema ✅ aplicado en BD (22/10/2026)
- `apps/asegura-portal/prisma/sql/2026-10-2X_portal_patrimonio.sql`: tablas de §4, CHECKs, índices únicos parciales,
  `REVOKE ALL … FROM crm_seguros`, `GRANT` por columnas a `prisma_asegura_portal` (sin DELETE), alcances
  `patrimonio_gestion`/`patrimonio_total` en el CHECK de `portal_autorizacion.alcance` (sin tocar `ALCANCES`).
- `apps/asegura-portal/prisma/schema.prisma`: modelos `PortalPatrimonio*` espejo exacto de los GRANT.
- Tests: `test/regression-portal-sin-crm.test.ts` (debe cubrir las tablas nuevas), cepo nuevo
  `test/regression-portal-patrimonio-sql.test.ts` (lee el SQL: cada tabla con REVOKE y sin GRANT DELETE).

## Paso 4 — Accesos y adaptadores ✅ (22/10/2026)
- `apps/asegura-portal/lib/patrimonio/accesos.ts` (`accesosPatrimonio(identidadId)` a imagen de `lib/flota.ts`),
  `lib/patrimonio/lectura.ts` (filas → tipos puros; céntimos `bigint` → `number`).
- Cepo `test/regression-portal-patrimonio-aislamiento.test.ts` + inclusión en `test/regression-portal-aislamiento.test.ts`.

## Paso 5 — Pantallas de titulares e inmuebles ✅ (22/10/2026)
- `app/(portal)/patrimonio/page.tsx` (lista por titular, plegado perezoso ~50 + «Ver más»), `patrimonio/inmueble/[id]/page.tsx`,
  `patrimonio/NuevoInmueble.tsx` reutilizando `BuscadorDireccionCp`/`lib/catastro.ts`; `app/api/patrimonio/inmuebles/route.ts`.
  `NavPortal.tsx`: entrada «Patrimonio» solo si `accesosPatrimonio` no está vacío.
- Responsive ≥320 px (mide en el scroller), dinero con `eur()`. Tests de la ruta (aislamiento 404) y del formulario (CP primero).

## Paso 6 — Gastos fijos, comunidad y derramas ✅ (22/10/2026)
- `app/(portal)/patrimonio/gastos/*`, `app/api/patrimonio/plantillas/route.ts`, `app/api/patrimonio/derramas/route.ts`,
  `app/api/cron/patrimonio-gastos/route.ts` (idempotente por `clave`, `CRON_SECRET`), `vercel.json` cron.
- Tests: el cron dos veces no duplica (P2002 tolerado), plantilla ajena → 404.

## Paso 7 — Facturas con IA (general-purpose, sonnet; revisión agente-architect)
- `lib/patrimonio/extraer-factura.ts` (patrón de `apps/plataforma/lib/agente-facturas/extraer.ts`, `core-ai`, `pdf-parse` en
  `serverExternalPackages` ya está), `app/api/patrimonio/facturas/route.ts` (10 MB, tope por identidad/día),
  `patrimonio/gastos/RevisarFactura.tsx` (propuesta + motivos + confirmar).
- Tests: `fuente:'none'` no crea gasto de 0; `OTRO` se anula; inmueble ajeno → 404.

## Paso 8 — Documentos (general-purpose, sonnet)
- `module-documental` con owners `inmueble`/`contrato`/`inquilino`, carpetas definidas en `lib/patrimonio/carpetas.ts`;
  storage del portal existente. Tests de permisos por nivel (Gestión sube; inquilino solo su carpeta de recibos).

## Paso 9 — Contratos, inquilinos y actualización de renta (agente-architect: PII)
- `patrimonio/contrato/[id]`, alta de inquilino con PII por el PUENTE de `apps/asegura` (`/api/portal/patrimonio/inquilino`),
  `lib/patrimonio/indices.ts` (LEE `portal_patrimonio_indice`, que llena el paso 9b), propuesta de actualización
  (aplicar = fila append-only).
- Tests: sin cláusula no propone; índice distinto rechaza; el portal nunca guarda NIF en claro.

## Paso 9b — Índices IPC/IRAV automáticos desde el INE (general-purpose, sonnet; revisión agente-architect)
- Puro: `packages/module-patrimonio/src/indices-ine.ts` — `parsearSerieIne(json, indice)` → `{periodo, pct}[]` y
  `validarIndice` (periodo `YYYY-MM`, número finito, rango −10..+20 %, sin huecos raros); test con JSON de muestra
  guardado en el test (nada de red en tests) y rojo.
- `apps/asegura/app/api/cron/indices-renta/route.ts` (`CRON_SECRET`, mensual en `vercel.json`): descarga la API JSON
  del INE (IPC general variación anual; IRAV), valida y hace INSERT de lo nuevo en `portal_patrimonio_indice`
  (ON CONFLICT DO NOTHING; revisión del INE = fila `revisado=true`). Si falla o el periodo esperado no llega en
  su fecha → Telegram (`core-telegram`) y NO escribe. DDL de la tabla en el SQL del paso 3 (GRANT SELECT al portal).
- Tests: fallo de red/formato no escribe y avisa; dos pasadas no duplican; índice ausente → la propuesta sale `sin_indice`.

## Paso 10 — Calendario y avisos (general-purpose, sonnet)
- `lib/patrimonio/calendario.ts` (adaptador de `calendarioPatrimonio`), fuente `patrimonio` en `lib/avisos.ts`/«Pendiente de ti»
  (con `sinComprobar`), push en `api/cron/avisos-push`. Tests: fuente ilegible → `!`, nunca «0».

## Paso 11 — Rentabilidad e infraseguro (general-purpose, sonnet)
- `patrimonio/rentabilidad/page.tsx` (año/trimestre/mes), frases por aviso, CTA «Pedir precio» → lead declarada
  (`lead-declarada.ts`) SOLO del titular, nunca del inquilino. Tests de textos por aviso y de `null` → «—».

## Paso 12 — Inquilino por enlace (agente-architect)
- `app/inquilino/[token]/page.tsx` + `app/api/inquilino/*` (código al correo, tope por IP/destino), subida del recibo del
  seguro y aviso de avería → `portal_patrimonio_aviso_inquilino`; convertir en parte desde el propietario. Envío del
  correo en `apps/asegura` (borrador hasta OK). Consentimiento comercial propio del inquilino, no premarcado.
- Cepos: el token no abre sesión; el inquilino no ve gastos/rentas; ninguna lectura de leads toca inquilinos.

## Paso 13 — Legal y alta del módulo (agente-architect + Alberto)
- Texto de encargo de tratamiento (`app/legal/encargo-patrimonio`), `portal_consentimiento` tipo `encargo_patrimonio`,
  `VERSION_TEXTOS_LEGALES` +1, gate «gratis solo con póliza en vigor» (`esCarteraEnVigor`).

## Paso 14 — Importación por el cliente: Excel/CSV con mapeo propuesto por IA (agente-architect para el puro y la confirmación)
Va después de pantallas, gastos y contratos (pasos 5-9) porque crea esas mismas entidades por sus mismas rutas.
- 14a Puro: `packages/module-patrimonio/src/importacion.ts` — `proponerMapeo(cabeceras, muestra)` heurístico (la IA lo
  mejora, no lo sustituye), `aplicarMapeo(filas, mapeo)` → filas por entidad con `problema` (fecha/CP/importe ilegible,
  celda de cajón → `null`, nunca 0), `detectarDuplicados` (ref. catastral / NIF / clave de plantilla) como «ya existe».
  Tests + rojo.
- 14b `app/api/patrimonio/importaciones/route.ts` (subida 10 MB, xlsx/csv, tope por identidad/día) +
  `lib/patrimonio/mapeo-ia.ts` (`core-ai`, solo cabeceras + ≤20 filas de muestra) → `portal_patrimonio_importacion(_fila)`
  en estado `propuesta`. DDL en el SQL del paso 3.
- 14c `app/(portal)/patrimonio/importar/*`: corregir el mapeo, vista previa por entidad (apartadas visibles, ~50 + «Ver más»),
  CONFIRMAR → crea filas normales en una transacción, sellando `creado_id`. Hasta confirmar nada entra en rentabilidad,
  calendario ni avisos (cepo: las lecturas de los pasos 10-11 no leen tablas de importación). Direcciones: CP primero contra
  el callejero; la que no casa queda «por validar».
- Tests: importación ajena → 404; confirmar dos veces no duplica; fila con problema no se crea sola.
