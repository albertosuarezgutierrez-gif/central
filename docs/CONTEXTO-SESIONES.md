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
