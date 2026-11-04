// Configuración de un taller. Decisión de Alberto (04/11/2026): TODO lo que varía entre talleres es
// configuración editable por el dueño; la lógica NUNCA lleva precios, IVA ni intervalos literales.
// Los valores de alta viven SOLO en `defaults.ts` (un cepo lo vigila: test/guardian-literales.test.ts).
//
// Fuera de este objeto, pero también configurables por el dueño (son tablas, no ajustes):
// mecánicos/usuarios con PIN (`taller.usuarios_taller`) y proveedores (`taller.proveedores`).
//
// NO es configurable por el taller: el texto y la versión del consentimiento Grupo ASegura
// (`consentimiento.ts`). Los textos de `TextosTaller` son solo los del taller.

/** Unidades: dinero en céntimos enteros; porcentajes en puntos básicos (1 % = 100 pb); tiempo en minutos. */
export const PUNTOS_BASICOS_100 = 10000

export type TipoLinea = 'mano_obra' | 'pieza' | 'granel' | 'otro'
export const TIPOS_LINEA: readonly TipoLinea[] = ['mano_obra', 'pieza', 'granel', 'otro']

export interface TipoIva {
  codigo: string
  nombre: string
  /** Puntos básicos sobre la base (p. ej. el general se guarda como pb, nunca como fracción). */
  puntosBasicos: number
}

export interface TipoVehiculo {
  codigo: string
  nombre: string
  /** Recargo sobre la mano de obra calculada por baremo, en pb (0 = sin recargo). */
  recargoPuntosBasicos: number
  activo: boolean
}

export interface Aceite {
  codigo: string
  nombre: string
  /** «generico» (gama amplia) o «especifico»; texto libre para que el taller cree otras familias. */
  familia: string
  precioLitroCent: number
  /** Si falta, se usa `ivaPorDefecto.granel`. */
  ivaCodigo?: string
  activo: boolean
}

export interface PiezaPaquete {
  descripcion: string
  referencia?: string
  cantidad: number
  precioUnitarioCent: number
  ivaCodigo?: string
}

export interface Paquete {
  codigo: string
  nombre: string
  /** Horas tabuladas del paquete, en minutos. */
  baremoMinutos: number
  /**
   * Precio CERRADO de la mano de obra por código de tipo de vehículo (céntimos, sin IVA).
   * Si el tipo no está, la mano de obra sale de baremo × precio hora × (1 + recargo del tipo).
   */
  precioCerradoPorTipo: Record<string, number>
  piezas: PiezaPaquete[]
  /** Si exige aceite, el presupuesto pide aceite y litros del vehículo; sin ellos NO se calcula. */
  requiereAceite: boolean
  activo: boolean
}

export interface SerieFactura {
  codigo: string
  prefijo: string
  descripcion: string
  rectificativa: boolean
  porDefecto: boolean
}

export interface MedioCobro {
  codigo: string
  nombre: string
  esEfectivo: boolean
  activo: boolean
}

export interface IntervalosAvisos {
  itvAntelacionDias: number
  revisionFechaAntelacionDias: number
  revisionKmAntelacion: number
  seguroAntelacionDias: number
  recordatorioCitaHoras: number
}

export interface FranjaHorario {
  /** 0 = domingo … 6 = sábado (como `Date.getUTCDay`). */
  diaSemana: number
  desde: string // 'HH:MM'
  hasta: string // 'HH:MM'
}

export interface HorarioCitas {
  franjas: FranjaHorario[]
  duracionHuecoMinutos: number
  puestos: number
}

/** Cómo entra una cita pedida por el cliente: se confirma sola o queda `pedida` hasta que el taller la acepte. */
export const CONFIRMACIONES_CITA = ['automatica', 'manual'] as const
export type ConfirmacionCita = (typeof CONFIRMACIONES_CITA)[number]

/** Día de cierre o festivo del taller (fecha local 'AAAA-MM-DD'): no se ofrece ni una franja ese día. */
export interface CierreAgenda {
  fecha: string
  motivo: string
}

/**
 * Agenda con CAPACIDAD (spec «Citas por enlace y agenda con capacidad»). Se reparte por franja de entrada y por horas-mecánico
 * del día, no por mecánico concreto. El horario semanal y la duración de la franja de entrada son `horarioCitas`; `puestos` =
 * mecánicos/puestos activos. Todo lo de aquí lo edita el dueño en Ajustes.
 */
export interface ConfigAgenda {
  /** Zona horaria IANA del taller: los horarios y los cierres son hora local. */
  zonaHoraria: string
  cierres: CierreAgenda[]
  /** Máximo de coches que pueden ENTRAR en una misma franja. */
  maxCochesPorFranja: number
  /** % de las horas-mecánico del día que se puede ocupar con citas y trabajo pendiente, en pb (el resto es colchón). */
  ocupablePuntosBasicos: number
  /** Minutos que se suman a cada trabajo (limpieza, entrega, imprevistos). */
  margenEntreTrabajosMinutos: number
  /** El cliente no puede reservar con menos de estas horas de antelación. */
  antelacionMinimaHoras: number
  /** …ni con más de estos días. */
  antelacionMaximaDias: number
  confirmacion: ConfirmacionCita
  /** Duración del servicio «diagnóstico / no sé qué le pasa» (y de una OT abierta sin baremo). */
  duracionDiagnosticoMinutos: number
  /** Días que vale el enlace de invitación a pedir cita. */
  invitacionCaducaDias: number
}

export interface TextosTaller {
  pieResguardo: string
  pieFactura: string
  condicionesPresupuesto: string
  firmaCorreo: string
  /** Casilla 2 (uso comercial PROPIO del taller). La de Grupo ASegura no está aquí a propósito. */
  textoConsentimientoComercialTaller: string
  versionTextoComercialTaller: string
}

/** Tope de seguridad del login POR TALLER (además del bloqueo por IP): N fallos totales en una ventana → login del taller bloqueado. */
export interface SeguridadLogin {
  maxFallosTaller: number
  ventanaMinutos: number
  bloqueoMinutos: number
  /** Fallos de PIN de UN usuario que lo bloquean (además del tope por IP y por taller). */
  maxFallosUsuario: number
  /** Minutos que queda bloqueado ese usuario (alta: 5 h). */
  bloqueoUsuarioMinutos: number
  /** Duración máxima de la sesión PIN (minutos desde que se entra). */
  sesionMinutos: number
  /** Cierre por inactividad (minutos sin usar la app). */
  inactividadMinutos: number
}

export interface ConfigTaller {
  precioHoraCent: number
  ivas: TipoIva[]
  ivaPorDefecto: Record<TipoLinea, string>
  tiposVehiculo: TipoVehiculo[]
  paquetes: Paquete[]
  aceites: Aceite[]
  series: SerieFactura[]
  mediosCobro: MedioCobro[]
  intervalosAvisos: IntervalosAvisos
  horarioCitas: HorarioCitas
  agenda: ConfigAgenda
  textos: TextosTaller
  validezPresupuestoDias: number
  seguridadLogin: SeguridadLogin
}

const esEnteroNoNeg = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0
const esEnteroPos = (n: unknown): n is number => esEnteroNoNeg(n) && n > 0
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

function duplicados(codigos: string[]): string[] {
  const vistos = new Set<string>()
  const rep = new Set<string>()
  for (const c of codigos) (vistos.has(c) ? rep : vistos).add(c)
  return [...rep]
}

/** Fecha 'AAAA-MM-DD' que existe de verdad (no 2026-02-30). */
export function esFechaIso(f: unknown): f is string {
  if (typeof f !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return false
  const [y, m, d] = f.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** Servicio reservado de la agenda: «diagnóstico / no sé». Ningún paquete puede llamarse así. */
export const SERVICIO_DIAGNOSTICO = 'diagnostico'

function zonaValida(z: unknown): boolean {
  if (typeof z !== 'string' || !z.trim()) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: z })
    return true
  } catch {
    return false
  }
}

function validarAgenda(c: ConfigTaller): string[] {
  const e: string[] = []
  const a = c.agenda
  if (!a) return ['falta la configuración de agenda']
  if (!zonaValida(a.zonaHoraria)) e.push('agenda.zonaHoraria inválida')
  for (const d of duplicados(a.cierres.map((x) => x.fecha))) e.push(`cierre duplicado: ${d}`)
  for (const x of a.cierres) if (!esFechaIso(x.fecha)) e.push(`cierre con fecha inválida: ${String(x.fecha)}`)
  if (!esEnteroPos(a.maxCochesPorFranja)) e.push('agenda.maxCochesPorFranja debe ser un entero > 0')
  if (!esEnteroPos(a.ocupablePuntosBasicos) || a.ocupablePuntosBasicos > PUNTOS_BASICOS_100) e.push('agenda.ocupablePuntosBasicos fuera de rango (1-100 %)')
  if (!esEnteroNoNeg(a.margenEntreTrabajosMinutos)) e.push('agenda.margenEntreTrabajosMinutos debe ser un entero ≥ 0')
  if (!esEnteroNoNeg(a.antelacionMinimaHoras)) e.push('agenda.antelacionMinimaHoras debe ser un entero ≥ 0')
  if (!esEnteroPos(a.antelacionMaximaDias)) e.push('agenda.antelacionMaximaDias debe ser un entero > 0')
  if (!(CONFIRMACIONES_CITA as readonly string[]).includes(a.confirmacion)) e.push('agenda.confirmacion inválida')
  if (!esEnteroPos(a.duracionDiagnosticoMinutos)) e.push('agenda.duracionDiagnosticoMinutos debe ser un entero > 0')
  if (!esEnteroPos(a.invitacionCaducaDias)) e.push('agenda.invitacionCaducaDias debe ser un entero > 0')
  if (c.paquetes.some((p) => p.codigo === SERVICIO_DIAGNOSTICO)) e.push(`el código de paquete «${SERVICIO_DIAGNOSTICO}» está reservado`)
  return e
}

/** Valida una configuración completa. Devuelve la lista de errores (vacía = válida). */
export function validarConfig(c: ConfigTaller): string[] {
  const e: string[] = []
  if (!esEnteroPos(c.precioHoraCent)) e.push('precioHoraCent debe ser un entero de céntimos > 0')

  if (c.ivas.length === 0) e.push('falta al menos un tipo de IVA')
  for (const d of duplicados(c.ivas.map((i) => i.codigo))) e.push(`IVA duplicado: ${d}`)
  for (const i of c.ivas) {
    if (!esEnteroNoNeg(i.puntosBasicos) || i.puntosBasicos > PUNTOS_BASICOS_100) {
      e.push(`IVA ${i.codigo}: puntosBasicos fuera de rango`)
    }
  }
  const codIva = new Set(c.ivas.map((i) => i.codigo))
  for (const t of TIPOS_LINEA) {
    if (!codIva.has(c.ivaPorDefecto[t])) e.push(`ivaPorDefecto.${t} no existe en ivas`)
  }

  for (const d of duplicados(c.tiposVehiculo.map((t) => t.codigo))) e.push(`tipo de vehículo duplicado: ${d}`)
  for (const t of c.tiposVehiculo) {
    if (!esEnteroNoNeg(t.recargoPuntosBasicos)) e.push(`tipo ${t.codigo}: recargo inválido`)
  }
  const codTipo = new Set(c.tiposVehiculo.map((t) => t.codigo))

  for (const d of duplicados(c.aceites.map((a) => a.codigo))) e.push(`aceite duplicado: ${d}`)
  for (const a of c.aceites) {
    if (!esEnteroPos(a.precioLitroCent)) e.push(`aceite ${a.codigo}: precioLitroCent inválido`)
    if (a.ivaCodigo !== undefined && !codIva.has(a.ivaCodigo)) e.push(`aceite ${a.codigo}: IVA ${a.ivaCodigo} no existe`)
  }

  for (const d of duplicados(c.paquetes.map((p) => p.codigo))) e.push(`paquete duplicado: ${d}`)
  for (const p of c.paquetes) {
    if (!esEnteroNoNeg(p.baremoMinutos)) e.push(`paquete ${p.codigo}: baremoMinutos inválido`)
    for (const [tipo, precio] of Object.entries(p.precioCerradoPorTipo)) {
      if (!codTipo.has(tipo)) e.push(`paquete ${p.codigo}: tipo de vehículo ${tipo} no existe`)
      if (!esEnteroNoNeg(precio)) e.push(`paquete ${p.codigo}: precio cerrado de ${tipo} inválido`)
    }
    for (const pz of p.piezas) {
      if (!esEnteroPos(pz.cantidad)) e.push(`paquete ${p.codigo}: cantidad de «${pz.descripcion}» inválida`)
      if (!esEnteroNoNeg(pz.precioUnitarioCent)) e.push(`paquete ${p.codigo}: precio de «${pz.descripcion}» inválido`)
      if (pz.ivaCodigo !== undefined && !codIva.has(pz.ivaCodigo)) e.push(`paquete ${p.codigo}: IVA ${pz.ivaCodigo} no existe`)
    }
  }

  for (const d of duplicados(c.series.map((s) => s.codigo))) e.push(`serie duplicada: ${d}`)
  if (c.series.filter((s) => s.porDefecto && !s.rectificativa).length !== 1) {
    e.push('debe haber exactamente una serie ordinaria por defecto')
  }

  for (const d of duplicados(c.mediosCobro.map((m) => m.codigo))) e.push(`medio de cobro duplicado: ${d}`)
  if (!c.mediosCobro.some((m) => m.activo)) e.push('falta al menos un medio de cobro activo')

  for (const [k, v] of Object.entries(c.intervalosAvisos)) {
    if (!esEnteroNoNeg(v)) e.push(`intervalosAvisos.${k} debe ser un entero ≥ 0`)
  }

  const h = c.horarioCitas
  if (!esEnteroPos(h.duracionHuecoMinutos)) e.push('horarioCitas.duracionHuecoMinutos inválido')
  if (!esEnteroPos(h.puestos)) e.push('horarioCitas.puestos inválido')
  for (const f of h.franjas) {
    if (!Number.isInteger(f.diaSemana) || f.diaSemana < 0 || f.diaSemana > 6) e.push(`franja con día ${f.diaSemana} inválido`)
    if (!HHMM.test(f.desde) || !HHMM.test(f.hasta) || f.desde >= f.hasta) e.push(`franja ${f.desde}-${f.hasta} inválida`)
  }

  e.push(...validarAgenda(c))

  if (!esEnteroPos(c.validezPresupuestoDias)) e.push('validezPresupuestoDias inválido')
  for (const [k, v] of Object.entries(c.seguridadLogin ?? {})) {
    if (!esEnteroPos(v)) e.push(`seguridadLogin.${k} debe ser un entero > 0`)
  }
  if (!c.seguridadLogin) e.push('falta seguridadLogin')
  else {
    for (const k of ['maxFallosTaller', 'ventanaMinutos', 'bloqueoMinutos', 'maxFallosUsuario', 'bloqueoUsuarioMinutos', 'sesionMinutos', 'inactividadMinutos'] as const) {
      if (!esEnteroPos(c.seguridadLogin[k])) e.push(`seguridadLogin.${k} debe ser un entero > 0`)
    }
  }
  if (!c.textos.versionTextoComercialTaller.trim() || !c.textos.textoConsentimientoComercialTaller.trim()) {
    e.push('falta el texto/versión del consentimiento comercial del taller')
  }
  return e
}
