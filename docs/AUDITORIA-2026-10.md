# Auditoría 2026-10

## 04/10/2026 — pasada profunda
- 🔴 Trading: `trading_operaciones`/`trading_analizar`/`trading_puntuar` sin latido desde el 29/09 (~101 h, umbral 80 h). `trading_tesis`/`trading_paper_track` sin filas nuevas desde el 28/09. Avisado por el watchdog.
- 🔴 `sivra_mercado_booking`: `ok=false` en todas las pasadas desde el 27/09 (Booking devuelve `hotel_names_no_availability` en las 4 ventanas del escaparate propio, 10-12/10).
- 🟠 Pricing: 0 desplomes, 0 bajo mínimo, última pasada hace 1,5 h (43 noches), 4 pisos con motor y apply activos, `antelacion_k=0`; 8 alzas sin justificar y 1 noche oscilante.
- 🟠 CIMA: pulls reales cada pocas horas pero `queueDepth` 182 y procesados 0-1; ingesta DEGRADADA (C0109 sin procesar, Mapfre 9 pólizas sin renovar).
- 🟡 Codeoscopic: 12 cotizaciones en 7 días (300 cents, 6 descartadas); sin decisión de Alberto anotada.
- 🟡 `docs/TRASPASO-CORREDURIA.md:165` dice «El origen sigue siendo la fuente viva» y `:126` que está congelado desde el 02/09.
- 🟢 13 apps = matriz; 13/13 tsc; 1318 tests de guardia; seguros 1454/45/716; PRs abiertos sin conflicto; automerge vivo.
- Sin ejecutar: contraste de sesiones (`list_sessions`) y prueba de que los cepos fallan al romperlos.
