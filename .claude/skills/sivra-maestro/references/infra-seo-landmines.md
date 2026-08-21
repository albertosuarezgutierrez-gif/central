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
- 🚨 **`GITHUB_TOKEN` necesita el REPO `central` en su selección, no solo el permiso** (la landing vive
  en el monorepo desde el 12/08/2026: `apps/housesevillana/app/route.ts`). Incidente cerrado el
  19/08/2026: el PAT `seo-housesevillana-panel` YA tenía `Contents: Read and write`, pero su
  *Repository access* solo listaba el repo externo viejo `house-sevillana-landing`, así que el cron del
  17/08 falló con `403 Resource not accessible by personal access token`. **El GET nunca delata nada
  porque `central` es PÚBLICO** (`private:false`): lee cualquier token, incluso ninguno. Solo el PUT
  prueba el permiso. Al diagnosticar, mira el repo ANTES que el permiso. PRs #1470 (pista) y #1488 (sondeo).
- 🔑 **Antes de dar por bueno un PAT, sondéalo — no esperes al lunes.** Botón **«Probar acceso a GitHub»**
  en `/sivra/seo` (plataforma) → `GET /api/sivra/seo-token-check`; gemelo en sivra →
  `GET /api/seo-token-check` (auth: sesión o `Bearer CRON_SECRET`). Es el ÚNICO que comprueba el token
  del entorno donde corre el cron semanal: el panel `/operador/secretos` escribe el mismo valor en los
  dos proyectos, pero su redeploy es best-effort y el Ignored Build Step puede cancelarlo.
  **Cómo sondea sin escribir:** PUT real con `sha` de 40 ceros; GitHub valida el permiso ANTES que el
  sha ⇒ **403 = sin permiso · 409 = puede escribir y no ha tocado nada**. Manda además el contenido
  ACTUAL sin modificar, así que ni en el caso imposible se pierde la landing.
  **Solo el 409 se pinta verde**; lo que no se entiende es 🟠 «no lo sé», nunca «va bien»
  (`clasificarSondeo` es puro y testeado en `apps/plataforma/lib/sivra/seo-landing.test.ts`).
- ⚠️ **Rotar ≠ editar.** Editar los permisos o los repos de un PAT fine-grained NO cambia su valor: no
  hay que re-pegarlo en `/operador/secretos` ni redesplegar. Solo «Regenerate token» lo cambia.
- **Suelto conocido (19/08/2026):** ese PAT no tiene caducidad y conserva el repo muerto
  `house-sevillana-landing` en su selección. Recomendado a Alberto ponerle 1 año y quitarlo; decisión suya.
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

## 📅 Calendario de la landing — dependencia CROSS-APP y su landmine de caché (20/08/2026)
La portada de `apps/housesevillana` pinta un calendario de disponibilidad (`app/calendario.ts`) que
**no tiene datos propios**: los pide a un endpoint que vive en OTRA app,
`apps/plataforma/app/api/publico/disponibilidad`. Consecuencia que hay que tener presente antes de
tocar nada: **un cambio en plataforma puede romper la landing sin que se toque ni uno de sus
ficheros**, y al revés, si la landing enseña el aviso de error el problema casi nunca está en ella.
- **Se rompió TRES veces el mismo día, siempre por caché, siempre invisible desde el servidor**
  (PRs #1519, #1521, #1523). Lo que hay que saber, en una frase cada uno:
  1. El CDN de Vercel **no cachea por `Origin`** y borra el `vary: Origin` → una respuesta cacheada
     **no puede** llevar cabeceras que dependan del origen. Por eso el CORS es un comodín fijo.
  2. **`s-maxage` sin `max-age` NO es «cachea solo el CDN»**: el navegador también guarda, y con
     `stale-while-revalidate` puede servirse su propia copia vieja hasta una hora.
  3. Un 200 por `curl` **no prueba** que un recurso con CORS funcione (curl no manda `Origin`), y con
     caché delante **una sola petición no mide nada**: repetir y leer `x-vercel-cache`.
- **Regla de oro del endpoint:** nunca `ocupadas: []` por un fallo. Degrada Smoobu en vivo →
  `rate_snapshots` de ≤2 días → **503**, y la landing enseña un aviso. Una lista vacía se pintaría
  como calendario entero libre, que es la mentira más cara que tiene esa web.
- El widget vive **aparte de `route.ts` a propósito**: el agente SEO reescribe la portada los lunes y
  no debe tener superficie sobre él. Por eso el guardián de i18n lee **los dos** ficheros.

## Frontera multi-tenant
Es intranet de los pisos de Alberto, pero la BD es compartida y multi-tenant para el módulo limpiadoras
(`empresa_id`). Cualquier cambio transversal de BD se valida también contra ialimp (ver `auditoria-central`).
