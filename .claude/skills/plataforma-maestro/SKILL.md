---
name: plataforma-maestro
description: >
  Router de contexto de la vertical PLATAFORMA (cuadro de mando consolidado de la casa de
  marcas + god-panel de operador; jerarquía Cuenta → Sociedad → Negocio). NO duplica los docs:
  dice qué existe, dónde vive y qué NO romper antes de tocar nada. USAR SIEMPRE que Alberto
  pida cualquier cosa de plataforma: dashboard consolidado, god-panel `/admin`, adaptadores por
  vertical, resumen financiero cross-negocio, registro de cuentas, o el puerto HTTP a ia-rest.
  Sin secretos: solo nombres de variable.
---

# PLATAFORMA — router de contexto

> Esto es un **índice/puente**, no una copia. La fuente de verdad es
> `apps/plataforma/CLAUDE.md` y los diseños apuntados abajo. Si algo de aquí
> contradice al código, manda el código: corrige este router en el mismo commit.

## Antes de tocar nada (gate obligatorio)
1. Lee `apps/plataforma/CLAUDE.md` — qué es, BD, envs, estado y god-panel.
2. Identifica el objetivo: dashboard del dueño vs **god-panel `/admin`** (operador Alberto).
3. Toda query **scopeada por `cuenta_id`**. El god-panel se auto-protege en los handlers (`getAdmin`).
4. Si tocas datos de ia-rest: recuerda que **NO** se leen por Prisma sobre `iarest.*` (clon vacío)
   sino por **puerto HTTP** (`${IAREST_URL}/api/operador/*`, Bearer `OPERADOR_SHARED_SECRET`).

## Dónde vive cada cosa
| Tema | Fuente |
|---|---|
| Qué es, BD, envs, estado, reglas | `apps/plataforma/CLAUDE.md` |
| Diseño del god-panel | `docs/DISEÑO-god-panel.md` |
| Plataforma modular (roadmap) | `docs/PLAN-plataforma-modular.md` |
| Radiografía del repo (pestaña 🗺️ Estructura) | `docs/ESTRUCTURA.md` |
| Estado vivo del proyecto | `docs/CONTEXTO-SESIONES.md` |
| Estructura del monorepo | `MATRIZ.md` |

## Infra (sin secretos — nombres de variable)
- **Supabase** `wswbehlcuxqxyinousql` (schema `public`) — **COMPARTIDA con sivra y ialimp**.
  Tablas propias: `cuentas`, `sociedades`, `negocios`.
- Stack: Next 15 · Prisma · JWT (jose/bcryptjs, cookie `plataforma_session`) · sin Tailwind (CSS vars).
- God-panel: auth propia (cookie `plataforma_admin`, 8h) contra tabla `superadmins` (mismo login que `/superadmin` de ialimp).
- Envs: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `IAREST_URL`, `IALIMP_URL`, `SIVRA_URL`,
  `OPERADOR_SHARED_SECRET` (mismo valor en el proyecto Vercel `ia-rest`).
- Root Directory Vercel: `apps/plataforma`.

## Landmines (no romper — detalle en CLAUDE.md)
- **ia-rest vive en OTRA BD**: la unificación quedó a medias; `iarest.*` del compartido es un **clon vacío del DDL**.
  Los datos vivos están en el proyecto Supabase propio de ia-rest (`efncqyvhniaxsirhdxaa`). Léelo por el **puerto HTTP**.
- **Adaptadores por vertical** (`lib/adapters/*`, contrato `VerticalAdapter`): ialimp+sivra → BD directa (SQL raw);
  iarest → puerto HTTP. **No se fusiona nada.**
- Sin `OPERADOR_SHARED_SECRET` correcto, el panel no ve los clientes de ia-rest (ialimp+sivra sí).
- 🏠 Mis propiedades: "Resumen" lee `properties` (sivra Smoobu), **NO** `propiedades` (multi-tenant limpiadoras).

## Frontera multi-tenant
Scope `cuenta_id` siempre. BD compartida con sivra/ialimp: cambios transversales de BD → `auditoria-central`.