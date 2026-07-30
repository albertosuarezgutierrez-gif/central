---
name: transporte-maestro
description: >
  Router de contexto de la vertical TRANSPORTE (flota/camiones: portes intercompany + terceros).
  USAR SIEMPRE que Alberto pida algo de transporte: flota, vehículos, conductores, ITV/seguro,
  portes, rutas, rentabilidad por vehículo, o el intercompany flota→catering. Compone
  @central/module-flota y @central/module-transporte. Sin secretos: solo nombres de variable.
---

# TRANSPORTE — router de contexto

> Índice/puente, no copia. Fuente de verdad: `apps/transporte/CLAUDE.md` + los módulos puros y el
> diseño `docs/DISENO-modulos-materiales-flota.md` §4. Si algo aquí contradice al código, manda el
> código: corrige este router en el mismo commit.

## Qué es (y qué NO)
- Vertical de **transporte/flota como negocio** (camiones). **Paralela a Alquiler**, decidida el
  26/06 como vertical PROPIA — **NO embebida en ia-rest**. ia-rest solo expone
  `GET /api/owner/flota/resumen` como **puerto de datos** de su transporte intra-eventos.
- Doble modelo: **servicio a terceros** (ingreso real, facturable vía core-fiscal en el futuro) y
  **porte interno** entre sociedades del holding (flota→catering) → **intercompany** que se elimina
  en el consolidado de plataforma.

## Antes de tocar nada (gate)
1. Lee `apps/transporte/CLAUDE.md` — qué es, BD, envs, estado.
2. Toda query **scopeada por `cuenta_id`** (BD compartida del holding).
3. La lógica de negocio vive en los **módulos puros**, no en la app: no dupliques cálculo de coste,
   estado o intercompany en pantallas/route handlers.

## Arquitectura (capas)
| Capa | Dónde | Qué hace |
|---|---|---|
| Operativa de flota (pura) | `packages/module-flota` | `Vehiculo`, `Porte`, asignación por capacidad/tipo (`asignarVehiculo`), rentabilidad (`rentabilidadVehiculo`), documental (`alertasDocumentos`), `esPorteIntercompany`. |
| Servicio/orden (pura) | `packages/module-transporte` | `ServicioTransporte` (aTerceros/interno), precio (`sugerirImporte`=coste portes×margen), máquina de estados, `resumenServicios`, `margenServicio`, `totalIntercompany`, `operacionIntercompanyDe` (tipo `'flota'`). Compone module-flota. Tests **vitest** (no node --test: importa flota cross-package). |
| App (I/O) | `apps/transporte` | Next 15 + Prisma; `lib/transporte-repo.ts` adapta Prisma↔dominio y compone los módulos; pantallas dashboard/flota/servicios. |

## Dónde vive cada cosa
| Tema | Fuente |
|---|---|
| Qué es, BD, envs, estado, despliegue | `apps/transporte/CLAUDE.md` |
| Diseño de la vertical (datos + composición) | `docs/DISENO-modulos-materiales-flota.md` §4 |
| Esquema de datos (DDL documentado, **no aplicado**) | `apps/transporte/prisma/sql/2026-06-26_transporte_schema.sql` |
| Modelos Prisma | `apps/transporte/prisma/schema.prisma` |
| Estado vivo | `docs/CONTEXTO-SESIONES.md` |

## Infra (sin secretos — nombres de variable)
- **Supabase compartida** `wswbehlcuxqxyinousql` (schema `public`), **scope `cuenta_id`**. Tablas
  propias con prefijo nuevo: `flota_vehiculos`, `flota_conductores`, `flota_documentos`,
  `flota_mantenimientos`, `flota_repostajes`, `transporte_servicios`, `transporte_portes`,
  `transporte_paradas`. Auth contra la tabla `cuentas` compartida (la misma que plataforma).
- Stack: Next 15 · Prisma · JWT propio (cookie `transporte_session`, secreto
  `TRANSPORTE_SESSION_SECRET`, **sin literal en prod**) · sesión **stateless** (no escribe
  `session_jti` para no pisar la sesión de plataforma).
- **Rol de BD propio `prisma_transporte`** (login + BYPASSRLS + DML en `public`, sin CREATE). El
  `DATABASE_URL`/`DIRECT_URL` usan ese rol vía pooler: `prisma_transporte.wswbehlcuxqxyinousql@aws-0-eu-west-1.pooler.supabase.com`
  (6543 pooled `?pgbouncer=true` / 5432 direct). **No** conectar como `postgres`.
- Root Directory Vercel: `apps/transporte` (proyecto Vercel ya creado, en producción). Envs:
  `DATABASE_URL`, `DIRECT_URL`, `TRANSPORTE_SESSION_SECRET`.
- **Demo sembrado** en la cuenta `0de5…0001` (`demo-jj@central.local` / `JJdemo2026`): 2 vehículos,
  3 docs (semáforo ITV/seguro), 3 servicios (2 a terceros + 1 interno = intercompany 40.000€), 3
  portes. Fichero + teardown: `apps/transporte/prisma/sql/2026-06-26_seed_demo_transporte.sql`.

## Landmines (no romper)
- **module-transporte usa vitest, NO `node --test`**: el `index.ts` de module-flota tiene re-exports
  de valor sin extensión que el runner de Node no resuelve. Está en el script `test:vitest` de la
  raíz (igual que core-firma/module-rrhh). Si añades tests cross-package, vitest.
- **Capa aditiva**: sin tablas/datos las pantallas muestran estados vacíos; no rompen nada existente.
- **Intercompany**: `operacionIntercompanyDe()` proyecta a la forma de `operaciones_intercompany`
  que **ya lee plataforma**. No reimplementes la consolidación aquí.
- **Migraciones** se aplican a mano como `postgres` (Supabase/MCP), no por `prisma_transporte`.

## Estado / pendientes
- ✅ Módulos + app + esquema + intercompany (PR #542) · proyecto Vercel creado y **en producción** ·
  esquema aplicado + demo sembrado · rol de BD propio `prisma_transporte`.
- **CRUD completo** ✅ en flota y servicios: alta (POST) + **edición (PATCH, modal prefijado)** +
  borrado (DELETE) en `/api/vehiculos` y `/api/servicios`. Formularios en `app/(usuario)/_forms.tsx`
  (`Nuevo*`/`Edit*`/`DeleteButton`; hook `useSubmit(endpoint, 'POST'|'PATCH')`; el PATCH reusa el mismo
  `zod Body` que el POST). Todo scopeado por `cuentaId` (`updateMany where {id, cuentaId}`).
- **Ruta multiparada** ✅: editor anidado **portes (asignar vehículo) → paradas (orden + recogida/entrega)**
  por servicio (botón 🚏 en cada fila). `PATCH /api/servicios/portes?servicioId=` reemplaza el conjunto
  entero (`$transaction([deleteMany portes, ...create con paradas anidadas])`, paradas `orden`=índice;
  valida que servicio y vehículos sean de la cuenta). Repo: `listPortesDeServicios()`. Al editar portes,
  el coste/margen de la tabla de servicios (`margenServicio`) se recalcula solo.
- **GPS / localización en vivo** ✅ (29/06): mapa Leaflet+OSM `/(usuario)/mapa` (gratis, CDN, sin dep;
  `app/_components/MapaLeaflet.tsx`) con marcadores por señal viva/perdida, ruta y **modo simulación**.
  App del **conductor por enlace mágico** `/conductor/acceso/[token]` (`watchPosition` →
  `POST /api/conductor/posicion`, **aviso legal art. 90 LOPDGDD**, rastrea vehículo solo con servicio
  activo). **Geocerca** (`dentroDeGeocerca`) marca paradas/entregado + **km reales** (`kmDeTraza`) →
  margen automático. **Link de seguimiento cliente** `/seguir/[token]` con **ETA** (`etaMin`). Tabla
  `flota_posiciones` + `acceso_token`/`seguimiento_token` + `lat`/`lng` en paradas
  (`prisma/sql/2026-06-29_flota_gps.sql`; demo `…seed_demo_gps.sql`, tokens `jj-demo-conductor`/`jj-demo-jerez`).
  Lógica pura en **`@central/module-geo`** (transversal: cualquier vertical geolocaliza personal de campo).
- **Ingesta de hardware GPS agnóstica** ✅ (29/06): `POST|GET /api/ingest/[formato]`
  (`osmand`/`traccar`/`generico`). Cada cliente elige su tracker (móvil, OBD-II, Teltonika, Concox,
  servidor Traccar) y lo apunta a la URL identificándose por `flota_vehiculos.device_id`
  (`2026-06-29_flota_device.sql`). Auth `FLOTA_INGEST_SECRET` (`lib/ingest-auth.ts`, sin literal en
  prod). Normalizadores **puros** en `@central/module-geo` (`normalizarOsmAnd/Traccar/Generico`,
  nudos→km/h); el endpoint resuelve vehículo→porte activo y reusa la ÚNICA `ingerirPosicion()` del
  repo (compartida con el conductor por enlace). El `device_id` se asigna por vehículo en el form de flota.
- Pendiente GPS: push de llegada (`core-push`, VAPID), purga posiciones >30 d, mapa consolidado en plataforma ✅.
- Siguiente producto: planificador automático con `asignarVehiculo` (sugerir vehículo por
  capacidad/agenda), facturación a terceros (`core-fiscal`).
