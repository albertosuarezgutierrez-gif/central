---
name: sivra-maestro
description: >
  Router de contexto de la vertical SIVRA (pisos turísticos Sevilla; package.json
  `roi-intranet`). USAR SIEMPRE que Alberto pida cualquier cosa de sivra: ingresos/gastos,
  pricing, mensajería huéspedes, limpiadoras de ESTE repo, agente IA, Smoobu, partes de
  viajeros (SES.HOSPEDAJES / Chekin), o arquitectura/despliegue de sivra. Sin secretos: solo nombres de variable.
---

# SIVRA — router de contexto

`apps/sivra` es hoy SOLO la **web pública de reserva directa de House Sevillana**
(`housesevillana.es`; landing multidioma + SEO). La gestión INTERNA (finanzas, mensajería,
limpiadoras, agente IA, pricing y crons de negocio) se consolidó en **`apps/plataforma`**
(`/sivra/*`, `/api/sivra/*`). Fuente de verdad: `apps/sivra/CLAUDE.md`. BD Supabase
compartida `wswbehlcuxqxyinousql` (con ialimp+plataforma).

## 🚨 No romper / crítico
1. **`apps/sivra` NO se borra (decisión de Alberto).** La "Fase 2 destructiva" (redirigir
   dominio, borrar app/proyecto Vercel) está **CANCELADA**.
2. **Feature/fix interno → trabaja en `apps/plataforma`, NO en sivra.** Excepción:
   `/api/pricing/aplicar-propuesta` y `/api/pricing/pisos-zona` (raíl del agente de pricing)
   siguen SOLO en sivra — otra razón para no apagarla.
3. 🚨 **BD compartida con ialimp** (app real de limpiadoras, lee con anon key en cliente): **NO**
   toques RLS, `security_invoker`, privacidad de buckets ni GRANTs asumiendo que solo sivra usa la BD.
4. **Prisma ≠ BD real**: el schema modela 5 tablas; la BD tiene 90+. Si tocas SQL, verifica
   contra Supabase real, **no solo `tsc`**.
5. **Dos tablas de propiedades**: `properties` (5 filas, Prisma, `smoobuId`) vs `propiedades`
   (106, multi-tenant). No confundir.
6. 🚨 **INGRESO por piso = tabla `incomes` (INGLÉS)**; enlace `negocios.ref_ext` (`prop_*`) =
   `incomes.propertyId`; reutiliza `getResumenSivra` (plataforma `lib/financiero.ts`). El banco
   agrega todos los pisos en `turistico_pisos` → NO sirve para "ingreso del piso X".
7. 🚨 **VANESA = SIQUE BRILLA, y su ÚNICA pantalla es `/invitado/limpieza` (corregido 01/09/2026).**
   Vanessa Cruz (Sique Brilla SL) es la limpieza de los 4 pisos Y era la clienta piloto de ialimp:
   **son la misma persona**, y los docs las trataban como cosas distintas. **Ya NO entra en ialimp**
   (se le retiró el acceso): ialimp sigue vivo como PRODUCTO que Alberto quiere vender, no como su
   herramienta. Lo operativo va por el enlace con token de la intranet de plataforma
   (`/invitado/limpieza`, tabla `limpieza_tareas`). **Toda instrucción para ella tiene que APARECER
   AHÍ**: un email a `limpiezascruzz@gmail.com` o un chip en `/sivra/mensajes` son canales que ella no
   abre. Caso fundacional: la cuna de la reserva 152490601 estaba pedida por email y no salía en su
   pantalla. `app/limpiadoras/` de sivra no tiene usuarias reales.
8. **Bucket `cleaning-photos` sigue público**: cerrarlo requiere portar antes el proxy de
   signed URLs a ialimp.
9. **`vercel.json` de sivra solo tiene 1 cron** (`/api/seo-refresh` semanal): los crons de
   negocio viven en plataforma — NO re-programarlos en sivra.
10. **Agente huéspedes: solo el botón ✅ Enviar manda al huésped**; quejas/dinero/cambios
    NUNCA se auto-envían (allowlist de graduación + cortesía con guardas).
11. 🚨 **Partes de viajeros (SES.HOSPEDAJES): el emisor REAL de hoy es Chekin, en los cuatro pisos.**
    Nada nuestro envía un parte hasta apagar Chekin piso a piso (sustitución en fases, como
    PriceLabs) — dos emisores a la vez = partes duplicados. Detalle en `references/infra-seo-landmines.md`.
12. 🚨 **Una tabla NUEVA en `public` nace abierta a `anon`/`authenticated`** por los privilegios por
    defecto del schema. En esta BD compartida, toda tabla sensible lleva su `REVOKE` en la propia
    migración (patrón: `prisma/sql/2026-08-20_ses_establecimientos.sql`).

## ÍNDICE de references/
**Lee SOLO el archivo que necesite la tarea; no los cargues todos.**

- **`references/contexto-y-agente-huesped.md`** — Estado de la consolidación en plataforma ·
  gate obligatorio antes de tocar nada · tabla "Dónde vive cada cosa" (docs de pricing,
  contabilidad, seguridad BD) · TODO el agente de mensajería con huéspedes (flujo
  Telegram ✅/✏️/🔧, re-borrador, hilo como contexto, texto plano sin JSON, modelo, estilo,
  fase temporal, `horarios.ts`, early check-in / late check-out, parking, equipaje, idioma,
  idempotencia, graduación, auto-cortesía).
  → Léelo para cualquier tarea del agente de huéspedes o para ubicar dónde vive una feature.
- **`references/infra-seo-landmines.md`** — Infra (Supabase compartida, Prisma, pasarela IA,
  envs) · agente SEO de housesevillana (DOS rutas: botón en plataforma vs cron semanal en
  sivra, kill-switch `SEO_AGENT_ENABLED`) · landmines completos de BD · frontera multi-tenant.
  → Léelo antes de tocar BD/RLS/buckets, SEO, envs o despliegue.
