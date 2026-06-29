# CLAUDE.md — apps/transporte (vertical Transporte)

> Vertical de **transporte / flota como negocio** (camiones). Paralela a la vertical Alquiler.
> Compone los módulos puros `@central/module-flota` (operativa) y `@central/module-transporte`
> (servicio/orden). NO embebida en ia-rest (decisión de Alberto, 26/06): ia-rest solo expone
> `GET /api/owner/flota/resumen` como puerto de datos de su transporte intra-eventos.

## Qué es
Gestiona vehículos, conductores, documental (ITV/seguro/permisos), portes (viajes) y **servicios de
transporte** que se prestan tanto:
- **a terceros** → ingreso externo real (facturable vía core-fiscal en el futuro), como
- **internos** entre sociedades del holding (flota → catering) → operación **intercompany** que se
  elimina en el consolidado de `apps/plataforma`.

## Arquitectura
- **Módulos puros** (en `packages/`, sin BD):
  - `@central/module-flota` — `Vehiculo`, `Porte`, asignación por capacidad/tipo, rentabilidad,
    documental, costura intercompany.
  - `@central/module-transporte` — `ServicioTransporte` (orden al cliente), precio (importe pactado o
    derivado del coste de los portes + margen), máquina de estados, resumen e intercompany.
- **App** (esta carpeta): Next 15 + Prisma sobre la **BD compartida** (Supabase del holding), auth
  JWT propia. La capa de I/O y los adaptadores Prisma↔dominio viven en `lib/transporte-repo.ts`.

## Datos (BD compartida, scope `cuenta_id`)
Tablas con prefijo `flota_` / `transporte_` (no tocan nada existente). DDL documentado en
`prisma/sql/2026-06-26_transporte_schema.sql` — **aplicar a mano** (BD de preview primero, prod tras
OK). Modelos Prisma en `prisma/schema.prisma`. La cuenta (`cuentas`) es la MISMA tabla que plataforma.

## Auth
- Cookie `transporte_session`, secreto **propio** `TRANSPORTE_SESSION_SECRET` (NUNCA literal en prod;
  patrón guarda `env || (prod ? throw : 'dev')`). Login contra `cuentas` (bcrypt).
- Sesión **stateless** (solo firma JWT): no escribe `session_jti` para no pisar la sesión de plataforma
  (comparten la tabla `cuentas`).

## Despliegue (Vercel — lo provisiona Alberto)
- Proyecto Vercel nuevo sobre repo `central`, **Root Directory `apps/transporte`**, install
  `npx --yes pnpm@10.33.0 install --no-frozen-lockfile`, build `prisma generate && next build`.
- Envs: `DATABASE_URL`, `DIRECT_URL` (Supabase compartida), `TRANSPORTE_SESSION_SECRET`.
- NUNCA poner `apps/` en `.vercelignore` de la raíz (regla de la matriz).

## GPS / localización en vivo (29/06)
- **Mapa en vivo** `/(usuario)/mapa`: Leaflet + OpenStreetMap (gratis, sin API key; cargado por CDN en
  `app/_components/MapaLeaflet.tsx`, sin dep npm). Marcadores por vehículo (color por señal viva/perdida),
  ruta de paradas (polyline) y **modo simulación** (botón "▶ Simular", anima en cliente con
  `simularTrayecto`, sin BD). Polling `GET /api/mapa/posiciones`.
- **App del conductor** por **enlace mágico** (sin gestionar usuarios): `/conductor/acceso/[token]`
  (token en `flota_conductores.acceso_token`). `navigator.geolocation.watchPosition` →
  `POST /api/conductor/posicion`. **Aviso legal visible** (art. 90 LOPDGDD): se rastrea el **vehículo**,
  **solo con el servicio activo**, el conductor lo para al terminar.
- **Geocerca + km reales**: al ingerir posición, si entra en el radio (`dentroDeGeocerca`, 150 m) de la
  siguiente parada pendiente la marca completada; al cerrar la última, el porte pasa a `entregado` y
  `kmReales` se rellena con `kmDeTraza` de la traza → el margen del servicio se recalcula solo.
- **Link de seguimiento al cliente** (tipo Glovo): `/seguir/[token]` (token en
  `transporte_servicios.seguimiento_token`), público, muestra el camión + **ETA** (`etaMin`). API
  `GET /api/seguir/[token]`.
- **Datos**: tabla `flota_posiciones` (append-only, minimización: solo lat/lng/ts) + `acceso_token` /
  `seguimiento_token` + `lat`/`lng` en `transporte_paradas`. DDL en
  `prisma/sql/2026-06-29_flota_gps.sql`; demo en `2026-06-29_seed_demo_gps.sql` (ruta Sevilla→Jerez,
  tokens `jj-demo-conductor` / `jj-demo-jerez`). **Pendiente legal:** validar el texto del aviso con la asesoría.
- **Módulo puro** `@central/module-geo` (transversal, reutilizable por cualquier vertical): haversine,
  rumbo, velocidad, `tieneSenal`, geocerca, `etaMin`, `kmDeTraza`, `progresoRuta`, `simularTrayecto`.
- **Mapa consolidado del holding** ✅ en `apps/plataforma` (`/operador/flota-mapa`, god-panel): lee
  `flota_posiciones` de TODAS las cuentas por `$queryRaw` (`lib/flota-holding.ts`) y pinta la flota del
  grupo en un mapa. `prisma_plataforma` tiene `GRANT SELECT` en `flota_posiciones`/`flota_vehiculos`.
- **Pendiente**: push de llegada (`@central/core-push`, requiere VAPID) y purga automática de
  posiciones > 30 d.

## Qué NO romper
- La capa de servicio es **aditiva**: si no hay tablas/datos, las pantallas muestran estados vacíos.
- El intercompany sale por `operacionIntercompanyDe()` de module-transporte hacia la tabla
  `operaciones_intercompany` que ya lee plataforma (no duplicar lógica de consolidación aquí).
- **Leaflet por CDN**: si algún día se va a entorno sin red externa, instalar `leaflet` como dep.
- Rutas públicas `/conductor`, `/seguir`, `/api/conductor`, `/api/seguir` exentas en `middleware.ts`
  (se auto-validan por token); no meter ahí nada que dependa de la cookie de sesión.
