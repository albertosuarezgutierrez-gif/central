// lib/sivra/factura-verificacion-db.ts — borde sucio de la verificación de la factura de SQB.
//
// SQL + ensamblado; toda la decisión vive en `factura-verificacion.ts` (puro). Lo usan:
//   · `agente-facturas/pagos.ts::notificarFactura` (el aviso 🧾 de SQB, con botones sin «Pagar»);
//   · `factura-cuadre-correo.ts` (el triaje del correo con el PDF), que solo habla si el agente de
//     facturas aún no ha creado la factura, para que Alberto reciba UN aviso y no dos.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { LIMPIEZA_TARIFAS } from './pl-mensual'
import { PROVEEDOR_LIMPIEZA } from './factura-limpieza-lectura'
import { NOMBRE_PISO, PISOS_FACTURADOS, limitesDelPeriodo } from './factura-cuadre'
import {
  costeMedioLavanderia,
  cuadrePorPiso,
  esProveedorSqb,
  estimarLavanderia,
  huespedNoches,
  verificarFacturaSqb,
  type LineaLimp,
  type MesLavanderia,
  type ReservaAforo,
  type Verificacion,
} from './factura-verificacion'

export const MARCA_VERIFICACION_AVISADA = 'tg_verificacion_enviada'

const NO_CANCELADA = Prisma.sql`NOT EXISTS (
  SELECT 1 FROM reservas_canceladas rc
  WHERE rc.reservation_id = i."reservationId" AND i."reservationId" IS NOT NULL
)`

const aMapa = (filas: Array<{ pid: string; n: number }>): Record<string, number> =>
  Object.fromEntries(filas.map((f) => [f.pid, Number(f.n)]))

/** Huésped-noches del mes de servicio (reservas NO canceladas con salida en el mes). `null` = no calculable. */
export async function huespedNochesDelPeriodo(periodo: string): Promise<number | null> {
  const { desde, hasta } = limitesDelPeriodo(periodo)
  const filas = await prisma.$queryRaw<Array<{ nights: number | null; adults: number | null; children: number | null; maxguests: number | null }>>(Prisma.sql`
    SELECT i.nights, i.adults, i.children, p."maxGuests" AS maxguests
    FROM incomes i LEFT JOIN properties p ON p.id = i."propertyId"
    WHERE i."propertyId" IN (${Prisma.join(PISOS_FACTURADOS)})
      AND (i."checkOut" AT TIME ZONE 'Europe/Madrid')::date >= ${desde}::date
      AND (i."checkOut" AT TIME ZONE 'Europe/Madrid')::date <  ${hasta}::date
      AND ${NO_CANCELADA}
  `)
  const reservas: ReservaAforo[] = filas.map((f) => ({
    nights: f.nights == null ? null : Number(f.nights),
    adults: f.adults == null ? null : Number(f.adults),
    children: f.children == null ? null : Number(f.children),
    maxGuests: f.maxguests == null ? null : Number(f.maxguests),
  }))
  return huespedNoches(reservas)
}

/** Histórico: facturas SQB ANTERIORES al periodo con lavandería > 0, con sus huésped-noches. */
export async function historicoLavanderia(cuentaId: string, periodoActual: string): Promise<MesLavanderia[]> {
  const meses = await prisma.$queryRaw<Array<{ periodo: string; lavanderia: string | number }>>(Prisma.sql`
    SELECT periodo, lavanderia FROM limpieza_facturas
    WHERE cuenta_id = ${cuentaId} AND proveedor = ${PROVEEDOR_LIMPIEZA}
      AND periodo < ${periodoActual} AND lavanderia > 0
    ORDER BY periodo DESC LIMIT 12
  `)
  const out: MesLavanderia[] = []
  for (const m of meses) {
    out.push({ lavanderia: Number(m.lavanderia), huespedNoches: await huespedNochesDelPeriodo(m.periodo) })
  }
  return out
}

export interface DatosFacturaSqb {
  periodo: string | null
  numero: string | null
  /** Total CON IVA. */
  total: number
  lineas: LineaLimp[]
  /** Lavandería facturada SIN IVA. */
  lavanderia: number
  aritmetica?: string[]
  desconocidas?: string[]
}

/** Verificación completa. Lanza si la BD falla: quien llama decide qué decir (nunca «cuadra» por defecto). */
export async function verificarSqbDesdeDatos(cuentaId: string, d: DatosFacturaSqb): Promise<Verificacion | null> {
  if (!d.periodo) return null
  const { desde, hasta } = limitesDelPeriodo(d.periodo)
  const rango = Prisma.sql`(i."checkOut" AT TIME ZONE 'Europe/Madrid')::date >= ${desde}::date
      AND (i."checkOut" AT TIME ZONE 'Europe/Madrid')::date < ${hasta}::date`
  const [salidas, canceladas, extras, sinFecha, hn, historico] = await Promise.all([
    prisma.$queryRaw<Array<{ pid: string; n: number }>>(Prisma.sql`
      SELECT i."propertyId" AS pid, COUNT(*)::int AS n FROM incomes i
      WHERE i."propertyId" IN (${Prisma.join(PISOS_FACTURADOS)}) AND ${rango} AND ${NO_CANCELADA}
      GROUP BY 1`),
    prisma.$queryRaw<Array<{ pid: string; n: number }>>(Prisma.sql`
      SELECT i."propertyId" AS pid, COUNT(*)::int AS n FROM incomes i
      WHERE i."propertyId" IN (${Prisma.join(PISOS_FACTURADOS)}) AND ${rango} AND NOT (${NO_CANCELADA})
      GROUP BY 1`),
    // Órdenes sueltas a la limpieza (cuna, trona…) de reservas que salen en el mes.
    prisma.$queryRaw<Array<{ pid: string; n: number }>>(Prisma.sql`
      SELECT o.property_id AS pid, COUNT(*)::int AS n
      FROM sivra_ordenes_limpieza o JOIN incomes i ON i."reservationId" = o.booking_id
      WHERE o.property_id IN (${Prisma.join(PISOS_FACTURADOS)}) AND ${rango}
      GROUP BY 1`),
    prisma.$queryRaw<Array<{ n: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS n FROM incomes i
      WHERE i."propertyId" IN (${Prisma.join(PISOS_FACTURADOS)}) AND i."checkOut" IS NULL
        AND (i."checkIn" AT TIME ZONE 'Europe/Madrid')::date < ${hasta}::date AND ${NO_CANCELADA}`),
    huespedNochesDelPeriodo(d.periodo),
    historicoLavanderia(cuentaId, d.periodo),
  ])
  const coste = costeMedioLavanderia(historico)
  const lavanderia = estimarLavanderia({ huespedNoches: hn, coste, facturada: d.lavanderia })
  const pisos = cuadrePorPiso({
    lineas: d.lineas,
    salidas: aMapa(salidas),
    canceladas: aMapa(canceladas),
    ordenesExtra: aMapa(extras),
    tarifas: LIMPIEZA_TARIFAS,
    nombres: NOMBRE_PISO,
  })
  return verificarFacturaSqb({
    periodo: d.periodo, numero: d.numero, totalFactura: d.total, pisos, lavanderia,
    costeMedio: coste, huespedNoches: hn,
    aritmetica: d.aritmetica, desconocidas: d.desconocidas, sinFechaSalida: Number(sinFecha[0]?.n ?? 0),
  })
}

/** Verifica una factura SQB ya guardada en `limpieza_facturas` (la deja el triaje del correo). `null` = no está guardada. */
export async function verificarSqbGuardada(cuentaId: string, numero: string): Promise<{ v: Verificacion | null; avisada: boolean } | null> {
  const f = await prisma.$queryRaw<Array<{
    periodo: string | null; total: string | number; lavanderia: string | number
    limpieza: Array<{ propertyId: string; sesiones: number; importe: number }>; avisos: unknown
  }>>(Prisma.sql`
    SELECT periodo, total, lavanderia, limpieza, avisos FROM limpieza_facturas
    WHERE cuenta_id = ${cuentaId} AND proveedor = ${PROVEEDOR_LIMPIEZA} AND numero = ${numero} LIMIT 1
  `)
  const r = f[0]
  if (!r) return null
  const v = await verificarSqbDesdeDatos(cuentaId, {
    periodo: r.periodo, numero, total: Number(r.total), lavanderia: Number(r.lavanderia),
    lineas: (r.limpieza ?? []).map((l) => ({ propertyId: l.propertyId, sesiones: Number(l.sesiones), importe: Number(l.importe) })),
  })
  const avisada = Array.isArray(r.avisos) && (r.avisos as unknown[]).includes(MARCA_VERIFICACION_AVISADA)
  return { v, avisada }
}

/** Deja constancia de que el aviso de verificación ya salió (el otro camino no lo repite entero). */
export async function marcarVerificacionAvisada(cuentaId: string, numero: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE limpieza_facturas
    SET avisos = COALESCE(avisos, '[]'::jsonb) || ${JSON.stringify([MARCA_VERIFICACION_AVISADA])}::jsonb
    WHERE cuenta_id = ${cuentaId} AND proveedor = ${PROVEEDOR_LIMPIEZA} AND numero = ${numero}
      AND NOT (COALESCE(avisos, '[]'::jsonb) @> ${JSON.stringify([MARCA_VERIFICACION_AVISADA])}::jsonb)
  `)
}

export interface FacturaAgenteSqb { id: string; estado: string; telegramMsgId: number | null }

/** La factura SQB (mismo nº) que ya tiene el agente de facturas, si la tiene. Identidad por nombre completo normalizado. */
export async function facturaAgenteSqb(cuentaId: string, numero: string): Promise<FacturaAgenteSqb | null> {
  const filas = await prisma.$queryRaw<Array<{ id: string; proveedor: string; estado: string; telegram_msg_id: number | null }>>(Prisma.sql`
    SELECT id::text AS id, proveedor, estado, telegram_msg_id FROM facturas_proveedor
    WHERE cuenta_id = ${cuentaId}::uuid AND numero_factura = ${numero}
  `)
  const f = filas.find((x) => esProveedorSqb({ proveedor: x.proveedor }))
  return f ? { id: f.id, estado: f.estado, telegramMsgId: f.telegram_msg_id == null ? null : Number(f.telegram_msg_id) } : null
}
