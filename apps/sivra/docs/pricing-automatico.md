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
- [x] **Comps por capacidad para los 4 pisos** (09/06): Busto 2pax p50 168€ · Duplex 4pax p50 180€ ·
      Luxury 5pax p50 228€ · House 12pax p50 650€. (Booking; falta añadir Trivago como 2ª fuente.)
- [ ] **Reconciliar la fórmula:** para Busto Reform no cuadran `OUR_PRICES.normal` (80€) vs base `snapshot`
      (175€) vs mercado real (~168€). Definir una única fuente de verdad del "precio recomendado".
- [ ] **Cerrar el bucle a Smoobu:** escribir el precio en el canal vía Smoobu API (con tope de seguridad
      y/o aprobación), no sólo email.
- [ ] **Robustez/observabilidad:** reintentos, alerta si una fuente falla, rechazo de outliers (precio
      absurdo no se aplica), y **auditoría de cada cambio de precio** (defender el resultado ante el cliente).
- [ ] **Multi-propiedad / multi-cliente:** generalizar de 4 pisos fijos a N propiedades por cuenta
      (encaja con la jerarquía `Cuenta→Sociedad→Negocio` de `apps/plataforma`).

## 6. Ideas de producto (priorizadas)

1. **Motor anclado al MERCADO (en vez de fórmula a mano) — la grande.** Hoy el precio sale de
   multiplicadores inventados (`EVENTS/SEASONAL/DOW`) imposibles de defender ante un cliente. Con el
   mercado real por fecha/capacidad, el motor debe ser: **"posiciónate en el percentil X del mercado
   comparable, ajustado por calidad (reseñas), con suelo/techo de seguridad"**. Ventajas: resuelve la
   reconciliación de fórmula de raíz (el mercado es la verdad), es **explicable/vendible**
   ("te pongo en el p55 de tu competencia real"), y se autoajusta a Feria/Semana Santa sin tablas a mano.
2. **Diferencial comercial: pricing + operaciones + fiscal en uno.** PriceLabs/Beyond/Wheelhouse solo
   hacen pricing. El monorepo ya tiene limpiezas (ialimp), fiscal (core-fiscal) y cuadro de mando
   (plataforma) → gancho: **"pricing + limpieza + facturación, integrado, en español"** para gestores
   pequeños. Difícil de copiar.
3. **Medir DEMANDA, no solo precio.** Los conectores devuelven disponibilidad; si la competencia se
   llena para una fecha, es señal de subir. Ya existe `was_booked` en `rate_snapshots` → revenue
   management real (sube/baja por ocupación del mercado).
4. **Validar el piloto YA (coste 0).** Para Busto Reform ya hay mercado (~168€). Fijar un precio de
   prueba anclado al mercado y medir si se reserva con el bucle de experimentos existente, mientras se
   construye el resto.

## 5. Estado a 09/06/2026
PR **#108** (draft, CI verde) en branch `claude/tourist-apartments-auto-pricing-jq0v4z`. Hecho:
- `POST /api/mercado/ingest` — tubería de comps reales (Estrategia 1).
- Comps a-capacidad cargados para los **4 pisos** (ver §3 / §4).
- `GET /api/pricing/recommend` — **motor anclado al mercado** (idea #1), **100% adaptable por piso**: recomienda
  precio desde el percentil del mercado comparable, ajustado por **calidad** (reseñas) y con hook de **demanda**.
  Sólo **calcula**, NO cambia precio en vivo ni escribe en Smoobu.
- **`pricing_settings` (tabla, por piso) — clave del producto vendible.** Es un SaaS de pago para propietarios:
  cada uno configura lo suyo y **sólo se calcula/aplica si `enabled=true` (contratado)**. Columnas: `enabled`,
  `target_pctl` (posicionamiento, def. 0.50), `floor_pctl`/`ceil_pctl` (suelo/techo de seguridad), `position_factor`
  (multiplicador manual), `quality_k` (sensibilidad reseñas), `own_score`, `min_price`/`max_price` (suelo/techo abs.).
  Semilla: los 4 pisos propios activados con posicionamiento neutro (mediana).

**Estado del modelo (afinado):**
- ✅ **Demanda (idea #3):** `demandFactor` real desde la **ocupación propia** (Smoobu, `rate_snapshots`, fechas
  futuras): si nos llenamos, sube; si no, baja. Acotado ±8%. Perillas por piso `demand_k`/`demand_baseline`.
  Verificado 09/06: Busto 75%→×1.04 · Duplex/Luxury 63%→×1.02 · House 25%→×0.96.
- ✅ **Calidad:** `own_score` real cargado por piso (Busto 6,9 · Duplex 7,6 · Luxury 7,2 · House 8,4, dados por Alberto
  desde Booking). Están **por debajo** de la mediana del mercado (8,7–8,8) → el ajuste **baja** el precio (correcto:
  peor nota = menos precio). Acotado ±10%, perilla `quality_k`.
- 🟡 **2ª fuente:** Trivago añadido en **Duplex** (Booking 187 / Trivago 185, concuerdan). Busto ya lo tiene;
  Luxury/House pendientes (Trivago adelgaza a 5/12 pax).

**Salida verificada del motor (09/06, mercado × demanda × calidad):** Busto **161€** · Duplex **175€** · Luxury **219€** · House **614€**.

**Decisión de negocio pendiente (toca dinero, NO se ejecuta sin OK explícito):** aprobar el salto de "recomendar" →
"aplicar" (escribir el precio en Smoobu vía API) y con qué tope/aprobación.
