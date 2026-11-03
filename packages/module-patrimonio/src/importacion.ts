// IMPORTAR PATRIMONIO DESDE EXCEL/CSV (P18, 26/10/2026) — reglas PURAS: sin BD, sin red, sin reloj, sin librería de hojas.
//
// Lo que sale de un fichero NUNCA se fía: cada celda se lee con una regla estricta y lo ilegible es un PROBLEMA de esa
// fila (la fila se aparta y NO se crea sola), nunca un 0 ni un valor de cajón. Tres estados en todo dato opcional:
// `null` = el fichero no lo trae / no se sabe · valor = lo que dice el fichero.
//   · importes en formato español («1.234,56», «800», «800,5 €») → CÉNTIMOS enteros; «1,234.56» inglés es ilegible;
//   · fechas dd/mm/aaaa (también dd-mm-aaaa, dd.mm.aaaa, aaaa-mm-dd y número de serie de Excel) → `YYYY-MM-DD`;
//   · la dirección que no se ha validado contra el callejero queda «por validar»: se guarda el TEXTO, nunca una vía inventada;
//   · NIF, correo, teléfono, IBAN e inquilino del fichero NO se leen ni se guardan (`esColumnaSensible`): el portal no puede
//     cifrarlos (van por el puente de apps/asegura, no por una hoja de cálculo).
// Idempotencia: cada fila tiene CLAVES NATURALES (referencia catastral, dirección+CP, inmueble+fecha de inicio…); una fila
// cuya clave ya existe es «ya existe» y no se vuelve a crear. Reimportar el mismo fichero no duplica.
import { CATEGORIAS_GASTO, type CategoriaGasto } from './tipos.ts'
import { esFecha, fecha as componerFecha } from './fechas.ts'

// ─── Topes (los aplica también el servidor; aquí viven para que el test los fije) ─────────────────────────────
export const MAX_FILAS_IMPORTACION = 500
export const MAX_COLUMNAS_IMPORTACION = 60
export const MAX_BYTES_IMPORTACION = 5 * 1024 * 1024
/** Importaciones nuevas por identidad en 24 h (se cuenta en BD: es el límite real). */
export const MAX_IMPORTACIONES_DIA = 10
const MAX_CELDA = 500

export const TIPOS_IMPORTACION = ['inmueble', 'contrato', 'gasto'] as const
export type TipoImportacion = (typeof TIPOS_IMPORTACION)[number]
export const esTipoImportacion = (v: unknown): v is TipoImportacion =>
  typeof v === 'string' && (TIPOS_IMPORTACION as readonly string[]).includes(v)

export const ETIQUETA_TIPO_IMPORTACION: Record<TipoImportacion, string> = {
  inmueble: 'Inmuebles',
  contrato: 'Contratos de alquiler',
  gasto: 'Gastos',
}

/** Lo que llega de la hoja: texto, número o vacío. (Las fechas de Excel las convierte el lector a texto ISO.) */
export type Celda = string | number | null

// ─── Texto ────────────────────────────────────────────────────────────────────────────────────────────────

/** minúsculas, sin tildes, solo letras/cifras separadas por un espacio. */
export function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const textoDe = (c: Celda | undefined): string | null => {
  if (c === null || c === undefined) return null
  const t = (typeof c === 'number' ? String(c) : c).trim().replace(/\s+/g, ' ')
  return t === '' ? null : t.slice(0, MAX_CELDA)
}

/** Cabeceras de columnas con datos personales que el portal no puede guardar: se descartan al leer el fichero. */
const SENSIBLE = /\b(nif|dni|nie|cif|email|e mail|mail|correo|correo electronico|telefono|tel|tlf|tfno|movil|iban|cuenta bancaria|inquilino|inquilina|arrendatario|arrendataria|avalista|propietario)\b/

export function esColumnaSensible(cabecera: string): boolean {
  return SENSIBLE.test(normalizarTexto(cabecera))
}

/**
 * Volcado inicial (27/10/2026): SOLO los identificadores (NIF/DNI/NIE/CIF, correo, teléfono, IBAN/cuenta). El NOMBRE del
 * inquilino sí se lee en el volcado (se propone el inquilino del contrato, nivel Total); sus identificadores nunca.
 */
const IDENTIFICADOR = /\b(nif|dni|nie|cif|email|e mail|mail|correo|correo electronico|telefono|tel|tlf|tfno|movil|iban|cuenta bancaria|cuenta|ccc|swift|bic|pasaporte|documento)\b/

export function esColumnaIdentificador(cabecera: string): boolean {
  return IDENTIFICADOR.test(normalizarTexto(cabecera))
}

// ─── CSV ──────────────────────────────────────────────────────────────────────────────────────────────────

/** CSV (RFC 4180) con separador autodetectado (`;` · `,` · tabulador) y BOM. Líneas vacías al final se ignoran. */
export function parsearCsv(entrada: string): string[][] {
  const texto = entrada.replace(/^﻿/, '')
  const primera = texto.split(/\r\n|\n|\r/, 1)[0] ?? ''
  const cuenta = (c: string) => primera.split(c).length - 1
  const candidatos: [string, number][] = [[';', cuenta(';')], [',', cuenta(',')], ['\t', cuenta('\t')]]
  const sep = candidatos.sort((a, b) => b[1] - a[1])[0]
  const delim = sep[1] > 0 ? sep[0] : ','
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let entreComillas = false
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]
    if (entreComillas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++ } else entreComillas = false
      } else campo += ch
    } else if (ch === '"' && campo === '') {
      entreComillas = true
    } else if (ch === delim) {
      fila.push(campo); campo = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++
      fila.push(campo); campo = ''
      filas.push(fila); fila = []
    } else campo += ch
  }
  if (campo !== '' || fila.length > 0) { fila.push(campo); filas.push(fila) }
  while (filas.length > 0 && filas[filas.length - 1].every((c) => c.trim() === '')) filas.pop()
  return filas
}

// ─── Importes y fechas ────────────────────────────────────────────────────────────────────────────────────

export type Importe = { cent: number } | { vacio: true } | { invalido: true }

/**
 * Importe en formato español → céntimos. Vacío = `{ vacio }` (no consta; JAMÁS 0). Ilegible (inglés «1,234.56», texto,
 * más de 2 decimales, negativo) = `{ invalido }`. Un número de la hoja (1234.5) vale tal cual. `permitirCero`: la fianza
 * puede ser un 0 real; la renta y los gastos no.
 */
export function leerImporte(c: Celda | undefined, permitirCero = false): Importe {
  if (c === null || c === undefined) return { vacio: true }
  let normal: string
  if (typeof c === 'number') {
    if (!Number.isFinite(c)) return { invalido: true }
    normal = String(c)
  } else {
    const s = c.trim().replace(/\s/g, '').replace(/€|eur(os)?$/gi, '')
    if (s === '') return { vacio: true }
    // Con coma: puntos de miles + coma decimal. Sin coma: «1.234» / «1.234.567» son miles; «12.5» / «12.50» decimales.
    normal = s.includes(',') || /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s
    if (/^\d{1,3}(,\d{3})+\.\d{1,2}$/.test(s)) return { invalido: true }
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return { invalido: true }
  const cent = Math.round(Number(normal) * 100)
  if (!Number.isSafeInteger(cent) || cent < 0 || (cent === 0 && !permitirCero)) return { invalido: true }
  return { cent }
}

export type FechaLeida = { fecha: string } | { vacio: true } | { invalido: true }

/** dd/mm/aaaa · dd-mm-aaaa · dd.mm.aaaa · aaaa-mm-dd · serie de Excel. Año de 4 cifras entre 1900 y 2100; día real. */
export function leerFecha(c: Celda | undefined): FechaLeida {
  if (c === null || c === undefined) return { vacio: true }
  if (typeof c === 'number') {
    // Serie de Excel (días desde 1899-12-30): solo el rango razonable 1950..2100.
    if (!Number.isFinite(c) || !Number.isInteger(c) || c < 18264 || c > 73415) return { invalido: true }
    const d = new Date(Date.UTC(1899, 11, 30) + c * 86_400_000)
    return { fecha: componerFecha(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) }
  }
  const s = c.trim()
  if (s === '') return { vacio: true }
  let y: number, m: number, d: number
  let r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s)
  if (r) { d = Number(r[1]); m = Number(r[2]); y = Number(r[3]) } else {
    r = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s)
    if (!r) return { invalido: true }
    y = Number(r[1]); m = Number(r[2]); d = Number(r[3])
  }
  const f = componerFecha(y, m, d)
  return y >= 1900 && y <= 2100 && esFecha(f) ? { fecha: f } : { invalido: true }
}

/** `YYYY-MM-DD` → `dd/mm/aaaa` (lo que se enseña). */
export const fechaEs = (f: string): string => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`

// ─── Campos por tipo ──────────────────────────────────────────────────────────────────────────────────────

export type CampoDef = { campo: string; etiqueta: string; sinonimos: readonly string[] }

export const CAMPOS_IMPORTACION: Record<TipoImportacion, readonly CampoDef[]> = {
  inmueble: [
    { campo: 'alias', etiqueta: 'Nombre del inmueble', sinonimos: ['alias', 'nombre', 'nombre del inmueble', 'inmueble', 'denominacion', 'descripcion', 'identificador'] },
    { campo: 'uso', etiqueta: 'Uso (vivienda, local…)', sinonimos: ['uso', 'tipo', 'tipo de inmueble', 'tipologia', 'clase'] },
    { campo: 'referenciaCatastral', etiqueta: 'Referencia catastral', sinonimos: ['referencia catastral', 'ref catastral', 'refcat', 'catastro', 'ref cat', 'rc', 'referencia'] },
    { campo: 'direccion', etiqueta: 'Dirección (calle y número)', sinonimos: ['direccion', 'domicilio', 'calle', 'via', 'direccion del inmueble', 'ubicacion', 'situacion'] },
    { campo: 'cp', etiqueta: 'Código postal', sinonimos: ['codigo postal', 'cp', 'c p', 'cod postal', 'postal'] },
    { campo: 'municipio', etiqueta: 'Municipio', sinonimos: ['municipio', 'localidad', 'poblacion', 'ciudad'] },
    { campo: 'provincia', etiqueta: 'Provincia', sinonimos: ['provincia'] },
    { campo: 'enComunidad', etiqueta: '¿En comunidad de propietarios?', sinonimos: ['comunidad', 'en comunidad', 'propiedad horizontal', 'comunidad de propietarios', 'ph'] },
  ],
  contrato: [
    { campo: 'inmueble', etiqueta: 'Inmueble (nombre, referencia o dirección)', sinonimos: ['inmueble', 'alias', 'vivienda', 'piso', 'referencia catastral', 'refcat', 'direccion', 'propiedad'] },
    { campo: 'inicio', etiqueta: 'Fecha de inicio', sinonimos: ['inicio', 'fecha inicio', 'fecha de inicio', 'desde', 'alta', 'fecha de firma', 'fecha firma', 'firma'] },
    { campo: 'fin', etiqueta: 'Fecha de fin', sinonimos: ['fin', 'fecha fin', 'fecha de fin', 'hasta', 'vencimiento', 'fecha de vencimiento', 'finalizacion'] },
    { campo: 'renta', etiqueta: 'Renta mensual', sinonimos: ['renta', 'renta mensual', 'alquiler', 'alquiler mensual', 'importe', 'mensualidad', 'cuota'] },
    { campo: 'fianza', etiqueta: 'Fianza', sinonimos: ['fianza', 'deposito', 'importe fianza'] },
    { campo: 'indice', etiqueta: 'Actualización (IPC, IRAV, ninguna)', sinonimos: ['indice', 'actualizacion', 'clausula', 'revision', 'indice de actualizacion', 'actualizacion de renta'] },
  ],
  gasto: [
    { campo: 'inmueble', etiqueta: 'Inmueble (nombre, referencia o dirección)', sinonimos: ['inmueble', 'alias', 'vivienda', 'piso', 'referencia catastral', 'refcat', 'direccion', 'propiedad'] },
    { campo: 'fecha', etiqueta: 'Fecha', sinonimos: ['fecha', 'fecha del gasto', 'fecha de pago', 'dia', 'fecha factura', 'fecha de factura'] },
    { campo: 'concepto', etiqueta: 'Concepto', sinonimos: ['concepto', 'descripcion', 'detalle', 'gasto', 'proveedor', 'motivo'] },
    { campo: 'categoria', etiqueta: 'Categoría', sinonimos: ['categoria', 'tipo', 'tipo de gasto', 'clase', 'partida'] },
    { campo: 'importe', etiqueta: 'Importe total', sinonimos: ['importe', 'total', 'importe total', 'cantidad', 'euros', 'precio', 'coste'] },
    { campo: 'base', etiqueta: 'Base imponible', sinonimos: ['base', 'base imponible', 'importe sin iva', 'sin iva', 'neto'] },
  ],
}

/** Campos sin los cuales la importación no puede ni empezar (la vista previa los pide). */
export function camposQueFaltan(tipo: TipoImportacion, mapeo: Mapeo): string[] {
  const c = mapeo.columnas
  const tiene = (campo: string) => c[campo] !== null && c[campo] !== undefined
  const faltan: string[] = []
  if (tipo === 'inmueble') {
    if (!tiene('alias') && !tiene('direccion') && !tiene('referenciaCatastral')) faltan.push('alias')
    if (!tiene('uso') && !mapeo.usoPorDefecto) faltan.push('uso')
  } else if (tipo === 'contrato') {
    for (const f of ['inmueble', 'inicio', 'renta']) if (!tiene(f)) faltan.push(f)
  } else {
    for (const f of ['fecha', 'importe']) if (!tiene(f)) faltan.push(f)
  }
  return faltan
}

/** columnas: campo → índice de columna del fichero (`null` = no importar). `usoPorDefecto`: lo ELIGE el cliente. */
export type Mapeo = { columnas: Record<string, number | null>; usoPorDefecto?: UsoImportable | null }

export const USOS_IMPORTABLES = ['vivienda', 'local', 'oficina', 'nave', 'garaje', 'trastero', 'otro'] as const
export type UsoImportable = (typeof USOS_IMPORTABLES)[number]

// ─── Propuesta de mapeo (heurística; el cliente la confirma) ──────────────────────────────────────────────

export type PropuestaMapeo = {
  tipo: TipoImportacion | null
  mapeo: Mapeo
  /** Columnas con datos personales que se descartan (índices). */
  sensibles: number[]
  /** Columnas que no se han reconocido (índices). */
  sinReconocer: number[]
}

function puntuarCabecera(cab: string, sinonimos: readonly string[]): number {
  const n = normalizarTexto(cab)
  if (n === '') return 0
  if (sinonimos.includes(n)) return 1
  // Contiene el sinónimo como palabra(s) enteras: «renta mensual euros» ~ «renta mensual».
  const dentro = sinonimos.filter((s) => s.length >= 3 && new RegExp(`(^| )${s}( |$)`).test(n))
  return dentro.length > 0 ? 0.7 : 0
}

const DOS_DIGITOS_FECHA = /^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}$|^\d{4}-\d{1,2}-\d{1,2}/
/** Pista por el CONTENIDO de la columna (muestra): refuerza o desempata, nunca decide sola. */
function puntuarMuestra(campo: string, valores: readonly Celda[]): number {
  const v = valores.map(textoDe).filter((x): x is string => x !== null)
  if (v.length === 0) return 0
  const todos = (f: (s: string) => boolean) => v.every(f)
  if (campo === 'cp') return todos((s) => /^\d{4,5}$/.test(s)) ? 0.45 : 0
  if (campo === 'referenciaCatastral') return todos((s) => /^[0-9A-Za-z]{20}$/.test(s.replace(/\s/g, ''))) ? 0.45 : 0
  if (['inicio', 'fin', 'fecha'].includes(campo)) return todos((s) => DOS_DIGITOS_FECHA.test(s)) ? 0.4 : 0
  if (['renta', 'fianza', 'importe', 'base'].includes(campo)) return todos((s) => 'cent' in leerImporte(s, true)) ? 0.25 : 0
  return 0
}

/** Puntuación del encaje de una lista de cabeceras con un tipo (para autodetectarlo). */
function encajeDeTipo(tipo: TipoImportacion, cabeceras: readonly string[], muestra: readonly (readonly Celda[])[]): { campos: number; mapeo: Mapeo; usadas: Set<number> } {
  const defs = CAMPOS_IMPORTACION[tipo]
  const candidatos: { campo: string; col: number; p: number }[] = []
  cabeceras.forEach((cab, col) => {
    if (esColumnaSensible(cab)) return
    const valores = muestra.map((f) => f[col] ?? null)
    for (const d of defs) {
      const base = puntuarCabecera(cab, d.sinonimos)
      const p = base > 0 ? base + puntuarMuestra(d.campo, valores) * 0.5 : puntuarMuestra(d.campo, valores) * 0.6
      if (p >= 0.25) candidatos.push({ campo: d.campo, col, p })
    }
  })
  candidatos.sort((a, b) => b.p - a.p)
  const columnas: Record<string, number | null> = Object.fromEntries(defs.map((d) => [d.campo, null]))
  const usadas = new Set<number>()
  let campos = 0
  for (const c of candidatos) {
    if (columnas[c.campo] !== null || usadas.has(c.col)) continue
    columnas[c.campo] = c.col
    usadas.add(c.col)
    // Solo cuentan para AUTODETECTAR el tipo los encajes por cabecera claros.
    if (c.p >= 0.7) campos++
  }
  return { campos, mapeo: { columnas }, usadas }
}

/** Qué tipo de datos parece traer el fichero. `null` = no se sabe (el cliente elige). */
export function detectarTipo(cabeceras: readonly string[], muestra: readonly (readonly Celda[])[]): TipoImportacion | null {
  const puntos = TIPOS_IMPORTACION.map((t) => ({ t, campos: encajeDeTipo(t, cabeceras, muestra).campos })).sort((a, b) => b.campos - a.campos)
  if (puntos[0].campos < 2) return null
  // Empate = no se sabe.
  if (puntos[1] && puntos[1].campos === puntos[0].campos) return null
  return puntos[0].t
}

/** Propone el mapeo columna → campo. `tipo` puede venir elegido por el cliente; si no, se autodetecta. */
export function proponerMapeo(
  cabeceras: readonly string[],
  muestra: readonly (readonly Celda[])[],
  tipo?: TipoImportacion | null,
): PropuestaMapeo {
  const t = tipo ?? detectarTipo(cabeceras, muestra)
  const sensibles = cabeceras.map((c, i) => (esColumnaSensible(c) ? i : -1)).filter((i) => i >= 0)
  if (t === null) return { tipo: null, mapeo: { columnas: {} }, sensibles, sinReconocer: cabeceras.map((_, i) => i).filter((i) => !sensibles.includes(i)) }
  const { mapeo, usadas } = encajeDeTipo(t, cabeceras, muestra)
  const sinReconocer = cabeceras.map((_, i) => i).filter((i) => !usadas.has(i) && !sensibles.includes(i))
  return { tipo: t, mapeo, sensibles, sinReconocer }
}

/** Valida un mapeo que llega del cliente: índices dentro del fichero, sin repetir columna, solo campos del tipo. */
export function validarMapeo(tipo: TipoImportacion, cuerpo: unknown, cabeceras: readonly string[]): { ok: true; mapeo: Mapeo } | { ok: false; campo: string } {
  const b = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Record<string, unknown>
  const crudo = (b.columnas && typeof b.columnas === 'object' ? b.columnas : {}) as Record<string, unknown>
  const columnas: Record<string, number | null> = {}
  const vistas = new Set<number>()
  for (const d of CAMPOS_IMPORTACION[tipo]) {
    const v = crudo[d.campo]
    if (v === undefined || v === null || v === '') { columnas[d.campo] = null; continue }
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= cabeceras.length) return { ok: false, campo: d.campo }
    // Una columna con datos personales no se importa nunca, aunque el cliente la pida.
    if (esColumnaSensible(cabeceras[v])) return { ok: false, campo: d.campo }
    if (vistas.has(v)) return { ok: false, campo: d.campo }
    vistas.add(v)
    columnas[d.campo] = v
  }
  for (const k of Object.keys(crudo)) if (!CAMPOS_IMPORTACION[tipo].some((d) => d.campo === k)) return { ok: false, campo: k }
  let usoPorDefecto: UsoImportable | null = null
  if (b.usoPorDefecto !== undefined && b.usoPorDefecto !== null && b.usoPorDefecto !== '') {
    if (tipo !== 'inmueble' || !(USOS_IMPORTABLES as readonly unknown[]).includes(b.usoPorDefecto)) return { ok: false, campo: 'usoPorDefecto' }
    usoPorDefecto = b.usoPorDefecto as UsoImportable
  }
  return { ok: true, mapeo: { columnas, usoPorDefecto } }
}

// ─── Aplicar el mapeo ─────────────────────────────────────────────────────────────────────────────────────

export type Valor = string | number | boolean | null
export type FilaPropuesta = {
  /** Número de fila en la hoja (la cabecera es la 1): lo que la persona ve en Excel. */
  n: number
  entidad: TipoImportacion
  /** Valores ya normalizados (céntimos, fechas ISO…). Sin NIF, correo, teléfono ni IBAN: nunca se leen. */
  datos: Record<string, Valor>
  /** Motivo por el que la fila NO se crea sola. `null` = sin problema. */
  problema: string | null
  /** Cosas que se importan pero conviene saber (p. ej. «dirección por validar»). */
  avisos: string[]
}

const USO_SINONIMOS: Record<string, UsoImportable> = {
  vivienda: 'vivienda', piso: 'vivienda', casa: 'vivienda', apartamento: 'vivienda', chalet: 'vivienda', atico: 'vivienda', duplex: 'vivienda', estudio: 'vivienda', residencial: 'vivienda',
  local: 'local', 'local comercial': 'local', comercial: 'local', tienda: 'local',
  oficina: 'oficina', oficinas: 'oficina', despacho: 'oficina',
  nave: 'nave', 'nave industrial': 'nave', industrial: 'nave', almacen: 'nave',
  garaje: 'garaje', parking: 'garaje', cochera: 'garaje', 'plaza de garaje': 'garaje', 'plaza garaje': 'garaje',
  trastero: 'trastero',
  otro: 'otro', otros: 'otro',
}

export function leerUso(c: Celda | undefined): UsoImportable | null | 'invalido' {
  const t = textoDe(c)
  if (t === null) return null
  return USO_SINONIMOS[normalizarTexto(t)] ?? 'invalido'
}

const SINONIMOS_CATEGORIA: Record<string, CategoriaGasto> = {
  comunidad: 'COMUNIDAD', 'cuota de comunidad': 'COMUNIDAD',
  impuestos: 'IMPUESTOS', impuesto: 'IMPUESTOS', ibi: 'IMPUESTOS', basura: 'IMPUESTOS', tasas: 'IMPUESTOS', tasa: 'IMPUESTOS',
  suministros: 'SUMINISTROS', suministro: 'SUMINISTROS', luz: 'SUMINISTROS', agua: 'SUMINISTROS', gas: 'SUMINISTROS', internet: 'SUMINISTROS',
  seguro: 'SEGURO', seguros: 'SEGURO',
  mantenimiento: 'MANTENIMIENTO', reparacion: 'MANTENIMIENTO', reparaciones: 'MANTENIMIENTO', conservacion: 'MANTENIMIENTO',
  reformas: 'REFORMAS', reforma: 'REFORMAS', obras: 'REFORMAS',
  gestion: 'GESTION', gestoria: 'GESTION', administracion: 'GESTION', honorarios: 'GESTION',
  financiacion: 'FINANCIACION', hipoteca: 'FINANCIACION', prestamo: 'FINANCIACION', intereses: 'FINANCIACION',
  mobiliario: 'MOBILIARIO', muebles: 'MOBILIARIO', enseres: 'MOBILIARIO',
  otro: 'OTRO', otros: 'OTRO',
}

/** `null` = vacío; `'desconocida'` = hay texto pero no es una categoría (se importa SIN categoría, con aviso). */
export function leerCategoria(c: Celda | undefined): CategoriaGasto | null | 'desconocida' {
  const t = textoDe(c)
  if (t === null) return null
  const up = t.toUpperCase()
  if ((CATEGORIAS_GASTO as readonly string[]).includes(up)) return up as CategoriaGasto
  return SINONIMOS_CATEGORIA[normalizarTexto(t)] ?? 'desconocida'
}

function leerTriestado(c: Celda | undefined): boolean | null | 'invalido' {
  const t = textoDe(c)
  if (t === null) return null
  const n = normalizarTexto(t)
  if (['si', 's', 'true', '1', 'x', 'yes'].includes(n)) return true
  if (['no', 'n', 'false', '0'].includes(n)) return false
  // «no sé» / «?» NO es «no»: se queda como no consta.
  if (['no se', 'ns', 'nc'].includes(n) || t === '?') return null
  return 'invalido'
}

const CP_CAMPO = (c: Celda | undefined): { cp: string | null; invalido: boolean } => {
  if (c === null || c === undefined) return { cp: null, invalido: false }
  // Excel se come el cero de 07001: un número de 4 cifras se rellena; un texto no se toca.
  let s = typeof c === 'number' ? (Number.isInteger(c) && c >= 1000 && c <= 99999 ? String(c).padStart(5, '0') : String(c)) : c.trim()
  if (s === '') return { cp: null, invalido: false }
  s = s.replace(/\s/g, '')
  return /^\d{5}$/.test(s) ? { cp: s, invalido: false } : { cp: null, invalido: true }
}

/** Mismo formato que `componerDireccionNormalizada` de la app («CL PARRA LA 12, 41003 SEVILLA (SEVILLA)») con lo que haya. */
export function componerDireccion(x: { direccion: string | null; cp: string | null; municipio: string | null; provincia: string | null }): string | null {
  if (x.direccion === null) return null
  const base = x.direccion.trim().replace(/\s+/g, ' ')
  const lugar = [x.cp, x.municipio].filter((v) => v !== null && v !== '').join(' ')
  const prov = x.provincia ? ` (${x.provincia})` : ''
  return lugar === '' && prov === '' ? base : `${base}, ${lugar}${prov}`.replace(/, $/, '')
}

const celda = (fila: readonly Celda[], mapeo: Mapeo, campo: string): Celda | undefined => {
  const i = mapeo.columnas[campo]
  return i === null || i === undefined ? undefined : fila[i]
}

function filaInmueble(n: number, fila: readonly Celda[], mapeo: Mapeo): FilaPropuesta {
  const avisos: string[] = []
  const datos: Record<string, Valor> = {}
  const direccion = textoDe(celda(fila, mapeo, 'direccion'))
  const refRaw = textoDe(celda(fila, mapeo, 'referenciaCatastral'))
  const rc = refRaw === null ? null : refRaw.replace(/\s/g, '').toUpperCase()
  const alias = textoDe(celda(fila, mapeo, 'alias')) ?? direccion ?? rc
  const cp = CP_CAMPO(celda(fila, mapeo, 'cp'))
  const municipio = textoDe(celda(fila, mapeo, 'municipio'))
  const provincia = textoDe(celda(fila, mapeo, 'provincia'))
  const usoCelda = leerUso(celda(fila, mapeo, 'uso'))
  const comunidad = leerTriestado(celda(fila, mapeo, 'enComunidad'))
  let problema: string | null = null
  if (alias === null) problema = 'La fila no trae nombre, dirección ni referencia catastral.'
  else if (alias.length > 80) problema = 'El nombre del inmueble pasa de 80 caracteres.'
  else if (rc !== null && !/^[0-9A-Z]{20}$/.test(rc)) problema = 'La referencia catastral no es válida (20 letras y cifras).'
  else if (usoCelda === 'invalido') problema = `El uso «${textoDe(celda(fila, mapeo, 'uso'))}» no se reconoce (vivienda, local, oficina, nave, garaje, trastero u otro).`
  else if (usoCelda === null && !mapeo.usoPorDefecto) problema = 'Falta el uso del inmueble (elige uno para todo el fichero o rellena la columna).'
  else if (comunidad === 'invalido') problema = 'No se entiende «en comunidad» (sí / no).'
  else if (direccion !== null && direccion.length > 200) problema = 'La dirección pasa de 200 caracteres.'
  const uso = usoCelda === 'invalido' ? null : usoCelda ?? mapeo.usoPorDefecto ?? null
  if (usoCelda === null && mapeo.usoPorDefecto) avisos.push(`Uso «${mapeo.usoPorDefecto}» elegido por ti para todo el fichero.`)
  if (cp.invalido) avisos.push('Código postal ilegible: se importa sin él.')
  if (direccion !== null) avisos.push('Dirección por validar: la calle no se ha comprobado con el callejero del Catastro.')
  else avisos.push('Sin dirección: no se podrá consultar el Catastro hasta que la añadas.')
  datos.alias = alias
  datos.uso = uso
  datos.referenciaCatastral = rc
  datos.direccion = direccion
  datos.cp = cp.cp
  datos.municipio = municipio
  datos.provincia = provincia
  datos.direccionNormalizada = componerDireccion({ direccion, cp: cp.cp, municipio, provincia })
  datos.enComunidad = comunidad === 'invalido' ? null : comunidad
  datos.porValidar = direccion !== null
  return { n, entidad: 'inmueble', datos, problema, avisos }
}

function filaContrato(n: number, fila: readonly Celda[], mapeo: Mapeo): FilaPropuesta {
  const avisos: string[] = []
  const inmueble = textoDe(celda(fila, mapeo, 'inmueble'))
  const inicio = leerFecha(celda(fila, mapeo, 'inicio'))
  const fin = leerFecha(celda(fila, mapeo, 'fin'))
  const renta = leerImporte(celda(fila, mapeo, 'renta'))
  const fianza = leerImporte(celda(fila, mapeo, 'fianza'), true)
  const indiceTxt = textoDe(celda(fila, mapeo, 'indice'))
  const indiceN = indiceTxt === null ? null : normalizarTexto(indiceTxt)
  let clausula: 'ninguna' | 'indice' = 'ninguna'
  let indice: 'IPC' | 'IRAV' | null = null
  let problema: string | null = null
  if (indiceN !== null) {
    if (indiceN === 'ipc') { clausula = 'indice'; indice = 'IPC' }
    else if (indiceN === 'irav') { clausula = 'indice'; indice = 'IRAV' }
    else if (['ninguna', 'ninguno', 'no', 'sin', 'sin actualizacion', 'n a', 'na'].includes(indiceN)) clausula = 'ninguna'
    else problema = `La actualización «${indiceTxt}» no se reconoce (IPC, IRAV o ninguna).`
  } else avisos.push('Sin cláusula de actualización indicada: se importa como «ninguna».')
  if (problema === null) {
    if (inmueble === null) problema = 'Falta el inmueble.'
    else if ('vacio' in inicio) problema = 'Falta la fecha de inicio.'
    else if ('invalido' in inicio) problema = 'La fecha de inicio no es legible (dd/mm/aaaa).'
    else if ('invalido' in fin) problema = 'La fecha de fin no es legible (dd/mm/aaaa).'
    else if ('fecha' in fin && fin.fecha < inicio.fecha) problema = 'La fecha de fin es anterior a la de inicio.'
    else if ('vacio' in renta) problema = 'Falta la renta mensual.'
    else if ('invalido' in renta) problema = 'La renta no es legible (formato 1.234,56).'
    else if ('invalido' in fianza) problema = 'La fianza no es legible (formato 1.234,56).'
  }
  const datos: Record<string, Valor> = {
    inmueble,
    inicio: 'fecha' in inicio ? inicio.fecha : null,
    fin: 'fecha' in fin ? fin.fecha : null,
    rentaCent: 'cent' in renta ? renta.cent : null,
    fianzaCent: 'cent' in fianza ? fianza.cent : null,
    clausula,
    indice,
  }
  if (datos.fin === null && problema === null) avisos.push('Sin fecha de fin: contrato indefinido.')
  return { n, entidad: 'contrato', datos, problema, avisos }
}

function filaGasto(n: number, fila: readonly Celda[], mapeo: Mapeo): FilaPropuesta {
  const avisos: string[] = []
  const inmueble = textoDe(celda(fila, mapeo, 'inmueble'))
  const f = leerFecha(celda(fila, mapeo, 'fecha'))
  const importe = leerImporte(celda(fila, mapeo, 'importe'))
  const base = leerImporte(celda(fila, mapeo, 'base'))
  const concepto = textoDe(celda(fila, mapeo, 'concepto'))
  const categoria = leerCategoria(celda(fila, mapeo, 'categoria'))
  let problema: string | null = null
  if ('vacio' in f) problema = 'Falta la fecha.'
  else if ('invalido' in f) problema = 'La fecha no es legible (dd/mm/aaaa).'
  else if ('vacio' in importe) problema = 'Falta el importe.'
  else if ('invalido' in importe) problema = 'El importe no es legible (formato 1.234,56, mayor que 0).'
  else if ('invalido' in base) problema = 'La base imponible no es legible (formato 1.234,56).'
  else if (concepto !== null && concepto.length > 200) problema = 'El concepto pasa de 200 caracteres.'
  if (categoria === 'desconocida') avisos.push(`Categoría «${textoDe(celda(fila, mapeo, 'categoria'))}» no reconocida: se importa sin categoría.`)
  if (inmueble === null) avisos.push('Sin inmueble: se anota como gasto del titular.')
  const datos: Record<string, Valor> = {
    inmueble,
    fecha: 'fecha' in f ? f.fecha : null,
    concepto,
    categoria: categoria === 'desconocida' ? null : categoria,
    totalCent: 'cent' in importe ? importe.cent : null,
    baseCent: 'cent' in base ? base.cent : null,
  }
  return { n, entidad: 'gasto', datos, problema, avisos }
}

/**
 * Filas de la hoja (SIN la cabecera) → filas propuestas. `primeraFila` = número de la primera fila de datos en la hoja
 * (2 si la cabecera es la 1). Las filas totalmente vacías se saltan (conservan su número).
 */
export function aplicarMapeo(tipo: TipoImportacion, filas: readonly (readonly Celda[])[], mapeo: Mapeo, primeraFila = 2): FilaPropuesta[] {
  const out: FilaPropuesta[] = []
  filas.forEach((fila, i) => {
    if (fila.every((c) => textoDe(c) === null)) return
    const n = primeraFila + i
    out.push(tipo === 'inmueble' ? filaInmueble(n, fila, mapeo) : tipo === 'contrato' ? filaContrato(n, fila, mapeo) : filaGasto(n, fila, mapeo))
  })
  return out
}

// ─── Inmueble al que apunta una fila (contratos y gastos) ─────────────────────────────────────────────────

export type InmuebleRef = { id: string; alias: string; referenciaCatastral: string | null; direccionNormalizada: string | null }

/**
 * Casa el texto de la hoja con UN inmueble del titular: referencia catastral exacta → nombre exacto → la dirección lo
 * contiene (≥ 5 caracteres). Si casan varios, es ambiguo (no se elige al azar); si ninguno, no encontrado.
 */
export function resolverInmueble(ref: string, inmuebles: readonly InmuebleRef[]): { id: string } | { error: 'no_encontrado' | 'ambiguo' } {
  const t = normalizarTexto(ref)
  if (t === '') return { error: 'no_encontrado' }
  const rc = ref.replace(/\s/g, '').toUpperCase()
  const unico = (xs: readonly InmuebleRef[]) => (xs.length === 1 ? { id: xs[0].id } : xs.length > 1 ? { error: 'ambiguo' as const } : null)
  if (/^[0-9A-Z]{20}$/.test(rc)) {
    const r = unico(inmuebles.filter((i) => i.referenciaCatastral !== null && i.referenciaCatastral.trim().toUpperCase() === rc))
    if (r) return r
  }
  const porNombre = unico(inmuebles.filter((i) => normalizarTexto(i.alias) === t))
  if (porNombre) return porNombre
  if (t.length >= 5) {
    const porDir = unico(inmuebles.filter((i) => i.direccionNormalizada !== null && normalizarTexto(i.direccionNormalizada).includes(t)))
    if (porDir) return porDir
  }
  return { error: 'no_encontrado' }
}

// ─── Claves naturales y duplicados ────────────────────────────────────────────────────────────────────────

/** Claves de un inmueble PROPUESTO. Dos inmuebles son «el mismo» si comparten alguna. */
export function clavesDeInmueble(x: { referenciaCatastral: string | null; direccion: string | null; cp: string | null; alias: string | null; direccionNormalizada?: string | null }): string[] {
  const claves: string[] = []
  if (x.referenciaCatastral) claves.push(`rc:${x.referenciaCatastral.trim().toUpperCase()}`)
  // Con CP: calle + CP. Sin CP: la dirección normalizada entera (es lo que se guarda y lo que se compara al reimportar).
  if (x.direccion) claves.push(x.cp ? `dir:${normalizarTexto(x.direccion)}|${x.cp}` : `dir:${normalizarTexto(x.direccionNormalizada ?? x.direccion)}|`)
  // El nombre solo identifica cuando no hay referencia ni dirección con que comparar.
  if (!x.referenciaCatastral && !x.direccion && x.alias) claves.push(`alias:${normalizarTexto(x.alias)}`)
  return claves
}

/**
 * Claves de un inmueble que YA existe (su `direccion_normalizada` es «calle, 41003 Municipio (Provincia)»): las mismas que
 * habría generado el fichero con el que se creó, para que reimportarlo no duplique.
 */
export function clavesDeInmuebleExistente(x: { referenciaCatastral: string | null; direccionNormalizada: string | null; alias: string }): string[] {
  const claves: string[] = []
  const rc = x.referenciaCatastral?.trim()
  if (rc) claves.push(`rc:${rc.toUpperCase()}`)
  const norm = x.direccionNormalizada?.trim()
  if (norm) {
    const m = /^(.*), (\d{5})(?: .*)?$/.exec(norm)
    if (m) claves.push(`dir:${normalizarTexto(m[1])}|${m[2]}`)
    claves.push(`dir:${normalizarTexto(norm)}|`)
  }
  if (!rc && !norm) claves.push(`alias:${normalizarTexto(x.alias)}`)
  return claves
}

export const claveContrato = (inmuebleId: string, inicio: string): string => `ct:${inmuebleId}|${inicio}`

export const claveGasto = (x: { inmuebleId: string | null; fecha: string; totalCent: number; concepto: string | null }): string =>
  `gt:${x.inmuebleId ?? '-'}|${x.fecha}|${x.totalCent}|${normalizarTexto(x.concepto ?? '')}`

export type EstadoFila = 'nueva' | 'ya_existe' | 'repetida' | 'con_problema'

export type FilaEvaluada = {
  n: number
  entidad: TipoImportacion
  estado: EstadoFila
  /** Por qué no se crea (problema, ya existe, repetida). `null` si es nueva. */
  motivo: string | null
  avisos: string[]
  datos: Record<string, Valor>
  /** Inmueble resuelto (contratos y gastos con inmueble). */
  inmuebleId: string | null
  claves: string[]
}

/**
 * Evalúa las filas contra lo que YA hay: resuelve el inmueble, calcula las claves y marca «ya existe» (clave presente en
 * `existentes`) o «repetida» (la misma clave más arriba en el mismo fichero). Una fila con problema nunca es «nueva».
 */
export function evaluarFilas(
  filas: readonly FilaPropuesta[],
  ctx: { inmuebles: readonly InmuebleRef[]; existentes: ReadonlySet<string> },
): FilaEvaluada[] {
  const vistas = new Map<string, number>()
  return filas.map((f): FilaEvaluada => {
    let inmuebleId: string | null = null
    let problema = f.problema
    if (problema === null && f.entidad !== 'inmueble') {
      const ref = f.datos.inmueble as string | null
      if (ref !== null) {
        const r = resolverInmueble(ref, ctx.inmuebles)
        if ('id' in r) inmuebleId = r.id
        else problema = r.error === 'ambiguo' ? `«${ref}» corresponde a más de un inmueble.` : `No hay ningún inmueble que se llame o se dirija «${ref}».`
      }
    }
    let claves: string[] = []
    if (problema === null) {
      if (f.entidad === 'inmueble') {
        claves = clavesDeInmueble({
          referenciaCatastral: f.datos.referenciaCatastral as string | null,
          direccion: f.datos.direccion as string | null,
          cp: f.datos.cp as string | null,
          alias: f.datos.alias as string | null,
          direccionNormalizada: f.datos.direccionNormalizada as string | null,
        })
      } else if (f.entidad === 'contrato') {
        claves = [claveContrato(inmuebleId!, f.datos.inicio as string)]
      } else {
        claves = [claveGasto({ inmuebleId, fecha: f.datos.fecha as string, totalCent: f.datos.totalCent as number, concepto: f.datos.concepto as string | null })]
      }
    }
    const base = { n: f.n, entidad: f.entidad, avisos: f.avisos, datos: f.datos, inmuebleId, claves }
    if (problema !== null) return { ...base, estado: 'con_problema', motivo: problema }
    if (claves.some((c) => ctx.existentes.has(c))) return { ...base, estado: 'ya_existe', motivo: 'Ya existe en tu patrimonio.' }
    const previa = claves.map((c) => vistas.get(c)).find((v) => v !== undefined)
    for (const c of claves) if (!vistas.has(c)) vistas.set(c, f.n)
    if (previa !== undefined) return { ...base, estado: 'repetida', motivo: `Repetida en el fichero (igual que la fila ${previa}).` }
    return { ...base, estado: 'nueva', motivo: null }
  })
}

export type ResumenEvaluacion = { nuevas: number; yaExisten: number; repetidas: number; conProblema: number; porValidar: number }

export function resumirEvaluacion(filas: readonly FilaEvaluada[]): ResumenEvaluacion {
  const r: ResumenEvaluacion = { nuevas: 0, yaExisten: 0, repetidas: 0, conProblema: 0, porValidar: 0 }
  for (const f of filas) {
    if (f.estado === 'nueva') { r.nuevas++; if (f.datos.porValidar === true) r.porValidar++ }
    else if (f.estado === 'ya_existe') r.yaExisten++
    else if (f.estado === 'repetida') r.repetidas++
    else r.conProblema++
  }
  return r
}

// ─── Plantillas descargables ──────────────────────────────────────────────────────────────────────────────

/** Cabeceras de la plantilla de cada tipo (el cliente las rellena; la autodetección las reconoce al 100 %). */
export const CABECERAS_PLANTILLA: Record<TipoImportacion, readonly string[]> = {
  inmueble: ['Nombre del inmueble', 'Uso', 'Referencia catastral', 'Dirección', 'Código postal', 'Municipio', 'Provincia', 'En comunidad'],
  contrato: ['Inmueble', 'Fecha de inicio', 'Fecha de fin', 'Renta mensual', 'Fianza', 'Actualización'],
  gasto: ['Inmueble', 'Fecha', 'Concepto', 'Categoría', 'Importe total', 'Base imponible'],
}

/** CSV de la plantilla: separador `;` (el de Excel en español), BOM UTF-8, solo cabeceras. */
export function plantillaCsv(tipo: TipoImportacion): string {
  return `﻿${CABECERAS_PLANTILLA[tipo].join(';')}\r\n`
}
