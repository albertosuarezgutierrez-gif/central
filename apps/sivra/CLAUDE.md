# CLAUDE.md — SIVRA

Memoria de proyecto para sesiones de Claude Code. Léelo al empezar.

## Qué es
**SIVRA** es una intranet de gestión de pisos turísticos en Sevilla (ingresos, gastos, pricing
dinámico, mensajería con huéspedes, agente IA y coordinación de limpiadoras). No es un sitio
público: todo está detrás de login. El `package.json` se llama `roi-intranet`.

## Stack
- **Next.js 15** (App Router) · React 19 · TypeScript 5.6 · Tailwind 3.4
- **Auth:** NextAuth v5 (credenciales admin) + cookie `limpiadora_token` para limpiadoras. Lógica
  de enrutado en `middleware.ts`.
- **Datos:** PostgreSQL en **Supabase** (proyecto **"Ingresos Y gastos Smoobu"**, ref
  `wswbehlcuxqxyinousql`). Prisma con conexión directa (`DATABASE_URL`).
- **IA:** `lib/ai-client.ts` → NVIDIA NIM (texto + visión para facturas).
- **i18n:** next-intl (es/en/fr/de/it).
- **Deploy:** Vercel (build `prisma generate && next build`), 10 crons en `vercel.json`.

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
- **ESLint** está configurado (`.eslintrc.json`) pero hay errores preexistentes; el build NO falla
  por ellos gracias a `eslint.ignoreDuringBuilds` en `next.config.ts`. `npm run lint` los muestra.

## Comandos
- Dev: `npm run dev` · Build: `npm run build` · Lint: `npm run lint`
- Verificación sin DB: `npx tsc --noEmit` y `npx next build` (compila; no prueba runtime con datos).
- Instalación: `npm install --legacy-peer-deps`.

## Variables de entorno (no hay `.env` en el repo)
`DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
`SMOOBU_API_KEY`, `NVIDIA_API_KEY`, `SERPER_API_KEY`, `GMAIL_USER`/`GMAIL_APP_PASSWORD`,
`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `CRON_SECRET`, `DRIVE_SCRIPT_URL`.
En local, NextAuth v5 necesita además `AUTH_TRUST_HOST=true`.

## Seguridad de la base de datos
Ver `docs/auditoria-seguridad.md`. **Aplicado y mantenido** (seguro para ambas apps): revocado
`_execute_sql`/`rls_auto_enable` de anon, `search_path` fijado en funciones, y fix de
`calcular_material_sesion`. **Intentado y REVERTIDO** (rompía o podía romper `ialimp` vía anon):
`security_invoker` en 15 vistas, buckets a privados, y drop de la política de `portal_rates` →
todo de vuelta a su estado original. **Tier 2 real:** hay que portar el proxy de signed URLs
(`app/api/limpiadoras/photo/route.ts`, ya en este repo) al repo **`ialimp`** y auditarlo antes de
cerrar buckets/vistas. El bucket `cleaning-photos` sigue **público**.
