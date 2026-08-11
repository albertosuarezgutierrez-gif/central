# 🧠 Memoria de sesiones — central (repo GitHub: ia.rest → renombrar)

> Contexto persistente entre sesiones de Claude Code. El entorno cloud es
> **efímero** (el contenedor se borra al acabar), así que lo único que sobrevive
> es lo commiteado aquí. Este archivo es el "estado vivo" del proyecto entre sesiones.
>
> **Cómo se mantiene:** al terminar cada sesión, Claude añade una entrada nueva
> arriba del todo y actualiza el estado si algo cambió. Un hook `Stop`
> (`.claude/hooks/persist-memoria.sh`) commitea y empuja este archivo automáticamente.
>
> **🚨 Regla de tamaño (ahorro de contexto):** cada entrada, **máximo ~8 líneas**:
> qué se hizo, decisiones, pendientes y nº de PR. El detalle ya vive en el PR y en
> el código — NO re-narrarlo aquí. Fecha SIEMPRE en la primera línea `(dd/mm/aaaa)`.
>
> **🔄 Rotación mensual:** aquí vive SOLO el mes corriente. Los meses cerrados se
> archivan en `docs/memoria/AAAA-MM.md` con `node scripts/rotar-memoria.mjs`
> (idempotente; lo dispara `/auditoria-diaria` a primeros de mes). La historia no
> se pierde: se lee de `docs/memoria/` solo cuando hace falta.
>
> **📌 «Estado vivo» (bloque al final):** SOLO pendientes y decisiones abiertas, en
> sub-bullets de 1-3 líneas — no es un segundo diario: el relato de cada sesión va en su
> entrada fechada y el detalle en el PR. Al cerrar un pendiente, borra su bullet; al
> actualizar el bloque, re-fecha su cabecera (si su fecha queda en un mes cerrado, la
> rotación se lo lleva al archivo).
>
> **Formato de cabecera de entrada:** `- **… (dd/mm/aaaa).**` o `### … (dd/mm/aaaa)` —
> son los ÚNICOS que `rotar-memoria.mjs` reconoce como entrada; una cabecera `## ` se
> funde con la entrada anterior y se archiva mal.
>
> Para arquitectura/módulos completos → skill `ia-rest-maestro`. Esto es solo el
> registro de qué se hizo y qué queda.

---

### 📈 (11/08/2026) /trading rediseñado: hero con las 2 respuestas (empresas + rentabilidad)
- Petición de Alberto: la página daba mucha info; lo que importa es qué empresas interesan y cómo va la cartera.
- Hero doble arriba (💡 señales 📈 + top ranking + compras del agente · 📊 mediana vs SPY + curva + tramo escalera);
  onboarding condensado a 1 línea; forward paper, cartera cohetes y caza-cohetes PLEGADOS.
- Nuevo `DetallePerezoso.tsx` (details con montaje perezoso — la cartera de estudio ya no paga fetch+Recharts si nadie la abre).
- Honestidad de datos: banner «datos parciales» si falla una query (antes un fallo de BD pintaba el 🌱 vacío),
  alpha/IPO null ya no salen como ⚠️/0€, celda de señal «no calculado» fuera del top-20; fixes móvil 320px + hex→tokens.
- **PR #1368 MERGEADO y verificado en producción** (hero servido, 0 errores runtime; revisión previa con
  agente de diseño). Follow-up: 401 de `/api/trading/cartera-estudio` al invitado ya no se pinta como «fuente caída».

### 🔀 (11/08/2026) Rescatados los 2 PRs con semanas en conflicto: #755 y #1055 MERGEADOS
- Orden de Alberto tras el FYI de la auditoría. Conflicto en ambos = memoria (sus entradas de julio
  chocaban con la rotación mensual) + radiografía generada; las entradas se archivaron en
  `docs/memoria/2026-07.md` (05/07 CSV con su caveat; 21/07 mariscos) y se regeneró la radiografía.
- **#755** banca: importar extractos CSV (tests 6/6; ⚠️ caveat: re-importar el export completo sin IBAN duplica el ledger).
- **#1055** NUEVA vertical `apps/mariscos` + `@central/module-pesca` (Fase 1 trazabilidad/etiquetado, 8/8 tests, build OK).
  **Pendiente para darla por viva:** proyecto Vercel (Root `apps/mariscos`), ejecutar su SQL en Supabase
  (preview→prod), sembrar cuenta real de Mariscos González; Fase 2 báscula/etiquetadora.

### ⚖️ (11/08/2026) Contraste diferido: la 2ª fuente juzga AYER, que es lo que sí ha publicado
- Mergeado **#1363** (el contraste del mismo día dejaba de vetar precios buenos) y desplegado en prod.
  Efecto colateral asumido: a las 20:30 UTC la fuente casi nunca tiene el cierre del día → contraste inerte.
- Alberto elige la **opción (a)**: comparar el cierre que la fuente SÍ publica de la sesión D contra
  nuestro `precio_ref` de D. Siempre disponible, cero falsos vetos; el remedio cambia — en vez de vetar
  el precio de hoy, **anula la tesis de ayer** (y su resultado) antes de recalcular el walk-forward.
- `juzgarDiferido` (puro, 9 tests) con dos frenos: un **split** desplaza TODAS las sesiones por el mismo
  factor → no se anula; si discrepa en **>½ de los símbolos** (≥4 con dato) la sospechosa es la FUENTE y
  tampoco se anula nada. El mínimo de 4 salió de un fallo real: sin él el interruptor se disparaba con un
  solo símbolo y la guardia quedaba muda justo en el caso que existe para cazar.

### 🔧 (10/08/2026) Pricing: el reparto mes/global del factor de demanda deja de perderse (#1361)
- `factorDemandaFecha` decidía por fecha si la demanda se mueve con la ocupación DEL MES o la anual,
  pero esa decisión solo viajaba en la respuesta HTTP del cron (nadie la guarda) — y su `.catch(() => [])`
  hacía que un fallo de la consulta cayera TODO a factor global sin un solo error en el log.
- Fix: `pricing_applied.demanda_fuente`/`demanda_gateada` por fecha (filas viejas a NULL a propósito) +
  aviso Telegram si la ocupación mensual es ilegible. `ok` no pasa a false (degradación, no fallo).
  Migración `2026-08-10_pricing_applied_demanda.sql` aplicada antes que el código. Detalle en skill
  `pricing-agente` (`estado-y-protocolo.md`).

### 🛡️ (10/08/2026) La 2ª fuente vetaba precios BUENOS: el contraste comparaba contra la sesión anterior
- La pasada del lunes 10/08 corrió **entera y por primera vez con las 4 huellas + el latido
  `trading_analizar`** (20:33 UTC). Pero vetó 8 de 21 símbolos en `/analizar` y descartó 5 precios
  en `/puntuar` — **ninguno estaba mal**.
- Causa: la pasada corre a las 20:33 UTC, media hora tras el cierre de Wall Street; Stooq/Yahoo aún
  publicaban el cierre del **viernes 07/08** (verificado contra IBKR) y `DIAS_CONTRASTE_MAX = 5` lo
  aceptaba *como si fuera el de hoy*. Cada «divergencia» era el hueco viernes→lunes de esa acción.
- Arreglo (**PR #1363**): el contraste **solo acepta el cierre de la MISMA sesión** (`juzgarPuntos`,
  puro y testeado con los datos reales del 10/08); si la fuente va por detrás → `desfasados`, que no
  veta y se canta en el latido. Consecuencia asumida: **el contraste queda inerte casi todas las
  noches** a esta hora — visible, no silencioso. Pendiente de decisión de Alberto: contraste diferido
  (comparar el cierre publicado contra nuestro `precio_ref` de ESA fecha) o cron aparte unas horas después.

### 💸 (10/08/2026) Decisión: Alberto deja de operar en real hasta aviso del agente
- Dos operaciones manuales reales en IBKR hoy con stops demasiado pegados: SPCX (270 acc.
  a 134,25 $, stop −2,35% saltó en 1 h, −855,10 $; luego recuperó POR ENCIMA de la entrada)
  y PLTR (200 acc. a 178,04 $, stop −0,72% saltó en 46 min, −258,77 $). Total −1.113,87 $.
  Confirmación en vivo de H9: el stop convierte el bache temporal en pérdida cerrada.
- **Decisión (sesión de solo charla, anotada a mano):** no operar más en real por impulso;
  esperar los avisos del agente `trading-analista`. OJO: el agente sigue en Fase 1 (paper) —
  sus ideas por Telegram son simuladas y la puerta a Fase 2 sigue cerrada (decisión de Alberto).
- Alberto pide **aviso explícito cuando el forward justifique plantear Fase 2** (hoy lejos:
  hit rate 26-29%, retorno medio ~0 sobre n=103 en `trading_estrategia_stats` al 08/08).

### ✅ (10/08/2026) Confirmación final: motor 100% operativo y probado tras la baja de PriceLabs
- **Prueba reina:** snapshot Smoobu 10/08 = últimas escrituras del motor del 09/08 **al euro en
  604/604 fechas** (129/205/103/167 por piso). PL mudo post-pausa (0 divergencias 14:30↔20:30).
- Alertas «precio_revertido» del guard 07:31 = restos PRE-pausa (últ. escritura 08/08, PL las pisó
  antes de las 15:00 del 09/08); la pasada 08:30 de hoy ya re-escribió las 7 → se autolimpian.
- Pasada 08:30 sana: 455 escrituras, 0 bajo suelo, 0 bajadas fuera del raíl (106 subidas sobre-raíl
  = suelos/eventos/ancla, legales por diseño). Previstos v2 verificado en vivo (House 25-nov 467 =
  base×1,25 ASEICA). 1ª reserva House bajo el motor: 11-13/09, 672€/noche ≈ 1,4× p50 fiable.
- **Vigilancia diaria 09:00 UTC** (`trig_01Eagedr...`) sigue hasta el OK de Alberto; PR #1345 mergeado.

### 💶 (10/08/2026) Pricing sivra — ciclo semanal completo (4 pisos)
- Ciclo semanal del agente de pricing: los 4 pisos (no solo los ya en vivo). Mercado real Booking
  (aforo real) para may/jun/jul-27 (estaban con 1 sola fecha, rancios) — 120 comps nuevos, ninguno a 0.
  Propuestas dry-run aplicadas por los raíles en los 4 pisos; circuit-breaker sano.
- Hallazgo: el bucket MENSUAL de junio-27 queda inflado por Karol G (11-13 jun) — el finde normal
  (25-27 jun) vale 126€ real, no los 339€ del mes. Usar siempre fecha exacta, no el mes, en junio.
- Pendiente: confirmar con Alberto si la venta de Busto-Feria (17-abr-27) a 103€ es real (sin fila en
  `incomes`) o un bloqueo/desfase; revisar 3 fechas de Luxury marcadas "no_disponible" pese a libres.
- Detalle en `pricing_aprendizaje` y `pricing_decisiones` (fuente=`agente_ciclo_10_08_2026`).

---

### ⏳ (09/08/2026) Last-minute encendido · sin techo de precio (decisión) · barrido PL de baja
- **Decisión de Alberto (2 palancas):** (1) **SIN techo** — `max_price` queda NULL a propósito
  («no tope! final copa rey hay q aprovechar»; el raíl permite bajar a tiempo). NO re-proponer.
  (2) **Last-minute ON**: `lastminute_k=0.5` en los 4 pisos, con su condición «que ganemos dinero,
  si no prefiero no vender» — cubierta porque el descuento va ANTES de min_price/suelo estacional/raíl
  y las noches de evento no se rebajan. De paso `seasonal_floor_k` 0→1 en Dúplex/House (venían del
  dry-run). SQL registro: `prisma/sql/2026-08-09_lastminute_activado.sql` (aplicado ~16:00 UTC).
- **Barrido «PriceLabs de baja»** en memoria/skills/facturas-control/UI → PR #1345 (draft).

### 🌊 (09/08/2026) Lente costa norte en mercado: preferencia por viviendas de playa Asturias/Cantabria
- **Preferencia de Alberto** (con una casona en Colunga, 235.000€/257 m²/~914€/m²): «da preferencia a
  casas como estas, cerca de playa en el norte». Nueva lente PURA `costa-norte.ts` en `module-subastas`
  (litoral asturiano+cántabro, matching por palabra completa — «Isla»/«Salinas» fuera por Isla Cristina)
  + `lenteCostaNorte`: viviendas sin señales de obra AUNQUE no lleguen a chollo (en el norte casi nunca
  hay mediana de zona; referencia null SE DICE, no se calla). `lentesMercado()` en plataforma: sección 🌊
  en el Telegram del cron `subastas-mercado` y en /subastas; chollos de esas zonas etiquetados 🌊 y primero.
- **MERGEADO** (#1346 + fix #1347) y probado contra el corpus real (741 comps, 99 en zona norte — las
  alertas ya cubren Gijón/Villaviciosa/Llanes): lente 93 viviendas, 15 chollos 🌊, 0 falsos positivos del
  sur. El fix #1347: un descuento de derribo (>50%) saca de la lente (la derruida de Llanes salía 1ª con
  −73% y título limpio — la doctrina del peaje de obra aplica también aquí). Prod desplegado y verificado.
- **Refinada por Alberto y MERGEADA (#1349):** solo CASAS (pisos fuera), tope 230.000€, +Islantilla
  como zona preferente; orden rebajadas→particular→descuento (ordenan, NO filtran — exigir rebaja
  escondería el recién publicado mal preciado). `dedupeRelistados`: Idealista re-publica con ref nuevo
  (piso de Ceares duplicado en la UI, verificado en BD) — colapso por (portal,título,precio,m²) al corpus
  entero. Corpus real: 11 casas ≤230k (Villaviciosa −49%, 6 adosados Islantilla), 43 re-listados fuera.
- **3ª ronda (#1351, mergeado):** (a) la preferencia llega a SUBASTAS — vivienda en zona 🌊 suena SIEMPRE
  en `subastas-avisos` con cabecera «🌊 TU PREFERENCIA» aunque el filtro rentable/limpia la silenciara
  (honestidad: el aviso dice si va sin verificar); (b) **Matalascañas** entra como zona preferente tras
  medirla en vivo (Fotocasa: 216 anuncios vs 133 Islantilla, mediana 2.857 vs 3.308 €/m²); (c) pestaña
  **🔥 Oportunidades** default de /subastas (diseño del agente Plan): bloque 🌊 fijo + lista única
  portal+subastas por atractivo, tarjeta compacta de subasta, filtros casas/rebajados/particular/fuente.
- **4ª ronda (#1353, mergeado y READY en prod):** Alberto creó la alerta de Idealista en Matalascañas SIN
  límite de precio (casas/adosados) → `ZONAS_SIN_TOPE = ['Matalascañas']` en la lente (el tope 230k sigue
  en el resto); copy de Telegram y /subastas lo dicen. Las SUBASTAS ya iban sin tope (el aviso forzado 🌊
  nunca filtró por precio). Decisión de estrategia: Asturias = chollo puro con gestora (~20-25% comisión);
  Huelva = uso mixto autogestionado — el radar vigila ambas. Skill `plataforma-maestro` actualizada.
- **5ª ronda — rediseño de 🔥 Oportunidades** («veo muy destartalada la página y poco clara», agente de
  diseño): UNA tarjeta `TarjetaOportunidad` para chollos/preferentes/subastas (precio 20px primero, chips
  homogéneos `ChipUI` con tokens --positive/--warning/--info, evidencia €/m² siempre visible, resto plegado
  en «Más datos»); cabecera con contador real + explicación en `<details>`; 🌊 en caja --info-bg colapsada
  a 5 con «Ver todas (N)»; filtros en fila scrollable (320px OK). Solo presentación, lógica intacta.
- **Repaso programado 12/08 07:00 UTC** (send_later `trig_01AzUvq8vW2K8Aan4T7HG7c6`): verificar corpus
  Matalascañas creciendo, lente sin tope, avisos 🌊 de mercado y subastas, pestaña 🔥 sin duplicados.
- Ojo: la lente solo ve las alertas guardadas — para vigilar más norte, crear alertas de Idealista en
  esas zonas. Galicia/Euskadi pendientes (patrón Cádiz).

### 🎯 (09/08/2026) Los 4 pisos bajo el motor · PriceLabs de baja · previstos v2 · fix verificado en vivo
- **Decisión de Alberto:** «el agente coge las riendas de los 4 apartamentos». Los 4 con
  `apply_enabled=true` + `channel_markup=1.0` (SQL aplicado tras deploy del PR #1337, mergeado).
  Pasada real 14:30 verificada: 4 pisos escritos, anclas al euro de lo predicho (House 4-sep 421€,
  Dúplex 13-nov 149€…), raíl ±20% respetado vs ancla diaria; 0 alertas nuevas.
- **PriceLabs:** Alberto pausó Dúplex/House en PL ~15:00 UTC (medido: 1.140/1.653 escrituras suyas
  sin motor esa semana; Busto/Luxury ya limpios). Curva PL persistida como suelo (120 días).
  Vigilancia: test de silencio de PL tras pasada 20:30 + snapshot y guard mañana (triggers armados).
- **Previstos v2 (idea de Alberto, riesgo asimétrico):** evento `previsto` LEJANO (≥60d) sube precio
  ponderado por confianza (×0,5); cerca se retira solo; confirmado = factor pleno. Tests 1.081 verdes.

### ✅ (09/08/2026) Pasada diaria de trading completada — 2 PRs mergeados en caliente para arreglar `date - bigint`
### 🔀 (09/08/2026) Backlog de PRs revisado y drenado: 3 mergeados, 1 superado, 2 a decisión
- Revisión "que no sea antiguo lo pendiente": mergeados #1304 (informe auditoría 08/08), #1329
  (auditoría profunda 09/08 + landmines subastas en CLAUDE.md + watchdog 3 tramos en RUTINAS) y
  #1333 (entrenador: fix `fecha`→`fecha_operacion` en `psd2-health-check` + poda bitácora),
  resolviendo sus conflictos de inserción contra el vivo podado. #1340 (::int trading) ya estaba en main.
- **#1323 (demanda por mes) SUPERADO a medias:** main ya tiene OTRO `pricing-demanda.ts` (gateo por
  antelación, 09/08) con API distinta; lo que #1323 añade de más (ocupación POR MES + boost
  `mes-anticipado`) hay que rehacerlo sobre el código nuevo — no mergear tal cual (ver Estado vivo).
- #1055 (mariscos) y #755 (CSV banca) siguen a decisión de Alberto. Verificado post-merge: CI verde
  ×3, rotación 17/17 + dry-run limpio, 0 marcadores de conflicto, vivo en 17 KB.

### 🔴 (09/08/2026) Pasada diaria de trading BLOQUEADA desde el despliegue de la guardia de precios — fix en PR draft
- Rutina `trading-analista`: NAV IBKR (33.328,17€) empujado a `/banca` OK; watchlist + histórico de 16
  símbolos bajado sin incidencias. `POST /api/trading/analizar` devolvía **500 en cada intento** (payload
  completo y mínimo de prueba) → causa raíz: `lib/trading/precios-guardia`, query hace
  `fecha - DIAS_REFERENCIA_MAX` sin castear la constante, Prisma la manda `bigint`, Postgres no define
  `date - bigint`. Rota desde que se desplegó esa guardia (post-incidente CVX 03/08) — toda pasada de
  análisis desde entonces había fallado en silencio.
- Fix de una línea (`::int`), verificado byte a byte contra Supabase. **PR #1340 mergeado a petición de
  Alberto** ("mergea"); tras el redeploy se encontró el MISMO bug sin corregir en `/puntuar` (copia literal
  de la query, no cubierta por #1340) → **PR #1341**, mismo fix, mergeado también.
- Pasada completada tras los dos redeploys: 14/16 símbolos analizados (SNDK/WDC vetados por la guardia de
  suplantación), 2 compras paper nuevas (NVO 90u@47,26€, PLTR 17u@172,01€), 24 tesis puntuadas walk-forward,
  0 stops. Resumen enviado por Telegram.
- **Fase 2 (dinero real):** Alberto preguntó por adelantar el plazo — recordado que ya existe
  `docs/TRADING-HIPOTESIS-PREREGISTRO.md` § «Plan de despliegue de capital REAL» (firmada 05/08): la
  escalera la suben las SEÑALES, no el calendario (`lib/trading/puerta-fase2.ts`). Estado real hoy:
  cohortes paper en 14-16 de los 120 días que exige el Tramo 2 (~12%). Verificado que el cron semanal
  `paper-tracker` (lunes 10:00 UTC) NO está roto — el dato del 03/08 es el último lunes, no un fallo.
- **Watchlist ampliada** (`trading_watchlist`, capa C): +**ORCL** (a petición expresa, con caveat: la
  tesis de rebote en EMA100 mensual que la motivaba ya fue REFUTADA por H8 y tuvo un incidente de datos
  serio el 31/07); +**BKNG**/+**APP** (únicos `guru:true` del top-20 del radar factorial 03/08 no
  presentes en la watchlist); +**SQM**/+**CHT** (mejor calidad restante del top-20, sector diverso —
  litio/materiales y telecom, sin solapar con lo ya cableado). `trading_cantera` (pipeline de
  descubrimiento IBKR-temas+FMP) sigue vacía — no se ha ejecutado ese flujo, es un mecanismo distinto
  del radar factorial usado aquí.
- **Decisión explícita: NO maximizar la watchlist.** Alberto preguntó por meter "el máximo posible" de
  símbolos; se explicó y se decidió NO hacerlo — más símbolos no acelera Fase 2 (gate por antigüedad de
  cohorte, tabla `trading_paper_track`, no por nº de tickers de la watchlist diaria), y sí infla el
  fetch secuencial de IBKR (techo 300s en `/analizar`) y arriesga meter ruido/correlación en las
  estadísticas de `trading_estrategia_stats`. Watchlist final: **21 símbolos** (3 índices, 10 capa B,
  8 capa C). Alberto delegó la decisión final ("lo dejo en tu decisión").

### 🛡️ (09/08/2026) Auditoría PROFUNDA semanal — todo verde, PR #1329
Pasada completa `auditoria-central` (no solo la ligera): typecheck 0 errores en las **8 apps**, tests
sin fallos, sin secretos con fallback literal, Supabase advisors 0 ERROR, heartbeat de crons/agentes
limpio, automerge de rutinas sano. Único hallazgo: 21 vulns de `pnpm audit`, ninguna explotable
(documentado). Reconciliados 2 docs desactualizados que #1328 (ligera, mismo día) no cubrió:
`apps/plataforma/CLAUDE.md` (subastas sin los PRs #1324/#1325/#1327) y `docs/RUTINAS-PROGRAMADAS.md`
(watchdog de trading descrito con 2 tramos en vez de 3, huella de pricing desactualizada). Informe
completo `docs/AUDITORIA-2026-08.md`.

### 🤖 (09/08/2026) agentes-entrenador — pasada semanal (29/07→09/08): backlog sano, un fix trivial
- Backlog de PRs `claude/*` abiertos: **5** (bajando desde 73→31 del barrido de Alberto de 29/07) —
  sin crecimiento, sin necesidad de escalar. `FEEDBACK-AGENTES.md` sin pendientes.
- Único fix: `psd2-health-check/SKILL.md` usaba la columna `fecha` (no existe; real
  `fecha_operacion`, confirmado contra Supabase) — señalado el 05/08, corregido ahora.
- Resto de fallos del rango (tope real de mercado-booking, sonda pricing en verde falso) ya
  resueltos por PRs de sus propias sesiones (#1314, #1318) antes de esta pasada.
- 🔇→✅ Canal Telegram mudo (401, `ALERTA_TOKEN` desincronizado) — a petición de Alberto, resuelto en la
  misma sesión SIN tocar Vercel: registrado el token que ya lleva esta rutina en `rutina_tokens`
  (3ª vía de `docs/AVISOS-AGENTES.md`). Verificado end-to-end (200 + Telegram real recibido). Ningún
  tool de Vercel MCP expone env vars — la sincronización byte-a-byte en Vercel sigue sin ser algo que
  una sesión pueda ejecutar.

### 🧹 (09/08/2026) «Estado actual» podado: el vivo baja de 121 KB a ~15 KB por sesión
- La sección acumulaba 42 bloques (1.212 de 1.329 líneas, ~30k tokens de peaje en CADA
  sesión) porque la rotación mensual no la tocaba. Contenido ÍNTEGRO movido a
  `docs/memoria/2026-08.md`; queda solo el bloque «Estado vivo» (pendientes/decisiones).
- Reglas nuevas en la cabecera: qué admite «Estado vivo» y formato de cabecera de entrada
  (las entradas `## ` del 08-09/08 se convirtieron a `### ` — `rotar-memoria.mjs` no
  reconoce `## ` como entrada y las habría archivado fundidas con la anterior).
- Verificado: tests de `rotar-memoria` + `--dry-run` sobre el archivo nuevo. El dry-run cazó
  además un título con «16-18/10» al final que la rotación habría archivado en 2025-10 (la
  fecha de la cabecera es la ÚLTIMA que aparece) — reescrito «16-18 de octubre».

### 🔧 (09/08/2026) Reparadas las 3 causas de la venta bajo mercado del finde (motor pricing)
- **El `channel_markup` 1,16 NO existe en el escaparate** (20 reservas: bruto/listado 0,66-1,08,
  mediana 0,92; la del 06/11 a factor 1,004 exacto). La «confirmación» del 01/08 usó el importe
  corrupto pre-fix de la doble comisión. Guardas `>= 1` (con `> 1`, un 1.0 se ignoraba) en
  apply/settings/pricing-engine + `prisma/sql/2026-08-09_channel_markup_sin_recargo.sql` →
  **aplicar SOLO tras desplegar el código**.
- **Ancla suave por fecha** (`pricing-ancla-fecha.ts`): finde con mediana fiable (≥5 comps) ya no se
  tarifica al bucket del mes. **Demanda gateada por antelación** (`pricing-demanda.ts`): sin descuento
  por ocupación en fechas fuera de la ventana de venta. Detalle: adenda 09/08 en
  `docs/AUDITORIA-2026-08-precios-dinamicos.md`. tsc 0 · 1.067 tests · build OK.

### 🔎 (09/08/2026) Auditoría subastas 100% + captura de resultados por fin validada con la 1ª real
- Auditoría completa del módulo: 6 crons 200 hoy · corpus 41 vigentes sano (0 sin valor/docs/semáforo,
  18/18 con puja_minima) · barrido umbrales/coste/ITP sobre las 41 filas → 0 excepciones · 447+1054 tests.
- Hallazgo 🔴 (arreglado, PR): `capturarResultados` NUNCA capturó nada — la ficha concluida real
  (SUB-JA-2026-264154, El Puerto) publica el estado como BANNER, no como par, y el desenlace vive en el
  **certificado de cierre** (PDF público). Nuevos `resultadoDeBanner`/`parsearCertificadoCierre` (fixtures
  reales) + fetch del certificado en el cron; `con_pujas` calibra como adjudicada. E2E: las 2 concluidas
  reales resuelven con su puja máxima oficial (170.627,72€ / 161.712,72€).
- 🟡 sin tocar: dispatcher marca timeout en subastas-mercado si desborda 280s (2 veces/7d, el job acaba).

### ⚖️ (09/08/2026) Seguimiento subastas: backfill puja_minima + fix starvation de la cola
- Check-in post PRs #1324/#1327: parser OK (las 2 fichas releídas hoy → `puja_minima=0`), pero la cola
  del cron `subastas-enriquecer` (LIMIT 12/día) la monopolizaban re-pasadas NO-OP de la Junta (23 filas
  ya geocodificadas que solo refrescaban `enriquecida_at`) → las fichas del BOE se releían cada 3-4 días.
- Backfill manual con el parser real del módulo: 16 fichas vivas → `puja_minima=0` (18/18 al día).
- Fix (PR draft): la cola solo coge fuentes sin ficha si les queda trabajo real; `max` default 12→24;
  `REFRESCO_HORAS` 24→23 (el umbral exacto de 24 h hacía saltar un día sí/uno no por segundos).
- Verificado: cierre 09:00 → 200; sin errores runtime nuevos; Cancienes al ITP 8% asturiano = 95.112€.

### 💶 (09/08/2026) Verificación reserva Luxury 16-18 de octubre: 3ª venta bajo el p50 de fecha exacta
- Reserva Booking (Genius, 5p): 341,74€/2 noches = 170,87€/noche efectivo; lista 194€ (el motor
  bajó 208→194 el 08/08 14:30, reserva entró el 09/08 08:36). p50 real de esas fechas (comps 5p,
  barrido 09/08): 275€ (vie) / 258,50€ (sáb) → −27% en lista, −36% efectivo, bajo el p25.
- Causa: hueco conocido finde-sin-evento — ratio fecha/mes 1,1 < umbral 1,5 del premio de mercado
  → tarifica por bucket octubre (p50 250€) + descuento de demanda (ocupación ~12%). Mismo patrón
  que 06/11 (−43%) y 18/09 (−40%). Margen sano (coste 29,70€/noche); no ruinosa, sí barata.
- Sin cambios de código; el guardián debería avisar `reserva_bajo_mercado` en su cron. Pendiente
  (ya apuntado en skill): bajada last-minute real + revisar si el premio 1,5× deja escapar findes.
- Vía B sana (`dias_caido=1`), sin backlog en `PDF-pendiente`/`Revisar`/`Extraccion-fallida`, 0
  candidatos nuevos en Gmail ni subidas manuales.
- Cerrado 1 pendiente de días atrás: recibo Anthropic/Claude Max (180€, 05/08) archivado en Drive
  y conciliado contra el cargo bancario del 07/08.
- Sigue pendiente: Roborock Amazon -247,92€ aún sin aparecer en `movimientos_bancarios`. Detalle
  completo en `docs/AGENTES-BITACORA.md`.

### 🏛️ (08/08/2026) Subastas 3ª tanda: coste autoexplicativo, ITP valenciano al 9% y presupuesto del vigía — PR #1327
- «Coste real estimado: 806.015,16€» se leía como valoración de mercado (pregunta de Alberto sobre
  SUB-JA-2026-264062): es el coste puerta abierta simulando el remate al 100% de la salida — el
  titular y el aviso de Telegram lo dicen ahora explícitamente («…si rematas a la salida»).
- ITP Comunidad Valenciana corregido: 10%→**9%** (Ley 5/2025), tabla de tipos por CCAA re-verificada
  contra fuentes vigentes. `subastas-cierre` gana presupuesto de tiempo (mismo patrón que #1281/#1296).
- Rediseño de la ficha de subasta con la información de las tandas anteriores (ITP, umbrales, simulador).

### 📬 (08/08/2026) Subastas: cursor incremental por UID — la ingesta dejaba de releer 300 correos/día — PR #1296
- El cron diario pedía «últimos 30 días, hasta 150 correos/portal» siempre — como el corpus de
  Idealista/Fotocasa es acumulativo, relía ~300 correos para encontrar los pocos nuevos y se comía el
  presupuesto de tiempo (latido 07/08: «cortado tras 0 fichas»). Ahora cada portal guarda hasta qué UID
  leyó (`subastas_correo_cursor`, tabla propia — NO `correo_cursor`, que es el latido del triaje de correo).
- `lib/subastas/correo-incremental.ts` (puro, testeado): filtro `>lastUid` en cliente (RFC 3501),
  `uidvalidity` distinto → vuelve a ventana por fecha, cursor solo se confirma tras ingerir (at-least-once).
  BOE (`leerAlertas`) queda intacto, sin cursor. 826 tests, tsc 0, build OK.
- **VERIFICADO en producción (10/08/2026, 2ª pasada — la 1ª fue el bootstrap):** 34 correos leídos
  (23 idealista + 11 fotocasa, «desde uid N») frente a 300, **55s** frente a 284s, y **cero cortes por
  presupuesto** — fichas de anunciante y zonas se enriquecen enteras por primera vez desde el 05/08.

### 🧮 (08/08/2026) Subastas 2ª tanda: ITP por CCAA, puja en vivo, vivienda habitual y simulador
- **ITP por CCAA** (`module-subastas/src/impuestos.ts`): `calcularCoste` deja de aplicar el 7% andaluz a
  todo — la provincia elige el tipo general de su CCAA (Asturias 8%: Cancienes pasa de 94.248€ a 95.112€),
  con aviso del tipo aplicado y de las escalas progresivas. `params.tipoItp` explícito sigue mandando.
- **Vigía de pujas en vivo** en `subastas-cierre`: `mejorPujaViva()` (1 llamada/ficha, seguidas a ≤3 días)
  → `subastas.mejor_puja(_at)` (migración `2026-08-08_subastas_mejor_puja.sql`, aplicada) + Telegram 🔥 una
  sola vez si superan tu techo (`sobrepuja_avisada_at`). NULL nunca pisa un valor visto.
- **Vivienda habitual** (ya se extraía del edicto): `viviendaHabitualDeNotas` (round-trip testeado) afina la
  nota del art. 671 en umbrales/ficha. **Simulador «¿y si pujo X?»** en la ficha (módulo puro + financiación
  de criterios; banda de aprobación, admisibilidad, tramos). Tests 443 módulo + 1045 app, tsc 0, build OK.

### ⚖️ (08/08/2026) Subastas: deuda, puja mínima y umbrales LEC 670 en la ficha
- Pregunta de Alberto («¿se puja por la deuda? ¿el 70%?»): la «salida» YA es el valor de puja (tipo del
  BOE, no mercado); el 70% legal es del VALOR DE SUBASTA, no de la deuda (LEC 670). SUB-JA-* = judicial.
- 3 huecos arreglados: `cantidad_reclamada` era campo muerto (ahora en ficha), `puja_minima` sin consumidor
  (la puja máxima marca inadmisible/sin aprobación automática), y «Sin puja mínima» → centinela `0`
  (≠ NULL no publicada; COALESCE-safe, backfill solo vía relectura 24h del cron).
- Nuevo `module-subastas/src/umbrales.ts` (`umbralesPuja`/`estadoPujaMinima`) + `escenariosCoste` (70% del
  tipo + mediana provincial real). Score/coste siguen conservadores al 100% (decisión de Alberto).
- Telegram avisos con línea de umbrales+deuda. Migración documental `2026-08-08_puja_minima_centinela.sql`.
## 💹 (09/08/2026) La palanca de DEMANDA ya mira el MES, no el año — PR #1323 (draft, rehecho sobre #1337)
- #1337 (mergeado el 09/08) quitó el castigo a las fechas sin abrir, pero el `occ` de `pricing/apply`
  seguía siendo UNA ocupación anual por piso: el mes que se LLENA no podía subir el precio.
- #1323 se rehízo encima: consulta nueva de ocupación por piso+mes y `factorDemandaFecha`
  (`pricing-demanda.ts`) decide las dos cosas a la vez. Módulo único, +8 tests (1.075 verdes).
- 🚨 Trampa medida ANTES de darlo por bueno: usar el mes sin poder juzgar su ventana es PEOR que el bug
  — con muestra de antelación <10 (House jun/jul-2027) el 0% de un mes sin abrir hundía al suelo 0,92.
  Regla: la ocupación del mes solo se usa si la ventana es JUZGABLE; si no, factor global de siempre.
- Efecto real medido: 41 de 1.460 noches. House sept **+4,1%** (30 fechas); 11 fechas de agosto bajan
  ≤1,4%. Mucho menor que el +7,6% que se midió antes de #1337: aquel ya se llevó casi todo.
- Pendientes ya declarados: buckets feb→jul-2027, 23-oct/27-nov sin catalogar, `seasonal_floor_k` 0 vs 1.

### 🧱 (08/08/2026) Bandeja «cargos duplicados» de /banca responsive en móvil — PR #1319
- Captura de Alberto: en móvil las filas desbordaban (chips `flexShrink:0` + importe fuera de pantalla).
- Fix CSS-only en `BancaClient.tsx::DuplicadosBandeja`: media query ≤768px, concepto a ancho completo,
  fecha+chips+importe con wrap, botonera con wrap y botones ≥44px (`#duplicados`). Igual en «Ya resueltos».
- Mismo patrón que la bandeja «Gastos por revisar» del mismo archivo.
- Verificado 320/360px con Playwright (0px overflow). OJO: `next build` en el contenedor falla en
  page data de `/api/admin/clientes/[vertical]/[id]` YA en main (envs ausentes), no es del cambio.


- **📌 Estado vivo — pendientes y decisiones abiertas (actualizado 09/08/2026).** Detalle en
  `docs/memoria/2026-08.md` y en los PRs citados.
  - **Pricing SIVRA (motor vivo en los 4 pisos, resuelto desde el 09-10/08):** #1323 (ocupación
    POR MES) rehecho y mergeado sobre `pricing-demanda.ts`, `channel_markup_sin_recargo.sql`
    aplicado, last-minute encendido (`lastminute_k=0,5`) y reparto mes/global ya se persiste en
    `pricing_applied` (#1361, 10/08). Sigue abierto: el bucket mensual mezcla Serper+Booking sin
    filtrar `fuente` (propuesta: preferencia condicional + `bucket_fuente`, informe
    `docs/AUDITORIA-2026-08-precios-dinamicos.md`). feb→jul-2027 sin bucket (fallback de diseño;
    la rutina Booking lo va rellenando). A vigilar: 23-oct y 27-nov muy por encima de su mes sin
    evento catalogado.
  - **Mercado SIVRA:** `sivra_mercado_sweep` con latido rojo A PROPÓSITO hasta que la Rutina Booking
    consolide (Serper no distingue fecha). Incidente sin diagnosticar: 2º disparo de `mercado-booking`
    el mismo día sin huella del 1º (08/08, `docs/AGENTES-BITACORA.md`). Tope real ≈10-12 ventanas por
    pasada (las respuestas del conector no caben en contexto).
  - **Trading (solo paper):** H8 rechazada y retrovisor de 15 años cerrado; decisión de Alberto
    pendiente sobre H9 (stop −10%/trailing −15% recortan el peor decil a costa de media). PR pendiente:
    umbral 10% de la guardia de suplantación. Pendiente: foto completa a Alberto con propuesta de
    tramo 1 de la escalera (1.000€→techo 6.000€, firmada) y decisión sobre auto-recuperación de
    `/puntuar`. FMP sin créditos y redundante (Yahoo cubre); NO recargar. Solo el DCF sigue sin fuente.
  - **Subastas:** corpus 41 vigentes sano, 0 con margen ≥25% (resultado honesto). 🟡 el dispatcher
    marca timeout en `subastas-mercado` si desborda 280 s (2×/7d, el job acaba).
  - **Facturas/banca sin conciliar:** Roborock −247,92€ (House) sin aparecer en banco; transferencia
    Jaime Salas 278,30€ (Socorro 24); PriceLabs 49,97 USD sin factura real; Booking Dúplex 587,23€
    vence 16/08; Socorro 24 julio sin factura de comisión. Casos abiertos sin respuesta: Bernardi
    −466,70€ (House) y Valantin −84,61€ (Busto). El cron `facturas-scan` archiva TODO en
    `ALBERTO 2026 PERSONAL (SEGUROS)/<mes>` — revisar su resolución de carpeta algún día.
  - **Infra/entorno:** el proxy de egress del contenedor da 403 al CONNECT contra `*.vercel.app` y
    `script.google.com` → el raíl HTTP de plataforma no sirve desde sesiones (usar SQL o `pg_net`
    desde Supabase) hasta abrir la allowlist de red del environment. NIM tier gratis degradado
    (p50 ~25 s); pendiente suplente de `meta/llama-3.3-70b-instruct` (`buscador-ia`). Gemini apagado
    por defecto (gates `GEMINI_TEXTO`/`GEMINI_WEBSEARCH`). Pendiente en Vercel (fuera del repo):
    `SEO_AGENT_ENABLED=true` + bajar `SEO_MIN_IMPR` a 3-5 (ia-rest); PAT de Alberto sin
    `contents:write` sobre `house-sevillana-landing`; confirmar `CONTABLE_MODEL` con `NVIDIA_API_KEY`.
    Trial Tuya IoT Core caduca ~04/02/2027 (recordatorio one-shot creado para el 04/01/2027).
  - **Deuda de doc:** los datos vivos del CRM de ia-rest están en la BD COMPARTIDA (schema `iarest`);
    su AGENTS.md aún dice silo.
