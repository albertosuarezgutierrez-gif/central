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
- **Ejecutada (17/08/2026, PR #1460):** cohorte 3 DOBLE congelada tal y como estaba pre-registrada —
  `2026-08-17.v1` (combinada sp500, 25 valores, con `simbolosBase` gurús-solo) + `2026-08-17.factores.v1`
  (factores-solo, top-10 `rankearUniverso` sobre la caché neutralizada: SNDK, BKNG, MU, WDC, NLY, STX,
  CMCSA, MOH, VICR, UMBF). `/api/trading/seleccion` (sp500) devuelve desde entonces `simbolosFactores`
  para que las siguientes congelaciones dobles salgan del endpoint. El reloj de las tres patas corre
  desde el 17/08; primera lectura con sentido a ~28d (mediados de septiembre).

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

## H8 — Capitulación (caída + volumen) SÍ; rebote en la media larga NO · firmada 2026-08-04
- **Origen:** idea de Alberto («las velas mensuales y semanales con volumen son muy buenas señales»),
  a raíz de su tesis sobre ORCL («rebotó en la EMA de 100 mensual»).
- **Estudio previo (04/08/2026):** 1.300 velas MENSUALES de 7 large caps US (AAPL, ORCL, INTC, BA,
  DIS, NKE, PFE), 2008-2026, punto-en-el-tiempo, midiendo el **exceso sobre la deriva del propio
  valor** (si no, una señal que solo salta en valores en caída sale mal aunque acierte). Resultados:
  - **Rebote en la media larga = REFUTADO, y con daño.** Tocar la EMA100 mensual y cerrar encima:
    **−11,9%** de exceso a 6 meses y **−23,3%** a 12 (n=51), solo **8 de 40** casos en positivo a un
    año, batacazos >15% en el 59% (base 35%). Filtrar por «tendencia viva» lo EMPEORA (−16,8%). AAPL
    —el mejor valor de la muestra— no tocó su EMA100 mensual ni una vez en 12 años: los toques los
    ponen INTC, BA, DIS y NKE. **Acción: NO se implementa** (`lib/trading/velas.ts` lo deja fuera a
    propósito y lo documenta, para que nadie lo «añada» más adelante creyendo que faltaba).
  - **Figuras de vela solas = sin señal.** Martillo −3,0% de exceso a 6m (n=105), envolvente alcista
    −0,3% (n=75), vela verde de cuerpo grande −0,6% (n=279). Tampoco se implementan.
  - **Lo único con señal: caída + volumen.** Cotizar ≥25% bajo el máximo de 12 barras: +6,6% a 6m
    (n=165). Con volumen ≥1,5× la media: **+6,9% a 6m y +18,5% a 12m, 74% en positivo** (n=34). El
    volumen alto POR ARRIBA (sobre la media larga) daba −8,8%: no confirma rupturas, marca suelos.
- **Caveats firmados (la muestra NO autoriza a cablear nada):** 7 valores, todos large caps vivas hoy
  (**sesgo de supervivencia**, mitigado a medias metiendo 4 en declive a propósito); un solo régimen;
  n de 8 a 34 en las combinaciones ganadoras; y el tramo **semanal se midió sobre UN símbolo** (ORCL,
  584 barras) — confirma que las figuras ≈ 0 pero no generaliza.
- **Hipótesis nula:** la señal de capitulación (`senalCapitulacion`: caída ≥25% del máximo de las 12
  barras anteriores **Y** volumen ≥1,5× la media de esas 12) NO aporta exceso de retorno sobre el
  universo cuando se mide punto-en-el-tiempo con la metodología del resto del pre-registro.
- **Recolección (ya desplegada):** `factoresEnFecha` guarda `capitulacionMes/caidaMes/volRelMes` y
  `capitulacionSem/caidaSem/volRelSem` en `trading_backtest.datos.porFecha` sobre las ~800 del
  universo. Tres estados: `null` = no se puede saber (serie corta o fuente sin volumen), `false` =
  mirado y no salta, `true` = salta. **Hoy no toca ranking, pesos ni cestas.**
- **Condición de cableado** (sobre ≥300 observaciones con señal en ≥100 símbolos distintos, para que
  no la decidan cuatro valores):
  1. mediana de `ret91` con señal − mediana del resto del universo **≥ +2 pp**, Y
  2. la tasa de caídas >15% de las observaciones con señal no empeora **más de 10 pp** frente al resto.
  Si se cumple (1) pero no (2), NO entra al blend: se queda como **contexto** (aviso en la ficha del
  valor), coherente con la regla de que medias y volumen son contexto y nunca filtro.
  Si no se cumple (1), se retiran los campos y se anota aquí el resultado.
- **Evaluación:** cuando `trading_backtest` complete un ciclo entero con el código nuevo (todas las
  filas con `actualizado_en` posterior al despliegue) — criterio de estado, no de calendario, por la
  lección del despliegue del 31/07: contar por fecha esperada da falsos «ya está».
- **🚨 Enmienda 3 (06/08/2026) — el primer ciclo NO cuenta: la barra en curso hundía el volumen.**
  Auditando el ciclo a mitad (720/1012 filas) apareció un `volRelMes` medio de **0,62** cuando por
  construcción debe rondar 1,0, y **6.649 de 14.072 observaciones (47%) por debajo de 0,2** — un
  volumen mensual del 20% de su media no existe en datos reales. Causa: `barrasPeriodicas` corta la
  serie en la fecha del snapshot, así que su ÚLTIMA barra era el mes **EN CURSO**, con solo los días
  transcurridos; el precio de una barra a medias es el precio real, pero el **volumen es acumulativo**
  y el día 1 lleva 1 sesión de ~21. Prueba concluyente por día de la semana del snapshot (día 1 de
  cada mes): sábado/domingo → mediana **1,02-1,04** (sin cotización, la última barra ya era el mes
  anterior CERRADO); martes/viernes → **0,047-0,049** ≈ 1/21. Mismo código, mismo corpus, dos
  resultados según el calendario.
  **Efecto sobre H8:** con el umbral en ≥1,5× la capitulación mensual era indetectable en ~2 de cada
  3 snapshots — solo 263 señales frente a 2.008 caídas ≥25%. Y lo que se guardaba era
  `capitulacionMes:false`, que por la regla de la casa significa «lo he mirado y no salta» cuando la
  verdad era «esta barra está a medias, no se puede saber»: un `false` que miente, exactamente el
  patrón fundacional del CLAUDE.md. El semanal sufría menos (4% de observaciones absurdas) porque una
  semana a medias conserva varios días.
  **Corrección:** nueva `barrasCerradas` en `velas.ts` (con `claveDePeriodo`) descarta el periodo en
  curso; la señal se mide sobre la última barra CERRADA, que además es como se hizo el estudio
  original (velas mensuales completas). 6 tests nuevos fijan el comportamiento, incluido el caso que
  lo destapó. **Las observaciones recolectadas antes de este arreglo quedan ANULADAS para H8** (el
  campo de volumen y la señal son inservibles); el reloj de evaluación se reinicia con el ciclo
  siguiente al despliegue del fix. H9 (salidas) NO está afectada: `simularSalidas` trabaja sobre
  cierres diarios, sin barras periódicas.
- **Enmienda 2 (04/08/2026, 22:30) — el tramo SEMANAL ya no es un solo símbolo.** IBKR dejó de
  rechazar y se añadieron DIS e INTC: **3 símbolos, 1.594 observaciones semanales** (ventana de 52
  semanas = el mismo año que las 12 barras del mensual). La señal **se reproduce en el otro marco**:
  capitulación (caída ≥25% + volumen ≥1,5×) da **+5,6% de exceso a 6 meses y +14,2% a 12** (n=87),
  contra +6,9%/+18,5% del mensual. Y se repite el matiz que decide el diseño: **volumen alto SIN
  caída (−0,7% a 6m, −4,3% a 12m)** no paga — el volumen marca suelos, no rupturas. Por valor,
  2 de 3 en positivo (DIS +16,8% sobre una deriva de +0,3%; INTC +6,8% sobre +1,7%; ORCL −1,2%
  sobre +8,0%). **Lo que este n=87 NO es:** 87 episodios independientes. Con ventana móvil semanal,
  las observaciones contiguas son casi el mismo suceso visto siete días después, así que el tamaño
  efectivo son unos pocos episodios por valor — **no vale más que el n=34 del mensual, vale como
  CORROBORACIÓN en otro marco**. Igual que allí, el precio es más batacazos: 46% de caídas >15%
  frente al 31% de la base. No cambia la condición de cableado: sigue decidiendo el retrovisor sobre
  el universo entero.
- **⚠️ Enmienda del mismo día (04/08/2026), antes de que corriera nada:** al revisar la pantalla se
  descubrió que **el retrovisor no tenía cron**. `/api/cron/trading-backtest` existía como ruta pero no
  estaba en `CRON_JOBS`, así que `trading_backtest` llevaba **congelada desde el 19/07/2026** y la
  condición de evaluación de arriba era INCUMPLIBLE: se firmó una medición sobre una tabla que no
  alimentaba nadie (y H4 se había resuelto en su día con esa tabla aún viva, de ahí que no se notara).
  Job añadido (`10 */2 * * *`, ~2 días de ciclo). La lección es la de siempre en este repo: una tabla
  que no se refresca no dice «no hay señal», dice «no se ha medido» — y la pantalla la pintaba como si
  fuera de hoy.
## H9 — Reglas de SALIDA contra la salida por tiempo · firmada 2026-08-04
- **Origen:** Alberto — «vender igual de importante, hay que buscar solución». Es el hueco real del
  sistema: TODO lo medido hasta hoy sale por TIEMPO (28/56/91 días) y ninguna regla de venta tiene
  ni una observación. Las cestas paper se congelan a propósito (son instrumento de medida) y los
  cohetes rotan semanal por reglas fijas — nada de eso mide si un stop AYUDA o ESTORBA.
- **Hipótesis nula:** ninguna regla de salida mejora a la salida por tiempo (91 días) sobre el
  universo, medida punto-en-el-tiempo.
- **Recolección (misma máquina que H8, cron `trading-backtest`):** `simularSalidas` (módulo puro
  `lib/trading/salidas.ts`, 10 tests) guarda por snapshot el retorno de la MISMA entrada bajo tres
  reglas — **stop fijo −10%**, **stop fijo −20%** y **trailing −15%** — con los mismos criterios de
  entrada/horizonte que `ret91` (comparación manzana-con-manzana). Si una regla no salta, su retorno
  ES el del horizonte: no vender también es una decisión y se contabiliza.
- **Caveats firmados:**
  - Solo hay CIERRES diarios: un stop que en la realidad saltaría a media sesión aquí salta en el
    primer cierre que lo perfora, y se «vende» a ese cierre. Eso INFRAVALORA el nº de disparos y
    captura el hueco a la baja (abrir un −30% ejecuta el stop del −10% a −30%, como un stop de
    mercado real). Es la simulación conservadora.
  - La literatura clásica dice que los stops en acciones sueltas suelen AYUDAR en estrategias de
    momentum y ESTORBAR en las de reversión (matan justo las entradas que compran caídas). Por eso,
    si H8 (capitulación) llegara a cablearse como entrada, su regla de salida se evaluaría APARTE —
    un resultado agregado del universo no autoriza a ponerle stop a la capitulación.
  - Mismo régimen único (alcista 2024-26) que el resto del retrovisor; se re-mide con H6 si gira.
- **Condición de cableado** (sobre ≥5.000 observaciones con `ret91` y las tres salidas):
  1. una regla recorta la tasa de resultados ≤ −15% en **≥5 pp** frente a la salida por tiempo SIN
     empeorar la mediana en más de 1 pp (perfil freno), **o**
  2. mejora la mediana en **≥2 pp** sin subir la tasa de batacazos (perfil retorno).
  Si se cumple, entra como política de salida del PAPER (nunca de órdenes reales por sí sola) vía PR;
  si no, se anota el resultado y la salida por tiempo queda validada como la mejor disponible.
- **Evaluación:** por estado de la tabla — ciclo completo con los campos `salidaStop10/20/Trail15`
  presentes (no por fecha de calendario; lección del cron muerto del 19/07).

## ✅ RESOLUCIÓN de H8 y H9 — ciclo completo, 08/08/2026
> Corpus: **1.018 de 1.018 símbolos** re-recolectados tras el arreglo de la barra en curso (PR #1283) y
> con la guarda de serie rota (PR #1301). Última pasada 2026-08-08 12:10 UTC. 21.321 observaciones con
> `ret91` y las tres salidas — por encima del mínimo de 5.000 firmado en H9.

### H8 (capitulación) — **NO se cablea**
| periodo | n señales | mediana ret91 con señal | sin señal | diferencia | batacazos con/sin |
|---|---|---|---|---|---|
| ago-24 → jul-25 | 429 | +9,41% | +2,55% | **+6,85 pp** | 10,3% / 9,2% |
| ago-25 → may-26 | 344 | +1,31% | +3,55% | **−2,24 pp** | 15,4% / 11,3% |
| **total** | **773** | **+5,31%** | **+2,97%** | **+2,34 pp** | 12,5% / 10,2% |

El agregado cruza el umbral firmado (≥ +2 pp de mediana, batacazos no peores en >10 pp), **y aun así la
hipótesis no se cablea**. Motivo, declarado antes de mirar más particiones: **el signo se invierte entre
mitades**. El +2,34 pp global es el promedio de un semestre muy bueno y otro en contra; un factor que en
la mitad más reciente de la muestra RESTA 2,24 pp y sube los batacazos 4 pp no es una señal, es el rebote
de 2024-25 metido en la media. Cablearlo sería comprar el régimen pasado.

**Aviso de método, por si sirve la próxima vez:** el agregado era además INESTABLE. Con el corpus al 90%
(920 símbolos) daba +1,38 pp —«no cumple»— y con el 98% (1.000) daba +2,15 pp —«cumple»—: un 8% más de
datos movió el veredicto 0,8 pp y lo cruzó de lado. La guarda de serie rota aporta solo +0,19 pp de esa
diferencia (de +2,15 a +2,34), así que **no fue la limpieza lo que cambió el resultado, fue la muestra**.
Un criterio de una sola cifra sobre un agregado no detecta eso: la partición sí. Toda resolución futura
del retrovisor se reporta **partida por subperiodo**, no solo agregada.

**Qué queda:** `capitulacionMes/Sem` se siguen RECOLECTANDO (cuestan cero y sirven de contexto), pero no
tocan ranking, cestas ni pesos. Se re-abre si H6 marca cambio de régimen y hay una tercera mitad que
medir — con la partición como criterio, no el agregado.

### H9 (reglas de salida) — **NO se cablea ninguna de las tres**
| regla | mediana | batacazos (≤ −15%) |
|---|---|---|
| sin regla (salida por tiempo, 91 días) | +3,09% | 10,39% |
| stop fijo −10% | −0,93% | 3,56% |
| stop fijo −20% | +2,57% | 15,59% |
| trailing −15% | +0,42% | 12,11% |

- **Stop −10%:** cumple de sobra el perfil freno en batacazos (−6,8 pp, umbral ≥5 pp) pero **cede 4,02 pp
  de mediana** y el criterio firmado permitía ceder 1. Rechazado por su propia condición.
- **Stop −20% y trailing −15%:** **SUBEN** la tasa de batacazos (+5,2 pp y +1,7 pp). No es una anomalía:
  un stop convierte un susto temporal que habría recuperado en una pérdida cerrada, y el propio criterio
  del perfil retorno exige no subirla.
- **Conclusión:** la salida por TIEMPO queda validada como la mejor disponible de las cuatro medidas, tal
  y como preveía la cláusula de cierre de H9. **No se ponen stops.**
- Sigue en pie el caveat firmado: si alguna vez se cablea una entrada de reversión, su salida se evalúa
  aparte — este resultado es del universo agregado y no autoriza nada sobre una cesta concreta.

## 🕰️ Ampliación del retrovisor a 15 AÑOS — firmada 2026-08-08, ANTES de ver un solo dato
- **Origen:** Alberto, tras la resolución de H8/H9 — «ok hazlo». El caveat «un solo régimen» estaba
  firmado en H1, H3, H4, H7, H8 y H9, y ese mismo día H8 enseñó lo que cuesta: agregado +2,34 pp
  (por encima de su umbral) con el **signo invertido entre mitades** (+6,85 / −2,24 pp). Con 22
  snapshots no hay forma de saber cuál de las dos mitades es el mundo. Más símbolos no lo arregla:
  solo más historia.
- **Cambio:** `MESES_RETROVISOR` 24 → **180** (`backtest-puro.ts`). De ~22 snapshots por símbolo a
  **178**, cubriendo 2011-2026: crisis del euro, selloff 2015-16, Q4-2018, COVID, oso de 2022 y el
  ciclo actual. No toca ningún factor, peso, umbral ni criterio de cableado — solo la ventana de
  MEDICIÓN.

### 🚨 Sesgo de supervivencia — el caveat que hay que firmar ANTES de tener los números
El universo son los **1.018 símbolos que existen hoy**. Las empresas que quebraron o salieron de bolsa
entre 2011 y 2026 no están. A 24 meses eso apenas pesaba; **a 15 años es severo**. Consecuencia,
aceptada y declarada de antemano:
- **El nivel absoluto de retorno del retrovisor queda INFLADO.** Cualquier «la estrategia habría hecho
  X%» sobre este corpus es papel mojado y no se va a usar para nada.
- **La comparación CRUZADA dentro de cada fecha sigue siendo válida**: capitula vs no capitula, con
  regla de salida vs sin ella, quintil alto vs bajo. Los dos brazos arrastran el mismo sesgo, así que
  la DIFERENCIA se mantiene interpretable — y la diferencia es exactamente lo que miden H8, H9 y los
  criterios de factores.
- **Lo que este corpus responde:** «¿la señal cambia de signo según el régimen?». **Lo que NO
  responde:** «¿cuánto se gana?». Ningún tramo de la escalera de capital se mueve con datos del
  retrovisor: la escalera la suben las cestas paper vivas, que no tienen este sesgo.

### Otros límites, declarados ahora y no cuando molesten
- **Fundamentales solo desde ~2010:** los `companyfacts` de la SEC arrancan con el mandato XBRL. Los
  snapshots anteriores tendrán `piotroski/roic/ey/fcfy` a **null** — que es lo correcto («no se sabe»),
  pero significa que los criterios de FACTORES se miden sobre una ventana más corta que los de
  precio/volumen (H8, H9, medias móviles), que sí cubren los 15 años. Al reportar un factor hay que
  decir sobre cuántos años se midió, no dar por hecho que son 15.
- **Precios sin ajustar por acciones corporativas:** la guarda `serieDiscontinua` (08/08/2026) caza lo
  imposible, no lo meramente erróneo, y a 15 años hay muchos más splits que a 2 años. Es la razón por
  la que el siguiente trabajo pendiente es validar la fuente de precios contra IBKR.
- **Regla de reporte (heredada de la resolución de H8):** toda conclusión del retrovisor se reporta
  **partida por subperiodo**, nunca solo agregada. Con 15 años eso pasa de recomendable a obligatorio.
- **Coste medido antes de ejecutarlo:** 162 B/snapshot → ~29 KB/fila, ~30 MB de jsonb para el universo.
  El lote pasa a llevar **presupuesto de tiempo** (240 s de los 300 de `maxDuration`) porque cada
  símbolo hace ~8× más CPU; los símbolos que no entran conservan su `actualizadoEn` y encabezan la
  pasada siguiente.
- **Durante la reconstrucción el corpus está MEZCLADO** (filas de 22 snapshots y filas de 178). Toda
  consulta de análisis debe filtrar por `actualizado_en` hasta que el ciclo cierre — es la tercera vez
  que pasa (06/08 y 08/08) y las dos anteriores ya obligaron a anular lecturas a medias.

## 💶 Plan de despliegue de capital REAL — escalera de tramos · firmada 2026-08-05
- **Origen:** Alberto — «¿ves viable adelantar la inversión con dinero real? […] poco a poco, no de
  golpe» + «lo que veas mejor y me avisas». Se firma ANTES de que haya dinero de por medio para que
  dentro de unos meses no tiente saltarse un escalón porque "va bien".
- **Premisa honesta:** meter dinero real en tramos NO acelera la validación estadística (eso ya lo
  mide el paper gratis). Lo que compra es fontanería real (comisiones, spreads, cambio EUR→USD,
  ejecución) y calibrar la disciplina con pérdidas de verdad. Con esa expectativa se despliega.
- **Escalera (cash de referencia: ~33.400€ en IBKR a 04/08/2026):**
  1. **Tramo 1 — 1.000€ (~3%).** Requisito: señal viva del agente — top del ranking con momentum
     positivo Y calidad (ROIC>0), o capitulación H8 fresca (≤2 barras mensuales). NUNCA un gap
     perseguido sin señal. 1-2 posiciones. Objetivo: medir fricción, no ganar.
  2. **Tramo 2 — +2.000€ (total ~9%).** Requisitos: la cesta paper más vieja cumple 4 meses
     batiendo a su banco de referencia en mediana, Y el tramo 1 no reveló fricción anómala
     (coste round-trip >2% o ejecuciones malas).
  3. **Tramo 3 — +3.000€ (total ~18%).** Requisito: los criterios originales de dinero real
     (3 cestas distintas, la más vieja ≥6 meses, batiendo ajustado a riesgo) — la fecha estimada
     ene-feb 2027 NO se adelanta; solo se adelanta el aprendizaje.
- **🚨 Comprobación de estado (21/08/2026) — el cash de referencia YA NO EXISTE, y esto no cambia
  ningún requisito de arriba, solo advierte de que la escalera hoy no es financiable.** `get_account_summary`
  da **NAV 31.531,10€** con **410,46€ de efectivo** y **31.106,48€ en posiciones**: la cuenta está al
  **98,6% invertida en UNA posición, `VWCE`** (188 participaciones del Vanguard FTSE All-World, precio medio
  169,44€, latente **−670,16€**). Con 407,63€ de poder de compra **no cabe ni el Tramo 1 (1.000€)** sin
  vender índice. Es decir: financiar la escalera ya no es «meter dinero nuevo», es **cambiar exposición al
  índice por exposición al agente** — una decisión distinta a la que se firmó el 05/08 y que sigue siendo
  de Alberto. Lo que NO cambia: los requisitos de cada tramo, ni la fecha del Tramo 3 (ene-feb 2027).
- **Techo hasta validación: ~6.000€ (18% del cash).** El resto no entra hasta cumplir el tramo 3.
  Cada tramo es una decisión SEPARADA de Alberto; nada se promedia "porque toca".
- **Congelador (H6):** si SPY cierra un mes por debajo de su media de 10 meses, la escalera se
  congela donde esté — ni tramos nuevos ni ampliaciones hasta re-medir el régimen.
- **Reglas inviolables:** el agente decide QUÉ y CUÁNDO con sus números; la orden la ejecuta
  SIEMPRE Alberto a mano (el agente jamás opera en IBKR). Salidas: por tiempo (91d) mientras H9
  no resuelva; si H9 cablea una regla, se aplica la que gane — sin improvisar stops sobre la marcha.

## 🪜 Enmienda a la escalera de tramos — operacionalización medible + «sin fecha» · firmada 2026-08-05 (tarde)
- **Origen:** Alberto, misma fecha: «la fase se cumple siempre y cuando se den TODAS las señales; si
  no, no se da. Lo mismo hay señal en mes y medio o no la hay hasta dentro de cuatro meses — mejor
  así, no una fecha concreta». Refuerza la nota del tramo 3 («la fecha NO se adelanta»): **ninguna
  fecha del plan es objetivo ni tope — son estimaciones; mandan los requisitos.** No es comprar por
  comprar: sin señal viva no se despliega ni el tramo 1.
- **Operacionalización (para poder medirla en código, sin cambiar los requisitos firmados):**
  · Tramo 2 «4 meses batiendo» = cesta más vieja ≥120 días con alpha por MEDIANA > 0 a fecha de corte.
  · Tramo 3 «batiendo ajustado a riesgo» = mediana>SPY en ≥2/3 de las cestas distintas Y drawdown de
    la cesta más vieja ≤1,5× el del SPY. «6 meses» = ≥180 días. «Distintas» = composiciones distintas
    (dos versiones con la misma cesta son UNA prueba).
  · La «fricción sin anomalías» del tramo 2 se mide con los trades REALES del tramo 1 (round-trip
    ≤2%); como proxy previo, la columna `precio_dia_siguiente` de `trading_paper_orden` mide el coste
    señal→ejecución del día siguiente.
- **Implementación (no cambia el modelo):** helper puro `apps/plataforma/lib/trading/puerta-fase2.ts`
  (`evaluarEscalera`, testeado) pintado en `/trading` (🪜) y en el digest semanal del paper-tracker.
  El semáforo solo MIDE; cada tramo sigue siendo una decisión separada de Alberto.

## 🧹 Corrección de MEDICIÓN (no de modelo) — el «no lo sé» dejaba de puntuar como media · firmada 2026-08-08
> Dos arreglos de higiene de datos aprobados por Alberto el 08/08/2026 tras la auditoría del corpus
> re-recolectado. Se registran aquí porque **el segundo cambia el ranking**, aunque ninguno toca pesos,
> pilares ni composición de cestas. Ambos son la misma regla del CLAUDE.md aplicada al trading: un dato
> que no se sabe no puede convertirse en una afirmación que decide.

**(a) Serie de precios rota ⇒ la capitulación vale `null`, no `true`.** La fuente diaria no viene
ajustada por acciones corporativas: un contrasplit 1:20 multiplica el precio por 20 sin que nadie gane
nada, y la ventana de H8 lo leía como «−95% con volumen» → `capitulacionMes: true`. Medido sobre 18.817
observaciones: 51 (0,27%) con volumen relativo imposible y retornos a 91 días de hasta **+5.890%**
(QUHUO 110,43$ → 9,63$ en un mes; Lytus 1.545 → 427 → 47; Smurfit Westrock con volRel 4.992 por empezar
a cotizar en jul-2024). Guarda en `apps/plataforma/lib/trading/velas.ts` (`serieDiscontinua`, testeada):
salto de cierre mensual ×3 o ÷3 dentro de la ventana, o volRel > 50 ⇒ `{activa, caida, volRel}` a `null`
con motivo `'serie-rota'`. **Umbrales de lo imposible, no de lo raro** — una caída real del −60% en un
mes sigue puntuando. **Límite asumido y declarado:** las barras posteriores a la costura conservan
ratios ya plausibles (SW dio 4,8 → 3,7 → 2,4 los tres meses siguientes) y NO se cazan; se prefiere
dejar pasar una dudosa a anular señales buenas.

**(b) Sin ningún dato de VALOR no se rankea.** `zscores()` documentaba que «un dato ausente = 0
(neutral), nunca penaliza ni premia por faltar». En un z-score eso es falso: **0 es la MEDIA del
universo**. Medido sobre la caché viva del 08/08/2026: de 875 elegibles, **161 no tenían NI
earningsYield NI fcfYield** (casi todas ADR/extranjeras cuya capitalización no se cruza con el XBRL) y
recibían `zValor = 0` con el 40% del peso; el **58,4%** de las que sí tienen el dato salían con zValor
negativo, así que no saber si eras cara te ponía por delante de más de la mitad del universo — y **3 de
esas 161 estaban en el top-20** (TSEM #15, NBIS #17, ASX #19). La puerta de `rankearUniverso` pasa a
exigir el núcleo de calidad (piotroski + roic) **y al menos uno** de los dos datos de valor; las
descartadas salen contadas en `salud.sinValor` del snapshot, no escondidas.
- **Por qué UNO y no LOS DOS:** exigir ambos echaría a 249 nombres por un capex ausente, que es otra
  ausencia distinta y ya la absorbe el promedio del pilar.
- **Qué NO es esto:** no cambia pesos (0,4/0,4/0,2), ni pilares, ni el satélite 🚀, ni las cestas. Es la
  puerta de elegibilidad, que ya excluía por calidad (piotroski+roic) desde el origen.
- **Cómo se revierte:** quitando `tieneValor` del filtro. Reversible en una línea.
- **Efecto secundario esperado y aceptado:** el universo elegible baja de 875 a ~714 y el top-20 cambia
  en 3 nombres. Los snapshots anteriores al 08/08/2026 NO se recalculan: el track record se sigue
  midiendo contra lo que el sistema decidió el día que lo decidió.

**Hallazgo relacionado, NO tocado (requiere hipótesis propia):** los pilares promedian columnas que
nunca se rellenan (`shareholderYield` en valor; `margenNeto` y `deudaEbitda` en calidad), así que valor
se divide entre 3 y calidad entre 4 mientras momentum va sin dividir. El peso EFECTIVO resulta ≈39%
valor / 28% calidad / 34% momentum, no el 40/40/20 nominal. Queda anotado y **sin cambiar**: mover eso
es tocar el modelo y necesita su propia entrada firmada.

## 🛑 Regla de APAGADO del experimento de selección · firmada 2026-08-15
- **Origen:** Alberto («añade todo lo que veas necesario», 15/08/2026), a propuesta de la revisión de
  ese día: la escalera define cuándo SUBIR capital y el congelador H6 cuándo PAUSAR, pero nadie había
  firmado cuándo CERRAR. Sin regla de cierre, un experimento que no funciona se prorroga
  indefinidamente — la portería móvil por omisión. Se firma AHORA, antes de que haya resultados que
  duelan, que es exactamente para lo que existe este documento.
- **Condición de evaluación:** cuando la cesta más vieja del forward cumpla **≥365 días** habiendo
  **≥3 cestas distintas** (misma definición que el tramo 3: composiciones distintas; alpha fiable =
  cobertura ≥80%, y un alpha desconocido cuenta como NO bate).
- **Veredicto negativo:** si en ese momento **baten al SPY por MEDIANA menos de 2/3 de las cestas** →
  el sistema de selección no bate al índice. Según lo ya recomendado en
  `INVERSION-VEREDICTO-2026-08.md` §8: **el capital va a un ETF global amplio y la escalera queda
  CERRADA** (ningún tramo nuevo). La recolección (crons, retrovisor, cohortes) puede seguir como
  observatorio, pero sin camino a dinero real salvo hipótesis nueva firmada sobre un modelo distinto.
  La cartera cohetes tiene su propio marcador (H3/H7) y **no salva** el veredicto del núcleo.
- **Sin re-litigar:** el veredicto se emite en la PRIMERA evaluación que cumpla las condiciones (el
  digest semanal lo pinta); unas semanas buenas posteriores no lo reabren. Reabrir exige entrada nueva
  fechada aquí con motivo (p. ej. cambio de régimen H6 + modelo revisado).
- **H6 pausa la escalera, NO este reloj:** la comparación contra el SPY es relativa y vale en
  cualquier régimen — un mercado bajista no es excusa para no medirse contra el índice que lo sufre igual.
- **Medición:** `evaluarApagado` en `apps/plataforma/lib/trading/puerta-fase2.ts` (puro, testeado);
  línea 🛑 en el digest semanal del paper-tracker. Solo mide: ejecutar el apagado es decisión de Alberto.

## 📎 Correlación media de la cesta = CONTEXTO en el digest · anotada 2026-08-15
- **Qué es:** medición nueva, NO cambio de modelo. La MEDIANA protege del outlier (lección APP ×39)
  pero no ve una cesta donde todos los nombres son la MISMA apuesta (el top del radar ya lo vigila
  así desde el 20/07: `correlacionMediaCesta`, correlación de retornos diarios en vez de etiquetas de
  sector, que parten un mismo tema en varios SIC). Ahora se calcula también por **cohorte del forward**
  sobre las series que el tracker ya baja (coste 0) y se pinta en el digest como contexto.
- **Qué NO toca:** ranking, pesos, composición de cestas ni criterios de la escalera. Si algún día se
  quiere un TOPE de correlación/concentración en `/seleccion`, exigirá su propia hipótesis firmada
  ANTES, usando estas observaciones — no se cablea nada por el retrovisor.
- **Re-declaración para el registro (ya estaba en código, `cartera-estudio.ts`):** los cierres de
  Stooq/Yahoo con los que se mide el forward son **SIN dividendos, en ambos brazos** (cesta y SPY):
  los alphas están medidos a PRECIO, no a retorno total. El sesgo es pequeño y simétrico y por eso la
  comparativa se acepta; queda anotado aquí para que ninguna lectura futura lo descubra por sorpresa.

## 🧱 «Base perfecta» + acumulación — MEDIDA y RECHAZADA · umbral firmado antes de mirar, 2026-08-26
- **Origen:** idea de Alberto («lo veo acumulación y una base perfecta, ¿lo tiene contemplado el agente?»).
  Estado previo del código: la **acumulación** existe solo como CONTEXTO (`lib/trading/volumen.ts`,
  badge 📊↑ del radar y de la ficha; nunca filtra ni pesa). De **base/consolidación no había nada**, y el
  torneo la apaga por diseño: `evaluarMomentum` exige ADX≥20 y una base bien formada tiene ADX bajo →
  `neutral`; `evaluarReversion` solo dispara con RSI<30/>70. Un valor en base sale MUDO en la pasada.
- **Regla firmada ANTES de ejecutar la consulta** (proxy mensual sobre los campos que YA trae
  `trading_backtest`, sin recolectar nada nuevo):
  - **BASE** en el mes *t*: `caidaMes ≥ −10%` (pegado a su máximo) **y** `volRelMes ≤ 0,9` (volumen
    secándose) **y** `sobreSmaMes = true`.
  - **RUPTURA**: BASE en *t* y, en *t+1*, `volRelMes ≥ 1,3` **y** `precio > precio_prev × 1,02`
    (entrada en *t+1*, medida desde ahí).
- **Criterio firmado:** ≥ **+2 pp** de `ret91` medio frente al resto del universo **y mismo signo en las
  dos mitades** (2011-2018 / 2019-2026). La partición es obligatoria por la lección de H8.

| brazo | n | ret91 medio | resto del universo | diferencia |
|---|---|---|---|---|
| BASE · 2011-2018 | 23.042 | 3,05% | 3,85% | **−0,80 pp** |
| BASE · 2019-2026 | 22.303 | 3,19% | 5,47% | **−2,28 pp** |
| **BASE · total** | **45.345** | **3,12%** | **4,76%** | **−1,64 pp** |
| RUPTURA · 2011-2018 | 695 | 5,13% | 3,69% | **+1,44 pp** |
| RUPTURA · 2019-2026 | 562 | 2,23% | 4,95% | **−2,72 pp** |
| **RUPTURA · total** | **1.257** | **3,83%** | **4,38%** | **−0,55 pp** |

- **Veredicto: NO se cablea.** Estar EN la base resta 1,64 pp y lo hace de forma consistente en las dos
  mitades. Comprar la RUPTURA no falla por poco: **el signo se invierte entre mitades** (+1,44 → −2,72 pp),
  el mismo modo de muerte de H8 — sería cablear el régimen 2011-2018. Además el `ret28` de la ruptura es
  **menos de la mitad** que el del universo en AMBAS mitades (0,63% vs 1,39% agregado): el tirón corto
  post-ruptura, que es justo lo que se cree ver en el gráfico, no aparece en los datos.
- **Límites declarados ahora, no cuando molesten:**
  - Es un proxy **MENSUAL**. En BD no hay serie diaria del universo, así que **esto no es un VCP medido**:
    no hay rango estrecho de 5-8 semanas, ni contracciones sucesivas, ni pivote. Lo medido es «pegado a
    máximos + volumen seco + sobre la media» y su ruptura mensual con volumen.
  - **La mitad «acumulación» de la idea sigue SIN medir**: los picos de volumen de `volumen.ts` necesitan
    velas diarias y el retrovisor solo guarda volumen relativo mensual. Rechazada está la BASE, no la
    acumulación — que se queda donde ya estaba, como contexto.
  - Sesgo de supervivencia del corpus de 15 años: los niveles absolutos están inflados; la comparación
    cruzada dentro de cada fecha (que es la usada aquí) se mantiene interpretable.
- **Qué haría falta para re-abrirlo:** series DIARIAS de 15 años para el universo (~1.000 símbolos ×
  ~3.800 sesiones) para medir la base como se define de verdad. Con dos tests en contra, no se gasta salvo
  que Alberto lo pida explícitamente.

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

## H10 — Salidas que SUBEN el stop y salida por MEDIA · firmada 2026-08-28, ANTES de recolectar un dato

- **Origen:** Alberto, 28/08/2026 — «salida no por tiempo, ir subiendo el stop no? o pérdida de media
  o algo… los datos deciden». H9 midió tres reglas y refutó las tres, pero solo probó **una** distancia
  de trailing (−15%) y **ninguna** regla basada en medias móviles. Ese es el hueco que abre H10.
- **Estado de partida, medido HOY sobre el corpus ampliado (183.093 obs. con `ret91` y las tres
  salidas, 8,6× la muestra con la que se resolvió H9) — se anota aquí para que H10 no pueda
  re-litigar lo ya medido:**

  | regla | mediana | batacazos ≤ −15% |
  |---|---|---|
  | salida por tiempo (91 d) | **+3,12%** | 10,26% |
  | stop fijo −10% | +0,45% | **2,90%** |
  | stop fijo −20% | +2,75% | 14,86% |
  | trailing −15% | +1,22% | 10,72% |

  La conclusión de H9 se sostiene con 8,6× los datos. Además, partido por quintil de `momentum`, la
  salida por tiempo gana la mediana en **los cinco**; en Q5 (lo que compra el agente) el stop −10% es
  donde MÁS cuesta (−4,43 pp). El caveat de literatura firmado en H9 («los stops ayudan al momentum»)
  queda así REFUTADO en este universo. ⚠️ Ese corte por quintil es POST-HOC: sirve para cerrar el
  caveat, no autoriza a cablear nada por sí solo.
- **Hipótesis nula:** ninguna de las variantes nuevas mejora a la salida por tiempo (91 días).
- **Recolección (misma máquina y mismos criterios de entrada/horizonte que H9 — `simularSalidas`,
  módulo puro, comparación manzana-con-manzana contra `ret91`):**
  1. **`salidaTrail25`** — trailing −25%: vende en el primer cierre ≤ máximo-desde-entrada × 0,75.
     Es la idea de Alberto a una distancia MÁS ANCHA que la refutada, para que solo dispare ante
     ruptura real y no ante el bache que H9 demostró que se recupera.
  2. **`salidaCoste10`** — stop a COSTE: no hay stop hasta que la posición toca +10%; a partir de ahí
     vende en el primer cierre ≤ precio de entrada. Es «ir subiendo el stop» en su forma mínima
     (proteger lo ganado) sin cortar la caída inicial, que es lo que mata al stop fijo.
  3. **`salidaSma50`** — pérdida de media: vende en el primer cierre < SMA50 diaria.
  4. **`salidaSma200`** — pérdida de media larga: vende en el primer cierre < SMA200 diaria.
  Si una regla no salta y la serie llega al horizonte, su retorno ES el del horizonte (no vender
  también es una decisión y se contabiliza), igual que en H9.
- **Caveats firmados:**
  - Mismos cierres diarios que H9 (sin intradía): un disparo se ejecuta al primer CIERRE que perfora,
    no al precio exacto de la regla. Infravalora disparos y captura el hueco a la baja. Conservador.
  - Las SMA se calculan con los cierres ANTERIORES o iguales a cada día simulado — nunca con la serie
    completa. Una SMA calculada con datos futuros convertiría H10 en look-ahead puro.
  - Una entrada puede estar YA por debajo de su SMA el día de la compra: en ese caso la regla vende en
    el primer cierre disponible y su retorno es ~0, no null. Es un resultado, no un dato ausente.
  - `salidaCoste10` sin haber tocado nunca +10% no dispara jamás: su retorno es el del horizonte.
  - Mismo régimen del corpus que el resto del retrovisor; se re-mide con H6 si gira.
- **Condición de cableado** (idéntica a H9 para que sea comparable, sobre **≥5.000 observaciones** con
  `ret91` y la variante presentes):
  1. recorta la tasa de resultados ≤ −15% en **≥5 pp** frente a la salida por tiempo SIN empeorar la
     mediana en más de 1 pp (perfil freno), **o**
  2. mejora la mediana en **≥2 pp** sin subir la tasa de batacazos (perfil retorno).
  Si se cumple, entra como política de salida del PAPER (nunca de órdenes reales por sí sola) vía PR.
  Si no se cumple ninguna, **la salida por tiempo queda validada por segunda vez y se cablea ella**,
  sin volver a abrir el debate sin datos nuevos.
- **Cláusula anti-portería-móvil:** las cuatro variantes se evalúan con el criterio de arriba y NADA
  más. Si alguna queda cerca pero no llega, NO se cablea «por poco»: se anota y se deja correr.
- **Independiente de H10 — el stop que YA está vivo:** `paper.ts` abre cada posición con un stop fijo
  a `entrada − 2·ATR14` y `/puntuar` lo evalúa cada noche, pese a que H9 concluyó «no se ponen stops».
  Es un stop FIJO a distancia escalada por volatilidad — la misma familia que el `−10%` medido, que
  cuesta 2,67 pp de mediana. Su retirada NO depende de H10: se rige por H9, que ya está resuelta.
- **Evaluación:** por estado de la tabla — ciclo completo con los cuatro campos nuevos presentes en
  ≥5.000 observaciones (no por fecha de calendario; lección del cron muerto del 19/07).

## H11 — ¿De qué piscina deben salir las stats que ajustan la confianza del torneo? · firmada 2026-08-28, ANTES de mirar el resultado de las piscinas alternativas

- **Origen:** Alberto, «¿ya el agente va mejorando?». Al comprobarlo salió una incoherencia INTERNA del
  código, no una idea nueva: `torneo()` (`packages/module-trading/src/estrategias.ts`) **no aplica el
  ajuste a las señales neutrales** (`if (!d || s.direccion === 'neutral') return s`) — pero
  `trading_estrategia_stats`, de donde sale ese ajuste, se calcula sobre una piscina que es **82%
  neutral**. Se aprende de lo que nunca se toca.
- **Observación motivadora — POST-HOC, y por eso NO decide nada** (medida el 28/08/2026 sobre las 1.320
  tesis puntuadas y no anuladas):

  | dirección | n | acierto | retorno medio |
  |---|---|---|---|
  | alcista (lo ÚNICO que se compra) | 104 | 59,6% | +1,03% |
  | neutral | 1.106 | 31,8% | 0,00% |
  | bajista | 110 | 30,9% | −1,52% |

  Las neutrales tienen retorno **0 por construcción** (`puntuarTesis` devuelve 0 para neutral) y su
  acierto exige |movimiento| < 2% a 10 días. Hunden el agregado al 31-37% y hoy `ajustesDeStats`
  penaliza a **las cuatro** estrategias: **momentum −15 · valor −13 · catalizador −8 · reversión −7**.
  Esos deltas NO son cosméticos: `ganadora` es la señal no-neutral **con más confianza**
  (`analizar/route.ts`), así que 8 puntos de diferencia entre estrategias cambian cuál gana el torneo.
- **Hipótesis nula:** cambiar la piscina de la que salen las stats no mejora la decisión del torneo.
- **Muestra disponible HOY** (solo RECUENTOS; el rendimiento por estrategia de las piscinas alternativas
  **no se ha mirado** al firmar esto, que es lo que hace preregistrable a H11):

  | estrategia | solo alcistas | direccionales (alc+baj) | todas (actual) |
  |---|---|---|---|
  | momentum | 79 | 120 | 330 |
  | reversión | 12 | 51 | 330 |
  | valor | 9 | 39 | 330 |
  | catalizador | 4 | 4 | 330 |

- **Alternativa CONSIDERADA Y DESCARTADA como piscina única: «solo alcistas».** Es la más pura («que
  aprenda de lo que compra»), pero con `minN = 20` dejaría **a tres de las cuatro estrategias sin
  ajuste** — el torneo pasaría a comparar una estrategia ajustada contra tres sin ajustar, que es un
  sesgo peor que el que se quiere corregir. Se recolecta igualmente para poder mirarla, pero no es
  candidata a cablearse mientras no tenga muestra.
- **Recolección EN SOMBRA (sin cambio de comportamiento):** `/api/trading/puntuar` escribe además de
  `regimen='todos'` (la que consume el torneo, INTACTA) dos filas más por estrategia:
  `regimen='direccional'` (alcista+bajista) y `regimen='alcista'`. `/api/trading/analizar` sigue
  leyendo **solo `'todos'`**, así que la decisión no cambia ni un punto mientras H11 no se resuelva.
- **Condición de cableado — de COHERENCIA y MUESTRA, no de rendimiento.** No se finge un A/B que no se
  puede correr (solo hay un camino vivo: cambiar la piscina cambia lo que se compra, así que las dos
  ramas no son comparables a posteriori). Se cablea `regimen='direccional'` **si y solo si** se cumplen
  las tres:
  1. **Muestra:** ≥`minN` (20) observaciones direccionales en **≥3 de las 4** estrategias.
  2. **Diferencia real:** el ORDEN por hit rate que induce esa piscina difiere del que induce `'todos'`
     en al menos una posición. Si el orden es el mismo, el cambio es cosmético y **no se toca nada**.
  3. **Guarda de daño:** la estrategia que ascienda al primer puesto **no** puede tener retorno medio
     negativo en su piscina **alcista** — no se promociona al torneo una estrategia que pierde dinero
     justo donde se ejecuta.
- **Caveats firmados:**
  - Los retornos de las bajistas ya vienen con el signo invertido de `puntuarTesis` (una bajista que
    acierta una caída del 5% anota +5%), así que la piscina direccional es sumable sin corrección.
  - `catalizador` tiene **4** observaciones direccionales y no va a cruzar `minN` pronto: seguirá sin
    ajuste en la piscina nueva. Eso es correcto —no aprender de ruido— y NO cuenta para el requisito de
    «≥3 de 4».
  - Mismo régimen único (alcista) que el resto de lo medido; se re-mide con H6 si gira.
  - `ajustesDeStats` y su `minN` **no se tocan** en H11: lo único a decidir es de qué filas salen los
    números que consume.
- **Evaluación:** por estado de la tabla — cuando `trading_estrategia_stats` tenga las filas
  `direccional` con ≥20 observaciones en ≥3 estrategias (no por fecha de calendario).

## H12 — ¿Y si NO vendemos? La cinta se corta en el día 91 · firmada 2026-08-28, ANTES de mirar un solo retorno largo

- **Idea de Alberto (28/08/2026), literal:** «que se venda a los 91 días y ya está… pero también ver
  qué pasaría en el caso de aguantar más, porque el 91 a lo mejor es el actual. Que una vez vendida
  siga analizando esa acción, y que lo meta con indicadores, por si vemos algo mejor de lo que
  tenemos y que dé mayor rentabilidad».
- **El hueco, dicho con precisión:** TODO lo que mide el retrovisor termina en el día 91 —`ret28/56/91`
  y las siete reglas de `salidas.ts`, que cuando no disparan **se rellenan con el retorno del
  horizonte**—. Así que la afirmación «la salida por tiempo gana» (H9, reconfirmada el 28/08 sobre
  183.093 observaciones) solo es cierta **entre las reglas medidas y dentro de esa ventana**. Que
  aguantar 182 o 364 días sea mejor o peor **no se ha mirado nunca**. 91 es el TECHO de la medición,
  no un ganador contra horizontes que no se probaron — y confundir esas dos cosas es exactamente el
  «dato que no hay ≠ dato que no se ha mirado» del CLAUDE.md, aplicado a nuestra propia conclusión.
- **Hipótesis nula:** alargar el horizonte no mejora el retorno, y `tendenciaVivaAlSalir` no separa
  las operaciones en las que conviene aguantar de las que no.
- **Qué se RECOLECTA** (módulo puro `apps/plataforma/lib/trading/continuacion.ts`, cableado al
  snapshot del retrovisor junto a `simularSalidas`; nada decide nada):
  - `ret182` y `ret364` — retorno desde la MISMA entrada a horizontes largos.
  - `mfe364` / `mae364` / `diasMfe364` — techo, suelo y **cuándo** se tocó el techo. Distinguen
    «vendimos pronto» (el techo estaba por venir) de «vendimos tarde» (el techo quedó atrás).
  - `tendenciaVivaAlSalir` — al cerrar el día 91, ¿el precio seguía por encima de su SMA50? Es el
    indicador que permite contrastar **«vender por tiempo SALVO que la tendencia siga viva»** contra
    vender siempre. No es look-ahead: solo usa cierres anteriores a ese día.
- **El arrepentimiento no se guarda, se deriva:** todas las reglas de `salidas.ts` miden desde la
  misma entrada, así que **`ret364 − salidaX` es literalmente lo que costó vender por la regla X en
  vez de aguantar**. No hace falta ninguna columna más.
- **Condición de cableado — dos preguntas distintas, dos criterios distintos:**
  1. **Alargar el horizonte para todos.** Se cablea 182 o 364 si, con **≥5.000** observaciones de ese
     horizonte (mismo mínimo que H10): (a) su **mediana** supera a la de `ret91` en **≥2 pp**, **y**
     (b) el **percentil 25 NO empeora** — no se compra una mejora de la mediana pagándola con la cola
     mala. Si (a) se cumple y (b) no, se registra y **no se cablea**.
  2. **Aguantar SOLO si la tendencia sigue viva.** Se cablea si, con **≥1.000** observaciones en CADA
     subgrupo: la mediana de `ret364 − ret91` del grupo `tendenciaVivaAlSalir = true` supera a la del
     grupo `false` en **≥5 pp**, **y** el grupo `true` mejora **≥2 pp** sobre vender en el día 91.
     Que solo se cumpla la primera mitad significa que el indicador ordena pero no paga: no se cablea.
- **Caveats firmados (van aquí para que no se puedan inventar después):**
  - **Las ventanas se SOLAPAN.** Los snapshots son mensuales y el horizonte es de 12 meses: cada
    observación comparte ~11/12 de su ventana con la siguiente. Las observaciones **no son
    independientes**, así que no se calculan p-valores — se decide por MAGNITUD de la mediana, igual
    que en H10. Es un caveat más fuerte aquí que allí (a 91 días el solape era de ~2/3).
  - **La muestra larga excluye el último año POR CONSTRUCCIÓN** (un snapshot de hace 6 meses no puede
    tener `ret364`). No es una muestra aleatoria del periodo: está desplazada hacia atrás. Cualquier
    conclusión se lee con eso delante.
  - **`margenDias` (98) NO se toca.** Subirlo a 371 para que todo snapshot tenga `ret364` borraría un
    año entero de observaciones de `ret91` — rompería H9/H10 para no ganar nada: los `null` ya dicen
    «todavía no».
  - `mfe364`/`mae364` quedan en **NULL** mientras la ventana no esté completa: un máximo sobre media
    ventana es una **cota inferior**, y publicarlo como «el techo» sería afirmar lo que no se ha visto.
  - Solo se miden **estos** horizontes (182, 364) y **este** indicador (SMA50 el día de la salida).
    Probar otro no es «afinar H12»: es una hipótesis nueva, fechada y firmada antes de mirar.
  - El coste es CPU del retrovisor, no dinero: cada snapshot hace dos barridos más sobre la serie, así
    que la rotación completa por símbolo tarda algo más. El presupuesto de la pasada ya lo absorbe.
- **Evaluación:** por estado de los datos —cuando `trading_backtest` tenga ≥5.000 snapshots con
  `ret364` no nulo—, no por fecha de calendario. La rotación es de días.

## H13 — El track record mide BETA, no alfa · firmada 2026-08-28, ANTES de medir un solo alfa

- **El hallazgo:** `puntuarTesis` mide el retorno ABSOLUTO, y `acierto` de una tesis alcista es
  literalmente «el precio subió». En un tramo alcista eso lo hace el MERCADO, no la estrategia. Y ese
  `hitRate` es exactamente lo que `ajustesDeStats` convierte en delta de confianza del torneo, así que
  hoy el bucle de aprendizaje puede estar premiando **beta disfrazada de habilidad**.
- **Lo llamativo:** el módulo YA tiene toda la maquinaria de benchmark —`seleccionEval.ts` (`alpha`),
  `universo.ts` (`retornoBench`, `baten`), `riesgoCesta.ts`, `medicionAlineada.ts`— pero **solo la usan
  las cestas**. El track record POR ESTRATEGIA, que es el que ajusta el torneo, nunca restó el índice.
- **Hipótesis nula:** ordenar las estrategias por alfa da el mismo orden que ordenarlas por retorno
  absoluto, y por tanto cambiar la medida no cambia ninguna decisión.
- **Qué se RECOLECTA** (sin tocar ninguna decisión): `retornoAlfa` y `retornoBench` por observación en
  `trading_tesis_resultado`, y `hitRateAlfa`/`retornoAlfaMedio`/`nAlfa` por estrategia en
  `trading_estrategia_stats`. El alfa se calcula con el MISMO signo de la tesis que el retorno
  (`segunDireccion(movimiento − bench)`): una bajista que cae menos que el índice **pierde** alfa
  aunque «acierte» la caída, y una neutral está fuera del mercado, así que su alfa es 0 igual que su
  retorno.
- **Condición de cableado** (sustituir `hitRate`/`retornoMedio` por sus versiones de alfa dentro de
  `ajustesDeStats`) — las tres a la vez:
  1. **Muestra:** `nAlfa ≥ 20` (el `minN` vigente) en **≥3 de las 4** estrategias.
  2. **Diferencia real:** el orden de estrategias por `hitRateAlfa` difiere del orden por `hitRate` en
     al menos una posición. Si el orden es el mismo, el cambio es cosmético y **no se toca nada**.
  3. **Guarda de daño:** la estrategia que pase a primera **no** puede tener `retornoAlfaMedio` negativo.
- **Caveats firmados:**
  - `nAlfa` cuenta SOLO las observaciones con benchmark medible. Una sin él **no es un alfa de 0**: si
    se contara, la media se acercaría a cero sola y el alfa parecería más pequeño de lo que es. Por eso
    es una columna aparte de `n`, y las tesis que se quedan sin alfa se **cuentan y se cantan** en el
    latido de `/puntuar`.
  - Las dos puntas del benchmark salen de la MISMA fuente (Stooq→Yahoo, `cierresDeContraste`). Mezclar
    el cierre de IBKR de la sesión con el de Stooq de hoy metería en el alfa la diferencia entre dos
    fuentes, que no es alfa de nadie.
  - Si el índice se queda a más de `TOLERANCIA_BENCH_DIAS` (4) de un extremo, el alfa es **NULL**: sería
    restar dos ventanas distintas, y eso produce un número plausible que no significa nada — el fallo
    más caro que documenta el CLAUDE.md (caso ORCL, 31/07/2026).
  - Benchmark = **SPY**, el mismo que usan el retrovisor y el régimen de mercado, para que «batir al
    mercado» signifique lo mismo en todo el sistema. Cambiarlo es una hipótesis nueva.
  - Las observaciones ya puntuadas **no se re-puntúan**: su alfa se queda NULL. La muestra de H13
    empieza hoy y es más pequeña que la del track record — se dice, no se disimula.
- **Evaluación:** por estado de la tabla (cuando `nAlfa ≥ 20` en ≥3 estrategias), no por fecha.

---

## H14 — El retorno es BRUTO: nadie ha restado el peaje · firmada 2026-08-28

- **El hallazgo:** ni `puntuarTesis` ni `agregarStats` restaban comisión ni horquilla. Con ventanas de
  10 días y cuatro tesis por símbolo en cada pasada, la rotación es alta y el peaje no es despreciable
  frente al **+1,03%** de retorno medio que hoy tienen las alcistas.
- **El número, y por qué no se defiende como exacto:** `COSTE_ROUNDTRIP = 0,002` (0,2% ida y vuelta) es
  un **orden de magnitud** —comisión de IBKR más horquilla en valores líquidos—, no una medición. Por
  eso el criterio de abajo es de **sensibilidad**, no de precisión: si una decisión cambia con 0,1% y no
  con 0,3%, el resultado lo decide el supuesto y **no se cablea nada**.
- **Hipótesis nula:** restar el peaje no cambia ninguna decisión del torneo.
- **Qué se RECOLECTA:** `retornoNeto` por observación y `retornoNetoMedio` por estrategia, **derivados**
  (`retorno − COSTE_ROUNDTRIP`), NO persistidos. Guardar el neto convertiría las filas viejas en una
  mentira el día que se ajuste el peaje; guardando solo el bruto, el neto se recalcula entero.
- **Condición de cableado:** el peaje entra en `ajustesDeStats` si y solo si **le cambia el signo a
  alguna estrategia** con `n ≥ 20` —es decir, `retornoMedio ≥ 0` pero `retornoMedio − COSTE < 0`, que es
  el único punto por donde el coste puede alterar el delta hoy (el término `if (retornoMedio < 0) d −= 5`)—
  **y** ese cambio se mantiene con el peaje a 0,1% y a 0,3%. Si solo aparece con un valor concreto, es
  el supuesto hablando.
- **Caveat firmado, y no es menor:** el peaje se resta a TODAS las tesis por igual, **también a las
  neutrales**, cuyo retorno es 0 por construcción y cuyo neto sale por tanto negativo. Eso es falso en
  la realidad —una regla que dice «no operes» no paga comisiones— así que **el neto de una neutral no
  se compara con el de una direccional** sin decir esto. Se recolecta así por simetría de cálculo; si
  el neto llegara a decidir algo, la exención de las neutrales entra en la misma decisión.

---

## H15 — `minN` y el clamp del aprendizaje nunca se han validado · firmada 2026-08-28

- **El hallazgo:** `ajustesDeStats` tiene dos números con más poder que muchas hipótesis —`minN = 20`
  (quién recibe ajuste) y el clamp de **±20** (cuánto)— y **ninguno se ha medido**: salieron por
  analogía con `DIRECTOR_MIN_LLAMADAS` del Director de IA. Con muestras direccionales de 120/51/39/4
  (H11), el umbral decide él solo qué estrategias entran en el bucle de aprendizaje y cuáles no.
- **Hipótesis nula:** el orden de estrategias que induce el aprendizaje es estable frente a esos dos
  parámetros.
- **Qué se hace:** análisis de **sensibilidad** sobre las stats ya almacenadas (no hace falta código
  nuevo ni recolectar nada): recalcular los deltas con `minN ∈ {10, 20, 40}` y clamp `∈ {10, 20, 40}` y
  mirar si cambia **qué estrategia gana el torneo** en las señales del periodo.
- **Qué significa cada desenlace, firmado por adelantado:**
  - **Orden estable en las 9 combinaciones** → los parámetros no mandan; se dejan como están y queda
    escrito que se comprobó.
  - **El orden cambia** → el bucle de aprendizaje está gobernado por dos números que nadie eligió con
    datos. Eso **no autoriza a poner los que salgan mejor** —sería elegir el parámetro por el resultado,
    que es la definición de mover la portería—: obliga a una entrada nueva que fije el criterio ANTES
    de mirar cuál gana.
- **Evaluación:** cuando H13 se resuelva (es la misma tabla y el mismo momento; hacerlo antes obligaría
  a repetirlo con la medida nueva).

---
*Cambios a este documento: solo AÑADIR entradas fechadas; nunca editar una hipótesis ya registrada
(si una condición resultó mal planteada, se registra una enmienda nueva explicando por qué).*
