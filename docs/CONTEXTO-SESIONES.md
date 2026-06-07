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

- **Auditoría del pipeline de comandas por voz + fixes — 07/06/2026**
  (rama `claude/minimax-voice-commands-WjMkA`, **PR #74 draft**): nació de una consulta de
  Alberto sobre si **MiniMax** mejoraría las comandas por voz. Respuesta: **no para el ASR**
  (Groq Whisper turbo ya es óptimo en latencia/precisión; su prompt ya inyecta carta+motos+
  vinos+personal; MiniMax usa Whisper por debajo) — MiniMax solo aportaría **TTS premium**
  como feature nueva, no mejora la transcripción. De ahí, auditoría completa del pipeline
  (ear → transcribe → brain-router → brain-patron/brain-cache → brain → ai-client).
  - **Veredicto:** arquitectura sólida (idempotencia 2 capas, anti-spoofing camarero_id,
    ruido multicapa, fuzzy + few-shot por turno, fallbacks). Pero se hallaron **2 funciones
    de voz ROTAS** + bugs de la capa rápida, **confirmados empíricamente en BD prod (solo lectura)**:
    - `aviso`/mensaje por voz **no hacía nada** (`mensajes_turno` tipo voz = **0 filas histórico**)
      y `86`/agotado por voz **no hacía nada** (`productos_86` = **0 filas**): sus handlers
      estaban anidados en `if (mesa)` de `transcribe/route.ts`, pero esos comandos no llevan
      mesa resoluble (aviso→cocina/barra/''; 86→'T00') → `mesa=null` → bloque saltado.
    - **BUG capa 8b** (`brain-router.ts`): leía `(cache as any).mesas`, campo inexistente →
      el prompt del 8b listaba MESAS vacío → escalaba al 70b de más.
    - Comandas **fantasma** (`comandas` tipo `aviso`=2 filas) + `recomendacion_vino` no está
      en el CHECK de `comandas.tipo` (insert lanzaría error si llegara con mesa).
    - **BUG-2 DESCARTADO:** un regex de `parseJSON` parecía pasar guiones a espacios; `cat -A`
      reveló que es `/[\x00-\x1f\x7f]/g` (borra caracteres de control) → **ya correcto**, no se tocó.
  - **PR-1 (commit `de39870`, bajo riesgo):** brain-router (el 8b ahora recibe **zonas**:
    prefijos+ejemplos); brain-cache (fallback de zonas sin colisión, **S=salon/T=terraza/B=barra**);
    ear (var `start` muerta); transcribe (eliminada llamada RPC `es_primera_comanda` desperdiciada);
    **nuevo `scripts/test-brain-patron.ts`** (test de regresión determinista, 14 casos, sin BD/red).
  - **PR-2 (commit `77307db`, refactor del camino caliente):** `aviso` y `86` **sacados de
    `if (mesa)`** → ahora se registran siempre; `aviso`/`86`/`recomendacion_vino` ya **no crean
    comanda fantasma**; el `if (mesa)` queda restringido a comanda/cuenta/marchar (flujo de
    comanda/cuenta intacto).
  - **Verificado:** `tsc --noEmit` 0 · `npm run qa` 0 errores · `next build` OK · test 14/14.
  - **PR #74 MERGEADO a `main`** (squash `667d52d`); luego **PR #75** remató `marchar`.
  - **PR #75 (marchar) — ✅ HECHO:** `marchar` por voz ahora **reusa la comanda activa** de la mesa
    (estado en_cocina/nueva/lista) en vez de crear una comanda nueva fantasma; **no inserta items**
    (solo marca los existentes como `listo` vía MARCHAR GRANULAR) y se protege si la mesa no tiene
    comanda activa (`comanda` null → no hace nada). `tsc` 0 · `next build` OK · test 14/14.
    → con esto las 5 funciones de voz (comanda/cuenta/aviso/86/marchar) quedan correctas.
  - **Pendiente:**
    - Opcional: añadir `recomendacion_vino` al CHECK de `comandas.tipo` (hoy mitigado porque ya
      no se inserta ese tipo).
    - **Tras merge+deploy:** re-consultar BD para confirmar que aparecen filas nuevas en
      `mensajes_turno` (voz) y `productos_86` al usar aviso/86 (cierre del loop empírico).
    - Idea futura (no urgente): capa de **TTS** (confirmación hablada al camarero / avisos KDS);
      empezar con Web Speech API gratis, MiniMax solo si se quiere voz de marca premium.

- **Agente de ventas: router de contacto + franquicias + Instagram — 07/06/2026**
  (rama `claude/leais-sales-agent-catering-b5ikA`). Sesión larga; toda la maquinaria de
  outreach quedó operativa y verificada en prod.
  - **Router de contacto Sevilla:** un solo canal por lead, **todo a aprobación por Telegram**.
    Móvil (ES 6/7) → WhatsApp (`normalizarTelefonoEs` ahora SOLO móvil); sin móvil + email →
    email. El email frío **ya no auto-envía**: `enviarEmailsSevilla` **propone** a Telegram con
    botón ✅ Enviar (excluye móviles, marca tracking `propuesto`). Límite = nº emails no-móvil
    (sobre-pide al RPC); botón panel 20, cron 12.
  - **Callback `enviar_sevilla`** (en `/api/telegram/webhook`): reconstruye el email por
    `tipo_negocio` y envía desde `hola@iarest.es` (Resend), tracking `propuesto`→`enviado_dia1`.
    **Idempotente** (solo si sigue `propuesto` → no duplica). `descartar_sevilla` también.
  - **FIX CRÍTICO Telegram:** el bot apunta (vía `setup-webhook`) a `/api/telegram/instagram-callback`,
    que solo maneja `ig_*`/`blog_*`. Ahora **reenvía** las acciones CRM a `/api/telegram/webhook`
    **con `?secret=TELEGRAM_WEBHOOK_SECRET` en la URL** (el webhook lo exige) y se quitó el doble-auth
    `from.id==TELEGRAM_CHAT_ID`. Además el `secret_token` estaba desalineado → 401: se arregla
    **re-registrando** el webhook (botón **🔧 Reparar webhook Telegram** en el panel, que llama a
    `setup-webhook` con la sesión; abrir la URL directa da "No autorizado" porque usa header `x-ia-session`).
    **Verificado:** 31 emails enviados el 07/06, 0 pendientes.
  - **Franquicias (nacional):** vertical `franquicia` en `crm-sevilla.ts` (email de PRESENTACIÓN:
    operativa única, panel central, margen por local, VeriFactu). Captación Apify nacional
    (`ApifyVertical` gana 'franquicia', queries en `prospeccion-apify.ts`). `proponerEmailsFranquicia`
    + endpoint `/api/super/lead-hunter-franquicia` + botón 🏢. **20 centrales sembradas**
    (origen `bot_prospeccion`, marca+web+ciudad). **Emails reales solo 3** (resto usa FORMULARIO):
    Lizarran y Muerde la Pasta → `expansion@comessgroup.com`, Rodilla → `departamento_expansion@damm.com`
    (las 3 ya enviadas). Las 16 sin email tienen el enlace de su formulario en `notas`; Goiko no franquicia.
  - **Instagram (DM manual, sin API/ToS):** columna `leads.instagram_outreach_at` (migración
    `20260607_leads_instagram_outreach_at.sql`). `construirInstagram` (mensaje por vertical + enlace:
    perfil si la web es de IG, si no búsqueda Google). `proponerInstagramSevilla(vertical)` manda a
    Telegram el DM en `<code>` (toque=copiar) + botón 📸 Abrir Instagram, marca outreach. Botones
    **📸 Instagram catering** y **📸 Instagram eventos** en el panel.
  - **Botón 🔁 Reenviar pendientes:** re-emite a Telegram las propuestas atascadas en `propuesto`
    sin duplicar (`reenviarPropuestasPendientes`).
  - **PRs mergeados (squash):** #57, #64, #65, #66, #68, #69, #71, #72 (+ el de eventos/Instagram).
  - **PENDIENTE / ideas:** enriquecer emails de las 16 centrales (formulario/LinkedIn);
    flujo LinkedIn "click-to-LinkedIn" desde Telegram (botón a perfil + mensaje IA a pegar, opción A,
    sin scraping); opcional: cron que proponga franquicias-locales e Instagram automáticamente.
- **QR cuenta individual — "cada uno pide su caña y se le cobra lo suyo" — 06/06/2026**
  (rama `claude/individual-beer-ordering-billing-oRwzB`): feature **100% configurable por el
  dueño**. Idea de Alberto (escenario Sevilla: cañas rápidas, cada uno pide y paga lo suyo).
  Análisis previo: el QR ya tenía ~85% (pedido móvil, `pre_auth` SetupIntent, cobro `off_session`,
  Connect, VeriFactu, split). El hueco real: TODO colgaba de la **mesa**, no de la **persona**, y
  el reparto era reactivo. Cambio de fondo implementado: **cobro por persona, no por mesa**.
  - **Migración** `20260606_qr_cuenta_individual.sql` **APLICADA en Supabase (06/06)**: `cobro_config.qr_modo_consumo`
    (`mesa_unica`|`individual`|`cliente_elige`, default mesa_unica → sin cambios para nadie);
    `qr_sesiones_cliente.{device_id,nombre_cliente,tipo}`; **`comandas.sesion_qr_id`** (el eslabón
    persona↔item). Aditiva y backward-compatible. Verificado: 5 columnas presentes con defaults OK;
    `qr_sesiones_cliente` vacía (0 datos en riesgo).
  - **EFs DESPLEGADAS en Supabase (06/06):** `qr-session` **v6**, `qr-order` **v9**,
    `qr-cobro` **v5**. Todas ACTIVE, `verify_jwt=false`.
  - **Code review (06/06) — 4 fixes aplicados y desplegados:**
    1. `qr-cobro` mesa-branch ahora **excluye** los items de subcuentas individuales (en `cliente_elige`,
       el que elige "cuenta de mesa" ya NO carga con las cañas de los individuales; antes doble-cobro).
       Verificado en SQL: A indiv paga 3,0 / B mesa paga 4,0 (antes B pagaba 7,0).
    2. cron `autoCerrarIndividuales`: `idempotencyKey: qr-auto-<sesion_id>` en el PaymentIntent →
       si el cargo OK pero el update de BD falla, el siguiente tick NO recobra.
    3. `qr-session` recover por device: `.order(creado_en desc).limit(1)` antes de `maybeSingle()`.
    4. Índice `idx_qr_sesiones_mesa_device` → **UNIQUE** (migración `20260606b_qr_unique_device_index.sql`
       APLICADA). Las sesiones 'mesa' guardan `device_id NULL` (no chocan). tsc --noEmit verde.
  - **Config dueño:** `/api/owner/cobro-config` (allowlist + validación `qr_modo_consumo`) + selector
    "MODO DE CONSUMO QR" en `owner/page.tsx` (`CobroConfigSection`). Reusa el `modo_cobro` existente
    (cuenta_abierta/pre_auth/por_ronda) como "cómo paga cada cuenta" → sin set de flags redundante.
  - **Cliente** `q/[token]/QrClientApp.tsx`: `device_id` en localStorage; bienvenida ofrece "Mi
    cuenta / Cuenta de mesa" si `cliente_elige`; "Cerrar mi cuenta" y oculta el split en individual.
  - **Red de seguridad:** cron `cobro-inactividad` → `autoCerrarIndividuales()` cobra `off_session`
    a las cuentas individuales con tarjeta guardada (solo si el dueño eligió `modo_cobro='pre_auth'`)
    pasado el timer. Si se va sin pulsar, se cobra solo.
  - **Verificado:** `npm install` + `tsc --noEmit` (0) + `next build` (exit 0) en verde.
    Vercel preview READY (ia-rest/ia-rest-docs/repo). **Test DB del fix (Postgres prod):** misma
    mesa, 2 personas, 1 caña 3€ c/u → individual cobra **3,30€** (solo lo suyo), legado/mesa **6,60€**.
  - **ACTIVACIÓN EN PROD HECHA:** (1) ✅ migración aplicada; (2) ✅ EFs desplegadas (v5/v9/v4).
    La feature está VIVA pero **inerte por defecto** (`qr_modo_consumo='mesa_unica'` en todos →
    comportamiento idéntico al actual). Para encenderla en un local: `/owner → ia.rest cobro →
    Modo de consumo QR → "Cuenta propia por persona"` (o "Que elija el cliente").
  - **PENDIENTE (manual, no hacible desde el contenedor — network bloquea `*.supabase.co`):**
    prueba HTTP en vivo con 2 móviles en la misma mesa → A paga solo su caña, no la de B; validar
    `application_fee` 0,5% + transfer al Connect en Stripe. Limitación v1: en individual no hay "bote
    común" (lo compartido lo paga quien lo pide); coexistencia mesa+individual = Fase 2.
- **MERGEADO a `main` (07/06):** PR #60 squash-merged. Producción tendrá la feature tras el
  redeploy de Vercel. Sigue inerte por defecto (`mesa_unica`). Demo en `individual` para pruebas.

- **Reels: música + previsualización + warm-up + gancho con movimiento** (PR #67, 07/06/2026):
  el reel ya reproduce en prod (sin zoom) con ambiente real; faltaba audio y poder previsualizarlo.
  - `src/app/api/super/instagram/seed-music/route.ts`: siembra MÚSICA en Cloudinary desde
    enlaces MP3 públicos (Pixabay) → devuelve `musicIdsEnv` para `CLOUDINARY_MUSIC_IDS`.
    POST Bearer o **GET desde navegador** logueado en /super: `?urls=<mp3_1>|<mp3_2>|...`.
  - **Previsualización**: el mensaje de Telegram del reel lleva `👁️ Ver vídeo` (enlace al MP4).
  - **Warm-up + chequeo** (`warmAndCheckReel` en `ig-reel`): calienta el MP4 y, si Cloudinary
    da error claro (4xx), el cron **cae a imagen** en vez de proponer un reel roto.
  - **Gancho con movimiento**: si hay ambiente, el reel **abre con un clip real** y el texto después.
  - `tsc`+smoke+`next build` verdes. **Pendiente Alberto:** sembrar música (3-5 MP3 Pixabay)
    → `CLOUDINARY_MUSIC_IDS` + redeploy → reprobar que **suena** (valida `l_audio`; si no,
    fallback `l_audio:` → `l_`).

- **Puente etiqueta_producto → stock + fix del CHECK silencioso — 06/06/2026**
  (rama `claude/tag-scanning-ZcXnf`): el escáner de etiquetas (`/api/scanner/clasificar`,
  tipo `etiqueta_producto`) estaba **roto en silencio** y, aunque funcionara, era un
  dead-end. Dos problemas y sus fixes:
  - **Bug de BD:** el CHECK de `documentos_escaneados.tipo` (migración 20260518) NO
    incluía `etiqueta_producto`, así que el INSERT fallaba, `dbError` solo se logueaba
    y `scan_id` volvía null → el scan nunca se persistía. **Fix:** migración
    `20260606_smart_scan_etiqueta_producto.sql` (drop/recreate idempotente del CHECK
    añadiendo `etiqueta_producto`). ⚠️ **Pendiente aplicar en Supabase remoto** (la tabla
    vive en remoto; la migración del repo es la fuente, pero hay que ejecutarla).
  - **Dead-end UI:** el botón "Usar en Recepción" redirigía a `&recepcion=1` (sin leer)
    y no llevaba los datos. **Fix (puente):** `SmartScanModal` guarda los datos en
    `sessionStorage('ia_scan_etiqueta')` y redirige a `?tab=almacen&recepcion=etiqueta`;
    `AlmacenTab` lo lee al montar, **prefija la checklist de Recepción** (nombre, EAN,
    lote, caducidad ISO, cantidad/unidad) y reutiliza `confirmarRecepcion()` → crea la
    recepción confirmada → `fn_confirmar_recepcion` sube `stock_actual` y el lote aparece
    en FEFO. Sin rutas de escritura nuevas. Al confirmar, enlaza el doc de auditoría con
    `archivado_en='recepcion:<uuid>'`.
  - **Mejora incluida (GS1):** extraído `parseGS1`/`detectBarcode` del flujo ASN a
    `src/lib/barcode.ts` y reutilizado en el escáner del owner: si la foto lleva código
    de barras legible (EAN-13/GS1-128/DataMatrix), su EAN/lote/caducidad **sobrescriben**
    lo que leyó la visión (que confunde fechas tipo "04.06.26"). La route normaliza
    además `fecha_caducidad`/`fecha_fabricacion` a ISO para el `<input type=date>`.
  - **Verificación:** `npx tsc --noEmit` y `npx next build` **verdes**. Falta prueba
    funcional end-to-end en el navegador (escanear → confirmar → ver en FEFO) y **aplicar
    la migración en Supabase**.
  - **Mejoras siguientes (NO hechas, documentadas en el plan):** aviso si caducidad ya
    pasó / gating por confianza antes de escribir; cron `caducidades` con `tgAlert`
    (FEFO proactivo); columna `codigo_barras` en `stock_articulos` para auto-match EAN→artículo.

- **Maître IA — recomendador de carta para el comensal (QR) — 06/06/2026**
  (rama `claude/ai-meal-recommender-3vVLJ`): nueva feature gemela del recomendador de
  vino, pero para platos. El comensal en `/q/[token]` marca alérgenos (chips) + escribe
  qué le apetece y la IA recomienda 2-3 platos seguros de la carta, que selecciona y
  añade al pedido. **Spec** y **plan** en `docs/superpowers/`. Implementado:
  - `src/lib/carta-recomendar.ts` — motor: **filtro de seguridad de alérgenos EN CÓDIGO**
    (no se confía al LLM), platos sin alérgenos declarados excluidos por defecto, descarte
    de ids alucinados (defensa en profundidad), prompt + `callAI`.
  - `src/app/api/qr/recomendar/route.ts` — GET (config UI) + POST (recomienda), valida
    token QR sin sesión (como `carta-i18n`).
  - `src/components/qr/MaitreSheet.tsx` — bottom sheet (chips + antojo + resultados).
    ⚠ Los `value` de los chips coinciden con la convención REAL de `productos.alergenos`
    (verificada en BD: minúsculas sin tildes, guion bajo → `lacteos`, `crustaceos`,
    `frutos_secos`). Si fueran "bonitos" el filtro no casaría.
  - Owner: módulo `carta_ia` + config `configuracion.maitre_ia` en `ModulosTab` (nombre,
    tono, nº sugerencias, 3 toggles). Gating como `carta_vinos`.
  - Verificado: `tsc` 0 errores, `eslint` 0 errores, `next build` OK.
  - Pendiente/futuro (YAGNI): maridaje de vino en la tarjeta, puerta `/edge` del camarero
    (motor ya reutilizable), voz, aprendizaje sobre qué sugerencias acaban en comanda.

- **Cobros de grupo: comisión configurable por restaurante + ahorro de costes — 05/06/2026**
  (rama `claude/price-discrepancy-480-280-bFj1E`): se sustituye el 1% fijo (con el que ia.rest
  **perdía** en todo cobro: 1% < 1,5%+0,25€ de Stripe) por **comisión = % · precio + fijo**
  (la fija una vez por pago), configurable **por restaurante** desde `/super`. Defaults de
  plataforma `2% + 0,35€ · mínimo 3€` (`lib/cobros-comision.ts`, con fallback). Smoke
  `scripts/smoke-cobros-comision.ts`: neto plataforma > 0 en todos los casos (café 10€ pasa de
  −0,30€ a +0,15€). Spec/plan en `docs/superpowers/{specs,plans}/2026-06-05-cobros-comision-*`.
  - **Migración aplicada** (`cobros_comision_config`): `comision_pct/comision_fija_eur/minimo_producto_eur`
    en `cobro_config`; `email_cierre_enviado` en `cobros_grupo`; `recordatorio_enviado_at` en `cobros_grupo_pagos`.
  - **Checkout**: lee la config; el menú va a precio base y, si se repercute, añade línea
    "Gastos de gestión"; `application_fee = comisión`. **GET portal** + página pública muestran
    desglose importe/gestión/total. **Mínimo por producto** validado al crear/editar menús.
  - **Webhook `stripe-connect`**: registra volumen + comisión en `resumen_cobros_mensual`
    (`registrar_pago_cobro`) → `/super → Cobro` ya refleja el margen real (antes 0 para Saboga).
    OJO: los cobros históricos reconciliados a mano NO se backfillean (usaban el 1% viejo).
  - **`/super → Cobro`**: nuevo editor de comisión por restaurante (`/api/super/cobro-config-comision`).
  - **Cron nuevo `cobros-eventos`** (`0 * * * *`, en `vercel.json`): (A) email de **cierre** al dueño
    con pagados + pendientes (`enviarEmailCierreCobros`); (B) **recordatorio** a invitados con el pago
    a medias antes del límite (`enviarEmailRecordatorioPagoCobro`). Idempotentes por flags.
  - **v2 aparcado:** cuenta "tab" cobrada al cierre por persona; política de reembolsos (Stripe no
    devuelve su comisión en un refund). **Pendiente Alberto:** ajustar % / fijo por restaurante en /super.

- **Hardening cobros: purga automática de "pendientes" caducados — 05/06/2026**
  (rama `claude/price-discrepancy-480-280-bFj1E`): tras el fix del bug multi-menú
  (PR #47, ya en `main`), se añade al cron `cobro-inactividad` (cada 5 min) un borrado
  de `cobros_grupo_pagos` en estado `pendiente` con `created_at` > 48 h. Es seguro
  (la sesión de Stripe Checkout caduca a 24 h → no se pierde ningún pago) y evita que
  los intentos abandonados/fallidos vuelvan a ensuciar el panel del portal. Limpieza
  manual ya hecha: borrado el duplicado de Carmen; portal en **21 pagados = 420 €** y
  **3 pendientes = 30 €** (todas de Patricia Vera Toronjo, 677763642, pedido real sin
  pagar; el cron las purgará a las 48 h si no paga).

- **BUG CRÍTICO cobros de grupo: pedidos multi-menú se pagan pero salen "pendiente" — FIX + reconciliación — 05/06/2026**
  (rama `claude/price-discrepancy-480-280-bFj1E`, PR #47): Alberto vio ~480 € pero el
  portal del congreso de Saboga mostraba 280 €. **Causa raíz (verificada contra Stripe
  LIVE):** el portal está en `modo_seleccion='varias'`. Cuando un invitado elige
  **varios menús**, el checkout inserta N filas `pendiente`, crea la sesión de Stripe
  y guarda el `session_id` en las filas en un UPDATE **posterior** que no persiste para
  multi-ítem → las filas quedan con `stripe_checkout_session = NULL`. El **webhook solo
  casaba por `stripe_checkout_session`**, así que esos pagos, **aunque se cobran de
  verdad y el dinero llega a Saboga**, nunca pasaban a `pagado` → el portal infra-
  reportaba. Casos reales: **Ivan (ivanrexito@gmail.com) pagó 60 € (pi_3TeXsF, 4 jun)**
  y **Antonio (antoniojesusgarcia3@gmail.com) pagó 80 € (pi_3TeryD, hoy)** → ambos
  salían "pendiente". (Mi 1ª hipótesis de "QR/mesa" para esos 140 € era ERRÓNEA: son
  del congreso.) Total real del congreso = **420 €**, no 280.
  - **FIX de código (committeado):**
    - **Webhook** `stripe-connect`: ahora casa las filas por **`session.metadata.pago_ids`**
      (enlace autoritativo que el checkout siempre escribe) además de por `session_id`.
      Así un pago real **no puede quedar sin registrar** aunque falle el guardado del
      session_id. (`.or(stripe_checkout_session.eq…,id.in.(…))`.)
    - **Checkout** `/api/cobros/[slug]/checkout`: `sessions.create` envuelto en try/catch
      → si Stripe falla, **borra las filas pendiente huérfanas** y loguea el error real
      (antes quedaban contaminando el portal). El session_id pasa a ser best-effort.
  - **Reconciliación de datos en vivo (Supabase):** marcadas `pagado` las 6 filas de
    Ivan (pi_3TeXsF) y las 2 de Antonio (pi_3TeryD) con su `pagado_at` real. Portal
    ahora: **21 pagados = 420 €**, 4 pendientes = 70 € (Patricia 30 € = posible pedido
    perdido por el bug, SIN pago en Stripe → conviene que Saboga la contacte antes del
    límite; + 1 duplicado de Carmen de 40 € que ya pagó por otra vía).
  - **Panel para organizar (`CobrosTab.tsx`, lo pedido por Alberto):** resumen por menú
    (unidades + importe de cada concepto pagado, total de unidades + nº de personas) y
    pagos **agrupados por persona** (cada comprador una vez con sus menús y total).
    Añadido `cantidad` al select de `/api/owner/cobros`. `tsc` + `next build` verdes.
  - **No reproducible aquí:** logs de Vercel del 4-5 jun ya rotados, el MCP de Stripe no
    crea/lee Checkout Sessions y no hay clave Stripe local → **recomendado test real de
    un pago multi-menú** antes del límite (17:00) para confirmar end-to-end; el webhook
    por `pago_ids` ya garantiza el registro de cualquier pago que sí complete.
  - **Económico (aparte):** ia.rest **pierde 5,85 €** (saldo plataforma negativo): el 1 %
    de comisión no cubre la tarifa por transacción de Stripe en tickets pequeños (10 €).
  - **Pendiente/decisión:** (a) caducar pendientes viejos por TTL (cron); (b) que
    `/super → Cobro` (`v_cobro_resumen_super`) refleje los cobros de grupo (hoy 0 para
    Saboga); (c) revisar economía del 1 %.

- **Sacar Anthropic del camino crítico (cuenta SIN saldo) — 05/06/2026** (PRs #43/#44 + 1 más):
  el fallback a Anthropic daba "credit balance too low". Objetivo de Alberto: **que no falle nada**.
  - **#43**: `noFallback=true` por **default** en `callAI`/`callAIVision` (`src/lib/ai-client.ts`) →
    todo lo que solo usaba Anthropic como red de seguridad pasa a **NIM puro**. Quedan 2 `false`
    explícitos deliberados (`fuzzy-comanda.ts`, `owner/carta`).
  - **#44**: migradas a **`callAISearch` (Gemini google_search)** las búsquedas de grupos/locales
    (`cron/prospeccion-leads`, `cron/completar-locales`, `super/leads`,
    `super/leads/[id]/locales/buscar`) y a **`callAI`** la generación de `cron/blog-seo`. Cada una
    degrada a `[]`/aviso (locales/buscar ya no da 500). `callAISearch` fallback profundo → NIM puro.
  - **PR3 (mismo día)**: (a) **anomalía frontend** `super/page.tsx` Lead Hunter modos *caption* y
    *email* hacían `fetch` directo a `api.anthropic.com` **sin api-key** (rotos siempre) → ahora
    `POST /api/super/lead-hunter` modos `caption`/`email` con `callAI`. (b) **Guarda de degradación**
    en los 3 agentes que SIGUEN en Anthropic (`agentes-seo`, `agente-arquitecto`, `agentes-ai`):
    muestran aviso limpio "no disponible (sin crédito)" en vez de reventar. (c) Doc
    **`docs/IA-busqueda-web-y-proveedores.md`** (proveedores, opciones SearXNG/Tavily, vLLM/SGLang)
    + `GEMINI_API_KEY` añadida a `.env.example`.
  - **`GEMINI_API_KEY` ya está en Vercel** (la usa `lead-onboarding`). Si algún día se recarga
    Anthropic, los 3 agentes vuelven solos (la guarda solo salta sin saldo).

- **FIX Apify ingest: "0 de 30" → inserta — 04/06/2026** (PR #35, mergeado):
  con `APIFY_TOKEN` ya puesto en Vercel, "Lanzar una vuelta" devolvía
  `Fase B: 0 leads de 30` (run SUCCEEDED pero 0 insertados). Causa: el INSERT del
  lote en `leads` (lib/prospeccion-apify.ts `ingestar`) chocaba con el **esquema
  real** (3 cosas, cualquiera tumba el lote entero): (1) `leads.telefono` es
  **NOT NULL** sin default y se pasaba `null`; (2) CHECK `leads_tipo_check` solo
  admite `'online'|'personal'` y metía `'prospecto'`; (3) CHECK `leads_origen_check`
  no incluía `'apify_google_places'`. Fix: código `telefono → ''`, `tipo → 'online'`;
  **migración Supabase aplicada** (`leads_origen_check_allow_apify`) que añade
  `'apify_google_places'` al CHECK (lo usan el panel `/super` y el RPC
  `search_leads_sevilla_nuevos`). Verificado con INSERT real (sitio sin tel.) + `tsc`.
  - El primer run (`empresas de catering Sevilla`, run_id `e6lzGDB53voBotbzF`) que
    salió 0 se **reseteó a `pending`** para re-cosecharlo con el código corregido.
  - `APIFY_TOKEN` (Apify free) **ya está en Vercel** (Production). Pendiente: vigilar
    crédito del plan free si se sondea Sevilla entero.

- **Instagram Reels v2 — "que vendan": ambiente real + producto + música** (04/06/2026,
  PR #31 mergeado): tras investigación de mercado (5 frentes), se decidió **mantener el
  motor Cloudinary** (0€, sin infra nueva) y enriquecerlo en vez de FFmpeg/APIs de pago.
  - `src/lib/instagram-music.ts` (pool `CLOUDINARY_MUSIC_IDS`) + `src/lib/instagram-reel-assets.ts`
    (pool ambiente `CLOUDINARY_AMBIENT_IDS`), ambos con degradación elegante (vacío = sin audio / sin footage).
  - `src/app/api/ig-reel/route.ts` reescrito: secuencia **portada → mockup producto
    (`ig-img tipo=producto`) → ambiente (Pexels) → puntos (intercalando ambiente) → CTA**,
    Ken Burns en slides, ambiente silenciado y música recortada a la duración.
  - `src/app/api/cron/instagram/route.ts`: **viernes → reel** (`formatoDelDia`) con fallback
    a imagen; publica vía callback **`ig_aprobar_reel`** (`publicarReel`, MP4 como vídeo).
    `maxDuration` 60→120. **Texto del agente con `noFallback=true`** (NIM puro, nunca Anthropic
    → evita el error "credit balance too low" que daba al caer al fallback de Claude sin créditos).
    Mismo `noFallback=true` aplicado a los botones de `instagram-callback`.
  - `src/app/api/super/instagram/seed-reel-assets/route.ts`: siembra clips de ambiente
    Pexels→Cloudinary (POST Bearer CRON_SECRET, o **GET desde el navegador** logueado en /super).
  - Smoke `scripts/smoke-instagram-reel.ts` **OK**; `tsc` y `next build` **verdes**.
  - **Estado de validación en prod:** el reel base (slides + mockup producto) **se genera
    bien** (NIM con `noFallback`), pero **NO se reproducía** → causa: `e_zoompan` por slide
    rompía el render de Cloudinary. **PR #38: e_zoompan quitado** (vuelta a splice+crossfade
    estático). Pendiente reprobar que ahora reproduce. El **seed de ambiente funcionó** (6
    clips `iarest_amb_1..6` en Cloudinary), pero el primer reel salió SIN ambiente porque
    `CLOUDINARY_AMBIENT_IDS` aún no estaba activo al generarlo. Falta: con la env activa,
    confirmar que el **splice de vídeo (`l_video`) + `l_audio`** rinden (siguen siendo empíricos;
    no probables desde el contenedor — Cloudinary `Host not in allowlist`).
  - **Pendiente Alberto:** `CLOUDINARY_AMBIENT_IDS=iarest_amb_1,...,iarest_amb_6` en Vercel +
    redeploy + reprobar render · subir 3-5 pistas Pixabay → `CLOUDINARY_MUSIC_IDS`.
  - **Pendiente código:** reañadir motion (Ken Burns) con sintaxis Cloudinary correcta una
    vez confirmado que el base reproduce.

- **Botón "📧 Enviar emails de venta" en `/super → Apify Sevilla` — 04/06/2026**
  (PR #33, mergeado): el envío de email frío de Sevilla se extrajo a
  `lib/lead-hunter-sevilla.ts` (`enviarEmailsSevilla`), compartido por el cron
  `crm-lead-hunter-sevilla` (ahora wrapper fino) y un endpoint nuevo
  `POST /api/super/lead-hunter-sevilla` (auth super_admin). El panel gana un botón
  para lanzar la tanda a mano (1 clic, sin terminal). `tsc`+`lint`+`build` verde.

- **Reorg del panel `/super` por dominios — 04/06/2026** (PR #34, draft):
  ✅ IMPLEMENTADA la reorg (antes era propuesta). En `src/app/super/page.tsx`:
  (1) barra principal = **NEGOCIO** (Clientes · CRM · Cobro · Suscripciones);
  (2) "Apify Sevilla" pasó a **CRM → sub-pestaña `🔍 Prospección`** (capta + envía
  emails); (3) **Sugerencias** bajó al grupo Soporte; (4) el cajón único SISTEMA se
  partió en **3 dropdowns por dominio**: Crecimiento (Instagram/Blog), Soporte
  (Soporte/Sugerencias/Proveedores) y Sistema (Sistema/Autocuras/QA/Agentes/IA
  Training), con badge agregado por grupo; (5) mecánica de menú generalizada
  (`openMenu`/`menuRef`/`menuPos`); (6) deep-link `?tab=prospeccion_apify` redirige a
  CRM/Prospección. Sin cambios de lógica en los componentes. `tsc`+`lint`+`build` verde.

- **Conversión de landings — 04/06/2026** (motivo: ~800 visitas/mes en GA4 y 0
  formularios → el cuello de botella es convertir). Cambios:
  - **Botón WhatsApp** (`wa.me/34637349990`, mensaje pre-rellenado) en los heros de
    `/`, `/catering`, `/espacios` + enlace WhatsApp bajo el formulario de la home.
    Clase `.btn-wa` (verde #25D366).
  - **Home: formulario corto** → de 5 campos a **Nombre + Teléfono (req) + Email
    (opcional)**; `enviar()` valida nombre+teléfono y manda `restaurante/usuarios` vacíos
    (la API los acepta). Antes pedía restaurante+usuarios y exigía email.
  - **Home: barra fija (sticky CTA) en móvil** ("Pedir demo" + WhatsApp) + **fila de
    confianza** en el hero (Sin permanencia · Datos en Europa · Setup 2h · Sin comisión).
    Sin testimonios inventados.
  - **Bug arreglado en catering:** el botón "Solicitar demo gratuita" era un `<button>`
    **sin acción** (no llevaba a ningún sitio); ahora es enlace a `#contacto`.
  - Pendiente sugerido: medir conversión real (evento GA4 en los CTA) y, si el tráfico
    resulta ser ruido/bots (ver checklist GA4), priorizar tráfico cualificado.

- **Agente de venta para CATERING + HACIENDAS de eventos (Sevilla) — 04/06/2026**
  (rama `claude/leais-sales-agent-catering-b5ikA`, PR #25): se extendió todo el
  pipeline de captación para que sea **consciente del vertical** (catering →
  `/catering`; eventos/haciendas → `/espacios`; restaurante → `/`, intacto). Piezas:
  (1) **Apify Google Places** como motor de sourcing nuevo, asíncrono en 2 fases
  (`src/lib/apify.ts` + cron `/api/cron/prospeccion-apify` `*/30` + tabla de estado
  `prospeccion_apify_runs`, **aplicada**); rastrea catering+haciendas+restaurantes en
  Sevilla. (2) `prospeccion-leads`: taxonomía con `eventos`, captura email/telefono y
  **fix** — `tipo_negocio` se guardaba solo en `estudio_completo` (JSON), ahora también
  en la **columna** `leads.tipo_negocio` (que es la que leen RPC y presentación).
  (3) `lead-onboarding`: research y borradores email/WhatsApp por vertical, enlazando la
  landing correcta. (4) Presentación `src/app/p/[slug]/page.tsx`: bucket `MODULOS_TIPO.eventos`
  propio (espacios/calendario/solicitudes/contratos/cobros de grupo) + `getModulos`
  enruta hacienda/finca/espacio → eventos + subheadline por vertical. (5) RPC
  `search_leads_sevilla_nuevos` **v2** (aplicada): admite catering/eventos de un solo
  sitio y los de Apify (`origen`), exige email. (6) `crm-lead-hunter-sevilla`: 3 plantillas
  de email por vertical con CTA a la landing correcta + tracking.
  - **OJO descubierto:** el archivo `MIGRACIONES_CRM_LEAD_HUNTER.sql` del repo **NO**
    coincide con la función realmente desplegada (`leads_locales` usa `lead_id`+`aforo`,
    no `empresa_id`/`num_mesas`; `leads` no tiene `restaurante_id`). La v2 se hizo sobre
    la función real (vía `pg_get_functiondef`).
  - **Pendiente:** **`APIFY_TOKEN` en Vercel env** (sin él, `prospeccion-apify` hace
    no-op y nada más se rompe). Spec y plan en `docs/superpowers/{specs,plans}/`.
  - **CI:** se arregló de paso un fallo **preexistente** de ESLint en `main`
    (`eslint.config.mjs` referenciaba reglas `react-hooks/*` y `react/*` sin registrar
    los plugins → lint abortaba). Verificado `tsc`+`lint`+`build` en verde.
  - **Ampliación "todo automático" (misma sesión):** (a) **panel en `/super → Apify
    Sevilla`** (`ProspeccionApifyTab` + `/api/super/prospeccion-apify`) para lanzar el
    agente a mano y ver el historial de runs/leads; (b) **canal WhatsApp wa.me**
    (`cron/crm-whatsapp-sevilla`, diario L-V 10:00): genera el enlace wa.me por vertical
    con el teléfono capturado y lo manda a Telegram con botón "Abrir WhatsApp" (1 toque,
    sin API de Meta); marca `leads.whatsapp_outreach_at` (**migración aplicada**);
    (c) **secuencia día 2** (`cron/crm-followup-sevilla`, L-V 11:00): 2º email a quien
    recibió el día 1 hace ≥3d, no rellenó formulario y no se dio de baja (usa
    `leads_web_tracking.mensaje_dia2_at`); (d) **backfill** (`cron/backfill-leads-sevilla`,
    diario 5:00): clasifica el vertical de leads de Sevilla sin `tipo_negocio` y saca
    email de su web; (e) **más cobertura** Apify (15 queries por zonas: Aljarafe, Sevilla
    Este, Triana, Dos Hermanas, provincia; cap 30/run). Lógica del agente extraída a
    `lib/prospeccion-apify.ts` y plantillas a `lib/crm-sevilla.ts` (compartidas cron+panel).
    `tsc`+`lint`+`build` en verde.

- **Panel de VISITAS de la web (GA4) en `/super → CRM → Leads`** (04/06/2026) — ✅ **FUNCIONANDO**:
  tarjeta "VISITAS DE LA WEB" (hoy/ayer/7d/30d sesiones + usuarios + páginas vistas + top
  fuentes/páginas), junto a la de formularios. Endpoint `GET /api/super/ga4-stats`
  (runtime nodejs): autentica como la **service account** `ia-rest-sa@ia-rest-drive`
  firmando un JWT con `GOOGLE_SA_JSON` (`jsonwebtoken`, scope `analytics.readonly`),
  exchange en `oauth2.googleapis.com/token`, y `batchRunReports` de la **GA4 Data API**
  sobre la propiedad **536881804** (`GA4_PROPERTY_ID`, con default hardcode al mismo nº).
  Si falta la credencial/acceso, la tarjeta muestra el error en vez de romper (`configured:false`).
  - **`GOOGLE_SA_JSON` ya está puesta en Vercel** (key de la SA en base64). Antes NO existía
    (el backup de Drive usa OAuth, no esta SA) → por eso al principio daba "Falta GOOGLE_SA_JSON".
  - **Gotcha clave (binding de la SA en GA4):** la UI de Google Analytics **rechaza** añadir
    service accounts como usuarios. Se resolvió creando el accessBinding por API con token OAuth
    del admin (Alberto, scope `analytics.manage.users`) contra el endpoint **`v1alpha`**
    (`POST .../v1alpha/properties/536881804/accessBindings`), NO `v1beta`. Rol: Lector.
  - **Dato de negocio:** mucho tráfico (≈49 hoy / 804 en 30d, sobre todo *Direct*) y 0
    formularios → el cuello de botella es **conversión**, no atracción.
- **Superpowers instalado (subset) — 04/06/2026** (rama
  `claude/install-superpowers-plugin-F47Fw`): vendorizados en `.claude/skills/` 6
  skills de metodología de obra/superpowers (`brainstorming`, `writing-plans`,
  `systematic-debugging`, `verification-before-completion`, `requesting-code-review`,
  `receiving-code-review`) + la meta-skill `using-superpowers`. Se añadió un hook
  `SessionStart` (`.claude/hooks/superpowers-session-start.sh`, cableado en
  `.claude/settings.json` sin tocar el `Stop`) que inyecta `using-superpowers` al
  arrancar. Motivo: `/plugin` no existe en Claude Code web → única vía es vendorizar +
  commitear (entorno efímero). Quedan fuera (opcionales, más ceremonia): TDD,
  worktrees, subagentes, dispatching-parallel-agents, executing/finishing, writing-skills.
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

### 2026-06-07 — MiniMax (consulta) → auditoría del pipeline de voz + fixes (PRs #74 y #75, MERGEADOS)
- **Consulta de Alberto:** ¿MiniMax mejoraría las comandas por voz? **Respuesta:** no para
  el ASR (Groq Whisper turbo ya óptimo; MiniMax usa Whisper por debajo y añade latencia);
  MiniMax solo aportaría **TTS premium** como feature nueva. De ahí pidió **auditar y probar**
  que todo es correcto, y "hazlo todo tú solo".
- **Método:** lectura del código real de toda la cadena + **verificación empírica en BD prod**
  (Supabase MCP, solo lectura) — clave para no inventar: `mensajes_turno` voz=0, `productos_86`=0,
  `comandas` por tipo (aviso=2 fantasma), CHECK real de `comandas.tipo`.
- **Hallazgos y fixes:** ver bloque detallado en "Estado actual" (arriba). Resumen: `aviso` y
  `86` por voz estaban **muertos** (anidados en `if(mesa)`); 8b leía `cache.mesas` inexistente;
  comandas fantasma; un "BUG-2" del regex se **descartó** tras `cat -A` (era correcto).
- **Entregado y MERGEADO a `main`:**
  - **PR #74** (squash `667d52d`): capa 8b recibe zonas + limpiezas (fallback zonas, var muerta,
    RPC `es_primera_comanda` desperdiciada) + `aviso`/`86` sacados de `if(mesa)` (ya funcionan) +
    sin comandas fantasma para aviso/86/recomendacion_vino + test `scripts/test-brain-patron.ts`.
  - **PR #75** (squash `37cbf1c`): `marchar` reusa la comanda activa (sin fantasma, no inserta
    items, no-op si no hay comanda activa). → las **5 funciones de voz quedan correctas**.
- **Nota git:** el squash de #74 rompió el enlace de ancestros → la rama necesitó re-merge de
  `main` (conflicto solo en este doc) para que #75 fuera mergeable. Force-push está bloqueado por
  el clasificador; se resolvió con merges no destructivos.
- **Verificado en cada paso:** `tsc` 0 · `qa` 0 · `next build` OK · `tsx scripts/test-brain-patron.ts` 14/14.
- **Aprendizaje:** `cat -A` antes de "arreglar" un regex evitó romper código correcto
  (los caracteres de control se renderizaban invisibles en el editor). Evidencia > suposición.
- **Pendiente verificación en vivo:** que aparezcan filas reales en `mensajes_turno` (voz) y
  `productos_86` cuando el personal dicte aviso/86 en prod (no se puede forzar desde aquí).

### 2026-06-04 (5) — Instalación de superpowers (subset) + hook SessionStart
- **Petición de Alberto:** intentó `/plugin install superpowers@claude-plugins-official`
  desde Claude Code **web** y falló. Diagnóstico: `/plugin` y los marketplaces solo
  existen en el Claude Code **local** (escritorio/CLI), no en el cloud efímero. La
  sintaxis era correcta; el canal no.
- **Análisis previo (pedido por Alberto):** superpowers (obra/superpowers v5.1.0, MIT)
  = 14 skills + metodología (TDD, depuración sistemática, "evidencia > afirmaciones",
  planificación, revisión). Coincide con dolores reales: el bache de CI de la PR #17
  (`tsc` sin deps no reproduce el build de Vercel) y testear sin red.
- **Decisión:** instalar **subset** (6 skills de alto valor/bajo roce, no las 14) +
  **hook SÍ** (recomendación de Claude: en cloud cada sesión arranca de cero, sin hook
  los skills quedan pasivos).
- **Hecho (rama `claude/install-superpowers-plugin-F47Fw`):**
  - `git clone --depth 1` del repo → copia de 7 carpetas a `.claude/skills/`
    (los 6 + `using-superpowers`), con sus archivos de apoyo.
  - Nuevo `.claude/hooks/superpowers-session-start.sh` (versión Linux, lee
    `using-superpowers/SKILL.md` desde el repo y emite el JSON `SessionStart`; descarté
    el wrapper polyglot Win/Unix del original por innecesario).
  - `.claude/settings.json`: añadido bloque `SessionStart` (`matcher:
    startup|clear|compact`) **conservando** el `Stop` de persist-memoria.
  - Nota en `AGENTS.md` (sección "Skills disponibles").
- **Verificado:** hook emite `hookEventName:"SessionStart"` con `additionalContext` de
  ~5.6k chars; `settings.json` válido con `Stop`+`SessionStart`; los 8 skills aparecen
  en la lista de Claude Code. Solo toca `.claude/` + docs → no afecta a `next build`.

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
