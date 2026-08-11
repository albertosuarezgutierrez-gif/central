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
