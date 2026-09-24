/**
 * «Pídele los datos al cliente» (24/09/2026). Alberto: un cliente de la base le
 * escribe para un presupuesto de moto; él abre la oportunidad y le manda un
 * enlace para que rellene lo que falta (fecha del carné, matrícula, la moto…);
 * al completarlo le llega el aviso para tarificar.
 *
 * Aquí solo se decide QUÉ se pide y se valida lo que llega. Reglas del enlace
 * (decisión de Alberto: enlace directo, sin código):
 *   - La página NO enseña ningún dato del cliente: solo pide.
 *   - Lo que llega es «declarado por quien tenía el enlace»: sirve para
 *     presupuestar y se verifica al emitir. NO se escribe en la ficha.
 */
import { normalizarCp, normalizarDni, normalizarFechaNacimiento } from './cliente-edicion.ts'

export const RAMOS_SOLICITUD = ['moto', 'auto'] as const
export type RamoSolicitud = (typeof RAMOS_SOLICITUD)[number]

export function ramoSolicitud(v: unknown): RamoSolicitud | null {
  return RAMOS_SOLICITUD.find((r) => r === v) ?? null
}

export type TipoCampo = 'texto' | 'fecha' | 'opcion' | 'numero' | 'si_no' | 'texto_largo'

export type CampoSolicitud = {
  clave: string
  etiqueta: string
  tipo: TipoCampo
  obligatorio: boolean
  ayuda?: string
  opciones?: readonly { valor: string; etiqueta: string }[]
  /** Solo se enseña si el campo `si_no` indicado vale `true`. */
  siMarcado?: string
}

/** Lo que la ficha YA tiene: eso no se le vuelve a pedir. */
export type ConocidoFicha = {
  dni: boolean
  fechaNacimiento: boolean
  codigoPostal: boolean
  carnetMoto: boolean
  carnetCoche: boolean
}

export const CARNETS_MOTO_SOLICITUD = [
  { valor: 'A', etiqueta: 'A (sin límite de potencia)' },
  { valor: 'A2', etiqueta: 'A2' },
  { valor: 'A1', etiqueta: 'A1 (hasta 125 cc)' },
  { valor: 'AM', etiqueta: 'AM (ciclomotor)' },
  { valor: 'B', etiqueta: 'Solo el de coche (B), para motos de 125 cc' },
] as const

export const GARAJES_SOLICITUD = [
  { valor: 'garaje_privado', etiqueta: 'Garaje particular' },
  { valor: 'garaje_comunitario', etiqueta: 'Garaje comunitario' },
  { valor: 'calle', etiqueta: 'En la calle' },
] as const

/** Qué se le pide al cliente para ese ramo, quitando lo que la ficha ya sabe. */
export function camposSolicitud(ramo: RamoSolicitud, conocido: ConocidoFicha): CampoSolicitud[] {
  const moto = ramo === 'moto'
  const campos: CampoSolicitud[] = []
  if (!conocido.dni) campos.push({ clave: 'dni', etiqueta: 'DNI o NIE del conductor principal', tipo: 'texto', obligatorio: true })
  if (!conocido.fechaNacimiento) campos.push({ clave: 'fechaNacimiento', etiqueta: 'Fecha de nacimiento', tipo: 'fecha', obligatorio: true })
  if (!conocido.codigoPostal) {
    campos.push({ clave: 'codigoPostal', etiqueta: `Código postal donde duerme ${moto ? 'la moto' : 'el coche'}`, tipo: 'texto', obligatorio: true })
  }
  if (moto && !conocido.carnetMoto) {
    campos.push({ clave: 'tipoCarnet', etiqueta: 'Carné con el que la conduces', tipo: 'opcion', obligatorio: true, opciones: CARNETS_MOTO_SOLICITUD })
    campos.push({ clave: 'fechaCarnet', etiqueta: 'Fecha de expedición de ese carné', tipo: 'fecha', obligatorio: true, ayuda: 'Viene en el propio carné.' })
  }
  if (!moto && !conocido.carnetCoche) {
    campos.push({ clave: 'fechaCarnet', etiqueta: 'Fecha del carné de coche (B)', tipo: 'fecha', obligatorio: true, ayuda: 'Viene en el propio carné.' })
  }
  campos.push(
    { clave: 'matricula', etiqueta: 'Matrícula', tipo: 'texto', obligatorio: true },
    { clave: 'marca', etiqueta: 'Marca', tipo: 'texto', obligatorio: true },
    { clave: 'modelo', etiqueta: 'Modelo y versión', tipo: 'texto', obligatorio: true, ayuda: moto ? 'Por ejemplo: Yamaha MT-07 o Honda PCX 125.' : 'Por ejemplo: Seat León 1.5 TSI.' },
    { clave: 'fechaMatriculacion', etiqueta: 'Fecha de primera matriculación', tipo: 'fecha', obligatorio: false, ayuda: 'Está en el permiso de circulación. Si no la sabes, déjala en blanco.' },
    { clave: 'garaje', etiqueta: '¿Dónde duerme?', tipo: 'opcion', obligatorio: true, opciones: GARAJES_SOLICITUD },
    { clave: 'kmAnuales', etiqueta: 'Kilómetros al año, aproximados', tipo: 'numero', obligatorio: false },
    { clave: 'tieneSeguro', etiqueta: '¿Está asegurada ahora?', tipo: 'si_no', obligatorio: true },
    { clave: 'companiaActual', etiqueta: 'Compañía actual', tipo: 'texto', obligatorio: false, siMarcado: 'tieneSeguro' },
    { clave: 'vencimientoActual', etiqueta: 'Fecha en que vence', tipo: 'fecha', obligatorio: false, siMarcado: 'tieneSeguro' },
    { clave: 'aniosSinSiniestros', etiqueta: 'Años sin partes con culpa', tipo: 'numero', obligatorio: false },
    { clave: 'comentario', etiqueta: '¿Algo más que debamos saber?', tipo: 'texto_largo', obligatorio: false },
  )
  return campos
}

export type Respuesta = string | number | boolean | null
export type ValidacionSolicitud =
  | { ok: true; respuestas: Record<string, Respuesta> }
  | { ok: false; errores: Record<string, string> }

function fechaIso(v: string): string | null {
  const s = v.trim()
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  const esp = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s)
  let a: number, m: number, d: number
  if (iso) [a, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  else if (esp) [d, m, a] = [Number(esp[1]), Number(esp[2]), Number(esp[3])]
  else return null
  const f = new Date(Date.UTC(a, m - 1, d))
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * Valida lo que manda el cliente contra los campos que se le pidieron. Solo se
 * guardan las claves pedidas (lo demás se ignora) y cada error viene por campo.
 */
export function validarRespuestas(
  campos: readonly CampoSolicitud[],
  entrada: Record<string, unknown>,
  hoy: Date = new Date(),
): ValidacionSolicitud {
  const errores: Record<string, string> = {}
  const respuestas: Record<string, Respuesta> = {}
  const hoyIso = hoy.toISOString().slice(0, 10)
  for (const c of campos) {
    if (c.siMarcado && entrada[c.siMarcado] !== true) { respuestas[c.clave] = null; continue }
    const v = entrada[c.clave]
    const vacio = v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
    if (vacio) {
      if (c.obligatorio) errores[c.clave] = 'Falta este dato.'
      else respuestas[c.clave] = null
      continue
    }
    switch (c.tipo) {
      case 'si_no':
        if (typeof v !== 'boolean') errores[c.clave] = 'Elige sí o no.'
        else respuestas[c.clave] = v
        break
      case 'numero': {
        const n = typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.'))
        if (!Number.isFinite(n) || n < 0 || n > 1_000_000) errores[c.clave] = 'Pon un número.'
        else respuestas[c.clave] = Math.round(n)
        break
      }
      case 'opcion':
        if (typeof v !== 'string' || !c.opciones?.some((o) => o.valor === v)) errores[c.clave] = 'Elige una opción.'
        else respuestas[c.clave] = v
        break
      case 'fecha': {
        if (c.clave === 'fechaNacimiento') {
          const r = normalizarFechaNacimiento(v, hoy)
          if (r.ok) respuestas[c.clave] = r.valor
          else errores[c.clave] = r.motivo
          break
        }
        const f = typeof v === 'string' ? fechaIso(v) : null
        if (!f) errores[c.clave] = 'Fecha no válida: usa DD/MM/AAAA.'
        else if (c.clave !== 'vencimientoActual' && f > hoyIso) errores[c.clave] = 'No puede ser una fecha futura.'
        else if (f < '1940-01-01') errores[c.clave] = 'Esa fecha es demasiado antigua.'
        else respuestas[c.clave] = f
        break
      }
      default: {
        if (typeof v !== 'string') { errores[c.clave] = 'Dato no válido.'; break }
        const s = v.replace(/\s+/g, ' ').trim()
        const max = c.tipo === 'texto_largo' ? 1000 : 120
        if (c.clave === 'dni') {
          const r = normalizarDni(s)
          if (r.ok) respuestas[c.clave] = r.valor.valor
          else errores[c.clave] = r.motivo
        } else if (c.clave === 'codigoPostal') {
          const r = normalizarCp(s)
          if (r.ok) respuestas[c.clave] = r.valor
          else errores[c.clave] = r.motivo
        } else if (c.clave === 'matricula') {
          const m = s.toUpperCase().replace(/[^A-Z0-9]/g, '')
          if (m.length < 4 || m.length > 10 || !/\d/.test(m) || !/[A-Z]/.test(m)) errores[c.clave] = 'Revisa la matrícula.'
          else respuestas[c.clave] = m
        } else if (s.length > max) {
          errores[c.clave] = `Máximo ${max} caracteres.`
        } else {
          respuestas[c.clave] = s
        }
      }
    }
  }
  return Object.keys(errores).length > 0 ? { ok: false, errores } : { ok: true, respuestas }
}

/** Días que vive un enlace sin completar. */
export const DIAS_SOLICITUD = 14

/** Texto listo para pegar en WhatsApp o en un correo. Sin datos del cliente: solo el enlace. */
export function mensajeSolicitud(ramo: RamoSolicitud, url: string): string {
  const que = ramo === 'moto' ? 'tu moto' : 'tu coche'
  return `Hola, soy Alberto de Grupo ASegura. Para prepararte el presupuesto de ${que} necesito unos datos; te lleva dos minutos: ${url}`
}

// ─── Documentos que sube el cliente por el enlace (24/09/2026) ───────────────
// Alberto: «que pueda subir el DNI, el carné, la documentación de la moto; se
// archiva y la IA rellena el formulario y verifica que los datos están bien».
// La IA LEE; lo que decide qué es un dato válido es este código (las mismas
// reglas que el formulario), y lo que se guarda en la ficha es el FICHERO, no
// lo leído: lo leído solo propone valores al cliente y sirve de contraste.

export const TIPOS_DOC_SOLICITUD = ['dni', 'carnet', 'permiso_circulacion', 'ficha_tecnica', 'poliza', 'otro'] as const
export type TipoDocSolicitud = (typeof TIPOS_DOC_SOLICITUD)[number]

/** Máximo de documentos por enlace: de sobra para DNI, carné y los dos papeles del vehículo. */
export const MAX_DOCS_SOLICITUD = 6

export function etiquetaDocSolicitud(t: TipoDocSolicitud): string {
  switch (t) {
    case 'dni': return 'DNI / NIE'
    case 'carnet': return 'Carné de conducir'
    case 'permiso_circulacion': return 'Permiso de circulación'
    case 'ficha_tecnica': return 'Ficha técnica'
    case 'poliza': return 'Póliza o recibo del seguro actual'
    default: return 'Otro documento'
  }
}

/** Tipo con el que se ARCHIVA en `seguros.documentos` (esa lista no tiene carné). */
export function tipoArchivoDocSolicitud(t: TipoDocSolicitud): 'dni' | 'permiso_circulacion' | 'ficha_tecnica' | 'poliza' | 'otro' {
  return t === 'carnet' ? 'otro' : t
}

const ORDEN_CARNET_MOTO = ['A', 'A2', 'A1', 'AM'] as const

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

/**
 * Lo que devolvió la IA → valores para los campos QUE SE PIDIERON, cada uno
 * pasado por la misma validación que el formulario. Lo que no valida se tira:
 * un valor dudoso propuesto al cliente se lo acaba aceptando sin mirar.
 */
export function normalizarLecturaSolicitud(
  bruto: unknown,
  ramo: RamoSolicitud,
  campos: readonly CampoSolicitud[],
  hoy: Date = new Date(),
): { tipo: TipoDocSolicitud; valores: Record<string, Respuesta> } {
  const o = bruto !== null && typeof bruto === 'object' && !Array.isArray(bruto) ? (bruto as Record<string, unknown>) : {}
  const tipo = (TIPOS_DOC_SOLICITUD as readonly string[]).includes(String(o.tipo)) ? (o.tipo as TipoDocSolicitud) : 'otro'
  const candidato: Record<string, unknown> = {
    dni: texto(o.dni),
    fechaNacimiento: texto(o.fechaNacimiento),
    matricula: texto(o.matricula),
    marca: texto(o.marca),
    modelo: texto(o.modelo),
    fechaMatriculacion: texto(o.fechaMatriculacion),
    companiaActual: texto(o.companiaActual),
    vencimientoActual: texto(o.vencimientoActual),
  }
  if (candidato.companiaActual || candidato.vencimientoActual) candidato.tieneSeguro = true
  // Carné: en moto, la clase de moto más alta que tenga fecha; en coche, la B.
  const carnets = Array.isArray(o.carnets) ? o.carnets : []
  const conFecha = carnets
    .map((c) => (c && typeof c === 'object' ? (c as Record<string, unknown>) : {}))
    .map((c) => ({ clase: texto(c.clase)?.toUpperCase() ?? '', fecha: texto(c.fecha) }))
    .filter((c) => c.fecha !== null)
  if (ramo === 'moto') {
    const c = ORDEN_CARNET_MOTO.map((k) => conFecha.find((x) => x.clase === k)).find(Boolean)
    if (c) { candidato.tipoCarnet = c.clase; candidato.fechaCarnet = c.fecha }
  } else {
    const b = conFecha.find((x) => x.clase === 'B')
    if (b) candidato.fechaCarnet = b.fecha
  }

  const valores: Record<string, Respuesta> = {}
  for (const c of campos) {
    const v = candidato[c.clave]
    if (v === null || v === undefined) continue
    const r = validarRespuestas([{ ...c, obligatorio: true, siMarcado: undefined }], { [c.clave]: v }, hoy)
    if (r.ok && r.respuestas[c.clave] !== null && r.respuestas[c.clave] !== undefined) valores[c.clave] = r.respuestas[c.clave]
  }
  return { tipo, valores }
}

/** Campos en los que un papel manda: si lo declarado no coincide, se avisa a Alberto. */
const CONTRASTABLES = ['dni', 'fechaNacimiento', 'tipoCarnet', 'fechaCarnet', 'matricula', 'fechaMatriculacion'] as const

export type LecturaDocSolicitud = { documentoId: string; tipo: TipoDocSolicitud; valores: Record<string, Respuesta> }
export type DiscrepanciaSolicitud = { clave: string; declarado: Respuesta; documento: Respuesta; tipoDocumento: TipoDocSolicitud }

const canon = (v: Respuesta): string => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

/**
 * Lo que el cliente mandó contra lo que dicen sus propios papeles. Solo avisa
 * (no bloquea): el papel puede estar mal leído y el cliente puede tener razón.
 */
export function contrastarConDocumentos(
  respuestas: Record<string, Respuesta>,
  lecturas: readonly LecturaDocSolicitud[],
): DiscrepanciaSolicitud[] {
  const out: DiscrepanciaSolicitud[] = []
  for (const clave of CONTRASTABLES) {
    const declarado = respuestas[clave]
    if (declarado === null || declarado === undefined || declarado === '') continue
    const l = lecturas.find((x) => x.valores[clave] !== undefined && x.valores[clave] !== null)
    if (!l) continue
    if (canon(l.valores[clave]) !== canon(declarado)) out.push({ clave, declarado, documento: l.valores[clave], tipoDocumento: l.tipo })
  }
  return out
}
