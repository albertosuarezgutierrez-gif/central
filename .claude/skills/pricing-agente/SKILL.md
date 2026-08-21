---
name: pricing-agente
description: >
  Agente de pricing IA autónomo de SIVRA (pisos turísticos). Úsalo si Alberto pide
  "corre el agente de precios", "revisa precios", o en la sesión recurrente de tarificar.
  Reúne mercado/eventos/ocupación/costes, DECIDE el precio y lo APLICA por los raíles del
  Paso 4 (nunca escribe en Smoobu directo). Memoria = BD `pricing_aprendizaje`. Sin secretos.
---

# Agente de pricing IA — sivra (router)

**Qué hace:** cada ~7 días (sesión programada), el agente reúne TODAS las variables por piso y
fecha (mercado real por zona vía conectores MCP de viajes, eventos, ocupación, costes, reglas),
DECIDE el precio para máximo margen neto (pelotazo en eventos, ramp anticipado), lo APLICA por
los raíles de `POST /api/sivra/pricing/aplicar-propuesta` en plataforma, mide los resultados del
ciclo anterior y escribe el aprendizaje en la BD (`pricing_aprendizaje` — la única memoria que
sobrevive a la sesión efímera). Cierra con informe a Alberto y auto-informe en la bitácora.

## 🚨 No romper / crítico

- **NUNCA escribas en Smoobu directo.** La escritura pasa SIEMPRE por los raíles del Paso 4
  (`aplicar-propuesta`): suelo de coste, tope ±/día, pausa global, circuit-breaker, auditoría.
  Los raíles van en el código, no en la confianza al LLM (lección de los 125€).
- **Arranca SIEMPRE en `dryRun: true`**; a vivo solo tras revisar `pricing_decisiones`.
- **USA PLATAFORMA, NO SIVRA:** la red de la rutina solo alcanza
  `https://plataforma-ten-flame.vercel.app` (los dominios de sivra dan 403 en el proxy).
  Endpoints: `/api/sivra/mercado/ingest` y `/api/sivra/pricing/aplicar-propuesta`.
- **Auth: `Authorization: Bearer {ALERTA_TOKEN}`** (header-only). **NO pidas ni uses
  `CRON_SECRET`** en prompts de rutinas. Con `ALERTA_TOKEN` el Paso 4 es SIEMPRE dry-run
  forzado (`dryRunForzado:true`) — es lo correcto, no un fallo: Alberto aplica en vivo.
- **🪤 El motor vivo es el de PLATAFORMA, no el de sivra.**
  `apps/plataforma/app/api/sivra/pricing/apply`. La copia `apps/sivra/lib/pricing-engine.ts` está
  **RETIRADA** (su ruta devuelve 410 desde el 18/07/2026) y se lee igual de bien: leerla lleva a
  diagnósticos falsos. Comprueba qué copia corre ANTES de acusar al motor de un fallo — pasó el
  20/08/2026. Detalle en `references/estado-y-protocolo.md`.
- **NUNCA fabriques `pricing_decisiones` a mano.** Si el Paso 4 falla dos ciclos seguidos,
  avisa por Telegram (`/api/internal/alerta`), nunca falles en silencio.
- Circuit-breaker (HTTP 409) → NO lo fuerces: reparte la subida en varios ciclos.
- **NO actives `apply_enabled` de pisos nuevos sin OK explícito de Alberto.**
- Sin secretos en chat/commits (solo nombres de variable); no toques RLS/buckets/GRANTs de la
  BD compartida; al cerrar actualiza `docs/CONTEXTO-SESIONES.md`.

## Índice de references/ — lee SOLO lo que necesite la tarea

- **`references/ciclo.md`** — el manual operativo completo: función objetivo, tabla de
  datos/fuentes (tablas BD + conectores MCP por ventana temporal), el ciclo Pasos 0-7
  (fundación, memoria, variables, decisión, aplicación por raíles, aprendizaje, informe,
  repara-no-solo-reportes), raíles y seguridad. **Léelo siempre que vayas a correr el ciclo**
  o a tocar cualquier paso concreto.
- **`references/estado-y-protocolo.md`** — estado vivo (calibraciones, pisos en vivo vs
  dry-run, premio de mercado 22/07, landmine canal Booking, pendientes), recurrencia/autonomía
  (qué va por crons y qué necesita sesión), auto-informe obligatorio en
  `docs/AGENTES-BITACORA.md` y preflight del canal de aviso Telegram. **Léelo al empezar la
  pasada (estado + preflight) y antes de cerrar (auto-informe).**
