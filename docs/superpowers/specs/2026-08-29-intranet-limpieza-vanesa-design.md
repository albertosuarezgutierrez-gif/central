# Intranet de limpieza para Vanesa (pisos de Alberto) — diseño

**Fecha:** 29/08/2026 · **Aprobado por:** Alberto (conversación, maqueta validada)

## Contexto
Vanesa (Sique Brilla) no usa el panel admin de ialimp; hoy ve las limpiezas de los 4 pisos de
Alberto por vías ajenas (Smoobu). Alberto quiere: (1) una pantalla propia y básica para ella —
calendario de reservas de sus 4 pisos + resumen diario con limpiezas, tareas y notas — en
**plataforma**; (2) tomar él el mando del tenant Sique Brilla en ialimp (quitar credenciales de
Vanesa) — **fase posterior, tras validar la pantalla**. Maqueta aprobada (artifact
`f0ae3215-72bc-451b-b93e-8790834f4fa8`).

## Decisiones
- **Dónde:** `apps/plataforma`, patrón de acceso INVITADO por token en BD (igual que
  `empresas_acceso_token` / `trading_acceso_token`): tabla `limpieza_acceso_token` (fila única),
  entrada `/invitado/limpieza?token=…` → cookie httpOnly `limpieza_invitado` → `lib/limpieza-acceso.ts`
  acepta sesión (Alberto, preview) O invitado (Vanesa). Rotable/revocable por SQL sin redeploy.
- **Datos del calendario:** `incomes` filtrado a los 4 slugs de `PROPS_CALENDARIO`. Se expone
  ocupación + nº huéspedes (`adults+children`; **NULL = «no se sabe», no 0** — no se pinta número).
  **Sin nombres de huéspedes ni importes.**
- **Limpiezas del día:** `cleaning_sessions` con `property_id IN (4 slugs)` (las filas del cron
  `auto-sessions` de plataforma, donde ya escribe `nota_propietario` el panel de Alberto). La marca
  «entra huésped hoy» se deriva de `incomes` (checkIn == fecha en el mismo piso), no del
  `checkin_time` (que el cron rellena con '15:00' por defecto).
- **Tareas sueltas:** tabla nueva `limpieza_tareas` (fecha, property_id opcional, texto, hecha).
  CRUD de Alberto en una pestaña nueva «Tareas» de `/sivra/limpiadoras` (sesión). Vanesa solo
  lista y marca hecha/deshecha desde la intranet (cookie invitado, endpoint separado).
- **Fuga corregida en el mismo PR:** `/api/sivra/limpiadoras/historial` leía `cleaning_sessions`
  sin filtro → veía sesiones de TODOS los tenants de ialimp. Se acota por defecto a los 4 slugs.

## Componentes
| Pieza | Archivo |
|---|---|
| SQL (2 tablas) | `apps/plataforma/prisma/sql/2026-08-29_limpieza_intranet.sql` (aplicar por Supabase MCP + sembrar token) |
| Acceso | `lib/limpieza-acceso.ts` (espejo de `empresas-acceso.ts`) |
| Canje token→cookie | `app/api/sivra/limpieza-intranet/invitado/route.ts` |
| Datos intranet | `app/api/sivra/limpieza-intranet/datos/route.ts` (GET: reservas+limpiezas+tareas del rango) |
| Toggle tarea (Vanesa) | `app/api/sivra/limpieza-intranet/tareas/route.ts` (PATCH hecha) |
| CRUD tareas (Alberto) | `app/api/sivra/limpiadoras/tareas/route.ts` (GET/POST/PATCH/DELETE, sesión) |
| Enlace con token (Alberto) | `app/api/sivra/limpieza-intranet/enlace/route.ts` (GET, sesión) |
| Página | `app/invitado/limpieza/page.tsx` + `IntranetLimpieza.tsx` (client, mobile-first ≥320px) |
| Helpers puros + tests | `lib/sivra/limpieza-intranet.ts` + `.test.ts` (pax 3-estados, entrada mismo día) |
| Middleware | pase por cookie `limpieza_invitado` para `/api/sivra/limpieza-intranet/*` (el handler revalida) |
| Panel Alberto | pestaña «Tareas» en `LimpiadoresClient.tsx` + enlace/copia del acceso de Vanesa |

## Reglas de la casa que aplican
NULL≠0 en aforo (3 estados) · responsive ≥320px · sin `prefers-color-scheme` (tema claro por
defecto de plataforma) · SQL siempre `Prisma.sql` · listas con montaje acotado (30 días, 4 pisos).

## Fase 2 (fuera de este PR)
Desactivar credenciales admin de Vanesa en ialimp y alta de Alberto como admin del tenant
Sique Brilla (cambio de datos en producción; se ejecuta cuando Alberto valide la pantalla real).
