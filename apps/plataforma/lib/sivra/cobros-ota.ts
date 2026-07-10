// lib/sivra/cobros-ota.ts — vigilante de cobros OTA (Booking/Airbnb/Expedia/Agoda).
// Detecta dinero que las OTAs ya deberían haber pagado y no ha entrado al banco.
//
// ⚠️ REESCRITO (10/07/2026). La v1 emparejaba 1 abono ↔ 1 reserva por importe EXACTO (±0,02€)
// contra el NETO de comisión. Daba MILES de falsos positivos (aviso de "44.797€ sin cobrar" con
// 94 reservas, cuando el banco había recibido MÁS de lo facturado). Dos razones comprobadas contra
// la BD y contra el desglose real de Booking (captura de Alberto, Luxury Busto mayo):
//   1. Booking (y en la práctica el resto) INGRESA EL BRUTO y factura la comisión aparte
//      → el abono es ~amount_gross, NO amount (neto). Comparar contra el neto fallaba ~18%.
//   2. Las OTAs AGRUPAN varias reservas en una sola transferencia (liquidaciones) con referencias
//      que el banco ROTA entre sesiones → un abono nunca casa el importe de una reserva suelta.
//
// Enfoque nuevo: conciliación por FLUJO (FIFO en el tiempo), a nivel de CUENTA (los abonos no se
// pueden atribuir a un piso de forma fiable). El "pool" de abonos recibidos se consume por orden de
// checkout; una reserva solo es PENDIENTE si, ya pasado su plazo de pago, el dinero acumulado que
// había entrado hasta esa fecha no llegaba a cubrirla (a ella y a las anteriores). Un solo abono
// puede cubrir varias reservas (agrupación) y varios abonos pueden sumar para cubrir una. La parte
// pura (reconciliarCobrosOTA) no toca BD y se testea con `node --test`.

export type CanalOTA = 'BOOKING' | 'AIRBNB' | 'EXPEDIA' | 'AGODA'

export interface ReservaOTA {
  reservationId: string
  canal: CanalOTA
  guestName: string | null
  checkOut: string // 'YYYY-MM-DD'
  neto: number     // amount (neto de comisión) — se conserva para reporting
  bruto: number    // amount_gross (lo que la OTA realmente ingresa) — base del cuadre
}

export interface AbonoOTA {
  fecha: string // 'YYYY-MM-DD'
  importe: number
}

export interface ConfigCobros {
  margenDias: Record<CanalOTA, number>
  umbralEur: number       // solo dispara el aviso si el descuadre AGREGADO supera este importe
  toleranciaEur: number   // holgura por reserva (céntimos de redondeo / tasas)
}

// Booking/Airbnb pagan a los pocos días del checkout; Expedia ~1 mes; Agoda ~2 semanas.
// umbralEur alto a propósito: el vigilante es una red para cazar que una OTA DEJE de pagar
// (agujero grande y sostenido), no para perseguir céntimos de una reserva rezagada.
export const CONFIG_COBROS_DEFAULT: ConfigCobros = {
  margenDias: { BOOKING: 10, AIRBNB: 10, EXPEDIA: 40, AGODA: 20 },
  umbralEur: 500,
  toleranciaEur: 1,
}

export interface Pendiente {
  reservationId: string
  guestName: string | null
  checkOut: string
  neto: number      // € neto de la reserva (etiqueta legible)
  bruto: number     // € bruto (lo que debería haber entrado)
  descubierto: number // € de esta reserva que el flujo de abonos NO llegó a cubrir a su vencimiento
  canal: CanalOTA
}

export interface ResultadoCobros {
  hayDescuadre: boolean
  pendientes: Pendiente[]
  huerfanos: AbonoOTA[]     // sobrante de abonos no consumido (contexto; no dispara)
  pendientesEur: number     // suma de lo REALMENTE descubierto (agregado), no el bruto de las reservas
  huerfanosEur: number
}

// Suma una cantidad de días a una fecha 'YYYY-MM-DD' (en UTC, sin tocar zona horaria).
function addDias(fecha: string, dias: number): string {
  const d = new Date(fecha + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

const round2 = (n: number) => Math.round(n * 100) / 100

// Base de cuadre de una reserva: el BRUTO (lo que la OTA ingresa). Si por lo que sea no hay bruto,
// cae al neto para no romper (peor caso: subestima lo esperado, es conservador → menos falsos avisos).
const baseCuadre = (r: ReservaOTA) => (r.bruto && r.bruto > 0 ? r.bruto : r.neto)

export function reconciliarCobrosOTA(
  reservas: ReservaOTA[],
  abonos: AbonoOTA[],
  hoy: string, // 'YYYY-MM-DD'
  config: ConfigCobros = CONFIG_COBROS_DEFAULT,
): ResultadoCobros {
  // Reservas ya terminadas (checkout pasado), de más antigua a más reciente (orden del flujo FIFO).
  const vencidas = reservas
    .filter(r => r.checkOut <= hoy)
    .sort((a, b) => a.checkOut.localeCompare(b.checkOut))

  // Abonos ordenados por fecha asc; cada uno con un "restante" que se va consumiendo.
  const pool = [...abonos]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map(a => ({ fecha: a.fecha, importe: a.importe, restante: a.importe }))

  const pendientes: Pendiente[] = []

  for (const r of vencidas) {
    const limite = addDias(r.checkOut, config.margenDias[r.canal]) // fecha tope de pago
    let necesita = baseCuadre(r)

    // Consume, en orden cronológico, los abonos que YA habían entrado a la fecha tope de esta
    // reserva. Así respetamos el tiempo: dinero que entra DESPUÉS del vencimiento no la cubre.
    for (const ab of pool) {
      if (necesita <= config.toleranciaEur) break
      if (ab.restante <= 0) continue
      if (ab.fecha > limite) continue // aún no había entrado a tiempo
      const toma = Math.min(ab.restante, necesita)
      ab.restante = round2(ab.restante - toma)
      necesita = round2(necesita - toma)
    }

    const descubierto = necesita > config.toleranciaEur ? round2(necesita) : 0

    // Solo es PENDIENTE si quedó descubierta Y su plazo de pago ya venció (si aún está en plazo,
    // el dinero puede estar por llegar → no se avisa).
    if (descubierto > 0 && limite < hoy) {
      pendientes.push({
        reservationId: r.reservationId,
        guestName: r.guestName,
        checkOut: r.checkOut,
        neto: r.neto,
        bruto: baseCuadre(r),
        descubierto,
        canal: r.canal,
      })
    }
  }

  const huerfanos: AbonoOTA[] = pool
    .filter(a => a.restante > config.toleranciaEur)
    .map(a => ({ fecha: a.fecha, importe: round2(a.restante) }))

  const pendientesEur = round2(pendientes.reduce((s, p) => s + p.descubierto, 0))
  const huerfanosEur = round2(huerfanos.reduce((s, a) => s + a.importe, 0))
  // Dispara SOLO si el descuadre AGREGADO real supera el umbral (no la suma bruta de reservas).
  const hayDescuadre = pendientesEur > config.umbralEur

  return { hayDescuadre, pendientes, huerfanos, pendientesEur, huerfanosEur }
}
