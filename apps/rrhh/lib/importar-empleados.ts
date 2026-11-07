// Importación de empleados desde CSV: reglas PURAS (sin BD, sin red, sin reloj). Plantilla, lectura de CSV, cabeceras
// → campos, celdas → texto y VISTA PREVIA por fila con las MISMAS validaciones del asistente (`validarAlta`).
// 🚨 Solo CSV: un .xlsx subido NO se abre (xlsx@0.18.5, CVE-2023-30533). Volverá con xlsx ≥0.20.3.
//
// 🚨 Datos personales: nada de este módulo escribe en consola. La vista previa enmascara DNI/NAF/IBAN.
import {
  CAMPOS_ALTA, existentesVacios, motivoDuplicado, registrarClaves, validarAlta,
  porcentaje, type AltaNormalizada, type CampoAlta, type ContextoAlta, type EntradaAlta, type ErrorCampo, type Existentes,
} from './alta-empleado'
import { enmascarar } from './alta-empleado-validadores'

export const LIMITE_FILAS = 300
export const LIMITE_BYTES = 2 * 1024 * 1024

export interface ColumnaPlantilla { campo: CampoAlta; cabecera: string; obligatoria: boolean; ayuda: string; fecha?: boolean }

/** Orden y nombre de las columnas de la plantilla. Las cabeceras se reconocen sin tildes, mayúsculas ni «*». */
export const COLUMNAS: ColumnaPlantilla[] = [
  { campo: 'apellidos', cabecera: 'Apellidos', obligatoria: true, ayuda: 'Ej.: García López' },
  { campo: 'nombre', cabecera: 'Nombre', obligatoria: true, ayuda: 'Ej.: Ana' },
  { campo: 'dni', cabecera: 'DNI/NIE', obligatoria: true, ayuda: '8 dígitos + letra, o X/Y/Z + 7 dígitos + letra' },
  { campo: 'email', cabecera: 'Email', obligatoria: true, ayuda: 'Para entrar al portal y firmar documentos' },
  { campo: 'nss', cabecera: 'Nº afiliación SS', obligatoria: false, ayuda: '12 dígitos (provincia + número + control)' },
  { campo: 'telefono', cabecera: 'Teléfono', obligatoria: false, ayuda: '9 dígitos o +prefijo' },
  { campo: 'fecha_nacimiento', cabecera: 'Fecha nacimiento', obligatoria: false, ayuda: 'DD/MM/AAAA', fecha: true },
  { campo: 'puesto', cabecera: 'Puesto', obligatoria: false, ayuda: 'Ej.: Camarero' },
  { campo: 'fecha_alta', cabecera: 'Fecha alta', obligatoria: false, ayuda: 'DD/MM/AAAA. Obligatoria si hay contrato', fecha: true },
  { campo: 'tipo_contrato', cabecera: 'Tipo contrato', obligatoria: false, ayuda: 'indefinido, temporal o parcial. Vacío = sin contrato' },
  { campo: 'fecha_fin', cabecera: 'Fecha fin', obligatoria: false, ayuda: 'DD/MM/AAAA. Solo temporales', fecha: true },
  { campo: 'grupo_cotizacion', cabecera: 'Grupo cotización', obligatoria: false, ayuda: '1 a 11. Obligatorio si hay contrato' },
  { campo: 'categoria', cabecera: 'Categoría convenio', obligatoria: false, ayuda: 'Como en la tabla del convenio' },
  { campo: 'jornada_pct', cabecera: 'Jornada %', obligatoria: false, ayuda: '100 = completa. Obligatoria si hay contrato' },
  { campo: 'salario_base', cabecera: 'Salario base €/mes', obligatoria: false, ayuda: 'Ej.: 1.350,00. Vacío = el de la tabla del convenio' },
  { campo: 'irpf_pct', cabecera: 'IRPF %', obligatoria: false, ayuda: 'Retención. Vacío = 0' },
  { campo: 'iban', cabecera: 'IBAN', obligatoria: false, ayuda: 'Cuenta de la nómina' },
]

const ALIAS: Record<string, CampoAlta> = {
  dni: 'dni', nie: 'dni', nif: 'dni', 'dni/nie': 'dni', 'nif/nie': 'dni', documento: 'dni',
  'n afiliacion ss': 'nss', 'no afiliacion ss': 'nss', 'num afiliacion ss': 'nss', naf: 'nss', nss: 'nss', 'numero seguridad social': 'nss',
  'n seguridad social': 'nss', 'afiliacion': 'nss', correo: 'email', 'correo electronico': 'email', 'e-mail': 'email', mail: 'email',
  movil: 'telefono', tlf: 'telefono', 'fecha de nacimiento': 'fecha_nacimiento', nacimiento: 'fecha_nacimiento',
  'fecha de alta': 'fecha_alta', 'fecha inicio': 'fecha_alta', 'inicio contrato': 'fecha_alta', contrato: 'tipo_contrato',
  'fecha de fin': 'fecha_fin', 'fin contrato': 'fecha_fin', grupo: 'grupo_cotizacion', 'grupo de cotizacion': 'grupo_cotizacion',
  categoria: 'categoria', jornada: 'jornada_pct', 'jornada (%)': 'jornada_pct', salario: 'salario_base', 'salario base': 'salario_base',
  irpf: 'irpf_pct', 'retencion irpf': 'irpf_pct', cuenta: 'iban', 'cuenta bancaria': 'iban',
}

/** Cabecera comparable: minúsculas, sin tildes, sin «*», «º/ª», «€/mes» ni espacios sobrantes. */
export function normalizarCabecera(s: string): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\*/g, '').replace(/[º°ª]/g, '').replace(/\./g, ' ').replace(/€\s*\/\s*mes|€/g, '').replace(/\s+/g, ' ').trim()
}

const POR_CABECERA = new Map<string, CampoAlta>([
  ...COLUMNAS.map(c => [normalizarCabecera(c.cabecera), c.campo] as [string, CampoAlta]),
  ...CAMPOS_ALTA.map(c => [c, c] as [string, CampoAlta]),
  ...Object.entries(ALIAS),
])

export function campoDeCabecera(s: string): CampoAlta | null {
  return POR_CABECERA.get(normalizarCabecera(s)) ?? null
}

/**
 * CSV → matriz de texto. Separador «;» (Excel en español) o «,», el que más aparezca en la 1.ª línea fuera de comillas.
 * Comillas dobles con «""» de escape, saltos de línea dentro de comillas, CRLF y BOM. Sin conversión de tipos: un NAF
 * que empieza por 0 sigue empezando por 0.
 */
export function parsearCsv(texto: string): string[][] {
  const s = texto.replace(/^﻿/, '')
  const primera = s.split(/\r?\n/, 1)[0] ?? ''
  const fuera = primera.replace(/"[^"]*"/g, '')
  const sep = (fuera.match(/;/g)?.length ?? 0) >= (fuera.match(/,/g)?.length ?? 0) ? ';' : ','
  const filas: string[][] = []
  let fila: string[] = [], celda = '', comillas = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (comillas) {
      if (c === '"') { if (s[i + 1] === '"') { celda += '"'; i++ } else comillas = false }
      else celda += c
    } else if (c === '"' && celda === '') comillas = true
    else if (c === sep) { fila.push(celda); celda = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      fila.push(celda); filas.push(fila); fila = []; celda = ''
    } else celda += c
  }
  if (celda !== '' || fila.length) { fila.push(celda); filas.push(fila) }
  return filas
}

/** Serie de fecha de Excel (días desde 1899-12-30, con el falso 29/02/1900 ya absorbido) → «AAAA-MM-DD». */
export function serieExcelAIso(n: number): string | null {
  if (!Number.isFinite(n) || n < 1 || n > 2_958_465) return null
  const ms = Date.UTC(1899, 11, 30) + Math.floor(n) * 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}

/** Celda de la hoja (texto, número, booleano, fecha) → texto. En una columna de fecha, el número es una serie de Excel. */
export function celdaATexto(v: unknown, esFecha: boolean): string {
  if (v == null) return ''
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10)
  if (typeof v === 'number') {
    if (esFecha) return serieExcelAIso(v) ?? String(v)
    return Number.isInteger(v) ? v.toFixed(0) : String(v)
  }
  if (typeof v === 'boolean') return v ? 'sí' : 'no'
  return String(v).trim()
}

export interface FilaTabla {
  numero: number
  entrada: EntradaAlta
  /** Errores detectados al LEER la celda (antes de validar), p. ej. un porcentaje ambiguo. Ausente = ninguno. */
  erroresLectura?: ErrorCampo[]
}
export interface Tabla { filas: FilaTabla[]; ignoradas: string[]; faltan: string[] }

/**
 * Celda de porcentaje (jornada, IRPF) leída de la hoja. Excel guarda en CSV lo que MUESTRA: una celda con formato %
 * sale como «15%» o «100 %» (ya en porcentaje: se respeta). Pero una fracción escrita a mano o copiada de una fórmula
 * (1 = 100 %, 0,15 = 15 %) llega SIN «%» y no se puede saber si es 1 % o 100 %: se RECHAZA con error de fila, nunca se
 * adivina (adivinar mal = una jornada del 1 % o un IRPF del 0,15 % en la nómina).
 *  - Jornada sin «%» en (0, 1] → ambigua (1 % de jornada no existe en la práctica; 1 puede ser 100 %).
 *  - IRPF sin «%» en (0, 1)   → ambiguo («1» sí es 1 %: como fracción sería 100 %, imposible).
 * Devuelve el texto a validar o el error; lo que no es número lo deja pasar para que `validarAlta` diga lo de siempre.
 */
export function porcentajeDeHoja(campo: 'jornada_pct' | 'irpf_pct', txt: string): { texto: string } | { error: ErrorCampo } {
  const n = porcentaje(txt)
  if (n === null || /%/.test(txt)) return { texto: txt }
  if (campo === 'jornada_pct' && n > 0 && n <= 1) {
    return { error: { campo, mensaje: 'Jornada ambigua (¿1 = 100 %?): escríbela en porcentaje, p. ej. 100 (completa) o 50 (media)' } }
  }
  if (campo === 'irpf_pct' && n > 0 && n < 1) {
    return { error: { campo, mensaje: 'IRPF ambiguo (¿0,15 = 15 %?): escríbelo en porcentaje, p. ej. 15 o 15 %' } }
  }
  return { texto: txt }
}

/**
 * Matriz de celdas (1.ª fila = cabeceras) → entradas por fila. Se salta las filas vacías. `numero` = fila de la hoja
 * (1 = cabecera), para que el responsable la encuentre en su Excel. `faltan` = columnas obligatorias ausentes.
 */
export function tablaDesdeMatriz(m: unknown[][]): Tabla {
  const cab = (m[0] ?? []).map(c => celdaATexto(c, false))
  const campos = cab.map(campoDeCabecera)
  const ignoradas = cab.filter((c, i) => c && !campos[i])
  const vistos = new Set(campos.filter(Boolean))
  const faltan = COLUMNAS.filter(c => c.obligatoria && !vistos.has(c.campo)).map(c => c.cabecera)
  const esFecha = new Set(COLUMNAS.filter(c => c.fecha).map(c => c.campo))
  const filas: Tabla['filas'] = []
  for (let r = 1; r < m.length; r++) {
    const celdas = m[r] ?? []
    const entrada: EntradaAlta = {}
    const erroresLectura: ErrorCampo[] = []
    let algo = false
    campos.forEach((campo, i) => {
      if (!campo) return
      const txt = celdaATexto(celdas[i], esFecha.has(campo))
      if (!txt) return
      algo = true
      if (entrada[campo] || erroresLectura.some(e => e.campo === campo)) return
      if (campo === 'jornada_pct' || campo === 'irpf_pct') {
        const p = porcentajeDeHoja(campo, txt)
        if ('error' in p) { erroresLectura.push(p.error); return }
      }
      entrada[campo] = txt
    })
    if (algo) filas.push(erroresLectura.length ? { numero: r + 1, entrada, erroresLectura } : { numero: r + 1, entrada })
  }
  return { filas, ignoradas, faltan }
}

export interface FilaPrevia {
  numero: number
  estado: 'valida' | 'error'
  /** Para reconocer la fila sin exponer el dato entero. */
  nombre: string
  dni: string
  conContrato: boolean
  errores: ErrorCampo[]
  /** Motivo de duplicado (con la plantilla o con otra fila). */
  duplicado: string | null
  avisos: string[]
}

export interface VistaPrevia { filas: FilaPrevia[]; validas: number; conError: number; ignoradas: string[]; faltan: string[]; excedeLimite: boolean }

/**
 * Valida cada fila (mismas reglas del asistente) y marca duplicados contra la plantilla (`ya`) y contra las filas
 * ANTERIORES del mismo fichero (la primera aparición gana). Devuelve también las altas válidas, en orden, para confirmar.
 */
export function prepararImportacion(t: Tabla, ctx: ContextoAlta, ya: Existentes): { previa: VistaPrevia; altas: { numero: number; alta: AltaNormalizada }[] } {
  const previos = existentesVacios()
  const filas: FilaPrevia[] = []
  const altas: { numero: number; alta: AltaNormalizada }[] = []
  const excedeLimite = t.filas.length > LIMITE_FILAS
  if (t.faltan.length || excedeLimite) {
    return { previa: { filas: [], validas: 0, conError: 0, ignoradas: t.ignoradas, faltan: t.faltan, excedeLimite }, altas: [] }
  }
  for (const { numero, entrada, erroresLectura } of t.filas) {
    const r = validarAlta(entrada, ctx)
    const nombre = [entrada.nombre, entrada.apellidos].map(x => (x ?? '').trim()).filter(Boolean).join(' ').slice(0, 80)
    const base = { numero, nombre, dni: enmascarar(entrada.dni), conContrato: !!(entrada.tipo_contrato ?? '').trim() }
    if (erroresLectura?.length) {
      // El campo ilegible no llegó a `validarAlta`: se quita su «falta el campo» para no dar dos errores por la misma celda.
      const leidos = new Set(erroresLectura.map(e => e.campo))
      const resto = r.ok ? [] : r.errores.filter(e => !leidos.has(e.campo))
      filas.push({ ...base, estado: 'error', errores: [...erroresLectura, ...resto], duplicado: null, avisos: [] }); continue
    }
    if (!r.ok) { filas.push({ ...base, estado: 'error', errores: r.errores, duplicado: null, avisos: [] }); continue }
    const dup = motivoDuplicado(r.alta, ya, previos)
    registrarClaves(previos, r.alta)
    if (dup) { filas.push({ ...base, estado: 'error', errores: [], duplicado: dup, avisos: r.avisos }); continue }
    filas.push({ ...base, conContrato: !!r.alta.contrato, estado: 'valida', errores: [], duplicado: null, avisos: r.avisos })
    altas.push({ numero, alta: r.alta })
  }
  const validas = filas.filter(f => f.estado === 'valida').length
  return { previa: { filas, validas, conError: filas.length - validas, ignoradas: t.ignoradas, faltan: [], excedeLimite: false }, altas }
}

/** Plantilla CSV: solo cabeceras (con «*» las obligatorias); la ayuda está en la pantalla de importación. */
export function plantillaCsv(): string {
  return '﻿' + COLUMNAS.map(c => (c.obligatoria ? `${c.cabecera} *` : c.cabecera)).join(';') + '\r\n'
}

/** ¿El fichero es un ZIP (XLSX/ODS) por su firma, sin fiarse de la extensión ni del tipo MIME? */
export function esZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

/** ¿Excel binario antiguo (.xls, OLE2) por su firma? */
function esOle2(bytes: Uint8Array): boolean {
  return bytes.length > 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
}

export const MENSAJE_SOLO_CSV = 'Formato no admitido: guarda tu Excel como CSV (Archivo › Guardar como › «CSV UTF-8») y súbelo de nuevo'

/**
 * Fichero subido → matriz de texto. SOLO CSV en UTF-8: un Excel (.xlsx/.xls/.ods), por firma o por extensión, se rechaza
 * con un mensaje que dice cómo guardarlo como CSV. Un texto que no es UTF-8 válido también se rechaza (las tildes se
 * romperían en silencio y el nombre o la dirección quedarían mal escritos).
 */
export function leerCsvSubido(bytes: Uint8Array, nombre: string): string[][] {
  if (esZip(bytes) || esOle2(bytes) || /\.(xlsx|xlsm|xls|ods|numbers)$/i.test(nombre)) throw new Error(MENSAJE_SOLO_CSV)
  let texto: string
  try { texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { throw new Error('El CSV no está en UTF-8: guárdalo como «CSV UTF-8 (delimitado por comas)»') }
  if (texto.includes('\u0000')) throw new Error('El fichero no es un CSV de texto')
  return parsearCsv(texto)
}
