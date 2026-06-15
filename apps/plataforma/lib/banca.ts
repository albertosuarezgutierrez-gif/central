// Persistencia y consolidación bancaria. Lee/escribe la BD compartida por SQL crudo
// (mismo patrón que lib/financiero.ts), siempre scopeado por cuenta_id. La lógica de
// parseo del extracto vive en lib/norma43.ts (pura, testeable).

import { Prisma } from '@prisma/client'
import { prisma } from './db'
import { dedupeHash, type ExtractoN43 } from './norma43'
import { fmtEur } from './financiero'

export { fmtEur }

// Importa los extractos de un fichero Norma 43 en una sociedad de la cuenta.
// Upsert de la cuenta bancaria (por sociedad+ccc), inserta movimientos deduplicados
// y actualiza el saldo con el saldo final del extracto.
export async function importarExtracto(
  cuentaId: string,
  sociedadId: string,
  extractos: ExtractoN43[],
  origen = 'norma43',
): Promise<{ insertados: number; duplicados: number; cuentas: number }> {
  let insertados = 0
  let duplicados = 0
  let cuentas = 0

  for (const ex of extractos) {
    if (!ex.ccc) continue
    const divisa = /^[A-Z]{3}$/.test(ex.divisa) ? ex.divisa : 'EUR'
    const mascara = ex.ccc.length >= 4 ? `****${ex.ccc.slice(-4)}` : ex.ccc
    const banco = ex.banco || null

    // Upsert de la cuenta bancaria (unique sociedad_id + iban). Devuelve su id.
    const filas = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO cuentas_bancarias (cuenta_id, sociedad_id, banco, iban, iban_mascara, divisa, saldo_actual, saldo_fecha)
      VALUES (
        ${cuentaId}::uuid, ${sociedadId}::uuid, ${banco}, ${ex.ccc}, ${mascara}, ${divisa},
        ${ex.saldoFinal}, ${ex.fechaFin}::date
      )
      ON CONFLICT (sociedad_id, iban) DO UPDATE SET
        banco        = COALESCE(EXCLUDED.banco, cuentas_bancarias.banco),
        saldo_actual = COALESCE(EXCLUDED.saldo_actual, cuentas_bancarias.saldo_actual),
        saldo_fecha  = COALESCE(EXCLUDED.saldo_fecha, cuentas_bancarias.saldo_fecha)
      RETURNING id
    `
    const cuentaBancariaId = filas[0]?.id
    if (!cuentaBancariaId) continue
    cuentas += 1

    // Ordinal por hash base para distinguir movimientos idénticos del mismo extracto.
    const vistos = new Map<string, number>()
    for (const m of ex.movimientos) {
      const base = dedupeHash(m)
      const n = (vistos.get(base) ?? 0) + 1
      vistos.set(base, n)
      const hash = n > 1 ? `${base}-${n}` : base

      const res = await prisma.$executeRaw`
        INSERT INTO movimientos_bancarios
          (cuenta_bancaria_id, fecha_operacion, fecha_valor, importe, saldo_posterior, concepto, contraparte, referencia, origen, dedupe_hash)
        VALUES (
          ${cuentaBancariaId}::uuid, ${m.fechaOperacion || null}::date, ${m.fechaValor || null}::date,
          ${m.importe}, ${m.saldoPosterior ?? null}, ${m.concepto || null}, ${m.contraparte || null}, ${m.referencia || null},
          ${origen}, ${hash}
        )
        ON CONFLICT (cuenta_bancaria_id, dedupe_hash) DO NOTHING
      `
      if (res === 1) insertados += 1
      else duplicados += 1
    }
  }

  return { insertados, duplicados, cuentas }
}

export type CuentaBancaria = {
  id: string
  sociedadId: string
  sociedadNombre: string
  banco: string | null
  ibanMascara: string | null
  alias: string | null
  divisa: string
  saldoActual: number | null
  saldoFecha: string | null
}

export type SaldoConsolidado = {
  total: number
  porSociedad: Array<{ sociedadId: string; sociedadNombre: string; saldo: number }>
  cuentas: CuentaBancaria[]
}

// Saldo consolidado de TODAS las cuentas bancarias de una cuenta (scoped por cuenta_id).
export async function getSaldoConsolidado(cuentaId: string): Promise<SaldoConsolidado> {
  const cuentas = await prisma.$queryRaw<Array<{
    id: string; sociedad_id: string; sociedad_nombre: string; banco: string | null
    iban_mascara: string | null; alias: string | null; divisa: string
    saldo_actual: unknown; saldo_fecha: Date | null
  }>>`
    SELECT cb.id, cb.sociedad_id, s.nombre AS sociedad_nombre, cb.banco, cb.iban_mascara,
           cb.alias, cb.divisa, cb.saldo_actual, cb.saldo_fecha
    FROM cuentas_bancarias cb
    JOIN sociedades s ON s.id = cb.sociedad_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
    ORDER BY s.nombre, cb.banco
  `

  const lista: CuentaBancaria[] = cuentas.map(c => ({
    id: c.id,
    sociedadId: c.sociedad_id,
    sociedadNombre: c.sociedad_nombre,
    banco: c.banco,
    ibanMascara: c.iban_mascara,
    alias: c.alias,
    divisa: c.divisa,
    saldoActual: c.saldo_actual == null ? null : Number(c.saldo_actual),
    saldoFecha: c.saldo_fecha ? c.saldo_fecha.toISOString().slice(0, 10) : null,
  }))

  const porSocMap = new Map<string, { sociedadId: string; sociedadNombre: string; saldo: number }>()
  let total = 0
  for (const c of lista) {
    const s = c.saldoActual ?? 0
    total += s
    const prev = porSocMap.get(c.sociedadId) ?? { sociedadId: c.sociedadId, sociedadNombre: c.sociedadNombre, saldo: 0 }
    prev.saldo += s
    porSocMap.set(c.sociedadId, prev)
  }

  return { total, porSociedad: [...porSocMap.values()], cuentas: lista }
}

export type MovimientoBancario = {
  id: string
  cuentaBancariaId: string
  fechaOperacion: string | null
  importe: number
  concepto: string | null
  conceptoNormalizado: string | null
  categoria: string | null
  contraparte: string | null
  conciliado: boolean
  requiereRevision: boolean
}

const SELECT_MOV = Prisma.sql`mb.id, mb.cuenta_bancaria_id, mb.fecha_operacion, mb.importe, mb.concepto,
  mb.concepto_normalizado, mb.categoria, mb.contraparte, mb.conciliado, mb.requiere_revision`

function mapMov(r: MovRow): MovimientoBancario {
  return {
    id: r.id,
    cuentaBancariaId: r.cuenta_bancaria_id,
    fechaOperacion: r.fecha_operacion ? r.fecha_operacion.toISOString().slice(0, 10) : null,
    importe: Number(r.importe),
    concepto: r.concepto,
    conceptoNormalizado: r.concepto_normalizado,
    categoria: r.categoria,
    contraparte: r.contraparte,
    conciliado: r.conciliado,
    requiereRevision: r.requiere_revision,
  }
}

// Últimos movimientos de una cuenta (todas sus cuentas bancarias, o una concreta).
export async function listarMovimientos(
  cuentaId: string,
  cuentaBancariaId?: string,
  limite = 100,
): Promise<MovimientoBancario[]> {
  const rows = cuentaBancariaId
    ? await prisma.$queryRaw<MovRow[]>`
        SELECT ${SELECT_MOV}
        FROM movimientos_bancarios mb
        JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
        WHERE cb.cuenta_id = ${cuentaId}::uuid AND mb.cuenta_bancaria_id = ${cuentaBancariaId}::uuid
        ORDER BY mb.fecha_operacion DESC NULLS LAST, mb.created_at DESC
        LIMIT ${limite}
      `
    : await prisma.$queryRaw<MovRow[]>`
        SELECT ${SELECT_MOV}
        FROM movimientos_bancarios mb
        JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
        WHERE cb.cuenta_id = ${cuentaId}::uuid
        ORDER BY mb.fecha_operacion DESC NULLS LAST, mb.created_at DESC
        LIMIT ${limite}
      `
  return rows.map(mapMov)
}

// Movimientos que la IA marcó "por revisar" (categoría dudosa): el dueño les pone categoría.
export async function listarPorRevisar(cuentaId: string, limite = 40): Promise<MovimientoBancario[]> {
  const rows = await prisma.$queryRaw<MovRow[]>`
    SELECT ${SELECT_MOV}
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid AND mb.requiere_revision = true
    ORDER BY mb.fecha_operacion DESC NULLS LAST, mb.created_at DESC
    LIMIT ${limite}
  `
  return rows.map(mapMov)
}

type MovRow = {
  id: string; cuenta_bancaria_id: string; fecha_operacion: Date | null; importe: unknown
  concepto: string | null; concepto_normalizado: string | null; categoria: string | null
  contraparte: string | null; conciliado: boolean; requiere_revision: boolean
}

// Resumen por "destino"/negocio (pisos, dúplex, seguros, traspaso interno, personal).
export type ResumenDestino = { destino: string; movs: number; ingresos: number; gastos: number }
export async function getResumenPorDestino(cuentaId: string): Promise<ResumenDestino[]> {
  const rows = await prisma.$queryRaw<Array<{ destino: string | null; movs: bigint; ingresos: unknown; gastos: unknown }>>`
    SELECT coalesce(mb.destino, 'personal') AS destino,
           count(*) AS movs,
           coalesce(sum(mb.importe) FILTER (WHERE mb.importe > 0), 0) AS ingresos,
           coalesce(sum(mb.importe) FILTER (WHERE mb.importe < 0), 0) AS gastos
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
    GROUP BY coalesce(mb.destino, 'personal')
    ORDER BY count(*) DESC
  `
  return rows.map(r => ({ destino: r.destino ?? 'personal', movs: Number(r.movs), ingresos: Number(r.ingresos), gastos: Number(r.gastos) }))
}
