# CLAUDE.md — apps/alquiler (vertical Alquiler de materiales)

> Vertical de **alquiler de materiales/menaje** (mesas, sillas, vajilla, carpas…) tanto **interno**
> a eventos del propio grupo (intercompany) como **a terceros** (ingreso real). Paralela a transporte.
> Compone el módulo puro `@central/module-alquiler`.

## Qué es
Catálogo de material con stock + tarifas, y **alquileres** (órdenes) con ciclo
reservado→entregado→devuelto (+cancelado), fianza, recargo por retraso y disponibilidad por solape
de fechas. Cada alquiler es a terceros (ingreso) o interno entre sociedades del holding (intercompany
que se elimina en el consolidado de `apps/plataforma`).

## Arquitectura
- **Módulo puro** `@central/module-alquiler` (en `packages/`, sin BD): `Alquiler` + `LineaAlquiler`,
  precio por días (`totalAlquiler`), máquina de estados, `recargoRetraso`, `disponibleEnVentana`,
  e intercompany (`totalIntercompany`/`operacionIntercompanyDe`).
- **App** (esta carpeta): Next 15 + Prisma sobre la **BD compartida**. La I/O y los adaptadores
  Prisma↔dominio viven en `lib/alquiler-repo.ts`.

## Datos (BD compartida, scope `cuenta_id`)
Tablas `alquiler_materiales`, `alquiler_alquileres`, `alquiler_lineas` (prefijo nuevo, no tocan nada).
DDL en `prisma/sql/2026-06-27_alquiler_schema.sql` (aplicar a mano: preview → prod tras OK).
Modelos en `prisma/schema.prisma`. La cuenta (`cuentas`) es la misma tabla que plataforma.

## Auth y BD
- Cookie `alquiler_session`, secreto **propio** `ALQUILER_SESSION_SECRET` (sin literal en prod).
  Sesión **stateless** (no escribe `session_jti`).
- **Rol de BD propio `prisma_alquiler`** (login + BYPASSRLS + DML en `public`, sin CREATE). El
  `DATABASE_URL`/`DIRECT_URL` usan ese rol vía pooler
  (`prisma_alquiler.wswbehlcuxqxyinousql@aws-0-eu-west-1.pooler.supabase.com`, 6543/5432). NO `postgres`.

## Despliegue (Vercel — lo provisiona Alberto)
- Proyecto Vercel nuevo, **Root Directory `apps/alquiler`**, install pnpm, build `prisma generate && next build`.
- Envs: `DATABASE_URL`, `DIRECT_URL`, `ALQUILER_SESSION_SECRET`. NUNCA `apps/` en `.vercelignore` raíz.

## Qué NO romper
- Capa aditiva: sin tablas/datos las pantallas muestran estados vacíos.
- El intercompany sale por `operacionIntercompanyDe()` de module-alquiler hacia `operaciones_intercompany`
  que ya lee plataforma — no reimplementar la consolidación aquí.
- Migraciones a mano como `postgres`, no por `prisma_alquiler`.

## Siguiente producto
CRUD completo (alta/edición/borrado) + **multi-línea** ✅. Pendiente: parte de daños con fotos,
contrato de alquiler, calendario visual de disponibilidad del kit.
