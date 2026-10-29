// lib/sivra/facturas/listado.ts — lecturas para /sivra/facturas (SERVIDOR). SIEMPRE por `cuenta_id` de la sesión.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import type { FilaLibro } from './csv'
import type { Receptor } from './receptor'
import { solicitudesListas, type SolicitudCruda, type SolicitudLista } from './listas'

export type FilaListado = FilaLibro & { id: string; envioError: string | null; tienePdf: boolean }

type Cruda = {
  id: string; numero_completo: string | null; fecha_expedicion: Date | null; estado: string; piso: string | null; reservation_id: string
  receptor: Receptor; base: number | null; tipo_iva: number | null; cuota: number | null; total: number; envio_error: string | null; tiene_pdf: boolean
}

function aFila(r: Cruda): FilaListado {
  return {
    id: r.id, numeroCompleto: r.numero_completo, fechaExpedicion: r.fecha_expedicion ? r.fecha_expedicion.toISOString().slice(0, 10) : null,
    estado: r.estado, piso: r.piso ?? '—', reservationId: r.reservation_id, receptorNombre: r.receptor?.nombre ?? '', receptorNif: r.receptor?.nif ?? '',
    receptorPais: r.receptor?.pais ?? '', base: r.base, tipoIva: r.tipo_iva, cuota: r.cuota, total: r.total, envioError: r.envio_error, tienePdf: r.tiene_pdf,
  }
}

const COLS = Prisma.sql`f.id::text, f.numero_completo, f.fecha_expedicion, f.estado, p.name AS piso, f.reservation_id, f.receptor,
  f.base::float8 AS base, f.tipo_iva::float8 AS tipo_iva, f.cuota::float8 AS cuota, f.total::float8 AS total, f.envio_error, (f.pdf IS NOT NULL) AS tiene_pdf`

/** Emitidas (y enviadas/rectificadas) con fecha de expedición en [desde, hasta). Libro completo del periodo (para totales y CSV). */
export async function listarEmitidas(cuentaId: string, desde: string, hasta: string, piso: string | null): Promise<FilaListado[]> {
  const filas = await prisma.$queryRaw<Cruda[]>(Prisma.sql`
    SELECT ${COLS} FROM sivra_facturas_huesped f LEFT JOIN properties p ON p.id = f.property_id
     WHERE f.cuenta_id = ${cuentaId}::uuid AND f.estado <> 'borrador'
       AND f.fecha_expedicion >= ${desde}::date AND f.fecha_expedicion < ${hasta}::date
       ${piso ? Prisma.sql`AND f.property_id = ${piso}` : Prisma.empty}
     ORDER BY f.anio, f.serie_prefijo, f.numero`)
  return filas.map(aFila)
}

/** Borradores pendientes de aprobar (sin número, sin fecha): fuera del periodo, siempre a la vista. */
export async function listarBorradores(cuentaId: string, piso: string | null): Promise<FilaListado[]> {
  const filas = await prisma.$queryRaw<Cruda[]>(Prisma.sql`
    SELECT ${COLS} FROM sivra_facturas_huesped f LEFT JOIN properties p ON p.id = f.property_id
     WHERE f.cuenta_id = ${cuentaId}::uuid AND f.estado = 'borrador' ${piso ? Prisma.sql`AND f.property_id = ${piso}` : Prisma.empty} ORDER BY f.updated_at DESC LIMIT 200`)
  return filas.map(aFila)
}

/** Pisos de la cuenta (por negocios.ref_ext): para el filtro y para acotar la búsqueda de reservas. */
export async function pisosDeCuenta(cuentaId: string): Promise<Array<{ id: string; nombre: string }>> {
  return prisma.$queryRaw<Array<{ id: string; nombre: string }>>(Prisma.sql`
    SELECT DISTINCT p.id, p.name AS nombre FROM properties p
      JOIN negocios n ON n.ref_ext = p.id JOIN sociedades s ON s.id = n.sociedad_id
     WHERE s.cuenta_id = ${cuentaId}::uuid ORDER BY p.name`)
}

export type ReservaBuscada = { reservationId: string; piso: string; huesped: string | null; desde: string | null; hasta: string | null; total: number | null; solicitud: string | null; factura: string | null }

/** Busca reservas de los pisos de la cuenta por id o nombre del huésped (para el alta manual). */
export async function buscarReservas(cuentaId: string, q: string): Promise<ReservaBuscada[]> {
  const t = q.trim().slice(0, 60)
  if (t.length < 2) return []
  const filas = await prisma.$queryRaw<Array<{ rid: string; piso: string; huesped: string | null; ci: Date | null; co: Date | null; gross: number | null; sol: string | null; fac: string | null }>>(Prisma.sql`
    SELECT i."reservationId" AS rid, p.name AS piso, i."guestName" AS huesped, i."checkIn" AS ci, i."checkOut" AS co, i.amount_gross::float8 AS gross,
           (SELECT s.estado FROM sivra_factura_solicitudes s WHERE s.reservation_id = i."reservationId" AND s.estado <> 'cancelada' LIMIT 1) AS sol,
           (SELECT f.estado FROM sivra_facturas_huesped f WHERE f.reservation_id = i."reservationId" AND f.tipo = 'ordinaria' AND f.estado <> 'rectificada' LIMIT 1) AS fac
      FROM incomes i JOIN properties p ON p.id = i."propertyId"
     WHERE i."propertyId" IN (SELECT n.ref_ext FROM negocios n JOIN sociedades s ON s.id = n.sociedad_id WHERE s.cuenta_id = ${cuentaId}::uuid AND n.ref_ext IS NOT NULL)
       AND (i."reservationId" = ${t} OR i."guestName" ILIKE ${'%' + t.replace(/[%_\\]/g, (c) => '\\' + c) + '%'})
     ORDER BY i."checkIn" DESC NULLS LAST LIMIT 20`)
  return filas.map((r) => ({
    reservationId: r.rid, piso: r.piso, huesped: r.huesped, desde: r.ci ? r.ci.toISOString().slice(0, 10) : null, hasta: r.co ? r.co.toISOString().slice(0, 10) : null,
    total: typeof r.gross === 'number' && r.gross > 0 ? r.gross : null, solicitud: r.sol, factura: r.fac,
  }))
}

/** Solicitudes `pendiente` con datos válidos y SIN factura/borrador de su reserva (la validación es el helper puro). */
export async function listarSolicitudesListas(cuentaId: string, piso: string | null): Promise<SolicitudLista[]> {
  const filas = await prisma.$queryRaw<Array<{ id: string; rid: string; piso: string | null; estado: string; t: string | null; n: string | null; nif: string | null; p: string | null; e: string | null; d: unknown; cc: unknown; fac: boolean }>>(Prisma.sql`
    SELECT s.id::text, s.reservation_id AS rid, p.name AS piso, s.estado, s.receptor_tipo AS t, s.receptor_nombre AS n, s.receptor_nif AS nif,
           s.receptor_pais AS p, s.receptor_email AS e, s.receptor_direccion AS d, to_jsonb(s) -> 'receptor_cc' AS cc,
           EXISTS (SELECT 1 FROM sivra_facturas_huesped f WHERE f.reservation_id = s.reservation_id AND f.tipo = 'ordinaria' AND f.estado <> 'rectificada') AS fac
      FROM sivra_factura_solicitudes s LEFT JOIN properties p ON p.id = s.property_id
     WHERE s.cuenta_id = ${cuentaId}::uuid AND s.estado = 'pendiente' AND s.receptor_nombre IS NOT NULL AND s.receptor_email IS NOT NULL
       ${piso ? Prisma.sql`AND s.property_id = ${piso}` : Prisma.empty}
     ORDER BY s.updated_at DESC LIMIT 200`)
  const crudas: SolicitudCruda[] = filas.map((f) => ({
    id: f.id, reservationId: f.rid, piso: f.piso, estado: f.estado, receptorTipo: f.t, receptorNombre: f.n, receptorNif: f.nif, receptorPais: f.p,
    receptorEmail: f.e, receptorDireccion: f.d, receptorCc: Array.isArray(f.cc) ? f.cc.filter((x): x is string => typeof x === 'string') : null, tieneFactura: f.fac,
  }))
  return solicitudesListas(crudas)
}
