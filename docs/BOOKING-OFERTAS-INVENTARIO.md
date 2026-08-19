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

| Oferta | Categoría | % | Reserva | Estancia | Planes | Condiciones |
|---|---|---|---|---|---|---|
| Basic Deal | Catálogo de ofertas | 12% | 18/08/2026 → | hasta 18/08/2030 | Todos | Tachado visible. ⚠️ Activada el 18/08/2026 — origen pendiente de confirmar |
| Mobile rate | Tarifa específica | 10% | 07/03/2024 → | siempre | Todos | App/web móvil. La de más volumen: 70 reservas / 183 noches / 114.487,94€ en 12 meses |
| EEA country rate | Tarifa específica | 10% | 19/02/2026 → | siempre | Solo No reembolsable | Mín. 3 noches |
| UK country rate | Tarifa específica | 10% | 19/02/2026 → | siempre | Solo No reembolsable | Mín. 3 noches |
| US country rate | Tarifa específica | 10% | 19/02/2026 → | siempre | Solo No reembolsable | Mín. 3 noches |

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

## Busto Reform (4771238) — PENDIENTE

## Veredicto conjunto — PENDIENTE (al completar los 4)
