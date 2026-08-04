# SIVRA — infra, agente SEO y landmines

## Infra (sin secretos — nombres de variable)
- **Supabase** `wswbehlcuxqxyinousql` (schema `public`) — **COMPARTIDA con ialimp y plataforma**.
- **Prisma** con conexión directa (`DATABASE_URL`/`DIRECT_URL`); auth NextAuth v5 (admin) + cookie
  `limpiadora_token`. IA por `lib/ai-client.ts` → **pasarela central de plataforma** (`aiComplete`+`aiExtractInvoice` OCR+`aiSearch` web; envs `AI_GATEWAY_URL`+`AI_GATEWAY_SECRET`, fallback NIM directo). Deploy Vercel; `vercel.json` de sivra solo tiene **1 cron** (`/api/seo-refresh` semanal) — los ~18 crons de negocio se migraron a plataforma (#348, rutas `/api/sivra/*`), NO re-programar en sivra.

## ⚠️ Agente SEO de housesevillana — HAY DOS rutas (no confundir, divergen)
- **Botón "Actualizar SEO ahora"** (lo que Alberto ve/prueba, en plataforma `/sivra/seo`) → ruta
  **`apps/plataforma/app/api/sivra/seo-refresh/route.ts`**. Es la ENDURECIDA (junio 2026, PRs #521/#544-546/#548/#550).
  `runSeoAnalysis` en **3 niveles**: (1) **Serper** (Google Search API, free ~2.500/mes) hace **4 búsquedas** reales →
  NIM/Groq redacta el SEO y lista **4-6 competidores REALES**, coste 0; (2) Gemini grounding si tuviera cuota (free tier
  suele dar 429); (3) NIM solo, sin búsqueda (último recurso). `SERPER_API_KEY` editable desde `/operador/secretos`
  (write-through sivra+plataforma). Robustez: `lib/sivra/seo-landing.ts` con `decodeLanding` (evita `Buffer.from(undefined)`
  si falta `GITHUB_TOKEN`), INSERT a `seo_proposals` correcto (sin `updatedAt`; `id` TEXT → `::text`; `topCompetitors`
  jsonb → `::jsonb`), y **alerta Telegram** (`tgAlert(...,'critico')`) ante cualquier fallo → ya no peta en silencio.
- **Cron SEMANAL automático** (`vercel.json` de sivra, `0 10 * * 1`) → ruta **`apps/sivra/app/api/seo-refresh/route.ts`**.
  **YA ALINEADO** con la ruta del botón (PR #551, 26/06/2026): mismo `runSeoAnalysis` en 3 niveles
  (Serper 4 búsquedas → `aiSearch`/Gemini → NIM), `parseSeoJson` con guard y `tgAlert('critico')` en el catch.
  Diferencias propias (a propósito): conserva el campo **`schema`** del JSON y escribe vía `prisma.seoProposal.create`
  (no SQL crudo), con `topCompetitors` como `Prisma.InputJsonValue`/`Prisma.JsonNull`. Sigue gateado por kill-switch
  **`SEO_AGENT_ENABLED !== 'true'`** (apagado por defecto; el botón manual con sesión funciona siempre).
  Si en el futuro cambia la ruta del botón, **replicar el cambio aquí** para que no vuelvan a divergir.
- Envs: `NEXTAUTH_SECRET/URL`, `SMOOBU_API_KEY`, `NVIDIA_API_KEY`, `SERPER_API_KEY`,
  `GMAIL_USER/GMAIL_APP_PASSWORD`, `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `CRON_SECRET`, `DRIVE_SCRIPT_URL`,
  `AUTH_TRUST_HOST=true` (local). Valores en Vercel env, nunca en repo.

## Landmines (no romper — detalle en CLAUDE.md)
- 🚨 **BD compartida con ialimp** (app real de limpiadoras, lee con anon key en cliente): **NO**
  toques RLS, `security_invoker`, privacidad de buckets ni GRANTs asumiendo que solo sivra usa la BD.
- **Prisma ≠ BD real**: el schema modela 5 tablas; la BD tiene 90+. El módulo limpiadoras va por SQL crudo.
- **Dos tablas de propiedades**: `properties` (5 filas, Prisma, `smoobuId`) vs `propiedades` (106, multi-tenant). No confundir.
- 🚨 **INGRESO por piso = tabla `incomes` (INGLÉS)**, por reserva (`propertyId, date, amount` neto, `amount_gross`, `portal`, `nights`). Gastos por piso = `expenses`/`gastos`. Enlace negocio→piso: `negocios.ref_ext` (`prop_*`) = `incomes.propertyId`. Reutiliza `getResumenSivra(anio,propertyId)` (plataforma `lib/financiero.ts`) — es lo que pinta el dashboard. **NO** buscar el ingreso solo por nombres en español (te saltas `incomes`) ni usar `propietario_ingresos`/`propiedades` (DEMO). El **banco** agrega todos los pisos en `turistico_pisos` → no sirve para "ingreso del piso X".
- `app/limpiadoras/` de ESTE repo sirve a `sivra-app`/`housesevillana`, **no** a las limpiadoras reales (esas son ialimp).
- Bucket `cleaning-photos` sigue **público**; cerrar buckets/vistas requiere portar antes el proxy de signed URLs a ialimp.

## Frontera multi-tenant
Es intranet de los pisos de Alberto, pero la BD es compartida y multi-tenant para el módulo limpiadoras
(`empresa_id`). Cualquier cambio transversal de BD se valida también contra ialimp (ver `auditoria-central`).
