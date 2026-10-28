// Lectura de reservas de pisos para el calendario de Inicio (tarjeta «Pisos»). La usan la tarjeta
// (servidor, ventana de hoy) y la API de navegación (ventanas pasadas/futuras): UNA sola consulta.
import { prisma } from '@/lib/db'
import { PROPS_CALENDARIO } from '@/lib/sivra/constantes'
import { paxDe } from '@/lib/sivra/limpieza-intranet'
import { sumarDias, ventanaCalendario, type Barra, type ReservaCal } from '@/lib/inicio-resumen'

export const DIAS_CALENDARIO = 14

export type FilaCalendario = { id: string; label: string; color: string; barras: Barra[] }

type Fila = { propertyId: string; guestName: string | null; checkIn: Date | null; checkOut: Date | null; portal: string | null; adults: number | null; children: number | null; amount: number | null }

/** Reservas que tocan [desde, desde+n). `null` = no se pudo leer (≠ «no hay reservas»). */
export async function leerReservasPisos(desde: string, n = DIAS_CALENDARIO): Promise<ReservaCal[] | null> {
  const ids = PROPS_CALENDARIO.map(p => p.id)
  const fin = sumarDias(desde, n)
  const filas = await prisma.$queryRaw<Fila[]>`
      SELECT "propertyId", "guestName", "checkIn", "checkOut", portal::text AS portal, adults, children, amount::float8 AS amount
      FROM incomes
      WHERE "propertyId" = ANY(${ids}::text[])
        AND "checkIn" < ${new Date(`${fin}T00:00:00Z`)} AND "checkOut" >= ${new Date(`${desde}T00:00:00Z`)}
    `.catch(() => null)
  if (filas === null) return null
  const d = (x: Date | null) => (x ? new Date(x).toISOString().slice(0, 10) : null)
  return filas.flatMap(r => {
    const i = d(r.checkIn); const o = d(r.checkOut)
    return i && o ? [{ propertyId: r.propertyId, huesped: r.guestName, checkIn: i, checkOut: o, portal: r.portal, pax: paxDe(r.adults, r.children), importe: r.amount }] : []
  })
}

export function filasCalendario(barras: Map<string, Barra[]>): FilaCalendario[] {
  return PROPS_CALENDARIO.map(p => ({ id: p.id, label: p.label, color: p.color, barras: barras.get(p.id) ?? [] }))
}

/** Ventana ya calculada (días + filas) para una fecha de inicio cualquiera. */
export async function ventanaPisos(desde: string, n = DIAS_CALENDARIO): Promise<{ dias: string[]; filas: FilaCalendario[] } | null> {
  const res = await leerReservasPisos(desde, n)
  if (res === null) return null
  const v = ventanaCalendario(res, PROPS_CALENDARIO.map(p => p.id), desde, n)
  return { dias: v.dias, filas: filasCalendario(v.barras) }
}
