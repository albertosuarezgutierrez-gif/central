// LECTOR .xlsx PROPIO (27/10/2026, volcado inicial) — sin librería de hojas de cálculo. Sin prisma ni sesión.
//
// Por qué propio: la librería anterior se quitó por un CVE (prototype pollution / ReDoS al parsear) y en un portal PÚBLICO
// no se admite otra cuyo parser no controlamos. Un .xlsx es un ZIP con XML; aquí se lee SOLO lo imprescindible, con
// node:zlib (parte de Node, sin dependencia nueva) y con topes en cada paso:
//   · ZIP: tamaño del fichero ya acotado por el llamador; directorio central con ≤ MAX_ENTRADAS entradas; sin ZIP64, sin
//     entradas cifradas, solo «stored» o «deflate»; cada entrada que se abre, ≤ MAX_XML_BYTES descomprimida (el inflado
//     se corta en ese tope: una bomba zip no pasa de ahí) y ≤ MAX_TOTAL_BYTES entre todas.
//   · XML: se rechaza cualquier `<!DOCTYPE`/`<!ENTITY` (sin entidades externas ni «billion laughs»); solo se decodifican
//     las 5 entidades predefinidas y las numéricas. No hay parser genérico: se buscan `<row>`, `<c>`, `<v>`, `<t>`.
//   · Solo la PRIMERA hoja del libro. Fórmulas: NUNCA se evalúan; se toma el último valor guardado (`<v>`); sin él, vacío.
//     Macros (`vbaProject.bin`), vínculos externos, objetos incrustados: ni se abren.
//   · ≤ MAX_FILAS_IMPORTACION filas con datos (+ margen para la cabecera) y columnas por encima de MAX_COLUMNAS_LEIDAS se
//     ignoran (el organizador de la hoja dice «demasiadas columnas» si la cabecera pasa del tope).
//   · Fechas: solo si la celda tiene un formato de fecha (estilos del libro) se convierte el número de serie a `YYYY-MM-DD`.
import { inflateRawSync } from 'node:zlib'
import { MAX_COLUMNAS_IMPORTACION, MAX_FILAS_IMPORTACION } from '@central/module-patrimonio'

export const MAX_ENTRADAS = 2000
export const MAX_XML_BYTES = 16 * 1024 * 1024
export const MAX_TOTAL_BYTES = 40 * 1024 * 1024
const MAX_COLUMNAS_LEIDAS = MAX_COLUMNAS_IMPORTACION + 1
const MAX_FILA_INDICE = MAX_FILAS_IMPORTACION + 50
const MAX_CADENAS = 200_000
const MAX_CELDA = 500

export type CeldaXlsx = string | number | null
export type ResultadoXlsx = { ok: true; filas: CeldaXlsx[][] } | { ok: false; motivo: 'ilegible' | 'demasiado_grande' | 'demasiadas_filas' }

type Entrada = { nombre: string; metodo: number; comprimido: number; descomprimido: number; offset: number; cifrada: boolean }

class Ilegible extends Error {}
class Grande extends Error {}
class Filas extends Error {}

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8)
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0

function directorio(b: Uint8Array): Map<string, Entrada> {
  // Fin del directorio central: firma 0x06054b50 en los últimos 64 KiB + 22.
  let eocd = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) {
    if (u32(b, i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Ilegible()
  const total = u16(b, eocd + 10)
  const inicio = u32(b, eocd + 16)
  if (total === 0xffff || inicio === 0xffffffff) throw new Ilegible() // ZIP64
  if (total > MAX_ENTRADAS) throw new Ilegible()
  const out = new Map<string, Entrada>()
  let p = inicio
  for (let k = 0; k < total; k++) {
    if (p + 46 > b.length || u32(b, p) !== 0x02014b50) throw new Ilegible()
    const flags = u16(b, p + 8)
    const metodo = u16(b, p + 10)
    const comprimido = u32(b, p + 20)
    const descomprimido = u32(b, p + 24)
    const ln = u16(b, p + 28), le = u16(b, p + 30), lc = u16(b, p + 32)
    const offset = u32(b, p + 42)
    if (p + 46 + ln > b.length) throw new Ilegible()
    const nombre = Buffer.from(b.subarray(p + 46, p + 46 + ln)).toString('utf8')
    out.set(nombre, { nombre, metodo, comprimido, descomprimido, offset, cifrada: (flags & 1) === 1 })
    p += 46 + ln + le + lc
  }
  return out
}

function abrir(b: Uint8Array, e: Entrada, presupuesto: { usado: number }): string {
  if (e.cifrada) throw new Ilegible()
  if (e.descomprimido > MAX_XML_BYTES || e.comprimido > b.length) throw new Grande()
  const o = e.offset
  if (o + 30 > b.length || u32(b, o) !== 0x04034b50) throw new Ilegible()
  const datos = o + 30 + u16(b, o + 26) + u16(b, o + 28)
  if (datos + e.comprimido > b.length) throw new Ilegible()
  const crudo = b.subarray(datos, datos + e.comprimido)
  let salida: Buffer
  if (e.metodo === 0) salida = Buffer.from(crudo)
  else if (e.metodo === 8) {
    try {
      // El tope corta el inflado: el tamaño declarado en la cabecera no se cree.
      salida = inflateRawSync(crudo, { maxOutputLength: MAX_XML_BYTES })
    } catch (err) {
      if (err instanceof RangeError || (err as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') throw new Grande()
      throw new Ilegible()
    }
  } else throw new Ilegible()
  presupuesto.usado += salida.length
  if (presupuesto.usado > MAX_TOTAL_BYTES) throw new Grande()
  const xml = salida.toString('utf8')
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Ilegible()
  return xml
}

export function decodificarXml(s: string): string {
  return s.replace(/&(lt|gt|amp|quot|apos|#\d{1,7}|#x[0-9a-f]{1,6});/gi, (_, e: string) => {
    const l = e.toLowerCase()
    if (l === 'lt') return '<'
    if (l === 'gt') return '>'
    if (l === 'amp') return '&'
    if (l === 'quot') return '"'
    if (l === 'apos') return "'"
    const n = l.startsWith('#x') ? parseInt(l.slice(2), 16) : parseInt(l.slice(1), 10)
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''
  })
}

const atributo = (attrs: string, nombre: string): string | null => {
  const m = new RegExp(`(?:^|\\s)${nombre}="([^"]*)"`).exec(attrs)
  return m ? decodificarXml(m[1]) : null
}

/** Texto de un `<si>`/`<is>`: todos sus `<t>`, sin la fonética (`<rPh>`). */
function textoRico(xml: string): string {
  const sin = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')
  let t = ''
  for (const m of sin.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g)) t += m[1] === undefined ? '' : decodificarXml(m[1])
  return t
}

/** Formatos de fecha del libro: ids internos 14–22 y 45–47, y los propios cuyo código lleva d/m/y fuera de comillas. */
function estilosFecha(styles: string | null): boolean[] {
  if (styles === null) return []
  const propios = new Map<number, string>()
  for (const m of styles.matchAll(/<numFmt\b([^>]*)\/?>/g)) {
    const id = atributo(m[1], 'numFmtId'), code = atributo(m[1], 'formatCode')
    if (id !== null && code !== null) propios.set(Number(id), code)
  }
  const esFecha = (id: number) => {
    if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47)) return true
    const c = propios.get(id)
    if (!c) return false
    const limpio = c.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '')
    return /[dmy]/i.test(limpio) && !/^[#0.,%\s]*$/.test(limpio)
  }
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)
  if (!xfs) return []
  return [...xfs[1].matchAll(/<xf\b([^>]*)\/?>/g)].map((m) => esFecha(Number(atributo(m[1], 'numFmtId') ?? '0')))
}

/** Columna de «B12» → 1. */
function columnaDe(ref: string | null): number | null {
  if (ref === null) return null
  const m = /^([A-Z]{1,3})\d+$/.exec(ref)
  if (!m) return null
  let n = 0
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function serieAIso(n: number): string | null {
  if (!Number.isFinite(n) || n < 1 || n > 2_958_465) return null
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86_400_000)
  return d.toISOString().slice(0, 10)
}

/** Ruta de la primera hoja según el libro y sus relaciones. Solo dentro de `xl/worksheets/`. */
function rutaPrimeraHoja(workbook: string, rels: string): string | null {
  const hoja = /<sheet\b([^>]*)\/?>/.exec(workbook)
  if (!hoja) return null
  const rid = atributo(hoja[1], 'r:id')
  if (rid === null) return null
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    if (atributo(m[1], 'Id') !== rid) continue
    const t = atributo(m[1], 'Target')
    if (t === null || atributo(m[1], 'TargetMode') === 'External') return null
    const ruta = t.startsWith('/') ? t.slice(1) : `xl/${t}`
    return /^xl\/worksheets\/[A-Za-z0-9_-]+\.xml$/.test(ruta) ? ruta : null
  }
  return null
}

export function leerXlsx(bytes: Uint8Array): ResultadoXlsx {
  try {
    const dir = directorio(bytes)
    const presupuesto = { usado: 0 }
    const leer = (n: string, obligatorio: boolean): string | null => {
      const e = dir.get(n)
      if (!e) { if (obligatorio) throw new Ilegible(); return null }
      return abrir(bytes, e, presupuesto)
    }
    const ruta = rutaPrimeraHoja(leer('xl/workbook.xml', true)!, leer('xl/_rels/workbook.xml.rels', true)!)
    if (ruta === null) throw new Ilegible()
    const compartidas: string[] = []
    const sst = leer('xl/sharedStrings.xml', false)
    if (sst !== null) {
      for (const m of sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)) {
        if (compartidas.length >= MAX_CADENAS) throw new Grande()
        compartidas.push(m[1] === undefined ? '' : textoRico(m[1]).slice(0, MAX_CELDA))
      }
    }
    const fechas = estilosFecha(leer('xl/styles.xml', false))
    const hoja = leer(ruta, true)!

    const filas: CeldaXlsx[][] = []
    let siguiente = 1
    for (const r of hoja.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const rAttr = atributo(r[1], 'r')
      const n = rAttr !== null && /^\d+$/.test(rAttr) ? Number(rAttr) : siguiente
      siguiente = n + 1
      if (r[2] === undefined) continue
      const fila: CeldaXlsx[] = []
      let col = 0
      let conDato = false
      for (const c of r[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const k = columnaDe(atributo(c[1], 'r')) ?? col
        col = k + 1
        if (k >= MAX_COLUMNAS_LEIDAS || c[2] === undefined) continue
        const t = atributo(c[1], 't')
        const s = Number(atributo(c[1], 's') ?? '0')
        const v = /<v>([\s\S]*?)<\/v>/.exec(c[2])
        let valor: CeldaXlsx = null
        if (t === 'inlineStr') {
          const is = /<is>([\s\S]*?)<\/is>/.exec(c[2])
          valor = is ? textoRico(is[1]) : null
        } else if (v === null) valor = null // fórmula sin valor guardado: no se calcula
        else if (t === 's') valor = compartidas[Number(v[1])] ?? null
        else if (t === 'str') valor = decodificarXml(v[1])
        else if (t === 'b') valor = v[1] === '1' ? 'sí' : 'no'
        else if (t === 'e') valor = null
        else {
          const num = Number(v[1])
          valor = !Number.isFinite(num) ? null : fechas[s] ? serieAIso(num) : num
        }
        if (typeof valor === 'string') valor = valor.slice(0, MAX_CELDA)
        if (valor !== null && valor !== '') conDato = true
        while (fila.length < k) fila.push(null)
        fila[k] = valor
      }
      if (!conDato) continue
      if (n > MAX_FILA_INDICE) throw new Filas()
      while (filas.length < n - 1) filas.push([])
      filas[n - 1] = fila
    }
    return { ok: true, filas }
  } catch (e) {
    if (e instanceof Grande) return { ok: false, motivo: 'demasiado_grande' }
    if (e instanceof Filas) return { ok: false, motivo: 'demasiadas_filas' }
    return { ok: false, motivo: 'ilegible' }
  }
}
