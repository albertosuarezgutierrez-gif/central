// Permisos por rol (decisión de Alberto, 04/11/2026). Se aplican en SERVIDOR: cada acción y cada página llama a
// `exigir(tx, sesion, capacidad)`, que RE-LEE el rol en BD (la cookie no basta) y lanza `SinPermisoError`.
// La UI solo esconde botones; esto es lo que protege.
//
//   dueno      todo (Ajustes, personal, márgenes).
//   admin      recepción, ver OT, presupuestos, facturación (+ proveedores en F2). Sin personal/PIN ni márgenes.
//   recepcion  recepción, clientes/vehículos, presupuestos; OT solo ver estado.
//   mecanico   «mis OT», su parte de horas, notas, fotos y propuestas de ampliación (sin precios). SIN precios de venta ni
//              datos de contacto del cliente (solo el nombre).
//
// OT (decisión de Alberto, 04/11/2026): recepción PUEDE pasar en_curso → terminado y terminado → entregado
// (`ordenes_avanzar`); el resto de cambios de estado a mano, solo el dueño (`ordenes_gestionar`).
import { SELECT_ACCESO, sesionVigente, usuarioDeSesion, type Acceso } from './acceso.ts'

export const CAPACIDADES = [
  'recepcion', // alta de recepciones, resguardo
  'ordenes_ver', // listar/ver OT (el mecánico, solo las abiertas y sin precios ni contacto)
  'ordenes_gestionar', // cambiar el estado de una OT a mano (cualquier transición)
  'ordenes_avanzar', // solo en_curso→terminado y terminado→entregado (recepción)
  'ot_trabajo', // notas, fotos y propuestas de ampliación del mecánico en su OT
  'ampliaciones', // poner precio a una propuesta y mandarla al cliente
  'partes', // abrir/cerrar SU parte de horas
  'presupuestos', // crear/enviar presupuestos
  'precios_ver', // precios de venta, totales, IVA
  'contacto_cliente_ver', // teléfono, correo, NIF del cliente
  'margenes_ver', // baremo vs horas reales y margen
  'citas', // agenda: invitar a pedir cita, aceptar/rechazar/mover, convertir en recepción
  'facturar', // emitir la factura de una OT terminada, ver facturas y registrar cobros
  'facturas_rectificar', // anular o rectificar una factura emitida (solo el dueño)
] as const
export type Capacidad = (typeof CAPACIDADES)[number]

const MATRIZ: Readonly<Record<Capacidad, readonly string[]>> = {
  recepcion: ['dueno', 'admin', 'recepcion'],
  ordenes_ver: ['dueno', 'admin', 'recepcion', 'mecanico'],
  ordenes_gestionar: ['dueno'],
  ordenes_avanzar: ['dueno', 'recepcion'],
  ot_trabajo: ['dueno', 'mecanico'],
  ampliaciones: ['dueno', 'admin', 'recepcion'],
  partes: ['dueno', 'mecanico'],
  presupuestos: ['dueno', 'admin', 'recepcion'],
  precios_ver: ['dueno', 'admin', 'recepcion'],
  contacto_cliente_ver: ['dueno', 'admin', 'recepcion'],
  margenes_ver: ['dueno'],
  citas: ['dueno', 'admin', 'recepcion'],
  facturar: ['dueno', 'admin', 'recepcion'],
  facturas_rectificar: ['dueno'],
}

export function tienePermiso(rol: string | null | undefined, cap: Capacidad): boolean {
  return typeof rol === 'string' && (MATRIZ[cap] as readonly string[]).includes(rol)
}

export class SinPermisoError extends Error {
  readonly capacidad: Capacidad
  constructor(capacidad: Capacidad) {
    super(`Sin permiso: ${capacidad}`)
    this.name = 'SinPermisoError'
    this.capacidad = capacidad
  }
}

/** Transiciones de OT que SÍ puede hacer recepción (además del dueño). Todo lo demás: solo `ordenes_gestionar`. */
export const TRANSICIONES_RECEPCION: readonly (readonly [string, string])[] = [['en_curso', 'terminado'], ['terminado', 'entregado']]

/** Capacidad que exige un cambio de estado concreto. */
export const capacidadParaTransicion = (desde: string, hacia: string): Capacidad =>
  TRANSICIONES_RECEPCION.some(([d, h]) => d === desde && h === hacia) ? 'ordenes_avanzar' : 'ordenes_gestionar'

/** La cookie lleva una versión de sesión que ya no es la del usuario (cambió o reseteó el PIN): hay que volver a entrar. */
export class SesionObsoletaError extends Error {
  constructor() {
    super('Sesión obsoleta')
    this.name = 'SesionObsoletaError'
  }
}

/** El PIN es temporal (alta o reset): hasta que elija uno propio, no entra en nada más. */
export class DebeCambiarPinError extends Error {
  constructor() {
    super('Debes cambiar tu PIN temporal')
    this.name = 'DebeCambiarPinError'
  }
}

type TxRol = { usuarioTaller: { findFirst(a: unknown): Promise<{ rol: string; activo: boolean; debeCambiarPin?: boolean; sesionVersion?: number } | null> } }

/** Rol VIGENTE en BD (usuario activo del taller de la sesión, con la misma versión de sesión) o null. */
export async function rolVigente(tx: TxRol, s: Acceso): Promise<string | null> {
  const u = await usuarioDeSesion(tx, s)
  return u ? u.rol : null
}

/** Devuelve el rol si tiene la capacidad; si no, lanza. */
export async function exigir(tx: TxRol, s: Acceso, cap: Capacidad): Promise<string> {
  const f = await tx.usuarioTaller.findFirst({ where: { tallerId: s.tallerId, id: s.usuarioId }, select: SELECT_ACCESO })
  // Usuario activo pero con OTRA versión de sesión (PIN cambiado/reseteado): la cookie vieja ya no vale → a entrar de nuevo.
  if (f && f.activo && !sesionVigente(s, f)) throw new SesionObsoletaError()
  const u = f && f.activo ? f : null
  const rol = u ? u.rol : null
  if (!tienePermiso(rol, cap)) throw new SinPermisoError(cap)
  if (u?.debeCambiarPin === true) throw new DebeCambiarPinError()
  return rol as string
}
