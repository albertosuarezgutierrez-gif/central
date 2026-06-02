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
