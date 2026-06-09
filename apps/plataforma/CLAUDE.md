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

## Root Directory en Vercel
`apps/plataforma` — install `npx --yes pnpm@10.33.0 install --no-frozen-lockfile`.

## Estado HITO 2 (09/06/2026)
- [x] Tablas `cuentas/sociedades/negocios` aplicadas en Supabase.
- [x] Shell completo: login, dashboard con tarjetas por negocio.
- [ ] Stub financiero (las tarjetas muestran "—" hasta federar con `module-contabilidad`).
- [ ] Alta de cuentas por UI (hoy se inserta a mano en Supabase).
- [ ] Resumen financiero real por negocio (HITO 3).

## Añadir una cuenta manualmente (hasta que haya UI)
```sql
-- En el SQL editor de Supabase (proyecto wswbehlcuxqxyinousql):
INSERT INTO cuentas (nombre, email, password_hash)
VALUES ('Alberto', 'tu@email.com', '<bcrypt hash>');
-- Generar el hash: node -e "require('bcryptjs').hash('tuPassword', 12).then(console.log)"
```

## Reglas
- Multi-tenant: SIEMPRE filtrar por `cuenta_id` en todas las queries.
- Sin credenciales en repo.
- El sector es texto libre (enchufable); no hardcodear la lista salvo en UI labels.
