// Persistencia y consolidación bancaria. Lee/escribe la BD compartida por SQL crudo
// (mismo patrón que lib/financiero.ts), siempre scopeado por cuenta_id. La lógica de
// parseo del extracto vive en lib/norma43.ts (pura, testeable).

import { Prisma } from '@prisma/client'
import { prisma } from './db'
import { dedupeHash, type ExtractoN43 } from './norma43'
import { fmtEur } from './financiero'
import { agruparDuplicados, DUP_UMBRAL_BANNER, type DupGrupo, type DupPar } from './duplicados'
import { getEstadoCobrosOTA } from './sivra/cobros-ota-db'
import { type Pendiente } from './sivra/cobros-ota'

export type { DupGrupo, DupMovimiento } from './duplicados'

export { fmtEur }

// Importa los extractos de un fichero Norma 43 en una sociedad de la cuenta.
// Upsert de la cuenta bancaria (por sociedad+ccc), inserta movimientos deduplicados
// y actualiza el saldo con el saldo final del extracto.
export async function importarExtracto(
  cuentaId: string,
  sociedadId: string,
  extractos: ExtractoN43[],
  origen = 'norma43',
  titular: 'titular' | 'conyuge' = 'titular',
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
      INSERT INTO cuentas_bancarias (cuenta_id, sociedad_id, banco, iban, iban_mascara, divisa, saldo_actual, saldo_fecha, titular)
      VALUES (
        ${cuentaId}::uuid, ${sociedadId}::uuid, ${banco}, ${ex.ccc}, ${mascara}, ${divisa},
        ${ex.saldoFinal}, ${ex.fechaFin}::date, ${titular}
      )
      ON CONFLICT (sociedad_id, iban) DO UPDATE SET
        banco        = COALESCE(EXCLUDED.banco, cuentas_bancarias.banco),
        saldo_actual = COALESCE(EXCLUDED.saldo_actual, cuentas_bancarias.saldo_actual),
        saldo_fecha  = COALESCE(EXCLUDED.saldo_fecha, cuentas_bancarias.saldo_fecha),
        titular      = EXCLUDED.titular
      RETURNING id
    `
    const cuentaBancariaId = filas[0]?.id
    if (!cuentaBancariaId) continue
    cuentas += 1

    // Ordinal por hash base para distinguir movimientos idénticos del mismo extracto.
    // Inserción EN BLOQUE (un solo INSERT por extracto) — antes era uno a uno y con ficheros
    // grandes (p. ej. el extracto de la tarjeta, cientos de filas) el endpoint daba timeout.
    const vistos = new Map<string, number>()
    const filasMov = ex.movimientos.map(m => {
      const base = dedupeHash(m)
      const n = (vistos.get(base) ?? 0) + 1
      vistos.set(base, n)
      const hash = n > 1 ? `${base}-${n}` : base
      return Prisma.sql`(
        ${cuentaBancariaId}::uuid, ${m.fechaOperacion || null}::date, ${m.fechaValor || null}::date,
        ${m.importe}, ${m.saldoPosterior ?? null}, ${m.concepto || null}, ${m.contraparte || null}, ${m.referencia || null},
        ${origen}, ${hash}
      )`
    })
    if (filasMov.length) {
      const res = await prisma.$executeRaw(Prisma.sql`
        INSERT INTO movimientos_bancarios
          (cuenta_bancaria_id, fecha_operacion, fecha_valor, importe, saldo_posterior, concepto, contraparte, referencia, origen, dedupe_hash)
        VALUES ${Prisma.join(filasMov)}
        ON CONFLICT (cuenta_bancaria_id, dedupe_hash) DO NOTHING
      `)
      const ins = Number(res)
      insertados += ins
      duplicados += filasMov.length - ins
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
// Evolución mensual (ingresos vs gastos) de los últimos N meses, desde los movimientos
// bancarios, excluyendo traspasos internos (no son ingreso/gasto real). Para el gráfico.
export type MesEvolucion = { mes: string; ingresos: number; gastos: number }
export async function getEvolucionMensual(cuentaId: string, meses = 12): Promise<MesEvolucion[]> {
  const rows = await prisma.$queryRaw<Array<{ mes: string; ingresos: unknown; gastos: unknown }>>`
    SELECT to_char(date_trunc('month', mb.fecha_operacion), 'YYYY-MM') AS mes,
           coalesce(sum(mb.importe) FILTER (WHERE mb.importe > 0), 0) AS ingresos,
           coalesce(sum(-mb.importe) FILTER (WHERE mb.importe < 0), 0) AS gastos
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND coalesce(mb.destino, '') <> 'traspaso_interno'
      AND mb.fecha_operacion >= (date_trunc('month', current_date) - make_interval(months => ${meses - 1}::int))
    GROUP BY 1 ORDER BY 1
  `
  return rows.map(r => ({ mes: r.mes, ingresos: Number(r.ingresos), gastos: Number(r.gastos) }))
}

// Todos los movimientos de la cuenta para exportar (al gestor). Orden cronológico,
// con la sociedad/banco, categoría y negocio ya resueltos. Scoped por cuenta_id.
export type MovExport = {
  fecha: string | null; valor: string | null; sociedad: string; banco: string | null
  concepto: string; contraparte: string | null; categoria: string | null
  categoriaPgc: string | null; destino: string | null; importe: number; conciliado: boolean
}
export async function getMovimientosExport(cuentaId: string): Promise<MovExport[]> {
  const rows = await prisma.$queryRaw<Array<{
    fecha_operacion: Date | null; fecha_valor: Date | null; sociedad: string; banco: string | null
    concepto: string | null; concepto_normalizado: string | null; contraparte: string | null
    categoria: string | null; categoria_pgc: string | null; destino: string | null
    importe: unknown; conciliado: boolean
  }>>`
    SELECT mb.fecha_operacion, mb.fecha_valor, s.nombre AS sociedad, cb.banco,
           mb.concepto, mb.concepto_normalizado, mb.contraparte, mb.categoria,
           mb.categoria_pgc, mb.destino, mb.importe, mb.conciliado
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    JOIN sociedades s ON s.id = cb.sociedad_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
    ORDER BY mb.fecha_operacion ASC NULLS LAST, mb.created_at ASC
  `
  return rows.map(r => ({
    fecha: r.fecha_operacion ? r.fecha_operacion.toISOString().slice(0, 10) : null,
    valor: r.fecha_valor ? r.fecha_valor.toISOString().slice(0, 10) : null,
    sociedad: r.sociedad,
    banco: r.banco,
    concepto: r.concepto_normalizado || r.concepto || r.contraparte || '',
    contraparte: r.contraparte,
    categoria: r.categoria,
    categoriaPgc: r.categoria_pgc,
    destino: r.destino,
    importe: Number(r.importe),
    conciliado: r.conciliado,
  }))
}

// Comparativa del mes en curso vs el mes anterior (ingresos/gastos/neto), excluyendo
// traspasos internos. Para la tira de "este mes vs anterior" del dashboard.
export type ComparativaMes = { ingresos: number; gastos: number; neto: number }
export async function getComparativaMensual(cuentaId: string): Promise<{ actual: ComparativaMes; anterior: ComparativaMes }> {
  const rows = await prisma.$queryRaw<Array<{ mes: string; ingresos: unknown; gastos: unknown }>>`
    SELECT to_char(date_trunc('month', mb.fecha_operacion), 'YYYY-MM') AS mes,
           coalesce(sum(mb.importe) FILTER (WHERE mb.importe > 0), 0) AS ingresos,
           coalesce(sum(-mb.importe) FILTER (WHERE mb.importe < 0), 0) AS gastos
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND coalesce(mb.destino, '') <> 'traspaso_interno'
      AND mb.fecha_operacion >= (date_trunc('month', current_date) - make_interval(months => 1))
    GROUP BY 1
  `
  const mesActual = new Date().toISOString().slice(0, 7)
  const find = (mes: string): ComparativaMes => {
    const r = rows.find(x => x.mes === mes)
    const ingresos = r ? Number(r.ingresos) : 0
    const gastos = r ? Number(r.gastos) : 0
    return { ingresos, gastos, neto: ingresos - gastos }
  }
  const prev = new Date(); prev.setDate(1); prev.setMonth(prev.getMonth() - 1)
  return { actual: find(mesActual), anterior: find(prev.toISOString().slice(0, 7)) }
}

// Desglose de GASTOS por categoría (la etiqueta IA/reglas) del año en curso, para el
// gráfico de barras "en qué se va el dinero". Excluye traspasos internos.
export type GastoCategoria = { categoria: string; total: number; movs: number }
export async function getGastosPorCategoria(cuentaId: string): Promise<GastoCategoria[]> {
  const rows = await prisma.$queryRaw<Array<{ categoria: string | null; total: unknown; movs: bigint }>>`
    SELECT coalesce(nullif(mb.categoria, ''), 'otros') AS categoria,
           coalesce(sum(-mb.importe), 0) AS total, count(*) AS movs
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid AND mb.importe < 0
      AND coalesce(mb.destino, '') <> 'traspaso_interno'
      AND mb.fecha_operacion >= date_trunc('year', current_date)
    GROUP BY 1 ORDER BY 2 DESC
  `
  return rows.map(r => ({ categoria: r.categoria ?? 'otros', total: Number(r.total), movs: Number(r.movs) }))
}

// Evolución del NETO mensual por negocio/destino (últimos N meses), para ver qué negocio
// tira de la caja mes a mes. Devuelve {meses, filas: por destino con neto por mes}.
export type EvolucionDestino = { destino: string; netoPorMes: number[]; total: number }
export async function getEvolucionPorDestino(cuentaId: string, meses = 6): Promise<{ meses: string[]; filas: EvolucionDestino[] }> {
  const rows = await prisma.$queryRaw<Array<{ destino: string | null; mes: string; neto: unknown }>>`
    SELECT coalesce(mb.destino, 'personal') AS destino,
           to_char(date_trunc('month', mb.fecha_operacion), 'YYYY-MM') AS mes,
           coalesce(sum(mb.importe), 0) AS neto
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND coalesce(mb.destino, '') <> 'traspaso_interno'
      AND mb.fecha_operacion >= (date_trunc('month', current_date) - make_interval(months => ${meses - 1}::int))
    GROUP BY 1, 2
  `
  // Eje de meses (los últimos N, en orden cronológico).
  const ejes: string[] = []
  const base = new Date(); base.setDate(1)
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(base); d.setMonth(d.getMonth() - i)
    ejes.push(d.toISOString().slice(0, 7))
  }
  const porDestino = new Map<string, Map<string, number>>()
  for (const r of rows) {
    const dest = r.destino ?? 'personal'
    if (!porDestino.has(dest)) porDestino.set(dest, new Map())
    porDestino.get(dest)!.set(r.mes, Number(r.neto))
  }
  const filas: EvolucionDestino[] = [...porDestino.entries()].map(([destino, m]) => {
    const netoPorMes = ejes.map(mes => m.get(mes) ?? 0)
    return { destino, netoPorMes, total: netoPorMes.reduce((s, n) => s + n, 0) }
  }).sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
  return { meses: ejes, filas }
}

// Alertas accionables para el dashboard: movimientos por revisar y posibles cargos
// duplicados (mismo importe y contraparte en ±4 días). Todo desde movimientos_bancarios.
export type Alertas = {
  porRevisar: number
  sinJustificante: number
  duplicados: number
  duplicadosDetalle: Array<{ concepto: string; importe: number; fecha: string | null }>
  facturasFaltantes: number
  cobrosPendientes: number              // nº de reservas OTA con cobro pendiente pasado de margen
  cobrosPendientesEur: number           // € que faltan por cobrar
  cobrosDetalle: Pendiente[]            // hasta 3 reservas citadas en el banner
}
export async function getAlertas(cuentaId: string): Promise<Alertas> {
  const now = new Date()
  const mesPrev = now.getMonth() === 0 ? 12 : now.getMonth()
  const añoPrev = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()

  const [rev, sinJustif, grupos, registrosPrev, cobros] = await Promise.all([
    // «Por revisar»: mismo criterio que la bandeja de /finanzas?tab=gastos
    // (requiere_revision, aún sin confirmar y que no sea un traspaso interno).
    prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid
        AND mb.requiere_revision = true
        AND COALESCE(mb.destino_confirmado, false) = false
        AND COALESCE(mb.destino, '') <> 'traspaso_interno'`,
    // «Sin justificante»: cargos deducibles del año en curso (correduría + pisos), no
    // amortizables, sin factura conciliada. Espejo de `resumen.sinJustificante` del panel.
    prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid
        AND mb.importe < 0
        AND mb.destino IN ('seguros', 'turistico_pisos', 'turistico_duplex')
        AND COALESCE(mb.amortizable, false) = false
        AND COALESCE(mb.conciliado, false) = false
        AND mb.factura_ref IS NULL
        AND date_part('year', mb.fecha_operacion) = ${now.getFullYear()}`,
    getDuplicadosSospechosos(cuentaId),
    prisma.$queryRaw<Array<{ proveedor: string }>>`
      SELECT proveedor FROM facturas_drive WHERE anio = ${añoPrev} AND mes = ${mesPrev}`,
    getEstadoCobrosOTA(cuentaId),
  ])

  // Facturas recurrentes que faltan del mes anterior. Se importa la lib aquí (no al tope del
  // fichero) para no crear dependencia circular con lib/sivra/facturas-control.
  const { PROVEEDORES_RECURRENTES, esperadoEnMes } = await import('./sivra/facturas-control')
  const esperados = PROVEEDORES_RECURRENTES.filter(p => esperadoEnMes(p, añoPrev, mesPrev))
  const archivados = new Set(registrosPrev.map(r => r.proveedor))
  const facturasFaltantes = esperados.filter(p => !archivados.has(p.id)).length

  const visibles = grupos.filter(g => g.superaUmbral)
  return {
    porRevisar: Number(rev[0]?.n ?? 0),
    sinJustificante: Number(sinJustif[0]?.n ?? 0),
    duplicados: visibles.length,
    duplicadosDetalle: visibles.slice(0, 3).map(g => ({
      concepto: g.movimientos[0]?.concepto || 'Movimiento',
      importe: g.importe,
      fecha: g.movimientos[0]?.fecha ?? null,
    })),
    facturasFaltantes,
    cobrosPendientes: cobros.hayDescuadre ? cobros.pendientes.length : 0,
    cobrosPendientesEur: cobros.hayDescuadre ? cobros.pendientesEur : 0,
    cobrosDetalle: cobros.hayDescuadre ? cobros.pendientes.slice(0, 3) : [],
  }
}

type DupRow = {
  id: string; otro_id: string
  concepto: string | null; otro_concepto: string | null
  importe: number
  fecha_operacion: Date | null; otro_fecha: Date | null
  conciliado: boolean; otro_conciliado: boolean
  contraparte_key: string | null
  ocurrencias_contraparte: number
  origen_a: string | null; origen_b: string | null
}

// Pares de gastos sospechosos de cobro doble: mismo importe + misma contraparte/concepto en
// ±4 días, últimos 60 días, AMBOS sin resolver (duplicado_estado IS NULL). Excluye pares donde
// los dos están conciliados a facturas DISTINTAS (gastos legítimos, no duplicado). La
// clasificación/agrupación es pura (lib/duplicados.ts).
export async function getDuplicadosSospechosos(cuentaId: string): Promise<DupGrupo[]> {
  const rows = await prisma.$queryRaw<DupRow[]>`
    SELECT a.id, b.id AS otro_id,
           coalesce(a.concepto_normalizado, a.concepto, a.contraparte) AS concepto,
           coalesce(b.concepto_normalizado, b.concepto, b.contraparte) AS otro_concepto,
           a.importe::float AS importe,
           a.fecha_operacion, b.fecha_operacion AS otro_fecha,
           a.conciliado, b.conciliado AS otro_conciliado,
           coalesce(a.contraparte, a.concepto) AS contraparte_key,
           (SELECT count(*)::int FROM movimientos_bancarios m2
             WHERE m2.cuenta_bancaria_id = a.cuenta_bancaria_id
               AND coalesce(m2.contraparte, m2.concepto) = coalesce(a.contraparte, a.concepto)
               AND m2.importe < 0
               AND m2.fecha_operacion >= current_date - 60) AS ocurrencias_contraparte,
           a.origen AS origen_a, b.origen AS origen_b
    FROM movimientos_bancarios a
    JOIN movimientos_bancarios b
      ON b.cuenta_bancaria_id = a.cuenta_bancaria_id AND b.id > a.id
     AND b.importe = a.importe
     AND coalesce(b.contraparte, b.concepto) = coalesce(a.contraparte, a.concepto)
     AND abs(b.fecha_operacion - a.fecha_operacion) <= 4
    JOIN cuentas_bancarias cb ON cb.id = a.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND a.importe < 0
      AND a.duplicado_estado IS NULL AND b.duplicado_estado IS NULL
      AND a.fecha_operacion >= current_date - 60
      AND NOT (a.conciliado AND b.conciliado
               AND a.factura_ref IS NOT NULL AND b.factura_ref IS NOT NULL
               AND a.factura_ref <> b.factura_ref)
      -- Idea A: excluir pares cross-origen (manual↔PSD2): misma tx importada dos veces
      AND NOT (
        (a.origen = 'psd2' AND b.origen IN ('norma43', 'xls-bbva', 'xls-kutxa'))
        OR (b.origen = 'psd2' AND a.origen IN ('norma43', 'xls-bbva', 'xls-kutxa'))
      )
      -- Backstop PSD2: excluir pares psd2+psd2 mismo concepto+fecha (banco rota entry_reference)
      AND NOT (
        a.origen = 'psd2' AND b.origen = 'psd2'
        AND a.fecha_operacion = b.fecha_operacion
        AND a.concepto IS NOT NULL AND a.concepto = b.concepto
      )
    ORDER BY a.fecha_operacion DESC NULLS LAST
  `
  const toIso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)
  const pares: DupPar[] = rows.map(r => ({
    id: r.id, otroId: r.otro_id,
    concepto: r.concepto || '', otroConcepto: r.otro_concepto || '',
    importe: r.importe,
    fecha: toIso(r.fecha_operacion), otroFecha: toIso(r.otro_fecha),
    conciliado: r.conciliado, otroConciliado: r.otro_conciliado,
    contraparteKey: r.contraparte_key || '',
    ocurrenciasContraparte: Number(r.ocurrencias_contraparte),
    origenA: r.origen_a ?? undefined, origenB: r.origen_b ?? undefined,
  }))
  return agruparDuplicados(pares, DUP_UMBRAL_BANNER)
}

// Resueltos recientes (para el plegable "ya resueltos" con opción de reactivar).
export type DupResuelto = { id: string; fecha: string | null; concepto: string; importe: number; estado: 'ignorado' | 'confirmado' }
export async function getDuplicadosResueltos(cuentaId: string, limite = 40): Promise<DupResuelto[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string; fecha_operacion: Date | null; concepto: string | null; contraparte: string | null; importe: number; duplicado_estado: string }>>`
    SELECT mb.id, mb.fecha_operacion,
           coalesce(mb.concepto_normalizado, mb.concepto, mb.contraparte) AS concepto,
           mb.contraparte, mb.importe::float AS importe, mb.duplicado_estado
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid AND mb.duplicado_estado IN ('ignorado', 'confirmado')
    ORDER BY mb.fecha_operacion DESC NULLS LAST, mb.created_at DESC
    LIMIT ${limite}
  `
  return rows.map(r => ({
    id: r.id,
    fecha: r.fecha_operacion ? r.fecha_operacion.toISOString().slice(0, 10) : null,
    concepto: r.concepto || r.contraparte || 'Movimiento',
    importe: Number(r.importe),
    estado: r.duplicado_estado as 'ignorado' | 'confirmado',
  }))
}

// Marca (o desmarca) movimientos como duplicado resuelto. Scoped por cuenta_id vía join: solo
// toca movimientos de cuentas bancarias de la sesión. estado=null → deshacer (vuelve a NULL).
export async function resolverDuplicados(
  cuentaId: string,
  ids: string[],
  estado: 'ignorado' | 'confirmado' | null,
): Promise<number> {
  if (ids.length === 0) return 0
  const res = await prisma.$executeRaw`
    UPDATE movimientos_bancarios mb
    SET duplicado_estado = ${estado}
    FROM cuentas_bancarias cb
    WHERE cb.id = mb.cuenta_bancaria_id
      AND cb.cuenta_id = ${cuentaId}::uuid
      AND mb.id = ANY(${ids}::uuid[])
  `
  return Number(res)
}

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
