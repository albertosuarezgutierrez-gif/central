// Lo que la IA dice haber leído de una OFERTA de compañía (o de la póliza actual), normalizado.
// PURO (zod + @central/module-seguros): lo usa `extraer-oferta.ts` y lo cubre su test.
//
// Reglas, las de la casa:
//   · `null` = NO FIGURA en el documento. Nunca 0, nunca `[]` por defecto, nunca «N/A».
//     Un 0 en una prima o en un capital es un «no lo sé» disfrazado: se anula.
//   · Una garantía que no casa con la taxonomía del ramo (`normalizarGarantia`) NO se fuerza a una
//     clave: va como EXTRA con su texto literal de la compañía.
//   · La evidencia (página + texto literal) viaja con cada garantía; si la cita no aparece en el
//     texto del PDF, o una cifra no aparece en él, se MARCA (no se borra): lo decide el corredor.
//   · Un JSON que no parsea o no tiene la forma es «no se ha podido leer», nunca una oferta vacía.

import { z } from 'zod'
import { normalizarGarantia, normalizarTexto, type OfertaNormalizada, type RamoOferta, type ValorGarantia } from '@central/module-seguros'

const MAX_GARANTIAS = 80
const MAX_TEXTO_EVIDENCIA = 300
const MAX_NOMBRE = 120

/** Un número tal cual lo pueda mandar la IA: 1234.5, "1.234,50", "1.234,50 €". `null` si no es uno. */
export function numeroLeido(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  let s = v.replace(/[€\s]/g, '').replace(/eur(os)?$/i, '')
  if (s === '') return null
  // Formato español (1.234,56) o con coma decimal sola (1234,56).
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^-?\d+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Importe positivo o `null`. 0 y negativos = no figura (un 0 es un hueco disfrazado). */
function importe(v: unknown): number | null {
  const n = numeroLeido(v)
  return n !== null && n > 0 ? Math.round(n * 100) / 100 : null
}

const texto = (max: number) =>
  z.unknown().transform((v) => {
    if (typeof v !== 'string') return null
    const t = v.replace(/\s+/g, ' ').trim()
    if (t === '' || /^(n\/?a|no consta|desconocid[oa]|null|-+|sin datos)$/i.test(t)) return null
    return t.slice(0, max)
  })

const ESQUEMA_GARANTIA = z.object({
  nombre: texto(MAX_NOMBRE),
  estado: z.unknown().transform((v) => (v === 'incluida' || v === 'excluida' ? v : null)),
  capital: z.unknown().transform(importe),
  limite: z.unknown().transform(importe),
  franquicia: z.unknown().transform((v) => {
    const n = numeroLeido(v)
    return n !== null && n >= 0 ? Math.round(n * 100) / 100 : null
  }),
  pagina: z.unknown().transform((v) => {
    const n = numeroLeido(v)
    return n !== null && Number.isInteger(n) && n >= 1 ? n : null
  }),
  texto: texto(MAX_TEXTO_EVIDENCIA),
})

const ESQUEMA_OFERTA = z.object({
  compania: texto(MAX_NOMBRE),
  producto: texto(MAX_NOMBRE),
  primaNeta: z.unknown().transform(importe),
  primaTotal: z.unknown().transform(importe),
  franquiciaGeneral: z.unknown().transform((v) => {
    const n = numeroLeido(v)
    return n !== null && n > 0 ? Math.round(n * 100) / 100 : null
  }),
  formaPago: texto(60),
  fechaEfecto: z.unknown().transform((v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null)),
  validezHasta: z.unknown().transform((v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null)),
  otrasModalidades: z.unknown().transform((v) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim().slice(0, MAX_NOMBRE)).slice(0, 10) : [],
  ),
  garantias: z.array(z.unknown()).max(400),
})

export type OfertaLeida = {
  compania: string | null
  producto: string | null
  primaNeta: number | null
  primaTotal: number | null
  /** Formato `OfertaNormalizada.garantias`: clave canónica o texto literal (extra) → valor con evidencia. */
  garantias: Record<string, ValorGarantia>
  /** Lo demás: va a `oportunidad_oferta.datos_extra`. Sin PII. */
  extra: {
    franquiciaGeneral: number | null
    formaPago: string | null
    fechaEfecto: string | null
    validezHasta: string | null
    otrasModalidades: string[]
    /** clave → nombre LITERAL de la compañía (lo que se enseña al revisar). */
    literales: Record<string, string>
    /** Claves cuya cita no aparece en el texto del PDF: el corredor la mira con lupa. */
    evidenciaNoEncontrada: string[]
    /** Cifras leídas que NO aparecen escritas en el PDF (`campo` o `clave.campo`). */
    cifrasNoEncontradas: string[]
    /** Garantías que la IA devolvió sin nombre (no se pueden revisar: se descartan y se cuentan). */
    descartadasSinNombre: number
  }
}

export type ResultadoNormalizar = { ok: true; oferta: OfertaLeida } | { ok: false; motivo: string }

/** Texto comparable para buscar citas y cifras: sin tildes, minúsculas y espacios simples. */
function plano(s: string): string {
  return normalizarTexto(s).replace(/\s+/g, ' ')
}

/** Formas en que una cifra puede estar escrita en un PDF español. */
export function formasCifra(n: number): string[] {
  const entero = Number.isInteger(n)
  const es2 = n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })
  const es2sin = n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })
  const formas = [es2, es2sin]
  if (entero) {
    formas.push(n.toLocaleString('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' }), String(n))
  }
  formas.push(n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  return [...new Set(formas)]
}

/** ¿Aparece la cifra escrita en el documento? Se compara sobre el texto sin espacios entre dígitos. */
export function cifraEnTexto(n: number, textoDocumento: string): boolean {
  const t = textoDocumento.replace(/(\d)\s+(?=[\d.,])/g, '$1')
  return formasCifra(n).some((f) => {
    const i = t.indexOf(f)
    if (i < 0) return false
    // Que no sea un trozo de otra cifra más larga («200» dentro de «1.200»).
    const antes = t[i - 1] ?? ''
    const despues = t[i + f.length] ?? ''
    return !/[\d.,]/.test(antes) && !/\d/.test(despues)
  })
}

/**
 * La salida de la IA (ya parseada como JSON) → oferta normalizada. `textoDocumento` es el texto del
 * PDF que vio la IA (para verificar citas y cifras); `null` = no se verifica (no se marca nada).
 */
export function normalizarOfertaLeida(bruto: unknown, ramo: RamoOferta, textoDocumento: string | null): ResultadoNormalizar {
  const r = ESQUEMA_OFERTA.safeParse(bruto)
  if (!r.success) return { ok: false, motivo: 'La lectura de la IA no tiene la forma esperada.' }
  const o = r.data
  const docPlano = textoDocumento ? plano(textoDocumento) : null

  const garantias: Record<string, ValorGarantia> = {}
  const literales: Record<string, string> = {}
  const evidenciaNoEncontrada: string[] = []
  const cifrasNoEncontradas: string[] = []
  let descartadasSinNombre = 0

  for (const crudo of o.garantias.slice(0, MAX_GARANTIAS)) {
    const g = ESQUEMA_GARANTIA.safeParse(crudo && typeof crudo === 'object' ? crudo : {})
    const nombre = g.success ? g.data.nombre : null
    if (!g.success || nombre === null) {
      descartadasSinNombre++
      continue
    }
    const v = g.data
    // Sin estado ni cifra no hay nada que comparar: la garantía no aporta (y no se inventa «incluida»).
    // La franquicia 0 solo vale con una cita que la respalde («sin franquicia»): si no, es un hueco.
    const franquicia = v.franquicia === 0 && v.texto === null ? null : v.franquicia
    if (v.estado === null && v.capital === null && v.limite === null && franquicia === null) continue
    // Clave canónica si casa; si no (o si ya la ocupa otra garantía), el nombre literal como extra.
    const canonica = normalizarGarantia(ramo, nombre)
    let clave: string = canonica !== null && !(canonica in garantias) ? canonica : nombre
    if (clave in garantias) {
      let i = 2
      while (`${nombre} (${i})` in garantias) i++
      clave = `${nombre} (${i})`
    }
    garantias[clave] = {
      estado: v.estado,
      capital: v.capital,
      limite: v.limite,
      franquicia,
      evidencia: v.texto !== null || v.pagina !== null ? { pagina: v.pagina, texto: v.texto ?? '' } : null,
    }
    literales[clave] = nombre
    if (docPlano !== null && textoDocumento !== null) {
      if (v.texto !== null && !docPlano.includes(plano(v.texto))) evidenciaNoEncontrada.push(clave)
      for (const campo of ['capital', 'limite', 'franquicia'] as const) {
        const n = garantias[clave][campo]
        if (n !== null && n > 0 && !cifraEnTexto(n, textoDocumento)) cifrasNoEncontradas.push(`${clave}.${campo}`)
      }
    }
  }
  if (textoDocumento !== null) {
    for (const campo of ['primaNeta', 'primaTotal', 'franquiciaGeneral'] as const) {
      const n = o[campo]
      if (n !== null && !cifraEnTexto(n, textoDocumento)) cifrasNoEncontradas.push(campo)
    }
  }

  return {
    ok: true,
    oferta: {
      compania: o.compania,
      producto: o.producto,
      primaNeta: o.primaNeta,
      primaTotal: o.primaTotal,
      garantias,
      extra: {
        franquiciaGeneral: o.franquiciaGeneral,
        formaPago: o.formaPago,
        fechaEfecto: o.fechaEfecto,
        validezHasta: o.validezHasta,
        otrasModalidades: o.otrasModalidades,
        literales,
        evidenciaNoEncontrada,
        cifrasNoEncontradas,
        descartadasSinNombre,
      },
    },
  }
}

/** Un `numeric` tal cual lo devuelve la BD (número, string con punto decimal o Decimal). */
export function importeBd(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(String(v))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

/** Una fila de `oportunidad_oferta` → la forma que compara `compararOfertas`. */
export function ofertaNormalizadaDeFila(f: {
  id: string
  rol: string
  compania: string | null
  producto: string | null
  primaNeta: unknown
  primaTotal: unknown
  garantias: unknown
}): OfertaNormalizada {
  return {
    id: f.id,
    rol: f.rol === 'actual' ? 'actual' : 'oferta',
    compania: f.compania ?? 'Compañía sin leer',
    producto: f.producto,
    primaNeta: importeBd(f.primaNeta),
    primaTotal: importeBd(f.primaTotal),
    garantias: garantiasDeJson(f.garantias),
  }
}

/** El jsonb guardado → garantías. Lo que no tiene la forma se ignora (no se inventa un valor). */
export function garantiasDeJson(v: unknown): Record<string, ValorGarantia> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, ValorGarantia> = {}
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) continue
    const g = x as Record<string, unknown>
    const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : null)
    const ev = g.evidencia && typeof g.evidencia === 'object' && !Array.isArray(g.evidencia) ? (g.evidencia as Record<string, unknown>) : null
    out[k] = {
      estado: g.estado === 'incluida' || g.estado === 'excluida' ? g.estado : null,
      capital: num(g.capital),
      limite: num(g.limite),
      franquicia: num(g.franquicia),
      evidencia: ev ? { pagina: typeof ev.pagina === 'number' && Number.isInteger(ev.pagina) ? ev.pagina : null, texto: typeof ev.texto === 'string' ? ev.texto : '' } : null,
    }
  }
  return out
}
