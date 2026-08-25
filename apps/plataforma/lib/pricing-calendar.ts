// Calendario de eventos / temporada / día de la semana de Sevilla.
// Extraído de app/api/rates/snapshot para reutilizarlo también en el motor (apply/recommend).
//
// - EVENTS:   multiplicador absoluto para fechas con evento (Semana Santa, Feria, congresos…).
// - SEASONAL: multiplicador por mes (enero=0 … diciembre=11).
// - DOW:      multiplicador por día de la semana (lunes=0 … domingo=6).

export const EVENTS: Record<string, number> = {
  "2026-03-29":2.20,"2026-03-30":2.30,"2026-03-31":2.40,"2026-04-01":2.50,
  "2026-04-02":2.60,"2026-04-03":3.00,"2026-04-04":2.80,"2026-04-05":2.50,
  "2026-04-18":2.75,"2026-04-20":2.50,"2026-04-21":2.80,"2026-04-22":3.00,
  "2026-04-23":3.20,"2026-04-24":3.50,"2026-04-25":3.00,"2026-04-26":2.80,
  "2026-05-04":1.30,"2026-05-05":1.30,"2026-05-06":1.30,"2026-05-07":1.30,
  "2026-05-08":1.30,"2026-05-09":1.30,"2026-05-15":1.20,"2026-05-16":1.40,
  "2026-05-22":1.40,"2026-05-23":1.50,"2026-05-24":1.50,"2026-05-25":1.40,
  "2026-06-06":1.40,"2026-06-12":1.40,"2026-06-13":1.60,"2026-06-14":1.60,
  "2026-06-19":1.60,"2026-06-20":1.60,"2026-06-21":1.30,"2026-06-26":1.40,
  "2026-07-03":1.40,"2026-07-16":1.50,"2026-07-18":1.30,
  // --- Bienal de Flamenco 2026: fechas OFICIALES 9 sep – 3 oct (labienal.com, XXIV edición) ---
  // Añadida 03/08/2026: septiembre estaba a CERO eventos en ambas fuentes pese a ser mes alto, y una
  // reserva del Dúplex (25-28 sep, en plena Bienal) entró a 160€/noche bruto con 53 días de antelación
  // (la mediana del Dúplex es 7). Festival de ~4 semanas: demanda repartida, pico en vie/sáb — factores
  // moderados (1.25 laborables / 1.40 vie-sáb), no de Feria; el premio de mercado por fecha captura los
  // picos reales cuando lleguen comps de esas fechas.
  "2026-09-09":1.25,"2026-09-10":1.25,"2026-09-11":1.40,"2026-09-12":1.40,"2026-09-13":1.30,
  "2026-09-14":1.25,"2026-09-15":1.25,"2026-09-16":1.25,"2026-09-17":1.25,"2026-09-18":1.40,
  "2026-09-19":1.40,"2026-09-20":1.30,"2026-09-21":1.25,"2026-09-22":1.25,"2026-09-23":1.25,
  "2026-09-24":1.25,"2026-09-25":1.40,"2026-09-26":1.40,"2026-09-27":1.30,"2026-09-28":1.25,
  "2026-09-29":1.25,"2026-09-30":1.25,"2026-10-01":1.25,"2026-10-02":1.40,"2026-10-03":1.40,
  "2026-11-16":1.40,"2026-11-17":1.40,"2026-11-18":1.40,"2026-11-19":1.40,
  "2026-11-20":1.40,"2026-11-21":1.35,"2026-11-22":1.30,
  // --- Festivos nacionales / puentes recurrentes (Sevilla) — estimados por demanda observada ---
  // Hispanidad (12-oct) + finde
  "2026-10-09":1.35,"2026-10-10":1.40,"2026-10-11":1.40,"2026-10-12":1.45,
  // Todos los Santos (1-nov)
  "2026-10-30":1.35,"2026-10-31":1.45,"2026-11-01":1.45,
  // Puente de la Constitución (6-dic) + Inmaculada (8-dic) — alta demanda real (eran 200-216€)
  "2026-12-04":1.70,"2026-12-05":1.85,"2026-12-06":1.90,"2026-12-07":1.85,"2026-12-08":1.80,
  // --- Navidad + Fin de Año + Reyes ---
  // 🚨 AMPLIADO Y MEDIDO el 18/08/2026 (reserva de House 21-25/12). El bloque tenía factor SOLO en
  // 24, 25, 26 y 31: del 27 al 30 —que el mercado paga más caro que ninguna otra noche de
  // diciembre salvo Nochevieja— eran «diciembre normal» para el motor, sin premio y, lo que más
  // duele, SIN SUELO de evento: esas noches se quedaban sin nada que las sostuviera en cuanto
  // entraran en los 30 días de la guarda de outlier. (Entonces aún quedaba de red la curva
  // congelada de PriceLabs; se retiró el 25/08/2026, así que el factor de aquí es lo único.)
  //
  // Los factores NO son a ojo: son el cociente contra la mediana de diciembre medida ese día con
  // el conector de Booking para aforo 12 (comps de Sevilla centro, p50 de las fechas normales
  // 11/12/15/18-dic ≈ 390€/noche):
  //     21-23 dic → p50 284€  = 0,73×  → NINGÚN factor: el mercado dice que la víspera larga de
  //                                      Navidad es FLOJA (todo el mundo aún en casa). Inventarle
  //                                      un premio por «suena a Navidad» habría sido justo el
  //                                      error contrario al que se viene a corregir.
  //     26-28 dic → p50 544€  = 1,40×  (mide las noches 26 y 27)
  //     29-31 dic → p50 721€  = 1,85×  (mide las noches 29 y 30)
  // El 28 se queda en 1,40 (entre una noche medida a 1,40 y otra a 1,85, el conservador) y el 31
  // hereda el 1,85 de sus dos vecinas medidas —no MÁS, aunque Nochevieja casi nunca sea más barata
  // que el 30: subir por encima de lo medido sería volver a inventar—. Del 2 al 4 de enero siguen
  // sin factor a propósito: nadie los ha medido todavía.
  "2026-12-24":1.35,"2026-12-25":1.40,"2026-12-26":1.40,"2026-12-27":1.40,
  "2026-12-28":1.40,"2026-12-29":1.85,"2026-12-30":1.85,"2026-12-31":1.85,
  "2027-01-01":1.40,"2027-01-05":1.45,"2027-01-06":1.50,
  // Maratón de Sevilla (~3er dom feb) + Puente de Andalucía (28-feb)
  "2027-02-19":1.40,"2027-02-20":1.50,"2027-02-21":1.50,"2027-02-26":1.30,"2027-02-27":1.40,"2027-02-28":1.40,
  // --- Semana Santa / Feria 2027 (ESTIMADO; confirmar fechas oficiales antes de la temporada) ---
  // Semana Santa 2027 (Domingo de Resurrección 28-mar): la Madrugá (25-26 mar) es el pico.
  "2027-03-21":2.20,"2027-03-22":2.30,"2027-03-23":2.40,"2027-03-24":2.50,
  "2027-03-25":3.00,"2027-03-26":3.20,"2027-03-27":2.80,"2027-03-28":2.50,
  // Feria de Abril 2027: fechas OFICIALES 13-18 abr (alumbrado la noche del lunes 12).
  // ⚠️ CORREGIDO 31/07/2026: estaban estimadas "18-25 abr" (~1 semana TARDE, calcadas del patrón de
  // 2026). Doble daño: (a) 19-25 abr —semana normal— se tarificaba de Feria (hasta ×2,5 de precio Y
  // ×2 de SUELO, que impide bajar) y (b) los días de Feria REAL no tenían suelo de evento, así que
  // podían caer al suelo base si el mercado no llegaba fresco. Verificado con mercado real: 15-abr
  // p50 417€ y 17-abr 304€ (Feria) frente a 20-abr 162€ (fecha normal que el calendario inflaba ×2,8).
  "2027-04-12":2.50,"2027-04-13":2.60,"2027-04-14":2.80,"2027-04-15":3.00,
  "2027-04-16":3.20,"2027-04-17":3.20,"2027-04-18":2.60,
  // Puente de mayo 2027 (1-may sáb) + Cruces de Mayo
  "2027-04-30":1.30,"2027-05-01":1.45,"2027-05-02":1.40,
}

// Horizonte de pricing: hasta cuántos días vista se captura (snapshot) y se tarifica (apply).
// Ampliado 90→365 para captar reservas de larga antelación (sobre todo extranjeros) y los
// eventos de la próxima temporada (Semana Santa / Feria del año siguiente).
export const PRICING_HORIZON_DAYS = 365

// Última fecha con evento cargado. Si el horizonte de pricing la sobrepasa, el agente avisa
// (watchdog en pilot-track) para que el calendario de eventos NO caduque en silencio cada año.
export const EVENTS_LAST_DATE = Object.keys(EVENTS).sort().slice(-1)[0]
// oct 1.10→1.40 (17/07/2026, override de Alberto: octubre = mejor mes del año en Sevilla)
export const SEASONAL = [0.65,0.65,1.10,1.00,1.40,1.45,0.85,0.85,1.40,1.40,1.10,1.00]
export const DOW      = [0.95,0.88,0.88,0.90,0.95,1.12,1.18]

// ⚠️ LEGACY / NO ES EL PRECIO REAL (hallazgo 27/07/2026, ver docs/CONTEXTO-SESIONES.md): esta fórmula
// estática (base fija × estacional × día-semana) es de ANTES de que existiera el motor anclado al
// mercado (`apply/route.ts`). Solo alimenta `rate_snapshots.price_ours` como referencia "shadow" de
// aquella época; el motor real NUNCA la usa para decidir ni para escribir en Smoobu. El precio REAL
// vivo (lo que nuestro motor aplicó, esté quien esté conectado en Smoobu) es
// `rate_snapshots.price_live` — la columna que de verdad refleja `pricing_applied`.
// Un check puntual (27/07/2026) leyó `price_ours` creyendo que era "nuestro precio vivo" y disparó
// una falsa alarma (Luxury Busto "a 214€, 2x mercado" cuando el precio real aplicado era 95€, en
// línea con mercado). NO uses `price_ours` para diagnosticar pricing en vivo — usa `price_live`
// o mejor `pricing_applied.new_price` directamente.
export function calcOurs(base: number, dateStr: string): number {
  const d   = new Date(dateStr + "T00:00:00")
  const mon = d.getMonth()
  const dow = d.getDay() === 0 ? 6 : d.getDay() - 1
  return Math.round(base * Math.max(EVENTS[dateStr] ?? 0, SEASONAL[mon]) * DOW[dow])
}

// Factor RELATIVO de evento para el motor anclado al mercado: sólo sube en fechas con evento
// declarado (Semana Santa/Feria/…); el resto de estacionalidad/día ya la refleja el mercado.
// Honra el calendario (hasta ×3): NO hay techo de precio, el suelo lo pone min_price y la
// velocidad de subida la limita max_change_pct (sube gradual cada día). Devuelve 1.0 sin evento.
export function eventFactor(dateStr: string): number {
  const e = EVENTS[dateStr]
  if (!e) return 1.0
  return Math.max(1.0, Math.min(e, 2.5)) // hasta ×2.5 (antes capado a 1.5). Semana Santa/Feria ≈ base×2.5 ≈ 320€, en línea con el histórico
}

// ─── Suelo estacional (guard anti-decaimiento) ──────────────────────────────
// Problema real (Busto, abril'27): cuando los comps de un mes CADUCAN, el motor pierde el
// bucket de ese mes, cae al global (bajo) y el precio se DESLIZA hasta min_price — vendiendo
// una semana de temporada alta a precio de suelo. El mercado fresco no siempre llega a tiempo.
//
// FLOOR_SEASONAL: multiplicador del suelo (sobre min_price) por mes (ene=0 … dic=11). >1 marca
// los meses de Sevilla en que el piso NO debe caer al suelo base aunque el mercado falte:
// alta = primavera (mar-jun) y otoño/Navidad (sep-oct, nov suave, dic); baja = ene-feb, jul-ago.
// NO sube el precio objetivo (eso lo hacen mercado/eventos): solo impide caer por debajo.
// nov 1.00→1.10 (17/08/2026, OK de Alberto): el ADR realizado de noviembre en House (serie 2024+,
// 489€) supera al de junio (599€ pero con suelo ×1,15) y noviembre iba sin protección ninguna.
// ×1,10 es deliberadamente suave: la peor venta real de nov fue ~263-310€ de listado y el suelo
// resultante (House 330€) queda justo encima sin cerrar la puerta al mercado flojo real.
export const FLOOR_SEASONAL = [1.00, 1.00, 1.25, 1.30, 1.30, 1.15, 1.00, 1.00, 1.25, 1.30, 1.10, 1.20]

// Suelo estacional relativo a min_price para una fecha. En fechas de evento sube con el evento
// (mitad del factor, acotado a ×2.0) para que Semana Santa/Feria no puedan venderse a suelo.
// Devuelve 1.0 (sin efecto) en temporada baja sin evento.
//
// `evExterno` = factor de evento que NO vive en este calendario, sino en `pricing_eventos_auto` (lo
// que descubren Ticketmaster y la búsqueda web). Sin él, un concierto que solo conoce la tabla subía
// el precio objetivo pero NO protegía el suelo (hallazgo 31/07/2026: los 3 días de Karol G en La
// Cartuja —el pelotazo del año, factor 2,5— tenían el suelo de un junio cualquiera, así que si sus
// comps caducaban el precio podía deslizarse hasta el mínimo). El motor pasa aquí el mismo factor
// que usa para el precio.
export function seasonalFloorFactor(dateStr: string, evExterno = 1): number {
  const mon = new Date(dateStr + "T00:00:00").getMonth()
  const ev = Math.max(EVENTS[dateStr] ?? 0, Number(evExterno) || 0)
  const eventFloor = ev > 1 ? Math.min(1 + (ev - 1) * 0.5, 2.0) : 1.0
  return Math.max(1.0, FLOOR_SEASONAL[mon] ?? 1.0, eventFloor)
}
