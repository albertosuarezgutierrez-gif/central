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
- **Contexto del hilo (`decidir.ts` + `hilo.ts` — 26/06/2026):** antes de redactar, el agente
  recibe el **hilo de la conversación** (`hiloComoMensajes`: últimos 15 mensajes, ambos lados, huésped=user /
  anfitrión=assistant) como mensajes previos a `aiComplete`, además de ficha+guía+aprendizajes. Regla:
  "continúa la conversación, NO repitas lo ya dicho". Mejora también el auto-envío (mismo motor).
- **🔑 Respuesta en TEXTO PLANO, no JSON (`decidir.ts` — 26/06/2026, PR #547):** el agente genera el mensaje al
  huésped como texto plano (con el hilo como contexto → las reglas SIEMPRE se aplican) y deriva el escalado
  / sentimiento / `requiere_respuesta` APARTE, de REGLAS (`esSensible`, regex, `esCierre`) + un clasificador
  de **UNA palabra** (`ESCALAR/OK`, `debeEscalar`). **Por qué:** antes pedía un único JSON
  `{reply,confidence,needs_human,…}`; cuando el modelo gratis (Llama 3.3 70B) fallaba al emitir JSON (pasaba
  hasta con un "Hola"), caía a un fallback que IGNORABA todo el system prompt y soltaba texto crudo →
  borradores genéricos, sin contexto y sin reglas ("IA sin JSON — revisa el borrador"). Como TODAS las reglas
  (incl. el contexto del hilo de #535) vivían dentro del contrato JSON, un fallo de formato las anulaba → de
  ahí el "sigue sin tener contexto" de Alberto. Sin JSON ese fallo ya no puede vaciar el contexto. El
  guardrail anti-invención (`contieneDatoInventado`) sigue corriendo sobre el texto generado.
- **Modelo del agente (`decidir.ts` — 06/07/2026):** por defecto usa el modelo por defecto de la pasarela
  (`meta/llama-3.3-70b-instruct`, con su cadena NIM→Groq→Gemini→Kimi). **`AGENTE_HUESPED_MODEL` está VACÍO por
  defecto** (antes `meta/llama-3.1-405b-instruct`, que NVIDIA RETIRÓ de NIM → `HTTP 404` en CADA mensaje;
  enmascarado por el reintento con el 70B, hasta el día que el 70B también cayó → "IA no disponible" a un
  huésped). Si se quiere un modelo más capaz, poner en `AGENTE_HUESPED_MODEL` un id **verificado vivo en NIM**:
  si está puesto se intenta primero y es ADITIVO (si falla, reintenta con el 70B; nunca deja sin respuesta).
- **Estilo de respuesta (`decidir.ts`, system prompt — 24/06/2026):** **REGLA DE ORO**: responde EXACTAMENTE
  a lo que el huésped dice y a nada más. NO añadir info no pedida (horarios entrada/salida, normas, parking,
  wifi…) salvo que pregunte o sea necesaria. Longitud **adaptada al mensaje**: agradecimiento/comentario
  positivo → 1-2 frases cálidas; pregunta real → el detalle necesario. Tono de persona real, no folleto.
  (Antes forzaba "4-6 frases" en TODA respuesta → rellenaba con horarios; lo detectó Alberto en el borrador
  a Patrycja. PR #505.)
- **Fase temporal (`decidir.ts` — 30/06/2026, PR #607):** el system prompt detecta en qué fase está la
  reserva comparando la fecha de hoy (hora Madrid) con `checkIn`/`checkOut`:
  - **Pre-llegada** (`hoy < checkIn`): "el huésped AÚN NO HA LLEGADO — oriéntale sobre acceso/hora de entrada".
  - **En-estancia** (`checkIn ≤ hoy ≤ checkOut`): "el huésped ya está dentro — NO repetir horarios salvo que pregunte".
  - **Post-estancia** (`hoy > checkOut`): "el huésped ya hizo CHECK-OUT — si agradece o se despide, responde
    con calidez agradeciendo que eligió el apartamento; NO menciones horarios ni info operativa".
  Antes estaba hardcodeado "ya está dentro" para TODAS las reservas → generaba borradores inapropiados
  (p.ej. "¡Disfruta tu estancia!" para un huésped que ya se había ido 2 días antes).
- **`horarios.ts` (fuente de verdad de horas):** Smoobu graba la hora de check-in POR RESERVA y queda
  desfasada → override por piso: **todos 15:00 salvo Busto Reform 13:00; salida 11:00**. Fallback a Smoobu
  si el piso no está en la tabla. Mantener esta tabla cuando cambien horarios.
- **Early check-in (`disponibilidad.ts`):** es **GRATIS** pero SOLO si la **noche anterior está libre**
  (`nocheAnteriorLibre`; ojo a una reserva que sale el MISMO día → víspera ocupada). `contexto.ts` lo
  consulta en Smoobu (`earlyCheckinPosible`) y `decidir.ts` lo inyecta **SOLO en fase pre-llegada**
  (en-estancia y post-estancia lo omite). **Nunca se ofrece de pago.**
- **Late check-out (`disponibilidad.ts`/`decidir.ts` — 19/07/2026, PR #1015):** dejó de ser un "lo
  consulto y te digo" a ciegas — función espejo **`entradaMismoDiaLibre`** (¿entra otro huésped el
  MISMO día de la salida? si entra, hace falta turnover: limpieza + la siguiente entrada), consultada
  en Smoobu igual que el early check-in (`lateCheckoutPosible`/`lateCheckoutChequeado` en `contexto.ts`).
  **SIEMPRE escala a Telegram** — `esSolicitudLateCheckout` (`reglas.ts`) fuerza `needs_human=true`
  con independencia de si el borrador ya responde bien, porque el objetivo es que el borrador que le
  llega a Alberto YA traiga la respuesta correcta (calendario real), no automatizar el envío. Si toca
  declinar, el borrador sugiere la consigna de equipaje (`bloqueEquipaje`, ya en la ficha) como
  alternativa.
- **Matiz "firme solo el mismo día" (19/07/2026, PR #1015):** tanto early check-in como late check-out
  solo confirman EN FIRME si hoy es el día del hecho (llegada/salida respectivamente). Preguntado con
  antelación y sin conflicto detectado, el borrador matiza "en principio sí, se confirma ese mismo
  día" — una reserva de última hora puede ocupar el hueco entre la respuesta y el día en cuestión.
  Motivado por un caso real (Luxury Busto, huésped preguntó 5 días antes de la salida; el borrador
  antiguo decía "voy a consultarlo con el anfitrión" sin resolver nada). Detalle completo: spec
  `docs/superpowers/specs/2026-07-19-late-checkout-early-checkin-antelacion-design.md`.
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
