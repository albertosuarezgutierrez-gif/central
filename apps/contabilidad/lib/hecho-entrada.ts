// Validación del cuerpo del puerto `POST /api/hechos` → `HechoContable` de @central/module-contabilidad. PURO.
//
// La vertical dice QUÉ pasó; el núcleo decide CÓMO se asienta (spec §4.2). Por eso el puerto RECHAZA (400) cualquier campo de
// cuenta (`cuentaTercero`, `cuentaTesoreria`, `cuentaContrapartida`): una vertical que manda cuentas del PGC se salta las
// reglas de la empresa. Ignorarlos en silencio sería peor: la vertical creería que se han usado.
// Importes: enteros en céntimos (nada de floats). Campos desconocidos: 400 (un error de forma no se «arregla» aquí).
import type { HechoContable, LineaIva } from '@central/module-contabilidad'
import { esUuid } from './rls.ts'

export const TIPOS_HECHO = ['venta', 'compra', 'cobro', 'pago', 'nomina'] as const
export type TipoHecho = (typeof TIPOS_HECHO)[number]

const CAMPOS_DE_CUENTA = ['cuentaTercero', 'cuentaTesoreria', 'cuentaContrapartida']
const COMUNES = ['tipo', 'fecha', 'ref', 'concepto', 'documento']
const PERMITIDOS: Record<TipoHecho, string[]> = {
  venta: [...COMUNES, 'desglose', 'retencion'],
  compra: [...COMUNES, 'desglose', 'retencion'],
  cobro: [...COMUNES, 'importe'],
  pago: [...COMUNES, 'importe'],
  nomina: [...COMUNES, 'bruto', 'ssEmpresa', 'irpf', 'ssTrabajador', 'liquido'],
}
const MAX_LINEAS = 200

export type EntradaHecho = { empresaId: string; hecho: HechoContable }
export type ResultadoParseo = { ok: true; valor: EntradaHecho } | { ok: false; errores: string[] }

const esObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const esFecha = (s: unknown): s is string => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}
const cent = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const texto = (v: unknown, max: number) => typeof v === 'string' && v.trim() !== '' && v.length <= max

export function parsearEntradaHecho(cuerpo: unknown): ResultadoParseo {
  const errores: string[] = []
  if (!esObj(cuerpo)) return { ok: false, errores: ['el cuerpo debe ser un objeto JSON { empresaId, hecho }'] }
  for (const k of Object.keys(cuerpo)) if (k !== 'empresaId' && k !== 'hecho') errores.push(`campo no admitido: ${k}`)
  if (!esUuid(cuerpo.empresaId)) errores.push('empresaId debe ser un uuid')
  const h = cuerpo.hecho
  if (!esObj(h)) return { ok: false, errores: [...errores, 'falta hecho'] }
  const tipo = h.tipo as TipoHecho
  if (!TIPOS_HECHO.includes(tipo)) return { ok: false, errores: [...errores, `tipo de hecho no admitido: ${String(h.tipo)}`] }

  // Cuentas: nunca desde una vertical (ni en el hecho ni dentro de una línea).
  const lineas = Array.isArray(h.desglose) ? h.desglose : []
  const conCuenta = CAMPOS_DE_CUENTA.filter((c) => c in h || lineas.some((l) => esObj(l) && c in l))
  if (conCuenta.length) errores.push(`el puerto no admite cuentas contables (${conCuenta.join(', ')}): las decide la regla de la empresa`)
  for (const k of Object.keys(h)) {
    if (!PERMITIDOS[tipo].includes(k) && !CAMPOS_DE_CUENTA.includes(k)) errores.push(`campo no admitido en un hecho de ${tipo}: ${k}`)
  }

  if (!esFecha(h.fecha)) errores.push('fecha debe ser AAAA-MM-DD válida')
  if (!texto(h.ref, 120)) errores.push('ref obligatoria (máx. 120)')
  if (h.concepto !== undefined && !texto(h.concepto, 300)) errores.push('concepto no válido (máx. 300)')
  if (h.documento !== undefined && !texto(h.documento, 120)) errores.push('documento no válido (máx. 120)')

  if (tipo === 'venta' || tipo === 'compra') {
    if (!Array.isArray(h.desglose) || h.desglose.length === 0 || h.desglose.length > MAX_LINEAS) {
      errores.push(`desglose: entre 1 y ${MAX_LINEAS} líneas`)
    } else {
      h.desglose.forEach((l, i) => {
        if (!esObj(l)) { errores.push(`desglose[${i}] no es un objeto`); return }
        for (const k of Object.keys(l)) if (!['base', 'tipoIva', 'cuota'].includes(k) && !CAMPOS_DE_CUENTA.includes(k)) errores.push(`desglose[${i}]: campo no admitido ${k}`)
        if (!cent(l.base)) errores.push(`desglose[${i}].base: entero ≥ 0 en céntimos`)
        if (typeof l.tipoIva !== 'number' || !Number.isFinite(l.tipoIva) || l.tipoIva < 0 || l.tipoIva > 100) errores.push(`desglose[${i}].tipoIva: porcentaje 0-100`)
        if (l.cuota !== undefined && !cent(l.cuota)) errores.push(`desglose[${i}].cuota: entero ≥ 0 en céntimos`)
      })
    }
    if (h.retencion !== undefined && !cent(h.retencion)) errores.push('retencion: entero ≥ 0 en céntimos')
  } else if (tipo === 'cobro' || tipo === 'pago') {
    if (!cent(h.importe) || h.importe === 0) errores.push('importe: entero > 0 en céntimos')
  } else {
    for (const k of ['bruto', 'ssEmpresa', 'irpf', 'ssTrabajador', 'liquido']) if (!cent(h[k])) errores.push(`${k}: entero ≥ 0 en céntimos`)
  }

  if (errores.length) return { ok: false, errores }

  const base = {
    fecha: h.fecha as string,
    ref: (h.ref as string).trim(),
    ...(h.concepto !== undefined ? { concepto: (h.concepto as string).trim() } : {}),
    ...(h.documento !== undefined ? { documento: (h.documento as string).trim() } : {}),
  }
  let hecho: HechoContable
  if (tipo === 'venta' || tipo === 'compra') {
    const desglose: LineaIva[] = (h.desglose as Record<string, unknown>[]).map((l) => ({
      base: l.base as number, tipoIva: l.tipoIva as number, ...(l.cuota !== undefined ? { cuota: l.cuota as number } : {}),
    }))
    hecho = { tipo, ...base, desglose, ...(h.retencion !== undefined ? { retencion: h.retencion as number } : {}) }
  } else if (tipo === 'cobro' || tipo === 'pago') {
    hecho = { tipo, ...base, importe: h.importe as number }
  } else {
    hecho = {
      tipo, ...base, bruto: h.bruto as number, ssEmpresa: h.ssEmpresa as number, irpf: h.irpf as number,
      ssTrabajador: h.ssTrabajador as number, liquido: h.liquido as number,
    }
  }
  return { ok: true, valor: { empresaId: (cuerpo.empresaId as string).toLowerCase(), hecho } }
}
