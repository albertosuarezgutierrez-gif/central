// Las FIGURAS de una póliza de motor que no son el tomador (03/10/2026, Alberto): propietario del
// vehículo, conductor habitual y conductores ocasionales. Cada una tiene su ficha (lead) y queda
// vinculada a la oportunidad con su rol y al tomador con una relación. Sustituye a la nota
// «Conductor principal en la póliza: …» del historial.
//
// Puro: sin BD, sin red. Aquí se decide QUÉ personas hay, cuál es el tomador (y se descarta), qué
// rol lleva cada una y qué lead sin DNI se puede reutilizar. Dar de alta y vincular es de la app
// (`apps/asegura/lib/oportunidad-figuras.ts`).
//
// ─── La regla, entera ───────────────────────────────────────────────────────
//  - `null` = «no se sabe» (nada de `''`): un DNI que no cuadra la letra es `null`; sin nombre,
//    la figura no existe. Como mucho 6 figuras por documento.
//  - Misma persona en dos roles del MISMO documento: mismo DNI válido, o sin DNI y exactamente el
//    mismo nombre normalizado. Dos DNI distintos no se funden jamás.
//  - El tomador se descarta (su rol es su propia ficha). Un tomador EMPRESA nunca es una figura.
//  - Una persona por rol (`oportunidad_figura`), y los roles del ramo (`rolesDelRamo`: moto no
//    tiene conductor ocasional). Lo que no cabe sigue siendo una persona, sin rol y marcada `extra`.
//  - Fecha de nacimiento 01/01 = casi siempre «solo sé el año»: se guarda, marcada «a confirmar».

import { MARCADORES_SIN_DATO } from './documento-auto.ts'
import { identificadorFiscal } from './poliza-de-documento.ts'
import { TIPOS_CARNET, claveTipoCarnet, revisarCarnet, type TipoCarnet } from './carnet-ficha.ts'
import { fechaTextoAIso } from './fecha-texto.ts'
import { normalizarFechaNacimiento } from './cliente-edicion.ts'
import { rolesDelRamo, type RolFigura } from './variantes-riesgo.ts'

const SIN_DATO = new Set(MARCADORES_SIN_DATO)

function texto(v: unknown, max = 200): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  if (t === '' || SIN_DATO.has(t.toLowerCase())) return null
  return t.slice(0, max)
}

const fechaReal = (v: string | null): v is string => {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

// ─── Lo que se lee ──────────────────────────────────────────────────────────

/** Roles que el lector puede leer de una persona que no es (necesariamente) el tomador. */
export const ROLES_FIGURA_LEIDOS = ['propietario', 'conductor_habitual', 'conductor_ocasional'] as const
export type RolFiguraLeido = (typeof ROLES_FIGURA_LEIDOS)[number]

/** Tope de figuras por documento: más es casi seguro basura del modelo (y cada una abre una ficha). */
export const MAX_FIGURAS = 6

/** Cómo se dice cada rol en la relación con el tomador (observaciones de `cliente_relaciones`). */
export const DETALLE_ROL_FIGURA: Record<RolFiguraLeido, string> = {
  propietario: 'Propietario del vehículo',
  conductor_habitual: 'Conductor habitual',
  conductor_ocasional: 'Conductor ocasional',
}

export type FiguraLeida = {
  rol: RolFiguraLeido
  nombre: string
  /** DNI/NIE de persona física con la letra comprobada; `null` = no figura o no cuadra. */
  dni: string | null
  /** ISO; las fechas en texto español ya vienen convertidas. */
  fechaNacimiento: string | null
  /** La fecha es 01/01: solo se sabe el año. */
  fechaNacimientoAConfirmar: boolean
  fechaCarnet: string | null
  claseCarnet: TipoCarnet | null
  /** Lo que dice el documento: `true` = es el tomador; `null` = no lo dice. */
  esTomador: boolean | null
  /**
   * El identificador leído es el CIF de una PERSONA JURÍDICA (una SL de propietaria, una
   * financiera…). No es una persona: el plan la descarta. `null` = no trae CIF.
   */
  cif: string | null
}

function booleano(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v
  if (typeof v !== 'string') return null
  const t = v.trim().toLowerCase()
  if (['si', 'sí', 'true', 'yes'].includes(t)) return true
  if (['no', 'false'].includes(t)) return false
  return null
}

const ALIAS_ROL: Record<string, RolFiguraLeido> = {
  propietario: 'propietario',
  titular_del_vehiculo: 'propietario',
  conductor_habitual: 'conductor_habitual',
  conductor_principal: 'conductor_habitual',
  conductor_ocasional: 'conductor_ocasional',
  conductor_adicional: 'conductor_ocasional',
}

function rolLeido(v: unknown): RolFiguraLeido | null {
  if (typeof v !== 'string') return null
  const k = v.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  return ALIAS_ROL[k] ?? null
}

/** Una persona leída; sin nombre (o con un rol desconocido) no existe → `null`. */
function figura(v: unknown, rolPorDefecto: RolFiguraLeido | null = null): FiguraLeida | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const nombre = texto(o.nombre, 200)
  const rol = rolLeido(o.rol) ?? rolPorDefecto
  if (!nombre || !rol) return null
  const id = identificadorFiscal(o.dni)
  const nac = fechaTextoAIso(texto(o.fechaNacimiento, 40))
  const car = fechaTextoAIso(texto(o.fechaCarnet, 40))
  const clase = claveTipoCarnet(texto(o.claseCarnet, 10) ?? '')
  const fn = fechaReal(nac) ? nac : null
  return {
    rol,
    nombre,
    dni: id && id.tipoPersona === 'fisica' ? id.valor : null,
    fechaNacimiento: fn,
    fechaNacimientoAConfirmar: fn !== null && fn.endsWith('-01-01'),
    fechaCarnet: fechaReal(car) ? car : null,
    claseCarnet: (TIPOS_CARNET as readonly string[]).includes(clase) ? (clase as TipoCarnet) : null,
    esTomador: booleano(o.esTomador),
    cif: id && id.tipoPersona === 'juridica' ? id.valor : null,
  }
}

/**
 * Las figuras de lo que devolvió el lector (`raw` = el JSON entero). Lee `figuras`; si no trae
 * ninguna válida, el `conductorPrincipal` de siempre cuenta como conductor habitual (lecturas
 * anteriores). Vacío = no se ha leído ninguna (no afirma que la póliza no tenga). Nunca lanza.
 */
export function normalizarFigurasLeidas(raw: unknown): FiguraLeida[] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return []
  const o = raw as Record<string, unknown>
  const lista = Array.isArray(o.figuras) ? o.figuras.slice(0, 20).flatMap((x) => figura(x) ?? []) : []
  if (lista.length > 0) return lista.slice(0, MAX_FIGURAS)
  const cp = figura(o.conductorPrincipal, 'conductor_habitual')
  return cp ? [{ ...cp, rol: 'conductor_habitual' }] : []
}

/** El conductor habitual leído en `figuras` (que no sea el tomador), para el `conductorPrincipal` de siempre. */
export function conductorHabitualLeido(raw: unknown): { nombre: string; fechaNacimiento: string | null; dni: string | null } | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const lista = (raw as Record<string, unknown>).figuras
  if (!Array.isArray(lista)) return null
  for (const x of lista.slice(0, 20)) {
    const f = figura(x)
    if (f && f.rol === 'conductor_habitual' && f.esTomador !== true) return { nombre: f.nombre, fechaNacimiento: f.fechaNacimiento, dni: f.dni }
  }
  return null
}

// ─── ¿Es el tomador? ────────────────────────────────────────────────────────

const VACIAS = new Set(['de', 'del', 'la', 'las', 'los', 'y'])
const palabrasNombre = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9ñ]+/).filter((x) => x.length >= 2 && !VACIAS.has(x))

/** Formas jurídicas que no cuentan al comparar una razón social («Ejemplo Viajes, S.L.» = «Ejemplo Viajes SL»). */
const FORMAS_JURIDICAS = new Set(['sl', 'slu', 'sa', 'sau', 'sll', 'slne', 'sc', 'scp', 'cb', 'sociedad', 'limitada', 'anonima', 'unipersonal', 'cooperativa', 'coop'])

/** La razón social normalizada: sin tildes, puntos, forma jurídica ni orden. */
export function claveRazonSocial(nombre: string): string {
  const t = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    // «S.L.», «S. A. U.» → «sl», «sau»: se juntan las siglas antes de partir en palabras.
    .replace(/\b([a-z])\.\s*(?=[a-z]\b\.?)/g, '$1').replace(/\./g, '')
  return t.split(/[^a-z0-9ñ]+/).filter((x) => x.length >= 2 && !VACIAS.has(x) && !FORMAS_JURIDICAS.has(x)).sort().join(' ')
}

/** El nombre normalizado para comparar «exactamente igual»: sin tildes, mayúsculas ni orden. */
export function claveNombre(nombre: string): string {
  return palabrasNombre(nombre).sort().join(' ')
}

export type TomadorFiguras = {
  /** Nombre del tomador tal como sale (razón social si es empresa); `null` = no legible. */
  nombre: string | null
  /** Su DNI/NIE (o CIF): solo un DNI/NIE de persona física cuenta para comparar. */
  dni: string | null
  empresa: boolean
}

/**
 * ¿Esta persona es OTRA que el tomador? Con un tomador empresa, siempre. DNI de los dos → si
 * difieren. Si no, por nombre: uno contenido en el otro («Ana» en «Ana Ruiz Gil») es la MISMA
 * persona (ante la duda no se abre otra ficha). Sin tomador legible no se sabe → `false`.
 */
export function esOtraPersona(p: { nombre: string; dni: string | null }, t: TomadorFiguras): boolean {
  if (t.empresa) return true
  const a = identificadorFiscal(t.dni)
  const dt = a && a.tipoPersona === 'fisica' ? a.valor : null
  if (p.dni && dt) return p.dni !== dt
  if (!t.nombre) return false
  const pt = new Set(palabrasNombre(t.nombre))
  const pc = new Set(palabrasNombre(p.nombre))
  const [corto, largo] = pt.size <= pc.size ? [pt, pc] : [pc, pt]
  if (corto.size === 0) return false
  return ![...corto].every((x) => largo.has(x))
}

// ─── El plan ────────────────────────────────────────────────────────────────

/** Lo leído que el plan necesita además de las figuras (lo de arriba del documento). */
export type LecturaFiguras = {
  figuras: readonly FiguraLeida[]
  /** Del tomador persona física; de una empresa, la del conductor. */
  fechaNacimiento: string | null
  /** Del CONDUCTOR HABITUAL (sea o no el tomador). */
  fechaCarnet: string | null
  claseCarnet: TipoCarnet | null
  tomadorEsConductorHabitual: boolean | null
}

export type PersonaFigura = {
  nombre: string
  dni: string | null
  fechaNacimiento: string | null
  fechaNacimientoAConfirmar: boolean
  fechaCarnet: string | null
  claseCarnet: TipoCarnet | null
  /** Todo lo que el documento dice que es (para la relación y para «conductor joven»). */
  rolesLeidos: RolFiguraLeido[]
  /** Los roles que se le ASIGNAN en la oportunidad (uno por rol, los del ramo). */
  roles: RolFigura[]
  /** Algún rol leído no se le ha podido asignar (ya lo tenía otro, o el ramo no lo tiene). */
  extra: boolean
}

export type PlanFiguras = {
  personas: PersonaFigura[]
  /** El tomador conduce (lo dice el documento): cuenta para «conductor joven o novel». */
  tomadorConduce: boolean
  /** Fechas del tomador como conductor; `null` = no conduce o no se sabe. */
  tomadorConductor: { fechaNacimiento: string | null; fechaCarnet: string | null } | null
}

const ES_CONDUCTOR = (r: RolFiguraLeido) => r === 'conductor_habitual' || r === 'conductor_ocasional'

/**
 * Quién hay en la póliza, además del tomador, y qué rol lleva cada uno. Solo motor (auto/moto):
 * otro ramo → plan vacío.
 */
export function planFiguras(l: LecturaFiguras, t: TomadorFiguras, ramo: string): PlanFiguras {
  const vacio: PlanFiguras = { personas: [], tomadorConduce: false, tomadorConductor: null }
  if (ramo !== 'auto' && ramo !== 'moto') return vacio
  const delRamo = rolesDelRamo(ramo)
  const dniTomador = (() => {
    const a = identificadorFiscal(t.dni)
    return a && a.tipoPersona === 'fisica' ? a.valor : null
  })()

  const cifTomador = (() => {
    const a = identificadorFiscal(t.dni)
    return a && a.tipoPersona === 'juridica' ? a.valor : null
  })()
  const claveEmpresa = t.empresa && t.nombre ? claveRazonSocial(t.nombre) : ''

  const esElTomador = (f: FiguraLeida): boolean => {
    // Tomador EMPRESA (revisión 03/10/2026): la SL puesta de propietaria por la IA es el tomador,
    // no un lead nuevo. Se reconoce por su CIF o por su razón social (sin la forma jurídica).
    if (t.empresa) return (f.cif !== null && f.cif === cifTomador) || (claveEmpresa !== '' && claveRazonSocial(f.nombre) === claveEmpresa)
    if (f.dni && dniTomador) return f.dni === dniTomador
    if (f.esTomador === true) return true
    // «Conductor habitual: el tomador» sin DNI que lo contradiga.
    if (f.rol === 'conductor_habitual' && l.tomadorEsConductorHabitual === true && !f.dni) return true
    return !esOtraPersona(f, t)
  }

  const personas: PersonaFigura[] = []
  const ocupados = new Set<RolFiguraLeido>()
  let tomadorConduce = l.tomadorEsConductorHabitual === true && !t.empresa
  let datosTomador: { fechaNacimiento: string | null; fechaCarnet: string | null } = { fechaNacimiento: null, fechaCarnet: null }

  for (const f of l.figuras.slice(0, MAX_FIGURAS)) {
    // Una figura con CIF es una persona JURÍDICA (otra empresa: la financiera, el renting): no se le
    // abre ficha de persona. El rol queda ocupado (lo tiene ella, no el siguiente de la lista).
    if (f.cif !== null && !esElTomador(f)) {
      ocupados.add(f.rol)
      continue
    }
    if (esElTomador(f)) {
      // Su rol queda «el mismo que el tomador» (sin fila en `oportunidad_figura`): ocupa el sitio.
      ocupados.add(f.rol)
      if (ES_CONDUCTOR(f.rol)) tomadorConduce = true
      datosTomador = { fechaNacimiento: datosTomador.fechaNacimiento ?? f.fechaNacimiento, fechaCarnet: datosTomador.fechaCarnet ?? f.fechaCarnet }
      continue
    }
    const clave = claveNombre(f.nombre)
    const mismoNombre = personas.filter((p) => clave !== '' && claveNombre(p.nombre) === clave)
    let p: PersonaFigura | undefined
    if (f.dni) {
      p = personas.find((x) => x.dni === f.dni)
      // Con DNI, se une a la del mismo nombre solo si es la ÚNICA y no tiene DNI (otro DNI = otra persona).
      if (!p && mismoNombre.length === 1 && !mismoNombre[0].dni) p = mismoNombre[0]
    } else if (mismoNombre.length === 1) {
      p = mismoNombre[0]
    }
    if (p) {
      p.dni ??= f.dni
      if (!p.fechaNacimiento && f.fechaNacimiento) {
        p.fechaNacimiento = f.fechaNacimiento
        p.fechaNacimientoAConfirmar = f.fechaNacimientoAConfirmar
      }
      p.fechaCarnet ??= f.fechaCarnet
      p.claseCarnet ??= f.claseCarnet
      if (!p.rolesLeidos.includes(f.rol)) p.rolesLeidos.push(f.rol)
    } else {
      p = {
        nombre: f.nombre,
        dni: f.dni,
        fechaNacimiento: f.fechaNacimiento,
        fechaNacimientoAConfirmar: f.fechaNacimientoAConfirmar,
        fechaCarnet: f.fechaCarnet,
        claseCarnet: f.claseCarnet,
        rolesLeidos: [f.rol],
        roles: [],
        extra: false,
      }
      personas.push(p)
    }
    // Una persona por rol: el primero que lo lleva en el documento (el tomador también ocupa el suyo).
    if (delRamo.includes(f.rol) && !ocupados.has(f.rol)) {
      ocupados.add(f.rol)
      p.roles.push(f.rol)
    }
  }
  // `extra` = algún rol leído que no se le ha asignado (otro lo tenía, o el ramo no lo tiene).
  for (const p of personas) p.extra = p.rolesLeidos.some((r) => !p.roles.includes(r))

  // Carné (y, de una empresa, la fecha de nacimiento) de arriba del documento son del CONDUCTOR
  // HABITUAL: si no es el tomador, van a su ficha (antes se tiraban con un tomador empresa).
  const habitual = personas.find((p) => p.rolesLeidos.includes('conductor_habitual'))
  if (habitual && (t.empresa || l.tomadorEsConductorHabitual === false)) {
    habitual.fechaCarnet ??= l.fechaCarnet
    habitual.claseCarnet ??= l.claseCarnet
    if (t.empresa && !habitual.fechaNacimiento && l.fechaNacimiento) {
      habitual.fechaNacimiento = l.fechaNacimiento
      habitual.fechaNacimientoAConfirmar = l.fechaNacimiento.endsWith('-01-01')
    }
  }

  const tomadorConductor = tomadorConduce
    ? {
        fechaNacimiento: datosTomador.fechaNacimiento ?? (t.empresa ? null : l.fechaNacimiento),
        fechaCarnet: datosTomador.fechaCarnet ?? (l.tomadorEsConductorHabitual === true ? l.fechaCarnet : null),
      }
    : null
  return { personas, tomadorConduce, tomadorConductor }
}

/** «Propietario del vehículo y conductor habitual (póliza 123)»: el detalle de la relación con el tomador. */
export function detalleRelacionFigura(roles: readonly RolFiguraLeido[], numeroPoliza: string | null): string {
  const partes = roles.map((r, i) => (i === 0 ? DETALLE_ROL_FIGURA[r] : DETALLE_ROL_FIGURA[r].toLowerCase()))
  const que = partes.length <= 1 ? (partes[0] ?? 'Figura de la póliza') : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
  const num = texto(numeroPoliza, 60)
  return num ? `${que} (póliza ${num})` : que
}

// ─── Reutilizar un lead SIN DNI ─────────────────────────────────────────────

export type CandidatoLeadSinDni = {
  id: string
  nombre: string | null
  apellidos: string | null
  /** `clientes.tipo`: solo un `lead` se puede reutilizar por nombre. */
  tipo: string
  /** La ficha tiene DNI (aunque no se pueda leer): entonces no se toma por nombre. */
  tieneDni: boolean
  /** Ya tiene una relación con ESTE tomador. */
  relacionadoConTomador: boolean
}

/**
 * Una figura SIN DNI solo reutiliza un lead que (1) es `lead`, (2) no tiene DNI, (3) se llama
 * EXACTAMENTE igual (sin tildes, mayúsculas ni orden; una sola palabra vale si es la misma) y
 * (4) YA está relacionado con este tomador. Nunca una ficha de cliente ni una
 * con DNI, ni el «Juan Pérez» de otra familia: el nombre solo no identifica. Si hay varios, el
 * primero (más antiguo, como los trae la app). Ninguno → `null` (se abre uno nuevo).
 */
export function leadSinDniReutilizable(candidatos: readonly CandidatoLeadSinDni[], nombre: string): string | null {
  const clave = claveNombre(nombre)
  // Una sola palabra también vale (revisión 03/10/2026): el universo ya es solo lo vinculado a ESTE tomador.
  if (clave === '') return null
  const c = candidatos.find(
    (x) => x.tipo === 'lead' && !x.tieneDni && x.relacionadoConTomador && claveNombre(`${x.nombre ?? ''} ${x.apellidos ?? ''}`) === clave,
  )
  return c?.id ?? null
}

// ─── Lo que va a la ficha de la figura ──────────────────────────────────────

export type ParcheFigura = {
  fechaNacimiento: string | null
  fechaNacimientoAConfirmar: boolean
  carnet: { tipo: TipoCarnet; fecha: string } | null
  /** Qué se rellenaría, en palabras (para el historial; nunca valores). */
  rellenado: string[]
}

/**
 * Fecha de nacimiento y carné de la figura a SU ficha, solo HUECOS (mismo criterio que el tomador:
 * `parcheFichaDesdePoliza`). La identidad (DNI, o el lead recién abierto / ya vinculado) la ha
 * comprobado quien llama. Carné solo si la ficha no tiene NINGUNO; sin clase, auto = B y moto no
 * se adivina. `carnets: null` = no se pudo mirar → no se escribe carné.
 */
export function parcheFigura(
  ficha: { tieneFechaNacimiento: boolean; carnets: number | null },
  p: Pick<PersonaFigura, 'fechaNacimiento' | 'fechaCarnet' | 'claseCarnet'>,
  ramo: string,
  hoyIso: string,
): ParcheFigura {
  const out: ParcheFigura = { fechaNacimiento: null, fechaNacimientoAConfirmar: false, carnet: null, rellenado: [] }
  if (!ficha.tieneFechaNacimiento && p.fechaNacimiento) {
    const r = normalizarFechaNacimiento(p.fechaNacimiento, new Date(`${hoyIso}T23:59:59Z`))
    if (r.ok) {
      out.fechaNacimiento = r.valor
      out.fechaNacimientoAConfirmar = r.valor.endsWith('-01-01')
      out.rellenado.push(out.fechaNacimientoAConfirmar ? 'fecha de nacimiento (01/01, a confirmar)' : 'fecha de nacimiento')
    }
  }
  if (ficha.carnets === 0 && fechaReal(p.fechaCarnet)) {
    const tipo: TipoCarnet | null = p.claseCarnet ?? (ramo === 'auto' ? 'B' : null)
    if (tipo) {
      const r = revisarCarnet({ tipo, fecha: p.fechaCarnet, fechaNacimiento: out.fechaNacimiento ?? p.fechaNacimiento, hoy: hoyIso })
      if (r.ok) {
        out.carnet = { tipo: r.tipo, fecha: r.fecha }
        out.rellenado.push(`carné ${r.tipo}`)
      }
    }
  }
  return out
}

// ─── Conductor joven o novel ────────────────────────────────────────────────

export const EDAD_CONDUCTOR_JOVEN = 25
export const ANIOS_CONDUCTOR_NOVEL = 2
/** La línea del historial de la oportunidad. Sin datos personales: el historial no se borra. */
export const NOTA_CONDUCTOR_JOVEN_NOVEL = 'Hay un conductor joven/novel: revisar antes de tarificar'

/** Años cumplidos entre dos fechas ISO. */
function anios(desde: string, hasta: string): number {
  const [a1, m1, d1] = desde.split('-').map(Number)
  const [a2, m2, d2] = hasta.split('-').map(Number)
  return a2 - a1 - (m2 < m1 || (m2 === m1 && d2 < d1) ? 1 : 0)
}

/**
 * ¿Algún conductor tiene menos de 25 años o menos de 2 de carné? Solo con fechas CONOCIDAS: sin
 * fecha no se afirma nada (`false`). Una nacimiento 01/01 («solo el año») da la edad MÁXIMA
 * posible, así que si aun así sale joven, lo es.
 */
export function hayConductorJovenONovel(
  conductores: readonly { fechaNacimiento: string | null; fechaCarnet: string | null }[],
  hoyIso: string,
): boolean {
  if (!fechaReal(hoyIso)) return false
  return conductores.some((c) => {
    const joven = fechaReal(c.fechaNacimiento) && c.fechaNacimiento <= hoyIso && anios(c.fechaNacimiento, hoyIso) < EDAD_CONDUCTOR_JOVEN
    const novel = fechaReal(c.fechaCarnet) && c.fechaCarnet <= hoyIso && anios(c.fechaCarnet, hoyIso) < ANIOS_CONDUCTOR_NOVEL
    return joven || novel
  })
}

/** Los conductores del plan (habituales y ocasionales leídos, y el tomador si conduce), con sus fechas. */
export function conductoresDelPlan(plan: PlanFiguras): { fechaNacimiento: string | null; fechaCarnet: string | null }[] {
  const out = plan.personas
    .filter((p) => p.rolesLeidos.some(ES_CONDUCTOR))
    .map((p) => ({ fechaNacimiento: p.fechaNacimiento, fechaCarnet: p.fechaCarnet }))
  if (plan.tomadorConductor) out.push(plan.tomadorConductor)
  return out
}
