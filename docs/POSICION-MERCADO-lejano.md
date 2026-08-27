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

### La consulta (reproducible tal cual)

```sql
WITH comps AS (
  SELECT DISTINCT ON (scenario, checkin_date, comp_name) scenario, checkin_date, guests, price_night
  FROM market_rates WHERE fuente='booking_mcp' AND COALESCE(corpus_clonado,false)=false AND price_night>0
  ORDER BY scenario, checkin_date, comp_name, search_date DESC
),
plaus AS (SELECT * FROM comps WHERE price_night >= guests*12),   -- mismo filtro de €/plaza que el motor
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
