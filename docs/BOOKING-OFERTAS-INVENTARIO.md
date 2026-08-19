# Inventario de ofertas en la extranet de Booking — 4 pisos SIVRA

> Levantado con Claude Chrome (solo lectura) a partir del 19/08/2026, como paso previo a la
> Fase 3 del estudio `ESTUDIO-BOOKING-POSICIONAMIENTO.md`. Contexto clave descubierto el
> 19/08: **el +20% por canal Booking ya existía en Smoobu** (era PriceLabs) → la Fase 2
> (`channel_markup=1.20` en el motor) quedó **CANCELADA** y cualquier oferta nueva se decide
> contra este inventario (los descuentos de Booking se MULTIPLICAN entre categorías).
>
> IDs extranet: House 2039943 · Dúplex 2888928 · Luxury 4340072 · Busto Reform 4771238.
> Regla de apilamiento confirmada en el simulador: dentro de cada categoría solo cuenta el
> mayor; entre categorías (Genius × tarifas específicas × catálogo de ofertas × plan) se
> multiplican.

## House Sevillana (2039943) — inventariado 19/08/2026

**Ofertas activas (5):**

| Oferta | Categoría | % | Desde | **Rendimiento 12m (19/08/2026)** |
|---|---|---|---|---|
| Mobile rate | Tarifa específica | 10% | 07/03/2024 | **70 reservas · 183 noches · ADR 625,62€ · 114.487,94€** |
| **EEA country rate** | Tarifa específica | 10% | 19/02/2026 | **3 reservas · 15 noches · ADR 472,97€ · 7.094,51€** ✅ |
| Basic Deal | Catálogo de ofertas | 12% | 18/08/2026 | 1 reserva · 4 noches · ADR 862,37€ · 3.449,47€ |
| UK country rate | Tarifa específica | 10% | 19/02/2026 | **— (0 reservas en 6 meses)** |
| US country rate | Tarifa específica | 10% | 19/02/2026 | **— (0 reservas en 6 meses)** |

(EEA/UK/US: solo plan No reembolsable, mínimo 3 noches. Móvil y Basic Deal: todos los planes.)

**Genius:** activo — Nivel 1-3 al 10% (base bloqueada) + Nivel 2-3 al **15%** (activo).
Nivel 3 (20%) NO activado (⚠️ no activar). Sin descuento dinámico.

**Planes de tarifa:** Standard 43163158 (base, mapeado Smoobu) · Flexible 43164126 (+10%) ·
No reembolsable 43164268 (−10%) · Semanal 43164690 (−10%) · Mensual 43164716 (−10%).

**Programadas/pausadas:** ninguna. Terminada: «SEMANA SANTA» 20% (caducada, 1 reserva 1.749,02€).

**Apilamiento máximo:** solo promos 0,85×0,90×0,88 = **−32,7%**; peor caso real con plan
No reembolsable/semanal/mensual: ×0,90 → **−39,4%** (huésped paga 60,6% del Standard).

**Lectura preliminar (pendiente del veredicto con los 4):** mantener Basic Deal (es el
tachado del plan) + Genius + móvil; candidatas a QUITAR las 3 tarifas por país (apilan −10%
sin aportar escaparate). En la práctica House apila poco: las 2 reservas de la semana del
17/08 pagaron el 96,5% y ~94% de lista.

## Dúplex Center (2888928) — inventariado 19/08/2026 (parcial)

**Ofertas activas (2) — la mitad que House, y SIN tarifas por país:**

| Oferta | Categoría | % | Reserva | Estancia | Rendimiento 12m |
|---|---|---|---|---|---|
| Mobile rate | Tarifa específica | 10% | 07/03/2024 → | siempre | **80 reservas · 335 noches · ADR 114,39€ · 38.319,10€** |
| «Oferta estándar 8% permanente» | Catálogo de ofertas | **12%** | 16/08/2026 → | 16/08/2026–31/12/2028 | 2 reservas · 4 noches · ADR 121,62€ · 486,47€ |

⚠️ **El nombre miente**: la oferta se llama «estándar 8%» pero descuenta **12%**. Mismo patrón que la
Basic Deal de House (12%, activada 18/08) — las dos nacieron el 16-18/08/2026, origen por confirmar.

**Avisos que muestra Booking en esta ficha (son sugerencias de venta suyas, no diagnósticos):**
- «Tus reservas de Reino Unido están por debajo de la media»: Dúplex 0% vs 9% de la zona. Booking
  empuja a crear una UK country rate. 🔎 Señal a cruzar con House (que SÍ tiene las 3 tarifas país):
  con n=1 no prueba causalidad, pero hay que mirarlo antes de decidir si se quitan.
- «Tu grupo de referencia reserva más de última hora»: nosotros ~53 días de antelación vs ~39 del
  grupo. Encaja con el last-minute del motor (`lastminute_k=0.5` desde el 09/08) — el descuento de
  urgencia ya lo aplica el motor sobre la base, no hace falta la «last-minute deal» de la extranet
  (sería un descuento MÁS que se multiplica).

**Pendiente de este piso:** Genius (niveles activos y % máximo) y planes de tarifa
(Standard/Flexible/No reembolsable/semanal/mensual) — no salen en la pantalla de promociones.

**Apilamiento conocido hasta ahora:** 0,90 (móvil) × 0,88 (oferta 12%) = **−20,8%**, más Genius y el
plan de tarifa cuando se confirmen. Muy por debajo del −39,4% de House.

## Luxury Busto (4340072) — inventariado 19/08/2026 (parcial)

**Ofertas activas (2), mismo patrón que Dúplex y SIN tarifas por país:**

| Oferta | Categoría | % | Reserva | Estancia | Rendimiento 12m |
|---|---|---|---|---|---|
| Mobile rate | Tarifa específica | 10% | 07/03/2024 → | siempre | **121 reservas · 347 noches · ADR 122,89€ · 42.644,51€** |
| «Oferta estándar 8% permanente» | Catálogo de ofertas | **8%** | 16/08/2026 → | 16/08/2026–31/12/2028 | sin reservas todavía |

📌 Aquí la oferta SÍ descuenta el 8% que dice su nombre — en Dúplex la misma oferta descuenta 12% y
en House la Basic Deal 12%. El % varía por piso aunque el nombre sea idéntico: no fiarse del nombre.

**Avisos de «Datos clave» (sugerencias de venta de Booking, con sus cifras):**
- UK 0% vs 9% de la zona (igual que Dúplex).
- Antelación: nosotros **~81,2 días** vs ~65,7 del grupo (Dúplex: 53 vs 39). Luxury se reserva con
  mucha más antelación que el Dúplex — dato útil para el `lastminute` por piso del motor.
- 🆕 **«Los viajeros de UK tienen una tarifa media más alta»: UK 161€ vs nuestros 126€ (~1,3×).**
  Esto **da la vuelta a mi lectura preliminar** sobre las tarifas por país: el −10% de la tarifa UK
  no es solo margen regalado, es el precio de entrada a un segmento que paga ~30% más. Antes de
  recomendar quitar las 3 tarifas país de House hay que comprobarlo con datos propios, no con la
  intuición de «un descuento menos».

**Pendiente de este piso:** Genius y planes de tarifa.

**Apilamiento conocido:** 0,90 (móvil) × 0,92 (oferta 8%) = **−17,2%** — el más contenido de los tres.

## 🚩 La antelación que dice Booking NO es la nuestra (comprobado 19/08/2026)

Los avisos «tu grupo reserva más de última hora» dan cifras que **no cuadran con `incomes`**:

| Piso | Booking dice | Nuestra mediana real | Nuestra media |
|---|---|---|---|
| Luxury Busto | ~81,2 d | **23 d** | 44 d |
| Dúplex Center | ~53 d | **16 d** | 21 d |
| House Sevillana | (no visto) | 42 d | 56 d |
| Busto Reform | (no visto) | 19 d | 51 d |

Medido sobre reservas BOOKING de los últimos 12 meses, tanto por fecha de estancia como por fecha de
reserva (los dos cortes dan lo mismo, así que no es el filtro). **Causa NO confirmada**: la hipótesis
razonable es que Booking cuente también las canceladas —que suelen reservarse con mucha antelación y
nosotros borramos de `incomes`—, pero `reservas_canceladas` arrancó vacía el 12/08/2026 y hoy no
permite comprobarlo. Queda como discrepancia abierta.

**Consecuencia práctica:** el aviso de Booking NO es motivo para crear una last-minute deal. Nuestra
antelación real ya es corta (16-42 d de mediana) y el motor aplica el descuento de urgencia sobre la
base desde el 09/08 con la antelación mediana medida por piso y mes — que sale de `incomes`, no de
este panel.

## Busto Reform (4771238) — inventariado 19/08/2026 (parcial)

**Ofertas activas (2), calcadas a Luxury:**

| Oferta | Categoría | % | Reserva | Estancia | Rendimiento 12m |
|---|---|---|---|---|---|
| Mobile rate | Tarifa específica | 10% | 07/03/2024 → | siempre | **69 reservas · 274 noches · ADR 85,19€ · 23.343,14€** |
| «Oferta estándar 8% permanente» | Catálogo de ofertas | 8% | 16/08/2026 → | 16/08/2026–31/12/2028 | sin reservas todavía |

**Apilamiento conocido:** 0,90 × 0,92 = **−17,2%**. Pendientes Genius y planes de tarifa.

### 🚨 El panel de Booking muestra un número ROTO (y por qué importa)

El aviso «los viajeros de UK tienen una tarifa media más alta» dice aquí:
**«UK 161€ · Tú 0€ · about 922337203685477630x higher than average»**.

Ese factor es **2^63 − 1**: un desbordamiento de entero por dividir entre cero. La causa real es que
`Tú = 0€` y `Tú = 0 noches` en el bloque de estancia — es decir, **este piso no tiene NI UNA reserva
de UK**, y Booking presenta ese «no hay datos» como si fuera un valor (0€) y luego calcula un ratio
sobre él. Es el mismo patrón que la regla del CLAUDE.md sobre el dato que se lee mal, pero cometido
por el propio panel.

**Consecuencia:** los «Datos clave» de la extranet se usan como PISTA, nunca como cifra. Ya van dos
métricas suyas descartadas: la antelación (no cuadra con `incomes`) y este ratio (roto de origen).

## ✅ Veredicto FINAL (19/08/2026) — con el rendimiento por oferta de House

### 🔧 Corrección de dos errores propios de análisis

**1. La tabla comparativa de apilamiento era engañosa.** Comparaba el −39,4% de House (calculado CON
su Genius 15% y su plan No reembolsable −10%, que sí conocía) contra el −17/−21% de los otros tres
(calculado SIN Genius ni plan, porque no los tenía). No es que House descuente más: es que de House
había más datos. Si Luxury/Busto tienen el mismo Genius y planes, su peor caso sale ≈ −36,6%.
**Los cuatro están probablemente en la misma banda.** No hay ningún piso «desmadrado».

**2. Las tarifas por país NO aumentan el descuento máximo.** Dentro de cada categoría Booking aplica
**solo la mayor**, y la tarifa móvil (10%) ya ocupa la categoría «tarifas específicas». Quitar EEA/UK/US
**no baja ni un punto** el peor caso. Mi propuesta inicial de quitarlas para «recuperar margen» era
sencillamente incorrecta: no había margen que recuperar.

### Lo que dicen los datos de rendimiento

- **EEA country rate: 3 reservas · 15 noches · 7.094,51€ en 6 meses.** Trae negocio real. **Se queda.**
- **UK y US country rate: 0 reservas en 6 meses.** No aportan, pero tampoco cuestan (no suben el
  apilamiento). **Dejarlas o quitarlas es indiferente en euros**; si se quitan es por orden, no por
  dinero. Ojo con la lectura fácil: 0 reservas no prueba que estorben — prueba que ese mercado no ha
  entrado, con o sin ellas.
- **Mobile rate: la palanca del negocio en los 4 pisos** — 340 reservas y 218.794,79€ en 12 meses
  (House 114.487,94€ · Luxury 42.644,51€ · Dúplex 38.319,10€ · Busto 23.343,14€). Intocable.
- **Basic Deal de House (12%)**: 1 reserva de 4 noches a 862,37€/noche en su primer día. El escaparate
  funciona sin regalar el precio.

### Decisiones

1. **No crear ninguna oferta nueva.** La Fase 3 del estudio ya estaba hecha antes de empezar: los 4
   pisos tienen su oferta de escaparate (8-12%) desde el 16-18/08.
2. **No tocar nada de lo que hay.** Ninguna oferta activa está perdiendo dinero de forma demostrable.
3. **Genius nivel 3 (20%): no activarlo.** Es lo único que sí subiría el descuento real.
4. **Sigue faltando** Genius y planes de tarifa de Dúplex, Luxury y Busto Reform — sin ellos no se
   puede comparar el apilamiento real entre pisos (ver corrección 1). No bloquea ninguna decisión.

### 🚩 Tercera métrica del panel que no cuadra

House: Booking dice **~84 días** de antelación (peer 61,6); nuestro `incomes` dice **42 de mediana**
(56 de media). Mismo patrón que Luxury (81 vs 23) y Dúplex (53 vs 16): el panel da sistemáticamente
~2× nuestra cifra. Sigue sin causa confirmada.## El canal directo y Booking: qué paga de verdad cada uno (medido 19/08/2026)## Canal directo vs Booking: qué paga el huésped y qué te queda (cerrado 19/08/2026)

> **Esta sección se reescribió tres veces el mismo día**, y las tres versiones están en el historial
> del PR #1487. Merece la pena decir por qué, porque el patrón se repite: las dos primeras versiones
> **supusieron** el lado directo en vez de medirlo, y la segunda además usó una muestra de 7 reservas
> como si fuera un dato firme. Orden de los errores: (1) «la web cobra 1,00 × base» —falso, hay un
> descuento propio del motor—; (2) «la web es ~9% más barata y la comisión es ~17%» —la muestra corta
> daba 0,88 donde 16 reservas dan 0,976, y la comisión real medida sobre 1.322 reservas es 19,72%—.
> La regla «dato que NO hay ≠ dato que NO se ha mirado» aplica también al propio lado de la
> comparación, y un n=7 es una intuición, no una medición.

### Cómo se forma cada precio

El motor escribe en Smoobu el precio BASE. A partir de ahí:

- **Booking:** Smoobu le suma **+20%** (ajuste de canal) y allí el huésped resta Genius, tarifa
  móvil, oferta de catálogo y plan. Neto de esa cadena, el huésped acaba pagando ~la base.
- **Directo:** el motor propio aplica su **descuento por duración**, sobre el precio base y **no**
  sobre la tarifa de limpieza.

### El «descuento de larga estancia» NO es de larga estancia

Configuración leída en Ajustes → Motor de reservas → Ajustes de propiedad (19/08/2026), **idéntica en
las 4 propiedades**:

| Estancia mínima | Descuento |
|---|---|
| 2 noches | **20%** |
| 7 noches | 30% |
| 30 noches | 40% |

Y **la estancia mínima del calendario son 2 noches**: el motor no deja cotizar una sola noche en
ninguna fecha. Es decir, el primer tramo cubre el 100% de las reservas posibles → **el canal directo
tiene un −20% permanente**, no un incentivo a estancias largas. El nombre engaña.

### Qué paga el huésped, medido

Ratio pagado/base de las reservas de Booking, por duración (12 meses, solo las que tienen base
escrita por el motor):

| Tramo | n | Ratio mediana |
|---|---|---|
| 2-6 noches | 16 | **0,976** |
| 7-29 noches | 1 | 0,684 *(sin valor estadístico)* |

Y el directo, por la tabla de arriba: **0,80** (2-6 noches) · 0,70 (7+) · 0,60 (30+).

Prueba real en el motor que lo confirma (House Sevillana, base de `pricing_applied`):

| Estancia | Base | Limpieza | Descuento | Total |
|---|---|---|---|---|
| 21→23/08 (2 noches) | 720,00€ | 110,00€ | −144,00€ (20%) | **686,00€** |
| 07→10/09 (3 noches) | 1.560,00€ | 110,00€ | −312,00€ (20%) | **1.358,00€** |
| 09→16/11 (7 noches) | 3.808,00€ | 110,00€ | −1.142,40€ (30%) | **2.775,60€** |

### La conclusión

Comisión de Booking **medida**, no estimada: `amount/amount_gross` sobre 1.322 reservas de 12 meses
da **19,72%** (Airbnb, Expedia, Agoda y directo salen a 0%). Para la estancia típica de 2-6 noches,
que es 16 de las 17 medibles:

| Canal | Paga el huésped | Te queda a ti |
|---|---|---|
| Booking | 0,976 × base | **0,784** (−19,72%) |
| **Directo** | **0,80 × base** | **0,788** (−1,5% Stripe) |

**El huésped paga ~18% menos reservando directo y a Alberto le queda lo mismo.** Es la configuración
correcta: el canal directo no se está financiando con margen, simplemente no paga la comisión. No
hace falta ningún descuento adicional — y por eso el cupón `DIRECT20` (creado y **borrado** el mismo
día, id 166126) sobraba: habría dejado el directo en 0,64 × base, ~20 puntos por debajo de Booking.

Sigue vivo, intacto, el cupón `FRIENDS` (ChekingFIDELIZACION, id 1140, 20%, las 4 propiedades, hasta
25/07/2030) — fidelización, no canal.

### Entonces el problema del directo nunca fue el precio

Era el acceso. El botón de reservar apuntó a `reservas.house-sevillana.com` —un dominio sin DNS—
hasta el 12/08/2026, y GA4 da 109 sesiones en 12 meses con **1 solo clic saliente**. Aun así hay
**19 reservas por canal DIRECTO** en 12 meses, que no vienen de la landing: son repetidores y enlaces
directos. Ese es el suelo desde el que se mide cualquier mejora del embudo.

### Pendiente

- **Copy de la landing.** La promesa de «mejor precio garantizado» ya es cierta y es estructural (el
  −20% se aplica siempre). Falta decidir si se anuncia con número («hasta un 18% menos») o sin él;
  el número convierte mejor pero se apoya en n=16. **Decisión de Alberto, no aplicada aún.**
- **No tocar** los tres tramos de duración. El 30%/40% son agresivos pero una estancia larga tiene
  una sola limpieza en vez de varias; con n=1 en el tramo 7-29 no hay con qué juzgarlos.
