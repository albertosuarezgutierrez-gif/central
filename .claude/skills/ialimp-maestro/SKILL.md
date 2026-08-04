---
name: ialimp-maestro
description: >
  Router de contexto de la vertical IALIMP (SaaS multi-tenant de limpiezas; `app.ialimp.es`,
  piloto Sique Brilla EN VIVO). USAR SIEMPRE que Alberto pida algo de ialimp: app de limpiadora
  (`/l`), portal del propietario, facturación, white-label, landing, contabilidad, Smoobu/iCal,
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
   contabilidad / landing / IA). ⚠️ Concursos → ver **plataforma** (movido el 19/06/2026).
3. Toda query/route **scopeada por `empresa_id`** — una fuga entre empresas es fallo grave de RGPD.
4. SQL siempre `Prisma.sql` con casts en el SQL (nunca interpolar). Verifica tipos contra Supabase real.

## Agentes IA — jerarquía de análisis (3 niveles)

| Nivel | Ruta API | Qué analiza | UI |
|---|---|---|---|
| **Empresa** | `GET /api/admin/ia/patrones` | Patrones globales de la empresa | `/admin/ia` |
| **Limpiadora** | `POST /api/admin/rrhh/analisis` | Rendimiento individual de una limpiadora | pestaña IA en `/admin/rrhh` |
| **Propiedad** | `POST /api/admin/ia/analizar-apartamento` | Histórico de limpiezas de un apartamento (90 días) | botón 🤖 en `/admin/clientes/[id]/propiedades` |

### `POST /api/admin/ia/analizar-apartamento` (nuevo — merged PR #609, jul-2026)
- **Fichero backend**: `apps/ialimp/app/api/admin/ia/analizar-apartamento/route.ts`
- **UI**: `apps/ialimp/app/admin/clientes/[id]/propiedades/PropiedadesClient.tsx`
- **Scope**: `empresa_id` (de sesión) + `propiedad_id` (body) — aislamiento multi-tenant obligatorio.
- **4 queries paralelas** (`Promise.all`): info propiedad, sesiones de limpieza (90 días, LIMIT 60), quejas (LIMIT 20), session_completions/checklist (LIMIT 100).
- **Stats calculadas**: tasa_completado, duración media, patrón días semana (top 3), top-5 ítems de checklist fallados.
- **Prompt IA** → genera JSON: `{resumen, metricas, alertas[], insights[], recomendaciones[]}`.
- **Respuesta**: `{ok, analisis, propiedad, stats:{total, completadas, urgentes, duracionMedia}}`.
- La UI muestra los resultados inline en la tarjeta del apartamento (toggle con doble clic en el botón); panel de colores: rojo=alertas, índigo=insights, verde=recomendaciones.

## Dónde vive cada cosa
| Tema | Fuente |
|---|---|
| Reglas, gotchas, módulos (TODO) | `apps/ialimp/CLAUDE.md` |
| **RR.HH. de la limpiadora** (expediente + nómina PDF + **firma OTP**) | `apps/ialimp/CLAUDE.md` § "RR.HH. de la limpiadora"; consume `@central/module-rrhh`/`module-documental`/`core-firma`. `lib/*-limpiadora.ts` + `lib/nomina-pdf.ts`; UI `/l/documentos` + pestaña 📁 Expediente en `/admin/rrhh`. Bucket privado `documentos-limpiadora`. **email de limpiadora OBLIGATORIO** (OTP). `limpiadoras.persona_id` enlaza con `rrhh.empleados` (misma persona) |
| **Factura del propietario** (página imprimible "Guardar como PDF") | `app/api/propietario/[token]/factura/[id]/route.ts` → renderiza con `renderInvoiceHtml` de **`@central/core-receipts`** (no plantilla local). Branding por empresa vía `getBranding(empresa_id)` (`lib/branding.ts`): Sique Brilla=oro/negro, resto=índigo. El renderer llama `assertFiscalIntegrity` (fail-closed). Glosa IA/PDF = pendiente (spec `docs/superpowers/specs/2026-06-16-core-receipts-design.md`, sin construir) |
| Guía de la app de limpiadoras | `apps/ialimp/docs/guia-limpiadoras.md` |
| Mejoras pedidas por Vanessa | `apps/ialimp/docs/mejoras-vanessa.md` |
| Landing `ialimp.es` (proyecto Vercel separado) | `apps/ialimp/landing/ialimp-es/` (+ su README) |
| Estado vivo del proyecto | `docs/CONTEXTO-SESIONES.md` |
| Estructura del monorepo | `MATRIZ.md` |

## Infra (sin secretos — nombres de variable)
- **Supabase** `wswbehlcuxqxyinousql` (schema `public`) — **COMPARTIDA con sivra y plataforma**.
- Stack: Next 15 · Prisma · **JWT propio (jose+bcryptjs, SIN NextAuth)** · cookie `ialimp_session`
  (portal propietario = cookie SEPARADA `ialimp_prop`; limpiadora = `limpiadora_token`).
- IA: **pasarela central de plataforma** vía `lib/ai-client.ts` (`aiComplete` texto + `aiVision` OCR; NIM por debajo). Keys solo en plataforma; envs `AI_GATEWAY_URL`+`AI_GATEWAY_SECRET` (Team-shared) → fallback NIM directo. `@anthropic-ai/sdk` ELIMINADO.
- Email: `lib/mailer.ts` (activo IONOS SMTP `:587`; orden Resend→IONOS→Gmail). `MAIL_FROM=hola@ialimp.es`.
- Build: `prisma generate && next build`; **Vercel usa `buildCommand` de `vercel.json`** (debe incluir
  `node scripts/fetch-fonts.mjs`). Commits con prefijo `fix:`/`feat:`.

## Landmines (no romper — detalle en CLAUDE.md)
- **Multi-tenant = frontera de seguridad**: scope `empresa_id` SIEMPRE; sesión ÚNICA por usuario (`session_jti`).
- **`ignoreBuildErrors`/`ignoreDuringBuilds` = true**: el build verde NO garantiza tipos sanos (sí caza sintaxis).
- **White-label por empresa** (no por host): acentos con `var(--brand-*)`, no hex fijo (salvo colores semánticos).
- **RGPD**: gate de consentimiento del portal del propietario; páginas legales rompen el white-label (responsable = IALIMP).
- **Concursos públicos / licitaciones → YA NO viven en ialimp** (movidos a `apps/plataforma`, jun-2026): las licitaciones son transversales a la cuenta, no de la vertical de limpiezas. Se borraron de ialimp páginas/rutas/libs/crons; las tablas (`concursos*`) siguen en la BD compartida y las usa plataforma. Si Alberto pide algo de concursos → `plataforma-maestro`.
- **Verificación de email**: Claude lo comprueba él mismo (Gmail de Alberto + runtime logs de Vercel), no se lo pide al usuario.
- Bucket `cleaning-photos` **PRIVADO** (signed URLs vía proxy `/api/l/photo`).

## Frontera multi-tenant
BD compartida con sivra/plataforma. Cualquier cambio de RLS/buckets/GRANTs puede romper sivra (anon key).
Cambios transversales de BD → valídalos con `auditoria-central`.
