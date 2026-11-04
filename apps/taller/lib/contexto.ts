// Punto ÚNICO de entrada de páginas y acciones: sesión → taller de la sesión → conTaller (RLS) → permiso re-leído en BD.
// Ninguna pantalla confía en el rol de la cookie ni en lo que dice el navegador.
import { conTaller, type Tx } from './db'
import { getSession } from './session'
import { redirect } from 'next/navigation'
import { DebeCambiarPinError, exigir, SinPermisoError, type Capacidad } from './permisos'
import { leerConfig, type TxConfig } from './config-repo'

export class SinSesionError extends Error {}
export type Contexto = { tallerId: string; usuarioId: string; rol: string }

export async function conPermiso<T>(
  cap: Capacidad, fn: (tx: Tx, c: Contexto) => Promise<T>, opciones?: { timeout?: number },
): Promise<T> {
  const s = await getSession()
  if (!s) throw new SinSesionError('sin sesión')
  return conTaller(s.tallerId, async (tx) => {
    const rol = await exigir(tx as never, s, cap)
    return fn(tx, { tallerId: s.tallerId, usuarioId: s.usuarioId, rol })
  }, { timeout: 20_000, ...opciones })
}

export const configDe = (tx: Tx, tallerId: string) => leerConfig(tx as unknown as TxConfig, tallerId)

/** Para páginas: resultado o 'sin_sesion' | 'sin_permiso'. */
export async function paraPagina<T>(cap: Capacidad, fn: (tx: Tx, c: Contexto) => Promise<T>): Promise<T | 'sin_sesion' | 'sin_permiso'> {
  try {
    return await conPermiso(cap, fn)
  } catch (e) {
    if (e instanceof SinSesionError) return 'sin_sesion'
    if (e instanceof SinPermisoError) return 'sin_permiso'
    if (e instanceof DebeCambiarPinError) redirect('/cambiar-pin')
    throw e
  }
}

/** Para acciones: traduce los errores de acceso a un mensaje; el resto se relanza. */
export function mensajeDeAcceso(e: unknown): string | null {
  if (e instanceof SinSesionError) return 'La sesión ha caducado. Vuelve a entrar con tu PIN'
  if (e instanceof SinPermisoError) return 'No tienes permiso para hacer esto'
  if (e instanceof DebeCambiarPinError) return 'Cambia primero tu PIN temporal (menú → Cambiar PIN)'
  return null
}
