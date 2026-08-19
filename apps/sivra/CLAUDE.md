# CLAUDE.md — SIVRA

> **⚠️ PARCIALMENTE DEPRECADO — la gestión interna se consolidó en `apps/plataforma` (21/06/2026).**
> La funcionalidad **interna** de sivra (páginas `/sivra/*`, APIs `/api/sivra/*`, los crons, mensajería,
> limpiadoras y el motor de pricing) vive ya en **plataforma** (`plataforma-ten-flame.vercel.app`), que
> comparte la misma Supabase. **No añadas features internas nuevas aquí — hazlas en `apps/plataforma`.**
>
> **🚫 NO BORRAR esta app (decisión de Alberto, 21/06/2026).** `apps/sivra` sigue sirviendo la **web
> PÚBLICA de reserva directa de House Sevillana** (`housesevillana.es`/`housesevillana.vercel.app`):
> landing multidioma `app/[locale]/*`, SEO (`sitemap.ts`, `robots.ts`, schema), captación de reservas
> directas. Esa parte **NO está replicada en plataforma** y **se queda viva**. Por tanto la "Fase 2
> destructiva" original (redirigir el dominio → plataforma, borrar `apps/sivra` + proyecto Vercel `sivra`
> + env `SIVRA_URL`) queda **CANCELADA**: redirigir el dominio de reservas a un login autenticado rompería
> a los huéspedes y tiraría el SEO.
>
> Estado del gate (verificado 21/06/2026 contra la BD real): (1) limpiadoras reales = **100% Sique Brilla
> (ialimp)**, 0 de housesevillana → flujo de limpiadoras de sivra sin usuarias; (2) crons de pricing ya en
> `apps/plataforma/vercel.json` (`apps/sivra/vercel.json` → `crons: []`).
> NO toques RLS/buckets/GRANTs de la BD compartida.

Memoria de proyecto para sesiones de Claude Code. Léelo al empezar.

## Qué es
**SIVRA** es una intranet de gestión de pisos turísticos en Sevilla (ingresos, gastos, pricing
dinámico, mensajería con huéspedes, agente IA y coordinación de limpiadoras). No es un sitio
público: todo está detrás de login. El `package.json` se llama `roi-intranet`.

> **Pricing dinámico → producto a vender:** el módulo de precio automático (motor, fuente de mercado real
> Booking/Trivago, endpoint `/api/mercado/ingest`, piloto Busto Reform) está documentado en
> **`docs/pricing-automatico.md`**, con el checklist de lo que falta para que sea vendible ("no puede fallar").

> **🧾 Contabilidad — separación de cuentas (REGLA):** la P&L NO se mezcla. **BBVA** = Duplex Center +
> seguros (aparte). **Kutxa** = personal + los **3 apartamentos turísticos** (Socorro/House Sevillana +
> Busto Reform + Luxury Busto), que hay que sacar **sin lo personal**. Detalle y mapeo en
> **`docs/contabilidad.md`**. El dashboard "Evolución mensual" actual mezcla todo → no vale.

## Stack
- **Next.js 15** (App Router) · React 19 · TypeScript 5.6 · Tailwind 3.4
- **Auth:** NextAuth v5 (credenciales admin) + cookie `limpiadora_token` para limpiadoras. Lógica
  de enrutado en `middleware.ts`.
- **Datos:** PostgreSQL en **Supabase** (proyecto **"Ingresos Y gastos Smoobu"**, ref
  `wswbehlcuxqxyinousql`). Prisma con conexión directa (`DATABASE_URL`).
- **IA:** `lib/ai-client.ts` → **pasarela de IA central de plataforma** (las keys viven solo en plataforma; gasto en su god-panel). `aiComplete` (texto), `aiExtractInvoice` (OCR facturas) y `aiSearch` (búsqueda web, p. ej. `seo-refresh`) enrutan por la pasarela; sin los envs `AI_GATEWAY_URL`+`AI_GATEWAY_SECRET` caen a NVIDIA NIM directo (fallback). **Ya NO se usa Anthropic** (el `seo-refresh` migró de Anthropic web_search a `aiSearch`→`gatewaySearch`/Gemini el 16/06/2026).
- **i18n:** next-intl (es/en/fr/de/it).
- **Deploy:** Vercel (build `prisma generate && next build`). **Crons:** el `vercel.json` de sivra
  solo tiene **1 cron** (`/api/seo-refresh`, semanal, añadido en #419). Los ~18 crons de negocio
  (pricing, mercado, limpiadoras, expenses, eventos, mensajes, updates…) se **migraron a plataforma**
  (#348/#288): viven en `apps/plataforma/vercel.json` como rutas `/api/sivra/*` y se disparan desde
  ese proyecto. **NO los re-programes en sivra** o correrían por duplicado (pricing/facturas dobles).

## Avisos importantes (gotchas)
- **🚨 La DB de Supabase es COMPARTIDA con otra app (`ialimp`).** Esta misma base
  (`wswbehlcuxqxyinousql`) la usa también el repo **`albertosuarezgutierrez-gif/ialimp`**
  (`ialimp.com`, `ialimp.vercel.app`, `siquebrilla.vercel.app`), que es la **app real de las
  limpiadoras** y un SaaS multi-empresa. `ialimp` probablemente lee/escribe con la **anon key en
  cliente**. Por tanto: **NO hagas cambios de RLS, `security_invoker`, privacidad de buckets o GRANTs
  asumiendo que solo `sivra` toca la DB** — pueden romper `ialimp` sin que se note desde aquí. La
  página `app/limpiadoras/` de ESTE repo (`sivra`) sirve a `sivra-app`/`housesevillana`, **no** a las
  limpiadoras reales. Ver `docs/auditoria-seguridad.md`.
- **Prisma ≠ DB real.** `prisma/schema.prisma` solo modela 5 tablas (`properties`, `incomes`,
  `expenses`, `update_logs`, `seo_proposals`). La DB real tiene **90+ tablas**. Todo el módulo
  **limpiadoras** usa **SQL crudo** (`prisma.$queryRaw`) sobre tablas que NO están en el schema →
  TypeScript no las valida. Verifica cambios contra Supabase, no solo con `tsc`.
- **Dos tablas de propiedades:** `properties` (5 filas, modelo Prisma, con `smoobuId`) y
  `propiedades` (106 filas, multi-tenant, usada por limpiadoras). No confundirlas.
- **Sitio público `[locale]` vestigial:** `app/[locale]/page.tsx` redirige a `/dashboard` y el
  middleware manda a `/login` a los anónimos. Las páginas de marketing (`/la-casa`, etc.) se
  eliminaron por dar 404. `sitemap.ts`/`robots.ts` sí se sirven públicos (excluidos del middleware).
- **ESLint** = **flat-config compartido de la matriz**: `eslint.config.mjs` importa `eslint.config.base.mjs`
  de la raíz (`eslint-config-next ^16.2.6`); el legacy `.eslintrc.json` se eliminó. Hay warnings preexistentes
  (código legado a `warn`); el build NO falla por ellos gracias a `eslint.ignoreDuringBuilds` en `next.config.ts`.
  `npm run lint` (= `eslint`) los muestra. Ver MATRIZ.md ("Lint compartido").

## Comandos
- Dev: `npm run dev` · Build: `npm run build` · Lint: `npm run lint`
- Verificación sin DB: `npx tsc --noEmit` y `npx next build` (compila; no prueba runtime con datos).
- Instalación: `npm install --legacy-peer-deps`.

## Variables de entorno (no hay `.env` en el repo)
`DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
`SMOOBU_API_KEY`, `NVIDIA_API_KEY`, `SERPER_API_KEY`, `GITHUB_TOKEN`, `GMAIL_USER`/`GMAIL_APP_PASSWORD`,
`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `CRON_SECRET`, `DRIVE_SCRIPT_URL`.
En local, NextAuth v5 necesita además `AUTH_TRUST_HOST=true`.

> **🔑 `GITHUB_TOKEN` — obligatoria para el agente SEO:** `lib/seo-landing.ts` la necesita para leer
> y commitear la landing de housesevillana, que desde el 12/08/2026 vive **en el propio monorepo**
> (`albertosuarezgutierrez-gif/central`, ruta `apps/housesevillana/app/route.ts`). Es un PAT de GitHub
> con **`contents:write` sobre el repo `central`** — el **mismo valor** que ya usa el botón manual en
> `plataforma`. Sin ella, el cron semanal `/api/seo-refresh` da **500**. Se gestiona desde el panel
> `/operador/secretos` de plataforma (write-through a los proyectos Vercel `sivra` + `plataforma`); si
> hay que rotarla, se rota desde ese panel, no a mano en Vercel. ⚠️ **Lo que falla no suele ser el
> permiso, sino el REPO:** el PAT del 03/08/2026 ya tenía `Contents: Read and write`, pero su
> *Repository access* solo listaba el repo externo viejo `house-sevillana-landing`, así que al unificar
> la landing el PUT empezó a dar `403 Resource not accessible by personal access token` mientras el GET
> seguía funcionando (`central` es público: lo lee cualquier token). Resuelto el 19/08/2026 añadiendo
> `central` a la selección — sin regenerar, así que el valor del token no cambió.
> **Compruébalo en 1 s, sin esperar al cron del lunes:** `GET /api/seo-token-check` de ESTA app (sesión
> o `Bearer CRON_SECRET`), o el botón «Probar acceso a GitHub» de `/sivra/seo` en plataforma. Sondea con
> un PUT de `sha` imposible: 403 = sin permiso, 409 = puede escribir, y no escribe nada.

> **🔑 Smoobu key — fuente única (14/06/2026):** la API key de Smoobu se lee ahora de la **BD**
> (`pms_connections.smoobu_api_key`, la fila de Alberto, tabla propiedad de ialimp) vía
> `lib/smoobu.ts → getSmoobuKey()`, con `process.env.SMOOBU_API_KEY` SOLO como respaldo si la BD
> no responde. Así se **rota en un único sitio** (la conexión de ialimp) sin redeploy. Las 12 rutas
> que hablaban con Smoobu (pricing apply/restore, rates, rates/snapshot, mensajes/*, updates/sync,
> limpiadoras/auto-sessions, alerta-ventana) usan el helper. Opcional: `SMOOBU_PMS_CONNECTION_ID`
> fija la fila por id (default = la de Alberto) para no coger otra cuando ialimp multi-tenant crezca.

## Seguridad de la base de datos
Ver `docs/auditoria-seguridad.md`. **Aplicado y mantenido** (seguro para ambas apps): revocado
`_execute_sql`/`rls_auto_enable` de anon, `search_path` fijado en funciones, y fix de
`calcular_material_sesion`. **Intentado y REVERTIDO** (rompía o podía romper `ialimp` vía anon):
`security_invoker` en 15 vistas, buckets a privados, y drop de la política de `portal_rates` →
todo de vuelta a su estado original. **Tier 2 real:** hay que portar el proxy de signed URLs
(`app/api/limpiadoras/photo/route.ts`, ya en este repo) al repo **`ialimp`** y auditarlo antes de
cerrar buckets/vistas. El bucket `cleaning-photos` sigue **público**.
