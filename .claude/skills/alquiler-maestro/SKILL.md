---
name: alquiler-maestro
description: >
  Router de contexto de la vertical ALQUILER de materiales/menaje (intercompany + terceros).
  USAR SIEMPRE que Alberto pida algo de alquiler de materiales: catálogo/stock, tarifas, fianzas,
  disponibilidad, ciclo reserva→entrega→devolución, recargos, o el intercompany materiales→eventos.
  Compone @central/module-alquiler. Sin secretos: solo nombres de variable.
---

# ALQUILER — router de contexto

> Índice/puente, no copia. Fuente de verdad: `apps/alquiler/CLAUDE.md` + el módulo puro y el diseño
> `docs/DISENO-modulos-materiales-flota.md`. Si algo aquí contradice al código, manda el código.

## Qué es
Vertical de **alquiler de material/menaje** (paralela a transporte). Catálogo con stock + tarifas, y
**alquileres** (órdenes) a terceros (ingreso real) o internos entre sociedades del holding
(intercompany que se elimina en el consolidado de plataforma). Dato de negocio: JJ alquila su material
**también a terceros**, no solo a sus eventos.

## Arquitectura (capas)
| Capa | Dónde | Qué hace |
|---|---|---|
| Negocio (puro) | `packages/module-alquiler` | `Alquiler` + `LineaAlquiler`, precio por días (`totalAlquiler`), máquina de estados `reservado→entregado→devuelto` (+cancelado), `recargoRetraso`, `comprometidoEnVentana`/`disponibleEnVentana`, intercompany (`totalIntercompany`/`operacionIntercompanyDe`). Tests `node --test` (no importa otros módulos en runtime). |
| App (I/O) | `apps/alquiler` | Next 15 + Prisma; `lib/alquiler-repo.ts` adapta Prisma↔dominio y compone la lógica; pantallas dashboard/materiales/alquileres. |

## Infra (sin secretos — nombres de variable)
- **Supabase compartida** `wswbehlcuxqxyinousql`, **scope `cuenta_id`**. Tablas propias:
  `alquiler_materiales`, `alquiler_alquileres`, `alquiler_lineas` (DDL documentado en
  `apps/alquiler/prisma/sql/2026-06-27_alquiler_schema.sql`). Auth contra `cuentas` compartida.
- Stack: Next 15 · Prisma · JWT propio (cookie `alquiler_session`, secreto `ALQUILER_SESSION_SECRET`,
  sin literal en prod) · sesión **stateless**.
- **Rol de BD propio `prisma_alquiler`** (login + BYPASSRLS + DML en `public`, sin CREATE). Pooler:
  `prisma_alquiler.wswbehlcuxqxyinousql@aws-0-eu-west-1.pooler.supabase.com` (6543/5432). NO `postgres`.
- Root Directory Vercel: `apps/alquiler`. Envs: `DATABASE_URL`, `DIRECT_URL`, `ALQUILER_SESSION_SECRET`.
- **Demo** en la cuenta JJ (`0de5…0001`, `demo-jj@central.local`/`JJdemo2026`): 5 materiales, 3
  alquileres (1 interno = intercompany **20.000€**, que casa con materiales→catering del consolidado;
  2 a terceros = 3.900€), 6 líneas. Fichero + teardown: `prisma/sql/2026-06-27_seed_demo_alquiler.sql`.

## Landmines
- **Capa aditiva**: sin tablas/datos, pantallas en estado vacío; no rompe nada.
- **Intercompany**: `operacionIntercompanyDe()` → forma de `operaciones_intercompany` que **ya lee
  plataforma**. No reimplementar la consolidación aquí.
- Migraciones a mano como `postgres`, no por `prisma_alquiler`.

## Estado / pendientes
- ✅ Módulo + app + esquema + demo + rol propio + **proyecto Vercel desplegado y login demo probado** (27/06).
- **CRUD completo + multi-línea** ✅ en materiales y alquileres: alta (POST) + **edición (PATCH, modal
  prefijado)** + borrado (DELETE) en `/api/materiales` y `/api/alquileres`. Formularios en
  `app/(usuario)/_forms.tsx`. El alta/edición de alquiler maneja **N líneas** (lista dinámica
  material+cantidad, +añadir/quitar, mín. 1); el servidor copia nombre/tarifa del catálogo
  (`construirLineas()`) y el PATCH reemplaza el conjunto entero (`lineas:{ deleteMany:{}, create:[…] }`).
  Scope por `cuentaId`.
- Siguiente producto: parte de daños con fotos, contrato, calendario de disponibilidad.
