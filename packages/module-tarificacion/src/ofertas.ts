// Validación PURA de lo que el worker devuelve, y su forma para el modelo de ofertas del PR #4305
// (`OfertaNormalizada.garantias` de module-seguros/comparar-ofertas: clave → {estado, capital,
// limite, franquicia, evidencia}). El worker es código nuestro, pero corre en otra máquina y
// rasca HTML ajeno: su salida se valida como si viniera de fuera.

import type { DesglosePrima, CoberturaOferta, Fraccionamiento, FranquiciaOferta, OfertaNormalizada } from './tipos.ts'

export type ValidacionOfertas = { ok: true; ofertas: OfertaNormalizada[] } | { ok: false; errores: string[] }

const FRACCIONAMIENTOS: readonly Fraccionamiento[] = ['anual', 'semestral', 'trimestral', 'mensual']
const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const fecha = (v: unknown): string | null => {
  const t = txt(v)
  return t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null
}

function desglose(v: unknown): { anual: DesglosePrima; sucesivos: DesglosePrima } | null {
  const d = obj(v)
  const periodo = (x: unknown): DesglosePrima | null => {
    const o = obj(x)
    return o ? { primaNetaEur: num(o.primaNetaEur), impuestosEur: num(o.impuestosEur), primaTotalEur: num(o.primaTotalEur) } : null
  }
  const anual = periodo(d?.anual)
  const sucesivos = periodo(d?.sucesivos)
  return anual && sucesivos ? { anual, sucesivos } : null
}

function cobertura(v: unknown): CoberturaOferta | null {
  const c = obj(v)
  const literal = txt(c?.literal)
  if (!c || !literal) return null
  const estado = c.estado === 'incluida' || c.estado === 'excluida' ? c.estado : null
  return { clave: txt(c.clave) ?? literal, literal, estado, capital: num(c.capital), limite: num(c.limite), franquicia: num(c.franquicia) }
}

function franquicia(v: unknown): FranquiciaOferta | null {
  const f = obj(v)
  const ambito = txt(f?.ambito)
  if (!f || !ambito) return null
  const importeEur = num(f.importeEur)
  const literal = txt(f.literal)
  if (importeEur === null && literal === null) return null
  return { ambito, importeEur, literal }
}

/**
 * `numPdfs` = cuántos PDFs llegan en el POST: una `pdf.indice` fuera de rango es un error (la
 * oferta diría que tiene PDF y no lo tendría).
 */
export function validarOfertas(entrada: unknown, numPdfs: number): ValidacionOfertas {
  if (!Array.isArray(entrada)) return { ok: false, errores: ['ofertas tiene que ser una lista'] }
  if (entrada.length === 0) return { ok: false, errores: ['un resultado ok sin ofertas no es un resultado: usa error'] }
  if (entrada.length > 20) return { ok: false, errores: ['más de 20 ofertas en un trabajo: sospechoso'] }
  const errores: string[] = []
  const ofertas: OfertaNormalizada[] = []
  entrada.forEach((v, i) => {
    const o = obj(v)
    if (!o) return void errores.push(`ofertas[${i}]: no es un objeto`)
    const compania = txt(o.compania)
    const producto = txt(o.producto)
    const prima = num(o.primaAnualEur)
    if (!compania) errores.push(`ofertas[${i}].compania falta`)
    if (!producto) errores.push(`ofertas[${i}].producto falta`)
    if (prima === null || prima <= 0) errores.push(`ofertas[${i}].primaAnualEur tiene que ser > 0 (una oferta sin prima no es una oferta)`)
    const frac = o.fraccionamiento
    if (frac !== undefined && frac !== null && !FRACCIONAMIENTOS.includes(frac as Fraccionamiento)) {
      errores.push(`ofertas[${i}].fraccionamiento «${String(frac)}» desconocido`)
    }
    let pdf: OfertaNormalizada['pdf'] = null
    const p = obj(o.pdf)
    if (p) {
      const indice = p.indice
      if (typeof indice !== 'number' || !Number.isInteger(indice) || indice < 0 || indice >= numPdfs) {
        errores.push(`ofertas[${i}].pdf.indice fuera de rango (llegan ${numPdfs} PDF)`)
      } else pdf = { indice, nombre: txt(p.nombre) ?? `oferta-${i + 1}.pdf` }
    }
    if (!compania || !producto || prima === null || prima <= 0) return
    ofertas.push({
      compania,
      producto,
      primaAnualEur: Math.round(prima * 100) / 100,
      primaNetaEur: num(o.primaNetaEur),
      fraccionamiento: FRACCIONAMIENTOS.includes(frac as Fraccionamiento) ? (frac as Fraccionamiento) : null,
      importeReciboEur: num(o.importeReciboEur),
      coberturas: Array.isArray(o.coberturas) ? o.coberturas.map(cobertura).filter((c): c is CoberturaOferta => c !== null) : [],
      franquicias: Array.isArray(o.franquicias) ? o.franquicias.map(franquicia).filter((f): f is FranquiciaOferta => f !== null) : [],
      validaHasta: fecha(o.validaHasta),
      referenciaPortal: txt(o.referenciaPortal),
      pdf,
      desglose: desglose(o.desglose),
      avisos: Array.isArray(o.avisos) ? o.avisos.map(txt).filter((a): a is string => a !== null) : [],
    })
  })
  return errores.length ? { ok: false, errores } : { ok: true, ofertas }
}

/** La franquicia GENERAL si la oferta la declara con importe; `null` = no la declara (≠ «sin franquicia»). */
export function franquiciaGeneral(o: OfertaNormalizada): number | null {
  const f = o.franquicias.find((x) => x.ambito.toLowerCase() === 'general')
  return f?.importeEur ?? null
}

export type ValorGarantiaCompatible = {
  estado: 'incluida' | 'excluida' | null
  capital: number | null
  limite: number | null
  franquicia: number | null
  evidencia: { pagina: number | null; texto: string } | null
}

/**
 * Las coberturas como `Record<clave, ValorGarantia>` (forma de `oportunidad_oferta.garantias` del
 * PR #4305). Si dos coberturas comparten clave, gana la primera y la otra entra por su literal.
 */
export function garantiasComoRegistro(o: OfertaNormalizada): Record<string, ValorGarantiaCompatible> {
  const out: Record<string, ValorGarantiaCompatible> = {}
  for (const c of o.coberturas) {
    const clave = out[c.clave] ? c.literal : c.clave
    if (out[clave]) continue
    out[clave] = {
      estado: c.estado,
      capital: c.capital,
      limite: c.limite,
      franquicia: c.franquicia,
      evidencia: { pagina: null, texto: `Portal ${o.compania}: ${c.literal}` },
    }
  }
  return out
}
