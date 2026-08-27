# 📏 Seguimiento — ¿dejó de oscilar el motor de precios? (abierto 27/08/2026)

> **Para qué existe este documento.** El 27/08/2026 se cambió el ancla global del motor de precios
> (PR #1811, merge `e0116ab6`): pasa de ser el percentil del **barrido de esa mañana** al del
> **corpus acumulado de 30 días**. La mejora está **simulada** contra producción, no **observada**:
> se calculó qué habría valido el ancla nueva los últimos 10 días, no se vio al motor tarifar con
> ella. Este documento fija la línea base para que, unos días después, se pueda medir de verdad —
> y para que la comparación no dependa de la memoria de nadie.
>
> **La distinción importa:** «el ancla nueva habría sido estable» y «el motor ha dejado de oscilar»
> no son la misma afirmación. La segunda es la que Alberto pidió y la que todavía no se puede hacer.

## Qué se cambió, en una frase

`med_guest_global` —la base de toda fecha sin bucket de mes, hoy el **35-47%** de las noches
tarifadas— salía del percentil de una sola pasada de Booking, que muestrea **5-35 fechas de entrada
distintas cada mañana** de las ~110 del horizonte. Ahora sale de una lectura por comparable × fecha
en una ventana de 30 días (`lib/sivra/pricing-ancla-global.ts`).

## Línea base — medida el 27/08/2026 sobre los 10 días 18→27/08

Todas las cifras salen de la **misma ventana** y del mismo SQL para los cuatro pisos.

### Volatilidad del ancla (máximo ÷ mínimo en 10 días)

| piso | ancla VIEJA (barrido) | serie vieja | ancla NUEVA (acumulada) | serie nueva |
|---|---|---|---|---|
| `prop_busto_reform` | **2,19×** (95→208) | `153 145 118 135 130 110 180 95 208 114` | **1,04×** (138→144) | `140 141 138 140 140 138 144 143 144 141` |
| `prop_duplex_center` | **1,96×** (116→227) | `143 162 135 148 141 140 227 195 116 153` | **1,07×** (166→177) | `166 167 166 167 167 166 176 177 175 173` |
| `prop_house_sevillana` | **2,52×** (357→901) | `547 628 357 473 473 513 856 424 901 555` | **1,09×** (526→573) | `526 538 529 540 540 540 572 566 573 569` |
| `prop_luxury_busto` | **1,94×** (126→245) | `137 156 135 167 141 148 245 162 126 220` | **1,03×** (196→202) | `202 201 196 198 198 196 201 200 198 198` |

Fechas de entrada muestreadas: **5-35** con el barrido → **65-118** con el corpus acumulado.

> ⚠️ **Corrección de las cifras publicadas en el PR #1811.** El cuerpo de ese PR y su mensaje de
> commit asignan mal las volatilidades por piso (dan 1,96× a busto_reform y 2,19× a duplex_center,
> que es al revés) y citan un **8,34×** que **no se reproduce en ninguno de los cuatro pisos** sobre
> esta ventana; venía de una medición anterior cuya ventana no se conservó. La tabla de ARRIBA es la
> buena. La conclusión del PR no cambia —el ancla vieja se movía ~2-2,5× y la nueva ~1,03-1,09×—,
> pero **las cifras por piso de aquel PR no se deben reutilizar**.

### Oscilación del PRECIO (el número que de verdad importa)

Es la métrica original de la queja: **noches que cambian de dirección ≥3 veces**. Medida el
27/08/2026 sobre las escrituras del motor VIEJO (`applied_at < 2026-08-27 19:00 UTC`).

| piso | % oscilantes (7 días) | % oscilantes (10 días) | amplitud media de las oscilantes (7d) |
|---|---|---|---|
| `prop_duplex_center` | **33,4%** | 36,7% | 1,61× |
| `prop_luxury_busto` | **27,2%** | 24,3% | 1,55× |
| `prop_busto_reform` | **20,5%** | 20,9% | 1,58× |
| `prop_house_sevillana` | **3,2%** | 10,8% | 1,24× |

> ⚠️ **Corrección: House Sevillana NUNCA estuvo a «0%».** Toda la investigación del 27/08 —y el PR
> #1811, y la primera entrada de memoria— arrastran un «House Sevillana 0%» que venía del enunciado
> inicial y **no se verificó jamás contra la BD**. Medido: **3,2%** a 7 días y **10,8%** a 10. Sigue
> siendo con diferencia el piso más estable (oscila ~10× menos que el Dúplex) y su causa **sigue sin
> explicación**, pero «casi nunca» y «nunca» son afirmaciones distintas y la segunda era falsa.
> Es la misma lección que este repo ya tiene escrita: un número que no se ha mirado no se repite.
>
> Y de paso: el «32%» del Dúplex era correcto (33,4% medido), y las otras dos noches —que se habían
> dado por no medidas— sí oscilaban, un 20-27%. **El problema afectaba a los cuatro pisos**, no a uno.

### Invariantes de seguridad (deben seguir igual)

| | baseline 27/08 |
|---|---|
| Raíl a la BAJA roto (malventa) | **0** en 3.717 comparaciones día-contra-día |
| Noches por debajo del `min_price` | **0** |
| Raíl al ALZA roto sin evento de calendario | **42**, concentradas en 3 días de 10 (19, 20, 21 y 24/08); 7 días a cero |

## Qué medir en la pasada de seguimiento

**Ventana limpia: del 28/08 en adelante.** El merge entró el 27/08 ~18:57 UTC, así que la primera
pasada con el ancla nueva es la de las **20:30 UTC del 27/08**. Todo lo anterior es del motor viejo.

1. **Volatilidad del ancla** por piso → debe quedarse en **~1,0-1,1×**. Si sube de 1,2× el arreglo
   no está haciendo lo que se midió.
2. **% de noches oscilantes** (≥3 cambios de dirección en 7 días) por piso → el Dúplex tiene que
   bajar mucho desde el 33,4%. **Es el criterio de éxito**, no la volatilidad del ancla: el ancla es
   la causa, la oscilación es el síntoma que Alberto ve.
3. **Amplitud** (máx ÷ mín por noche) → desde 1,5×.
4. **Los tres invariantes de seguridad** de arriba.
5. **House Sevillana**: oscilaba un 3,2% teniendo el ancla MÁS volátil de los cuatro (2,52×). Eso
   sigue sin explicación. Ahora que las cuatro anclas se parecen, si los otros tres bajan hasta su
   nivel, la pregunta se vuelve académica; si House sube o los demás no bajan, hay una segunda
   causa que no hemos visto. **No se cierre como resuelto sin una causa medida.**

## 🚨 Las dos trampas al medir el raíl (documentadas para no repetirlas)

Las dos hicieron perder una tarde el 27/08 y las dos producen alarmas falsas:

1. **El raíl NO se ancla en `old_price`**, se ancla en **`ref24`** = el último precio aplicado en un
   día ANTERIOR. Medir contra `old_price` da ~112 «violaciones» que no existen: el motor corre 3
   veces al día y el raíl es por DÍA, no por pasada.
2. **`pricing_applied` solo tiene fila cuando algo se aplicó** (cambio ≥3%), así que un `LAG` sobre
   días escritos puede saltarse días. Si entre dos escrituras pasaron N días, el tope legítimo es
   ±20% **N veces**, no una. Comparar solo cuando `d - d_prev = 1` es lo que da la cifra buena
   (42 en vez de 106).

Y una tercera, que es un límite y no un error: **el premio de mercado por fecha
(`premioMercadoFecha`, ≥1,5× la base normal) no se puede reconstruir a posteriori** — el motor lo
juzgó contra el corpus de aquella mañana y el corpus de hoy ya es otro. Por eso las subidas que
rompen el raíl **no son atribuibles retroactivamente**: cuéntalas y di que no son atribuibles, no
las declares injustificadas.

## SQL de la pasada de seguimiento

```sql
-- (A) Volatilidad del ancla acumulada, por piso, en los últimos N días
WITH dias AS (SELECT generate_series(CURRENT_DATE-6, CURRENT_DATE,'1 day')::date d),
dedup AS (
  SELECT DISTINCT ON (x.d, m.scenario, m.checkin_date, m.comp_name)
    x.d, m.scenario, m.checkin_date, m.fuente,
    m.price_night*pricing_factor_aforo(z.max_guests,m.guests) pn
  FROM dias x
  JOIN market_rates m ON m.search_date > x.d-30 AND m.search_date <= x.d AND m.checkin_date >= x.d
  LEFT JOIN pricing_piso_zona z ON z.property_id=m.scenario
  WHERE m.scenario LIKE 'prop_%' AND m.price_night>0 AND NOT m.corpus_clonado
    AND (m.guests IS NULL OR m.guests<=0 OR m.price_night>=12*m.guests)
  ORDER BY x.d, m.scenario, m.checkin_date, m.comp_name, m.search_date DESC
),
fiab AS (SELECT d, scenario, COUNT(DISTINCT checkin_date) FILTER (WHERE fuente IN ('booking_mcp','manual')) n
         FROM dedup GROUP BY d, scenario),
acum AS (
  SELECT dd.d, dd.scenario,
    ROUND(percentile_cont(s.target_pctl) WITHIN GROUP (ORDER BY dd.pn))::int med,
    COUNT(DISTINCT dd.checkin_date)::int fechas
  FROM dedup dd
  JOIN fiab f ON f.d=dd.d AND f.scenario=dd.scenario
  JOIN pricing_settings s ON s.property_id=dd.scenario
  WHERE (f.n>=15 AND dd.fuente IN ('booking_mcp','manual')) OR f.n<15
  GROUP BY dd.d, dd.scenario, s.target_pctl
)
SELECT scenario, MIN(med) mn, MAX(med) mx,
       ROUND(MAX(med)::numeric/NULLIF(MIN(med),0),2) volatilidad,
       MIN(fechas) fechas_min, string_agg(med::text,' ' ORDER BY d) serie
FROM acum GROUP BY scenario ORDER BY scenario;
```

```sql
-- (B) Oscilación del PRECIO: noches que cambian de dirección >=3 veces, y amplitud.
--     Solo pasadas del motor NUEVO: applied_at >= '2026-08-27 19:00+00'.
--     OJO: el giro NO se puede contar dentro de un COUNT(... FILTER ...) con LAG dentro —
--     Postgres no admite una función de ventana anidada en un agregado (42601). Va en su CTE.
WITH ap AS (
  SELECT DISTINCT ON (property_id, rate_date, applied_at::date)
         property_id, rate_date, applied_at::date d, new_price
  FROM pricing_applied
  WHERE dry_run=false AND applied_at >= TIMESTAMPTZ '2026-08-27 19:00+00'
  ORDER BY property_id, rate_date, applied_at::date, applied_at DESC
),
dir AS (
  SELECT property_id, rate_date, d, new_price,
         SIGN(new_price - LAG(new_price) OVER w) s
  FROM ap WINDOW w AS (PARTITION BY property_id, rate_date ORDER BY d)
),
giro AS (
  SELECT property_id, rate_date, new_price,
         CASE WHEN s <> 0 AND LAG(s) OVER w <> 0 AND s <> LAG(s) OVER w THEN 1 ELSE 0 END g
  FROM dir WINDOW w AS (PARTITION BY property_id, rate_date ORDER BY d)
),
cambios AS (
  SELECT property_id, rate_date, SUM(g) giros,
         MAX(new_price)::numeric / NULLIF(MIN(new_price),0) amplitud
  FROM giro GROUP BY property_id, rate_date
)
SELECT property_id,
       COUNT(*) noches,
       COUNT(*) FILTER (WHERE giros >= 3) oscilantes,
       ROUND(100.0*COUNT(*) FILTER (WHERE giros >= 3)/NULLIF(COUNT(*),0),1) pct_oscilantes,
       ROUND(AVG(amplitud) FILTER (WHERE giros >= 3),2) amplitud_media_oscilantes,
       ROUND(MAX(amplitud),2) amplitud_max
FROM cambios GROUP BY property_id ORDER BY property_id;
```

```sql
-- (C) Invariantes de seguridad. OJO a las dos trampas de arriba: ancla = ref24 (dia ANTERIOR),
--     y solo se juzga el rail cuando la escritura previa fue del dia justo anterior.
WITH ap AS (
  SELECT DISTINCT ON (property_id, rate_date, applied_at::date)
         property_id, rate_date, applied_at::date d, new_price
  FROM pricing_applied
  WHERE dry_run=false AND applied_at >= TIMESTAMPTZ '2026-08-27 19:00+00'
  ORDER BY property_id, rate_date, applied_at::date, applied_at DESC
),
anc AS (SELECT a.*, LAG(a.new_price) OVER w ref24, LAG(a.d) OVER w d_prev
        FROM ap a WINDOW w AS (PARTITION BY a.property_id, a.rate_date ORDER BY a.d)),
ev AS (SELECT DISTINCT rate_date FROM pricing_eventos_auto WHERE factor >= 1.15)
SELECT
  COUNT(*) FILTER (WHERE d-d_prev=1) comparaciones,
  COUNT(*) FILTER (WHERE d-d_prev=1 AND new_price < ROUND(ref24*(1-s.max_change_pct))-1) rail_baja_roto,
  COUNT(*) FILTER (WHERE d-d_prev=1 AND new_price > ROUND(ref24*(1+s.max_change_pct))+1
                     AND a.rate_date NOT IN (SELECT rate_date FROM ev)) alza_sin_evento,
  COUNT(*) FILTER (WHERE s.min_price IS NOT NULL AND new_price < s.min_price) bajo_minimo
FROM anc a JOIN pricing_settings s ON s.property_id=a.property_id;
```

## Veredicto — a rellenar en la pasada de seguimiento

| | baseline (ancla vieja, 7 días) | medido el ___ (ancla nueva) |
|---|---|---|
| Volatilidad del ancla | 1,94× · 1,96× · 2,19× · 2,52× | |
| % noches oscilantes — Dúplex Center | 33,4% | |
| % noches oscilantes — Luxury Busto | 27,2% | |
| % noches oscilantes — Busto Reform | 20,5% | |
| % noches oscilantes — House Sevillana | 3,2% | |
| Amplitud media de las oscilantes | 1,24-1,61× | |
| Raíl a la baja roto | 0 | |
| Bajo mínimo | 0 | |

**Regla de cierre:** si (2) baja claramente y (4)+(5) siguen a cero, el arreglo queda **observado**,
no solo simulado, y este documento se cierra con la fecha y las cifras. Si la muestra es corta o el
resultado es ambiguo, **no se cierra**: se re-arma el seguimiento unos días más. Un «parece que va
mejor» sobre 3 días de datos es exactamente el tipo de afirmación que este repo trata como un fallo.
