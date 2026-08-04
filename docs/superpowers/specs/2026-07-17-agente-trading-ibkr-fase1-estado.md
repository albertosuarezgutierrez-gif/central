# Agente trading-analista (IBKR) — Fase 1 · Estado y prompts (17/07/2026)

> Complementa al diseño (`2026-07-17-agente-trading-ibkr-design.md`) y al plan
> (`../plans/2026-07-17-agente-trading-ibkr.md`). Aquí queda el estado de infra tras el merge del
> PR #961 y los prompts listos para arrancar el agente. El secreto NUNCA va en el texto.

## Estado infra
- **Chrome (read-only):** PR #961 MERGED ✅ · 20 checks verdes ✅ · un preview Ready ✅.
  Producción NO verificada por Chrome (SSO).
- **Claude Code (vía conector Vercel/API):** PRODUCCIÓN de `plataforma` READY con el trading incluido
  — deploy del merge `79cb378` (target production, READY) + deploy posterior #965 (target production,
  READY). Endpoints `/api/trading/*` vivos en https://plataforma-ten-flame.vercel.app.
- **Pendiente (Alberto):** dry-run del agente (claude.ai/code) + billing Supabase (`efncqyvhniaxsirhdxaa`).

## Setup del entorno (claude.ai/code) — toggles, no prompt
- Repo `central` adjunto · conector **Interactive Brokers** ON (FMP opcional).
- Env vars del entorno (NUNCA en el prompt): `CRON_SECRET`, `PLATAFORMA_URL=https://plataforma-ten-flame.vercel.app`.

## Prompt de la RUTINA (trigger diario ~22:15 Sevilla)
> Eres el agente `trading-analista` (Fase 1, SOLO paper). Repo `central` adjunto; skill en
> `.claude/skills/trading-analista/SKILL.md`. IBKR MCP encendido.
> REGLA DE ORO: NUNCA órdenes reales en IBKR; solo lectura de cuenta + endpoints de plataforma.
> Credenciales: CRON_SECRET y PLATAFORMA_URL desde process.env; nunca en texto/logs.
> Pasada: NAV (get_account_summary) → watchlist (trading_watchlist A/B/C) → por símbolo get_price_history
> ~120 velas (+FMP si hay) → POST /api/trading/analizar (Bearer CRON_SECRET) → POST /api/trading/puntuar
> → Telegram top 2-3 ideas + pulso paper (formato 2.162,49€).
> Puerta Fase 2: nada de ejecución real hasta rentabilidad fuera de muestra (spec propio).

## Prompt del DRY-RUN (disparar la rutina una vez)
> Ejecuta AHORA una sola pasada de `trading-analista` (DRY-RUN, no programes nada). Repórtame sin revelar
> el secreto: nº filas en trading_tesis, top de ideas de /analizar (símbolo/dirección/estrategia/confianza/
> operada), y si hay orden en trading_paper_orden. Si un POST da 401, di si fue Bearer o SSO y párate.

## Prompt CHROME (read-only, sin secretos)
> Abre el repo central en GitHub. Verifica: PR #961 MERGED + checks verdes. No ejecutes trading, no
> manejes secretos, no entres a dashboards con SSO.

## Chuleta de respuestas a dudas del agente/Chrome
- Pide el secreto → "No; va por env de claude.ai/code, tú solo verificas cosas públicas."
- POST 401 → "Bearer = CRON_SECRET del env no coincide con Vercel; SSO = usa URL de producción."
- Cualquier efecto real (operar/pagar/mergear/BD) → "No lo hagas, para y pregunta."

## Orden real
Setup → Rutina → Dry-run → pegar el reporte y revisar antes de dejarlo diario. El billing va en paralelo.
