# Precio automático (pricing dinámico) — SIVRA

> **Objetivo de negocio:** convertir esto en un **producto vendible** (automatización de
> pricing para pisos turísticos). Premisa: **no puede fallar** — un precio mal puesto es
> dinero perdido o una reserva perdida para el cliente. Este documento es la fuente de
> verdad del módulo: qué hay, cómo funciona, y qué falta para que sea product-grade.

## 1. Qué hace hoy (en producción)

Pipeline diario (crons en `apps/sivra/vercel.json`):

1. **`/api/rates/snapshot`** (07:00) — motor de precio propio. Calcula "nuestro precio" con
   `base × max(EVENTOS, ESTACIONAL[mes]) × DÍA_SEMANA`, lo compara con el precio real de Smoobu
   (columna `price_pricelabs`) y lo guarda en `rate_snapshots`. Marca retroactivo si la fecha se reservó.
2. **`/api/mercado/cron`** (07:15) — competencia de mercado. Hoy vía **scraping de Google (Serper) + IA**.
   Genera alertas (`pricing_alerts`) si estamos muy por encima/debajo del mercado.
3. **`/api/pricing/experiments/check-results`** (08:00) — mide si los precios fijados se reservaron.
4. **`/api/pricing/detect-opportunities`** (08:05) — donde superamos a la competencia en ≥40€, registra
   experimento y **manda email** a Alberto para subir el precio en Smoobu **a mano**.

UI: `/pricing`, `/mercado`, widget `pricing-alerts-widget`.

## 2. Fuente de mercado — estado y decisión

- **Conectores evaluados** (herramientas MCP de Claude, **NO** llamables desde el cron de Vercel):
  el mejor para **apartamentos** es **Booking** (`accommodations_search`) + **Trivago** (radius search):
  precio real/noche, score, reseñas, barrio. DirectBooker/Wyndham/lastminute/TripAdvisor son de hoteles → no sirven.
- **Estrategia 1 (actual, coste 0):** Claude/agente recolecta comps reales y los vuelca en `market_rates`
  (directo o por `POST /api/mercado/ingest`). Suficiente para el **piloto**, NO autónomo.
- **Estrategia 2 (para producto):** suscribir una **API real** (Booking/Expedia partner o RapidAPI tipo
  `booking-com15`) y que el cron la llame → 100% autónomo. Coste mensual. `/api/mercado/ingest` ya es el hook.

### `POST /api/mercado/ingest`
Tubería de ingesta de comps reales (sin Serper). Protegido por `CRON_SECRET` (Bearer o `?secret=`).
Upsert idempotente en `market_rates` con clave `(search_date, portal, scenario, comp_name, checkin_date)`.
Cuerpo: `{ portal, scenario, checkin, checkout, guests?, currency?, apartments: [{name, price_night, ...}] }`.

## 3. ⚠️ Capacidad importa (comparar bien)

Cada piso tiene capacidad distinta → hay que comparar contra apartamentos de **la misma ocupación**:

| Piso | scenario | Dorm. | Camas | maxGuests |
| --- | --- | --- | --- | --- |
| Busto Reform | `prop_busto_reform` | 1 | 1 | **2** |
| Duplex Center | `prop_duplex_center` | 1 | 2 | 4 |
| Luxury Busto | `prop_luxury_busto` | 2 | 5 | 5 |
| House Sevillana | `prop_house_sevillana` | 6 | 6 | 12 |

**Piloto Busto Reform** (a 2 plazas, 13→14 jun 2026): mercado real ≈ **166–168€/noche**
(Booking avg 168, Trivago 166; rango 140–220). *Nota:* los conectores no exponen filtro por nº de
dormitorios; se usa la **ocupación (huéspedes)** como proxy.

## 4. Checklist para que sea VENDIBLE ("no puede fallar")

- [ ] **Autonomía (Estrategia 2):** API real de mercado llamada por el cron, sin humano en el bucle.
- [ ] **Comps por capacidad para los 4 pisos:** sólo Busto Reform está corregido; faltan Duplex/Luxury/House.
- [ ] **Reconciliar la fórmula:** para Busto Reform no cuadran `OUR_PRICES.normal` (80€) vs base `snapshot`
      (175€) vs mercado real (~168€). Definir una única fuente de verdad del "precio recomendado".
- [ ] **Cerrar el bucle a Smoobu:** escribir el precio en el canal vía Smoobu API (con tope de seguridad
      y/o aprobación), no sólo email.
- [ ] **Robustez/observabilidad:** reintentos, alerta si una fuente falla, rechazo de outliers (precio
      absurdo no se aplica), y **auditoría de cada cambio de precio** (defender el resultado ante el cliente).
- [ ] **Multi-propiedad / multi-cliente:** generalizar de 4 pisos fijos a N propiedades por cuenta
      (encaja con la jerarquía `Cuenta→Sociedad→Negocio` de `apps/plataforma`).

## 5. Estado a 09/06/2026
PR **#108** (draft, CI verde) en branch `claude/tourist-apartments-auto-pricing-jq0v4z`: endpoint de ingesta +
piloto Busto Reform cargado y corregido por capacidad. Falta decidir el siguiente paso (comps de los otros 3
pisos / reconciliar fórmula / Estrategia 2).
