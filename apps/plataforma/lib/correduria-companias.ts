// ÚNICO sitio del mapa compañía → código DGS → patrones de concepto bancario (puro, sin BD).
//
// Para qué: los ingresos de la correduría son CIMA (devengo, solo las compañías que CIMA trae) + banco de las
// compañías que CIMA NO trae (p. ej. Asisa). Una compañía que SÍ está en CIMA no se suma otra vez desde el banco
// (es el mismo dinero: comprobado con Generali, banco = CIMA × 0,85 mes a mes). Un pagador que no se reconoce NO se
// suma en silencio: se devuelve como «sin identificar» para el aviso de calidad del dato.
//
// «Está en CIMA» NO es una lista fija: lo dicen los códigos DGS que la vista `v_comisiones_mes` trae con cobros en
// el año (`codigosCima`). Así, si mañana CIMA empieza a traer Asisa, su banco deja de sumarse solo.
// Compañías y patrones: solo los vistos en `movimientos_bancarios` (destino `seguros`, 2026).

export type Compania = {
  id: string
  nombre: string
  /** Código DGS de CIMA; null = nunca visto en CIMA. */
  codigoDgs: string | null
  /** Nombre tal como lo escribe `movimientos_bancarios.compania_seguros` (o aparece en el concepto). */
  alias: RegExp
  /** Patrones del concepto/contraparte del banco cuando `compania_seguros` viene vacío. */
  conceptos: RegExp[]
}

const MESES = '(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)'

export const COMPANIAS: Compania[] = [
  { id: 'occident', nombre: 'Occident (Catalana Occidente)', codigoDgs: 'C0468', alias: /occident|catalana\s+occidente/i, conceptos: [/\bm00171\b/i, /\b8[/-]?92361\b/] },
  { id: 'mapfre', nombre: 'Mapfre', codigoDgs: 'C0058', alias: /mapfre/i, conceptos: [/liq\.?\s*comisiones\s*\d{6}/i] },
  { id: 'allianz', nombre: 'Allianz', codigoDgs: 'C0109', alias: /allianz/i, conceptos: [] },
  { id: 'generali', nombre: 'Generali', codigoDgs: 'C0072', alias: /generali/i, conceptos: [/generali/i] },
  { id: 'reale', nombre: 'Reale', codigoDgs: 'C0613', alias: /reale/i, conceptos: [/liquidaci[oó]n\s+de\s+comisiones/i] },
  { id: 'asisa', nombre: 'Asisa', codigoDgs: null, alias: /asisa/i, conceptos: [/\bm1454\b/i] },
  { id: 'caser', nombre: 'Caser', codigoDgs: null, alias: /caser/i, conceptos: [/fra-comis/i] },
  { id: 'pelayo', nombre: 'Pelayo', codigoDgs: null, alias: /pelayo/i, conceptos: [new RegExp(`comisiones\\s+${MESES}\\s+20\\d\\d`, 'i')] },
  { id: 'axa', nombre: 'AXA', codigoDgs: null, alias: /\baxa\b/i, conceptos: [] },
  { id: 'aegon', nombre: 'Aegon', codigoDgs: null, alias: /aegon/i, conceptos: [/remsaldo/i] },
  { id: 'mbi', nombre: 'MBI', codigoDgs: null, alias: /\bmbi\b/i, conceptos: [] },
]

export type MovimientoIngreso = {
  mes: string
  importe: number
  compania?: string | null
  concepto?: string | null
  contraparte?: string | null
}

export type ClasificacionIngreso =
  | { tipo: 'cima'; compania: Compania }
  | { tipo: 'fuera_cima'; compania: Compania }
  | { tipo: 'sin_identificar'; compania: null }

/** Compañía de un ingreso bancario: primero la columna `compania_seguros`, si no, patrones del concepto. */
export function companiaDeMovimiento(m: Pick<MovimientoIngreso, 'compania' | 'concepto' | 'contraparte'>): Compania | null {
  const col = (m.compania ?? '').trim()
  if (col) {
    const c = COMPANIAS.find(x => x.alias.test(col))
    if (c) return c
  }
  const texto = `${m.concepto ?? ''} ${m.contraparte ?? ''}`
  return COMPANIAS.find(c => c.conceptos.some(p => p.test(texto))) ?? null
}

export function clasificarIngresoBanco(m: Pick<MovimientoIngreso, 'compania' | 'concepto' | 'contraparte'>, codigosCima: ReadonlySet<string>): ClasificacionIngreso {
  const c = companiaDeMovimiento(m)
  if (!c) return { tipo: 'sin_identificar', compania: null }
  return c.codigoDgs != null && codigosCima.has(c.codigoDgs) ? { tipo: 'cima', compania: c } : { tipo: 'fuera_cima', compania: c }
}

export type IngresoSinIdentificar = { mes: string; pagador: string; importe: number }

export type RepartoIngresosBanco = {
  /** Banco (NETO de caja) de compañías que CIMA no trae: lo que se SUMA. */
  fueraCimaPorMes: Record<string, number>
  fueraCimaPorCompania: Record<string, number>
  /** Banco de compañías que CIMA sí trae: NO se suma (ya está en CIMA). */
  excluidoCimaTotal: number
  /** Pagadores no reconocidos: NO se suman; van al aviso de calidad. */
  sinIdentificar: IngresoSinIdentificar[]
}

const r2 = (n: number) => Math.round(n * 100) / 100

function pagadorLegible(m: MovimientoIngreso): string {
  const base = (m.concepto || m.contraparte || 'sin concepto').replace(/^.*recibida\s*(\/\/|·)\s*/i, '').replace(/\s+/g, ' ').trim()
  return base.slice(0, 60) || 'sin concepto'
}

export function repartirIngresosBanco(movs: MovimientoIngreso[], codigosCima: ReadonlySet<string>): RepartoIngresosBanco {
  const out: RepartoIngresosBanco = { fueraCimaPorMes: {}, fueraCimaPorCompania: {}, excluidoCimaTotal: 0, sinIdentificar: [] }
  for (const m of movs) {
    const k = clasificarIngresoBanco(m, codigosCima)
    if (k.tipo === 'cima') out.excluidoCimaTotal = r2(out.excluidoCimaTotal + m.importe)
    else if (k.tipo === 'fuera_cima') {
      out.fueraCimaPorMes[m.mes] = r2((out.fueraCimaPorMes[m.mes] ?? 0) + m.importe)
      out.fueraCimaPorCompania[k.compania.nombre] = r2((out.fueraCimaPorCompania[k.compania.nombre] ?? 0) + m.importe)
    } else out.sinIdentificar.push({ mes: m.mes, pagador: pagadorLegible(m), importe: r2(m.importe) })
  }
  return out
}
