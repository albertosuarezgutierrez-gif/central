---
name: sivra-maestro
description: >
  Router de contexto de la vertical SIVRA (intranet de pisos turísticos en Sevilla;
  package.json `roi-intranet`). NO duplica los docs: dice qué existe, dónde vive y qué
  NO romper antes de tocar nada. USAR SIEMPRE que Alberto pida cualquier cosa de sivra:
  ingresos/gastos, pricing dinámico, mensajería con huéspedes, limpiadoras (las de ESTE
  repo), agente IA, Smoobu, o dudas de arquitectura/despliegue de sivra. Sin secretos:
  solo nombres de variable.
---

# SIVRA — router de contexto

> Esto es un **índice/puente**, no una copia. La fuente de verdad es
> `apps/sivra/CLAUDE.md` y los docs apuntados abajo. Si algo de aquí contradice
> al código o a `CLAUDE.md`, manda el código: corrige este router en el mismo commit.

> **⚠️ ESTADO (21/06/2026): la gestión INTERNA de sivra se consolidó (casi del todo) en `apps/plataforma`.**
> Finanzas, mensajería, limpiadoras, agente IA, el motor de pricing y **los crons de negocio** viven ya en
> **plataforma** (`/sivra/*`, `/api/sivra/*`; `apps/plataforma/vercel.json`). `apps/sivra/vercel.json`
> solo conserva **1 cron** (`/api/seo-refresh` semanal). **Para cualquier feature/fix interno → trabaja en `apps/plataforma`, NO aquí.**
> **Excepción (consolidación parcial):** `/api/pricing/aplicar-propuesta` y `/api/pricing/pisos-zona`
> —el raíl que usa el **agente de pricing** (skill `pricing-agente`)— **siguen SOLO en sivra**
> (`housesevillana.vercel.app`); no se portaron. Razón extra para no apagar sivra.
>
> **🚫 `apps/sivra` NO se borra (decisión de Alberto).** Se mantiene SOLO como **web pública de reserva
> directa de House Sevillana** (`housesevillana.es`/`.vercel.app`: landing multidioma `app/[locale]`, SEO
> `sitemap.ts`/`robots.ts`/schema), que **no está replicada en plataforma**. La "Fase 2 destructiva"
> (redirigir dominio, borrar app/proyecto Vercel/env `SIVRA_URL`) queda **CANCELADA**. Detalle en
> `apps/sivra/CLAUDE.md` y `docs/CONTEXTO-SESIONES.md`.
>
> **Limpiadoras reales = ialimp (Sique Brilla).** Verificado contra la BD (21/06/2026): las 16 limpiadoras
> y las 36 sesiones/90d son 100% de Sique Brilla SL. El `app/limpiadoras/` de sivra no tiene usuarias reales.

## Antes de tocar nada (gate obligatorio)
1. Lee `apps/sivra/CLAUDE.md` — reglas para no romper (se carga solo si trabajas en el dir).
2. Identifica el objetivo y en qué módulo cae (finanzas / pricing / limpiadoras / mensajería / IA).
3. Comprueba la **frontera de BD compartida** (abajo) antes de cualquier cambio de BD/RLS/buckets.
4. Si tocas SQL: verifica contra Supabase real, **no solo `tsc`** (la mayoría de tablas no están en Prisma).

## Dónde vive cada cosa
| Tema | Fuente |
|---|---|
| Reglas y gotchas del repo | `apps/sivra/CLAUDE.md` |
| Pricing dinámico (producto a vender) | `apps/sivra/docs/pricing-automatico.md` |
| Contabilidad — separación de cuentas (BBVA vs Kutxa, 3 pisos vs personal) | `apps/sivra/docs/contabilidad.md` |
| Seguridad de BD (qué se aplicó / qué se revirtió) | `apps/sivra/docs/auditoria-seguridad.md` |
| Estado vivo del proyecto | `docs/CONTEXTO-SESIONES.md` (entradas de arriba) |
| Estructura del monorepo | `MATRIZ.md` |

## Agente de mensajería con huéspedes (Fase 1 — propone, Alberto aprueba)
Vive en **`apps/plataforma/lib/sivra/agente-huesped/*`** (NO en sivra). Responde mensajes de huéspedes de
Smoobu (Booking/Airbnb/directo, todos por igual). **Flujo:** sondeo `GET /api/sivra/mensajes/auto-reply`
(cron) + webhook en tiempo real (`/api/sivra/mensajes/webhook`) → `procesarMensajeHuesped` → `contexto.ts`
(ficha oficial de Smoobu) → `decidir.ts` → **propone por Telegram** con botones; Alberto da ✅ Enviar /
✏️ Modificar / 🔧 Retocar / "✅ Aprobar y a partir de ahora solas" (graduación). Aprende de OK/correcciones.
- **✏️ Modificar vs 🔧 Retocar (25/06/2026, PR #514):** *Modificar* (`hsp_edit`) reescribe el mensaje ENTERO
  (escribes el texto final). *Retocar* (`hsp_tune`) aplica una INSTRUCCIÓN corta sobre el borrador existente
  ("añade que la cafetera es italiana") vía `retoque.ts` (`aplicarRetoque`, IA sobre el borrador que ya está
  en el idioma del huésped → resultado en su idioma sin traducir aparte). El agente **aprende el par
  pregunta→respuesta** (`mensajes_pendientes_tg.pregunta` + `esperando_retoque`); el aprendizaje Q→A vale
  también para Modificar/aprobación (antes guardaba `pregunta=''`).
  - **Bucle de re-borrador (26/06/2026, PR pendiente):** Modificar y Retocar **YA NO envían directo**.
    Tras aplicar el cambio, el agente **re-propone** el texto FINAL (`reproponerBorrador` en `telegram-msg.ts`:
    en el idioma del huésped + `🔁` español para verificar) con botones ✅/✏️/🔧 y mantiene el pendiente;
    **solo el botón ✅ Enviar manda al huésped**. Así Alberto ve SIEMPRE lo que sale (incluida la traducción
    de su respuesta es→idioma del huésped) y puede **encadenar varias vueltas**. Decisión de Alberto.
- **Contexto del hilo (`decidir.ts` + `hilo.ts` — 26/06/2026, PR pendiente):** antes de redactar, el agente
  recibe el **hilo de la conversación** (`hiloComoMensajes`: últimos 15 mensajes, ambos lados, huésped=user /
  anfitrión=assistant) como mensajes previos a `aiComplete`, además de ficha+guía+aprendizajes. Regla añadida:
  "continúa la conversación, NO repitas lo ya dicho". Mejora también el auto-envío (mismo motor). Antes el
  hilo se cargaba pero NO se le pasaba a la IA (solo se usaba para el guardrail).
- **Estilo de respuesta (`decidir.ts`, system prompt — 24/06/2026):** **REGLA DE ORO**: responde EXACTAMENTE
  a lo que el huésped dice y a nada más. NO añadir info no pedida (horarios entrada/salida, normas, parking,
  wifi…) salvo que pregunte o sea necesaria; **el huésped ya está dentro → NO repetir check-in/check-out salvo
  pregunta expresa**. Longitud **adaptada al mensaje**: agradecimiento/comentario positivo → 1-2 frases cálidas;
  pregunta real → el detalle necesario. Tono de persona real, no folleto. (Antes forzaba "4-6 frases" en TODA
  respuesta → rellenaba con horarios; lo detectó Alberto en el borrador a Patrycja. PR #505.)
- **`horarios.ts` (fuente de verdad de horas):** Smoobu graba la hora de check-in POR RESERVA y queda
  desfasada → override por piso: **todos 15:00 salvo Busto Reform 13:00; salida 11:00**. Fallback a Smoobu
  si el piso no está en la tabla. Mantener esta tabla cuando cambien horarios.
- **Early check-in (`disponibilidad.ts`):** es **GRATIS** pero SOLO si la **noche anterior está libre**
  (`nocheAnteriorLibre`; ojo a una reserva que sale el MISMO día → víspera ocupada). `contexto.ts` lo
  consulta en Smoobu (`earlyCheckinPosible`) y `decidir.ts` lo aplica. **Nunca se ofrece de pago.**
  Late check-out → `needs_human` (lo decide Alberto).
- **Parking (`parking.ts` — 25/06/2026, PR #527):** los pisos NO tienen plaza propia disponible ("nuestro
  parking está ocupado"). Cuando el huésped pregunta por aparcamiento, el agente se disculpa y recomienda 4
  parkings públicos cercanos del centro con teléfono+web: **José Laguillo/AUSSA, Escuelas Pías, Imagen,
  Plaza de la Concordia/SABA**. La constante `PARKINGS_CERCANOS`+`bloqueParking()` se inyecta en la **`ficha`**
  (`contexto.ts`), NO solo en el prompt: así el guardrail anti-invención (`contieneDatoInventado`, valida
  teléfonos/URLs contra las fuentes) NO escala a humano. `parking` ya está en la allowlist de graduación →
  auto-enviable. Si cambian los parkings/teléfonos, edita `parking.ts`.
- **Equipaje/consigna (`equipaje.ts` — 26/06/2026, PR #538 + por-zona):** MISMO patrón que el parking. El piso
  NO tiene servicio de consigna/guardado de maletas; cuando preguntan dónde dejar/guardar las maletas, el agente
  se disculpa y recomienda consignas cercanas. **`bloqueEquipaje(propertyId)` es POR ZONA:** redes para todos
  (`CONSIGNAS_RED`: Radical Storage, Bounce, LOCK & enjoy!) **+ punto/s físico/s 24/7 de la zona del piso, el más
  cercano primero** (`CONSIGNA_POR_ZONA` ahora es `Consigna[]` por zona / `zonaDePiso`): zona **busto** (House
  Sevillana=C/ Socorro 24, Busto Reform y Luxury Busto=C/ Bustos Tavera, todos 41003) → *Lock & Explore – Castellar*
  (C/ Castellar 60A, el MÁS CERCANO) y, como alternativa, *Locker in the City – Alfalfa*; zona **duplex** (Dúplex
  Center=Pasaje Francisco Molina/C. Martín Villa, La Campana) → *Locker in the City – Plaza del Duque*. Los 4 son
  41003 (junto a Encarnación/Las Setas), a minutos entre sí. Inyectado en la **`ficha`** (`contexto.ts`, pasa `propertyId`),
  guardrail-safe. Categoría `equipaje` en `reglas.ts::detectCategory` **ANTES que checkout** (porque "dejar las
  maletas" contiene "dejar" = patrón de checkout) y en la allowlist de graduación.
- **Idioma:** al huésped se le responde SIEMPRE en su idioma; a Alberto (Telegram) se le traduce al español
  con línea **🔁** (pregunta + borrador). Si Alberto **modifica**, escribe en español y se traduce al idioma
  del huésped antes de enviar (`mensajes_pendientes_tg.idioma`).
- **Idempotencia:** `claveDedup` + `claimMensaje` (atómico) → no reprocesa/duplica entre sondeo y webhook.
- **Graduación:** solo categorías básicas (`graduacion.ts` allowlist: wifi/acceso/checkin/checkout/parking/
  normas/contacto/faq); quejas/dinero/cambios NUNCA se auto-envían.
- **maxDuration = 300** en `auto-reply` y `webhook` (decisión + 2 traducciones en `Promise.all`; con 60s daba 504).
- Sin asunto fijo (`enviarAlHuesped` no manda "Re: tu estancia"). Detalle vivo en `docs/CONTEXTO-SESIONES.md`.

## Infra (sin secretos — nombres de variable)
- **Supabase** `wswbehlcuxqxyinousql` (schema `public`) — **COMPARTIDA con ialimp y plataforma**.
- **Prisma** con conexión directa (`DATABASE_URL`/`DIRECT_URL`); auth NextAuth v5 (admin) + cookie
  `limpiadora_token`. IA por `lib/ai-client.ts` → **pasarela central de plataforma** (`aiComplete`+`aiExtractInvoice` OCR+`aiSearch` web; envs `AI_GATEWAY_URL`+`AI_GATEWAY_SECRET`, fallback NIM directo). `seo-refresh` migró a `aiSearch`→`gatewaySearch`/Gemini (16/06/2026) → **sin Anthropic**. Deploy Vercel; `vercel.json` de sivra solo tiene **1 cron** (`/api/seo-refresh` semanal) — los ~18 crons de negocio se migraron a plataforma (#348, rutas `/api/sivra/*`), NO re-programar en sivra.
- Envs: `NEXTAUTH_SECRET/URL`, `SMOOBU_API_KEY`, `NVIDIA_API_KEY`, `SERPER_API_KEY`,
  `GMAIL_USER/GMAIL_APP_PASSWORD`, `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `CRON_SECRET`, `DRIVE_SCRIPT_URL`,
  `AUTH_TRUST_HOST=true` (local). Valores en Vercel env, nunca en repo.

## Landmines (no romper — detalle en CLAUDE.md)
- 🚨 **BD compartida con ialimp** (app real de limpiadoras, lee con anon key en cliente): **NO**
  toques RLS, `security_invoker`, privacidad de buckets ni GRANTs asumiendo que solo sivra usa la BD.
- **Prisma ≠ BD real**: el schema modela 5 tablas; la BD tiene 90+. El módulo limpiadoras va por SQL crudo.
- **Dos tablas de propiedades**: `properties` (5 filas, Prisma, `smoobuId`) vs `propiedades` (106, multi-tenant). No confundir.
- `app/limpiadoras/` de ESTE repo sirve a `sivra-app`/`housesevillana`, **no** a las limpiadoras reales (esas son ialimp).
- Bucket `cleaning-photos` sigue **público**; cerrar buckets/vistas requiere portar antes el proxy de signed URLs a ialimp.

## Frontera multi-tenant
Es intranet de los pisos de Alberto, pero la BD es compartida y multi-tenant para el módulo limpiadoras
(`empresa_id`). Cualquier cambio transversal de BD se valida también contra ialimp (ver `auditoria-central`).
