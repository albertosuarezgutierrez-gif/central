/**
 * Del enlace de datos al RIESGO de la oportunidad, en los ramos que no son hogar (26/10/2026, fase 2). PURO.
 *
 * Hogar tiene su camino propio (`solicitud-hogar.ts`: Catastro + `datosVivienda`). Aquí, el resto:
 *   auto, moto            → `datosVehiculo`     (vehículo, catálogo si lo eligió, garaje, seguro actual e historial)
 *   vida, salud, decesos  → `datosCapital`      (capital, fumador, hipoteca vinculada; cuántos y qué edades)
 *   comercio              → `datosComercio`     (la actividad)
 *   el resto              → `datosRiesgoLibre`  (descripción; profesión en accidentes; el animal en mascotas)
 *
 * Mismas reglas que hogar (`planEscrituraVivienda`):
 *   - `null` = no se sabe: lo no contestado, lo marcado «No lo sé» y lo que no valida NO se escribe (no se propone);
 *   - se escribe por BLOQUES atómicos y solo donde no había nada: lo que ya escribió la correduría manda, y un bloque
 *     que choca con lo guardado no se escribe y se dice en el aviso;
 *   - un bloque CONFIRMADO por Alberto (`confirmadoAt`) no se toca.
 * Qué campo del enlace va a qué campo del bloque lo declara `solicitud-destinos.ts` (con su cepo).
 */
import { CAMPOS_HIPOTECA_CAPITAL, CAMPOS_PERSONAS_CAPITAL, MAX_NUMERO_ASEGURADOS, edadesNormalizadas } from './datos-capital-riesgo.ts'
import { CAMPOS_MASCOTA_LIBRE, ESPECIES_MASCOTA } from './datos-riesgo-libre.ts'
import { claveDatosDeRamo, type ClaveDatosRiesgo } from './datos-riesgo-ramo.ts'
import { ANIOS_SIN_SINIESTROS_MAXIMO, CAMPOS_HISTORIAL_VEHICULO } from './datos-vehiculo-riesgo.ts'
import { GARAJES_CONOCIDOS } from './garajes.ts'
import { normalizarMatricula } from './matricula.ts'
import { claveVehiculo, grupoSolicitud, type RamoSolicitud, type Respuesta } from './solicitud-datos.ts'

export type PropuestaRiesgo = Record<string, string | number | boolean>

/**
 * Garaje del enlace → id del catálogo de Codeoscopic. SOLO ids vistos (`GARAJES_CONOCIDOS`; el cepo lo comprueba). «Garaje
 * particular (solo para tu vehículo)» es individual (`PrivateGarage`); al tarificar, `resolverGarajeEnCatalogo` lo casa
 * con el catálogo vivo.
 */
export const ID_GARAJE_SOLICITUD = {
  garaje_privado: 'PrivateGarage',
  garaje_comunitario: 'CommunalParking',
  calle: 'Street',
} as const satisfies Record<string, keyof typeof GARAJES_CONOCIDOS>

const txt = (v: Respuesta | undefined, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t === '' ? null : t.slice(0, max)
}
/** Un texto largo recortado sin partir palabras, con «…» si se ha cortado (el entero queda en «Datos pedidos»). */
const recortado = (v: Respuesta | undefined, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  if (t === '') return null
  if (t.length <= max) return t
  const corte = t.slice(0, max - 1)
  const espacio = corte.lastIndexOf(' ')
  return `${(espacio > max / 2 ? corte.slice(0, espacio) : corte).trimEnd()}…`
}
const fecha = (v: Respuesta | undefined): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
const entero = (v: Respuesta | undefined, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null

// ─── Vehículo ────────────────────────────────────────────────────────────────

export function vehiculoDeSolicitud(r: Record<string, Respuesta>): PropuestaRiesgo {
  const out: PropuestaRiesgo = {}
  const mat = txt(r.matricula, 20)
  if (mat) out.matricula = normalizarMatricula(mat)
  const marca = txt(r.marca, 60)
  const modelo = txt(r.modelo, 80)
  if (marca) out.marca = marca
  if (modelo) out.modelo = modelo
  // Catálogo: la cadena entera o nada (`validarRespuestas` ya la deja así). Que los ids existan lo comprueba asegura.
  const cat = (sub: Parameters<typeof claveVehiculo>[1]) => txt(r[claveVehiculo('versionCatalogo', sub)], 120)
  const codigo = cat('Codigo'), marcaId = cat('MarcaId'), modeloId = cat('ModeloId'), motorId = cat('MotorId')
  if (codigo && marcaId && modeloId && motorId) {
    Object.assign(out, { codigoVehiculo: codigo, marcaId, modeloId, motorId })
    const version = cat('Version')
    if (version) out.version = version
  }
  const fm = fecha(r.fechaMatriculacion)
  if (fm) out.fechaMatriculacion = fm
  if (typeof r.kmAnuales === 'number' && Number.isInteger(r.kmAnuales) && r.kmAnuales > 0) out.kmAnuales = r.kmAnuales
  if (typeof r.garaje === 'string' && Object.hasOwn(ID_GARAJE_SOLICITUD, r.garaje)) out.garaje = ID_GARAJE_SOLICITUD[r.garaje as keyof typeof ID_GARAJE_SOLICITUD]
  const cp = txt(r.codigoPostal, 5)
  if (cp && /^\d{5}$/.test(cp)) out.cpCirculacion = cp
  // Seguro actual + historial (el bloque `CAMPOS_HISTORIAL_VEHICULO`).
  if (typeof r.tieneSeguro === 'boolean') {
    out.aseguradoAntes = r.tieneSeguro
    if (r.tieneSeguro) {
      const comp = txt(r.companiaActual, 80)
      if (comp) out.companiaAnterior = comp
      const vence = fecha(r.vencimientoActual)
      if (vence && vence >= '2000-01-01') out.vencimientoAnterior = vence
    }
  }
  const sin = entero(r.aniosSinSiniestros, 0, ANIOS_SIN_SINIESTROS_MAXIMO)
  if (sin !== null) out.aniosSinSiniestros = sin
  return out
}

// ─── Personas (vida, salud, decesos) ─────────────────────────────────────────

export function capitalDeSolicitud(r: Record<string, Respuesta>, ramo: 'vida' | 'salud' | 'decesos'): PropuestaRiesgo {
  const out: PropuestaRiesgo = {}
  if (ramo === 'vida') {
    if (typeof r.capitalDeseado === 'number' && r.capitalDeseado > 0) out.capital = r.capitalDeseado
    if (typeof r.fumador === 'boolean') out.fumador = r.fumador
    if (typeof r.hipoteca === 'boolean') {
      out.hipoteca = r.hipoteca
      // Lo que cuelga de «sí» solo cuenta con hipoteca (un «no» no tiene banco ni capital pendiente).
      if (r.hipoteca) {
        if (typeof r.paraBanco === 'boolean') out.vinculadaHipoteca = r.paraBanco
        const banco = txt(r.entidadHipoteca, 80)
        if (banco) out.bancoHipoteca = banco
        if (typeof r.capitalPendienteHipoteca === 'number' && r.capitalPendienteHipoteca >= 0) out.capitalPendienteHipoteca = r.capitalPendienteHipoteca
      }
    }
    return out
  }
  const n = entero(r.personasAsegurar, 1, MAX_NUMERO_ASEGURADOS)
  if (n !== null) out.numeroAsegurados = n
  const edades = typeof r.edades === 'string' ? edadesNormalizadas(r.edades) : null
  if (edades) out.edadesAsegurados = edades
  return out
}

// ─── Comercio y libres ───────────────────────────────────────────────────────

export function comercioDeSolicitud(r: Record<string, Respuesta>): PropuestaRiesgo {
  const actividad = recortado(r.descripcionRiesgo, 200)
  return actividad ? { actividad } : {}
}

export function libreDeSolicitud(r: Record<string, Respuesta>, ramo: RamoSolicitud): PropuestaRiesgo {
  const out: PropuestaRiesgo = {}
  const descripcion = recortado(r.descripcionRiesgo, 300)
  if (descripcion) out.descripcion = descripcion
  if (ramo === 'accidentes') {
    const p = txt(r.profesion, 120)
    if (p) out.profesion = p
  }
  if (ramo === 'mascotas') {
    if (typeof r.especieMascota === 'string' && (ESPECIES_MASCOTA as readonly string[]).includes(r.especieMascota)) out.especie = r.especieMascota
    const raza = txt(r.razaMascota, 80)
    if (raza) out.raza = raza
    const nac = fecha(r.fechaNacimientoMascota)
    if (nac) out.fechaNacimientoAnimal = nac
    if (typeof r.ppp === 'boolean') out.ppp = r.ppp
    const chip = typeof r.microchip === 'string' ? r.microchip.replace(/[\s.-]/g, '').toUpperCase() : ''
    if (/^[0-9A-Z]{6,20}$/.test(chip)) out.microchip = chip
  }
  return out
}

/** La propuesta para el bloque del ramo. Hogar va por `viviendaDeSolicitud` (necesita el Catastro): aquí, `null`. */
export function propuestaRiesgoDeSolicitud(ramo: RamoSolicitud, r: Record<string, Respuesta>): { clave: ClaveDatosRiesgo; propuesta: PropuestaRiesgo } | null {
  const clave = claveDatosDeRamo(ramo)
  if (grupoSolicitud(ramo) === 'hogar' || clave === 'datosVivienda') return null
  if (clave === 'datosVehiculo') return { clave, propuesta: vehiculoDeSolicitud(r) }
  if (clave === 'datosCapital') return { clave, propuesta: capitalDeSolicitud(r, ramo as 'vida' | 'salud' | 'decesos') }
  if (clave === 'datosComercio') return { clave, propuesta: comercioDeSolicitud(r) }
  return { clave, propuesta: libreDeSolicitud(r, ramo) }
}

// ─── Plan de escritura por bloques ───────────────────────────────────────────

type Bloque = {
  claves: readonly string[]
  /** Frase del aviso si lo guardado es OTRO (se compara en estas claves). */
  choque: { en: readonly string[]; texto: string } | null
}
type ConfigPlan = {
  bloques: readonly Bloque[]
  /** Uno a uno, solo donde no había nada. Con `choque`, se avisa si lo guardado es distinto. */
  sueltos: readonly { clave: string; choque?: string }[]
}

const CATALOGO_VEHICULO = ['codigoVehiculo', 'marcaId', 'modeloId', 'motorId', 'version'] as const

export const PLAN_POR_BLOQUE: Readonly<Partial<Record<ClaveDatosRiesgo, ConfigPlan>>> = {
  datosVehiculo: {
    bloques: [
      { claves: ['marca', 'modelo'], choque: { en: ['marca', 'modelo'], texto: 'marca o modelo declarados distintos de los guardados: revisar (no se han tocado)' } },
      // El catálogo va con su vehículo: solo si no había versión elegida (lo elegido por la correduría manda).
      { claves: CATALOGO_VEHICULO, choque: { en: ['codigoVehiculo'], texto: 'versión del catálogo elegida por el cliente distinta de la guardada: revisar (no se ha tocado)' } },
      { claves: CAMPOS_HISTORIAL_VEHICULO, choque: { en: ['aseguradoAntes', 'companiaAnterior', 'aniosSinSiniestros'], texto: 'seguro actual o años sin siniestros distintos de los guardados: revisar (no se han tocado)' } },
    ],
    sueltos: [
      { clave: 'matricula' },
      { clave: 'fechaMatriculacion' }, { clave: 'kmAnuales' }, { clave: 'garaje' }, { clave: 'cpCirculacion' },
    ],
  },
  datosCapital: {
    bloques: [
      { claves: CAMPOS_HIPOTECA_CAPITAL, choque: { en: ['hipoteca', 'bancoHipoteca'], texto: 'hipoteca declarada distinta de la guardada: revisar (no se ha tocado)' } },
      { claves: CAMPOS_PERSONAS_CAPITAL, choque: { en: ['numeroAsegurados'], texto: 'número de asegurados distinto del guardado: revisar (no se ha tocado)' } },
    ],
    sueltos: [{ clave: 'capital' }, { clave: 'fumador', choque: '«fuma» declarado distinto de lo guardado: revisar (no se ha tocado)' }],
  },
  datosComercio: { bloques: [], sueltos: [{ clave: 'actividad' }] },
  datosRiesgoLibre: {
    bloques: [{ claves: CAMPOS_MASCOTA_LIBRE, choque: { en: ['especie', 'raza', 'microchip'], texto: 'datos del animal distintos de los guardados: revisar (no se han tocado)' } }],
    sueltos: [{ clave: 'descripcion' }, { clave: 'profesion' }],
  },
}

export type PlanRiesgo = {
  escribir: PropuestaRiesgo
  /** Lo que NO se ha escrito por chocar con lo guardado (frases para el aviso). */
  conflictos: string[]
  /** El bloque estaba confirmado: no se ha tocado nada. */
  confirmado: boolean
}

const vacio = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
const igual = (a: unknown, b: unknown) =>
  typeof a === 'string' && typeof b === 'string'
    ? a.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[\s.,-]/g, '') === b.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[\s.,-]/g, '')
    : a === b

/**
 * Qué se escribe en el bloque `clave` (por bloques atómicos, solo donde no había nada). `actual` = lo que enseña la
 * pantalla del riesgo (lo estructurado o, sin ello, la precarga de la póliza).
 */
export function planEscrituraRiesgo(clave: ClaveDatosRiesgo, actual: Record<string, unknown> | null, propuesta: PropuestaRiesgo, confirmadoAt: string | null = null): PlanRiesgo {
  if (confirmadoAt) return { escribir: {}, conflictos: [], confirmado: true }
  const cfg = PLAN_POR_BLOQUE[clave]
  if (!cfg) return { escribir: {}, conflictos: [], confirmado: false }
  const a = actual ?? {}
  const escribir: PropuestaRiesgo = {}
  const conflictos: string[] = []
  // Otra matrícula = otro vehículo: entonces ni marca/modelo ni catálogo (serían de otro coche).
  const otroVehiculo = clave === 'datosVehiculo' && 'matricula' in propuesta && !vacio(a.matricula) && !igual(a.matricula, propuesta.matricula)
  // Con una versión ya elegida, marca/modelo en texto no se escriben: `aplicarEdicionVehiculo` borraría esa versión.
  const conVersion = clave === 'datosVehiculo' && !vacio(a.codigoVehiculo)
  let chocaIdentidad = false
  for (const b of cfg.bloques) {
    const de = Object.fromEntries(b.claves.flatMap((k) => (k in propuesta ? [[k, propuesta[k]]] : [])))
    if (Object.keys(de).length === 0) continue
    const esIdentidad = clave === 'datosVehiculo' && b.claves.includes('marca')
    const esCatalogo = b.claves === CATALOGO_VEHICULO
    if (otroVehiculo) continue
    if (esIdentidad && conVersion) continue
    // El catálogo es de la marca/modelo declarados: si esos chocan con lo guardado, tampoco.
    if (esCatalogo && chocaIdentidad) continue
    if (b.claves.every((k) => vacio(a[k]))) { Object.assign(escribir, de); continue }
    const choca = b.choque && b.choque.en.some((k) => k in de && !vacio(a[k]) && !igual(a[k], de[k]))
    if (choca && b.choque) conflictos.push(b.choque.texto)
    if (choca && esIdentidad) chocaIdentidad = true
  }
  if (otroVehiculo) conflictos.unshift('matrícula declarada distinta de la guardada: es otro vehículo, no se ha tocado nada del vehículo (revisar)')
  for (const s of cfg.sueltos) {
    if (!(s.clave in propuesta)) continue
    if (otroVehiculo) continue
    if (vacio(a[s.clave])) escribir[s.clave] = propuesta[s.clave]
    else if (s.choque && !igual(a[s.clave], propuesta[s.clave])) conflictos.push(s.choque)
  }
  return { escribir, conflictos, confirmado: false }
}
