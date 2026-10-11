# Auditoría 2026-10

## 04/10/2026 — pasada profunda
- 🔴 Trading: rutina `trading-analista` (claude.ai) no se dispara desde el 29/09 (logs Vercel: 0 llamadas a /api/trading* el 30/09 ni el 02/10; repo sin cambios). Acción de Alberto: claude.ai → Rutinas → trading-analista, revisar/reactivar y disparar a mano.
- 🟢 `sivra_mercado_booking`: arreglado integrando #4118 (ventanas con pisos ocupados ahora filtradas correctamente).
- 🟠 Pricing: 0 desplomes, 0 bajo mínimo. Las 8 alzas = evento falso `pricing_eventos_auto` id=1294 (Love The 90's, rate_date 2027-09-26 con evidencia de 2026; error de año de la IA de websearch) que infla 25-27/09/2027 en los 4 pisos vía vísperas. Validación de año en código en este PR; descartar la fila 1294 queda como acción manual de Alberto. Oscilante busto_reform 05/11/2026: ruido ±10 € dentro del raíl.
- 🟢 CIMA: falsa alarma. `queueDepth` (182) es el contador del ledger `cima_ficheros` (todas confirmed), crece ~1 por fichero; errores 0. Pendiente manual: reprocesar REC C0109 del 30/09 y 01/10 (`cima-reprocesar-cuarentena.yml`, repo asegura) y reclamar a Mapfre (SAU-24238, borrador en docs/borradores/2026-10-03-mapfre-sau-24238.md, solo con OK de Alberto).
- 🟡 Codeoscopic: 12 cotizaciones (25-30/09, 3,00 €); octubre 0 €. Alberto (04/10) respondió «Codeoscopic no tope aviso Telegram»: interpretado como gasto autorizado bajo el tope Avant2 + aviso Telegram (PR #4192), pendiente de que lo confirme.
- 🟢 TRASPASO-CORREDURIA.md:165 aclarado (hasta el 02/09/2026).
- 🟢 13 apps = matriz; 13/13 tsc; 1318 tests de guardia; seguros 1454/45/716; PRs abiertos sin conflicto; automerge vivo.
- 🟢 Typecheck 13/13 apps (asegura con sus dos schemas) y `pnpm test` verdes: guardián 1509 pass, module-seguros 1891, -pii 48, -portal 809.
- Sin ejecutar: contraste de sesiones (`list_sessions`) y prueba de que los cepos fallan al romperlos.

## 11/10/2026 — pasada profunda (rutina programada)
- 🔴 `subastas_idealista` (radar Idealista por conector): último latido ok **27/09 07:36** (330 h; umbral 30 h). Las alertas de correo de Idealista están quitadas desde el 24/09, así que el radar de casas de playa está MUDO (no «sin casas»). Acción de Alberto: claude.ai → Rutinas, comprobar que corre y que lleva conector Idealista + `PLATAFORMA_URL`/`ALERTA_TOKEN`. Sin reparación automática en curso (`agente_reparaciones` vacía 7 d).
- 🟡 `psd2-sync`: último movimiento nuevo 08/10 06:00 (68 h > 54 h). Hay días sueltos con 1-3 filas y el latido `psd2_health_check` (semanal, 07/10) estaba ok; puede ser actividad baja. Mirar con el próximo latido (~14/10).
- 🟡 Codeoscopic/Avant2: 21 cotizaciones 05-09/10 (12 facturables 6,00 €, 9 descartadas 4,50 €; total 10,50 €). Coherente con la memoria del 05/10 («casi todo pruebas en prod → sandbox») y con `correduria_tope_avant2` (6 € de 70 €). Sin decisión nueva anotada para las del 06-09/10.
- 🟠 Pricing: 0 desplomes, 0 bajo mínimo, 0 alzas sin justificar, última pasada hace 1,5 h (91 noches), palancas todas on, `antelacion_k`=0, `min_price` en los 4 pisos. **18 combinaciones piso/fecha oscilantes** (≥3 cambios de sentido en 7 d): ciclo límite del motor, revisar.
- 🟡 Latidos en rojo conocidos: `ses_transporte` (pendiente conocido, sin establecimiento dado de alta) y `cima_siniestros_corte_compania` (alerta 10/10 compañía C0468; dato de negocio, no fallo de cron).
- 🟢 CIMA: pulls cada ~2 h con evento; `queueDepth` 204 = filas del ledger `seguros.cima_ficheros` (no cola atascada; mismo criterio que el 04/10), 0 errores, `correduria_ingesta` sin ficheros atascados. Los 4 crons de heartbeat restantes y los latidos semanales dentro de umbral.
- 🟡 PRs: #4319 (bitácora trading, no-draft, 6 d) está `blocked` y su diff real es 169 ficheros/20 commits (rama desfasada): el automerge no lo coge. Cerrar y rehacer limpio desde `main`. Borradores >5 d: #4258, #4257, #3995 (bitácoras/fiscal), #3755 (auditoría ligera 27/09). Automerge vivo (runs hasta 02:00 UTC de hoy).
- 🟢 13 apps = matriz de `tests.yml`. `docs/SKILLS.md` no listaba `google-contactos` → añadida.
- 🟢 Typecheck 13/13 apps (asegura con sus dos schemas) y `pnpm test` verdes: guardián 1509 pass, module-seguros 1891, -pii 48, -portal 809.
- Sin ejecutar: contraste de sesiones (`list_sessions` no disponible en esta sesión) y rotura deliberada de cepos.
