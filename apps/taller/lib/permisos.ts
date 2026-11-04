// Permisos por rol (decisión de Alberto, 04/11/2026). Se aplican en SERVIDOR: cada acción y cada página llama a
// `exigir(tx, sesion, capacidad)`, que RE-LEE el rol en BD (la cookie no basta) y lanza `SinPermisoError`.
// La UI solo esconde botones; esto es lo que protege.
//
//   dueno      todo (Ajustes, personal, márgenes).
//   admin      recepción, ver OT, presupuestos (+ facturación/proveedores en F2). Sin personal/PIN ni márgenes.
//   recepcion  recepción, clientes/vehículos, presupuestos; OT solo ver estado.
//   mecanico   «mis OT», su parte de horas. SIN precios de venta ni datos de contacto del cliente (solo el nombre).
import type { Acceso } from './acceso.ts'

export const CAPACIDADES = [
  'recepcion', // alta de recepciones, resguardo
  'ordenes_ver', // listar/ver OT (el mecánico, solo las abiertas y sin precios ni contacto)
  'ordenes_gestionar', // cambiar el estado de una OT a mano
  'partes', // abrir/cerrar SU parte de horas
  'presupuestos', // crear/enviar presupuestos
  'precios_ver', // precios de venta, totales, IVA
  'contacto_cliente_ver', // teléfono, correo, NIF del cliente
  'margenes_ver', // baremo vs horas reales y margen
] as const
export type Capacidad = (typeof CAPACIDADES)[number]

const MATRIZ: Readonly<Record<Capacidad, readonly string[]>> = {
  recepcion: ['dueno', 'admin', 'recepcion'],
  ordenes_ver: ['dueno', 'admin', 'recepcion', 'mecanico'],
  ordenes_gestionar: ['dueno'],
  partes: ['dueno', 'mecanico'],
  presupuestos: ['dueno', 'admin', 'recepcion'],
  precios_ver: ['dueno', 'admin', 'recepcion'],
  contacto_cliente_ver: ['dueno', 'admin', 'recepcion'],
  margenes_ver: ['dueno'],
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

type TxRol = { usuarioTaller: { findFirst(a: unknown): Promise<{ rol: string; activo: boolean } | null> } }

/** Rol VIGENTE en BD (usuario activo del taller de la sesión) o null. */
export async function rolVigente(tx: TxRol, s: Acceso): Promise<string | null> {
  const u = await tx.usuarioTaller.findFirst({ where: { tallerId: s.tallerId, id: s.usuarioId }, select: { rol: true, activo: true } })
  return u && u.activo ? u.rol : null
}

/** Devuelve el rol si tiene la capacidad; si no, lanza. */
export async function exigir(tx: TxRol, s: Acceso, cap: Capacidad): Promise<string> {
  const rol = await rolVigente(tx, s)
  if (!tienePermiso(rol, cap)) throw new SinPermisoError(cap)
  return rol as string
}
