---
name: ialimp-maestro
description: >
  Router de contexto de la vertical IALIMP (SaaS multi-tenant de limpiezas de pisos
  turísticos; `app.ialimp.es`, cliente piloto Sique Brilla EN VIVO). NO duplica los docs:
  dice qué existe, dónde vive y qué NO romper antes de tocar nada. USAR SIEMPRE que Alberto
  pida cualquier cosa de ialimp: app de limpiadora (`/l`), portal del propietario, facturación,
  white-label por empresa, concursos públicos, landing `ialimp.es`, contabilidad, Smoobu/iCal,
  o arquitectura/despliegue. Sin secretos: solo nombres de variable.
---

# IALIMP — router de contexto

> Esto es un **índice/puente**, no una copia. La fuente de verdad es
> `apps/ialimp/CLAUDE.md` (extenso y muy detallado). Si algo de aquí contradice
> al código o a `CLAUDE.md`, manda el código: corrige este router en el mismo commit.

## ⚠️ Cliente EN VIVO
Producción = `app.ialimp.es` = rama `main`. **Vanessa (Sique Brilla) lo usa en directo**:
cualquier merge a `main` se ve al instante. No mergear sin preview verde validada.

## Antes de tocar nada (gate obligatorio)
1. Lee `apps/ialimp/CLAUDE.md` — son las reglas para trabajar **sin romper nada**.
2. Identifica el objetivo y módulo (limpiadora `/l` / portal propietario / facturación / white-label /
   concursos / contabilidad / landing / IA).
3. Toda query/route **scopeada por `empresa_id`** — una fuga entre empresas es fallo grave de RGPD.
4. SQL siempre `Prisma.sql` con casts en el SQL (nunca interpolar). Verifica tipos contra Supabase real.

## Dónde vive cada cosa
| Tema | Fuente |
|---|---|
| Reglas, gotchas, módulos (TODO) | `apps/ialimp/CLAUDE.md` |
| Guía de la app de limpiadoras | `apps/ialimp/docs/guia-limpiadoras.md` |
| Mejoras pedidas por Vanessa | `apps/ialimp/docs/mejoras-vanessa.md` |
| Landing `ialimp.es` (proyecto Vercel separado) | `apps/ialimp/landing/ialimp-es/` (+ su README) |
| Estado vivo del proyecto | `docs/CONTEXTO-SESIONES.md` |
| Estructura del monorepo | `MATRIZ.md` |

## Infra (sin secretos — nombres de variable)
- **Supabase** `wswbehlcuxqxyinousql` (schema `public`) — **COMPARTIDA con sivra y plataforma**.
- Stack: Next 15 · Prisma · **JWT propio (jose+bcryptjs, SIN NextAuth)** · cookie `ialimp_session`
  (portal propietario = cookie SEPARADA `ialimp_prop`; limpiadora = `limpiadora_token`).
- IA: solo NVIDIA NIM vía `lib/ai-client.ts` (`@anthropic-ai/sdk` ELIMINADO).
- Email: `lib/mailer.ts` (activo IONOS SMTP `:587`; orden Resend→IONOS→Gmail). `MAIL_FROM=hola@ialimp.es`.
- Build: `prisma generate && next build`; **Vercel usa `buildCommand` de `vercel.json`** (debe incluir
  `node scripts/fetch-fonts.mjs`). Commits con prefijo `fix:`/`feat:`.

## Landmines (no romper — detalle en CLAUDE.md)
- **Multi-tenant = frontera de seguridad**: scope `empresa_id` SIEMPRE; sesión ÚNICA por usuario (`session_jti`).
- **`ignoreBuildErrors`/`ignoreDuringBuilds` = true**: el build verde NO garantiza tipos sanos (sí caza sintaxis).
- **White-label por empresa** (no por host): acentos con `var(--brand-*)`, no hex fijo (salvo colores semánticos).
- **RGPD**: gate de consentimiento del portal del propietario; páginas legales rompen el white-label (responsable = IALIMP).
- **Concursos públicos** = módulo puro `@central/module-concursos` (LLM por puerto `AiRunner`); migraciones `add_concursos*.sql` se aplican **a mano** en Supabase.
- **Verificación de email**: Claude lo comprueba él mismo (Gmail de Alberto + runtime logs de Vercel), no se lo pide al usuario.
- Bucket `cleaning-photos` **PRIVADO** (signed URLs vía proxy `/api/l/photo`).

## Frontera multi-tenant
BD compartida con sivra/plataforma. Cualquier cambio de RLS/buckets/GRANTs puede romper sivra (anon key).
Cambios transversales de BD → valídalos con `auditoria-central`.
