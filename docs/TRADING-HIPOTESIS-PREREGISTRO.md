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

## H7 — Cartera cohetes rotatoria (paper) · firmada 2026-07-23, evaluación 2026-10-15
- **Hipótesis nula:** la cartera cohetes (momentum>30% + calidad mala, equiponderada, rebalanceo
  semanal a los confirmados, 30.000€ paper) NO bate al SPY ajustado a riesgo.
- **Sub-hipótesis IPO:** los cohetes recién cotizados (`mesesCotizando≠null`) rinden PEOR que los
  veteranos (lo que dice el retrovisor; la corazonada de Alberto predice lo contrario).
- **Criterio de éxito (para refutar la nula):** valor de la cartera > SPY el 2026-10-15, sostenido en
  la curva, con drawdown y tracking error razonables. Sin mover la portería.
- **Caveats firmados:** el retro-test dio +868% vs SPY +30% (2024-07→2026-04) pero con **survivorship
  bias** (favorece a la lotería) y **régimen junk-rally**; el forward NO debería replicar esa magnitud.
  Un mes malo puede caer ~20% (peor mes histórico −19,1%) — es el perfil, no un fallo.
- **Datos:** `trading_cohetes_track` (curva) + `trading_cohetes_rebalanceo` (libro). NO se auto-modifica
  el criterio de selección; cualquier cambio de reglas lo decide Alberto con este forward.

## 📦 Archivo — pre-registro original de la cohorte 1 (tabla `trading_forward_paper`, retirada 01/08/2026)
La primera cohorte se pre-registró el 18/07/2026 en una tabla ad-hoc (`trading_forward_paper`, con
`trading_forward_paper_marca` para marcas interinas) que quedó huérfana cuando el forward pasó a
`COHORTES_PAPER` (código) + `trading_paper_track` (cron `paper-tracker`). Antes de retirar ambas
tablas se archiva aquí su única fila — es el registro firmado y no se puede perder. Los símbolos y la
fecha coinciden con la cohorte `2026-07-18.v1` de `paper-cartera.ts`; el detalle extra son los
precios de entrada (cierre IBKR del 18/07) y la ventana:
- **fecha_inicio** 2026-07-18 · **ventana_fin** 2027-01-18 · **benchmark** SPY @ 750,72 ·
  **ponderación** equal-weight · **params** gurús ∩ calidad (Piotroski≥6, ROIC≥0,10).
- **Picks (entry, cierre 18/07):** MSFT 401,10 · APP 434,48 · DAL 86,70 · CVI 33,46 · NYT 76,71 ·
  LYV 179,85 · GOOG 353,81 · AMZN 249,89.
- **Métrica firmada:** mediana de retornos por símbolo (equal-weight, 8 nombres) desde el cierre de
  fecha_inicio > retorno de SPY en la misma ventana; sin re-seleccionar durante la ventana.
- **Notas firmadas:** la selección arrastra look-ahead/survivorship (elegida sobre histórico
  conocido), por eso el forward es el único test sin sesgo; n=8 pequeño; checkpoint principal 6 meses.

---
*Cambios a este documento: solo AÑADIR entradas fechadas; nunca editar una hipótesis ya registrada
(si una condición resultó mal planteada, se registra una enmienda nueva explicando por qué).*
