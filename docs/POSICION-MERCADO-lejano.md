# 📉 Posición vs mercado en el calendario LEJANO (SIVRA)

> **Por qué existe (27/08/2026).** La palanca de anticipación (`pricing-antelacion.ts`, PR #1763) se
> diseñó, se mergeó, se encendió en los cuatro pisos y se **apagó el mismo día**, antes de su primera
> pasada real. No se apagó por un fallo del código: se apagó porque al mirar el mercado —lo que este
> documento mide— resultó que el problema no era el que la palanca resuelve.
>
> El código y el medidor siguen en `main`. Reencenderla es un `UPDATE pricing_settings SET
> antelacion_k = 1`. Este documento dice **qué tiene que ser cierto** para hacerlo.

## El hallazgo

En el calendario lejano (>60 días) **ya estábamos por encima del mercado antes de la palanca**, y en
buena parte de las fechas medidas éramos más caros que **cualquier** comparable.

### Línea base — 27/08/2026

Fechas a más de 60 días con **≥5 comparables fiables** de Booking (`fuente='booking_mcp'`), precio de
huésped por noche para una estancia de 2 noches:

| Piso | Mercado p50 | Nosotros | Ratio | Más caros que TODOS los comps | Sobre el techo 1,5× |
|---|---|---|---|---|---|
| Busto Reform | 153€ | 272€ | 1,92× | 47 de 75 | 51 |
| House Sevillana | 606€ | 1.016€ | 1,61× | 45 de 75 | 45 |
| Dúplex Center | 184€ | 263€ | 1,42× | 40 de 75 | 29 |
| Luxury Busto | 245€ | 310€ | 1,31× | 29 de 74 | 27 |

**Cobertura: solo el 25%** de las noches lejanas tiene mercado medido (75 de 304 por piso).

## Por qué eso desaconseja la palanca (y no solo «la modera»)

El techo de mercado (`pricing-techo-mercado.ts`) se aplica **después** de la palanca, así que en las
fechas MEDIDAS el premio se lo come el techo: ahí la palanca no haría casi nada. Donde sí actuaría
entera es en el **75% restante, que es justo donde no vemos a la competencia**. O sea: el premio cae
exactamente donde no hay con qué juzgarlo. Es la regla de la casa —«un dato que NO hay ≠ un dato que
NO se ha mirado»— aplicada al precio en vez de a una pantalla.

## 🚨 Y el caso que motivó la palanca NO la sostenía

8-9 de enero de 2027, House Sevillana, vendidas el 26/08/2026 a 135 días vista:

| | |
|---|---|
| Nuestro anuncio medido en el portal (26/08) | **433,50€/noche** (867€ las 2 noches) |
| Mercado real de esas fechas (aforo 12) | 368€ (día 8) · 410€ (día 9) |
| Lo que pagó el huésped | **319,86€/noche** |

El precio publicado estaba **un 11% por encima del mercado**: bien puesto. La noche salió barata
porque se cobró **un 26% por debajo de nuestro propio escaparate** — descuento de CANAL (Genius, no
reembolsable, móvil), no falta de premio por anticipación. La palanca atacaba un problema que en ese
caso no existía. *(n=1: la medición del descuento de canal sobre TODAS las reservas es la rutina de
Booking del 30/08 — trigger «Medición Booking post-oferta 8%».)*

## 🚨 Dos trampas que costaron un diagnóstico equivocado (27/08/2026)

1. **`pricing_settings.cuota_fija` es POR ESTANCIA, no por noche.** Repartirla por noche infla
   nuestro precio de huésped (en House, +158,70€/noche en vez de +79,35€ en una estancia de 2). Con
   ese error salían ratios de 1,43×-2,02× y «percentil 92-95»; los reales son los de la tabla. Al
   comparar contra mercado hay que fijar el nº de noches y decirlo: en estancias de 4+ la cuota se
   diluye y salimos más baratos que la tabla.
2. **Nuestro precio de huésped NO se deriva: se MIDE.** Está en `pricing_escaparate` (`precio_total`
   / `noches`), que lo lee del portal la rutina `mercado-booking`. Derivarlo de
   `markup × base + cuota` es una aproximación (falla ~4% donde se pudo contrastar) y fue lo que
   ocultó que el 8 de enero estaba bien puesto.

## Qué vigilar (y qué haría reencender la palanca)

Se reencendería `antelacion_k` cuando las **tres** sean ciertas, no antes:

1. **Ratio en mercado:** mediana ≤ ~1,2× el p50 de la fecha en los cuatro pisos, y que «más caros que
   todos los comps» baje de forma clara. Hoy el techo de mercado los está desinflando ±20%/día desde
   el 25/08 — es cuestión de dejarle pasadas.
2. **Cobertura > 25%** de noches lejanas con ≥5 comps fiables. Es lo que da autoridad al techo; con el
   75% a ciegas, cualquier palanca que suba precios apuesta sin información.
3. **Fuga de canal medida** (rutina del 30/08): saber por qué un anuncio a 433,50€ se cobra a 319,86€.
   Si el canal se come el 26%, subir la base es empujar contra una puerta que descuenta sola.

### Tabla de seguimiento (la rellena la rutina semanal, lunes 09:00 UTC)

Ratio mediano vs p50 de la fecha · **(T)** = fechas en que somos más caros que TODOS los comps ·
cobertura = % de noches lejanas con ≥5 comps fiables.

⚠️ **El denominador de (T) crece con la cobertura**, así que el número absoluto engaña: de la base
(75 fechas) al 31/08 (93-95) hay 20 fechas más medidas por piso. Compara el PORCENTAJE, no el conteo.
En absoluto Luxury «empeora» (29→33); en porcentaje mejora (39% → 35%).

| Semana | Busto Reform | House Sevillana | Dúplex Center | Luxury Busto | Cobertura | Nota |
|---|---|---|---|---|---|---|
| 27/08/2026 (base) | 1,92× (47) | 1,61× (45) | 1,42× (40) | 1,31× (29) | 25% | Palanca apagada; el techo de mercado lleva 2 días desinflando |
| 31/08/2026 | 1,33× (23/94) | 1,40× (40/93) | 1,34× (38/95) | 1,25× (33/93) | 30-31% | Los 4 bajan. **Condición 2 CUMPLIDA** (cobertura >25%). La 1 no: ninguno ≤1,2×. La 3 sigue sin medir (n=1). Sin Telegram |
| 07/09/2026 | 0,91× (12/91) | **1,40× (33/90)** | 1,03× (9/92) | 0,91× (17/90) | 30% | **Convergencia terminada en 3 pisos**: cada uno aterriza en SU `target_pctl` (0,40/0,40/0,50). House sigue en 1,40× y tiene `antelacion_k=1` — la palanca que el 27/08 se apagó en los cuatro. ⚠️ El barrido lleva 9 de 10 días midiendo SOLO jul-ago 2027 |
| 14/09/2026 | 0,91× (13/91) | 1,47× (33/90) | 1,03× (10/92) | 0,88× (18/90) | 30% | ✅ `antelacion_k` de House **vuelve a 0**. Los 3 convergidos, quietos. El 1,47× de House **no es que suba: es que ya no nos engañábamos** — su `channel_markup` pasó de 1,056 a 1,20 el 12/09 y su neto BAJÓ. ⚠️ Cobertura clavada al 30% tres semanas; barrido sigue monotemático |

#### Lectura del 31/08/2026

**Los cuatro pisos bajan y la cobertura pasa el umbral.** El techo de mercado lleva cuatro días más
de pasadas y se nota: Busto Reform, que era el peor (1,92×), es ahora el mejor de los tres altos
(1,33×) y sus fechas «más caros que todos» caen del 63% al 24%. Luxury Busto (1,25×) es el único a
tiro de la condición 1.

- **Condición 1 — ratio ≤ ~1,2×: NO.** 1,25× / 1,33× / 1,34× / 1,40×. Van en la dirección buena,
  pero ninguno llega.
- **Condición 2 — cobertura > 25%: SÍ.** 30-31% (93-95 de 305 noches lejanas por piso), desde el 25%
  de la base. `sivra_mercado_booking` corrió esta mañana (08:41 UTC, ok) con la prioridad jul-ago
  2027: 240 comps reales en 24 ventanas.
- **Condición 3 — fuga de canal medida: NO, y sigue siendo n=1.** El cruce escaparate×reserva solo
  encuentra **una** coincidencia en toda la BD: House Sevillana 8-9/01/2027, publicado 433€/noche,
  cobrado 320€/noche, **−26%**. El corpus de `pricing_escaparate` no solapa con las fechas vendidas,
  así que esto es «no lo sé», no «no hay fuga»: con una sola observación no se puede afirmar que el
  canal descuente el 26% de forma sistemática.

**¿Se traduce en reservas?** Tendencia, no prueba — n pequeño y sin contrafactual:

| Semana (entrada) | Reservas | Noches | ADR |
|---|---|---|---|
| 03/08 | 4 | 11 | 176,00€ |
| 10/08 | 3 | 7 | 113,00€ |
| 17/08 | 5 | 13 | 415,00€ |
| 24/08 | 7 | 18 | 425,00€ |

Las dos últimas semanas son las mejores del periodo en volumen y ADR a la vez, que es lo que uno
querría ver mientras el techo desinfla precios. **No lo tomes como causa:** el ADR mezcla pisos y
aforos, y una sola reserva de House mueve la media entera.

**Sin Telegram esta semana**: no se cumplen las tres condiciones, la cobertura no está estancada
(sube 5-6 puntos) y ningún piso empeora.

#### Lectura del 07/09/2026 — el motor no se ha roto: ha llegado a su objetivo

Tres pisos caen entre el 18% y el 26% en una semana y quedan **en o por debajo de la mediana** del
mercado. Antes de tocar nada se comprobó de dónde viene el movimiento: **el p50 del mercado no se ha
movido ni un euro** sobre las mismas 90-92 fechas (165 / 197 / 648 / 268€ las dos semanas). Baja
nuestro precio, no sube el mercado.

| Piso | `target_pctl` | ratio medido |
|---|---|---|
| Busto Reform | 0,40 | 0,91× |
| Duplex Center | 0,40 | 1,03× |
| Luxury Busto | 0,50 | 0,91× |
| House Sevillana | 0,60 | 1,40× |

**Los cuatro aterrizan donde su propio `target_pctl` dice.** Apuntar al percentil 40 del mercado
produce mecanicamente ~0,9x la mediana: 0,91x no es un fallo, es el objetivo configurado. Lo que
paso el 27/08 (1,92x) era el motor MUY por encima de su propio objetivo; lo de ahora es que ha
terminado de converger. La lectura correcta de la tabla de seguimiento es esa, no «se ha desplomado».

**Lo que si hay que mirar: House Sevillana tiene `antelacion_k = 1`** (`updated_at` 07/09 08:16). El
27/08 se apago en los cuatro. Es el unico piso que no ha bajado (-1% en la semana, 885,00€ de media),
el unico por encima de 1,2x y el que sigue siendo mas caro que TODOS los comps en el 37% de sus
fechas. Si el cambio lo hizo Alberto por la UI, explica el dato y no hay nada que arreglar; si no,
algo lo escribio. **No se ha tocado.**

**Tercera cosa, operativa: el barrido lleva 9 de los ultimos 10 dias midiendo SOLO jul-ago 2027**
(100% de los comps del dia). Es la prioridad que se puso el 27/08 y que ya no deberia seguir puesta:
mientras dure, ninguna otra fecha lejana refresca sus comparables y van envejeciendo dentro de la
ventana de 30 dias. La cobertura aguanta al 30% porque el corpus acumula, pero es cobertura vieja.

##### Dos hipotesis que se comprobaron y eran FALSAS

Se dejan escritas para que nadie las vuelva a recorrer:

1. **«Es el gate de demanda».** No: `demanda_gateada` lleva entre el 74% y el 98% de las filas
   **desde el 20/08**, sin escalon. Es el estado normal, no el cambio.
2. **«El barrido inundo el corpus de julio-agosto, que en Sevilla es temporada barata».** La primera
   mitad es cierta (100% de comps jul-ago), la segunda **no**: esos comps van a 84-91€/plaza contra
   51-101€/plaza del resto. No son mas baratos, asi que no pueden ser los que tiran del ancla.
3. Y un aviso de metodo: `pricing_settings.updated_at` = 03/09 en tres pisos **no significa que se
   tocara `target_pctl`**. El unico escritor automatico de esa tabla es `/api/sivra/pricing/canal`,
   que solo cambia `channel_markup`, `cuota_fija` y `noches_ref` — y sella `updated_at`. Leer ese
   sello como «alguien cambio el objetivo» es exactamente el error de dar por visto un dato que no
   se ha mirado.

##### Las tres condiciones

- **1 — ratio <= ~1,2x:** cumplida en **3 de 4**. Falta House (1,40x), que es el que tiene la palanca
  encendida. Con `antelacion_k` a 0 y su `target_pctl` de 0,60, lo esperable seria ~1,1-1,2x.
- **2 — cobertura > 25%:** cumplida (30%), pero con la reserva de arriba: es corpus que no se
  refresca desde el 29/08 salvo en jul-ago 2027.
- **3 — fuga de canal medida:** sigue en **n=1**. Sin cambios.

#### Lectura del 14/09/2026 — House no ha subido: hemos dejado de subestimarla

**Lo primero, que estaba abierto desde la semana pasada: `antelacion_k` de House vuelve a 0.** Los
cuatro pisos estan otra vez como los dejo la decision del 27/08. No consta quien lo cambio ni cuando
se encendio; solo que hoy esta apagado.

**House pasa de 1,40x a 1,47x y eso NO es que el motor haya subido el precio.** Se comprobo antes de
escribirlo, separando las dos mitades como la semana pasada:

| | 07/09 | 14/09 |
|---|---|---|
| neto medio de House (`price_live`) | 715,00€ | **691,00€** ↓ |
| `channel_markup` | 1,056 | **1,20** |
| p50 del mercado | 648,00€ | 672,00€ |
| ratio publicado | 1,40x | 1,47x |

El neto **baja**. Lo que subio es el coeficiente con el que este documento ESTIMA lo que paga el
huesped, y lo cambio `sivra_canal` el 12/09 tras medir el escaparate real (840,00€ por 2 noches del
16/11 → 420,00€/noche, que con la cuota fija da exactamente 1,199). O sea: **veniamos
subestimando en un ~14% lo que Booking le cobra al huesped de House**, y por tanto el 1,40x de la
semana pasada —y el 1,61x de la linea base— eran ya demasiado benevolos. El numero no ha empeorado:
se ha vuelto honesto.

⚠️ **Y con eso, un aviso de metodo que este documento ya se daba a si mismo y conviene releer:** la
cabecera dice «nuestro precio de huesped NO se deriva: se MIDE», y la consulta de seguimiento **lo
deriva** (`channel_markup x price_live + cuota_fija/2`). Mientras el coeficiente sea bueno da igual;
cuando se queda viejo, la columna entera se desplaza sin que nada falle. House tiene **3 medidas de
escaparate en 10 dias** y ninguna en calendario lejano, asi que su ratio descansa sobre un
coeficiente medido en fechas cercanas. Es lo mas fiable que hay, no es lo mismo que medirlo.

**Los otros tres, quietos y en su sitio:** 0,91x / 1,03x / 0,88x contra `target_pctl` de 0,40 / 0,40
/ 0,50. Nada que hacer.

#### 🚨 La tabla de reservas de la semana pasada estaba MAL, y la culpa es del metodo

La fila del 07/09 decia que la semana del 24/08 fue «la mejor del periodo» con **7 reservas / 18
noches**. Hoy esa misma semana sale con **4 reservas / 11 noches**, con la misma consulta. No es la
formula: son **3 cancelaciones**, las tres registradas en `reservas_canceladas` entre el 08 y el
13/09, las tres con `estaba_en_incomes = true`. `incomes` las borra al sincronizar, asi que **la
serie se reescribe hacia atras**.

Consecuencia para quien lea esta tabla: **la ultima semana SIEMPRE esta inflada**, porque sus
cancelaciones todavia no han llegado. La de esta semana ya tiene **6 cancelaciones** registradas.

Con eso dicho, y contando solo lo que sigue vivo hoy:

| Semana (entrada) | Reservas | Noches | ADR | Canceladas ya vistas |
|---|---|---|---|---|
| 10/08 | 3 | 7 | 113,00€ | 0 |
| 17/08 | 5 | 13 | 415,00€ | 1 |
| 24/08 | 4 | 11 | 529,00€ | 3 |
| 31/08 | 17 | 49 | 230,00€ | 1 |
| 07/09 | 24 | 70 | 125,00€ | **6, y subiendo** |

**El volumen se ha multiplicado y el ADR se ha hundido**, que es exactamente lo que uno espera tras
bajar precios un 20-26%. Los ingresos de la semana salen por encima (49 x 230 = 11.270,00€ y
70 x 125 = 8.750,00€, contra 5.395,00€ y 5.819,00€ de las dos semanas de agosto), pero **esto sigue
sin ser una prueba**: no hay contrafactual, la mezcla de pisos y aforos cambia, las noches son
futuras y —ahora se sabe— la cifra de la ultima semana aun va a bajar.

#### Las tres condiciones

- **1 — ratio <= ~1,2x:** cumplida en **3 de 4**, igual que la semana pasada. House esta ahora mas
  lejos (1,47x), pero por correccion del coeficiente, no por moverse.
- **2 — cobertura > 25%:** cumplida en el numero (**30%**) y **clavada ahi tres semanas seguidas**.
  El barrido sigue midiendo casi solo jul-ago 2027 (100% de los comps cuatro de los ultimos seis
  dias). Mientras siga asi, ese 30% no va a subir: es corpus que se renueva en una esquina del
  calendario y envejece en el resto.
- **3 — fuga de canal medida:** sigue en **n=1**.

### La consulta (reproducible tal cual)

```sql
WITH comps AS (
  SELECT DISTINCT ON (scenario, checkin_date, comp_name) scenario, checkin_date, guests, price_night
  FROM market_rates WHERE fuente='booking_mcp' AND COALESCE(corpus_clonado,false)=false AND price_night>0
  ORDER BY scenario, checkin_date, comp_name, search_date DESC
),
plaus AS (SELECT * FROM comps WHERE price_night >= guests*12 AND price_night <= guests*600),  -- mismo filtro que el motor
mkt AS (
  SELECT scenario AS property_id, checkin_date,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY price_night)::int AS p50,
         MAX(price_night) AS mas_caro
  FROM plaus GROUP BY 1,2 HAVING COUNT(*) >= 5
),
nuestro AS (                                                     -- cuota fija repartida entre 2 noches
  SELECT s.property_id, s.rate_date,
         ROUND(ps.channel_markup*s.price_live + ps.cuota_fija/2.0) AS guest_2n
  FROM rate_snapshots s JOIN pricing_settings ps ON ps.property_id=s.property_id
  WHERE s.snapshot_date=(SELECT MAX(snapshot_date) FROM rate_snapshots) AND s.price_live>0
)
SELECT n.property_id, COUNT(*) fechas,
       ROUND(AVG(m.p50)) mercado_p50, ROUND(AVG(n.guest_2n)) nuestro,
       ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY n.guest_2n/m.p50)::numeric,2) ratio,
       COUNT(*) FILTER (WHERE n.guest_2n > m.mas_caro) mas_caros_que_todos,
       COUNT(*) FILTER (WHERE n.guest_2n/m.p50 > 1.5) sobre_techo
FROM nuestro n JOIN mkt m ON m.property_id=n.property_id AND m.checkin_date=n.rate_date
WHERE n.rate_date > CURRENT_DATE + 60
GROUP BY 1 ORDER BY 1;
```

⚠️ `rate_snapshots` guarda historia por `snapshot_date`, así que la foto de cualquier día pasado se
reconstruye cambiando el `MAX(snapshot_date)` por la fecha que se quiera. La línea base de arriba NO
hay que creérsela: se puede volver a calcular.
