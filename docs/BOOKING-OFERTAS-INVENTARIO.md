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
~2× nuestra cifra. Sigue sin causa confirmada.## El canal directo y Booking: qué paga de verdad cada uno (medido 19/08/2026)

> **Corrección del 19/08/2026, el mismo día.** La primera versión de esta sección se titulaba «el
> canal directo es HOY MÁS CARO que Booking» y afirmaba que la web cobra 1,00 × base. **Era falso**,
> y el error era mío: di por supuesto un lado de la comparación en vez de medirlo. El motor de
> reservas de Smoobu aplica **su propio descuento por duración de estancia** encima de la base, y yo
> no sabía que existía. La corrección se deja a la vista porque el fallo —afirmar un lado de una
> comparación sin haberlo mirado— es justo lo que prohíbe la regla «dato que NO hay ≠ dato que NO se
> ha mirado», y esta vez se saltó en el lado propio, no en el de la fuente externa.

**Cómo se forma cada precio.** El motor escribe en Smoobu el precio BASE. Smoobu le suma **+20% al
enviarlo a Booking** (ajuste de canal), y allí el huésped le resta Genius, tarifa móvil, oferta de
catálogo y plan. El motor de reservas propio parte de esa misma base y le aplica su **descuento por
duración de estancia**.

### Lado Booking (medido: 7 reservas del último mes)

| Piso | Entrada | Pagado/noche | Base del motor | Ratio |
|---|---|---|---|---|
| Luxury | 18/09 | 138€ | 128€ | 1,076 |
| House | 30/09 | 622€ | 645€ | 0,965 |
| Dúplex | 03/10 | 138€ | 168€ | 0,821 |
| Dúplex | 16/10 | 140€ | 175€ | 0,804 |
| Luxury | 16/10 | 171€ | 194€ | 0,881 |
| Luxury | 22/10 | 143€ | 203€ | 0,706 |
| Luxury | 06/11 | 122€ | 122€ | 1,004 |

**Mediana: 0,88.** Dos límites que hay que decir en voz alta: la muestra es de 7, y
`incomes.amount_gross` **no desglosa la tarifa de limpieza**, así que el ratio la lleva dentro. Vale
para el orden de magnitud, no para la tercera cifra.

### Lado directo (medido: prueba real en el motor de reservas)

House Sevillana, 21→23/08/2026, 2 noches, 1 persona. Base confirmada en `pricing_applied`:
**360,00€/noche** los dos días → 720,00€, que es exactamente el «Precio base» que muestra el motor.

| Concepto | Sin código | Con DIRECT20 |
|---|---|---|
| Precio base | 720,00€ | 720,00€ |
| Tarifa de limpieza | 110,00€ | 110,00€ |
| Descuento larga estancia | −144,00€ | −144,00€ |
| Cupón 20% | — | −137,20€ |
| **Pago total** | **686,00€** | **548,80€** |

Aislando el alojamiento (fuera la limpieza): **0,80 × base** sin código, **0,64 × base** con DIRECT20.

### La conclusión, corregida

| Canal | Paga el huésped | Recibe Alberto |
|---|---|---|
| Booking | ~0,88 | ~0,73 (comisión ~17%) |
| **Web sin código** | **0,80** | **~0,79** (Stripe ~1,5%) |
| Web con DIRECT20 | 0,64 | ~0,63 |

**La web ya era ~9% más barata que Booking sin haber hecho nada**, y en esa configuración una noche
directa renta un ~8% más que una de Booking. `DIRECT20` **se pasa de largo**: deja el directo por
debajo del punto de empate (−27%) y hace que una reserva directa rente **menos** que una de Booking.
Encima su 20% cae también sobre la tarifa de limpieza (22,00€), que no es margen: al limpiador se le
pagan los 110,00€ igual.

**Así que el problema del canal directo nunca fue el precio.** Era el acceso: el botón de reservar
apuntó a `reservas.house-sevillana.com` —un dominio sin DNS— hasta el 12/08/2026, y GA4 da 109
sesiones en 12 meses con **1 solo clic saliente**.

### Estado y qué falta por mirar

- `DIRECT20` (20%, las 4 propiedades, 19/08/2026 → 31/12/2030) **está creado y verificado**, pero
  **NO publicado**: no aparece en la landing, así que ningún huésped puede usarlo. Inofensivo
  mientras siga sin anunciarse.
- **Pendiente — la tabla del descuento por duración.** La prueba fue de **2 noches**. No se sabe si a
  1 noche hay descuento (si no lo hay, en estancias cortas la web sí sale más cara que Booking y un
  código pequeño se justificaría) ni si crece con la duración (si a 7 noches es mayor, `DIRECT20`
  encima sería ruinoso). **Hasta tener esa tabla no se publica el código ni se toca la landing.**
- Nota de configuración: el cupón de Smoobu **no admite** límite de usos, importe mínimo ni
  restricción por duración de estancia — solo propiedades, valor, unidad y fechas. Es un instrumento
  romo, y por eso no puede compensar un descuento por duración que sí varía.
- Sigue vivo el cupón `FRIENDS` (ChekingFIDELIZACION, 20%, las 4 propiedades, hasta 25/07/2030).
