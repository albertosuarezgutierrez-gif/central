# Fase 0 - Uso real del CRM `asegura` (02/11/2026, solo lectura)

## 1. Tráfico Vercel (prj_4jVSN6...)
- Web Analytics NO activado: no hay pageviews/UA medibles. Runtime logs: consultas de 7d/14d/30d agrupadas dieron timeout; solo se obtuvo 3d y 24h (límite de la herramienta, no ausencia de datos).
- Producción, últimos 3 días, logs por ruta: /api/crons/cima-pull 212 · /api/crons/codeoscopic-polling 14 · /api/public/cotizador 4 · /api/internal/cima/health 2 · / 1 · /api/health 1.
- Páginas (dashboard) con sesión humana: ninguna en 3d. Único POST a `/` = Server Action malformada ("Server Reference ID ... Received x") = escáner/bot, no humano.
- /api/public/cotizador: los 2 errores de las últimas 24h son de un deployment PREVIEW de dependabot (e2e, "PII_ENCRYPTION_KEY is required"). operational_events source=api_public_cotizador: 72 en 30d, siempre en pares/días sueltos (2,2,16,18...) con lead_phone nulo = patrón e2e/PR, no clientes.
- Webhooks Codeoscopic /api/webhooks/codeoscopic: 0 peticiones en los 3d; `codeoscopic_cuarentena_crudo` tiene 1 fila total sin fecha de recepción (0 en 30d). No verificado a 30d por timeout de logs. Evidencia indirecta: sin webhook entrante reciente. Sin tráfico /api/webhooks/whatsapp ni linear en 3d.
- UA/orígenes: la herramienta no los devuelve (solo path/región/entorno). No verificable.
- Uso humano de pantallas: NO hay evidencia en 3d. Auth de pantallas vive en el Supabase de Manuel (no consultable). Falta confirmar con Manuel.

## 2. GitHub Actions (últimos ~100 runs, desde 26/10)
Con schedule y verdes: cima-pull 20/20 success (05:30/11:30 + reconcile, última 01/11 17:12) · codeoscopic-polling 32/32 (cada ~30min-horas; scan_done scanned=0) · cima-health-alert 7/7 · cima-reprocesar-cuarentena 7/7 · codeoscopic-webhook-health 6/6 · e2e-smoke 6/6 · security-dast 1/1.
FALLA: pre-launch-checklist (schedule diario) 7/7 failure = ruido, no ingesta. security-ci en PR de dependabot: failure.
Solo dispatch (sin runs en ventana): cima-rescate-lote, cima-rescate-manual. Ruido/CI: linear-check, slack-github (skipped), whatsapp-bot-eval, qa-post-deploy, e2e-playwright, dependabot.
Ninguno de los de ingesta hace nada más que llamar al endpoint del CRM + alerta (Telegram/Slack).

## 3. BD (proyecto wswbehlcuxqxyinousql, pg_stat_statements acumulado desde 26/04/2026)
Escrituras de crm_seguros (calls): operational_events 5.432+1.121 · poliza_coberturas delete 1.234 / insert ~600 · poliza_recibos insert 798+522 · poliza_intervinientes delete 648 / insert 341+218+69 · polizas update ~1.100 · cima_ficheros insert 644 · cima_cuarentena_crudo 396 · siniestros insert 369 · codeoscopic_cuarentena_crudo 131 · clientes insert 60 / cotizaciones 60 (=cotizador, e2e) · liquidacion_movimientos 57. Lecturas: clientes por dni_lookup_hash, polizas, cima_ficheros, codeoscopic_projects (323).
operational_events 30d por source: cron.cima-pull (started/completed 178 c/u; reconcile_resumen 29) · cima_ingestion (recibo_actualizado 138, poliza_persisted 73, intervinientes_art14 54, siniestro_actualizado 43, recibo_persisted 31, eiac_parcial_skip 19, siniestro_persisted 7, review 3) · cron.cima-health-alert 30 · cron-cima-sincro 25 (NO es del CRM-Vercel: otra fuente, probablemente plataforma) · api_public_cotizador 72 (e2e). Resto: manual/claude_session.
cima_ficheros 30d: 54 confirmed (REC 31, POL 16, SIN 7); último 30/10. Desde ~30/10 cima-pull ve 235 pendientes en cola pero nuevosPendientes=0 y processed=0 (cola ya ingerida; estable).

## 4. Crons vercel.json
- /api/crons/overdue-digest (07:00 L-V): NO aparece en logs 3d (ni en top de rutas) -> no ejecuta/ no loguea. Irrelevante (Linear).
- /api/crons/vencimientos-detector (06:00): NO aparece en logs 3d; flag ofertas OFF. Superado por apps/asegura.
- Los crons "vivos" son en realidad los de Actions llamando a /api/crons/cima-pull y /api/crons/codeoscopic-polling (Bearer).

## 5. Lista cerrada de funciones vivas del CRM
PORTAR (escriben hoy, con evidencia):
1. Ingesta CIMA: /api/crons/cima-pull (+ reconcile 06:00 dentro del mismo endpoint) -> persist POL/SIN/REC, cuarentena (cima_cuarentena_crudo), cima_ficheros, operational_events. Evidencia: 20/20 runs y 54 ficheros confirmados en 30d.
2. cima-reprocesar-cuarentena (06:30, 7/7) -> /api/internal/cima/reprocesar-cuarentena.
3. cima-health-alert (10:00, 7/7) -> /api/internal/cima/health (2 hits/3d) + aviso Telegram/Slack.
4. cima-rescate-lote/manual: dispatch, sin uso en ventana; portar como herramienta de operador (baja prioridad).
PORTAR/DECIDIR (vivos pero vacíos):
5. codeoscopic-polling (32/32 success, scanned=0 -> nada que sondear) y codeoscopic-webhook-health: vivos pero sin trabajo; el webhook entrante sin tráfico visible. Decidir con la URL nueva api.grupoasegura.es (pendiente de Codeoscopic).
APAGAR (sin evidencia de uso): overdue-digest, vencimientos-detector, pre-launch-checklist (falla a diario), linear-check, slack-github, whatsapp-bot-eval, qa-post-deploy, e2e-*, security-*, cotizador público y las 63 pantallas, webhooks whatsapp/linear.
Pendiente de confirmar fuera de mi alcance: uso humano por Manuel (auth en Supabase de Manuel), tráfico a >3d (logs Vercel dan timeout; probar por deploymentId o CLI `vercel logs`), UA/origen de peticiones.
