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

## Luxury Busto (4340072) — PENDIENTE

## Busto Reform (4771238) — PENDIENTE

## Veredicto conjunto — PENDIENTE (al completar los 4)
