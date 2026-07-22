# 🔬 Pre-registro de hipótesis del sistema de trading (SOLO paper)

> **Qué es esto:** las condiciones de cambio del sistema, escritas ANTES de ver los datos forward.
> Es la defensa contra el autoengaño: cuando lleguen los resultados, se comparan contra lo aquí
> firmado — no se mueve la portería a posteriori. **Regla meta: NINGÚN cambio de pesos, filtros o
> composición del modelo se aplica sin una hipótesis pre-registrada aquí (o una entrada nueva fechada
> ANTES del cambio).** Los agentes tienen prohibido cambiar el modelo por su cuenta.

**Fecha de registro:** 19/07/2026 (tras el retrovisor `TRADING-RETROVISOR-2026-07.md`, ANTES del
primer dato forward — la cohorte 2 y el radar empiezan a medir el 20/07/2026).

## H1 — Momentum merece más peso (peso 0,2 → 0,25)
- **Base:** único factor con spread positivo en el retrovisor (+5,6 pp mediana 91d), en todos los tamaños.
- **Condición de aplicación:** tras ≥12 semanas de forward del radar, el top-10 semanal mantiene alpha
  mediano >0 a ~91d en ≥60% de las ventanas evaluadas, Y la contribución del momentum sigue positiva
  (picks con momentum>0 baten a los picks con momentum≤0 por mediana).
- **Acción si se cumple:** subir momentum de 0,20 a 0,25 (UN solo cambio; re-registrar antes de otro).
- **Acción si no:** no tocar. Revisar en la siguiente ventana de 12 semanas.
- **Evaluación:** ~12/10/2026 (paso 7 de la pasada del agente).

## H2 — La puerta de calidad se mantiene aunque reste retorno
- **Base:** calidad/valor restaron retorno en 2024-26 (junk rally) pero redujeron la prob. de caídas
  >15% (EY: 7,8% vs 14,2%). Su función es freno, no acelerador.
- **Condición de RETIRADA (alta exigencia, es el seguro):** solo si tras ≥16 semanas forward los picks
  calidad-alta sufren MÁS caídas >15% que el universo Y rinden peor por mediana.
- **Evaluación:** ~09/11/2026.

## H3 — El satélite 🚀 debe ganarse el sitio o retirarse
- **Base:** perfil cohete = 13% de +50%/3m (5× base) en backtest, pero segmento lotería, inflado por
  supervivencia y dependiente de régimen.
- **Condición de permanencia:** tras 12 semanas, la lista 🚀 bate a SPY por mediana en ≥50% de sus
  ventanas Y su tasa de batacazos (<−15%) se queda por debajo del 20%.
- **Acción si no:** retirar el satélite del digest (la columna `cohetes` se conserva como histórico).
- **Evaluación:** ~12/10/2026.

## H4 — FCF yield completa el pilar de valor (SI muestra señal)
- **Base:** el pilar de valor del modelo solo alimenta 1 de sus 3 métricas (EY); el FCF yield
  (CFO − capex)/mktCap sale gratis de la SEC. Recolectado en el retrovisor el 19/07.
- **Condición de cableado:** spread de MEDIANAS Q5−Q1 a 91d ≥ +2 pp en el retrovisor (medición
  punto-en-el-tiempo, misma metodología que el resto), O spread mejor que el del EY actual.
- **Acción si se cumple:** añadir fcfYield a la caché del universo y al blend (entra por el hueco que
  ya tiene `rankearFactores`, no cambia pesos entre pilares).
- **Resultado (19/07/2026, 20:55 UTC — medido sobre 8.468 observaciones punto-en-el-tiempo):**
  **CUMPLIDA por la segunda rama.** Spread de medianas Q5−Q1 a 91d = **−2,4 pp** (no llega al +2 pp de la
  primera rama, pero es claramente MEJOR que el del EY: −5,0 pp). Y en la faceta freno es la mejor métrica
  medida: prob. de caída >15% del quintil alto **6,0%** vs 12,1% del bajo (el EY daba 7,8%/14,2%).
  **Acción ejecutada el mismo día:** `fcfYield` añadido a la caché (`trading_universo.fcf_yield`), al
  refresco del universo y al blend (por el hueco que `rankearFactores` ya tenía; los pesos entre pilares
  NO cambian). Momento elegido a propósito: el blend cambia ANTES del primer dato forward (20/07), así el
  forward mide el modelo definitivo desde el día uno. Nota honesta: en el régimen 2024-26 el valor resta
  retorno bruto — el fcfYield entra por su perfil de FRENO y por dar al pilar de valor su segunda métrica
  real (antes 1 de 3); su contribución se re-evalúa con H6 si cambia el régimen.

## H5 — Cohorte 3 DOBLE: combinada + factores-solo (atribución completa)
- **Base:** el backtest factores-solo batió a SPY; el forward actual solo mide gurús∩calidad (+ la
  base gurús-solo). Falta la tercera pata para atribuir qué aporta cada pilar con datos forward.
- **Acción pre-registrada:** al congelar la cohorte 3 (~15-18/08/2026), congelar DOS cestas: la
  combinada (como siempre) y una **factores-solo** desde `/api/trading/seleccion` con
  `{"universo":"sp500"}` ignorando el guruScore (los 10 primeros por score de factores puros).
- **Evaluación:** por MEDIANA a 28/56/91 días, las tres patas contra SPY y entre sí.

## H6 — Régimen de mercado como disparador de re-medición
- **Base:** todas las conclusiones del retrovisor son de UN régimen (alcista 2024-26). Las medias
  por-acción no aportaron; la media de 10 MESES sobre el ÍNDICE es la definición clásica de régimen.
- **Acción pre-registrada:** el digest semanal lleva la línea de régimen (SPY vs media 10 meses).
  Si un lunes cruza a 🔴 bajista: re-correr las mediciones del retrovisor (quintiles por factor,
  cohetes, segmentos) sobre la ventana que incluya el régimen nuevo, y comparar contra las tablas
  actuales ANTES de tocar nada.

## H7 — Momentum como SCORE ponderado con umbral, no AND de sub-condiciones
- **Fecha de registro:** 21/07/2026 (tras la autopsia `TRADING-AUTOPSIA-GANADORES-2026-07.md` y el caso
  NVO en vivo; ANTES de saber cómo acaba NVO — su desenlace NO cuenta como prueba, ver nota anti-autoengaño).
- **Base:** (1) La autopsia confirma que el quintil alto de momentum dobla la tasa de subidón (19,8% vs 10%
  base) con la MEJOR mediana forward (+7,6%) → señal real, no cola. (2) Caso EN VIVO NVO (17-21/07): idea
  momentum de convicción 78 el viernes (`ema12>ema26 ∧ macd>signal ∧ adx 27`) tumbada a neutral el lunes
  porque UNA sub-condición (`macd>signal`) se torció, con tendencia (ema) y fuerza (adx 27) intactas. El
  AND-duro de las tres sub-condiciones produce falsos neutrales y whiplash.
- **Hipótesis:** sustituir la señal ALCISTA de momentum de AND-duro (`ema12>ema26 ∧ macd>signal ∧ adx≥20`)
  por un SCORE ponderado de las sub-condiciones (p.ej. cruce-ema 0,4 + adx 0,4 + macd 0,2) con UMBRAL de
  disparo, de modo que "2 de 3 fuertes" mantengan la señal aunque la tercera flojee. **Los vetos de
  SEGURIDAD siguen duros** (régimen SPY<SMA200, earnings <3d, sobre-operar, `bajoTendencia` SMA50): esto
  solo afecta a la GENERACIÓN de la señal alcista, nunca a las barreras de riesgo.
- **Validación en SHADOW (firmada ANTES del forward):** implementar la versión score en paralelo (calcula
  y persiste ambas; NO cambia lo que se opera) durante ≥8 semanas. Se aplica como señal viva solo si, sobre
  el AGREGADO de señales del periodo: (a) el score rescata señales que el AND dejó en neutral con tendencia
  intacta (≥15% de los flips a neutral), Y (b) la mediana forward 91d de esas "rescatadas" es > 0, Y (c) su
  tasa de batacazo (<−15%) no supera la de las señales que ambos comparten.
- **Métrica:** nº de señales retenidas, mediana forward de las "rescatadas" vs las compartidas, tasa de
  batacazo de cada grupo.
- **Acción si no se cumple:** mantener el AND.
- **Evaluación:** ~mediados 09/2026 (tras ≥8 semanas de shadow).
- **Nota anti-autoengaño:** NVO motivó la hipótesis pero **NO es la prueba**. La validación es sobre el
  agregado de señales en shadow, jamás sobre si NVO (o cualquier nombre conocido) acaba subiendo. No se
  mueve la portería con el desenlace de NVO.

## H8 — Cohorte ANCHA (factores-solo) + spread de deciles, para acelerar el veredicto
- **Fecha de registro:** 21/07/2026 (ANTES de congelar la cesta y ANTES de ver su forward).
- **Motivación:** las cohortes 1-2 combinadas quedaron en **8 nombres** aunque pidieron `tam:25` — la
  intersección gurús∩calidad es estrecha, solo 8 pasan ambos filtros. n=8 → poca potencia → veredicto lento.
  Para acelerar SIN perder limpieza: (a) ampliar por la ruta **factores-solo** (universo sp500), que no tiene
  ese cuello y sí da 30; (b) medir el SPREAD del ranking completo, no solo top-N vs SPY.
- **Diseño pre-registrado:**
  1. **Cohorte ancha:** congelar una cesta factores-solo de **tam 30** desde `/api/trading/seleccion
     {"universo":"sp500","tam":30}` (blend oficial value+quality+momentum+fcfy, **winsorizado** — NO la
     aproximación SQL de esta sesión, que dejaba colar outliers de momentum tipo BE/LITE). Equiponderada,
     benchmark SPY, misma medición que las demás cohortes (mediana + riesgo). Cohorte ADICIONAL (no edita las
     existentes). `fechaInicio` = fecha real del sello → sin look-ahead aunque se congele unos días después.
  2. **Spread de deciles:** además del top-N vs SPY, medir el retorno **decil-superior − decil-inferior** del
     ranking COMPLETO del universo (mismo `rankearUniverso` del radar). Test de si el ranking DISCRIMINA (no
     solo si el top sube en un rally). Requiere persistir el ranking completo (hoy solo se guardan 20) + un
     tracker de deciles → implementación pendiente, parte de esta H8.
  3. **Lectura primaria a 28 días** (además de 56/91), leída como INDICATIVA, no veredicto.
- **Condición de lectura (firmada):** ninguna conclusión antes de ≥4 semanas. Señal favorable = (a) la cohorte
  ancha bate al SPY por MEDIANA, Y (b) el spread de deciles > 0 (top-decil > bottom-decil) — ambas, sostenidas
  y repetidas entre cohortes. Batir con MÁS riesgo (drawdown/vol/TE peores) NO cuenta como batir.
- **Qué NO hace:** no cambia pesos ni filtros del modelo (eso es H1/H4/H7). Solo AÑADE una cohorte y una
  métrica. El veredicto de dinero real sigue necesitando ~6 meses y varias cohortes — esa puerta NO se adelanta.
- **Evaluación:** primera lectura indicativa ~mediados 08/2026 (28d); con fundamento ~mediados 10/2026 (91d).
- **Nota:** la lista provisional (top-30 por blend transparente aproximado, 21/07, universo 304 elegibles) se
  guardó como referencia visual; la cesta REAL la fija `/seleccion`. No confundir una con otra.

---
*Cambios a este documento: solo AÑADIR entradas fechadas; nunca editar una hipótesis ya registrada
(si una condición resultó mal planteada, se registra una enmienda nueva explicando por qué).*
