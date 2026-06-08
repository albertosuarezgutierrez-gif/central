/**
 * ia.rest — Motor contable
 * Genera asientos PGC, calcula liquidaciones IVA, exporta a A3/Sage/Holded/CSV.
 * Adaptable: IS / IRPF directa / IRPF módulos.
 */

// ── Cuentas PGC por defecto (hostelería) ─────────────────────────────────────
export const PGC_DEFECTO = {
  // Ventas (705 = prestaciones de servicios)
  ventas_10:           '705.10',
  ventas_21:           '705.21',
  ventas_4:            '705.04',
  // Compras
  compras_mercancias:  '600',
  compras_materias:    '601',
  compras_gastos:      '602',
  // Personal
  personal_sueldos:    '640',
  personal_ss:         '642',
  // IVA
  iva_repercutido:     '477',
  iva_soportado:       '472',
  // Tesorería
  caja:                '570',
  bancos:              '572',
  propinas:            '555',
  // Acreedores
  hacienda_iva:        '4750',
  hacienda_irpf:       '4751',
  ss_acreedor:         '476',
}

export type PlanCuentas = typeof PGC_DEFECTO

export interface ConfigContabilidad {
  regimen_fiscal:        'is' | 'irpf_directa' | 'irpf_modulos'
  iva_regimen:           'general' | 'simplificado' | 'igic'
  formato_exportacion:   'a3' | 'sage' | 'holded' | 'csv' | 'json'
  cuenta_ventas_10:      string
  cuenta_ventas_21:      string
  cuenta_ventas_4:       string
  cuenta_compras_mercancias: string
  cuenta_compras_materias:   string
  cuenta_compras_gastos:     string
  cuenta_personal_sueldos:   string
  cuenta_personal_ss:        string
  cuenta_iva_repercutido:    string
  cuenta_iva_soportado:      string
  cuenta_caja:               string
  cuenta_bancos:             string
  cuenta_propinas:           string
  ejercicio_actual:          number
  email_contable?:           string | null
}

export interface LineaAsiento {
  cuenta: string
  nombre_cuenta?: string
  debe: number
  haber: number
  concepto?: string
}

export interface DatosArqueo {
  local_id: string
  fecha:          string   // YYYY-MM-DD
  base_10:        number
  iva_10:         number
  base_21:        number
  iva_21:         number
  base_4:         number
  iva_4:          number
  efectivo:       number
  tarjeta:        number
  bizum:          number
  qr:             number
  otros:          number
  propinas_efectivo: number
  propinas_tarjeta:  number
  salidas_caja:   number
}

// ── Generar asiento diario de ventas desde arqueo ────────────────────────────
export function generarAsientoCierreDiario(
  arqueo: DatosArqueo,
  cfg: ConfigContabilidad,
  numAsiento: number
): { concepto: string; tipo: string; lineas: LineaAsiento[] } {
  const lineas: LineaAsiento[] = []
  const fecha = new Date(arqueo.fecha).toLocaleDateString('es', { day:'2-digit', month:'2-digit', year:'numeric' })

  const totalCobros = arqueo.efectivo + arqueo.tarjeta + arqueo.bizum + arqueo.qr + arqueo.otros
  const totalPropinas = arqueo.propinas_efectivo + arqueo.propinas_tarjeta

  // DEBE: cobros recibidos
  if (arqueo.efectivo > 0) {
    lineas.push({ cuenta: cfg.cuenta_caja,   nombre_cuenta: 'Caja',       debe: round2(arqueo.efectivo),  haber: 0, concepto: `Ventas efectivo ${fecha}` })
  }
  if (arqueo.tarjeta + arqueo.bizum + arqueo.qr + arqueo.otros > 0) {
    lineas.push({ cuenta: cfg.cuenta_bancos, nombre_cuenta: 'Bancos/TPV', debe: round2(arqueo.tarjeta + arqueo.bizum + arqueo.qr + arqueo.otros), haber: 0, concepto: `Ventas tarjeta/digital ${fecha}` })
  }
  if (totalPropinas > 0) {
    lineas.push({ cuenta: cfg.cuenta_propinas, nombre_cuenta: 'Propinas pendientes', debe: round2(totalPropinas), haber: 0, concepto: `Propinas ${fecha}` })
  }

  // HABER: ventas e IVA repercutido
  if (arqueo.base_10 > 0) {
    lineas.push({ cuenta: cfg.cuenta_ventas_10, nombre_cuenta: 'Ventas servicios 10%', debe: 0, haber: round2(arqueo.base_10), concepto: `Ventas restaurante ${fecha}` })
    lineas.push({ cuenta: cfg.cuenta_iva_repercutido, nombre_cuenta: 'HP IVA repercutido 10%', debe: 0, haber: round2(arqueo.iva_10), concepto: `IVA 10% ${fecha}` })
  }
  if (arqueo.base_21 > 0) {
    lineas.push({ cuenta: cfg.cuenta_ventas_21, nombre_cuenta: 'Ventas servicios 21%', debe: 0, haber: round2(arqueo.base_21), concepto: `Ventas 21% ${fecha}` })
    lineas.push({ cuenta: cfg.cuenta_iva_repercutido, nombre_cuenta: 'HP IVA repercutido 21%', debe: 0, haber: round2(arqueo.iva_21), concepto: `IVA 21% ${fecha}` })
  }
  if (arqueo.base_4 > 0) {
    lineas.push({ cuenta: cfg.cuenta_ventas_4, nombre_cuenta: 'Ventas 4%', debe: 0, haber: round2(arqueo.base_4), concepto: `Ventas 4% ${fecha}` })
    lineas.push({ cuenta: cfg.cuenta_iva_repercutido, nombre_cuenta: 'HP IVA repercutido 4%', debe: 0, haber: round2(arqueo.iva_4), concepto: `IVA 4% ${fecha}` })
  }
  if (totalPropinas > 0) {
    lineas.push({ cuenta: cfg.cuenta_propinas, nombre_cuenta: 'Propinas pendientes', debe: 0, haber: round2(totalPropinas), concepto: `Propinas ${fecha}` })
  }

  return { concepto: `Ventas del día ${fecha}`, tipo: 'venta', lineas }
}

// ── Generar asiento de compra desde factura proveedor ────────────────────────
export function generarAsientoCompra(
  factura: {
    proveedor_nombre: string
    importe_base: number
    importe_iva: number
    tipo_iva: number
    fecha_factura: string
    numero_factura?: string | null
  },
  cfg: ConfigContabilidad,
  numAsiento: number
): { concepto: string; tipo: string; lineas: LineaAsiento[] } {
  const cuentaCompra = cfg.cuenta_compras_mercancias
  const desc = `Factura ${factura.proveedor_nombre}${factura.numero_factura ? ` nº ${factura.numero_factura}` : ''}`

  return {
    concepto: desc,
    tipo: 'compra',
    lineas: [
      { cuenta: cuentaCompra, nombre_cuenta: 'Compras',                      debe: round2(factura.importe_base), haber: 0,    concepto: desc },
      { cuenta: cfg.cuenta_iva_soportado, nombre_cuenta: `IVA soportado ${factura.tipo_iva}%`, debe: round2(factura.importe_iva), haber: 0, concepto: `IVA ${factura.tipo_iva}%` },
      { cuenta: '400', nombre_cuenta: 'Proveedores',                         debe: 0,     haber: round2(factura.importe_base + factura.importe_iva), concepto: desc },
    ],
  }
}

// ── Calcular liquidación IVA del trimestre ────────────────────────────────────
export function calcularLiquidacionIVA(params: {
  arqueos: { base_10: number; iva_10: number; base_21: number; iva_21: number; base_4: number; iva_4: number }[]
  facturas_compra: { importe_base: number; importe_iva: number; tipo_iva: number }[]
  compensacion_anterior?: number
}) {
  // Repercutido (ventas)
  const base_rep_10 = sum(params.arqueos.map(a => a.base_10))
  const cuota_rep_10 = sum(params.arqueos.map(a => a.iva_10))
  const base_rep_21 = sum(params.arqueos.map(a => a.base_21))
  const cuota_rep_21 = sum(params.arqueos.map(a => a.iva_21))
  const base_rep_4  = sum(params.arqueos.map(a => a.base_4))
  const cuota_rep_4  = sum(params.arqueos.map(a => a.iva_4))
  const total_rep    = round2(cuota_rep_10 + cuota_rep_21 + cuota_rep_4)

  // Soportado (compras deducibles)
  const compras_10 = params.facturas_compra.filter(f => f.tipo_iva === 10)
  const compras_21 = params.facturas_compra.filter(f => f.tipo_iva === 21)
  const base_sop_10  = sum(compras_10.map(f => f.importe_base))
  const cuota_sop_10 = sum(compras_10.map(f => f.importe_iva))
  const base_sop_21  = sum(compras_21.map(f => f.importe_base))
  const cuota_sop_21 = sum(compras_21.map(f => f.importe_iva))
  const total_sop    = round2(cuota_sop_10 + cuota_sop_21)

  const resultado         = round2(total_rep - total_sop)
  const compensacion      = params.compensacion_anterior ?? 0
  const cuota_diferencial = round2(resultado - compensacion)

  return {
    base_rep_10: round2(base_rep_10), cuota_rep_10: round2(cuota_rep_10),
    base_rep_21: round2(base_rep_21), cuota_rep_21: round2(cuota_rep_21),
    base_rep_4:  round2(base_rep_4),  cuota_rep_4:  round2(cuota_rep_4),
    total_rep,
    base_sop_10: round2(base_sop_10), cuota_sop_10: round2(cuota_sop_10),
    base_sop_21: round2(base_sop_21), cuota_sop_21: round2(cuota_sop_21),
    total_sop,
    resultado,
    compensacion_anterior: compensacion,
    cuota_diferencial,
    a_pagar: cuota_diferencial > 0,
    a_compensar: cuota_diferencial < 0,
  }
}

// ── Exportadores ──────────────────────────────────────────────────────────────

type AsientoExport = {
  num_asiento: number
  fecha: string
  concepto: string
  tipo: string
  lineas: LineaAsiento[]
}

/** A3 SUENLACE.DAT — formato Wolters Kluwer */
export function exportarA3(asientos: AsientoExport[], codigoEmpresa = '001', ejercicio = 2026): string {
  const lines: string[] = []
  // Cabecera A3
  lines.push(`00${pad(codigoEmpresa, 5)}${ejercicio}`)
  for (const asi of asientos) {
    for (const l of asi.lineas) {
      if (l.debe === 0 && l.haber === 0) continue
      // Formato A3: TIPO|EMPRESA|EJ|ASIENTO|FECHA|CUENTA|DEBE|HABER|CONCEPTO
      const tipo   = l.debe > 0 ? 'D' : 'H'
      const importe = l.debe > 0 ? l.debe : l.haber
      const fecha  = asi.fecha.replace(/-/g, '')
      const concepto = (l.concepto ?? asi.concepto).slice(0, 40).padEnd(40)
      lines.push(
        `10|${pad(codigoEmpresa, 5)}|${ejercicio}|${pad(String(asi.num_asiento), 6)}|${fecha}|${l.cuenta.padEnd(10)}|${tipo}|${importe.toFixed(2).padStart(14, '0')}|${concepto}`
      )
    }
  }
  return lines.join('\r\n')
}

/** Sage 50 CSV */
export function exportarSage(asientos: AsientoExport[]): string {
  const rows = [['Fecha', 'Asiento', 'Cuenta', 'Debe', 'Haber', 'Concepto', 'Tipo']]
  for (const asi of asientos) {
    for (const l of asi.lineas) {
      if (l.debe === 0 && l.haber === 0) continue
      rows.push([
        asi.fecha,
        String(asi.num_asiento),
        l.cuenta,
        String(l.debe),
        String(l.haber),
        (l.concepto ?? asi.concepto).replace(/;/g, ' '),
        asi.tipo,
      ])
    }
  }
  return rows.map(r => r.join(';')).join('\n')
}

/** Holded CSV */
export function exportarHolded(asientos: AsientoExport[]): string {
  const rows = [['date', 'account_code', 'debit', 'credit', 'description', 'document_number']]
  for (const asi of asientos) {
    for (const l of asi.lineas) {
      if (l.debe === 0 && l.haber === 0) continue
      rows.push([
        asi.fecha,
        l.cuenta,
        String(l.debe),
        String(l.haber),
        (l.concepto ?? asi.concepto).replace(/,/g, ' '),
        String(asi.num_asiento),
      ])
    }
  }
  return rows.map(r => r.join(',')).join('\n')
}

/** CSV genérico */
export function exportarCSV(asientos: AsientoExport[]): string {
  const rows = [['fecha', 'num_asiento', 'tipo', 'cuenta', 'nombre_cuenta', 'debe', 'haber', 'concepto']]
  for (const asi of asientos) {
    for (const l of asi.lineas) {
      if (l.debe === 0 && l.haber === 0) continue
      rows.push([
        asi.fecha,
        String(asi.num_asiento),
        asi.tipo,
        l.cuenta,
        (l.nombre_cuenta ?? '').replace(/;/g, ' '),
        String(l.debe),
        String(l.haber),
        (l.concepto ?? asi.concepto).replace(/;/g, ' '),
      ])
    }
  }
  return rows.map(r => r.join(';')).join('\n')
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function round2(n: number): number { return Math.round(n * 100) / 100 }
function sum(arr: number[]): number { return arr.reduce((a, b) => a + b, 0) }
function pad(s: string, len: number): string { return s.padStart(len, '0') }

/** Período trimestral → fechas */
export function fechasPeriodo(year: number, trimestre: 1 | 2 | 3 | 4): { desde: string; hasta: string; limite: string } {
  const meses = { 1: ['01-01', '03-31'], 2: ['04-01', '06-30'], 3: ['07-01', '09-30'], 4: ['10-01', '12-31'] }
  const [ini, fin] = meses[trimestre]
  const siguienteM = trimestre < 4 ? String(trimestre * 3 + 1).padStart(2, '0') : '01'
  const siguienteA = trimestre < 4 ? year : year + 1
  return {
    desde:  `${year}-${ini}`,
    hasta:  `${year}-${fin}`,
    limite: `${siguienteA}-${siguienteM}-20`,
  }
}

/** Trimestre actual */
export function trimestreActual(): { year: number; trimestre: 1 | 2 | 3 | 4 } {
  const m = new Date().getMonth() + 1
  const year = new Date().getFullYear()
  const trimestre = Math.ceil(m / 3) as 1 | 2 | 3 | 4
  return { year, trimestre }
}

/** Período string: '2026-Q1' */
export function periodoStr(year: number, trim: number): string { return `${year}-Q${trim}` }
