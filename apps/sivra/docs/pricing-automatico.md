# Precio automático (pricing dinámico) — SIVRA

> **🟢 Actualización 09/08/2026 — los 4 pisos tarifican con el motor propio; PriceLabs DE BAJA.**
> El motor anclado a mercado (`apps/plataforma/app/api/sivra/pricing/apply/route.ts`, cron
> `apply-auto` 3×/día) escribe los precios de los 4 pisos en Smoobu. PriceLabs quedó pausado y
> cancelado ese día (su última curva persiste en `pricing_pl_referencia` como referencia, 120 días).
> Las menciones a PriceLabs de este documento son HISTÓRICAS. La columna
> `rate_snapshots.price_pricelabs` conserva su nombre legacy pero es el precio real vivo en Smoobu.

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

## 7. PILOTO EN CURSO — Busto Reform (inicio 09/06/2026)

Validación manual en **1 apartamento** antes de construir el push automático. Recordatorio en Google Calendar de Alberto
para el **16/06/2026 10:00** (análisis a 1 semana).

**Baseline (antes, 09/06):**
- Ocupación próx. 7 días: **75%** · Reseñas propias: **6,9** · Mercado comparable (2 plazas) mediana: **168€**
- **🚨 Precio REAL que tenía PriceLabs en Smoobu: ~70€/noche (rango 65-81)** — menos de la mitad del mercado (168€).
- Precio **recomendado por el motor: 161€** (con descuento por reseñas bajas ya aplicado).
- PriceLabs DESCONECTADO en Busto Reform (confirmado por captura 09/06); los otros 3 pisos siguen en PriceLabs.

**Hallazgo clave:** PriceLabs infravaloraba Busto Reform a la mitad. Salto a 161€ = +130% → demasiado brusco de golpe;
plan: subir por escalones y medir.

**💶 COSTES (debe cubrirlos) — decidido 09/06:** la BD `expenses` NO tiene registrados alquiler/limpiezas/impuestos de
este piso (sólo "Suministros" ~26€/mes), así que el break-even se estima con datos de Alberto: **alquiler 300€/mes** + agua/luz
+ limpiezas + impuestos + comisión de portal (~15%). Break-even ≈ **58–98€/noche** según ocupación. **PENDIENTE: cargar los
gastos reales en `expenses` para que el suelo sea exacto.**
- **Suelo de coste DURO fijado:** `pricing_settings.min_price = 90€` en Busto Reform → el motor **nunca** recomienda por
  debajo de cubrir gastos.
- **PRECIO DE TEST = 110€** (techo del piloto `max_price = 110`). A 110€: neto tras comisión ~93€, contribución ~73€/noche →
  con **~5 noches/mes** ya se cubren TODOS los costes; el resto es beneficio. Muy por debajo del mercado (168€) → sigue vendible.
- Nota: el alquiler es coste **hundido** (se paga reserve o no), así que el riesgo de un precio "alto" son noches vacías, no
  vender bajo coste — y el suelo de 90€ garantiza que toda venta es rentable.

**⚠️ SMOOBU: "precio base" ≠ precio que ve el huésped (descubierto 09/06 por captura de Alberto).** En Smoobu se fija un
**precio base** y cada canal le suma su **margen**: Airbnb +15%, Booking.com +16%, Expedia +20%, Agoda +15%, HomeToGo +15%.
Ej.: base 65€ → huésped ve 75 (Airbnb) / 76 (Booking) / 78 (Expedia). El **host neta ~la base** (el margen compensa la comisión
del canal). Implicaciones:
- Nuestros comparables de `market_rates` son **precios de huésped** (con margen). Smoobu `daily_price` (lo que escribe
  `/api/pricing/apply`) es la **base**. **→ El motor debe escribir como base ≈ precio_objetivo_huésped / (1+margen)**, o
  sobrepasaríamos el mercado (escribir 161 de base = ~187 en Booking, por encima de 168). PENDIENTE de ajustar en el endpoint.
- `rate_snapshots.price_pricelabs` = **precio base** de Smoobu (coincide con la captura: 65). Por eso el snapshot sirve para
  verificar lo que se escribe como base.
- **Test de subida (en marcha):** Alberto cambia el **precio base** de una fecha disponible (09 ó 10 jun) 65→**110**. Mañana
  tras las 07:00 se verifica en `rate_snapshots`: si aparece 110 → subida OK de punta a punta. A 110 base el huésped ve ~128 en
  Booking (por debajo de 168 → vendible) y el host neta ~110 (cubre costes de sobra).

**🚨 TODA LA CARTERA INFRAVALORADA (base actual Smoobu 09/06, mismo margen de canal en los 4):**

| Piso | base actual | min noches | huésped Booking (×1,16) | mercado (huésped) | infravalorado |
| --- | --- | --- | --- | --- | --- |
| Busto Reform | 65€ | 1 | ~75€ | 168€ | **−55%** |
| Duplex Center | 95€ | 2 | ~110€ | 180€ | **−39%** |
| Luxury Busto | 92€ | 1 | ~107€ | 228€ | **−53%** |
| House Sevillana | 450€ | 2 | ~522€ | 650€ | **−20%** |

PriceLabs infravaloraba **los 4**, no sólo Busto. Oportunidad de revenue grande en toda la cartera. Plan: validar Busto primero;
si funciona, extender con el ajuste de margen (base ≈ objetivo_huésped/(1+margen)). Recordar el **min-stay** (Duplex/House = 2).

## 8. APLICACIÓN POR SISTEMA (10/06/2026) — el sistema escribe el 110, no Alberto

Alberto pidió que la subida la hiciera el sistema (propuesta de valor del producto). Al preparar `/api/pricing/apply`
se cazaron y arreglaron **4 bugs** (commits `2fa527b`, `0c50129`, `2fc0df3`):
1. El SQL ignoraba `min_price`/`max_price` → habría escrito 150–161 en vez de 110.
2. Sin conversión huésped→base (margen del canal) → habría inflado ~16% lo que ve el huésped.
3. Orden de topes: el suelo de mercado machacaba `max_change_pct`. Nuevo orden: mercado(base) → max_change →
   **min/max del propietario (autoridad final)**. Nueva columna `pricing_settings.channel_markup` (def. 1.16);
   `max_change_pct=1.0` en Busto SÓLO durante el piloto (salto 65→110 aprobado).
4. El SQL referenciaba `occ` sin JOIN (habría petado en runtime) + **middleware**: las rutas de pricing no estaban
   excluidas del matcher → TODO `/api/pricing/*` redirigía a /login, incluidos los crons `detect-opportunities` y
   `experiments/check-results` de vercel.json (llevaban sin ejecutarse de verdad). Excluidos los 4 + `mercado/ingest`.

Matemática verificada contra BD: huésped 164 → base 141 → mercado base [129,162] → ±100% de 65 → 130 → [90,110] = **110** ✓.

**✅ EJECUTADO Y VERIFICADO (10/06/2026 06:36 UTC):** el sistema escribió en Smoobu vía el preview:
- **10/06: 65€ → 110€** · **23/06: 102€ → 110€** (las 2 únicas fechas disponibles en 15 días; el resto reservadas, intactas).
- Verificación triple: re-dry-run = "0 cambios" (Smoobu devuelve 110) · snapshot fresco `rate_snapshots` 10/06 = **110** ·
  auditoría completa en `pricing_applied` (filas dry-run + reales).
- **Primer precio puesto 100% por el sistema.** El test del piloto está EN VIVO a 110€ base (~128€ huésped en Booking).

**⚠️ ANTES DE MERGEAR A PRODUCCIÓN:** `CRON_SECRET` NO parece estar definido (el endpoint respondió sin auth). En preview
lo protege la Deployment Protection de Vercel, pero en producción (`sybra.vercel.app`, pública) el middleware ya no bloquea
`/api/pricing/apply` → **definir `CRON_SECRET` en Vercel sivra ANTES de mergear el PR #108**, o cualquiera podría dispararlo.
**Vigilar también:** si mañana el 10/23 vuelven a 65/102, PriceLabs sigue interfiriendo (el 23 estaba a 102, señal de que
algo lo tocó) → quitar el listing de PriceLabs del todo.

**Acción de Alberto:** (1) **Desconectar/pausar PriceLabs en Busto Reform** — si no, sobrescribe nuestro precio en su
próximo sync y el test no se lee limpio. (2) Aplicar el precio del test (recomendado 161€; decisión suya con su contexto,
el motor *baja* respecto a la fórmula antigua porque las reseñas son bajas), **manualmente en Smoobu** o vía el endpoint
de abajo.

**`POST /api/pricing/apply` — push a Smoobu (recomendar → aplicar).** Escribe el precio recomendado en Smoobu vía su API
(corre en Vercel, que sí alcanza Smoobu; el entorno dev NO). 🔒 Protecciones: `dryRun=true` por defecto (calcula y audita
sin escribir; escribe sólo con `?dryRun=false`), sólo pisos con `apply_enabled=true`, precio acotado a [suelo, techo] del
mercado y a `max_change_pct` (def. 20%) por aplicación, auditoría en `pricing_applied`, protegido por `CRON_SECRET`.
⚠️ **Verificar el formato del POST a Smoobu en un preview** (con una fecha de prueba) ANTES de poner `dryRun=false` en prod.
Para el piloto: poner `apply_enabled=true` SÓLO en Busto Reform.

**Cómo analizar el 16/06:** comparar ocupación/ingresos y reservas nuevas de Busto Reform vs esta baseline. Consulta base:
`SELECT (1-AVG(available)) FROM rate_snapshots WHERE property_id='prop_busto_reform' AND rate_date>=CURRENT_DATE AND snapshot_date=(SELECT MAX(snapshot_date) FROM rate_snapshots)`
y revisar `pricing_experiments`/`incomes`. Si funciona → extender a los otros 3 pisos + construir push a Smoobu.

---

## Panel del propietario — `/pricing-auto` (UI de configuración manual)

Pantalla en la intranet (detrás del login admin) donde Alberto ve **sus 4 pisos** y configura
**a mano** todos los parámetros de `pricing_settings`. Cada tarjeta de piso muestra:
- **Contexto de mercado real**: p25/p50/p90 de comparables, nota media del mercado, factores ×calidad y ×demanda aplicados.
- **Ocupación** propia (señal de demanda) y **precio base actual** en Smoobu.
- **Recomendado**: precio base (lo que escribiría en Smoobu) y precio huésped (con margen de canal).

Inputs editables: `target_pctl`, `floor_pctl`, `ceil_pctl`, `position_factor`, `quality_k`, `demand_k`,
`demand_baseline`, `own_score`, `channel_markup`, `max_change_pct`, `min_price`, `max_price` + switches
`enabled` (servicio contratado) y `apply_enabled` (permiso de escritura a Smoobu).

Botones: **Guardar** (PATCH `/api/pricing/settings`), **Simular** (`/api/pricing/apply?dryRun=true`, calcula y audita
sin escribir) y **Aplicar ahora** (`dryRun=false`, sólo habilitado si `apply_enabled`).

**Endpoints nuevos:**
- `GET /api/pricing/settings` — estado completo por piso (parámetros + mercado + ocupación + base actual + recomendado),
  misma cadena de cálculo que `apply`.
- `PATCH /api/pricing/settings` — valida por columna (rangos) y hace upsert; coherencia `min_price ≤ max_price`.

**Seguridad:** `/api/pricing/apply` ahora acepta **sesión de admin** (NextAuth, vía `auth()`) además de `CRON_SECRET`,
para que los botones del panel funcionen desde el navegador. El endpoint sigue requiriendo una de las dos cosas:
sin `CRON_SECRET` válido **y** sin sesión → 401 (antes, sin `CRON_SECRET` definido quedaba abierto; ahora ya no).

---

## Producto completo: automatización, salvaguardas, panel y avisos (sesión 10/06)

El módulo pasa de "recomendar + aplicar a mano" a **automático con red de seguridad**, y de pilotaje a
**producto vendible**. Todo en el PR #108.

### Pipeline diario (crons en `vercel.json`, hora Sevilla = UTC+1/2)
1. `07:00` `rates/snapshot` — captura precios/disponibilidad de Smoobu.
2. `07:15` `mercado/cron` — comparables (scraping IA; respaldo).
3. `07:30` `pricing/guard` — **detector de reversión** (PriceLabs pisó nuestro precio) + suelo de coste → alertas + email/push.
4. `08:00` `experiments/check-results`, `08:05` `detect-opportunities`.
5. `08:30` `pricing/apply-auto` — **aplica el precio** (dryRun=false) a los pisos con `apply_enabled`,
   respetando **pausa global**, **guardia de confianza** y los topes del propietario.
6. `09:00` `pricing/resumen-diario` — email + push con cambios aplicados y alertas abiertas.

### Salvaguardas ("no puede fallar")
- **Pausa global** (`pricing_config.paused`): botón de pánico en el panel; el cron y «Aplicar» la respetan (degradan a simulación).
- **Guardia de confianza** en `apply`: no escribe un piso con <5 comparables o mercado >7 días (`skipped: datos_insuficientes`).
- **Detector de reversión** (`guard`): compara `pricing_applied` (último real) vs `rate_snapshots.price_pricelabs`; si difieren → alerta `precio_revertido` + aviso.
- **Restaurar** (`/api/pricing/restore`): reescribe en Smoobu el `old_price` auditado (deshacer).
- **Topes del propietario** (`min_price`/`max_price`) siguen siendo autoridad final.

### Motor: eventos y huecos
- `lib/pricing-calendar.ts` (compartido con snapshot): `eventFactor(date)` añade premium en Semana Santa/Feria
  (acotado a +50%, sólo fechas con evento), flag `events_enabled` por piso.
- `gap_discount_pct` por piso: descuenta noches sueltas libres entre dos reservas.

### Horizonte de pricing (365 días)
- `PRICING_HORIZON_DAYS = 365` (`lib/pricing-calendar.ts`) — fuente única del horizonte. Lo usan
  `rates/snapshot` (captura) y `apply`/`apply-auto` (tarificación). Antes: snapshot 90d y apply solo 14-60d
  → las fechas lejanas (reservas de larga antelación, sobre todo extranjeros, y eventos de la próxima
  temporada) ni se tarificaban. **El agente sigue juzgando la ventana cercana (90d)**: ampliar el horizonte
  no diluye su veredicto de demanda.
- **Eventos cargados a mano** en `EVENTS`. Añadido 2027 (Semana Santa/Feria, **estimado — confirmar fechas
  oficiales**). `EVENTS_LAST_DATE` + watchdog en `pilot-track`: si el último evento queda a <90d, avisa por
  email/push para que el calendario **no caduque en silencio** cada año.
- **A 365d el mercado real (comps) es escaso**: esas fechas se tarifican sobre todo con estacionalidad +
  eventos y se **afinan solas a diario** según entran comps más cerca de la fecha. Suelo `min_price` y pasos
  graduales acotan el riesgo. (Pendiente, PR aparte: que el scraper de mercado traiga comps de check-in lejanos.)
- **Alcance: solo Busto Reform escribe** (`apply_enabled=true`); el `WHERE s.apply_enabled = true` del `apply`
  garantiza que los pisos en PriceLabs no se tocan. El snapshot sí captura los 4 (lectura) para comparar.

### Panel del propietario `/pricing-auto`
Medidor de **€ extra vs PriceLabs** (`/api/pricing/resultados`), botón de **pánico** (pausa), botón de
**avisos push**, toggle de eventos, descuento de hueco, **Restaurar** e **Histórico** por piso (`/api/pricing/historial`).

### Notificaciones (email + push)
- `lib/pricing-notify.ts` → email (`@iarest/core-email`, Gmail) + push (`lib/push.ts` → `@iarest/core-push`).
- Suscripción push: `/api/propietario/push-subscribe` (tabla **dedicada** `pricing_push_subs`, aislada de la
  `push_subscriptions` compartida con ia-rest/ialimp). El SW `public/sw.js` ya maneja `push`.

### Seguridad
- `lib/cron-auth.ts`: todos los crons de pricing/mercado exigen `CRON_SECRET` (o sesión admin). Transición:
  si `CRON_SECRET` no está definido, permiten (con aviso) — **definirlo en producción cierra el acceso**.

### Fuente de mercado automática (Estrategia 2 — gated)
`/api/mercado/ingest-auto`: llama a una API real (RapidAPI…) y upserta en `market_rates`. Inactivo hasta
definir `MARKET_API_URL`/`MARKET_API_KEY`; adaptar `mapToComps` al proveedor. Respaldo: ingesta manual.

### ⚙️ Variables de entorno que debe definir Alberto en Vercel (proyecto sivra)
- **`CRON_SECRET`** (obligatoria antes de mergear a producción) — protege los endpoints de escritura.
- **`NEXT_PUBLIC_VAPID_PUBLIC_KEY`** + **`VAPID_PRIVATE_KEY`** — para los avisos push (generar par con `web-push`).
- (Opcional, Estrategia 2) `MARKET_API_URL`, `MARKET_API_KEY`, `MARKET_API_HOST`.
- Ya existentes: `SMOOBU_API_KEY`, `GMAIL_USER`/`GMAIL_APP_PASSWORD`, `NEXTAUTH_URL`, `ADMIN_EMAIL`/`ADMIN_PASSWORD`.

### Migraciones aplicadas (Supabase `wswbehlcuxqxyinousql`)
- `pricing_settings`: +`events_enabled`, +`gap_discount_pct`.
- `pricing_config` (singleton `paused`).
- `pricing_push_subs` (suscripciones push del propietario).

### Pendiente
- Alberto: definir envs + mergear PR #108. Vigilar que PriceLabs no revierta (lo detecta `guard`).
- Fase futura: onboarding SaaS multi-propietario (alta self-service de listings/costes/reseñas).

## Fuente única del precio recomendado — `lib/pricing-engine.ts`
El cálculo del "precio para sustituir a PriceLabs" (percentil de mercado × posición × calidad × demanda,
acotado a floor/ceil) vive en **`lib/pricing-engine.ts`** (`computeRecommendation`). Lo consumen los
**tres**: `recommend` (estudio), `settings` (panel) y `pilot-track` (propuesta del agente) → todos dan el
**mismo número**. El agente solo propone con **guardia de confianza** (≥5 comparables y mercado ≤7d).
- `recommendedBaseFromEngine` aplica la cadena de topes del propietario en **base** (huésped→base por
  `channel_markup`, floor/ceil, `max_change_pct` vs base actual, `min_price`/`max_price`).
- **⚠️ A decidir aparte (no arreglado):** `recommend` aplica `min_price`/`max_price` (que son € de **base**)
  sobre el precio a nivel **huésped** — posible inconsistencia de unidades. `settings`/agente sí lo aplican
  en base. Mantener vigilado; arreglar en PR propio si se confirma que descuadra.
- **Pendiente (fuera de alcance de este cambio):** alinear también `apply` al mismo motor (hoy replica la
  fórmula con su cadena de topes para el push en vivo).

## 9. 🚨 Bug de techo en fechas de evento + PAUSA GLOBAL (14/06/2026)

**Contexto:** entró la **1ª reserva real** de Busto Reform (25-28 mar 2027 = Semana Santa). Se vendió al
**base previo de Smoobu** (~307-319€/noche), **NO** a un precio de nuestro motor (`pricing_applied` vacío para
esas fechas: `apply` nunca las había escrito porque antes daba 504 a 365d). Al verificarla se destapó el bug.

**El bug:** con el fix #213 (`apply` ya completa las **365 noches**), el cron `apply-auto` (08:30, `dryRun=false`,
`days=365`) **habría capado a `max_price=125€` todas las fechas de evento disponibles.** Causas encadenadas:
1. **Guardia de confianza por PISO, no por fecha** (`apply/route.ts`): mira `sample_n`/`market_age_days` del piso
   entero (Busto: 14 comps, 5d → pasa) → tarifica las 365 noches, sin distinguir fechas con/sin comps propios.
2. **Percentil de mercado único para todo el año:** el CTE `mkt` saca `med/flo/cei` de *todos* los comps al último
   `search_date`, **sin filtrar por `checkin_date`** → un único ~168€ huésped (de fechas normales) aplicado a
   Semana Santa/Feria. El `eventFactor` sube sobre esa base baja, pero…
3. **`max_price` es la autoridad FINAL de la cadena** (línea ~200): tras mercado → evento → `max_change_pct` →
   `min_price` → **`max_price`**. Una noche a 307€ → ~246 (−20%) → **125** (techo). Como 125≠307, **la escribe**.

**Impacto medido (snapshot 14/06):** **172 fechas disponibles >125€** (Semana Santa 20-27 mar y **Feria de Abril
2027** hasta 366€/noche) → ~**9.788€ de base** en riesgo (>11k€ a precio huésped). La reserva ya entrada se salva
sólo porque al estar reservada deja de ser `available` (línea 179) y el bucle la salta; el resto del evento, no.

**Acción inmediata (HECHA 14/06):** `pricing_config.paused = true` (botón de pánico). `apply` lo lee
(`SELECT paused FROM pricing_config WHERE id=1`) y fuerza `dryRun=true` → **no escribe en Smoobu**. Verificado.
**Contrapartida:** congela también el pricing al alza de fechas normales hasta reactivar.

**Fix de producto PENDIENTE (PR aparte; reactivar la pausa SÓLO tras esto):**
- **Techo event-aware:** `max_price` efectivo = `max_price × eventFactor(date)`, o regla "**nunca bajar una fecha de
  evento por debajo de su base actual**" (no destruir precio que el mercado ya valida).
- **Comps por fecha/temporada:** percentil de mercado segmentado por ventana de `checkin_date`, no uno global.
- **Guardia de confianza por FECHA:** no escribir una fecha concreta sin comps propios de su temporada
  (hoy la guardia es por piso → deja pasar 2027 con datos de 2026).

## 10. 🎟️ Fase 2-A: auto-eventos vía Ticketmaster (15/06/2026)

Para que **eventos sorpresa** (final de Copa del Rey, conciertos de estadio) suban el precio **solos**
—sin tocar el calendario a mano— sivra replica el patrón de la Edge Function `eventos-entorno` de ia-rest:

- **Cron** `/api/eventos/sync` (semanal, lun 04:00): consulta **Ticketmaster** para Sevilla
  (`postalCode=41001`, radio 25km → capta Pizjuán/La Cartuja), próximos 365 días. Cada evento → `aforo`
  → factor de impacto (1.08–1.60). Upsert en **`pricing_eventos_auto`** (fecha, nombre, aforo, factor).
- **Motor** (`apply`): carga los eventos auto del horizonte y combina con el calendario manual:
  `factor(fecha) = max(eventFactor(fecha), evento_auto[fecha])`. Tabla vacía ⇒ comportamiento idéntico.
- **Gateado** por `TICKETMASTER_API_KEY` (env de Vercel de sivra; se reutiliza la de ia-rest). Sin la key,
  el cron es no-op → desplegable y seguro; se activa al poner la variable.
- **Cobertura:** TM = conciertos/deportes. LaLiga/ferias/congresos/festivos que TM no lista los
  descubre el cron hermano **`/eventos/websearch`** (Fase 2-B, `fuente='websearch'`, mismo upsert
  y MAX en el motor). Desde el **13/07/2026** la búsqueda va por `lib/websearch.ts::buscarWeb` de
  plataforma: **Gemini grounding (gratis) → plugin `web` de OpenRouter (de pago, ~0,02€/pasada)**
  — las rachas de 429 de Gemini tenían este cron mudo desde junio; ahora degrada en vez de callar.
  Ambos intentos quedan en `ai_usos` (endpoint `eventos`).
- **Fase 2-B (pendiente):** mercado por `checkin_date` (scraper barriendo fechas futuras + percentil por
  temporada con fallback al global) — para que también los precios NORMALES dejen de ser planos.

## 11. 📉 Plan de baja de PriceLabs — criterio y estado (13/07/2026)

**Objetivo:** cancelar la suscripción de PriceLabs cuando haya evidencia de que el motor
reserva a nuestros precios sin necesitar PL. PL ya NO escribe precios en Busto (desconectado
09/06) y su benchmark se demostró malo (infravaloraba Busto a 70€ con mercado a 168€).

### Criterio de decisión (replanteado 13/07, OK de Alberto)
El criterio original "experimentos reservados a precio ≥ PL" penalizaba al motor cuando
decidía con razón ir por debajo de PL. Criterio vigente, en orden de peso:
1. **ADR realizado y ritmo de ocupación** del piso vs. el histórico y vs. lo que PL
   recomendaba para las mismas fechas (`pricing_experiments.revenue_realized` vs
   `price_pricelabs`).
2. Experimentos reservados a nuestro precio (el listado se sostiene: `revenue_realized`
   coherente con `price_set` una vez descontado el stack de canal).
3. El "≥ PL" queda como métrica informativa, no como gate.

### Marca anticipada de resultados (13/07/2026)
`update_experiment_results()` ahora marca `was_booked=true` en cuanto un income cubre la
noche futura del experimento, sin esperar a que pase la fecha (SQL:
`2026-07-13_early_mark_experiments.sql`). Cancelaciones: al llegar el día, el bloque de
fechas pasadas re-alinea con la señal definitiva de `rate_snapshots`. Primera pasada:
Busto pasó de 0 a **14 experimentos reservados** contados.

### ⚠️ Hallazgo: stack de descuentos de Booking (~45% en estancias largas)
Reserva 21-28 oct (7 noches): listado 118€/noche → vendido 64,77€ bruto / 52€ neto.
Genius + descuento semanal + tarifa móvil se apilan. El raíl `min_price` protege el
LISTADO, no el precio post-descuento. **Acción de Alberto:** revisar promos activas en la
extranet de Booking. Lección persistida en `pricing_aprendizaje` (temporada
`canal_booking`). Nota para la comparativa PL: es neutro (PL sufría el mismo stack), pero
importa para el margen real.

### Luxury Busto EN VIVO (13/07/2026, OK explícito de Alberto)
`apply_enabled=true` + `pilot_enabled=true` + `seasonal_floor_k=1` (mismos raíles que
Busto: suelo 95€, ±20%/día, markup canal 1,16). Contexto: ADR real 149€ > PL 119€.
**Vigilar:** PriceLabs puede seguir conectado a Luxury en Smoobu — si `pricing/guard`
detecta reversiones, desconectar PL de Luxury en su panel.

### Calendario
Con la marca anticipada + Luxury en vivo, base defendible para cancelar PL hacia
**principios de agosto 2026** (2-3 semanas más de reservas a precio del motor). Sin la
marca anticipada habría sido octubre.

## 12. 🕳️ LANDMINE — planes "Tarifa semanal/mensual" de Booking (13/07/2026, caso Teresa Delgado)

**El desvío de precio en estancias largas NO era el stack de promociones.** Al editar los planes en la
extranet se verificó la derivación REAL configurada — más agresiva de lo que sugería el desglose de
la reserva:

| Plan | Derivación previa | Nueva (13/07) |
|---|---|---|
| Semanal (los 4 pisos) | **−30%** | −5% (House −10%) |
| Mensual (Busto, Luxury, House) | **−40%** | −5% (House −10%) |
| Mensual (Dúplex) | **−30%** | −5% |

```
Stack previo ≥7 noches: 0,70 (semanal −30%) × 0,90 (móvil) × 0,89 (Genius dinámico) ≈ 0,56 → hasta −44%
Stack nuevo  ≥7 noches: 0,95 × 0,90 × 0,89 ≈ 0,76   (House: 0,90 × 0,90 × 0,85 ≈ 0,69)
```

- Los **planes de tarifa** (Tarifas → planes) NO aparecen en la pantalla de Promociones — el
  inventario de promos dio "sano" (~19% máx) y aun así la reserva salió a −35%. Al auditar el canal,
  revisar SIEMPRE las dos pantallas.
- ⚠️ El desglose de la reserva de Teresa (base 95,9€ vs listado 118€, ~−19% aparente) **subestimaba**
  la derivación: la configurada era −30%. El desglose compara con el precio estándar del momento, no
  con la derivación del plan — no fiarse del desglose para diagnosticar planes; abrir el plan.
- Estancias <7 noches no pasan por el plan semanal → siempre cuadraron a ~10-19%.
- Genius figura como **"Precios dinámicos" (11%)** — el % puede moverse solo; vigilarlo.
- Comisión real 92,05€ vs 84,71€ estimada en Smoobu (pequeña divergencia conocida).

**EJECUTADO (13/07/2026, Alberto vía Claude Chrome; Booking confirmó los 8 planes activados):**
semanal y mensual → **−5% en Busto/Luxury/Dúplex** (Dúplex 86% ocupación, no necesita regalar) y
**−10% en House** (29% ocupación, unidad grande). Sin tocar: Estándar, Flexible (+10%), No
reembolsable (−10%; Luxury −15%), Genius, móvil, min-stay, políticas ni calendario. Solo afecta a
reservas NUEVAS.

**Medir (seguimiento 27/07):** ratio bruto/listado de reservas ≥7 noches — antes 0,65; objetivo
≥0,76 en los tres primeros (esperado teórico ≈0,76; House ≈0,69). Vigilar que el volumen de reservas
largas no caiga en House. La lección vive en `pricing_aprendizaje` (busto, temporada `canal_booking`).

## 13. 🕳️ LANDMINE — el fallback global HUNDE las noches de evento sin comps del mes (15/07/2026, caso Karol G)

**Qué pasó:** la reserva de Andrea Salvatierra (Airbnb, Luxury, 11-13 jun 2027 = **finde Karol G ×3
en La Cartuja**, factor 2,5) entró a ~343€/noche bruto cuando el mercado real de ese finde estaba en
**p50 ≈ 930€/noche** (Booking, 4 pax, centro). Junio 2027 no tenía comps → el bucket **global**
(dominado por temporada media/baja) fijó una base hundida (`base_target` ≈112) y el motor bajó la
noche de evento **788→283 en 5 pasadas** (13-15/07). El factor 2,5 no salvó nada: multiplica la base
hundida (112×2,5 ≈ 280). Misma familia que la lección de Busto abril'27, ahora con evento encima.

**Regla implementada (apply de plataforma, aprobada por Alberto 15/07):** con **evento factor ≥2 y
SIN mercado del mes** (fallback global), el precio **NUNCA baja** — se congela el precio actual hasta
tener comps del mes (subir sí se permite; el techo `max_price` del propietario sigue mandando).

**Además:** el tope ±20% del raíl es **por pasada, no por día natural** — con 3 pasadas/día del cron
(08:30/14:30/20:30) el freno real es ~−49%/día. Pendiente decidir si se dedupea por fecha natural.

**Corrección de datos (15/07):** 10 comps 4pax (escenario luxury) + 10 comps 2pax (escenario busto)
del finde 11-13 jun 2027 ingestados vía `/api/sivra/mercado/ingest`. Lección en `pricing_aprendizaje`
id 35. Recordatorio operativo: reponer comps de may-jul 2027 en próximos ciclos del agente.

## 14. Prior estacional auto-aprendido + tripwire PriceLabs (17/07/2026, OK de Alberto)

**Problema de fondo (pregunta de Alberto: "¿el agente no lo sabe con las variables que tenemos?"):**
no lo sabía — el motor tarifica solo con comps actuales de `market_rates`; el histórico (`incomes`
desde 2020, ADR y ocupación por mes) no entraba en la pasada diaria. Así se coló octubre a 161€.

**Fix 1 — prior estacional (apply de plataforma):** índice por piso y mes calculado en la propia
pasada desde `incomes` (6 años): `idx = (ADR_mes/ADR_medio) × clamp(noches_mes/noches_media, 0,85-1,25)`,
clamp final 0,7-1,6, mínimo 30 noches de muestra. Octubre destaca en NOCHES más que en ADR
(históricamente también se vendió barato) — por eso el ADR solo no bastaba. Uso como **SUELO**:
sin bucket del mes sustituye al global plano (`base × idx`); con bucket, red de seguridad
(`base × idx × 0,9`) solo si `idx ≥ 1,15`. Nunca techo; los raíles (±%/pasada, min/max) siguen.

**Fix 2 — tripwire PriceLabs:** mientras PL siga conectado (hasta ~ago-2026), cada pasada EN VIVO
compara lo escrito con el último `rate_snapshots.price_pricelabs` (≤14 días): si escribe <70% de PL,
aviso Telegram agregado (las tres minas — jun-27, Feria-27, oct-26 — empezaron deshaciendo precios
altos de PL). Al desconectar PL el tripwire calla solo (sin datos frescos).

**Fix 3 — velocidad de conversión por mes (mismo día, OK de Alberto):** si un mes futuro acumula
**≥2 reservas entradas en los últimos 7 días** (`incomes.createdAt`), su objetivo sube +10%
(+20% desde 4 reservas), sin pasar del techo de mercado del mes (`ceilD`). Se recalcula desde el
mercado en cada pasada (no compone) y la ventana de 7 días vacía el boost sola cuando la demanda
para. Es la señal que habría cazado octubre-26 sin intervención de Alberto: 2 reservas en 4 días
a precio corto. Visible en la respuesta del apply como `meses_calientes`.
