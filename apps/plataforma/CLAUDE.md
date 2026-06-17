# CLAUDE.md — apps/plataforma

## Qué es
`apps/plataforma` es el **cuadro de mando consolidado** de la casa de marcas.  
Un dueño con varios negocios de sectores distintos inicia sesión aquí y ve **todos sus negocios en un vistazo**.

Jerarquía: `Cuenta → Sociedad (CIF) → Negocio (sector)`.

## Stack
Next.js 15 · React 19 · Prisma 5 · jose/bcryptjs (JWT, cookie `plataforma_session`) · sin Tailwind (CSS variables).

## BD
Misma Supabase compartida que sivra + ialimp: **`wswbehlcuxqxyinousql`**.  
Tablas propias: `cuentas`, `sociedades`, `negocios` (migración `2026-06-09_cuentas_sociedades_negocios.sql`, ya aplicada).

## Envs de Vercel (proyecto `plataforma`)
| Variable | Valor |
|---|---|
| `DATABASE_URL` | URL de conexión pooled de Supabase (`wswbehlcuxqxyinousql`) |
| `DIRECT_URL` | URL de conexión directa de Supabase (para migraciones Prisma) |
| `JWT_SECRET` | Secret para firmar `plataforma_session` |
| `IAREST_URL` | `https://iarest.es` |
| `IALIMP_URL` | `https://app.ialimp.es` |
| `SIVRA_URL` | URL de sivra |
| `OPERADOR_SHARED_SECRET` | Secreto compartido para el puerto del god-panel ↔ ia-rest (MISMO valor en el proyecto Vercel `ia-rest`). Sin él, el panel no ve los clientes de ia-rest (ialimp+sivra sí). |
| `RRHH_URL` | URL de producción de central-rrhh (`https://central-rrhh.vercel.app`) — para `lib/adapters/rrhh.ts`. |
| `RRHH_OPERADOR_SECRET` | Secreto del puerto god-panel ↔ **iarrhh** (MISMO valor en el proyecto Vercel `central-rrhh`). **PROPIO de iarrhh, distinto del `OPERADOR_SHARED_SECRET` de ia-rest — NO reutilizar el mismo env (rompería ia-rest).** |

> **Sobre la "BD unificada" de ia-rest:** la unificación quedó **a medias**. El schema
> `iarest` de la BD compartida es un **clon vacío del DDL** (~200 tablas a 0 filas + tabla de
> log `_mig_ddl`); los **datos vivos** de ia-rest siguen en su **proyecto Supabase propio**
> (`efncqyvhniaxsirhdxaa`, schema `public`), de donde lee su producción. Por eso plataforma
> **NO** lee ia-rest por Prisma sobre `iarest.*`, sino por el **puerto HTTP** (ver abajo).
> `IAREST_SUPABASE_URL` / `IAREST_SUPABASE_SERVICE_KEY` ya no se usan en plataforma.

## Root Directory en Vercel
`apps/plataforma` — install `npx --yes pnpm@10.33.0 install --no-frozen-lockfile`.

## Estado (15/06/2026) — PANEL UNIFICADO (PR #249 MERGED)
- [x] Tablas `cuentas/sociedades/negocios` aplicadas en Supabase.
- [x] Shell: login + dashboard con tarjetas por negocio.
- [x] **Registro de cuenta por UI** (`/register` → `POST /api/auth/register`, auto-login).
- [x] **CRUD sociedad/negocio por UI** (crear/editar/eliminar, scoped por `cuenta_id`).
- [x] **Resumen financiero real** por negocio (HITO 3): ialimp (`v_contab_pyg`) + sivra (`incomes`/`gastos`).
- [x] **ia-rest financiero (HITO 3)**: se lee **en vivo por el puerto HTTP** de ia-rest.
- [x] **Panel unificado (PR #249):** un solo shell `app/(usuario)/` con sidebar condicional:
  - *Mi negocio* (siempre): Resumen · Banca · 🏨 Apartamentos (`/apartamentos`) · 🧹 Limpiezas (`/limpiezas`) · 💬 Comunicación
  - *Operador* (solo superadmin): 🏢 Clientes (`/operador/clientes`) · 🍽️ ia-rest (`/operador/iarest`) · 🗺️ Estructura (`/operador/estructura`)
- [x] **Auth unificado:** un login emite ambas cookies. `findActiveAdminByEmail()` en `lib/superadmin.ts`.
- [x] **Conciliación corregida:** `candidatosSivra()` lee `gastos` (71 filas) en vez de `expenses` (34, congelada). Recupera €5.670.
- [x] **PWA:** `public/manifest.json` + `public/icon.svg`.
- [x] **Command palette Cmd/Ctrl+K:** `CommandPalette.tsx`.
- [x] **Strip "Hoy" en dashboard.**
- [x] **Detalle apartamento (PR #255):** `lib/propiedades.ts` enriquecida (ocupación %, ADR, top portal) + nueva `getApartamentoDetalle(id)`. Ruta `/apartamentos/[id]` con 8 KPIs, gap detector, break-even, mix portales, histórico 12 meses, gastos por categoría (incl. SEGURO) + gastos compartidos + últimas 20 reservas.
- [x] **`/admin` → redirect `/operador/clientes`** (PR #332, merged).
- [x] **Panel ia-rest/super (Fase 5 COMPLETA — PR #333–#336):** `/operador/iarest/cobros` · `/operador/iarest/soporte` · `/operador/iarest/sugerencias` · `/operador/iarest/suscripciones` · `/operador/iarest/restaurantes` · `/operador/iarest/crecimiento` · `/operador/iarest/sistema` · `/operador/iarest/crm`. `iarest.es/super` absorbido al 100% en modo read-only. Escrituras siguen en el panel legacy.
- [x] **Módulo `/finanzas` (PR #341):** Hub financiero consolidado. Correduría (BBVA, persona física) + 4 pisos turísticos (propios: amortización 3%; subarrendados: alquiler deducible) + gastos personales BBVA (Alberto solo) / Kutxa (familiar compartida). Base imponible IRPF 2025 con tramos, declaración conjunta, reducción €3.400. Export CSV gestoría, Modelo 179 tracker. Filtros año/trimestre. Sidebar: "💶 Finanzas" 2º ítem Mi negocio.
- [x] **Fases 1–3 sivra COMPLETAS:** `/sivra/income` · `/sivra/expenses` · `/sivra/gastos-fijos` · `/sivra/fiscal` · `/sivra/calendario` · `/sivra/inversion` · `/sivra/seo` · `/sivra/mensajes` (Smoobu+AI) · `/sivra/mercado` · `/sivra/pricing` · `/sivra/pricing-auto` + todos sus APIs. Todas ya existían en plataforma.
- [x] **Fase 6 — RR.HH. admin (17/06/2026):** `/operador/rrhh/empleados` + `/operador/rrhh/solicitudes`. Read-only desde `rrhh.*` schema (BD compartida, raw SQL). Sidebar: sección "RR.HH." en NAV_OPERADOR con sub-items Empleados/Solicitudes. `lib/rrhh-operador.ts` con `getEmpleadosRrhh()` + `getSolicitudesRrhh()`.
- [x] **Fase 4 — Admin limpiadoras (17/06/2026):** `/sivra/limpiadoras` (10 tabs: Hoy, Semana, Limpiadoras, Disponibilidad, Proveedores, Stock, Lencería, Checklists, Informes, Facturación). 13 API routes en `/api/sivra/limpiadoras/*`. Auth `getSession()`. BD raw SQL vía prisma.$queryRaw sin tocar RLS ni ialimp.

## Registrar una cuenta
Desde la propia app: **`/register`** (nombre + email + password ≥8). Hace auto-login.
El alta manual por SQL ya no es necesaria.

## Panel de OPERADOR — arquitectura post PR #249
- **`/admin`** → redirect a `/operador/clientes` (PR #332, merged). Ya no sirve el god-panel oscuro.
- **`/operador/*`** (nuevo, tema claro): `ClientesClient.tsx`, `MapaArquitectura`, placeholder ia-rest. Mismas APIs `/api/admin/*` sin tocar.
- **Auth:** `lib/superadmin.ts` + cookie `plataforma_admin` 8h. El login de `/login` (no `/admin/login`) ya emite ambas cookies si el email está en `superadmins`.
- **Adaptadores:** `lib/adapters/*` — ialimp/sivra por BD compartida, ia-rest e **iarrhh** por HTTP Bearer
  (iarrhh: alta de empresa+responsable desde `/operador/clientes`, vertical `'rrhh'`).
- **`lib/conciliacion.ts`:** `candidatosSivra()` lee tabla `gastos` (raw SQL). Ref: `sivra:gasto:<id>`.
- **Personas a través de verticales (RR.HH., SOLO LECTURA):** `/operador/personas` (`PersonasClient.tsx`)
  consolida a la **misma persona** aunque tenga roles en varias verticales, agrupando por **`persona_id`**.
  `lib/personas.ts` lee ialimp (`limpiadoras`, prisma directo) + rrhh (empleados por el puerto operador
  `/api/operador/personas`, Bearer `RRHH_OPERADOR_SECRET`) y **propone enlaces** no hechos por DNI/email
  (`coincidenciaPersona` de `@central/core-identity`). API: `GET /api/admin/personas`. **El enlace MANUAL
  del `persona_id` (escritura cross-app) está PENDIENTE** — hoy solo se sugiere.

## Reglas
- Multi-tenant: SIEMPRE filtrar por `cuenta_id` en todas las queries.
- Sin credenciales en repo.
- El sector es texto libre (enchufable); no hardcodear la lista salvo en UI labels.
