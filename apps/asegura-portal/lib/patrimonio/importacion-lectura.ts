// IMPORTAR PATRIMONIO (P18, 26/10/2026) — lee un .csv EN MEMORIA y devuelve cabeceras + filas. Sin prisma ni sesión.
//
// Lo que entra es un fichero de un desconocido: tope de tamaño ANTES de abrirlo, TEXTO CSV o .xlsx (27/10/2026: con el
// lector PROPIO `xlsx-lectura.ts`, sin librería de hojas —la anterior se quitó por un CVE—, con topes de zip, XML, filas y
// columnas; el .xls antiguo (OLE) sigue fuera), a lo sumo `MAX_FILAS_IMPORTACION` filas y `MAX_COLUMNAS_IMPORTACION`
// columnas. El fichero no se guarda: solo su hash.
// Las columnas con datos personales (NIF, correo, teléfono, IBAN, inquilino) se TIRAN aquí, antes de que nada las toque.
// El VOLCADO (`leerHojaVolcado`) conserva el NOMBRE del inquilino y tira solo los identificadores (`esColumnaIdentificador`).
import { createHash } from 'node:crypto'
import {
  MAX_BYTES_IMPORTACION,
  MAX_COLUMNAS_IMPORTACION,
  MAX_FILAS_IMPORTACION,
  esColumnaIdentificador,
  esColumnaSensible,
  parsearCsv,
  type Celda,
} from '@central/module-patrimonio'

import { leerXlsx } from './xlsx-lectura.ts'

export type Hoja = {
  cabeceras: string[]
  filas: Celda[][]
  /** Cuántas columnas con datos personales se descartaron (se avisa a la persona). */
  descartadas: number
}
export type MotivoLectura = 'vacio' | 'demasiado_grande' | 'formato' | 'ilegible' | 'sin_filas' | 'demasiadas_filas' | 'demasiadas_columnas' | 'sin_cabeceras'
export type ResultadoLectura = { ok: true; hoja: Hoja; hash: string } | { ok: false; motivo: MotivoLectura }

const ES_ZIP = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05) && (b[3] === 0x04 || b[3] === 0x06)
const ES_OLE = (b: Uint8Array) => b.length > 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0

export const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')

function decodificar(b: Uint8Array): string | null {
  if (b.includes(0)) return null // binario, no es texto
  const utf8 = new TextDecoder('utf-8').decode(b)
  if (!utf8.includes('�')) return utf8
  // Excel en español guarda CSV en Windows-1252.
  return new TextDecoder('windows-1252').decode(b)
}

/** Fecha de Excel (instante) → `YYYY-MM-DD` del día de calendario (el redondeo a medio día evita el desfase de segundos). */
function aIso(d: Date): string {
  const m = new Date(d.getTime() + 12 * 3600_000)
  return `${String(m.getUTCFullYear()).padStart(4, '0')}-${String(m.getUTCMonth() + 1).padStart(2, '0')}-${String(m.getUTCDate()).padStart(2, '0')}`
}

function limpiar(c: unknown): Celda {
  if (c === null || c === undefined) return null
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? null : aIso(c)
  if (typeof c === 'number') return Number.isFinite(c) ? c : null
  if (typeof c === 'boolean') return c ? 'sí' : 'no'
  const t = String(c).trim()
  return t === '' ? null : t.slice(0, 500)
}

export function organizarHoja(
  bruta: readonly (readonly unknown[])[],
  esSensible: (cabecera: string) => boolean = esColumnaSensible,
): { ok: true; hoja: Hoja } | { ok: false; motivo: MotivoLectura } {
  const filas = bruta.map((f) => f.map(limpiar))
  while (filas.length > 0 && filas[filas.length - 1].every((c) => c === null)) filas.pop()
  const i = filas.findIndex((f) => f.some((c) => c !== null))
  if (i < 0) return { ok: false, motivo: 'sin_filas' }
  const cab = filas[i]
  while (cab.length > 0 && cab[cab.length - 1] === null) cab.pop()
  if (cab.length === 0) return { ok: false, motivo: 'sin_cabeceras' }
  if (cab.length > MAX_COLUMNAS_IMPORTACION) return { ok: false, motivo: 'demasiadas_columnas' }
  const datos = filas.slice(i + 1)
  if (datos.length === 0) return { ok: false, motivo: 'sin_filas' }
  if (datos.length > MAX_FILAS_IMPORTACION) return { ok: false, motivo: 'demasiadas_filas' }
  const nombres = cab.map((c, k) => (c === null ? `Columna ${k + 1}` : String(c)))
  const sensibles = nombres.map((n) => esSensible(n))
  // Las columnas sensibles se vacían pero se conservan en su sitio (los índices del fichero no se mueven).
  const hoja: Hoja = {
    cabeceras: nombres,
    filas: datos.map((f) => nombres.map((_, k) => (sensibles[k] ? null : f[k] ?? null))),
    descartadas: sensibles.filter(Boolean).length,
  }
  return { ok: true, hoja }
}

function leerConFiltro(bytes: Uint8Array, esSensible: (c: string) => boolean): ResultadoLectura {
  if (bytes.length === 0) return { ok: false, motivo: 'vacio' }
  if (bytes.length > MAX_BYTES_IMPORTACION) return { ok: false, motivo: 'demasiado_grande' }
  const hash = sha256(bytes)
  let bruta: unknown[][]
  if (ES_OLE(bytes)) return { ok: false, motivo: 'formato' }
  if (ES_ZIP(bytes)) {
    // .xlsx con el lector propio (topes de zip/XML/filas; fórmulas sin evaluar; macros sin abrir).
    const x = leerXlsx(bytes)
    if (!x.ok) return { ok: false, motivo: x.motivo }
    bruta = x.filas
  } else {
    const texto = decodificar(bytes)
    if (texto === null) return { ok: false, motivo: 'formato' }
    bruta = parsearCsv(texto)
  }
  const r = organizarHoja(bruta, esSensible)
  return r.ok ? { ok: true, hoja: r.hoja, hash } : r
}

export function leerFichero(bytes: Uint8Array): ResultadoLectura {
  return leerConFiltro(bytes, esColumnaSensible)
}

/** Volcado inicial: igual, pero conserva el nombre del inquilino; NIF, correo, teléfono e IBAN se vacían al leer. */
export function leerHojaVolcado(bytes: Uint8Array): ResultadoLectura {
  return leerConFiltro(bytes, esColumnaIdentificador)
}
