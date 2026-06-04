# 🧠 Memoria de sesiones — ia.rest

> Contexto persistente entre sesiones de Claude Code. El entorno cloud es
> **efímero** (el contenedor se borra al acabar), así que lo único que sobrevive
> es lo commiteado aquí. Este archivo es el "estado vivo" del proyecto entre sesiones.
>
> **Cómo se mantiene:** al terminar cada sesión, Claude añade una entrada nueva
> arriba del todo en "Registro de sesiones" y actualiza "Estado actual" y
> "Pendientes" si algo cambió. Un hook `Stop` (`.claude/hooks/persist-memoria.sh`)
> commitea y empuja este archivo automáticamente.
>
> Para arquitectura/módulos completos → skill `ia-rest-maestro`. Esto es solo el
> registro de qué se hizo y qué queda.

---

## 📌 Estado actual (lo más reciente arriba)

- **Panel de leads de la landing en `/super → CRM → Leads`** (04/06/2026): tarjeta
  "FORMULARIOS DE LA LANDING" con Hoy / Ayer / 7d / 30d + total + chips por fuente,
  alimentada por `GET /api/super/leads-landing` (auth super_admin, service role, tz
  Europe/Madrid) sobre la tabla `leads_landing`. **Ojo:** son formularios, NO visitas
  de página — las visitas viven en **Google Analytics (G-EN2YQLRLEX)**, no consultable
  desde el contenedor. Pendiente futuro: panel de visitas vía GA4 Data API. También se
  sacó `tsconfig.tsbuildinfo` del control de versiones (caché generado) → `.gitignore`.

- **Tanda QR (04/06/2026) — 4 features:**
  - **Aviso "pedido listo"** (PR #17, en `main`): cuando la cocina marca lista una
    comanda QR, el cliente recibe aviso. **Capa 1 (gratis):** pantalla "En cocina"
    sondea `/api/qr/estado` cada 8s + Wake Lock + ✅/tono WebAudio/vibración al estar
    listo. **Capa 2 (push web):** "Avísame en el móvil" → `qr_avisos_suscripciones`;
    disparo server-side `lib/qr-notify.ts` desde `/api/marchar` y `/api/kds/voz`.
  - **Borrado RGPD del aviso** (PR #18, en `main`): el dato (push/teléfono) se borra
    al enviar el aviso, al cerrar la cuenta (webhook), y TTL 6h en cron `cobro-inactividad`.
    Landing home: "QR en mesa" menciona el aviso al móvil.
  - **Marketing opt-in** (PR #19, en `main`): el cliente autoriza novedades por
    WhatsApp con **casillas separadas bar/ia.rest** (RGPD). Tabla
    `marketing_consentimientos` (prueba + baja `baja_token`), `POST /api/qr/marketing-consent`,
    baja 1 clic `GET /api/marketing/baja`. UI **oculta tras `NEXT_PUBLIC_QR_MARKETING=1`**.
  - **"Llamar al camarero" configurable** (PR #20, abierto): flag
    `cobro_config.qr_llamar_camarero` (default true), `qr-session` v3 lo devuelve,
    toggle en `/owner`, y el cliente oculta el botón si está off (modo 100% autoservicio).
  - **Migraciones aplicadas en Supabase:** `20260604_qr_avisos_cliente`,
    `20260604_marketing_consentimientos`, `20260604_qr_llamar_camarero`.
    **EF desplegada:** `qr-session` v3 (version 4).
  - **WhatsApp = ENCHUFABLE** (`lib/whatsapp.ts`: `sendWhatsApp` + `whatsappConfigurado`):
    se enciende con `WHATSAPP_API_TOKEN` + `WHATSAPP_PHONE_ID` en Vercel env.
  - **Pendiente:** (a) cuenta WhatsApp (360dialog/Meta, Opción B) para encender avisos
    y marketing; (b) flag `NEXT_PUBLIC_QR_MARKETING=1`; (c) Fase 2 marketing (envío de
    campañas con plantillas Meta de pago + panel owner/ia.rest); (d) UI cliente wa.me.
- **Aviso por Telegram de compras en el Congreso Empresarial de Junio** (rama
  `claude/telegram-congress-purchase-alerts-PyI0t`): cuando se confirma un pago en el
  portal de cobros de grupo `congreso-empresarial-junio-2026-mpqtmo7a` ("CONGRESO
  EMPRESARIAL JUNIO 2026"), Alberto recibe un `tgAlert` con el comprador, los menús,
  el importe de esa compra y el **acumulado recaudado** del congreso. El enganche está
  en el webhook `src/app/api/webhook/stripe-connect/route.ts` (evento
  `checkout.session.completed`), en el helper `avisarCompra()`. **Idempotente:** el
  update de `cobros_grupo_pagos` filtra `.neq('estado','pagado').select(...)`, así que
  los reintentos de Stripe no duplican el aviso. **Por portal (enchufable):** flag
  `cobros_grupo.avisar_telegram` (migración `20260604_cobros_aviso_telegram.sql`,
  **aplicada en Supabase**), hoy `true` solo para el congreso; cualquier otro portal se
  enciende poniendo el flag a `true` (sin tocar código). Un toggle en `/owner → Cobros`
  queda como mejora futura opcional. `tsc --noEmit` + `next build` en verde.

- **Landings con hero animado (demo de producto en movimiento)** — PR #15: las 3
  landings (`/`, `/catering`, `/espacios`) tienen ahora un **hero a 2 columnas** con
  animación en bucle del "momento mágico" de cada vertical:
  - **Home** (`src/app/page.tsx`): terminal de voz — micro escuchando → frase
    tecleándose → items estructurados por partida → "Enviado a cocina 0.42s".
    Se **conserva** el titular de beneficio ("Facturar más no es ganar más…").
  - **Catering**: briefing del cliente → "calculando con escandallos" → presupuesto
    + **margen neto 31%** (además del timeline detallado que ya existía abajo).
  - **Espacios**: notificación "Nueva solicitud · bodas.net" → 3 pasos auto
    (respuesta/calendario/contrato) → día 14 marcado en el calendario.
  - CSS namespaced por archivo (`v*` home · `c*` catering · `e*` espacios) y JS de
    animación en el `useEffect`, con bandera `*Cancelled` en el cleanup.
  - Maquetas autónomas de referencia en raíz: `demo-hero-{voz,catering,espacios}.html`.
  - Origen: evaluar qué patrón de MotionSites encaja con la marca sin romperla
    (nada de vídeo/glassmorphism; paleta y tipografía propias de cada landing).
  - **Recorte anti-copia (equilibrado)**: se quitó el "cómo" copiable de las 3
    landings (en espacios: párrafos Antes/Después en prosa, el paso-a-paso
    detallado y el bloque bodas.net; en catering: hero-sub que describía el motor,
    fórmulas de coste de las tarjetas y el párrafo del flujo; en home: el cap-sub
    largo de "Eventos y catering"). Se conservan titulares + FAQ (reformulada a
    beneficio por SEO). Regla: **titular = el QUÉ; nunca el CÓMO** (mecanismo).

- **Acceso a `/super`**: ahora es **login email + contraseña** (antes: llave secreta en
  la URL `__super_shield` + PIN). El super admin (`personal`, fila `rol='super_admin'`,
  "Alberto") tiene `email` + `password_hash` (bcrypt). Ruta `/api/auth/super-login`;
  la página `/super` ya no está bajo el escudo del middleware (las `/api/super/*` sí, y
  el login pone la cookie `__super_shield`). `super-pin`/`super-shield` quedan como acceso
  de emergencia. Cookie del escudo: 1 año, compartida `iarest.es`↔`www`. (PRs #10, #12, #13).
- **Blog**: índice `/blog` ahora enlaza los **8 artículos** (antes solo 4). Los 4
  que faltaban (`tpv-voz-para-bares`, `software-tpv-bares-espana`, `tpv-restaurante`,
  `errores-comanda-restaurante`) eran páginas huérfanas: existían y estaban en el
  sitemap, pero no eran navegables. PR #7.
- **Instagram**: la cola estaba atascada (1 publicado, 9 borradores caducados del
  25-may sin aprobar). Limpiado: los 9 → `descartado`, e insertado un **lote fresco
  de 5 borradores** (`pendiente`) con `scheduled_for` jun 3/5/10/12/17. Visibles en
  `/super → Instagram`; el cron los lleva a Telegram en su fecha. El cuello de botella
  es **aprobar/publicar**, no generar.

- **Portal de Cobros de grupo** (`/cobro/[slug]` + `/owner → Cobros`): funcional.
  - Captura **nombre + email + teléfono móvil (obligatorio)** y el **menú (`concepto`)** de cada pago.
  - Panel del owner muestra menú · teléfono · email por pago + botón export **CSV** para el catering.
  - Webhook `stripe-connect` rellena email/teléfono desde Stripe como respaldo.
- Tablas clave del módulo: `cobros_grupo`, `cobros_grupo_items`, `cobros_grupo_pagos`
  (columnas añadidas: `importe_base_eur`, `cantidad`, `telefono_pagador`, `concepto`).

---

## ⏳ Pendientes / decisiones abiertas

- (P1) `STRIPE_MODE=live` en Vercel — sin esto no hay cobro real (ver maestro §PENDIENTES).
- Nada urgente abierto del módulo de cobros tras la sesión 2026-06-01.

---

## 📝 Registro de sesiones

### 2026-06-04 (4) — "Llamar al camarero" configurable (modo 100% autoservicio)
- **Petición de Alberto:** un local sin camareros (autoservicio/recogida) no quiere
  el botón de "llamar al camarero" en el QR → configurable por el dueño.
- **Rama `claude/qr-llamar-camarero-config`:**
  - Migración `20260604_qr_llamar_camarero.sql`: columna `qr_llamar_camarero BOOLEAN
    DEFAULT true` en `cobro_config`. **Aplicada en Supabase.**
  - EF `qr-session` → **v3** (desplegada en Supabase, version 4, verify_jwt=false):
    selecciona la columna y devuelve `cobro.llamar_camarero` (default true).
  - `/api/owner/cobro-config`: `qr_llamar_camarero` en allowed + validación booleana.
  - Owner UI (`owner/page.tsx`, `CobroConfigSection`): toggle "Botón llamar al
    camarero" (on = normal / off = 100% autoservicio).
  - `QrClientApp.tsx`: `llamarCamareroActivo = cobro.llamar_camarero !== false`;
    oculta el botón del header, el del welcome y el modal cuando está off.
  - `next build` verde con deps instaladas.

### 2026-06-04 (3) — Marketing opt-in del cliente QR (Fase 1: captura de consentimiento)
- **Idea de Alberto:** aprovechar el aviso de "pedido listo" para que el cliente
  autorice (opcional) recibir novedades (fiestas, menús de Navidad, ofertas).
  Decisiones: canal **WhatsApp** (el cliente ya da el móvil para el aviso; email
  descartado "anticuado"), y **bar + ia.rest con casillas SEPARADAS** (RGPD).
- **Aviso de coste (Fase 2):** enviar campañas por WhatsApp usa **plantillas de
  marketing de Meta (de pago + aprobación)**, distinto del aviso transaccional
  (gratis en ventana 24h). La captura de consentimiento sí es gratis y va ahora.
- **Fase 1 construida (rama `claude/qr-marketing-consent`):**
  - Migración `20260604_marketing_consentimientos.sql` → tabla
    `marketing_consentimientos` (telefono, consiente_bar, consiente_iarest,
    texto_consentimiento [prueba], baja_token, revocado_*_en). RLS service role.
    **Aplicada en Supabase.** OJO: almacén SEPARADO del transaccional
    `qr_avisos_suscripciones` (ese se borra; este se guarda con consentimiento).
  - `POST /api/qr/marketing-consent` (público, validado por sesión QR) → upsert
    por (restaurante_id, telefono), guarda consentimientos separados + prueba.
  - `GET /api/marketing/baja?token=&quien=bar|iarest|todo` → baja de 1 clic
    (devuelve página HTML). El enlace debe ir en CADA mensaje de marketing.
  - UI en `QrClientApp.tsx`: bloque opt-in (teléfono + 2 casillas no premarcadas
    + texto legal de baja) en las pantallas "En cocina" y "pedido listo". **Oculto
    tras flag** `NEXT_PUBLIC_QR_MARKETING=1` hasta que se active (necesita WhatsApp).
  - `next build` verde con deps instaladas.
- **Pendiente Fase 2:** herramienta de creación/envío de campañas (plantillas Meta),
  panel en /owner para que el bar gestione su lista, y panel ia.rest para campañas
  globales (query `consiente_iarest=true`, dedup por teléfono). Activar flag + WhatsApp.

### 2026-06-04 (2) — QR avisos: PR #17 mergeado + landing + RGPD (borrado del dato)
- **PR #17 MERGEADO** a `main` (squash `cad703b`). El bache de CI fue un tipo:
  `applicationServerKey` esperaba `BufferSource`; el helper con anotación
  `: Uint8Array` se ensanchaba a `ArrayBufferLike` → se quitó la anotación.
  Aprendizaje: `npx tsc` sin `node_modules` no reproduce el build de Vercel; hay
  que correr `next build` con deps instaladas.
- **Seguimiento (rama `claude/qr-aviso-landing-rgpd`, PR nuevo):**
  - **Landing** (`src/app/page.tsx`, capacidad 03 "QR en mesa"): añadido el
    beneficio "…y le avisamos al móvil cuando su pedido está listo". **NO** se puso
    "ningún programa lo hace" (regla: no nombrar/comparar competidores + riesgo legal
    de publicidad comparativa). Beneficio = el QUÉ, sin el CÓMO.
  - **RGPD / minimización del dato** (Alberto: borrar el móvil al cerrar cuenta):
    `qr_avisos_suscripciones` (push o teléfono) se borra en 3 capas: (1) **al enviar**
    el aviso, la fila se BORRA (uso único, vive minutos) — `lib/qr-notify.ts`;
    (2) al **cerrar la cuenta** (`estado='pagada'`) en `/api/qr/webhook`;
    (3) **TTL backstop** en el cron `cobro-inactividad`: purga filas de >6h (cubre
    mesas `sin_pago` que cierra el camarero, que no pasan por Stripe).
  - `next build` verde con deps instaladas.

### 2026-06-04 — Avisos al cliente QR cuando el pedido está listo (capa 1 + push web; WhatsApp enchufable)
- **Contexto/decisión (con Alberto):** el cliente que pide por QR no se entera de
  cuándo sale su pedido. Se decidió montar **capa 1 (gratis)** + **push web** ya, y
  dejar **WhatsApp enchufable** (Opción B: el cliente abre la conversación → ventana
  24h → respuesta en texto libre sin plantilla; SMS descartado como principal por
  coste). En iPhone el push web solo va con PWA instalada → por eso WhatsApp cubre
  ese hueco más adelante.
- **Backend nuevo:**
  - Migración `20260604_qr_avisos_cliente.sql` → tabla `qr_avisos_suscripciones`
    (sesion_id, comanda_id, token, canal `web_push`|`whatsapp`, subscription/destino,
    notificado). RLS solo service role. **Aplicada en Supabase** vía MCP.
  - `lib/qr-notify.ts` → `notificarClienteQrListo(supabase, comandaId, origin)`:
    si la comanda es `origen='qr_cliente'`, envía push (web-push, mismas VAPID que
    `/api/push/send`) y/o WhatsApp a las suscripciones pendientes; marca notificado;
    limpia subs caducadas (410/404). Best-effort, nunca lanza.
  - `lib/whatsapp.ts` → reutilizado el existente; añadido `whatsappConfigurado()`.
  - `/api/qr/avisar` (POST, público, valida sesión+comanda) → registra el canal.
  - `/api/qr/estado` (GET, público) → estados de las comandas de la sesión (polling).
  - Disparo en `/api/marchar` (tras `estado='lista'`) y en `/api/kds/voz` (cuando
    todos los items quedan listos).
- **Cliente (`q/[token]/QrClientApp.tsx`):** captura `comanda_id` de cada pedido;
  pantalla "En cocina" sondea estado + Wake Lock + (al listo) tono WebAudio + vibración
  + tarjeta ✅ "¡Tu pedido está listo!"; botón "Avísame en el móvil" (push). Audio se
  *primea* dentro del gesto de confirmar pedido (requisito móvil). Keyframes `iaPulse`/`iaPop`.
- **Verificación:** `npx tsc --noEmit` → solo el error preexistente de `@types/node`,
  0 errores nuevos. Sin test en vivo (la network del contenedor bloquea prod).
- **Pendiente:** UI cliente de WhatsApp (botón wa.me) + alta de cuenta Meta/360dialog
  para encender el canal; valorar añadir `origen='qr_cliente'` también a otros caminos
  que marquen `lista` si aparecieran (hoy: marchar + kds/voz; la capa 1 cubre cualquiera).

### 2026-06-03 — Acceso a `/super` por email + contraseña + candado a 1 año
- **Problema de fondo:** entrar a `/super` era un coñazo: llave secreta en la URL (cookie
  `__super_shield`) que caducaba + PIN. Se pedía algo memorable que funcione en cualquier
  dispositivo sin la llave.
- **PR #12:** cookie del escudo de 30 días → **1 año** (menos re-desbloqueos).
- **PR #13 (login email+contraseña):**
  - Migración `20260603_super_admin_email_login.sql`: columnas `email` + `password_hash`
    en `personal` + índice único parcial sobre `lower(email)`. **Aplicada en Supabase.**
  - Dep nueva: `bcryptjs` (JS puro). Ruta `/api/auth/super-login` (rate-limit en memoria,
    `bcrypt.compare`, errores genéricos; devuelve la misma sesión firmada que el PIN **y**
    pone la cookie `__super_shield`).
  - `middleware.ts`: la **página** `/super` sale del escudo (muestra el login); `/api/super/*`
    y `/api/auth/super-pin` siguen protegidas (el login rellena la cookie).
  - UI `super/page.tsx`: formulario email+contraseña en vez del teclado PIN.
  - `super-pin`/`super-shield` se mantienen como **acceso de emergencia** (no se borran).
  - Credenciales del super admin fijadas en BD: email `alberto.suarez.gutierrez@gmail.com`
    + hash bcrypt (la contraseña en claro NO se guarda en el repo).
  - Verificado: `bcrypt.compare` contra el hash real OK; la query del endpoint encuentra la
    fila; `tsc` + `next build` en verde. El test HTTP en vivo no se pudo hacer desde el
    contenedor (red bloquea `*.vercel.app`/`iarest.es`).

### 2026-06-02 — Fix: `/super` daba 404 (cookie del escudo no compartida apex↔www)
- **Síntoma:** `https://www.iarest.es/super` → **404**. No era crash de página
  (deploy `READY`, sin logs de error en runtime) sino el escudo de
  `src/middleware.ts`: devuelve 404 si no llega cookie `__super_shield` válida.
- **Causa raíz:** el proyecto sirve **dos dominios** (`iarest.es` y
  `www.iarest.es`). La cookie `__super_shield` se ponía **sin `domain`**
  (host-only) en `src/app/api/auth/super-shield/route.ts`, así que una cookie
  obtenida en un host no viajaba al otro (ni sobrevivía a un redirect apex↔www)
  → el middleware no la veía → 404.
- **Fix (PR #10, `claude/iarest-error-GAqTO`):** anclar la cookie a `.iarest.es`
  cuando el host pertenece a ese dominio (host-only en previews `*.vercel.app`/
  localhost, donde un domain de iarest.es lo descartaría el navegador). Corregido
  también el comentario del middleware (la cookie dura 30 días, no 8 h).
- **Acción manual tras deploy:** volver a desbloquear una vez en
  `https://www.iarest.es/api/auth/super-shield?k=<SUPER_ACCESS_KEY>` para reescribir
  la cookie ya existente con el nuevo `domain`.
- `npx tsc --noEmit`: solo el error preexistente de `@types/node`.

### 2026-06-02 — Revisión de contenido: blog + Instagram
- **Diagnóstico blog:** 8 artículos completos en `src/app/blog/` y los 8 en el
  `sitemap.ts`, pero el índice `/blog` (array `articulos` hardcodeado) solo enlazaba 4.
  Los otros 4 eran huérfanos (indexables por Google, no navegables). → Añadidos al
  índice los 4 que faltaban. `npx tsc` solo da el error pre-existente de `@types/node`.
- **Diagnóstico Instagram (Supabase):** solo **1 post publicado** (`instagram_posts`,
  "Digitaliza tu restaurante", 0 alcance) y **9 borradores pendientes caducados**
  (programados 25-29 may, nunca aprobados). El agente genera mié+vie + lote del lunes,
  todo con aprobación manual en Telegram → la cola se quedó parada.
- **Acción (decidida por Alberto: "regenerar lote fresco"):** los 9 caducados →
  `descartado`; insertados **5 borradores nuevos** (pregunta, tip, comparativa, cita,
  pregunta-VeriFactu) con caption según reglas de marca + `image_url` construido para
  el renderer `/api/ig-img` (estilo editorial) + `scheduled_for` jun 3/5/10/12/17 09:00.
  No se publicó nada en la cuenta real (decisión de Alberto vía Telegram/panel).
- **Nota entorno:** la network policy del contenedor bloquea `iarest.es`
  (`Host not in allowlist` / 403) → no se puede disparar `?manual=1` en prod desde aquí;
  por eso el lote se insertó directo en Supabase (es lo que alimenta `/super` y el cron).
- **PR #7** (`claude/blog-instagram-content-review-EyU19`): cambio de blog. Instagram
  es datos en Supabase (no hay diff de código).

### 2026-06-01 — Cobros de grupo: registro, móvil y menú por pago
- **Diagnóstico de pagos "fantasma":** en el portal de Saboga Catering había 9 pagos
  reales en Stripe (live, succeeded) que no aparecían bien. Verificado contra Stripe:
  **9 pagos = 180 €** (6 × 10 € coffee breaks + 3 × 40 € menús). Un 10º PaymentIntent
  de 20 € ("Pedido Demo") nunca se pagó → correctamente excluido.
- **Pagador:** los 9 son de la misma persona/tarjeta (Visa ····8238). Cliente real
  (pagó el programa completo de los 3 días), no pruebas.
- **Backfill BD:** los 9 registros se rellenaron con nombre + email reales, y se les
  **asignó el menú** (`item_id` + `concepto`) emparejando por importe y orden cronológico
  (uno de cada uno de los 9 conceptos del portal). Matiz: el emparejamiento de ítems del
  mismo precio es inferencia (no se guardó en su día); el conjunto sí es exacto.
- **Feature nueva (PR #4, MERGEADO a `main`):**
  - Migración: `telefono_pagador` + `concepto` en `cobros_grupo_pagos`.
  - Formulario `/cobro/[slug]`: campo teléfono móvil obligatorio.
  - `checkout/route.ts`: guarda teléfono + concepto (menú) por pago.
  - `webhook/stripe-connect`: respaldo email/teléfono desde `customer_details`/metadata.
  - `CobrosTab.tsx`: muestra menú/teléfono/email + export CSV catering.
  - `npx tsc --noEmit` → 0 errores. Vercel preview y prod en verde.
- **Memoria entre sesiones:** montado este sistema (doc + regla en AGENTS.md + hook `Stop`).
