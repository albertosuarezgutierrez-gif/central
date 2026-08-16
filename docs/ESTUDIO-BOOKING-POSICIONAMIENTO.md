# Estudio: cómo funciona el posicionamiento en Booking.com y cómo adaptarnos

> Pedido por Alberto (16/08/2026): «¿merece la pena subir la base +20% por portal y dar descuentos
> específicos para posicionar mejor?». Fuentes web de 2024-2026 + los datos REALES medidos en este
> monorepo (20 reservas auditadas el 09/08/2026: huésped paga listado × 0,66-1,08, mediana 0,92).

## 1. Cómo ordena Booking de verdad

Booking ordena por **ingreso esperado por impresión**: modelos de ML que predicen, para cada
búsqueda, la probabilidad de clic (pCTR) × probabilidad de conversión (pCVR) × precio. Booking ha
dicho explícitamente que **la conversión es el factor de más peso**. Los insumos principales:

| Factor | Qué mide | Palanca nuestra |
|---|---|---|
| **Conversión** | % de visitas a la ficha que reservan | Precio final competitivo, fotos, badges de oferta |
| CTR | % de impresiones que hacen clic | Foto principal, precio tachado, badge Genius/oferta |
| **Competitividad de precio** | Tu precio FINAL vs pisos comparables esa fecha | El motor ya ancla a mercado — es nuestra fortaleza |
| Reseñas | Nota y volumen | Operativa (ya fuerte) |
| Disponibilidad | Calendario abierto a futuro | Ya abierto 365d |
| Cancelaciones | Las del anfitrión penalizan MUY fuerte | No cancelar nunca |
| Contenido | Ficha completa (fotos, amenities, políticas) | Revisión única |
| Comisión | Programas que pagan más comisión rankean más | Preferred/Booster (de pago) |

Claves: (a) el peso de cada factor **cambia con la demanda** — en fechas calientes la conversión
pesa aún más; (b) un precio claramente por ENCIMA de los comparables **des-prioriza** (no como
castigo, sino porque predice conversión baja).

## 2. Las palancas oficiales de visibilidad

- **Genius** (ya lo tenemos, medido ~11%): −10% que paga el anfitrión, sin comisión extra.
  Booking publicita +70% de vistas y +45% de reservas. ⚠️ En 2026 cambió: el empujón ya no es
  garantizado, es «por relevancia» — Genius solo, cada vez rinde menos.
- **Preferred Partner**: ~+3% de comisión a cambio de hasta +65% de vistas y el pulgar 👍.
  Requiere nota y rendimiento mínimos. Es la palanca de pago «siempre activa».
- **Visibility Booster**: puja de comisión extra (5-30%) **por fechas concretas** — pagar por
  rankear solo cuando interesa (p. ej. rellenar un hueco de temporada alta). Quirúrgico, caro.
- **Ofertas** (Early Booker, Last-minute, Getaway/de temporada, Limited-time): generan el
  **precio tachado** y el badge. Efecto principal medible: **conversión** (el ancla visual), no el
  puesto en la lista directamente — pero como la conversión ES el factor nº1, acaba subiendo el
  puesto por la vía indirecta.
- **Tarifa móvil** (ya activa, −10%): >70% del tráfico de Booking es móvil.

## 3. La táctica que propone Alberto: base +20% y descuentos encima

**Veredicto: SÍ merece la pena, con una condición innegociable.** Es la práctica estándar del
sector («precio de escaparate»), y funciona así:

- Subir el precio por portal +20% y aplicar descuentos (Genius 10% + móvil 10% + una oferta
  visible) deja el **precio final ≈ el actual** (1,20 × 0,76 ≈ 0,91 — casi clavado al 0,92
  mediano que medimos), PERO ahora el huésped ve *«−25%»* tachado y badges por todas partes.
  Mismo ingreso neto, más CTR y más conversión → mejor ranking con el tiempo.
- **La condición**: el precio FINAL (tras descuentos) tiene que seguir siendo competitivo contra
  los comparables de la fecha. Si subes +20% y NO devuelves ese margen en descuentos visibles,
  el algoritmo te des-prioriza por caro. La táctica es un juego de PRESENTACIÓN del mismo precio,
  no una subida encubierta.
- Riesgo menor: descuentos demasiado agresivos apilados (semanal+mensual+Genius+móvil+oferta) se
  MULTIPLICAN — la lección del landmine del 13/07 (efectivo a 0,56×listado). Toda oferta nueva se
  mide contra `incomes` a las 2 semanas.

## 4. La paridad de precios ha MUERTO en la UE (y eso nos abre el canal directo)

- Booking fue designado **gatekeeper del DMA** (jun-2024) y **eliminó todas las cláusulas de
  paridad en el EEE** (nov-dic 2024); el TJUE remató en sentencia. Legalmente, **podemos poner
  housesevillana.es (y el resto) más barato que Booking** sin incumplir contrato.
- Matiz real: el ALGORITMO sigue mirando tu competitividad —«la paridad contractual murió, la
  algorítmica no»— pero el descuento directo no aparece en los meta-buscadores que Booking vigila
  si se sirve como precio de la web propia.
- **Jugada completa**: Booking a base×1,20 con descuentos visibles (escaparate) + **web directa a
  ~base×1,05** («reserva directa: 10-15% más barato que Booking») = cada huésped que compara nos
  ahorra la comisión del ~15-18%.

## 5. Cómo se monta con Smoobu + nuestro motor (plan por fases)

Smoobu soporta **ajuste porcentual de precio POR PORTAL** (Configuración del canal → porcentaje;
⚠️ tras cambiarlo hay que FORZAR el push de precios, guardar no basta).

- **Fase 1 — escaparate (Alberto, 10 min):** en Smoobu, ajuste **+20% SOLO canal Booking** en los
  4 pisos. La web directa y otros portales quedan a base.
- **Fase 2 — motor (misma hora, Claude):** poner `pricing_settings.channel_markup = 1.20` en los
  4 pisos. 🚨 **ORDEN CRÍTICO**: el markup del motor se cambia DESPUÉS del de Smoobu — el motor
  divide sus objetivos de mercado por este factor para fijar la base; si se cambia antes, bajaría
  las bases un 17% sin escaparate que lo compense. (Es la misma mecánica que el fix del 09/08,
  en sentido inverso.)
- **Fase 3 — ofertas visibles (Alberto, extranet):** activar UNA oferta permanente tipo
  «oferta de temporada/Getaway» del 10-15% (crea el tachado) + mantener Genius y móvil. NO
  reactivar semanal/mensual por encima del −5/−10% actual (landmine multiplicación).
  📋 **Inventario real de la extranet (16/08/2026): `docs/BOOKING-DESCUENTOS-INVENTARIO.md`** —
  el −29% observado era el **Genius dinámico (0-30%, activo en 3 de 4 pisos)** × móvil 10%; antes
  de subir +20% hay que decidir si ese dinámico se queda (House Sevillana lo tiene en «No» y su
  exposición máxima es la mitad). Ojo también: Luxury Busto tiene el No reembolsable a −15%
  (los demás −10%).
- **Fase 4 — medir (Claude, a los 14 días):** repetir la auditoría de las 20 reservas
  (`amount_gross/nights` vs listado): la mediana efectivo/base debe salir ≈ 0,90-0,95. Si sale
  <0,85, hay una oferta de más; recalibrar `channel_markup` al valor MEDIDO. Comparar además
  ranking (posición en búsqueda incógnito para fechas test) y conversión antes/después.
- **Fase 5 — opcionales de pago, solo con datos:** Preferred Partner (+3% comisión) si tras un mes
  el ranking no acompaña; Visibility Booster solo para huecos concretos de temporada alta.

## 6. Qué NO hacer

- No subir +20% sin los descuentos visibles (des-prioriza por caro).
- No apilar ofertas sin medir (multiplican; landmine 13/07).
- No cancelar nunca una reserva de anfitrión (el algoritmo lo castiga más que nada).
- No tocar `channel_markup` del motor sin cambiar Smoobu primero (orden de la Fase 1→2).

## Fuentes

- [StayStrat — Booking.com Ranking Algorithm](https://staystrat.com/blog/booking-com-ranking-algorithm-how-search-results-work) · [Smart Order — Ranking Algorithm Explained](https://www.smartorder.ai/resources/blog/booking-com-ranking-algorithm/) · [MyDataValue — Cracking the Algorithm](https://www.mydatavalue.com/blog/cracking-the-booking-com-ranking-algorithm-improve-visibility-and-revenue-with-ai/)
- [Houst — Genius: Is It Worth It? (2026)](https://www.houst.com/blog/booking-com-genius-program) · [Otelciro — Genius Strategy 2026](https://otelciro.com/en/resources/blog/booking-genius-loyalty-program-hotel-strategy-2026) · [Little Hotelier — Preferred vs Genius](https://www.littlehotelier.com/blog/get-more-bookings/preferred-partner-program/)
- [Legal Dive — EU Booking.com parity decision](https://www.legaldive.com/news/online-price-parity-clauses-at-risk-eu-bookingcom-decision-lodging-other-industries/727688/) · [Hospitality.today — Parity didn't die](https://www.hospitality.today/article/europe-killed-the-parity-clause-parity-didnt-die) · [Hostizoo — End of price parity](https://www.hostizoo.com/hub/end-of-ota-price-parity-2025)
- [Smoobu — precios distintos por portal](https://support.smoobu.com/hc/en-us/articles/360003189439-How-do-I-set-different-prices-to-different-booking-portals) · [Smoobu — forzar push de precios](https://support.smoobu.com/hc/en-us/articles/360021383459-How-do-I-overwrite-my-prices-and-force-a-price-sync)
- [PriceLabs — Booking promotion/discount logic](https://hello.pricelabs.co/blog/booking-com-promotion-discount-logic/) · [Hostaway — Rank #1 on Booking](https://www.hostaway.com/blog/how-to-rank-1-on-booking-com/)
