# 🔬 Autopsia de ganadores — qué indicadores cazaron las grandes subidas (2026-07)

> **Qué es esto:** estudio exploratorio sobre `trading_backtest` (546 empresas × 22 snapshots
> mensuales punto-en-el-tiempo por `filed`) para responder a la pregunta de Alberto: *"de las grandes
> subidas ya conocidas, ¿qué indicadores estaban encendidos ANTES?"*. Nace de la conversación DELL
> (21/07/2026). **Genera hipótesis, NO las firma** — el juez sigue siendo el forward paper. Alimenta
> la **H7** de `TRADING-HIPOTESIS-PREREGISTRO.md`.

## Método (con grupo de control, para no autoengañarse)
Mirar SOLO ganadores y preguntar "¿qué señal tenían?" siempre encuentra una (sesgo de retrovisor). Lo
que da señal real es comparar contra el **control**: los que tenían la misma señal y NO subieron. Por eso
se mide, por quintil de cada indicador, **la tasa de subidón Y la de batacazo** (no solo la presencia en
ganadores).

- **Universo:** 11.823 observaciones (símbolo × mes) con retorno forward 91 días.
- **"Subidón"** = ret91 ≥ +28,4% (top decil; base = 10%).
- **"Batacazo"** = ret91 ≤ −15% (base ≈ 9%).
- **Indicadores punto-en-el-tiempo:** momentum (12-1), earnings yield (EY), ROIC, Piotroski,
  sobreSMA semanal/mensual.

## Resultado (2024-26, un solo régimen)

| Indicador (quintil) | Subidón ≥+28% | Batacazo ≤−15% | Mediana 91d | Lectura |
|---|---|---|---|---|
| **Momentum Q5** (más fuerte) | **19,8%** (2,0×) | 12,7% | **+7,6%** | ✅ señal real |
| Momentum Q1-Q4 | 6–10% | 7–10% | +3-4% | ruido |
| EY Q1 (más caro/sin beneficios) | 26,4% (2,6×) | 14,6% | +8,4% | ⚠️ lotería de régimen |
| ROIC Q1 (peor calidad) | 24,8% (2,5×) | 13,1% | +7,2% | ⚠️ lotería de régimen |
| Piotroski Q1 (peor contable) | 17,1% | — | — | ⚠️ lotería de régimen |
| Valor real (EY Q5) | 9,2% | 7,8% | +3,7% | freno, no motor |
| Calidad real (ROIC Q5) | 8,5% | 10,6% | +1,2% | rezagó en el rally |
| sobreSMA sem/mes | 9-10% | 9-10% | — | 🚫 cero discriminación |

## Conclusiones
1. **Momentum (quintil alto) es el ÚNICO cazador robusto y defendible.** No solo dobla los subidones:
   tiene **la mejor mediana forward (+7,6%)** de todo el estudio → el edge está en el centro de la
   distribución, no solo en la cola. No es azar.
2. **EY-bajo / ROIC-bajo / Piotroski-bajo cazan aún más subidones (2,5×), pero son los MISMOS nombres**
   (growth sin beneficios del rally IA), su tasa de batacazo también sube (1,5-1,6×) y su media está
   **inflada por el régimen 2024-26**. Ponderar "no rentable" como cazador = apostar a que el junk rally
   sigue. Es justo la lotería que la guarda `maxVolAnual` fue creada para evitar. **NO se pondera.**
3. **Las medias SMA (sem/mes) no discriminan nada** para cazar subidas. Fuera del score de selección
   (pueden servir de freno de riesgo — otra pregunta).
4. **Valor/calidad reales fueron freno de caídas, no motor de subidas** (coincide con el retrovisor y con
   H2). Peso bajo o solo como gate.

## Análogos a DELL (el "tipo bueno": momentum + negocio real)
Filtro `ret91 ≥ +40% AND momentum alto AND ROIC ≥ 0,10 AND Piotroski ≥ 6`. DELL **no fue un caso
aislado** — los ganadores de calidad se agrupan en clústers temáticos:

- **Cadena de suministro IA / hardware:** DELL, **FLEX** (+135%), **CLS** Celestica (Piotroski 8), **JBL**
  Jabil, **WDC** Western Digital (+96%).
- **Semis IA:** **AVGO** Broadcom (×3), **AMAT** Applied Materials (+84%).
- **Picks-and-shovels del datacenter (industriales):** **FIX** Comfort Systems (×5, el más consistente),
  **URI** United Rentals.
- **Cíclicas energía/materias:** **VLO**, **MPC**, **SCCO** (cobre), **TPL** (ROIC 0,30-0,43).
- Más especulativas con ROIC alto: **COIN** (×4), **APP**, **TSLA**.

Los que **repiten** (FIX ×5, COIN ×4, AVGO ×3, FLEX ×3) = persistencia, no suerte. Y casi todos son
nombres que **un modelo value se perdería** (no están baratos).

## DELL valida la entrada "comprar el retroceso"
Registro punto-en-el-tiempo de DELL: sus mayores retornos forward salieron **desde los suelos, con
momentum NEGATIVO** — porque **siempre fue calidad** (ROIC 12-17%, Piotroski 6-7 en todo el histórico).
Se pegó un batacazo (142→92 en 2024-25) y explotó desde abajo con el catalizador IA. La calidad aguantó
el retroceso → comprar ese retroceso pagó.

| Fecha | Precio | Momentum | ROIC | Piotroski | Ret 91d |
|---|---|---|---|---|---|
| 2025-04 | 91,96 | −0,16 | 0,17 | 7 | +32% |
| 2025-05 | 91,95 | −0,28 | 0,17 | 7 | +44% |
| 2026-02 | 114,44 | +0,24 | 0,17 | 7 | +85% |
| 2026-03 | 148,08 | +0,01 | 0,17 | 7 | +215% |

## Caso EN VIVO — NVO y el problema del AND (17-21/07/2026)
La estrategia momentum exige **las tres a la vez**: `ema12>ema26 ∧ macd>signal ∧ adx≥20`.

| Fecha | Dirección | Conf. | Por qué |
|---|---|---|---|
| 17/07 vie | 🟢 ALCISTA | 78 | ema12>ema26, macd>signal, **adx 27** |
| 20/07 lun | ⚪ neutral | 40 | ema12>ema26, **macd≤signal**, adx 27 |
| 21/07 mar | ⚪ neutral | 40 | ema12>ema26, macd≤signal, adx 26 |

La idea de más convicción del viernes (78) quedó tumbada a neutral el lunes porque **UNA** sub-condición
(el MACD cruzó su señal) se torció, con **tendencia (ema) y fuerza (adx 27) intactas**. Es el AND
produciendo **falsos neutrales y whiplash** (dentro-fuera con cada wiggle). Motiva la H7.

## Caveats (por qué esto NO se firma solo)
1. **Un solo régimen** (bull/junk rally 2024→2026). El edge de momentum es el más probable de persistir;
   el de "baja calidad" el que menos.
2. **Sesgo de supervivencia:** universo = las ~550 mayores de HOY retro-aplicadas → los que reventaron y
   salieron no están → **los batacazos están SUBESTIMADOS**, sobre todo en los cubos especulativos.
3. **Sin volumen/ADX/sorpresa-earnings** en el dataset → el catalizador tipo DELL (earnings + volumen),
   probablemente el mejor cazador de estos pelotazos, **no es testeable aquí**. Pendiente de medir aparte.
4. **Observaciones mensuales solapadas** (autocorrelación) → muestra efectiva < 11.823; no fiar decimales.
