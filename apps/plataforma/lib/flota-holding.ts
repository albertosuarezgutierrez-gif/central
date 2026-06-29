// Mapa consolidado de la flota del HOLDING: última posición de cada vehículo de TODAS las cuentas
// del grupo (god-panel). Lee la BD compartida por SQL crudo (no hay modelo Prisma de flota aquí;
// el rol prisma_plataforma es BYPASSRLS con SELECT sobre public). Reutiliza el esquema de transporte.
import { prisma } from './db'

export interface PosicionHolding {
  vehiculoId: string
  vehiculo: string
  cuenta: string | null
  lat: number
  lng: number
  velocidadKmh: number | null
  capturadoAt: string // ISO
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function listFlotaHolding(): Promise<PosicionHolding[]> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT DISTINCT ON (p.vehiculo_id)
      p.vehiculo_id        AS "vehiculoId",
      v.nombre             AS vehiculo,
      c.nombre             AS cuenta,
      p.lat                AS lat,
      p.lng                AS lng,
      p.velocidad_kmh      AS "velocidadKmh",
      p.capturado_at       AS "capturadoAt"
    FROM flota_posiciones p
    JOIN flota_vehiculos v ON v.id = p.vehiculo_id
    LEFT JOIN cuentas c     ON c.id = v.cuenta_id
    ORDER BY p.vehiculo_id, p.capturado_at DESC
  `
  return rows.map((r) => ({
    vehiculoId: r.vehiculoId,
    vehiculo: r.vehiculo ?? 'Vehículo',
    cuenta: r.cuenta ?? null,
    lat: Number(r.lat),
    lng: Number(r.lng),
    velocidadKmh: r.velocidadKmh == null ? null : Number(r.velocidadKmh),
    capturadoAt: (r.capturadoAt instanceof Date ? r.capturadoAt : new Date(r.capturadoAt)).toISOString(),
  }))
}
/* eslint-enable @typescript-eslint/no-explicit-any */
