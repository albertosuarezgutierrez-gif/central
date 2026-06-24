// Conciliación automática de transferencias Booking.com en banco vs reservas Smoobu.
//
// Booking paga al host N días tras el checkout. El importe real que ingresa en el banco
// difiere del `amount` que graba Smoobu: Smoobu calcula el neto usando su propia estimación
// de comisión, mientras Booking aplica además el IVA sobre la comisión y el cargo de servicio.
//
// Verificado empíricamente (jun-2026) contra 22 transferencias BBVA ↔ duplex:
//   banco = smoobu_neto × BOOKING_FACTOR    (R² = 1.00, error máx €0.04)
//
// BBVA (duplex, ****1175): Booking ingresa con concepto genérico "ABONO POR TRANSFERENCIA..."
// El identificador de Booking está en un campo que Enable Banking no captura → se detecta
// por coincidencia de importe: bank_amount ≈ sum(smoobu_neto × FACTOR) para checkouts en ventana.
//
// Kutxabank (****0855): Booking sí aparece en el concepto → buscamos 'booking' en concepto/contraparte.

import { prisma } from '../db'

export const BOOKING_FACTOR = 1.208        // bank = smoobu_neto × factor
export const MATCH_TOLERANCE = 0.10        // €0.10 de margen por redondeo
export const CHECKOUT_WINDOW_DAYS = 6      // buscar checkouts hasta N días antes del ingreso

export type ReservaSmoobu = {
  reservationId: string
  guestName: string | null
  checkOut: string          // 'YYYY-MM-DD'
  netoSmoobu: number
  netoEsperado: number      // netoSmoobu × BOOKING_FACTOR
}

export type TransferenciaBanco = {
  movimientoId: string
  fecha: string             // 'YYYY-MM-DD'
  importe: number
  concepto: string | null
  banco: string | null
  ibanMascara: string | null
  conciliado: boolean
}

export type ResultadoConciliacion = {
  movimientoId: string
  fecha: string
  importeBanco: number
  reservas: ReservaSmoobu[]
  sumaEsperada: number
  diferencia: number        // importeBanco - sumaEsperada
  ok: boolean
}

// Devuelve las transferencias BBVA (****1175) positivas que podrían ser Booking,
// sin conciliar, desde una fecha de inicio. Deduplica por (fecha, importe): si el mismo
// importe aparece dos veces el mismo día (la cuenta sincronizada por dos conexiones PSD2),
// queda solo la primera fila por created_at para no intentar conciliar dos veces.
export async function getTransferenciasBBVABooking(desde: string): Promise<TransferenciaBanco[]> {
  const rows = await prisma.$queryRaw<Array<{
    id: string; fecha_operacion: Date | null; importe: unknown
    concepto: string | null; banco: string | null; iban_mascara: string | null; conciliado: boolean
  }>>`
    SELECT DISTINCT ON (mb.fecha_operacion, mb.importe)
           mb.id, mb.fecha_operacion, mb.importe, mb.concepto, cba.banco, cba.iban_mascara, mb.conciliado
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cba ON cba.id = mb.cuenta_bancaria_id
    WHERE cba.iban_mascara = '****1175'
      AND mb.importe > 0
      AND mb.fecha_operacion >= ${desde}::date
      AND mb.conciliado = false
      AND (mb.duplicado_estado IS NULL OR mb.duplicado_estado = '')
    ORDER BY mb.fecha_operacion, mb.importe, mb.created_at
  `
  return rows.map(r => ({
    movimientoId: r.id,
    fecha: r.fecha_operacion ? r.fecha_operacion.toISOString().slice(0, 10) : '',
    importe: Number(r.importe),
    concepto: r.concepto,
    banco: r.banco,
    ibanMascara: r.iban_mascara,
    conciliado: r.conciliado,
  }))
}

// Reservas Smoobu del Duplex Center en Booking con checkout en un rango de fechas.
export async function getReservasSmoobuDuplex(desde: string, hasta: string): Promise<ReservaSmoobu[]> {
  const rows = await prisma.$queryRaw<Array<{
    reservation_id: string; guest_name: string | null
    check_out: Date; neto_smoobu: unknown
  }>>`
    SELECT "reservationId" AS reservation_id, "guestName" AS guest_name,
           "checkOut" AS check_out, amount AS neto_smoobu
    FROM incomes
    WHERE "propertyId" = 'prop_duplex_center'
      AND portal = 'BOOKING'
      AND "checkOut"::date >= ${desde}::date
      AND "checkOut"::date <= ${hasta}::date
    ORDER BY "checkOut"
  `
  return rows.map(r => {
    const neto = Number(r.neto_smoobu)
    return {
      reservationId: r.reservation_id,
      guestName: r.guest_name,
      checkOut: r.check_out.toISOString().slice(0, 10),
      netoSmoobu: neto,
      netoEsperado: Math.round(neto * BOOKING_FACTOR * 100) / 100,
    }
  })
}

// Intenta casar una transferencia con una o dos reservas cuyo netoEsperado sume ≈ importe.
// Devuelve el array de reservas que encajan ([] si no se encuentra match).
function buscarMatch(importe: number, candidatas: ReservaSmoobu[]): ReservaSmoobu[] {
  // 1:1
  for (const r of candidatas) {
    if (Math.abs(r.netoEsperado - importe) <= MATCH_TOLERANCE) return [r]
  }
  // 2:1
  for (let i = 0; i < candidatas.length; i++) {
    for (let j = i + 1; j < candidatas.length; j++) {
      const suma = candidatas[i].netoEsperado + candidatas[j].netoEsperado
      if (Math.abs(suma - importe) <= MATCH_TOLERANCE) return [candidatas[i], candidatas[j]]
    }
  }
  // 3:1 (raro, por si acaso)
  for (let i = 0; i < candidatas.length; i++) {
    for (let j = i + 1; j < candidatas.length; j++) {
      for (let k = j + 1; k < candidatas.length; k++) {
        const suma = candidatas[i].netoEsperado + candidatas[j].netoEsperado + candidatas[k].netoEsperado
        if (Math.abs(suma - importe) <= MATCH_TOLERANCE) return [candidatas[i], candidatas[j], candidatas[k]]
      }
    }
  }
  return []
}

// Corre la conciliación completa para el duplex: cruza transferencias BBVA con reservas Smoobu.
// No escribe nada en BD — solo devuelve los resultados para revisión o para confirmar.
export async function calcularConciliacion(desde = '2026-03-01'): Promise<{
  resultados: ResultadoConciliacion[]
  resumen: { total: number; ok: number; pendientes: number; importeOk: number; importePendiente: number }
}> {
  const transferencias = await getTransferenciasBBVABooking(desde)
  if (!transferencias.length) {
    return { resultados: [], resumen: { total: 0, ok: 0, pendientes: 0, importeOk: 0, importePendiente: 0 } }
  }

  const fechaMin = transferencias[0].fecha
  const fechaMax = transferencias[transferencias.length - 1].fecha

  // Reservas candidatas: checkouts desde 7 días antes del primer pago hasta el último pago
  const reservas = await getReservasSmoobuDuplex(
    offsetDate(fechaMin, -7),
    offsetDate(fechaMax, 1),
  )

  const reservasUsadas = new Set<string>()
  const resultados: ResultadoConciliacion[] = []

  for (const t of transferencias) {
    // Reservas con checkout en ventana [fecha - WINDOW, fecha + 1]
    const ventanaDesde = offsetDate(t.fecha, -CHECKOUT_WINDOW_DAYS)
    const candidatas = reservas.filter(
      r => r.checkOut >= ventanaDesde && r.checkOut <= offsetDate(t.fecha, 1)
           && !reservasUsadas.has(r.reservationId),
    )

    const match = buscarMatch(t.importe, candidatas)
    const sumaEsperada = match.reduce((s, r) => s + r.netoEsperado, 0)

    if (match.length > 0) match.forEach(r => reservasUsadas.add(r.reservationId))

    resultados.push({
      movimientoId: t.movimientoId,
      fecha: t.fecha,
      importeBanco: t.importe,
      reservas: match,
      sumaEsperada: Math.round(sumaEsperada * 100) / 100,
      diferencia: Math.round((t.importe - sumaEsperada) * 100) / 100,
      ok: match.length > 0,
    })
  }

  const ok = resultados.filter(r => r.ok)
  const pendientes = resultados.filter(r => !r.ok)
  return {
    resultados,
    resumen: {
      total: resultados.length,
      ok: ok.length,
      pendientes: pendientes.length,
      importeOk: Math.round(ok.reduce((s, r) => s + r.importeBanco, 0) * 100) / 100,
      importePendiente: Math.round(pendientes.reduce((s, r) => s + r.importeBanco, 0) * 100) / 100,
    },
  }
}

// Persiste los matches en la BD: marca los movimientos bancarios como conciliados
// y guarda los IDs de reserva en factura_ref. Devuelve cuántos se actualizaron.
export async function persistirConciliacion(resultados: ResultadoConciliacion[]): Promise<number> {
  const matches = resultados.filter(r => r.ok)
  if (!matches.length) return 0

  let actualizados = 0
  for (const m of matches) {
    const ref = 'smoobu:' + m.reservas.map(r => r.reservationId).join(',')
    const res = await prisma.$executeRaw`
      UPDATE movimientos_bancarios
      SET conciliado = true, factura_ref = ${ref}
      WHERE id = ${m.movimientoId}::uuid AND conciliado = false
    `
    actualizados += Number(res)
  }
  return actualizados
}

// Limpia los movimientos duplicados de Booking en Kutxabank (****0855).
// Los duplicados son pares (mismo día + mismo importe) donde uno tiene el concepto corto
// ("TRANSF. Booking.com B.V.") y otro el largo con referencia "NO.xxx ID.xxx".
// Se marca duplicado_estado = 'confirmado' al de concepto corto (sin referencia).
export async function limpiarDuplicadosKutxaBooking(): Promise<number> {
  const res = await prisma.$executeRaw`
    UPDATE movimientos_bancarios mb
    SET duplicado_estado = 'confirmado'
    FROM (
      SELECT a.id AS id_corto
      FROM movimientos_bancarios a
      JOIN movimientos_bancarios b
        ON b.cuenta_bancaria_id = a.cuenta_bancaria_id
       AND b.importe = a.importe
       AND b.fecha_operacion = a.fecha_operacion
       AND b.id <> a.id
      JOIN cuentas_bancarias cba ON cba.id = a.cuenta_bancaria_id
      WHERE cba.iban_mascara = '****0855'
        AND LOWER(a.concepto) LIKE '%booking%'
        AND LOWER(b.concepto) LIKE '%booking%'
        AND a.concepto NOT LIKE '%NO.%'
        AND b.concepto LIKE '%NO.%'
        AND a.duplicado_estado IS NULL
    ) dup
    WHERE mb.id = dup.id_corto
  `
  return Number(res)
}

// ─── Kutxabank: los 3 apartamentos turísticos ────────────────────────────────────────────

const PISOS_TURISTICOS = ['prop_house_sevillana', 'prop_busto_reform', 'prop_luxury_busto']

export async function getTransferenciasKutxaBooking(desde: string): Promise<TransferenciaBanco[]> {
  const rows = await prisma.$queryRaw<Array<{
    id: string; fecha_operacion: Date | null; importe: unknown
    concepto: string | null; banco: string | null; iban_mascara: string | null; conciliado: boolean
  }>>`
    SELECT DISTINCT ON (mb.fecha_operacion, mb.importe)
           mb.id, mb.fecha_operacion, mb.importe, mb.concepto, cba.banco, cba.iban_mascara, mb.conciliado
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cba ON cba.id = mb.cuenta_bancaria_id
    WHERE cba.iban_mascara = '****0855'
      AND mb.importe > 0
      AND mb.fecha_operacion >= ${desde}::date
      AND mb.conciliado = false
      AND (mb.duplicado_estado IS NULL OR mb.duplicado_estado = '')
      AND (LOWER(mb.concepto) LIKE '%booking%' OR LOWER(mb.contraparte) LIKE '%booking%')
    ORDER BY mb.fecha_operacion, mb.importe, mb.created_at
  `
  return rows.map(r => ({
    movimientoId: r.id,
    fecha: r.fecha_operacion ? r.fecha_operacion.toISOString().slice(0, 10) : '',
    importe: Number(r.importe),
    concepto: r.concepto,
    banco: r.banco,
    ibanMascara: r.iban_mascara,
    conciliado: r.conciliado,
  }))
}

export async function getReservasSmoobuTuristicos(desde: string, hasta: string): Promise<ReservaSmoobu[]> {
  const rows = await prisma.$queryRaw<Array<{
    reservation_id: string; guest_name: string | null
    check_out: Date; neto_smoobu: unknown; property_id: string
  }>>`
    SELECT "reservationId" AS reservation_id, "guestName" AS guest_name,
           "checkOut" AS check_out, amount AS neto_smoobu, "propertyId" AS property_id
    FROM incomes
    WHERE "propertyId" = ANY(${PISOS_TURISTICOS}::text[])
      AND portal = 'BOOKING'
      AND "checkOut"::date >= ${desde}::date
      AND "checkOut"::date <= ${hasta}::date
    ORDER BY "checkOut"
  `
  return rows.map(r => {
    const neto = Number(r.neto_smoobu)
    return {
      reservationId: r.reservation_id,
      guestName: r.guest_name,
      checkOut: r.check_out.toISOString().slice(0, 10),
      netoSmoobu: neto,
      netoEsperado: Math.round(neto * BOOKING_FACTOR * 100) / 100,
    }
  })
}

export async function calcularConciliacionKutxa(desde = '2026-01-01'): Promise<{
  resultados: ResultadoConciliacion[]
  resumen: { total: number; ok: number; pendientes: number; importeOk: number; importePendiente: number }
}> {
  const transferencias = await getTransferenciasKutxaBooking(desde)
  if (!transferencias.length) {
    return { resultados: [], resumen: { total: 0, ok: 0, pendientes: 0, importeOk: 0, importePendiente: 0 } }
  }

  const fechaMin = transferencias[0].fecha
  const fechaMax = transferencias[transferencias.length - 1].fecha
  const reservas = await getReservasSmoobuTuristicos(
    offsetDate(fechaMin, -7),
    offsetDate(fechaMax, 1),
  )

  const reservasUsadas = new Set<string>()
  const resultados: ResultadoConciliacion[] = []

  for (const t of transferencias) {
    const ventanaDesde = offsetDate(t.fecha, -CHECKOUT_WINDOW_DAYS)
    const candidatas = reservas.filter(
      r => r.checkOut >= ventanaDesde && r.checkOut <= offsetDate(t.fecha, 1)
           && !reservasUsadas.has(r.reservationId),
    )

    const match = buscarMatch(t.importe, candidatas)
    const sumaEsperada = match.reduce((s, r) => s + r.netoEsperado, 0)
    if (match.length > 0) match.forEach(r => reservasUsadas.add(r.reservationId))

    resultados.push({
      movimientoId: t.movimientoId,
      fecha: t.fecha,
      importeBanco: t.importe,
      reservas: match,
      sumaEsperada: Math.round(sumaEsperada * 100) / 100,
      diferencia: Math.round((t.importe - sumaEsperada) * 100) / 100,
      ok: match.length > 0,
    })
  }

  const ok = resultados.filter(r => r.ok)
  const pendientes = resultados.filter(r => !r.ok)
  return {
    resultados,
    resumen: {
      total: resultados.length,
      ok: ok.length,
      pendientes: pendientes.length,
      importeOk: Math.round(ok.reduce((s, r) => s + r.importeBanco, 0) * 100) / 100,
      importePendiente: Math.round(pendientes.reduce((s, r) => s + r.importeBanco, 0) * 100) / 100,
    },
  }
}

// ─── Limpieza de duplicados ───────────────────────────────────────────────────────────────

// Limpia los movimientos duplicados en BBVA (****1175) causados por la misma cuenta
// sincronizada por dos sesiones PSD2 distintas (BBVA + Kutxabank). Marca como
// duplicado_estado = 'confirmado' los registros extra (deja el de created_at menor).
export async function limpiarDuplicadosBBVA(): Promise<number> {
  const res = await prisma.$executeRaw`
    UPDATE movimientos_bancarios mb
    SET duplicado_estado = 'confirmado'
    FROM (
      SELECT id
      FROM (
        SELECT mb2.id,
               ROW_NUMBER() OVER (PARTITION BY mb2.fecha_operacion, mb2.importe ORDER BY mb2.created_at) AS rn
        FROM movimientos_bancarios mb2
        JOIN cuentas_bancarias cba ON cba.id = mb2.cuenta_bancaria_id
        WHERE cba.iban_mascara = '****1175'
          AND mb2.importe > 0
          AND mb2.duplicado_estado IS NULL
      ) ranked
      WHERE rn > 1
    ) dups
    WHERE mb.id = dups.id
  `
  return Number(res)
}

function offsetDate(date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
