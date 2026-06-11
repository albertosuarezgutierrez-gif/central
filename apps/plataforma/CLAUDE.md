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

> **Sobre la "BD unificada" de ia-rest:** la unificación quedó **a medias**. El schema
> `iarest` de la BD compartida es un **clon vacío del DDL** (~200 tablas a 0 filas + tabla de
> log `_mig_ddl`); los **datos vivos** de ia-rest siguen en su **proyecto Supabase propio**
> (`efncqyvhniaxsirhdxaa`, schema `public`), de donde lee su producción. Por eso plataforma
> **NO** lee ia-rest por Prisma sobre `iarest.*`, sino por el **puerto HTTP** (ver abajo).
> `IAREST_SUPABASE_URL` / `IAREST_SUPABASE_SERVICE_KEY` ya no se usan en plataforma.

## Root Directory en Vercel
`apps/plataforma` — install `npx --yes pnpm@10.33.0 install --no-frozen-lockfile`.

## Estado (09/06/2026) — COMPLETO
- [x] Tablas `cuentas/sociedades/negocios` aplicadas en Supabase.
- [x] Shell: login + dashboard con tarjetas por negocio.
- [x] **Registro de cuenta por UI** (`/register` → `POST /api/auth/register`, auto-login).
- [x] **CRUD sociedad/negocio por UI** (crear/editar/eliminar, scoped por `cuenta_id`).
- [x] **Resumen financiero real** por negocio (HITO 3): ialimp (`v_contab_pyg`) + sivra (`incomes`/`expenses`).
- [x] **ia-rest financiero (HITO 3)**: se lee **en vivo por el puerto HTTP** de ia-rest
  (`${IAREST_URL}/api/operador/financiero?local_id=&anio=`, Bearer `OPERADOR_SHARED_SECRET`),
  el MISMO patrón que el listado del god-panel (`getResumenIaRest` en `lib/financiero.ts`).
  `refExt` = `local_id`. El endpoint sirve `v_resumen_financiero_anual` desde la BD propia de
  ia-rest. NO se usa Prisma sobre `iarest.*` (ese schema está vacío). Sin migrar datos.

## Registrar una cuenta
Desde la propia app: **`/register`** (nombre + email + password ≥8). Hace auto-login.
El alta manual por SQL ya no es necesaria.

## Panel de OPERADOR (god-panel) — `/admin`
Panel único de control de Alberto sobre **todas las verticales**. Diseño: `docs/DISEÑO-god-panel.md`.
- **Auth propia** (`lib/superadmin.ts`, cookie `plataforma_admin`, 8h) validada contra la tabla
  **`superadmins`** ya existente en la BD compartida → **el mismo login que el `/superadmin` de ialimp**.
  El área `/admin` + `/api/admin` están en `PUBLIC` del middleware (se autoprotegen en los handlers vía `getAdmin`).
- **Adaptadores por vertical** (`lib/adapters/*`, contrato `VerticalAdapter`):
  - `ialimp` y `sivra` → BD compartida directa (SQL raw, patrón de `lib/financiero.ts`).
  - `iarest` → por **puerto HTTP** (`${IAREST_URL}/api/operador/restaurantes`, Bearer `OPERADOR_SHARED_SECRET`),
    porque ia-rest está en otra BD. **No se fusiona nada.** El endpoint vive en `apps/ia-rest/src/app/api/operador/`.
- **Pestañas:** 🏠 Mis propiedades · 🏢 Negocios · 🗺️ Estructura.
  - **🏠 Mis propiedades** (`lib/propiedades.ts` + `/api/admin/propiedades`): el "acceso a mis
    propiedades" desde el panel único. Dos sub-vistas:
    - **🛠️ Portal** (por defecto): **embebe en iframe el portal del propietario de ialimp** → Alberto
      trabaja desde el panel (es propietario/cliente de Vanesa ahí). **Acceso SIN login:** el endpoint
      busca su token mágico (`clientes.access_token` en la BD compartida) por su email de operador y
      embebe `${IALIMP_URL}/propietario/<token>` (entra directo, sin formulario y sin el problema de
      cookies de terceros; la 1ª vez puede pedir aceptar RGPD). Si no hay token por email, cae a
      `${IALIMP_URL}/propietario` (login) con fallback "abrir en pestaña nueva". ialimp no manda
      `X-Frame-Options`/CSP → se deja embeber.
    - **📊 Resumen**: tarjetas de los apartamentos turísticos propios (sivra), leyendo SOLO la
      tabla `properties` (las propias con Smoobu) + `incomes`/`expenses` de la BD compartida —
      **NO** la tabla `propiedades` (multi-tenant de limpiadoras).
  - **🗺️ Estructura**: radiografía automática del repo (ver `docs/ESTRUCTURA.md`).
- **F1 (hecho):** login + listado unificado de clientes + **bloquear/liberar** (`empresas.activa` / `restaurantes.activo`) + **vista 360**.
- **Pendiente (F2+):** módulos por cliente (`tenant_modulos` + gateo), crear cliente, retirar los superadmin sueltos.

## Reglas
- Multi-tenant: SIEMPRE filtrar por `cuenta_id` en todas las queries.
- Sin credenciales en repo.
- El sector es texto libre (enchufable); no hardcodear la lista salvo en UI labels.
