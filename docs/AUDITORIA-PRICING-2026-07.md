# Auditoría del pricing dinámico SIVRA — 18/07/2026

> Disparada por Alberto: «está fallando mucho». Auditoría end-to-end contra el código del monorepo
> y la BD de producción (`wswbehlcuxqxyinousql`): motor `apply`, crons, datos de mercado, raíles,
> alertas y — sobre todo — **resultados reales** (reservas que entraron y a qué precio).
> Los 3 arreglos 🔴 de mecánica van en el PR de esta auditoría; el resto es checklist.

## Resumen ejecutivo

El motor **no falla por datos** (mercado fresco de 1 día, snapshot diario, eventos cargados, PL
persistido): falla por **mecánica de control**. Tres defectos se combinan en el síntoma que ve
Alberto (precios absurdos y reservas regaladas):

1. El tope «±20%/**día**» era en realidad **±20% por PASADA** — con 3 crons diarios, ±73%/día.
2. El **objetivo del motor fluctúa a diario** (mercado del mes, ocupación, velocity) y no había
   **banda muerta**: 3.448 escrituras en 7 días para 2 pisos; el **78% de las fechas de Busto
   subieron Y bajaron la misma semana**. El precio es una sierra y los huéspedes (y los bots de
   precio de las OTAs) **compran los valles**.
3. El premio de evento de #985 (ayer) introducía **doble conteo** (multiplicaba ×2,5 una mediana
   que ya era precio-de-evento) → Karol G rampando hacia ~2.000€/noche (sobreprecio que mata la
   conversión igual que el infraprecio regala margen).

**Coste real medible (reservas de julio):**

| Reserva | Fecha estancia | Vendida a | Mercado/PL real | Contexto |
|---|---|---|---|---|
| Airbnb 15/07 | **11-13 jun 2027 (Karol G)** | **344€/noche** | p50 931€ (524-1333€) | Vendida el día del **valle** de la V (326→112→701) |
| Booking 14/07 | **9-11 oct 2026 (Puente Pilar)** | **126€/noche** | PL 473€ | Vendida durante el desplome <70%×PL |
| Booking 08/07 | 21-28 oct 2026 (7 noches) | **65€/noche bruto** | suelo listado 90€ | Descuento semanal de canal perfora el suelo |
| Booking 14/07 | 25-27 sep 2026 | 105€/noche | p50 ~164€ | Débil |

Solo las dos primeras suman **>1.800€ de margen regalado**. La memoria (`pricing_aprendizaje`)
**ya tenía anotadas estas lecciones** — el agente aprende, pero la mecánica del motor las seguía
produciendo. Esta auditoría arregla la mecánica.

## Hallazgos

### 🔴 R1 — Raíl «±/día» era por pasada (±73%/día real) — **ARREGLADO en este PR**
`apps/plataforma/app/api/sivra/pricing/apply/route.ts` (clamp del raíl). El ancla era el precio de
la pasada anterior; el cron `apply-auto` corre `30 8,14,20 * * *` → 1,2³ ≈ ±73%/día. Serie real de
`pricing_applied` (2027-06-09/10, Luxury): 326→261→209→167→134→112 (13-14/07) y 112→…→701
(15-18/07). **Fix:** el ancla del raíl es ahora el último precio aplicado **antes de hoy** (`ref24`,
`DISTINCT ON` sobre `pricing_applied`); las pasadas 2ª/3ª del día se mueven dentro del mismo rango
diario. Los saltos legítimos al alza (evento de calendario, suelo PL, suelo estacional) siguen
saltando el raíl como antes.

### 🔴 R2 — Doble conteo del premio de evento (bug de #985, 17h de vida) — **ARREGLADO en este PR**
Mismo archivo, bloque de evento. `eventBase×ev` con `eventBase` = mediana del mes o de la fecha
exacta, que en fechas barridas para el evento **ya es precio-de-evento** (jun-27: p50 931€ ×2,5 ≈
2.000€ huésped). **Fix:** el factor solo multiplica la base **global** (que no contiene el evento);
la mediana de la fecha exacta compite por MAX **tal cual** (sin ×ev). Es el comportamiento pre-#985
+ la resolución por fecha bien hecha.

### 🔴 R3 — Sin banda muerta: 3.448 escrituras/7d, 78% de fechas en ping-pong — **ARREGLADO en este PR**
Medido en `pricing_applied` (7 días): Busto 1.315 escrituras / 315 fechas (4,2 por fecha, 247 con
subidas y bajadas); Luxury 2.133 / 342 (6,2 por fecha, cambio medio **24,7%**). **Fix:** cambios
<3% no se escriben (salvo que el precio actual viole `min_price`). Menos churn en Smoobu/OTAs, y
las fechas estables quedan en silencio.

### 🟡 R4 — El suelo `min_price` protege el LISTADO, no el precio EFECTIVO
Reserva real: 7 noches de octubre a **65€/noche brutos** con suelo 90€ — los planes de canal
(semanal −5%, móvil ~10%, Genius ~11%; ratio ≥7 noches ≈0,76 tras el fix del 13/07) perforan el
suelo. El ADR bruto realizado de Busto en el mes de motor vivo es **70€** con suelo 90€.
**Acción (decisión de Alberto):** subir `min_price` de Busto a ~115-120 (para que el efectivo no
baje de ~90) **o** aceptar el efectivo actual. El motor no puede ver los descuentos de canal.

### 🟡 R5 — Motor DUPLICADO y desactualizado en `apps/sivra` (riesgo de escritura con lógica vieja)
`apps/sivra/app/api/pricing/apply/route.ts` + `apply-auto` son la copia de **junio**: sin prior
estacional, sin velocity, sin suelo PL, sin salto de evento, sin ninguna guarda posterior
(0 coincidencias en grep). Sin cron (el `vercel.json` de sivra solo tiene `seo-refresh`), pero
**siguen invocables** desde el panel legacy `/pricing-auto` de housesevillana o con `CRON_SECRET`.
Un clic ahí escribe en Smoobu con el motor viejo. **Acción:** PR aparte que convierta esas 2 rutas
en `410 Gone` (o proxy a plataforma). `aplicar-propuesta` (raíles del agente, Paso 4) **se queda**
en sivra — sus 5 raíles + circuit-breaker están completos y al día.

### 🟡 R6 — Vísperas de evento sin cobertura (la causa de que la V empezara)
Las noches 9-10 jun 2027 (vísperas de Karol G) no tienen factor en `EVENTS` ni en
`pricing_eventos_auto` → el motor las trató como junio normal y las hundió. La guarda de outlier
(#985) las protege ahora si están >30 días, y el raíl diario limita el daño, pero el calendario
sigue sin «shoulder nights». **Acción sugerida (PR pequeño):** factor víspera = `1+(ev−1)×0,5`
para eventos ≥2× (Karol G 2,5 → víspera 1,75). Pedir OK antes (cambia comportamiento al alza).

### 🟡 R7 — 32 alertas de `pricing_alerts` sin resolver desde el 14/05
`suelo_coste` Busto ×17, `precio_bajo` 49% Busto, etc. Nadie las marca `resuelta` → el panel
acumula ruido y lo nuevo no destaca. **Acción:** revisarlas en `/pricing-auto` (plataforma) y
resolver en lote las pre-13/07 (anteriores a los fixes); valorar auto-resolver `suelo_coste`
cuando la condición desaparece (hoy solo dedup 24h).

### 🟡 R8 — El bucket del MES se contamina con los comps del evento
El bucket jun-2027 (n=10, p50 931€) está dominado por comps barridos PARA Karol G → todas las
noches de junio heredan objetivo alto. Como la estrategia lejos-de-fecha es agresiva, no urge;
al acercarse la temporada conviene **excluir del bucket mensual las fechas con factor ≥1,5** (que
ya tienen su propio camino por fecha exacta). Mejora futura del motor.

### 🟢 Lo que SÍ está bien
- **Datos frescos**: `market_rates` 1 día; `rate_snapshots` hoy; PL aún conectado (1.464 fechas
  hoy) y su curva **congelada** en `pricing_pl_referencia` (366 filas/piso, #985).
- **Crons**: los 10 de pricing viven SOLO en plataforma (sin dobles).
- **Raíles del agente** (`aplicar-propuesta`, sivra): pausa, gate, suelo, tope, techo,
  circuit-breaker — completos.
- **Pausa global** operativa (`pricing_config.paused=false`), `apply_enabled` solo en Busto+Luxury
  (Duplex/House en dry-run según plan).
- **Memoria de aprendizaje** rica y al día (29 insights, incluye las infraventas como lección).
- **Guard diario** (reversiones + suelo) corriendo a las 7:30.

## Checklist de acciones — ESTADO (ejecutado con delegación de Alberto, 18/07/2026 tarde)

1. ✅ **R1+R2+R3 mergeados** (#987) y desplegados.
2. ✅ **R4 aplicado**: `min_price` de Busto **90→115** (UPDATE en `pricing_settings` + lección en
   `pricing_aprendizaje/min_price_canal`). Efectivo peor-caso pasa de ~65-68€ a ~87-95€ ≈ coste.
   Luxury se queda en 95 (calibrado el 13/07 con OK explícito; sin evidencia de perforación).
   *Reversible con 1 UPDATE; si se quitan los planes de canal, volver a ~95.*
3. ✅ **R5 aplicado**: motor viejo de sivra retirado — `apps/sivra/app/api/pricing/apply` y
   `apply-auto` devuelven **410 Gone** con puntero al motor de plataforma. `aplicar-propuesta`
   (raíles del agente) sigue vivo en sivra. *Reversible con git revert.*
4. ✅ **R6 aplicado**: factor de vísperas/resacas — la noche pegada a un evento **≥2×** hereda la
   mitad del premio (Karol G 2,5 → víspera 1,75). Solo ±1 día y solo eventos fuertes.
5. ✅ **R7 aplicado**: 29 alertas pre-fixes resueltas en lote; quedan las 3 de hoy para contrastar
   con el comportamiento post-deploy.
6. ⏳ **R8 pendiente A PROPÓSITO** (bucket mensual contaminado por comps de evento): hoy ya
   entraron 3 cambios de fórmula — apilar un 4º el mismo día es el patrón que causó el bug R2.
   Hacerlo en una sesión posterior con los datos de esta semana como control.

## Métricas para vigilar el efecto (próximos 7 días)
- `pricing_applied` live/7d: esperado **<1.000** escrituras (desde 3.448) y **<10%** de fechas
  con doble dirección (desde 78%).
- Ninguna fecha con |Δ| diario >20% (antes: ±73%).
- Karol G 11-13 jun 2027: estabilizarse en ~690-800€ base (mercado), NO ~2.000€.
- Aviso Telegram del tripwire PL: no debe volver a sonar (salvo techo del propietario).
