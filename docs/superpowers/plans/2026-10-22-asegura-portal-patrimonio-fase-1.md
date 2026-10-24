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

## Paso 7 — Facturas con IA ✅ (22/10/2026; pendiente revisión agente-architect)
- `lib/patrimonio/extraer-factura.ts` (patrón de `apps/plataforma/lib/agente-facturas/extraer.ts`, `core-ai`, `pdf-parse` en
  `serverExternalPackages` ya está), `app/api/patrimonio/facturas/route.ts` (10 MB, tope por identidad/día),
  `patrimonio/gastos/RevisarFactura.tsx` (propuesta + motivos + confirmar).
- Tests: `fuente:'none'` no crea gasto de 0; `OTRO` se anula; inmueble ajeno → 404.

## Paso 8 — Documentos ✅ (22/10/2026) — requiere SQL `2026-10-22_portal_patrimonio_documento.sql` (sin aplicar)
- `module-documental` con owners `inmueble`/`contrato`/`inquilino`, carpetas definidas en `lib/patrimonio/carpetas.ts`;
  ficheros EN BD (`bytea`, tabla `portal_patrimonio_documento`, decisión de Alberto 22/10/2026; no Storage). Tests de permisos por nivel (Gestión sube; inquilino solo su carpeta de recibos).

## Paso 9 — Contratos, inquilinos y actualización de renta ✅ (22/10/2026)
- Hecho: `lib/patrimonio/{indices,contratos-api,contratos-bd,inquilinos-puente}.ts`, `patrimonio/contrato/[id]` (+ alta de
  contrato en la ficha del inmueble), rutas `api/patrimonio/contratos{,/[id]/renta,/[id]/inquilinos}` e
  `inquilinos/[id]` (PII bajo demanda, Total); puente `apps/asegura/app/api/portal/patrimonio/inquilino` (recalcula el
  nivel desde el contrato, cifra o se niega con `sin_clave`). Índice viejo (> 2 meses) = `sin_indice`; tope legal `null`.
  Cepo `test/regression-portal-patrimonio-inquilino.test.ts`. Sin SQL nuevo.
- `patrimonio/contrato/[id]`, alta de inquilino con PII por el PUENTE de `apps/asegura` (`/api/portal/patrimonio/inquilino`),
  `lib/patrimonio/indices.ts` (LEE `portal_patrimonio_indice`, que llena el paso 9b), propuesta de actualización
  (aplicar = fila append-only).
- Tests: sin cláusula no propone; índice distinto rechaza; el portal nunca guarda NIF en claro.

## Paso 9b — Índices IPC/IRAV automáticos desde el INE (general-purpose, sonnet; revisión agente-architect) ✅ (22/10/2026)
- Puro: `packages/module-patrimonio/src/indices-ine.ts` — `parsearSerieIne(json, indice)` → `{periodo, pct}[]` y
  `validarIndice` (periodo `YYYY-MM`, número finito, rango −10..+20 %, sin huecos raros); test con JSON de muestra
  guardado en el test (nada de red en tests) y rojo.
- `apps/asegura/app/api/cron/indices-renta/route.ts` (`CRON_SECRET`, mensual en `vercel.json`): descarga la API JSON
  del INE (IPC general variación anual; IRAV), valida y hace INSERT de lo nuevo en `portal_patrimonio_indice`
  (ON CONFLICT DO NOTHING; revisión del INE = fila `revisado=true`). Si falla o el periodo esperado no llega en
  su fecha → Telegram (`core-telegram`) y NO escribe. DDL de la tabla en el SQL del paso 3 (GRANT SELECT al portal).
- Tests: fallo de red/formato no escribe y avisa; dos pasadas no duplican; índice ausente → la propuesta sale `sin_indice`.

## Orden nuevo desde el 24/10/2026 (P10-P18)
> Spec: `docs/superpowers/specs/2026-10-24-portal-inicio-herramientas-oportunidades.md` (§4 reordena los antiguos 10-14).
> Decisiones de Alberto (24/10/2026): Patrimonio solo para clientes con póliza en fase 1; «Inicio» sustituye a «Recibos»
> en la barra móvil; coches dentro de «Patrimoniales»; la tarjeta «Gestión de alquileres» del catálogo ES Patrimonio.
> Prerrequisito suelto: el SQL del paso 8 (`2026-10-22_portal_patrimonio_documento.sql`) — su cabecera dice aplicado el 22/10.

## P10 — Puro + SQL del enlace inmueble ↔ póliza ✅ código (24/10/2026) · ⏳ SQL SIN APLICAR
- Puro `packages/module-patrimonio/src/enlace-seguro.ts` (+ test): `estadoSeguroInmueble` (tres estados + derivados
  `con_seguro_no_vigente` y `enlazado_sin_comprobar` —enlace cuya póliza no ve quien mira o cartera ilegible—),
  `proponerEnlaces` (ref. catastral de 20 / CP + vía + número solo con la dirección VISIBLE a ese nivel; nunca municipio
  ni compañía), `origenAEscribir`, `declaradaVigente`, `resumenSegurosPatrimonio`. Acción `enlazar_seguro` (Gestión y
  Total) en `acceso.ts`. `familiaSeguro` en `module-seguros-portal/src/familia-seguro.ts` (+ test).
- SQL `apps/asegura-portal/prisma/sql/2026-10-24_portal_patrimonio_enlace_poliza.sql` (sin DROP; CHECKs por bloque DO;
  GRANT por columnas; REVOKE `crm_seguros`) + `schema.prisma` espejo. 🚨 Aplicar ANTES del despliegue que lo usa.
- Pendiente de P10 según la spec: `senalesDeInmueble` y `permisoContacto` (van con el motor, P16, después de legal) y
  los consentimientos `encargo_patrimonio`/`comercial_patrimonio` (P15).

## P11 — Enlace en la ficha del inmueble ✅ (24/10/2026; pendiente revisión agente-architect)
- `lib/patrimonio/seguros-inmueble-{api,bd}.ts`, `GET/POST /api/patrimonio/inmuebles/[id]/seguros`,
  `patrimonio/inmueble/[id]/SegurosInmueble.tsx`: estado, «¿Este seguro es de X? Sí / No es este», enlazar a mano,
  desenlazar (archivar), «No tiene seguro» / quitarlo, «Añadir póliza». Póliza ajena → 404; detalle solo si quien mira
  ve la póliza. Cepos en `test/regression-portal-patrimonio-aislamiento.test.ts` y `-sql.test.ts`.
- Limitación conocida: un enlace a una póliza luego FUSIONADA queda «sin comprobar» (la cartera solo trae la final).

## P12 — Inicio ✅ (24/10/2026)
- `app/(portal)/inicio/page.tsx`, `lib/inicio.ts` (`allSettled`, una fuente por tarjeta), `lib/inicio-tarjetas.ts` (+ test),
  `/` y el canje del código → `/inicio`, logo → `/`, `pestanasPortal()` con «Inicio» primero, barra móvil
  `Inicio · Seguros · Siniestros · WhatsApp · Más`, catálogo «Patrimonio y alquileres» → `/patrimonio`.
  Cepo `test/regression-portal-inicio.test.ts`.
- Pendiente: chip «N cosas pendientes» por familia (de `pendientesDeTi`) y `?familia=` en `/boveda`; medir a 320 px
  con Playwright sobre `.portal-contenido`.

## P13 — Calendario y avisos (antiguo 10; sonnet)
- `lib/patrimonio/calendario.ts` (adaptador de `calendarioPatrimonio`), fuente `patrimonio` en `lib/avisos.ts`/«Pendiente de ti»
  (con `sinComprobar`), push en `api/cron/avisos-push`, y «inmueble sin revisar» en «Pendiente de ti».
  Tests: fuente ilegible → `!`, nunca «0».

## P14 — Rentabilidad + infraseguro + «Pedir precio» (antiguo 11, corregido; sonnet, puente: architect)
- `patrimonio/rentabilidad/page.tsx`; infraseguro con el capital de la póliza ENLAZADA; CTA «Pedir precio» del inmueble
  sin seguro → PUENTE `apps/asegura /api/portal/patrimonio/pedir-precio` (a imagen de `mejorar-precio-portal.ts`:
  candado, `info_riesgo.origen='portal:patrimonio'`, gestión, historial), NO `lead-declarada.ts`. Solo titular o Total,
  nunca el inquilino.

## P15 — Legal y alta (antiguo 13, ampliado; architect + Alberto)
- Encargo de tratamiento, consentimientos `encargo_patrimonio` y `comercial_patrimonio` (CHECK + `TIPOS_CONSENTIMIENTO`),
  párrafo de privacidad del perfilado, `VERSION_TEXTOS_LEGALES` +1, gate «gratis solo con póliza en vigor».

## P16 — Motor de señales y cola en `/correduria` (architect)
- `senalesDeInmueble`/`permisoContacto` (puros), SQL `portal_patrimonio_senal`, cron, puerto operador,
  `OportunidadesPatrimonio.tsx` + bloque en la ficha. Requiere P14 y **P15 desplegado**. Nunca contacta a nadie.

## P17 — Inquilino por enlace (antiguo 12; architect)
- `app/inquilino/[token]/page.tsx` + `app/api/inquilino/*` (código al correo, tope por IP/destino), subida del recibo del
  seguro y aviso de avería → `portal_patrimonio_aviso_inquilino`; convertir en parte desde el propietario. Envío del
  correo en `apps/asegura` (borrador hasta OK). Consentimiento comercial propio del inquilino, no premarcado.
- Cepos: el token no abre sesión; el inquilino no ve gastos/rentas; ninguna lectura de leads toca inquilinos.

## P18 — Importación por el cliente (antiguo 14; architect para el puro y la confirmación)
Lo importado entra `sin_mirar` y genera señales solo tras confirmar.
- 18a Puro: `packages/module-patrimonio/src/importacion.ts` — `proponerMapeo(cabeceras, muestra)` heurístico (la IA lo
  mejora, no lo sustituye), `aplicarMapeo(filas, mapeo)` → filas por entidad con `problema` (fecha/CP/importe ilegible,
  celda de cajón → `null`, nunca 0), `detectarDuplicados` (ref. catastral / NIF / clave de plantilla) como «ya existe».
  Tests + rojo.
- 18b `app/api/patrimonio/importaciones/route.ts` (subida 10 MB, xlsx/csv, tope por identidad/día) +
  `lib/patrimonio/mapeo-ia.ts` (`core-ai`, solo cabeceras + ≤20 filas de muestra) → `portal_patrimonio_importacion(_fila)`
  en estado `propuesta`. DDL en el SQL del paso 3.
- 18c `app/(portal)/patrimonio/importar/*`: corregir el mapeo, vista previa por entidad (apartadas visibles, ~50 + «Ver más»),
  CONFIRMAR → crea filas normales en una transacción, sellando `creado_id`. Hasta confirmar nada entra en rentabilidad,
  calendario ni avisos (cepo: las lecturas de los pasos 10-11 no leen tablas de importación). Direcciones: CP primero contra
  el callejero; la que no casa queda «por validar».
- Tests: importación ajena → 404; confirmar dos veces no duplica; fila con problema no se crea sola.
