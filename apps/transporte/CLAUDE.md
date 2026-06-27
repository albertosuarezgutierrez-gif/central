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
`prisma/sql/2026-06-26_transporte_schema.sql` — **ya aplicado** en la BD compartida (26/06/2026, demo
JJ sembrado vía `2026-06-26_seed_demo_transporte.sql`). Modelos Prisma en `prisma/schema.prisma`. La cuenta (`cuentas`) es la MISMA tabla que plataforma.

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

## Qué NO romper
- La capa de servicio es **aditiva**: si no hay tablas/datos, las pantallas muestran estados vacíos.
- El intercompany sale por `operacionIntercompanyDe()` de module-transporte hacia la tabla
  `operaciones_intercompany` que ya lee plataforma (no duplicar lógica de consolidación aquí).
