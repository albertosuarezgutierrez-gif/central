# 🔭 Retrovisor del radar — backtest punto-en-el-tiempo (julio 2026)

> **INDICATIVO, no decisorio.** Este backtest orienta; la decisión de dinero real sigue dependiendo
> SOLO del track record FORWARD (cohortes + radar semanal, medido por mediana, sostenido). Sesgos
> conocidos al final del documento — léelos antes de sacar conclusiones alegres. SOLO paper.

**Datos:** 546 de las ~550 mayores de EEUU + SPY (benchmark). 22 snapshots mensuales (jul-2024 →
abr-2026). En cada snapshot, para cada empresa, SOLO los fundamentales cuyo 10-K estaba **publicado
(`filed`) antes de esa fecha** (cero look-ahead en factores) + momentum 12-1 con precios hasta ese día.
Retornos forward reales a 28/56/91 días. Sin pilar gurús (Dataroma no da carteras históricas).

## 1) Veredicto: ¿el top-10 del modelo batió a SPY?

Sí, con claridad creciente a más plazo. Top-10 equiponderado por el blend del radar
(elegibles = con Piotroski y ROIC; pesos efectivos ≈ 13% EY · 10% ROIC · 10% Piotroski · 20% momentum,
en z-scores cross-seccionales), medido por MEDIANA de la cesta vs SPY:

| Ventana | Batió a SPY | Alpha mediano | Alpha medio | Peor ventana | Ret. medio top-10 | Ret. medio SPY |
|---|---|---|---|---|---|---|
| 28 días | 13/22 (59%) | +0,8 pp | +1,5 pp | −9,7 pp | +2,7% | +1,3% |
| 56 días | 16/22 (73%) | +4,6 pp | +5,9 pp | −9,2 pp | +8,8% | +2,9% |
| 91 días | **17/22 (77%)** | **+8,5 pp** | +11,5 pp | −10,3 pp | +15,8% | +4,4% |

Lectura: la ventaja aparece con el horizonte — a 1 mes es ruido, a 3 meses es consistente. Encaja
con el diseño (elegir QUÉ y mantener; el timing fino no es la ventaja). Las peores ventanas
(−10 pp) recuerdan que habrá trimestres claramente por debajo del índice.

## 2) ¿Qué indicadores AVISAN de verdad? (quintiles sobre TODO el universo, ret. 91d)

La pregunta honesta no es "¿qué tenían los ganadores?" sino "¿de los que tenían el indicador en
verde, cuántos subieron?". Quintil mejor (Q5) vs peor (Q1) de cada indicador:

| Indicador | Q5 media | Q1 media | Spread medias | Q5 mediana | Q1 mediana | Spread medianas | % que cae >15% (Q5 / Q1) |
|---|---|---|---|---|---|---|---|
| **Momentum 12-1** | +14,2% | +5,6% | **+8,6 pp** | +8,3% | +2,6% | **+5,6 pp** | 12,4% / 11,3% |
| Piotroski | +5,1% | +11,5% | −6,3 pp | +3,1% | +5,4% | −2,3 pp | **8,6%** / 10,6% |
| Earnings yield | +6,2% | +18,0% | −11,8 pp | +3,5% | +8,4% | −5,0 pp | **7,8%** / 14,2% |
| ROIC | +4,3% | +17,8% | −13,5 pp | +1,4% | +7,4% | −6,0 pp | **10,6%** / 13,1% |

Dos conclusiones, las dos importantes:

1. **El único indicador que "avisó" de las subidas en este período fue el momentum** (+5,6 pp por
   mediana, +8,6 pp por media). Robusto en media Y mediana.
2. **Calidad y valor salieron NEGATIVOS en rentabilidad bruta en estos 2 años concretos** — fue un
   régimen de "junk rally" (memoria/IA: empresas caras y en pérdidas multiplicándose). PERO
   hicieron su verdadero trabajo, que es de FRENO: la probabilidad de palmar >15% en 3 meses baja
   sistemáticamente en el quintil bueno (EY: 7,8% vs 14,2%; ROIC: 10,6% vs 13,1%; Piotroski: 8,6%
   vs 10,6%). La calidad no está para cazar cohetes: está para que ningún trimestre te rompa.

⚠️ El spread negativo de calidad/valor está además INFLADO por el sesgo de supervivencia del
universo (ver §5): los "cohetes basura" que hoy están en las 550 mayores están precisamente porque
subieron. En un universo punto-en-el-tiempo el castigo a la calidad sería menor.

## 3) Los grandes ganadores y qué los anticipaba

Mayores subidas a 91 días del período (con su radiografía EN la fecha del snapshot, antes de subir):

| Empresa | Snapshot | Ret. 91d | Piotroski | ROIC | EY | Momentum |
|---|---|---|---|---|---|---|
| SNDK — Sandisk | 08-2025 | +382% | — | — | — | +0,28 |
| ALAB — Astera Labs | 04-2026 | +305% | 3 | −3% | −0,8% | +0,84 |
| RKLB — Rocket Lab | 09-2024 | +285% | 3 | −12% | −8,7% | −0,22 |
| BE — Bloom Energy | 07-2025 | +282% | 4 | −8% | −3,0% | +0,42 |
| ECHO — EchoStar | 06-2025 | +268% | 5 | +0,4% | +1,2% | +0,22 |
| KXIAY — Kioxia | 04-2026 | +267% | — | — | — | +1,28 |
| APP — AppLovin | 09-2024 | +267% | 5 | +2,8% | +0,4% | +0,75 |
| DELL — Dell | 03-2026 | +215% | **7** | **+17%** | +4,7% | +0,01 |
| CRWV — CoreWeave | 04-2025 | +197% | — | — | — | — |

El patrón es nítido: **los cohetes son casi todos momentum con calidad mala o inexistente**
(Piotroski 3-5, ROIC negativo, caros). El único con nota de calidad fue DELL. Es decir: el radar,
con su puerta de calidad, **se pierde los cohetes a propósito** — son billetes de lotería (pocos
ganan una barbaridad; la mayoría de ese quintil cae, ver §2). El objetivo del sistema no es cazar
el +300%, es batir a SPY con consistencia y caídas contenidas. El aviso que sí era accionable y
sistemático: el momentum positivo previo (SNDK, BE, APP, KXIAY, ALAB lo tenían).

## 4) La lupa de gurús: ¿por qué compran lo que compran?

Convicciones actuales de Dataroma (17 nombres; 10 dentro del universo top-550) × factores actuales:

- **Compran CALIDAD**: de los 10 con datos, todos tienen ROIC positivo (7%-27%) y Piotroski 4-7.
  Ninguna posición de convicción es "basura" — cero solapamiento con el perfil de los cohetes del §3.
- **A precio razonable**: EY positivo en todos (0,5%-8,7%; DAL y BKNG las más baratas).
- **Y COMPRAN CAÍDAS**: casi la mitad tienen momentum NEGATIVO (MSFT −22%, BKNG −22%, SPGI −17%,
  UBER −19%). Los gurús entran contra el momentum — el pilar donde su estilo y el del modelo chocan
  a propósito (ellos promedian a la baja en negocios que conocen; el modelo pide inercia).
- 7 de 17 (M, NYT, LEN, CVI, SD…) están FUERA de las 550 mayores: los gurús también pescan en
  mid-caps, donde el radar Fase 1 aún no llega (argumento para el Russell 1000 en Fase 1.5).

Respuesta corta al "¿por qué se posicionan ahí?": **negocios de calidad comprados cuando el precio
afloja**. El modelo captura bien su QUÉ (calidad+valor); su CUÁNDO es contrario al nuestro, y por
eso el cruce gurús ∩ calidad (la cesta combinada) tiene sentido: ellos aportan la convicción, el
técnico nuestro espera a que el cuchillo deje de caer.

## 5) Sesgos y límites (por qué esto NO es un veredicto)

1. **Supervivencia en la MEMBRESÍA**: los factores son punto-en-el-tiempo, pero la LISTA de 550 es
   la de HOY aplicada hacia atrás. Los que subieron mucho entraron en la lista POR subir → infla
   los retornos (sobre todo el quintil "basura" y el momentum). Un universo con membresía histórica
   real es caro (fuente de pago, decisión EODHD aplazada).
2. **Ventanas solapadas**: 22 snapshots mensuales con retornos a 91d se pisan; las muestras
   independientes efectivas a 3 meses son ~7, no 22.
3. **Un solo régimen**: 2024-2026 fue alcista y pro-momentum/pro-junk. En un 2022 (bajista) la
   foto de calidad/valor habría sido probablemente la inversa.
4. **Sin costes** ni slippage; top-10 equiponderado vs SPY ponderado por capitalización.

## 6) Implicaciones para el radar (qué haría y qué no)

- **Mantener el blend como está** por ahora: el compuesto batió a SPY en 17/22 ventanas a 91d pese
  al viento en contra de calidad/valor — y la puerta de calidad es el seguro de caídas.
- El momentum es el indicador con más señal a 91d: la confirmación técnica del top-20 (SMA50+RSI)
  va en la dirección correcta. NO subir su peso por este backtest solo (§5.3: un régimen).
- Cuando el FORWARD acumule 2-3 meses, contrastar sus ventanas contra estas tablas: si el forward
  confirma el patrón, entonces sí discutir pesos (p. ej. momentum 20→25%) — nunca antes.
- Fase 1.5: Russell 1000 (los gurús pescan fuera del top-550) y, si algún día se paga fuente,
  membresía histórica real para repetir esto sin el sesgo §5.1.

---
*Generado el 19/07/2026 desde `trading_backtest` (546 empresas × 22 snapshots + SPY + lupa `_GURUS_`).
Reproducible: las queries viven en la sesión y la tabla es re-poblable con el workflow `trading-backtest.yml`.*
