/**
 * Consultas a compañías por correo desde la oportunidad (15/10/2026, fase 1).
 * Spec: docs/superpowers/specs/2026-10-15-correduria-consultas-companias-design.md.
 *
 * Reglas PURAS (sin E/S, `node --test`):
 *   - destinatarios: ≥1 y todos de la MISMA compañía (un correo por compañía);
 *   - agrupar la selección del panel por compañía;
 *   - LISTA BLANCA de campos de riesgo que puede ver la IA. La identidad del tomador NUNCA entra: en el borrador
 *     solo existe como marcadores `{{NOMBRE_TOMADOR}}`/`{{DOC_TOMADOR}}`, que asegura sustituye en su servidor justo
 *     antes de enviar. La entrada de la IA se ARMA con la lista blanca, no quitando campos de un objeto completo;
 *   - competencia: solo compañía/prima/coberturas, y solo si se marca la casilla;
 *   - datos mínimos por ramo (RC: los seis de `info_riesgo.datosRiesgoLibre`, el MISMO bloque que edita la pantalla del
 *     riesgo; el resto reutiliza los `faltan` de datos-riesgo-ramo). Avisa, no bloquea. `null` = no se pudo calcular;
 *   - `responderAntesPropuesta(vencimiento)` = vencimiento − 15 días, o `null` (no se inventa);
 *   - `codigo_ref` `ASG-XXXX` (va en el asunto como `[ASG-XXXX]`).
 *
 * 🚨 `null` = «no se sabe» en todo: un dato de riesgo `null` se redacta «no consta», nunca 0.
 */
import { RAMOS, etiquetaRamo } from './filtro-cartera.ts'
import { CAMPOS_LIBRE_RC, ETIQUETA_CAMPO_LIBRE, RAMOS_RC_LIBRE, esRamoRc, leerDatosRiesgoLibre } from './datos-riesgo-libre.ts'
import { ETIQUETA_CAMPO_VEHICULO } from './datos-vehiculo-riesgo.ts'
import { ETIQUETA_CAMPO_VIVIENDA } from './datos-vivienda-riesgo.ts'
import { ETIQUETA_CAMPO_CAPITAL } from './datos-capital-riesgo.ts'
import { ETIQUETA_CAMPO_COMERCIO } from './datos-comercio-riesgo.ts'
import { claveDatosDeRamo, type ClaveDatosRiesgo } from './datos-riesgo-ramo.ts'

// ─── Estados y tipos (los mismos valores que los enums SQL de 2026-10-15_seguros_consulta_compania.sql) ─────

export const ESTADOS_CONSULTA_COMPANIA = [
  'borrador',
  'enviada',
  'respondida',
  'pide_info',
  'rechazada',
  'sin_respuesta',
  'descartada',
  'cancelada',
] as const
export type EstadoConsultaCompania = (typeof ESTADOS_CONSULTA_COMPANIA)[number]

export function esEstadoConsultaCompania(v: unknown): v is EstadoConsultaCompania {
  return typeof v === 'string' && (ESTADOS_CONSULTA_COMPANIA as readonly string[]).includes(v)
}

/** `consulta` = una oportunidad; `paquete` = varias del mismo cliente a una compañía (fase 4; el modelo ya lo admite). */
export const TIPOS_CONSULTA_COMPANIA = ['consulta', 'paquete'] as const
export type TipoConsultaCompania = (typeof TIPOS_CONSULTA_COMPANIA)[number]

export const MARCADOR_NOMBRE_TOMADOR = '{{NOMBRE_TOMADOR}}'
export const MARCADOR_DOC_TOMADOR = '{{DOC_TOMADOR}}'

/** Aviso FIJO junto a cualquier adjunto (decisión 8 del spec). */
export const AVISO_ADJUNTO_CONSULTA =
  'Este documento puede llevar IBAN, DNI de otros intervinientes o datos de salud: revísalo antes de enviar'

// ─── Destinatarios ──────────────────────────────────────────────────────────────

export type ContactoParaConsulta = {
  id: string
  companiaCodigoDgs: string
  email: string | null
  activo: boolean
}

export type ValidacionDestinatarios =
  | { ok: true; companiaCodigoDgs: string; contactoIds: string[] }
  | { ok: false; motivo: 'vacio' | 'desconocido' | 'varias_companias' | 'sin_email' | 'inactivo'; ids?: string[] }

/**
 * Los destinatarios de UN correo: ≥1, sin repetidos, todos conocidos, activos, con email y de la MISMA compañía.
 * Si se pasa `companiaCodigoDgs`, además tienen que ser de esa. Un id desconocido NO se ignora: se rechaza.
 */
export function validarDestinatarios(
  ids: readonly string[],
  contactos: readonly ContactoParaConsulta[],
  companiaCodigoDgs?: string,
): ValidacionDestinatarios {
  const unicos = [...new Set(ids.map((i) => i.trim()).filter((i) => i !== ''))]
  if (unicos.length === 0) return { ok: false, motivo: 'vacio' }
  const porId = new Map(contactos.map((c) => [c.id, c]))
  const desconocidos = unicos.filter((i) => !porId.has(i))
  if (desconocidos.length > 0) return { ok: false, motivo: 'desconocido', ids: desconocidos }
  const elegidos = unicos.map((i) => porId.get(i)!)
  const companias = new Set(elegidos.map((c) => c.companiaCodigoDgs))
  if (companias.size !== 1) return { ok: false, motivo: 'varias_companias' }
  const compania = elegidos[0].companiaCodigoDgs
  if (companiaCodigoDgs !== undefined && compania !== companiaCodigoDgs) return { ok: false, motivo: 'varias_companias' }
  const inactivos = elegidos.filter((c) => !c.activo).map((c) => c.id)
  if (inactivos.length > 0) return { ok: false, motivo: 'inactivo', ids: inactivos }
  const sinEmail = elegidos.filter((c) => !c.email || !c.email.includes('@')).map((c) => c.id)
  if (sinEmail.length > 0) return { ok: false, motivo: 'sin_email', ids: sinEmail }
  return { ok: true, companiaCodigoDgs: compania, contactoIds: unicos }
}

export type GrupoConsulta = { companiaCodigoDgs: string; contactoIds: string[] }

/**
 * La selección del panel (personas de varias compañías) → un grupo POR COMPAÑÍA, en el orden en que aparece cada
 * compañía. Un id que no está en `contactos` se devuelve aparte (`desconocidos`), nunca se descarta en silencio.
 */
export function agruparPorCompania(
  ids: readonly string[],
  contactos: readonly ContactoParaConsulta[],
): { grupos: GrupoConsulta[]; desconocidos: string[] } {
  const porId = new Map(contactos.map((c) => [c.id, c]))
  const grupos = new Map<string, string[]>()
  const desconocidos: string[] = []
  for (const bruto of ids) {
    const id = bruto.trim()
    if (id === '') continue
    const c = porId.get(id)
    if (!c) {
      if (!desconocidos.includes(id)) desconocidos.push(id)
      continue
    }
    const lista = grupos.get(c.companiaCodigoDgs) ?? []
    if (!lista.includes(id)) lista.push(id)
    grupos.set(c.companiaCodigoDgs, lista)
  }
  return { grupos: [...grupos].map(([companiaCodigoDgs, contactoIds]) => ({ companiaCodigoDgs, contactoIds })), desconocidos }
}

// ─── Lista blanca de campos de riesgo para la IA ────────────────────────────────

/**
 * Los ÚNICOS campos de riesgo que pueden llegar al prompt de la IA. Nada de identidad (nombre, apellidos,
 * DNI/NIE/CIF/NIF, teléfono, email), ni dirección exacta (calle, número, CP, referencia catastral), ni matrícula,
 * ni salud (fumador), ni fechas de nacimiento, ni notas libres (pueden llevar cualquier cosa).
 * 🪤 Cepo en consulta-compania.test.ts: meter aquí `nif` o `nombre` lo pone en rojo.
 */
export const CAMPOS_RIESGO_IA = [
  // RC: datos mínimos de consulta (`info_riesgo.datosRiesgoLibre`, ver CAMPOS_LIBRE_RC)
  'actividad',
  'cnae',
  'facturacion',
  'plantilla',
  'siniestralidad3Anios',
  'limiteDeseado',
  // Comercio
  'familiaActividad',
  'numeroEmpleados',
  'facturacionAnual',
  'metrosCuadrados',
  'superficieTotal',
  'anioConstruccion',
  'regimenLocal',
  'aforo',
  // Vivienda
  'tipoVivienda',
  'uso',
  'ocupacion',
  'anioUltimaReforma',
  'capitalContinente',
  'capitalContenido',
  'alarma',
  'material',
  'calidad',
  // Personas (vida, salud, decesos): sin fumador ni fechas de nacimiento
  'capital',
  'duracionAnios',
  'modalidadDeseada',
  'profesion',
  // Vehículo: sin matrícula ni CP de circulación
  'marca',
  'modelo',
  'version',
  'fechaMatriculacion',
  'kmAnuales',
  'tipoVehiculo',
  'cilindradaCc',
  // Riesgo libre (RC, comunidades, otros)
  'descripcion',
  // Ubicación GRUESA
  'provincia',
] as const
export type CampoRiesgoIA = (typeof CAMPOS_RIESGO_IA)[number]

/** Campos que JAMÁS pueden estar en la lista blanca (lo vigila el test). */
export const CAMPOS_IDENTIDAD_PROHIBIDOS = [
  'nombre',
  'apellidos',
  'razonSocial',
  'nif',
  'dni',
  'nie',
  'cif',
  'documento',
  'telefono',
  'email',
  'direccion',
  'nombreVia',
  'numeroVia',
  'cp',
  'referenciaCatastral',
  'matricula',
  'iban',
  'fechaNacimiento',
  'fumador',
  'notas',
] as const

export const ETIQUETA_CAMPO_RIESGO_IA: Record<CampoRiesgoIA, string> = {
  actividad: 'Actividad',
  cnae: 'CNAE',
  facturacion: 'Facturación anual (€)',
  plantilla: 'Plantilla (personas)',
  siniestralidad3Anios: 'Siniestralidad últimos 3 años',
  limiteDeseado: 'Límite de indemnización deseado (€)',
  familiaActividad: 'Familia de actividad',
  numeroEmpleados: 'Número de empleados',
  facturacionAnual: 'Facturación anual (€)',
  metrosCuadrados: 'Superficie construida (m²)',
  superficieTotal: 'Superficie total (m²)',
  anioConstruccion: 'Año de construcción',
  regimenLocal: 'Local en propiedad o alquiler',
  aforo: 'Aforo (personas)',
  tipoVivienda: 'Tipo de vivienda',
  uso: 'Uso',
  ocupacion: 'Ocupación',
  anioUltimaReforma: 'Año de la última reforma',
  capitalContinente: 'Capital continente (€)',
  capitalContenido: 'Capital contenido (€)',
  alarma: 'Alarma',
  material: 'Materiales',
  calidad: 'Calidad de construcción',
  capital: 'Capital (€)',
  duracionAnios: 'Duración (años)',
  modalidadDeseada: 'Modalidad deseada',
  profesion: 'Profesión',
  marca: 'Marca',
  modelo: 'Modelo',
  version: 'Versión',
  fechaMatriculacion: 'Fecha de matriculación',
  kmAnuales: 'Km anuales',
  tipoVehiculo: 'Tipo de vehículo',
  cilindradaCc: 'Cilindrada (cc)',
  descripcion: 'Qué se asegura',
  provincia: 'Provincia',
}

export type ValorRiesgo = string | number | boolean | null
const MAX_TEXTO_RIESGO = 200

function valorRiesgo(v: unknown): ValorRiesgo | undefined {
  if (v === null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') {
    const s = v.trim()
    if (s === '') return null
    // Valor de cajón: es «no se sabe», no un dato.
    if (/^(N\/A|NA|NULL|OTRO|SIN DATOS?|NO CONSTA|-+)$/i.test(s)) return null
    return s.slice(0, MAX_TEXTO_RIESGO)
  }
  return undefined // objetos, listas…: no entran
}

/**
 * El riesgo que se le da a la IA: SOLO los campos de {@link CAMPOS_RIESGO_IA} presentes en las fuentes (en orden;
 * la primera fuente con la clave gana). Se recorre la LISTA BLANCA, no el objeto: un campo nuevo en `info_riesgo`
 * no entra hasta que alguien lo añade a la lista a propósito. `null` = consta como «no consta».
 */
export function riesgoParaIA(...fuentes: unknown[]): Partial<Record<CampoRiesgoIA, ValorRiesgo>> {
  const out: Partial<Record<CampoRiesgoIA, ValorRiesgo>> = {}
  const objs = fuentes.filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null && !Array.isArray(f))
  for (const campo of CAMPOS_RIESGO_IA) {
    for (const o of objs) {
      if (!Object.prototype.hasOwnProperty.call(o, campo)) continue
      const v = valorRiesgo(o[campo])
      if (v === undefined) continue
      out[campo] = v
      if (v !== null) break // un dato gana; un «no se sabe» deja mirar la siguiente fuente
    }
  }
  return out
}

// ─── Competencia ────────────────────────────────────────────────────────────────

export type CompetenciaConsulta = { compania: string | null; prima: number | null; coberturas: string | null }

function numeroPrima(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null
  if (typeof v !== 'string') return null
  const s = v.trim().replace(/€/g, '').replace(/\s/g, '')
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(s)) return null
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s)
  return Number.isFinite(n) && n > 0 ? n : null
}

function textoCorto(v: unknown, max: number): string | null {
  if (typeof v === 'string') {
    const s = v.trim()
    return s === '' ? null : s.slice(0, max)
  }
  if (Array.isArray(v)) {
    const partes = v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim())
    return partes.length === 0 ? null : partes.join(', ').slice(0, max)
  }
  return null
}

/**
 * Lo que de `oportunidades.poliza_competencia` se puede contar: compañía, prima y coberturas. NADA más (ni nº de
 * póliza, ni IBAN, ni tomador). `null` = no hay póliza de competencia o no se sabe ninguno de los tres datos.
 */
export function competenciaDeOportunidad(polizaCompetencia: unknown): CompetenciaConsulta | null {
  if (typeof polizaCompetencia !== 'object' || polizaCompetencia === null || Array.isArray(polizaCompetencia)) return null
  const p = polizaCompetencia as Record<string, unknown>
  const c: CompetenciaConsulta = {
    compania: textoCorto(p.aseguradora, 120),
    prima: numeroPrima(p.prima),
    coberturas: textoCorto(p.coberturas, 400),
  }
  return c.compania === null && c.prima === null && c.coberturas === null ? null : c
}

/** La competencia que va a la IA: solo si se marcó la casilla. */
export function competenciaParaIA(polizaCompetencia: unknown, incluir: boolean): CompetenciaConsulta | null {
  return incluir ? competenciaDeOportunidad(polizaCompetencia) : null
}

// ─── Datos mínimos por ramo ─────────────────────────────────────────────────────

export const RAMOS_RC_CONSULTA = RAMOS_RC_LIBRE
export const CAMPOS_MINIMOS_RC = CAMPOS_LIBRE_RC
export type CampoMinimoRc = (typeof CAMPOS_MINIMOS_RC)[number]
export type DatosConsultaRc = Record<CampoMinimoRc, string | number | null>

export function esRamoRcConsulta(ramo: unknown): boolean {
  return esRamoRc(ramo)
}

/**
 * Los seis datos mínimos de RC, leídos de `info_riesgo.datosRiesgoLibre` (el bloque que edita la pantalla del riesgo;
 * regla 22 de la skill correduria-crm: un solo sitio por dato). Lo que no está es `null` (no se sabe), nunca 0.
 */
export function leerDatosConsultaRc(info: unknown): DatosConsultaRc {
  const i = typeof info === 'object' && info !== null && !Array.isArray(info) ? (info as Record<string, unknown>) : {}
  const b = leerDatosRiesgoLibre(i.datosRiesgoLibre)
  const out = {} as DatosConsultaRc
  for (const k of CAMPOS_MINIMOS_RC) {
    const v = b === null ? undefined : valorRiesgo(b[k])
    out[k] = typeof v === 'string' || typeof v === 'number' ? v : null
  }
  return out
}

/**
 * Lo que falta para que la consulta no vuelva con preguntas. RC: los seis datos mínimos (claves de
 * {@link CAMPOS_MINIMOS_RC}). Resto de ramos: los `faltan` que ya calcula `leerBloqueDeRamo` (se pasan tal cual).
 * `null` = no se ha podido calcular (≠ `[]`, «no falta nada»). Es un AVISO: quien llama nunca bloquea por esto.
 */
export function faltanDatosConsulta(ramo: string, e: { faltanRamo: readonly string[] | null; datosRc?: DatosConsultaRc | null }): string[] | null {
  if (esRamoRcConsulta(ramo)) {
    const d = e.datosRc ?? null
    return CAMPOS_MINIMOS_RC.filter((k) => d === null || d[k] === null)
  }
  return e.faltanRamo === null ? null : [...e.faltanRamo]
}

const ETIQUETAS_FALTA_POR_CLAVE: Record<ClaveDatosRiesgo, Record<string, string>> = {
  datosVehiculo: ETIQUETA_CAMPO_VEHICULO,
  datosVivienda: ETIQUETA_CAMPO_VIVIENDA,
  datosCapital: ETIQUETA_CAMPO_CAPITAL,
  datosComercio: ETIQUETA_CAMPO_COMERCIO,
  datosRiesgoLibre: ETIQUETA_CAMPO_LIBRE,
}

/** La etiqueta legible de una clave de `faltan` del ramo (la del bloque de ESE ramo). Sin etiqueta conocida, tal cual. */
export function etiquetaFaltaConsulta(ramo: string, clave: string): string {
  return ETIQUETAS_FALTA_POR_CLAVE[claveDatosDeRamo(ramo)][clave] ?? clave
}

/**
 * Los datos del bloque del ramo que se pueden dar a la IA (luego pasan por la lista blanca de {@link riesgoParaIA}).
 * Fuera de RC, los seis datos mínimos de RC del bloque libre no se cuentan (no son de ese riesgo: no se redactan
 * como «no consta»).
 */
export function datosRamoParaConsulta(ramo: string, datosRamo: Record<string, unknown> | null): Record<string, unknown> | null {
  if (datosRamo === null || esRamoRcConsulta(ramo)) return datosRamo
  const out = { ...datosRamo }
  for (const k of CAMPOS_LIBRE_RC) delete out[k]
  return out
}

// ─── Fecha límite ───────────────────────────────────────────────────────────────

export const DIAS_MARGEN_RESPUESTA = 15

function isoDia(v: unknown): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  if (typeof v !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim())
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
    ? d.toISOString().slice(0, 10)
    : null
}

/**
 * Propuesta de «responder antes de»: vencimiento de la póliza actual − 15 días (aaaa-mm-dd). Sin vencimiento
 * conocido → `null` (no se inventa). Si se pasa `hoy` y la propuesta no es posterior a hoy → `null` (una fecha
 * pasada no sirve de margen; Alberto pone otra a mano).
 */
export function responderAntesPropuesta(vencimiento: unknown, hoy?: string): string | null {
  const v = isoDia(vencimiento)
  if (v === null) return null
  const d = new Date(`${v}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - DIAS_MARGEN_RESPUESTA)
  const propuesta = d.toISOString().slice(0, 10)
  const h = hoy === undefined ? null : isoDia(hoy)
  if (h !== null && propuesta <= h) return null
  return propuesta
}

/** Una fecha `responderAntes` del cuerpo de una petición: aaaa-mm-dd válida, o `null`. `undefined` = inválida. */
export function leerResponderAntes(v: unknown): string | null | undefined {
  if (v === null) return null
  const d = isoDia(v)
  return d === null || typeof v !== 'string' || v.trim().length !== 10 ? undefined : d
}

// ─── Código de referencia ───────────────────────────────────────────────────────

/** Sin 0/O ni 1/I/L: se dicta y se teclea sin dudas. */
const ALFABETO_REF = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const PATRON_CODIGO_REF = /^ASG-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/

/** `ASG-XXXX`. La unicidad la da la BD (UNIQUE); quien inserta reintenta con otro si choca. */
export function generarCodigoRef(aleatorio: () => number = Math.random): string {
  let s = 'ASG-'
  for (let i = 0; i < 4; i++) s += ALFABETO_REF[Math.floor(aleatorio() * ALFABETO_REF.length) % ALFABETO_REF.length]
  return s
}

/** El asunto lleva siempre `[ASG-XXXX]` al principio (si Alberto lo borra al editar, se vuelve a poner al enviar). */
export function asuntoConCodigo(asunto: string, codigoRef: string): string {
  const etiqueta = `[${codigoRef}]`
  const a = asunto.trim()
  return a.includes(etiqueta) ? a : `${etiqueta} ${a}`.trim()
}

export function asuntoPropuesto(ramo: string, codigoRef: string): string {
  return `[${codigoRef}] Consulta de precio · ${etiquetaRamo(ramo)}`
}

// ─── Marcadores de identidad ────────────────────────────────────────────────────

const RE_MARCADOR = /\{\{\s*(NOMBRE_TOMADOR|DOC_TOMADOR)\s*\}\}/g

export function quedanMarcadores(texto: string): boolean {
  return /\{\{\s*[A-Z_]+\s*\}\}/.test(texto)
}

/**
 * Sustituye los marcadores. Con `incluirIdentidad=false` se QUITA cada línea que lleve un marcador (no queda
 * «Tomador: » colgando ni un marcador sin resolver). Con `true`, se pone el dato; si no se sabe, «(no consta)».
 * Sirve igual para el envío (documento entero, en el servidor de asegura) y para la pantalla (enmascarado).
 */
export function sustituirMarcadores(
  texto: string,
  e: { incluirIdentidad: boolean; nombre: string | null; documento: string | null },
): string {
  if (!e.incluirIdentidad) {
    return texto
      .split('\n')
      .filter((l) => !new RegExp(RE_MARCADOR.source).test(l))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
  }
  const nombre = e.nombre?.trim() || '(no consta)'
  const doc = e.documento?.trim() || '(no consta)'
  return texto.replace(RE_MARCADOR, (_m, k: string) => (k === 'NOMBRE_TOMADOR' ? nombre : doc))
}

/**
 * Tras la IA: con identidad, el cuerpo TIENE que llevar los dos marcadores (si la IA los omitió, se añade la línea
 * del tomador al principio). Sin identidad, se quitan los que la IA haya puesto.
 */
export function asegurarMarcadores(cuerpo: string, incluirIdentidad: boolean): string {
  if (!incluirIdentidad) return sustituirMarcadores(cuerpo, { incluirIdentidad: false, nombre: null, documento: null })
  const tieneNombre = cuerpo.includes(MARCADOR_NOMBRE_TOMADOR)
  const tieneDoc = cuerpo.includes(MARCADOR_DOC_TOMADOR)
  if (tieneNombre && tieneDoc) return cuerpo
  const linea = `Tomador: ${MARCADOR_NOMBRE_TOMADOR} (${MARCADOR_DOC_TOMADOR})`
  const sinSueltos = cuerpo.split('\n').filter((l) => !new RegExp(RE_MARCADOR.source).test(l)).join('\n')
  return `${linea}\n\n${sinSueltos.trim()}`
}

// ─── El prompt y la plantilla ───────────────────────────────────────────────────

function fechaEs(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

function importeEs(n: number): string {
  const [ent, dec] = n.toFixed(2).split('.')
  return `${ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}€`
}

function lineaValor(campo: CampoRiesgoIA, v: ValorRiesgo): string {
  const t = v === null ? 'no consta' : typeof v === 'boolean' ? (v ? 'sí' : 'no') : String(v)
  return `- ${ETIQUETA_CAMPO_RIESGO_IA[campo]}: ${t}`
}

export type EntradaBorradorConsulta = {
  ramo: string
  companiaNombre: string
  riesgo: Partial<Record<CampoRiesgoIA, ValorRiesgo>>
  competencia: CompetenciaConsulta | null
  responderAntes: string | null
  incluirIdentidad: boolean
}

function bloqueRiesgo(e: EntradaBorradorConsulta): string[] {
  const lineas = CAMPOS_RIESGO_IA.filter((k) => e.riesgo[k] !== undefined).map((k) => lineaValor(k, e.riesgo[k] as ValorRiesgo))
  return lineas.length > 0 ? lineas : ['- (sin datos de riesgo registrados)']
}

function fraseCompetencia(c: CompetenciaConsulta): string {
  const partes = [
    c.compania ? `de ${c.compania}` : null,
    c.prima !== null ? `por ${importeEs(c.prima)}` : null,
    c.coberturas ? `con ${c.coberturas}` : null,
  ].filter(Boolean)
  return `El cliente tiene actualmente póliza/oferta ${partes.join(' ')}. ¿Podéis mejorarla?`
}

/**
 * El prompt para `iaTexto()`. Se arma SOLO con la entrada (lista blanca + competencia saneada + fecha): por
 * construcción no hay sitio para la identidad; la IA recibe los marcadores como texto literal a conservar.
 */
export function promptBorradorConsulta(e: EntradaBorradorConsulta): { system: string; prompt: string } {
  const system =
    'Eres el asistente de una correduría de seguros española (Grupo ASegura). Redactas en español, con tono ' +
    'profesional y cercano, correos breves a comerciales/técnicos de compañías aseguradoras pidiendo precio para ' +
    'un riesgo. No inventes datos: lo que figura como «no consta» se dice así o se pide. No pongas firma ni saludo ' +
    'final con nombre (lo añade el corredor). Devuelve SOLO el cuerpo del correo, sin asunto.'
  const lineas = [
    `Redacta el cuerpo de un correo a ${e.companiaNombre} pidiendo precio para un seguro de ${etiquetaRamo(e.ramo)}.`,
    '',
    'Datos del riesgo:',
    ...bloqueRiesgo(e),
  ]
  if (e.incluirIdentidad) {
    lineas.push(
      '',
      `Incluye una línea con el tomador usando EXACTAMENTE estos marcadores, sin cambiarlos: «Tomador: ${MARCADOR_NOMBRE_TOMADOR} (${MARCADOR_DOC_TOMADOR})».`,
    )
  } else {
    lineas.push('', 'No menciones al tomador por su nombre ni documento.')
  }
  if (e.competencia) lineas.push('', `Añade esta referencia de competencia: «${fraseCompetencia(e.competencia)}»`)
  if (e.responderAntes) lineas.push('', `Pide respuesta antes del ${fechaEs(e.responderAntes)}.`)
  return { system, prompt: lineas.join('\n') }
}

/** Plantilla fija (sin IA) con la misma entrada: el borrador si la IA no responde. */
export function plantillaBorradorConsulta(e: EntradaBorradorConsulta): string {
  const l = [
    'Hola:',
    '',
    `Os escribimos desde Grupo ASegura para pedir precio de un seguro de ${etiquetaRamo(e.ramo)}.`,
    '',
  ]
  if (e.incluirIdentidad) l.push(`Tomador: ${MARCADOR_NOMBRE_TOMADOR} (${MARCADOR_DOC_TOMADOR})`, '')
  l.push('Datos del riesgo:', ...bloqueRiesgo(e))
  if (e.competencia) l.push('', fraseCompetencia(e.competencia))
  if (e.responderAntes) l.push('', `Si es posible, necesitaríamos respuesta antes del ${fechaEs(e.responderAntes)}.`)
  l.push('', 'Quedamos atentos. Muchas gracias.')
  return l.join('\n')
}

// ─── Ida y vuelta con la pantalla (el DNI entero no cruza el puerto) ────────────

export const NOMBRE_NO_CONSTA = '[nombre no consta]'
export const DOCUMENTO_NO_CONSTA = '[documento no consta]'

/** Lo que pinta plataforma en el lugar de cada marcador: el nombre y el documento ENMASCARADO (o «no consta»). */
export function identidadParaPantalla(nombre: string | null, documentoEnmascarado: string | null): { nombre: string; documento: string } {
  return { nombre: nombre?.trim() || NOMBRE_NO_CONSTA, documento: documentoEnmascarado?.trim() || DOCUMENTO_NO_CONSTA }
}

/**
 * El cuerpo para la pantalla: marcadores → nombre y documento enmascarado. Con `incluirIdentidad=false` no hay
 * marcadores (se quitaron al redactar) y no se añade nada.
 */
export function cuerpoParaPantalla(cuerpo: string, e: { incluirIdentidad: boolean; nombre: string | null; documentoEnmascarado: string | null }): string {
  if (!e.incluirIdentidad) return sustituirMarcadores(cuerpo, { incluirIdentidad: false, nombre: null, documento: null })
  const p = identidadParaPantalla(e.nombre, e.documentoEnmascarado)
  return sustituirMarcadores(cuerpo, { incluirIdentidad: true, nombre: p.nombre, documento: p.documento })
}

function escaparRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Lo que vuelve de la pantalla al editar (con nombre y DNI ENMASCARADO) → otra vez con marcadores, para que al enviar
 * asegura ponga el documento entero. Si Alberto borró la línea, no hay marcador y la identidad no sale.
 * 🚨 Un documento enmascarado que sobreviva aquí NUNCA se envía tal cual: `cuerpoTieneDocumentoEnmascarado` lo caza.
 */
export function volverAMarcadores(texto: string, e: { nombre: string | null; documentoEnmascarado: string | null }): string {
  const p = identidadParaPantalla(e.nombre, e.documentoEnmascarado)
  return texto
    .replace(new RegExp(escaparRe(p.documento), 'g'), MARCADOR_DOC_TOMADOR)
    .replace(new RegExp(escaparRe(p.nombre), 'g'), MARCADOR_NOMBRE_TOMADOR)
}

/** ¿Queda un documento enmascarado (`*****678Z`) o un «no consta» de pantalla en el texto? Entonces no se envía. */
export function cuerpoTieneDocumentoEnmascarado(texto: string): boolean {
  return /\*{3,}[0-9A-Za-z]{1,4}\b/.test(texto) || texto.includes(DOCUMENTO_NO_CONSTA) || texto.includes(NOMBRE_NO_CONSTA)
}

/** ¿El cuerpo pide identidad? (algún marcador presente). Lo que se ENVÍA manda sobre la casilla. */
export function cuerpoLlevaIdentidad(cuerpo: string): boolean {
  return new RegExp(RE_MARCADOR.source).test(cuerpo)
}

// ─── Ramos de un contacto (tres estados) ────────────────────────────────────────

/**
 * `ramos` de un contacto tal como llega al puerto: `null` = sin clasificar (NUNCA «todos»), `[]` = revisado y sin
 * ramos, lista = esos ramos (del enum `tipo_seguro`, sin repetir). Un ramo que no existe se DECLARA, no se ignora.
 */
export function leerRamosContacto(v: unknown): { ok: true; ramos: string[] | null } | { ok: false; desconocidos: string[] } {
  if (v === null) return { ok: true, ramos: null }
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) return { ok: false, desconocidos: [] }
  const validos = new Set<string>(RAMOS.map((r) => r.v))
  const unicos = [...new Set((v as string[]).map((x) => x.trim()))]
  const desconocidos = unicos.filter((x) => !validos.has(x))
  return desconocidos.length > 0 ? { ok: false, desconocidos } : { ok: true, ramos: unicos }
}
