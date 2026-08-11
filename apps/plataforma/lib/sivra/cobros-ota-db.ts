// lib/sivra/cobros-ota-db.ts — lectura de BD para el vigilante de cobros OTA.
// Separado de cobros-ota.ts (puro, testeable con node --test) para que la parte pura no arrastre
// el import de prisma/@/lib/db (que rompe el type-stripping de node --test).
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { reconciliarCobrosOTA, type ReservaOTA, type AbonoOTA, type CanalOTA, type ResultadoCobros } from './cobros-ota'

// Lee reservas OTA vencidas (últimos 120 d) y abonos OTA del banco (últimos 160 d, scoped por cuenta)
// y devuelve el estado de cobros. Los abonos NO se clasifican por canal (ver nota de cobros-ota.ts).
export async function getEstadoCobrosOTA(cuentaId: string): Promise<ResultadoCobros> {
  const hoy = new Date().toISOString().slice(0, 10)

  const [resRows, abonoRows] = await Promise.all([
    prisma.$queryRaw<Array<{ reservationId: string; canal: string; guestName: string | null; checkOut: Date; neto: number; bruto: number | null }>>(Prisma.sql`
      SELECT "reservationId", portal AS canal, "guestName", "checkOut",
             amount::float AS neto, amount_gross::float AS bruto
      FROM incomes
      WHERE portal IN ('BOOKING', 'AIRBNB', 'EXPEDIA', 'AGODA')
        AND "checkOut" IS NOT NULL
        AND "checkOut"::date <= ${hoy}::date
        AND "checkOut"::date >= (${hoy}::date - INTERVAL '120 days')
        AND amount IS NOT NULL
    `),
    prisma.$queryRaw<Array<{ fecha: Date; importe: number }>>(Prisma.sql`
      SELECT mb.fecha_operacion AS fecha, mb.importe::float AS importe
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid
        AND mb.importe > 0
        AND mb.destino IN ('turistico_duplex', 'turistico_pisos')
        AND COALESCE(mb.duplicado_estado, '') <> 'ignorado'
        AND mb.fecha_operacion >= (${hoy}::date - INTERVAL '160 days')
    `),
  ])

  const reservas: ReservaOTA[] = resRows.map(r => ({
    reservationId: r.reservationId,
    canal: r.canal as CanalOTA,
    guestName: r.guestName,
    checkOut: new Date(r.checkOut).toISOString().slice(0, 10),
    neto: Number(r.neto),
    bruto: r.bruto != null ? Number(r.bruto) : Number(r.neto),
  }))
  const abonos: AbonoOTA[] = abonoRows.map(a => ({
    fecha: new Date(a.fecha).toISOString().slice(0, 10),
    importe: Number(a.importe),
  }))

  return reconciliarCobrosOTA(reservas, abonos, hoy)
}
