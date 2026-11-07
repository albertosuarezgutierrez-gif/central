// Máquinas de estado del contrato de encargo y de cada herramienta, y permisos por rol. PURO.
// La BD repite la lista blanca de transiciones del contrato en un trigger (apps/empresa/prisma/sql/0001): si una cambia
// aquí, cambia allí (lo vigila apps/empresa/test/esquema-sql.test.ts).
import type { IdHerramienta } from './catalogo.ts'

// ─── Contrato (cada versión emitida) ───────────────────────────────────────────────────────────────────────────────
export type EstadoVersion = 'enviado' | 'firmado' | 'anulado' | 'caducado' | 'sustituido'
export type EventoVersion = 'firmar' | 'anular' | 'caducar' | 'sustituir'

export const DIAS_CADUCIDAD = 30

const TRANSICIONES_VERSION: Record<EstadoVersion, Partial<Record<EventoVersion, EstadoVersion>>> = {
  enviado: { firmar: 'firmado', anular: 'anulado', caducar: 'caducado' },
  firmado: { sustituir: 'sustituido' },
  anulado: {},
  caducado: {},
  sustituido: {},
}

/** Lista blanca (de → a) que el trigger de BD también aplica. */
export const PARES_TRANSICION_VERSION: ReadonlyArray<readonly [EstadoVersion, EstadoVersion]> = Object.entries(TRANSICIONES_VERSION)
  .flatMap(([de, m]) => Object.values(m).map((a) => [de as EstadoVersion, a as EstadoVersion] as const))

export function transicionContrato(estado: EstadoVersion, evento: EventoVersion): { ok: true; estado: EstadoVersion } | { ok: false; error: string } {
  const a = TRANSICIONES_VERSION[estado]?.[evento]
  return a ? { ok: true, estado: a } : { ok: false, error: `No se puede «${evento}» un contrato ${estado}` }
}

export const caducaEn = (emitida: Date, dias = DIAS_CADUCIDAD) => new Date(emitida.getTime() + dias * 86_400_000)

/** Estado que se ENSEÑA: una versión `enviado` con `caduca_en` vencida está caducada aunque nadie la haya marcado. */
export function estadoEfectivo(v: { estado: EstadoVersion; caducaEn: Date }, ahora: Date): EstadoVersion {
  return v.estado === 'enviado' && v.caducaEn.getTime() <= ahora.getTime() ? 'caducado' : v.estado
}

/** Días que lleva pendiente (para «Contrato pendiente desde hace N días»). */
export const diasDesde = (d: Date, ahora: Date) => Math.max(0, Math.floor((ahora.getTime() - d.getTime()) / 86_400_000))

/** ¿Se puede firmar ahora? Solo una versión `enviado` y no caducada. */
export function firmable(v: { estado: EstadoVersion; caducaEn: Date }, ahora: Date): boolean {
  return estadoEfectivo(v, ahora) === 'enviado'
}

/** ¿Admite recordatorio? Igual que firmable: recordar algo caducado o firmado no tiene sentido (se reemite = nuevo OK). */
export const admiteRecordatorio = firmable

// ─── Herramienta de una cuenta ─────────────────────────────────────────────────────────────────────────────────────
/** `apagada` = la fila existe solo para guardar `ref_externa` (sin contratar). Sin fila = apagada también. */
export type EstadoHerramienta = 'apagada' | 'pendiente_firma' | 'activa' | 'suspendida' | 'retirada'
export type EventoHerramienta = 'emitir' | 'firmar' | 'suspender' | 'reanudar' | 'retirar'

const TRANSICIONES_HERRAMIENTA: Record<EstadoHerramienta, Partial<Record<EventoHerramienta, EstadoHerramienta>>> = {
  apagada: { emitir: 'pendiente_firma' },
  retirada: { emitir: 'pendiente_firma' },
  // Re-emitir una pendiente (versión anulada o caducada) la deja pendiente; firmar la activa.
  pendiente_firma: { emitir: 'pendiente_firma', firmar: 'activa', retirar: 'retirada' },
  // Una activa incluida en una versión nueva SIGUE activa (la cubre la versión anterior mientras la nueva está pendiente).
  activa: { emitir: 'activa', firmar: 'activa', suspender: 'suspendida', retirar: 'retirada' },
  suspendida: { reanudar: 'activa', retirar: 'retirada', emitir: 'suspendida', firmar: 'suspendida' },
}

export function transicionHerramienta(estado: EstadoHerramienta, evento: EventoHerramienta): { ok: true; estado: EstadoHerramienta } | { ok: false; error: string } {
  const a = TRANSICIONES_HERRAMIENTA[estado]?.[evento]
  return a ? { ok: true, estado: a } : { ok: false, error: `No se puede «${evento}» una herramienta ${estado}` }
}

// ─── Roles y permisos dentro de «Mi empresa» ───────────────────────────────────────────────────────────────────────
/**
 * ROL GENERAL del miembro en UNA empresa (vale para todas las herramientas; el rol DENTRO de cada app sale de roles.ts):
 * dueno = firma y reparte · admin = opera lo concedido (Pilar) · consulta = ve TODO lo contratado, no firma ni reparte (socio)
 * · empleado = ve lo concedido pero NO salta desde aquí (entra en cada app con su acceso de empleado: /e de rrhh, PIN del taller).
 */
export type Rol = 'dueno' | 'admin' | 'consulta' | 'empleado'
export const ROLES: readonly Rol[] = ['dueno', 'admin', 'consulta', 'empleado']
export const esRol = (v: unknown): v is Rol => typeof v === 'string' && (ROLES as readonly string[]).includes(v)
/** Roles que ven todo lo contratado sin concesión por herramienta. */
const VE_TODO: readonly Rol[] = ['dueno', 'consulta']
export type Accion = 'ver_portada' | 'ver_contrato' | 'firmar' | 'dar_acceso' | 'abrir'

/** Matriz cerrada. consulta VE el panel pero no abre apps (MAPEO_POR_DEFECTO la mapea a null). El admin (p. ej. Pilar, gestora) VE y OPERA pero NO firma ni reparte accesos. */
const MATRIZ: Record<Rol, readonly Accion[]> = {
  dueno: ['ver_portada', 'ver_contrato', 'firmar', 'dar_acceso', 'abrir'],
  admin: ['ver_portada', 'ver_contrato', 'abrir'],
  consulta: ['ver_portada', 'ver_contrato'],
  // Nunca traspaso para empleados (spec §5.2): su sesión es la de la app, no la de Mi empresa.
  empleado: ['ver_portada'],
}

export const puede = (rol: Rol | null | undefined, accion: Accion): boolean => !!rol && (MATRIZ[rol] ?? []).includes(accion)

export type HerramientaDeCuenta = { herramienta: IdHerramienta; estado: EstadoHerramienta }
export type Miembro = { rol: Rol; /** herramientas concedidas a ESTE miembro (dueño y consulta no las necesitan: ven todo). */ concedidas: readonly IdHerramienta[] }
export type TarjetaHerramienta = { herramienta: IdHerramienta; estado: 'activa' | 'pendiente_firma'; abrible: boolean }

/**
 * Lo que ve un miembro en la portada. Lo NO contratado se OCULTA (apagada, retirada, suspendida, sin fila).
 *  · dueño: todas las `activa` (abribles) y las `pendiente_firma` (en gris, «Pendiente de tu firma»).
 *  · consulta: igual que el dueño (ve todo lo contratado) pero sin firmar ni repartir.
 *  · admin: SOLO las que el dueño o el operador le concedió; pendiente → en gris; activa → abrible.
 */
export function herramientasVisibles(cuenta: readonly HerramientaDeCuenta[], miembro: Miembro): TarjetaHerramienta[] {
  const concedidas = new Set(miembro.concedidas)
  const out: TarjetaHerramienta[] = []
  for (const h of cuenta) {
    if (h.estado !== 'activa' && h.estado !== 'pendiente_firma') continue
    if (!VE_TODO.includes(miembro.rol) && !concedidas.has(h.herramienta)) continue
    out.push({ herramienta: h.herramienta, estado: h.estado, abrible: h.estado === 'activa' && puede(miembro.rol, 'abrir') })
  }
  return out
}

/** ¿Puede este miembro saltar a ESA herramienta? (la app de destino vuelve a comprobar SU `usuario_empresas`). */
export function puedeAbrir(cuenta: readonly HerramientaDeCuenta[], miembro: Miembro, herramienta: IdHerramienta): boolean {
  return herramientasVisibles(cuenta, miembro).some((t) => t.herramienta === herramienta && t.abrible)
}

/** Conceder acceso: solo a herramientas contratadas (activa o pendiente) de la cuenta. Dueño y consulta no lo necesitan (ven todo). */
export function concesionValida(cuenta: readonly HerramientaDeCuenta[], herramienta: IdHerramienta): boolean {
  return cuenta.some((h) => h.herramienta === herramienta && (h.estado === 'activa' || h.estado === 'pendiente_firma'))
}
