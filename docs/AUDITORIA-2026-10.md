# Auditoría 2026-10

## 04/10/2026 — pasada profunda
- 🔴 Trading: rutina `trading-analista` (claude.ai) no se dispara desde el 29/09 (logs Vercel: 0 llamadas a /api/trading* el 30/09 ni el 02/10; repo sin cambios). Acción de Alberto: claude.ai → Rutinas → trading-analista, revisar/reactivar y disparar a mano.
- 🟢 `sivra_mercado_booking`: arreglado integrando #4118 (ventanas con pisos ocupados ahora filtradas correctamente).
- 🟠 Pricing: 0 desplomes, 0 bajo mínimo. Las 8 alzas = evento falso `pricing_eventos_auto` id=1294 (Love The 90's, rate_date 2027-09-26 con evidencia de 2026; error de año de la IA de websearch) que infla 25-27/09/2027 en los 4 pisos vía vísperas. Validación de año en código en este PR; descartar la fila 1294 queda como acción manual de Alberto. Oscilante busto_reform 05/11/2026: ruido ±10 € dentro del raíl.
- 🟢 CIMA: falsa alarma. `queueDepth` (182) es el contador del ledger `cima_ficheros` (todas confirmed), crece ~1 por fichero; errores 0. Pendiente manual: reprocesar REC C0109 del 30/09 y 01/10 (`cima-reprocesar-cuarentena.yml`, repo asegura) y reclamar a Mapfre (SAU-24238, borrador en docs/borradores/2026-10-03-mapfre-sau-24238.md, solo con OK de Alberto).
- 🟡 Codeoscopic: 12 cotizaciones (25-30/09, 3,00 €); octubre 0 €. Alberto (04/10) respondió «Codeoscopic no tope aviso Telegram»: interpretado como gasto autorizado bajo el tope Avant2 + aviso Telegram (PR #4192), pendiente de que lo confirme.
- 🟢 TRASPASO-CORREDURIA.md:165 aclarado (hasta el 02/09/2026).
- 🟢 13 apps = matriz; 13/13 tsc; 1318 tests de guardia; seguros 1454/45/716; PRs abiertos sin conflicto; automerge vivo.
- Sin ejecutar: contraste de sesiones (`list_sessions`) y prueba de que los cepos fallan al romperlos.
