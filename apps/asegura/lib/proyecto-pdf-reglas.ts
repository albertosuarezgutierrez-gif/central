// PDF del proyecto guardado en la compañía — reglas PURAS (26/10/2026). Cubiertas por `proyecto-pdf-reglas.test.ts`.
//
// Flujo aprobado: tarificar → el bot GUARDA el proyecto en la compañía (nº en `tarificacion_precios.referencia_vendor`) →
// descarga su PDF → se extraen coberturas → comparativa → borrador al cliente. Este fichero resuelve tres cosas sin BD:
//   1. VERIFICACIÓN PDF ↔ tarificado: prima total anual, matrícula y fecha de efecto del riesgo. Tres estados:
//      `null` = no comprobado · `ok` · `discrepancia` (con el campo). 🚨 Nunca devuelve un valor personal: solo
//      «coincide / no aparece» por campo (la matrícula y la fecha NO salen de aquí, ni a logs ni a avisos).
//   2. CADUCIDAD del proyecto: lo que diga el PDF («válido hasta…», «validez: N días») > la validez que dio el portal >
//      la constante por compañía (`VALIDEZ_PROYECTO_DIAS`, `null` = no se sabe) > «desconocida». Nunca se inventa.
//   3. «Limpio / con supuestos» de un precio de bot.

/** Días de validez de un proyecto guardado, por compañía (clave en minúsculas). `null` = NO se sabe: no se inventa. */
export const VALIDEZ_PROYECTO_DIAS: Readonly<Record<string, number | null>> = Object.freeze({
  allianz: null,
  mapfre: null,
  generali: null,
})

/** Días antes de la caducidad en que sale el aviso de la campana. */
export const DIAS_AVISO_CADUCIDAD = 5

const ISO = /^\d{4}-\d{2}-\d{2}$/
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** minúsculas, sin tildes, espacios simples. */
export function plano(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function fechaIsoValida(a: number, m: number, d: number): string | null {
  if (!Number.isInteger(a) || !Number.isInteger(m) || !Number.isInteger(d) || a < 2000 || a > 2100) return null
  const iso = `${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const dt = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso ? null : iso
}

export function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000)
}

// ─── 1. Verificación PDF ↔ tarificado ────────────────────────────────────────

export type ResultadoCampo = 'coincide' | 'no_coincide' | 'no_aparece' | 'no_comprobado'
export type CamposVerificacion = { prima: ResultadoCampo; matricula: ResultadoCampo; fechaEfecto: ResultadoCampo }
export type VerificacionPdf = {
  /** `null` = no comprobado (ningún campo se pudo comprobar). */
  estado: 'ok' | 'discrepancia' | null
  campos: CamposVerificacion
  /** Nombres de campo con discrepancia («prima», «matrícula», «fecha de efecto»). Nunca valores. */
  discrepancias: string[]
}

/** Importes escritos a la española (`1.234,56`) o con punto decimal (`1234.56`) dentro del texto. */
export function importesEnTexto(texto: string): number[] {
  const out: number[] = []
  for (const m of texto.matchAll(/(?<![\d.,])(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})(?!\d)/g)) out.push(Number(`${m[1].replace(/\./g, '')}.${m[2]}`))
  for (const m of texto.matchAll(/(?<![\d.,])(\d+)\.(\d{2})(?![\d,])/g)) out.push(Number(`${m[1]}.${m[2]}`))
  return out
}

/** Tolerancia de la prima: 1 € o el 1 % (lo mayor). */
export const toleranciaPrima = (esperada: number): number => Math.max(1, esperada * 0.01)

const normMatricula = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().replace(/[^A-Z0-9]/g, '')

function fechaEnTexto(isoEsperada: string, textoPlano: string): boolean {
  const [a, m, d] = isoEsperada.split('-').map(Number)
  const dd = `0?${d}`
  const mm = `0?${m}`
  const num = new RegExp(`(?<!\\d)${dd}\\s*[/.\\-]\\s*${mm}\\s*[/.\\-]\\s*(?:${a}|${String(a).slice(2)})(?!\\d)`)
  const iso = new RegExp(`(?<!\\d)${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}(?!\\d)`)
  const largo = new RegExp(`(?<!\\d)${dd} de ${MESES[m - 1]} de ${a}(?!\\d)`)
  return num.test(textoPlano) || iso.test(textoPlano) || largo.test(textoPlano)
}

export type EntradaVerificacion = {
  /** Texto del PDF. */
  texto: string
  /** Prima anual que dio el bot (`prima_eur`). `null` = no consta. */
  primaEur: number | null
  /** Prima total anual que la extracción leyó del PDF (ya validada con su cita). `null` = no se leyó. */
  primaPdfEur: number | null
  /** Matrícula del riesgo. `null` = no consta (no se comprueba). */
  matricula: string | null
  /** Fecha de efecto del riesgo (ISO). `null` = no consta (no se comprueba). */
  fechaEfecto: string | null
}

export function verificarProyectoPdf(e: EntradaVerificacion): VerificacionPdf {
  const t = plano(e.texto)
  const campos: CamposVerificacion = { prima: 'no_comprobado', matricula: 'no_comprobado', fechaEfecto: 'no_comprobado' }

  if (typeof e.primaEur === 'number' && Number.isFinite(e.primaEur) && e.primaEur > 0) {
    const tol = toleranciaPrima(e.primaEur)
    if (typeof e.primaPdfEur === 'number' && Number.isFinite(e.primaPdfEur)) {
      campos.prima = Math.abs(e.primaPdfEur - e.primaEur) <= tol ? 'coincide' : 'no_coincide'
    } else {
      campos.prima = importesEnTexto(e.texto).some((x) => Math.abs(x - (e.primaEur as number)) <= tol) ? 'coincide' : 'no_aparece'
    }
  }
  if (typeof e.matricula === 'string' && normMatricula(e.matricula).length >= 5) {
    campos.matricula = normMatricula(e.texto).includes(normMatricula(e.matricula)) ? 'coincide' : 'no_aparece'
  }
  if (typeof e.fechaEfecto === 'string' && ISO.test(e.fechaEfecto) && fechaIsoValida(...(e.fechaEfecto.split('-').map(Number) as [number, number, number])) !== null) {
    campos.fechaEfecto = fechaEnTexto(e.fechaEfecto, t) ? 'coincide' : 'no_aparece'
  }

  const nombres: [keyof CamposVerificacion, string][] = [['prima', 'prima'], ['matricula', 'matrícula'], ['fechaEfecto', 'fecha de efecto']]
  const discrepancias = nombres.filter(([k]) => campos[k] === 'no_coincide' || campos[k] === 'no_aparece').map(([, n]) => n)
  const comprobados = nombres.filter(([k]) => campos[k] !== 'no_comprobado').length
  return { estado: comprobados === 0 ? null : discrepancias.length > 0 ? 'discrepancia' : 'ok', campos, discrepancias }
}

const TXT_CAMPO: Record<ResultadoCampo, string> = { coincide: 'coincide', no_coincide: 'no coincide', no_aparece: 'no aparece', no_comprobado: 'no comprobada' }

/** «prima: coincide · matrícula: no aparece · fecha de efecto: no comprobada». Sin valores personales. */
export function textoVerificacion(v: VerificacionPdf): string {
  return `prima: ${TXT_CAMPO[v.campos.prima]} · matrícula: ${TXT_CAMPO[v.campos.matricula]} · fecha de efecto: ${TXT_CAMPO[v.campos.fechaEfecto]}`
}

const RESULTADOS: readonly ResultadoCampo[] = ['coincide', 'no_coincide', 'no_aparece', 'no_comprobado']
const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

/** Lo guardado (`valores.proyectoPdf.verificacion`) → forma conocida o `null` (= no comprobado / forma rara). */
export function verificacionDeJson(v: unknown): VerificacionPdf | null {
  const o = obj(v)
  const c = obj(o?.campos)
  if (!o || !c) return null
  const campo = (x: unknown): ResultadoCampo => (RESULTADOS.includes(x as ResultadoCampo) ? (x as ResultadoCampo) : 'no_comprobado')
  const campos: CamposVerificacion = { prima: campo(c.prima), matricula: campo(c.matricula), fechaEfecto: campo(c.fechaEfecto) }
  const disc = Array.isArray(o.discrepancias) ? o.discrepancias.filter((x): x is string => typeof x === 'string').slice(0, 3) : []
  const estado = o.estado === 'ok' || o.estado === 'discrepancia' ? o.estado : null
  return { estado, campos, discrepancias: disc }
}

/**
 * Matrícula y fecha de efecto del riesgo, de lo que PERSISTE tras la purga del trabajo: `oportunidades.info_riesgo`
 * (`datosVehiculo.matricula`, o la clave antigua `matricula`; `presupuestosCompanias.formulario.fechaEfecto`) y la columna
 * `tarificaciones.fecha_efecto`. Lo que no consta es `null` (no se comprueba), nunca una cadena vacía.
 */
export function riesgoParaVerificar(infoRiesgo: unknown, fechaColumna: string | null): { matricula: string | null; fechaEfecto: string | null } {
  const i = obj(infoRiesgo)
  const dv = obj(i?.datosVehiculo)
  const m = typeof dv?.matricula === 'string' && dv.matricula.trim() ? dv.matricula : typeof i?.matricula === 'string' && i.matricula.trim() ? i.matricula : null
  const f = obj(obj(i?.presupuestosCompanias)?.formulario)?.fechaEfecto
  const fecha = fechaColumna && ISO.test(fechaColumna) ? fechaColumna : typeof f === 'string' && ISO.test(f) ? f : null
  return { matricula: m, fechaEfecto: fecha }
}

// ─── 2. Caducidad del proyecto ───────────────────────────────────────────────

const FECHA_TXT = String.raw`(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{4})|(\d{1,2}) de (${MESES.join('|')}) de (\d{4})`
const ETIQUETA_VALIDEZ = String.raw`(?:valid[oa]s?\s+hasta(?:\s+el)?|validez(?:\s+del?\s+(?:presupuesto|proyecto|oferta))?(?:\s+hasta(?:\s+el)?)?|caduca(?:\s+el)?|fecha\s+de\s+caducidad)`

/**
 * Lo que dice el PDF sobre su validez: una fecha («válido hasta el 15/11/2026») o unos días («validez: 30 días»).
 * «Vigencia» NO cuenta: es el periodo de la póliza, no la validez del presupuesto. Sin frase → `null` (no se inventa).
 */
export function validezDelPdf(texto: string): { validoHasta: string | null; validezDias: number | null } {
  const t = plano(texto)
  const reFecha = new RegExp(`${ETIQUETA_VALIDEZ}[^\\d\\n]{0,40}?(?:${FECHA_TXT})`, 'g')
  let validoHasta: string | null = null
  for (const m of t.matchAll(reFecha)) {
    const iso = m[1] !== undefined
      ? fechaIsoValida(Number(m[3]), Number(m[2]), Number(m[1]))
      : fechaIsoValida(Number(m[6]), MESES.indexOf(m[5]) + 1, Number(m[4]))
    if (iso && (validoHasta === null || iso < validoHasta)) validoHasta = iso
  }
  let validezDias: number | null = null
  const d = new RegExp(`${ETIQUETA_VALIDEZ}[^\\d\\n]{0,40}?(\\d{1,3})\\s*dias`).exec(t)
  if (d) {
    const n = Number(d[1])
    if (n >= 1 && n <= 365) validezDias = n
  }
  return { validoHasta, validezDias }
}

export type OrigenCaducidad = 'pdf' | 'portal' | 'compania' | 'desconocida'
export type CaducidadProyecto = { caduca: string | null; origen: OrigenCaducidad }

export function caducidadProyecto(e: {
  /** Día en que se guardó el proyecto (ISO). */
  guardadoEn: string | null
  compania: string
  validoHastaPdf: string | null
  validezDiasPdf: number | null
  /** La validez que dio el portal en la oferta (`validaHasta`). */
  validaHastaPortal: string | null
}): CaducidadProyecto {
  if (e.validoHastaPdf && ISO.test(e.validoHastaPdf)) return { caduca: e.validoHastaPdf, origen: 'pdf' }
  if (e.guardadoEn && ISO.test(e.guardadoEn) && e.validezDiasPdf !== null) return { caduca: sumarDias(e.guardadoEn, e.validezDiasPdf), origen: 'pdf' }
  if (e.validaHastaPortal && ISO.test(e.validaHastaPortal)) return { caduca: e.validaHastaPortal, origen: 'portal' }
  const dias = Object.hasOwn(VALIDEZ_PROYECTO_DIAS, e.compania.trim().toLowerCase()) ? VALIDEZ_PROYECTO_DIAS[e.compania.trim().toLowerCase()] : null
  if (dias !== null && dias !== undefined && e.guardadoEn && ISO.test(e.guardadoEn)) return { caduca: sumarDias(e.guardadoEn, dias), origen: 'compania' }
  return { caduca: null, origen: 'desconocida' }
}

export type EstadoCaducidad = 'desconocida' | 'vigente' | 'caduca_pronto' | 'caducado'

/** `caduca_pronto` = faltan 0..5 días (el día de caducidad aún vale). */
export function estadoCaducidad(caduca: string | null, hoy: string): EstadoCaducidad {
  if (!caduca || !ISO.test(caduca)) return 'desconocida'
  const d = diasEntre(hoy, caduca)
  return d < 0 ? 'caducado' : d <= DIAS_AVISO_CADUCIDAD ? 'caduca_pronto' : 'vigente'
}

// ─── 3. «Limpio / con supuestos» ─────────────────────────────────────────────

const PREFIJO_SUPUESTOS = /^\s*precio con supuestos\b/i

export type MarcaPrecio = { estado: 'limpio' | 'con_supuestos'; supuestos: string[] }

/**
 * Un precio de bot es «con supuestos» si algún aviso suyo empieza por «Precio con supuestos» (o su lista `supuestos` no
 * está vacía); «limpio» si se miraron sus avisos y no hay. `null` = no se pueden mirar (no es un precio de bot, o no
 * constan sus avisos): nunca «limpio» por defecto.
 */
export function marcaPrecio(avisos: unknown, supuestos: unknown): MarcaPrecio | null {
  if (!Array.isArray(avisos) && !Array.isArray(supuestos)) return null
  const lista = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : [])
  const todos = [...new Set([...lista(supuestos), ...lista(avisos).filter((a) => PREFIJO_SUPUESTOS.test(a))])]
  return todos.length > 0 ? { estado: 'con_supuestos', supuestos: todos.slice(0, 20) } : { estado: 'limpio', supuestos: [] }
}
