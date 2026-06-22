# Agente de respuesta a huéspedes (SIVRA) — Diseño

> Fecha: 2026-06-22 · Vertical: `apps/plataforma` (mensajería interna de sivra) · Estado: aprobado para planificar

## 1. Objetivo

Un **agente IA que responde los mensajes de los huéspedes** de los pisos turísticos casi sin
trabajo manual de Alberto. Hoy existe una mensajería a medias (lee hilos de Smoobu, clasifica,
genera una sugerencia que Alberto envía a mano, y un cron que responde por email suelto). Se quiere
convertir eso en un **agente real**:

1. **Reacciona en tiempo real** a cada mensaje entrante del huésped.
2. **Se nutre de la información que ya existe** (la URL personal del huésped de Smoobu + datos de la
   API + búsqueda web), no de un prompt con datos a fuego.
3. **Híbrido con control:** responde solo lo seguro; lo dudoso/delicado lo **propone por Telegram**
   y Alberto **acepta o modifica** desde el móvil.
4. **Aprende** de las correcciones de Alberto y mejora con el tiempo (incluida la propia guía).
5. **Arranca en revisión total** y gradúa a **autónomo por categoría** según el % de acierto.

## 2. Contexto existente que se reutiliza (no se reinventa)

| Pieza | Dónde | Uso en el agente |
|---|---|---|
| Lista de hilos + clasificación | `app/api/sivra/mensajes/route.ts` | Clasificación trivial/info/importante (regex) |
| Historial de un hilo | `app/api/sivra/mensajes/[bookingId]/route.ts` | Contexto de conversación + email/nombre huésped |
| Generación de respuesta IA + reglas | `app/api/sivra/mensajes/reply/route.ts` | Núcleo a refactorizar (reglas early/late, parking, IA) |
| Cron auto-reply diario | `app/api/sivra/mensajes/auto-reply/route.ts` | Pasa a **red de seguridad** del webhook |
| Base de conocimiento | `app/api/sivra/mensajes/knowledge/route.ts` + tabla `knowledge_base` | Se reaprovecha como **ficha por piso** (plan B / override) |
| Clave Smoobu | `lib/smoobu.ts` (`getSmoobuKey()`, tabla `pms_connections`) | Llamadas a la API de Smoobu |
| Pasarela IA | `@central/core-ai` (`aiComplete`) + `/api/ai/search` (Gemini) | Redacción + búsqueda web de recomendaciones |
| Telegram | `lib/telegram.ts` (`tgAlert`, `tgAlertButtons`) + patrón webhook de ia-rest (`tgAnswerCallback`, `tgEditMessage`) | Se **consolida en el paquete nuevo `@central/core-telegram`** (un solo bot) |
| Aviso a limpiadoras | `lib/limpiadoras-early.ts` (`registrarAvisoHuesped`) | Acción de un toque en early/late check-in |
| Crons + auth | `vercel.json` + `lib/cron-auth.ts` (`CRON_SECRET`) | Red de seguridad protegida |

## 3. Decisiones tomadas (Q&A con Alberto)

- **Autonomía:** **híbrida**. Auto-responde lo seguro (con fuente); lo delicado se propone y se aprueba.
- **Canal humano:** **Telegram**. El agente propone → botones **✅ Aceptar y enviar** / **✏️ Modificar**.
  Modificar = Alberto responde con su texto (vía `force_reply`) → se envía al huésped **y se aprende**.
  Alberto **no quiere otro canal de aviso** (ya recibe push de Booking/Smoobu/email).
- **Telegram = un solo bot + módulo compartido** (decisión de Alberto: "usa el mismo, ya es un proyecto
  vertical para todo… un módulo telegram y ahí se mete todo"). Se crea el paquete **`@central/core-telegram`**
  (como `core-push`/`core-email`) que centraliza enviar/botones/editar/responder + helpers de webhook, con
  **un único `TELEGRAM_BOT_TOKEN`** para todo el monorepo. Los `lib/telegram.ts` duplicados (ia-rest,
  plataforma, sivra) migran a él. **Restricción Telegram:** un bot tiene **un solo webhook** → debe haber
  **un receptor único** que enruta por prefijo de `callback_data` (`hsp_…` para este agente). Si el bot ya
  tiene su webhook en ia-rest, el plan decide dónde vive el receptor único (preferible en plataforma, "el
  proyecto para todo") y enruta a cada vertical.
- **Fuente de conocimiento (por prioridad):**
  1. **Contenido de la URL personal de la reserva** (`guest-app-url`), **leído con IA**. Es "lo que
     Smoobu ya le manda al huésped" (WiFi, acceso, parking, normas, dejar maletas…).
  2. **Hechos estructurados de la API** (`/api/apartments/{id}` + reserva): dirección, lat/lng,
     amenities, fechas, idioma, portal.
  3. **Recomendaciones** ("qué hacer en Sevilla", restaurantes) → **búsqueda web en vivo** (Gemini),
     centrada en las coordenadas del piso. No se mantiene nada a mano.
  4. **Ficha por piso editable** → **solo red de seguridad/override** (si la URL no se puede leer o
     se quiere forzar un dato). Sustituye al WiFi/teléfono hardcodeado del `reply` actual.
- **Arranque por fases:** **Fase 1** todo lo no-trivial pasa por Telegram para OK (aprende viendo
  corregir). **Fase 2** las categorías con alto acierto pasan a auto-envío; lo sensible siempre pide OK.
- **Extras incluidos (los cuatro):** anti-invención, auto-mejora de la guía, escudo de reseñas,
  upsell + botones Telegram + resumen diario.

## 4. Hallazgo clave sobre la API de Smoobu (investigado 2026-06-22)

- **`POST /api/reservations/{id}/messages/send-message-to-guest`** (`{subject, messageBody}`, header
  `Api-Key`) → **sí permite responder dentro del hilo** del huésped (llega a Airbnb/Booking/email).
  Hoy el código responde por email suelto; se cambia a esto.
- **Webhook `newMessage`** (sender=`guest`, trae booking ID) → permite **tiempo real**. Hoy no hay
  receptor (todo polling). Se configura la URL en los ajustes de API de Smoobu.
- **La Guía del Huésped NO está como datos en la API.** `/api/apartments/{id}` solo da `location`
  (calle/CP/ciudad/país/lat/lng), `timeZone`, `rooms`, `equipments`, `currency`, `price`, `type`.
  El contenido rico (WiFi, parking, "qué hacer") vive **solo** en la web `guest.smoobu.com/?t=…&b=…`
  → por eso la fuente principal es **leer esa URL con IA**, no un endpoint de campos.
- **Detalle técnico a verificar — PASO 1 de implementación (sondeo de solo lectura):** si la página de
  `guest-app-url` es **HTML servido** (se lee y se limpia directo) o **app JS** (hay que pedir su
  endpoint interno de datos). **No se puede comprobar desde el contenedor de desarrollo**: es efímero,
  **sin `SMOOBU_API_KEY` y sin salida de red** (todo egress da 403). La única forma de "mirarlo en la
  API real" es **ejecutar en Vercel**, donde viven la key y la red. Por eso el primer entregable es un
  endpoint/script **de solo lectura** (`GET /api/sivra/mensajes/diagnostico-guia`, protegido) que: coge
  una reserva, vuelca su JSON + el de `/api/apartments/{id}`, descarga la `guest-app-url` y reporta
  content-type y si trae texto o es cascarón JS. Eso decide cómo se implementa `guia.ts`. Si no se
  pudiera extraer → cae a la **ficha por piso** (plan B), nunca se queda a ciegas.

## 5. Arquitectura

Todo en `apps/plataforma`, bajo la mensajería de sivra que ya existe.

```
POST /api/sivra/mensajes/webhook        (receptor Smoobu newMessage, verificación de secret)
  └─ lib/sivra/agente-huesped.ts        (ORQUESTADOR)
       ├─ contexto.ts     → reúne reserva + guía (caché) + historial + aprendizajes + hechos API
       ├─ guia.ts         → descarga guest-app-url, extrae texto, cachea por piso (mensajes_guia_cache)
       ├─ recomendar.ts   → búsqueda web (Gemini) grounded en lat/lng del piso
       ├─ reglas.ts       → reglas deterministas (early/late check-in, parking) — portadas del reply actual
       ├─ decidir.ts      → IA con grounding → {reply, confidence, needs_human, motivo, categoria, sentimiento}
       ├─ guardrail.ts    → anti-invención: bloquea datos no presentes en fuentes
       ├─ enviar.ts       → send-message-to-guest (responder en el hilo de Smoobu)
       └─ aprender.ts     → registra log + correcciones (mensajes_log, mensajes_aprendizaje, gaps de guía)

POST /api/sivra/mensajes/telegram-webhook  (callbacks: aceptar/modificar/conceder; force_reply de modificación)
GET  /api/sivra/mensajes/auto-reply        (cron EXISTENTE → red de seguridad: procesa lo que el webhook perdió)
GET  /api/sivra/mensajes/resumen-diario    (cron nuevo → resumen por Telegram)
```

El `reply/route.ts` actual se **refactoriza**: su lógica de reglas/IA se extrae a `reglas.ts` +
`decidir.ts` para que la usen tanto el webhook (automático) como la UI (sugerencia manual). La página
`/sivra/mensajes` sigue como bandeja/historial; la aprobación en vivo es por Telegram.

## 6. Fuente de conocimiento — detalle

**Guía (`guia.ts`):** dado el `guest-app-url` de la reserva, descarga el contenido, lo limpia
(strip HTML, reutilizable del `[bookingId]/route.ts`) y lo **cachea por `property_id`** (no por
reserva: el texto es del piso aunque la URL sea por reserva) en `mensajes_guia_cache`, con `fetched_at`
y TTL (~7 días). Si la extracción falla → marca el piso como "sin guía leída" y usa la ficha (plan B).

**Hechos API:** `/api/apartments/{id}` (cacheable, cambia poco) + la reserva. Aportan dirección,
**lat/lng** (para las recomendaciones), amenities, fechas, idioma.

**Recomendaciones (`recomendar.ts`):** solo cuando la categoría es "recomendación/qué hacer". Llama a
la búsqueda web (Gemini) con la zona del piso. No se cachea como conocimiento (siempre fresco).

**Ficha por piso (override / plan B):** la tabla `knowledge_base` existente se reutiliza para que
Alberto pueda fijar/forzar datos (un teléfono, una norma nueva) que ganan a la guía.

## 7. Motor de decisión y compuerta de confianza (`decidir.ts`)

El modelo recibe el contexto (guía + hechos + historial + aprendizajes) y devuelve JSON:
`{ reply, confidence (0-1), needs_human (bool), motivo, categoria, sentimiento }`.

**Siempre escala (needs_human, nunca auto-envío)** si: categoría sensible (queja, dinero/reembolso,
cambio de fechas, emergencia), `sentimiento` negativo, o el guardrail detecta que la respuesta usa un
dato que **no está en las fuentes**. En esos casos se propone por Telegram con el motivo.

**Auto-envío** solo si: `needs_human=false` + categoría habilitada para auto (Fase 2) + `confidence`
sobre el umbral + pasa guardrail. En Fase 1 todo lo no-trivial se propone igualmente.

**Anti-invención (`guardrail.ts`):** si la respuesta contiene cifras/códigos/teléfonos/precios que no
aparecen literalmente en las fuentes → se bloquea el auto-envío y se escala. El prompt además ordena
"si no está en la información, no lo inventes: dilo y escala".

## 8. Canal Telegram (propuesta / aprobación)

**Módulo compartido `@central/core-telegram` (un solo bot).** Se crea el paquete (fuente TS pura,
como `core-push`/`core-email`) con `tgAlert`, `tgAlertButtons`, `tgAnswerCallback`, `tgEditMessage`,
`tgAskForReply` (force_reply) y un helper de verificación de webhook. Usa un único `TELEGRAM_BOT_TOKEN`.
Los `lib/telegram.ts` de ia-rest/plataforma/sivra pasan a re-exportar de este paquete (migración
incremental; este agente ya nace sobre el módulo).

**Un bot = un webhook.** El receptor de callbacks de Telegram es **único** y enruta por prefijo de
`callback_data`. Para este agente el prefijo es `hsp_`. Flujo:

- Propuesta: `tgAlertButtons` con la pregunta del huésped + el borrador + botones:
  - **✅ Aceptar y enviar** (`hsp_send:<bookingId>`) → `enviar.ts` → marca respondido + log.
  - **✏️ Modificar** (`hsp_edit:<bookingId>`) → el bot pide texto con **`force_reply`**; el
    `telegram-webhook` capta la respuesta ligada a ese booking → envía el texto de Alberto al huésped
    **y** lo guarda como corrección (`aprender.ts`).
  - **🔘 Acciones contextuales** cuando aplica: p.ej. en late-checkout sin reserva ese día,
    **Conceder** (`hsp_grant_late:<bookingId>`) responde concediéndolo y avisa a la limpiadora
    (`registrarAvisoHuesped`). Reutiliza `getNextCheckin`/`getPrevCheckout` del reply actual.
- Verificación del webhook por `X-Telegram-Bot-Api-Secret-Token` (`TELEGRAM_WEBHOOK_SECRET`).

## 9. Aprendizaje (memoria = BD, patrón del agente de pricing)

- **`mensajes_log`** (tabla nueva): por cada mensaje procesado — `booking_id`, `property_id`,
  `categoria`, `pregunta`, `respuesta`, `fuente` (guia/api/web/regla/ia), `confidence`, `sentimiento`,
  `auto_sent` (bool), `edited` (bool), `created_at`. Base para medir acierto y subir umbrales por
  categoría (Fase 2) y para el resumen diario.
- **`mensajes_aprendizaje`** (tabla nueva): cuando Alberto **modifica** un borrador o responde a un
  escalado — `property_id`, `categoria`, `pregunta_norm`, `respuesta_final`, `created_at`. Se inyectan
  como ejemplos (few-shot) para esa propiedad/categoría en futuras respuestas.
- **Auto-mejora de la guía — `mensajes_guia_gaps`** (tabla nueva): cuando el agente escala **por falta
  de info en la guía**, registra el hueco (`property_id`, `pregunta`, `veces`, `ultima_fecha`). El
  resumen diario por Telegram avisa: "tu guía no cubre X (preguntado N veces)".

## 10. Extras (los cuatro aprobados)

- **🛡️ Anti-invención:** §7 (`guardrail.ts`). Casi obligatorio para el modo autónomo.
- **📈 Auto-mejora de la guía:** §9 (`mensajes_guia_gaps`). El agente te dice qué le falta a la guía.
- **⭐ Escudo de reseñas:** `decidir.ts` calcula `sentimiento`; negativo/queja → **escalado URGENTE**
  por Telegram con una **acción de recuperación sugerida** (disculpa + ofrecimiento), antes de que sea
  mala reseña.
- **💶 Upsell + botones + resumen diario:** ante early check-in/late checkout/servicios, el borrador
  puede **ofrecer la opción de pago** (enlace al módulo "adquirir ítems" de Smoobu / guest-app).
  Botones de acción de un toque en Telegram (§8). Cron `resumen-diario` → "Hoy: N mensajes · X auto ·
  Y te esperan · gaps de guía".

## 11. Modelo de datos (Supabase compartida — ver §14)

Cambios **solo aditivos** (tablas nuevas; ninguna alteración de tablas de ialimp). Validar contra
Supabase real (no Prisma).

- `mensajes_guia_cache` — `property_id` (PK), `contenido` text, `fetched_at`, `fuente_url`.
- `mensajes_log` — ver §9.
- `mensajes_aprendizaje` — ver §9.
- `mensajes_guia_gaps` — ver §9.
- `mensajes_auto_config` — `categoria` (PK), `auto_enabled` bool, `umbral` numeric. Controla la
  graduación Fase 1 → Fase 2 por categoría sin redeploy.
- Se **reutiliza** `mensajes_status` (estado por booking) y `knowledge_base` (ficha/override).

## 12. Disparo (webhook + red de seguridad)

- **Webhook Smoobu `newMessage`** → `POST /api/sivra/mensajes/webhook`. Verifica un secret/origen,
  ignora mensajes que no sean `sender=guest`, e idempotencia por id de mensaje (no reprocesar).
- **Cron existente `auto-reply`** (6:00) → **red de seguridad**: procesa mensajes sin responder que el
  webhook se perdiera. Misma lógica del orquestador, no duplicada.

## 13. Variables de entorno (Vercel proyecto `plataforma`)

| Variable | Uso | Nota |
|---|---|---|
| `SMOOBU_API_KEY` / tabla `pms_connections` | API Smoobu | ya existe |
| `NVIDIA_API_KEY` / `GROQ_API_KEY` / `GEMINI_API_KEY` | redacción IA + búsqueda web | ya existen |
| `CRON_SECRET` | red de seguridad + resumen diario | ya existe |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | propuesta/aprobación | **mismo bot que ia-rest** (vía `@central/core-telegram`); a añadir en plataforma |
| `TELEGRAM_WEBHOOK_SECRET` | verificación del callback de Telegram | **a añadir** (mismo valor donde viva el receptor único) |
| `SMOOBU_WEBHOOK_SECRET` | verificación del webhook newMessage (si Smoobu lo soporta; si no, validación por origen/token) | **a añadir** |

Sin secretos en el repo (solo nombres). **Bot único** para todo el monorepo (decisión de Alberto);
los distintos avisos se distinguen por prefijo de `callback_data` y por el texto del mensaje.

## 14. Avisos / landmines (no romper)

- **BD COMPARTIDA con ialimp** (`wswbehlcuxqxyinousql`): cambios **solo aditivos** (tablas nuevas).
  **NO** tocar RLS, `security_invoker`, buckets ni GRANTs. Verificar contra Supabase real.
- **El raíl de pricing sigue solo en sivra** — esto es solo mensajería, no se toca pricing.
- **Idempotencia:** el webhook puede llegar duplicado → dedup por id de mensaje; el envío a Smoobu no
  debe repetirse si ya se respondió (`mensajes_status`/`mensajes_log`).
- **No depender del scraping del Guest Portal** como única fuente: si falla la extracción, ficha plan B.
- **Respetar lo programado de Smoobu:** no duplicar sus mensajes automáticos (el agente es reactivo).

## 15. Verificación

- `npx tsc --noEmit` + `npx next build` en `apps/plataforma` (el build de Vercel, no solo `tsc`).
- SQL validado contra Supabase real.
- Tests `node --test` de las libs puras: `guardrail.ts` (detección de dato inventado), `decidir.ts`
  (clasificación de categoría sensible/sentimiento con fixtures), `reglas.ts` (early/late/parking),
  extracción de guía (HTML → texto).
- **Paso 1: sondeo de solo lectura en Vercel** (§4) para confirmar qué devuelve `guest-app-url`
  (HTML vs app JS) y qué campos reales trae la reserva/apartamento. No es posible desde el contenedor
  de desarrollo (sin key, sin egress). Define cómo se escribe `guia.ts`.
- **Arranque conservador:** Fase 1 = todo lo no-trivial a Telegram; el auto-envío por categoría se
  activa solo cuando `mensajes_log` muestra alto acierto.

## 16. Fuera de alcance (por ahora)

- Mensajes **proactivos** programados (lo cubre Smoobu; evitar duplicar).
- Memoria de huésped repetido (poco frecuente en alquiler turístico).
- Mensajería de la reserva directa de `housesevillana.es` (futuro; este agente es vía Smoobu).
- Scraping del Guest Portal como fuente obligatoria (solo si la URL resulta legible sin riesgo).
