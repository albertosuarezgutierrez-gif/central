// Pedir precio de COCHE o MOTO desde el asistente de la correduría por Telegram (28/09/2026, fase 1)
// — parte PURA (sin `@/` ni prisma → node --test). La parte con BD y red vive en
// `correduria-asistente-telegram.ts`.
//
// Mismo principio que emitir o corregir: la IA PROPONE con lo que Alberto dicta, el servidor resuelve
// cada dato contra los catálogos de Codeoscopic (gratis), lo ENSEÑA con los supuestos delante, y Alberto
// pulsa «Pedir precio (0,50€)». Aquí vive todo lo que se puede decidir sin red:
// - `emparejarOpcion`: lo dictado → un id del catálogo, SOLO si no hay duda; si hay varias, las candidatas.
// - `leerEntrada`: DNI, fechas y teléfono validados; el historial del seguro actual va completo o no va.
// - `construirCuerpo`: las MISMAS claves `resueltos`/`correcciones` que MotoNuevo.tsx y AutoNuevo.tsx.
// - `desenlaceCotizacion`: lo que pudo cobrarse sin traer precios es «incierta», nunca «no se ha gastado».
import { normalizarDni, normalizarFechaNacimiento, normalizarTelefono, enmascararDni } from '@central/module-seguros'
import { formatoMatricula, normalizarMatricula } from '@central/module-seguros/matricula'
import type { Opcion, Reparo, RespuestaRetarificar, Supuesto } from './retarificar-asegura.ts'
import { eur } from './dinero.ts'
import { garajePorDefecto, SOLO_PARA_EL_PRECIO } from './supuestos-presupuesto.ts'

export type RamoTarif = 'auto' | 'moto'

/** Pedir precio de verdad son 0,50€ por llamada: tope propio del asistente, contado antes de reclamar el botón. */
export const MAX_TARIFICACIONES_DIA = 10

/** `engine` de moto es un enum cerrado (igual que MotoNuevo.tsx): no hay catálogo que consultar. */
export const MOTORES_MOTO: readonly Opcion[] = [
  { id: 'Gasoline', nombre: 'Gasolina' },
  { id: 'Diesel', nombre: 'Diésel' },
  { id: 'Others', nombre: 'Otros' },
]

/** Los catálogos que puede consultar la IA (gratis). `-moto` = el de motos, que es otro. */
export const TIPOS_CATALOGO = [
  'marcas', 'modelos', 'motores', 'versiones',
  'marcas-moto', 'modelos-moto', 'motores-moto', 'versiones-moto',
] as const
export type TipoCatalogo = (typeof TIPOS_CATALOGO)[number]

// ── Emparejar lo dictado con un catálogo ────────────────────────────────────────────────────────

export type Emparejado =
  | { estado: 'uno'; opcion: Opcion }
  | { estado: 'varios'; candidatas: Opcion[] }
  | { estado: 'ninguno' }

function norm(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * Lo que dijo Alberto («Ibiza», «gasolina», «vía pública») → una opción del catálogo. Solo ELIGE cuando no
 * hay duda: el id exacto, un nombre idéntico único, o una sola opción que contiene todas las palabras. Con
 * dos o más candidatas no se adivina: se devuelven para preguntar (elegir mal la versión es otro precio).
 */
export function emparejarOpcion(texto: string | null | undefined, catalogo: readonly Opcion[]): Emparejado {
  const t = (texto ?? '').trim()
  if (!t) return { estado: 'ninguno' }
  const porId = catalogo.find((o) => o.id === t)
  if (porId) return { estado: 'uno', opcion: porId }
  const n = norm(t)
  if (!n) return { estado: 'ninguno' }
  const iguales = catalogo.filter((o) => norm(o.nombre) === n)
  if (iguales.length === 1) return { estado: 'uno', opcion: iguales[0] }
  if (iguales.length > 1) return { estado: 'varios', candidatas: iguales }
  const palabras = n.split(' ')
  const contienen = catalogo.filter((o) => {
    const trozos = norm(o.nombre).split(' ')
    return palabras.every((p) => trozos.some((w) => w.startsWith(p)))
  })
  if (contienen.length === 1) return { estado: 'uno', opcion: contienen[0] }
  if (contienen.length > 1) return { estado: 'varios', candidatas: contienen }
  return { estado: 'ninguno' }
}

/** Para enseñar a la IA un catálogo largo: filtrado por lo dictado y recortado. */
export function filtrarCatalogo(catalogo: readonly Opcion[], filtro: string | null | undefined, max = 40): { total: number; opciones: Opcion[] } {
  const e = filtro?.trim() ? emparejarOpcion(filtro, catalogo) : null
  const lista = !e ? catalogo : e.estado === 'uno' ? [e.opcion] : e.estado === 'varios' ? e.candidatas : []
  return { total: lista.length, opciones: lista.slice(0, max) }
}

/**
 * Dónde duerme el vehículo. Si Alberto lo dice, se empareja. Si no, en GARAJE —igual que la pantalla
 * (Alberto, 29/09/2026: «por defecto NO duerme en la calle»; sustituye a «vía pública» del 25/09)— y se
 * DECLARA como supuesto, para que no parezca un dato de verdad: se confirma al emitir.
 */
export function elegirGaraje(texto: string | null | undefined, catalogo: readonly Opcion[]): { resultado: Emparejado; supuesto: string | null } {
  if ((texto ?? '').trim()) return { resultado: emparejarOpcion(texto, catalogo), supuesto: null }
  const g = garajePorDefecto(catalogo)
  if (!g) return { resultado: { estado: 'ninguno' }, supuesto: null }
  return {
    resultado: { estado: 'uno', opcion: g },
    supuesto: `no me has dicho dónde duerme: «${g.nombre}» por defecto (nunca la calle); ${SOLO_PARA_EL_PRECIO}`,
  }
}

// ── Leer lo que manda la IA ─────────────────────────────────────────────────────────────────────

export type PersonaDeclarada = {
  dni?: string
  nombre?: string
  apellido1?: string
  apellido2?: string
  sexo?: 'hombre' | 'mujer'
  fechaNacimiento?: string
  fechaCarnet?: string
  telefono?: string
}

export type HistorialDeclarado = {
  compania: string
  poliza: string
  aniosAsegurado: number
  aniosEnCompania: number
  aniosSinSiniestros: number
  siniestrosUltimos5: number | null
}

export type EntradaTarificacion = {
  ramo: RamoTarif | null
  clienteId: string | null
  marca: string | null
  modelo: string | null
  motor: string | null
  version: string | null
  matricula: string | null
  fechaMatriculacion: string | null
  garaje: string | null
  estadoCivil: string | null
  municipio: string | null
  persona: PersonaDeclarada
  /** `null` = no se ha dicho (se cotiza «de calle»). Nunca a medias. */
  historial: HistorialDeclarado | null
  primaActual: number | null
  /** Km al año dichos. `null` = no se ha dicho (asegura pone la media como supuesto). */
  kmAnuales: number | null
  /** El riesgo (oportunidad) del que cuelga: con él, propietario y conductores salen de sus figuras. */
  oportunidadId: string | null
  /** `true` = el sexo NO lo dijo Alberto: la IA lo dedujo del nombre (va como supuesto). */
  sexoDeducido: boolean
  /** Fecha de efecto DICHA (ISO). `null` = la de por defecto de asegura, que va como supuesto. */
  fechaEfecto: string | null
}

function texto(v: unknown, max = 120): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v !== 'string') return null
  const s = v.trim().slice(0, max)
  return s ? s : null
}

function entero(v: unknown): number | null | 'mal' {
  if (v === undefined || v === null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  return Number.isInteger(n) && n >= 0 && n <= 80 ? n : 'mal'
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Una fecha real y pasada (no futura), en DD/MM/AAAA o AAAA-MM-DD → ISO. */
function fechaPasada(v: unknown, que: string, hoy: Date): { valor?: string; error?: string } {
  const s = texto(v, 20)
  if (!s) return {}
  const r = normalizarFechaNacimiento(s, hoy)
  if (r.ok) return { valor: r.valor }
  return { error: `${que}: ${r.motivo.replace(/de nacimiento /, '')}` }
}

/**
 * Lo que manda la IA → datos validados. Todo lo que no pasa se DICE (no se descarta en silencio: un DNI
 * mal copiado que desaparece acaba cotizando con el de la ficha). El historial del seguro actual va
 * completo o no va: medio historial es un precio que la compañía corregirá al emitir.
 */
export function leerEntrada(args: Record<string, unknown>, hoy: Date = new Date()): { entrada: EntradaTarificacion; errores: string[] } {
  const errores: string[] = []
  const ramo = args.ramo === 'auto' || args.ramo === 'moto' ? args.ramo : null
  if (!ramo) errores.push('ramo: tiene que ser «auto» (coche) o «moto»')
  const cid = texto(args.clienteId, 40)
  const clienteId = cid && UUID.test(cid) ? cid.toLowerCase() : null
  if (!clienteId) errores.push('clienteId: tiene que ser el id interno (uuid) de buscar/ficha_cliente')
  const oid = texto(args.oportunidadId, 40)
  const oportunidadId = oid && UUID.test(oid) ? oid.toLowerCase() : null
  if (oid && !oportunidadId) errores.push('oportunidadId: tiene que ser el id (uuid) de oportunidades_cliente')

  let matricula: string | null = null
  const mat = texto(args.matricula, 20)
  if (mat) {
    const m = normalizarMatricula(mat)
    if (formatoMatricula(m) === 'desconocido') errores.push(`matrícula «${mat}» no tiene forma de matrícula española`)
    else matricula = m
  }

  const persona: PersonaDeclarada = {}
  const dni = texto(args.dni, 20)
  if (dni) {
    const r = normalizarDni(dni)
    if (!r.ok) errores.push(`DNI: ${r.motivo}`)
    else if (r.valor.tipoPersona !== 'fisica') errores.push('DNI: es un CIF; para pedir precio el tomador tiene que ser una persona')
    else persona.dni = r.valor.valor
  }
  for (const k of ['nombre', 'apellido1', 'apellido2'] as const) {
    const s = texto(args[k], 60)
    if (s) persona[k] = s
  }
  if (args.sexo === 'hombre' || args.sexo === 'mujer') persona.sexo = args.sexo
  else if (texto(args.sexo)) errores.push('sexo: «hombre» o «mujer»')
  const nac = fechaPasada(args.fechaNacimiento, 'fecha de nacimiento', hoy)
  if (nac.error) errores.push(nac.error)
  else if (nac.valor) persona.fechaNacimiento = nac.valor
  const car = fechaPasada(args.fechaCarnet, 'fecha del carnet', hoy)
  if (car.error) errores.push(car.error)
  else if (car.valor) {
    if (persona.fechaNacimiento && car.valor <= persona.fechaNacimiento) errores.push('fecha del carnet: es anterior a la de nacimiento')
    else persona.fechaCarnet = car.valor
  }
  const tel = texto(args.telefono, 20)
  if (tel) {
    const r = normalizarTelefono(tel)
    if (!r.ok) errores.push(`teléfono: ${r.motivo}`)
    // La compañía exige un MÓVIL español (6 o 7): un fijo lo rechaza y ya habría costado el viaje.
    else if (!/^[67]\d{8}$/.test(r.valor)) errores.push('teléfono: tiene que ser un móvil español (empieza por 6 o 7)')
    else persona.telefono = r.valor
  }
  const fm = fechaPasada(args.fechaMatriculacion, 'fecha de matriculación', hoy)
  if (fm.error) errores.push(fm.error)
  const fe = fechaFutura(args.fechaEfecto, hoy)
  if (fe.error) errores.push(fe.error)

  // Historial del seguro actual: todo o nada.
  const h = {
    compania: texto(args.companiaAnterior),
    poliza: texto(args.polizaAnterior, 40),
    aniosAsegurado: entero(args.aniosAsegurado),
    aniosEnCompania: entero(args.aniosEnCompania),
    aniosSinSiniestros: entero(args.aniosSinSiniestros),
    siniestrosUltimos5: entero(args.siniestrosUltimos5),
  }
  for (const [k, v] of Object.entries(h)) if (v === 'mal') errores.push(`${ETIQUETA_HISTORIAL[k]}: tiene que ser un número entero de años (0-80)`)
  const obligatorios = ['compania', 'poliza', 'aniosAsegurado', 'aniosEnCompania', 'aniosSinSiniestros'] as const
  const dichos = obligatorios.filter((k) => h[k] !== null && h[k] !== 'mal')
  let historial: HistorialDeclarado | null = null
  if (dichos.length > 0 && dichos.length < obligatorios.length) {
    const faltan = obligatorios.filter((k) => h[k] === null).map((k) => ETIQUETA_HISTORIAL[k])
    if (faltan.length) errores.push(`seguro actual incompleto: falta ${faltan.join(', ')} (o todo, o nada: sin él se cotiza «de calle»)`)
  } else if (dichos.length === obligatorios.length) {
    const aa = h.aniosAsegurado as number
    const ec = h.aniosEnCompania as number
    const ss = h.aniosSinSiniestros as number
    if (ec > aa) errores.push('años en la compañía: no pueden ser más que los años asegurado')
    else if (ss > aa) errores.push('años sin siniestros: no pueden ser más que los años asegurado')
    else historial = {
      compania: h.compania as string, poliza: h.poliza as string, aniosAsegurado: aa, aniosEnCompania: ec, aniosSinSiniestros: ss,
      siniestrosUltimos5: typeof h.siniestrosUltimos5 === 'number' ? h.siniestrosUltimos5 : null,
    }
  }

  let kmAnuales: number | null = null
  if (args.kmAnuales !== undefined && args.kmAnuales !== null && args.kmAnuales !== '') {
    const n = Number(String(args.kmAnuales).replace(/[.\s]/g, ''))
    if (Number.isInteger(n) && n >= 0 && n <= 200000) kmAnuales = n
    else errores.push('km al año: tiene que ser un número entero de kilómetros (0-200.000)')
  }

  let primaActual: number | null = null
  if (args.primaActual !== undefined && args.primaActual !== null && args.primaActual !== '') {
    const n = Number(args.primaActual)
    if (Number.isFinite(n) && n > 0 && n < 100000) primaActual = Math.round(n * 100) / 100
    else errores.push('prima actual: tiene que ser un importe en euros')
  }

  return {
    entrada: {
      ramo, clienteId, matricula,
      marca: texto(args.marca), modelo: texto(args.modelo), motor: texto(args.motor), version: texto(args.version, 160),
      fechaMatriculacion: fm.valor ?? null,
      garaje: texto(args.garaje), estadoCivil: texto(args.estadoCivil), municipio: texto(args.municipio),
      persona, historial, primaActual, kmAnuales, oportunidadId,
      sexoDeducido: persona.sexo !== undefined && args.sexoDeducido === true,
      fechaEfecto: fe.valor ?? null,
    },
    errores,
  }
}

/** Lo más lejos que la compañía admite el efecto (asegura, `fecha-efecto.ts`: 400 real a >90 días). */
const MAX_DIAS_EFECTO = 90

function isoMadrid(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })
}

/** Fecha de efecto dicha: DD/MM/AAAA o AAAA-MM-DD, real, desde hoy y a ≤90 días (los dos cepos del vendor). */
export function fechaFutura(v: unknown, hoy: Date): { valor?: string; error?: string } {
  const s = texto(v, 20)
  if (!s) return {}
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/) ?? s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (!m) return { error: `fecha de efecto «${s}»: dímela como dd/mm/aaaa` }
  const [a, mes, d] = m[1].length === 4 ? [m[1], m[2], m[3]] : [m[3], m[2], m[1]]
  const iso = `${a}-${mes.padStart(2, '0')}-${d.padStart(2, '0')}`
  const f = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(f.getTime()) || f.toISOString().slice(0, 10) !== iso) return { error: `fecha de efecto «${s}»: no existe` }
  const hoyIso = isoMadrid(hoy)
  if (iso < hoyIso) return { error: 'fecha de efecto: ya ha pasado (la compañía no admite un efecto anterior a hoy)' }
  const tope = new Date(`${hoyIso}T00:00:00Z`)
  tope.setUTCDate(tope.getUTCDate() + MAX_DIAS_EFECTO)
  if (iso > tope.toISOString().slice(0, 10)) return { error: `fecha de efecto: la compañía no admite más de ${MAX_DIAS_EFECTO} días vista` }
  return { valor: iso }
}

/**
 * El sexo que la IA DEDUJO del nombre solo vale si la ficha no lo tiene: si lo tiene (reparo `sexo`
 * ausente), la ficha manda y el deducido se descarta — si no, una deducción errónea pisaría un dato
 * bueno. Con la ficha sin revisar (`null`) se conserva: `huecosPendientes` ya bloquea ese caso.
 */
export function aplicarSexoDeducido(persona: PersonaDeclarada, sexoDeducido: boolean, faltanFicha: readonly Reparo[] | null): { persona: PersonaDeclarada; deducido: boolean } {
  if (!sexoDeducido || !persona.sexo) return { persona, deducido: false }
  if (faltanFicha !== null && !faltanFicha.some((r) => r.campo === 'sexo')) {
    const { sexo: _descartado, ...resto } = persona
    return { persona: resto, deducido: false }
  }
  return { persona, deducido: true }
}

const ETIQUETA_HISTORIAL: Record<string, string> = {
  compania: 'compañía actual', poliza: 'nº de la póliza actual', aniosAsegurado: 'años asegurado',
  aniosEnCompania: 'años en la compañía', aniosSinSiniestros: 'años sin siniestros', siniestrosUltimos5: 'siniestros en 5 años',
}

// ── El cuerpo que va al puerto ──────────────────────────────────────────────────────────────────

export type Resuelto = {
  ramo: RamoTarif
  /** `null` al reutilizar el vehículo de una petición anterior: solo trae el código de la versión. */
  marcaId: string | null
  modeloId: string | null
  motor: string | null
  codigoVehiculo: string
  matricula: string
  fechaMatriculacion: string
  garaje: string
  /** `true` = Alberto no lo dijo y va «vía pública» por defecto (asegura lo guarda como supuesto). */
  garajeEsSupuesto: boolean
  estadoCivilId: string
  municipioId: string
  persona: PersonaDeclarada
  /** Con el código DGS ya resuelto del catálogo de compañías. */
  historial: (Omit<HistorialDeclarado, 'compania'> & { companiaCodigo: string }) | null
  kmAnuales: number | null
  /** Efecto dicho (ISO); `null` = el de por defecto de asegura. */
  fechaEfecto?: string | null
}

export type CuerpoTarif = { resueltos: Record<string, unknown>; correcciones: Record<string, unknown> }

/**
 * Las MISMAS claves que mandan `MotoNuevo.tsx` y `AutoNuevo.tsx` (asegura las lee por nombre y una clave
 * distinta se ignora sin error: el precio saldría con el supuesto en vez del dato). En moto van además
 * marcaId, modeloId y motor: asegura relee la versión del catálogo para cruzarla con el carné.
 */
export function construirCuerpo(r: Resuelto): CuerpoTarif {
  const resueltos: Record<string, unknown> = {
    // Sin los tres, asegura no puede cruzar la versión con el carné (lo dice y sigue): nunca a medias.
    ...(r.ramo === 'moto' && r.marcaId && r.modeloId && r.motor ? { marcaId: r.marcaId, modeloId: r.modeloId, motor: r.motor } : {}),
    codigoVehiculo: r.codigoVehiculo,
    garaje: r.garaje,
    estadoCivilId: r.estadoCivilId,
    municipioId: r.municipioId,
    matricula: r.matricula,
    fechaMatriculacion: r.fechaMatriculacion,
    garajeEsSupuesto: r.garajeEsSupuesto,
  }
  const correcciones: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(r.persona)) if (v !== undefined && v !== '') correcciones[k] = v
  // Los km van como corrección (la pantalla de coche hace igual): tapan el supuesto de la media.
  if (r.kmAnuales !== null) correcciones.kmAnuales = r.kmAnuales
  // El efecto dicho tapa el de por defecto (y su supuesto): asegura acepta `fechaEfecto` como corrección.
  if (r.fechaEfecto) correcciones.fechaEfecto = r.fechaEfecto
  if (r.historial) {
    correcciones.aseguradoAntes = true
    correcciones.companiaAnteriorCodigo = r.historial.companiaCodigo
    correcciones.polizaAnterior = r.historial.poliza
    correcciones.aniosAsegurado = r.historial.aniosAsegurado
    correcciones.aniosEnCompania = r.historial.aniosEnCompania
    correcciones.aniosSinSiniestros = r.historial.aniosSinSiniestros
    if (r.historial.siniestrosUltimos5 !== null) correcciones.siniestrosUltimos5 = r.historial.siniestrosUltimos5
  }
  return { resueltos, correcciones }
}

// ── Lo que falta, dicho en palabras ─────────────────────────────────────────────────────────────

export type CampoTarif =
  | 'marca' | 'modelo' | 'motor' | 'version' | 'matricula' | 'fechaMatriculacion' | 'garaje'
  | 'estadoCivil' | 'municipio' | 'companiaAnterior'

export type Pieza =
  | { campo: CampoTarif; estado: 'ok' }
  | { campo: CampoTarif; estado: 'falta' }
  | { campo: CampoTarif; estado: 'varios'; candidatas: Opcion[] }
  | { campo: CampoTarif; estado: 'no_encontrado'; dicho: string }
  | { campo: CampoTarif; estado: 'error'; motivo: string }

const ETIQUETA: Record<string, string> = {
  marca: 'la marca', modelo: 'el modelo', motor: 'el combustible', version: 'la versión',
  matricula: 'la matrícula', fechaMatriculacion: 'la fecha de matriculación', garaje: 'dónde duerme (garaje)',
  estadoCivil: 'el estado civil', municipio: 'el municipio donde circula', companiaAnterior: 'la compañía actual',
  dni: 'el DNI del tomador', nombre: 'el nombre', apellido1: 'el primer apellido', telefono: 'un móvil',
  fechaNacimiento: 'la fecha de nacimiento', fechaCarnet: 'la fecha del carnet', sexo: 'el sexo (hombre o mujer)',
}

/** Reparos de la ficha que se resuelven con una pieza (el catálogo o lo dictado), no a mano. */
const REPAROS_DE_PIEZA: Record<string, CampoTarif> = {
  codigoVehiculo: 'version', matricula: 'matricula', fechaMatriculacion: 'fechaMatriculacion', garaje: 'garaje',
  estadoCivil: 'estadoCivil', municipioCirculacionId: 'municipio', cpCirculacion: 'municipio',
}
/** Reparos que se tapan con un dato que dicta Alberto. */
const REPAROS_DE_PERSONA = new Set(['dni', 'nombre', 'apellido1', 'telefono', 'fechaNacimiento', 'fechaCarnet', 'sexo'])
/** Reparos que no son de la persona ni del vehículo y que el embudo resuelve solo (supuestos de asegura). */
const REPAROS_IGNORABLES = new Set(['experienciaConduccion', 'motoAnteriorCodigo'])

/**
 * Lo que falta antes de poder ofrecer el botón, en frases para Alberto. `faltanFicha === null` = no se ha
 * podido revisar la ficha: eso también bloquea (no se ofrece gastar 0,50€ sobre algo sin mirar).
 */
export function huecosPendientes(piezas: readonly Pieza[], faltanFicha: readonly Reparo[] | null, persona: PersonaDeclarada): string[] {
  const out: string[] = []
  for (const p of piezas) {
    const et = ETIQUETA[p.campo] ?? p.campo
    if (p.estado === 'falta') out.push(`falta ${et}`)
    else if (p.estado === 'no_encontrado') out.push(`no encuentro «${p.dicho}» en ${et}`)
    else if (p.estado === 'error') out.push(`no he podido leer ${et}: ${p.motivo}`)
    else if (p.estado === 'varios') {
      const lista = p.candidatas.slice(0, 8).map((c) => c.nombre).join(' · ')
      out.push(`${et}: hay ${p.candidatas.length} opciones (${lista}${p.candidatas.length > 8 ? ' · …' : ''}), dime cuál`)
    }
  }
  if (faltanFicha === null) {
    out.push('no he podido revisar qué datos del tomador faltan en la ficha')
    return out
  }
  const yaDichos = new Set(out)
  for (const r of faltanFicha) {
    if (REPAROS_IGNORABLES.has(r.campo) || REPAROS_DE_PIEZA[r.campo]) continue
    if (REPAROS_DE_PERSONA.has(r.campo)) {
      if (persona[r.campo as keyof PersonaDeclarada]) continue
      const f = `falta ${ETIQUETA[r.campo]} (no está en la ficha)`
      if (!yaDichos.has(f)) { out.push(f); yaDichos.add(f) }
      continue
    }
    out.push(`en la ficha: ${r.motivo || r.campo} (se arregla en la ficha del cliente)`)
  }
  return out
}

// ── El mensaje con el botón ─────────────────────────────────────────────────────────────────────

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function fecha(iso: string | null | undefined): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : 'no consta'
}

export type Propuesta = {
  ramo: RamoTarif
  cliente: string
  vehiculo: { marca: string; modelo: string; motor: string; version: string }
  matricula: string
  fechaMatriculacion: string
  garaje: string
  estadoCivil: string
  municipio: string
  persona: PersonaDeclarada
  historial: (Omit<HistorialDeclarado, 'compania'> & { compania: string }) | null
  primaActual: number | null
  kmAnuales: number | null
  /** Quién ocupa cada papel distinto del tomador (nombre), de las figuras del riesgo. Vacío = el tomador en todos. */
  figuras?: Partial<Record<'propietario' | 'conductor_habitual' | 'conductor_ocasional', string>>
  /** Sin botón: el precio se pide en cuanto sale este resumen. */
  autonomo?: boolean
  /** Vehículo reutilizado de una petición anterior: su fecha (dd/mm/aaaa), para decirlo. */
  vehiculoPrevioDe: string | null
  /** Efecto dicho por Alberto (ISO). Sin él, el de por defecto sale entre los supuestos. */
  fechaEfecto?: string | null
  /** El sexo lo dedujo la IA: va entre los supuestos, no entre «los datos que me has dado». */
  sexoDeducido?: boolean
  /** Los de asegura (con `optimista`) y los nuestros. */
  supuestos: readonly Supuesto[]
}

const ETIQUETA_SUPUESTO: Record<string, string> = {
  ...ETIQUETA, fechaEfecto: 'fecha de efecto', kmAnuales: 'km al año', tipoCarnet: 'tipo de carnet', zonaCarnet: 'carnet expedido en',
  aseguradoAntes: 'seguro anterior', aniosAsegurado: 'años asegurado', aniosSinSiniestros: 'años sin siniestros',
  aniosEnCompania: 'años en la compañía', conductor: 'quién conduce', experienciaConduccion: 'experiencia con motos', estadoCivil: 'estado civil',
  nombreVia: 'la calle', numeroVia: 'el número de la calle', cpCirculacion: 'dónde circula',
}

function valorSupuesto(s: Supuesto): string {
  if (s.oculto || s.valor === null || s.valor === undefined) return 'dato de la ficha'
  if (typeof s.valor === 'boolean') return s.valor ? 'sí' : 'no'
  return String(s.valor)
}

/**
 * El recordatorio al EMITIR de lo que el precio SUPUSO (Alberto, 29/09/2026: «esos datos son de emisión,
 * no para dar precio»). `null` en `campos` = no se sabe qué se supuso (precio pedido fuera del chat o
 * lectura fallida): se pide confirmar lo de siempre, nunca se calla. Lista vacía = todo dicho, sin aviso.
 */
export function avisoAlEmitir(campos: readonly string[] | null): string | null {
  if (campos === null) {
    return 'Antes de emitir confirma con el cliente sexo, estado civil, dónde duerme, quién conduce, fecha de matriculación y efecto: no sé cuáles se supusieron en el precio.'
  }
  const et = [...new Set(campos)].map((c) => ETIQUETA_SUPUESTO[c] ?? c)
  return et.length ? `Antes de emitir confirma con el cliente lo que en el precio fue SUPUESTO: ${et.join(', ')}.` : null
}

/** Lo que se pedirá, con el DNI enmascarado, los supuestos OPTIMISTAS primero y el aviso del gasto. */
export function textoPropuesta(p: Propuesta): string {
  const per = p.persona
  const declarados = [
    per.dni ? `DNI ${esc(enmascararDni(per.dni) ?? '')}` : null,
    per.nombre || per.apellido1 ? `${esc([per.nombre, per.apellido1, per.apellido2].filter(Boolean).join(' '))}` : null,
    per.sexo && !p.sexoDeducido ? per.sexo : null,
    per.fechaNacimiento ? `nacimiento ${fecha(per.fechaNacimiento)}` : null,
    per.fechaCarnet ? `carnet ${fecha(per.fechaCarnet)}` : null,
    per.telefono ? `móvil ${esc(per.telefono)}` : null,
  ].filter(Boolean)
  // Sin figura de conductor se dice SIEMPRE que conduce solo el tomador: si conduce otro (un hijo de 19) el precio sale bajo.
  const fig = p.figuras ?? {}
  const conductor: Supuesto | null = fig.conductor_habitual || fig.conductor_ocasional ? null
    : { campo: 'conductor', valor: 'solo el tomador, sin ocasionales', porque: 'no se ha declarado otro conductor en el riesgo; si conduce otra persona, dímelo y lo pongo', optimista: true }
  const lineasFig = [
    fig.propietario ? `Propietario: ${esc(fig.propietario)}` : null,
    fig.conductor_habitual ? `Conductor habitual: ${esc(fig.conductor_habitual)}` : null,
    fig.conductor_ocasional ? `Conductor ocasional: ${esc(fig.conductor_ocasional)}` : null,
  ].filter((l): l is string => l !== null)
  const orden = [...(conductor ? [conductor] : []), ...p.supuestos].sort((a, b) => Number(!!b.optimista) - Number(!!a.optimista))
  const lineasSup = orden.map((s) =>
    `${s.optimista ? '⚠️ <b>puede abaratar</b> · ' : '· '}${esc(ETIQUETA_SUPUESTO[s.campo] ?? s.campo)}: ${esc(valorSupuesto(s))} — <i>${esc(s.porque)}</i>`)
  return [
    `💶 <b>Pedir precio de ${p.ramo === 'moto' ? 'MOTO' : 'COCHE'}</b> · ${esc(p.cliente)}`,
    '',
    ...(p.vehiculoPrevioDe
      ? [`El mismo vehículo de la petición de precio del ${esc(p.vehiculoPrevioDe)} (versión ${esc(p.vehiculo.version)})`]
      : [`${esc(p.vehiculo.marca)} ${esc(p.vehiculo.modelo)} · ${esc(p.vehiculo.motor)}`, `Versión: ${esc(p.vehiculo.version)}`]),
    `Matrícula ${esc(p.matricula)} · matriculado ${fecha(p.fechaMatriculacion)}`,
    `Duerme: ${esc(p.garaje)} · circula por ${esc(p.municipio)} · ${esc(p.estadoCivil)}`,
    p.kmAnuales !== null ? `Km al año: ${String(p.kmAnuales).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}` : null,
    p.fechaEfecto ? `Efecto: ${fecha(p.fechaEfecto)}` : null,
    declarados.length ? `Datos que me has dado: ${declarados.join(' · ')}` : 'Datos del tomador: los de su ficha',
    ...lineasFig,
    p.historial
      ? `Seguro actual: ${esc(p.historial.compania)} nº ${esc(p.historial.poliza)} · ${p.historial.aniosAsegurado} años asegurado, ${p.historial.aniosEnCompania} en la compañía, ${p.historial.aniosSinSiniestros} sin siniestros`
      : 'Seguro actual: no me lo has dicho → se cotiza «de calle» (sin bonificación: sale más caro)',
    p.primaActual !== null ? `Paga hoy: ${eur(p.primaActual)}` : null,
    ...(lineasSup.length ? ['', '<b>Supuestos</b> (lo que no me has dicho):', ...lineasSup] : []),
    '',
    ...(p.autonomo
      ? ['💶 Lo pido ya: <b>0,50€</b> reales (Codeoscopic). No sale nada al cliente; el precio te llega en un mensaje aparte en 1-3 minutos.']
      : ['💶 Pedir precio cuesta <b>0,50€</b> reales (Codeoscopic). No sale nada al cliente: el precio te llega solo a ti.',
        '⏱️ El botón vale 15 minutos y un solo uso.']),
  ].filter((l): l is string => l !== null).join('\n')
}

// ── El resultado ────────────────────────────────────────────────────────────────────────────────

export type EstadoTarif = 'hecha' | 'sin_gasto' | 'incierta'

/**
 * Qué pasó con los 0,50€ y qué decir. `hecha` = hay precios. `sin_gasto` = asegura DECLARA que cortó antes
 * del vendor. Todo lo demás —un error sin declarar, un 200 sin ninguna prima— es `incierta`: el cargo
 * puede existir, y decir «no se ha gastado» sobre él sería mentir sobre dinero. Nunca se ofrece repetir.
 */
export function desenlaceCotizacion(r: RespuestaRetarificar, primaActual: number | null, urlFicha: string): { estado: EstadoTarif; texto: string; resumen: Record<string, unknown> } {
  const mirar = `Míralo en la ficha antes de repetir nada: ${urlFicha}`
  switch (r.estado) {
    case 'ok': {
      const conPrima = r.precios
        .filter((p) => typeof p.primaEur === 'number' && Number.isFinite(p.primaEur) && p.primaEur > 0)
        .sort((a, b) => (a.primaEur as number) - (b.primaEur as number))
      const base = { estado: r.estado, coste: r.coste, precios: conPrima.length, fallos: r.fallos.length, simulado: r.simulado }
      if (conPrima.length === 0) {
        return {
          estado: 'incierta',
          texto: `⚠️ Se ha pedido (coste ${esc(r.coste)}) pero ninguna compañía ha dado prima${r.fallos.length ? ` (${r.fallos.length} han fallado)` : ''}. No lo repitas a ciegas. ${mirar}`,
          resumen: base,
        }
      }
      const top = conPrima.slice(0, 3).map((p, i) => {
        const firme = p.firmeza && p.firmeza !== 'firme' ? ` <i>(${esc(p.firmeza)})</i>` : ''
        return `${i + 1}. ${esc(p.compania ?? 'compañía no consta')}${p.producto ? ` · ${esc(p.producto)}` : ''} — <b>${eur(p.primaEur as number)}</b>${firme}`
      })
      const barato = conPrima[0].primaEur as number
      const comparar = primaActual === null ? null
        : barato < primaActual ? `💡 Paga hoy ${eur(primaActual)}: el más barato le ahorra ${eur(primaActual - barato)} al año.`
          : `Paga hoy ${eur(primaActual)}: ninguno lo mejora (el más barato, ${eur(barato)}).`
      return {
        estado: 'hecha',
        texto: [
          `${r.simulado ? '🧪 <b>SIMULADO</b> (no lo ha dado ninguna compañía) · ' : ''}💶 <b>Los ${Math.min(3, conPrima.length)} más baratos</b> (de ${conPrima.length} con prima):`,
          ...top,
          comparar,
          `Coste ${esc(r.coste)}${r.restantesHoy !== null ? ` · te quedan ${r.restantesHoy} hoy` : ''}${r.fallos.length ? ` · ${r.fallos.length} compañía(s) sin precio` : ''}.`,
          'No se ha enviado nada al cliente.',
          `Todos los precios y emitir: ${urlFicha}`,
        ].filter(Boolean).join('\n'),
        resumen: { ...base, primeros: conPrima.slice(0, 3).map((p) => ({ compania: p.compania ?? null, primaEur: p.primaEur })) },
      }
    }
    case 'faltan':
      return {
        estado: 'sin_gasto',
        texto: `✖️ No se ha pedido (0€): faltan datos — ${esc(r.faltan.map((f) => f.motivo || f.campo).join('; ') || 'sin detallar')}. Pídemelo otra vez con ellos.`,
        resumen: { estado: r.estado, faltan: r.faltan.map((f) => f.campo) },
      }
    case 'tope':
    case 'ramo':
    case 'no_encontrada':
    case 'sin_configurar':
    case 'proyecto_vigente':
      return { estado: 'sin_gasto', texto: `✖️ No se ha pedido (0€): ${esc(r.mensaje)}`, resumen: { estado: r.estado } }
    case 'error':
      return r.gastoDesconocido
        ? { estado: 'incierta', texto: `⚠️ No hay respuesta clara (${esc(r.mensaje)}). Puede haberse cobrado los 0,50€: NO lo repitas. ${mirar}`, resumen: { estado: r.estado, motivo: r.motivo } }
        : { estado: 'sin_gasto', texto: `✖️ No se ha pedido (0€): ${esc(r.mensaje)}`, resumen: { estado: r.estado, motivo: r.motivo } }
  }
}

/**
 * Venta cruzada: una línea SOLO PARA ALBERTO debajo del precio (nunca va al cliente). `null` si no se sabe
 * qué tiene: sin la ficha no se afirma que le falta nada.
 */
export function ventaCruzada(ramosVivos: readonly string[] | null, ramo: RamoTarif): string | null {
  if (ramosVivos === null) return null
  const tiene = new Set(ramosVivos)
  const sugerir: string[] = []
  if (!tiene.has('hogar')) sugerir.push('hogar')
  if (ramo === 'moto' && !tiene.has('auto')) sugerir.push('coche')
  if (sugerir.length === 0) return null
  return `🔒 <i>Solo para ti:</i> no tiene ${sugerir.join(' ni ')} con nosotros; aprovecha al darle el precio.`
}
