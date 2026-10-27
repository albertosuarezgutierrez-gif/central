import { NextResponse } from 'next/server'

import type { GestionVehiculo } from '@central/module-seguros-portal'

import { SIN_ACCESO, puertaDeSesion } from '@/lib/puertas-portal'

/**
 * Piezas comunes de `/api/vehiculos/*` (QR del vehículo, F1 27/10/2026).
 *
 * 🚨 `NO_ENCONTRADO` cubre «no existe» y «no es tuyo» a la vez, a propósito: distinguirlos haría de la ruta un
 * oráculo de ids de vehículos ajenos. Toda ruta de aquí resuelve el vehículo con `puedeGestionarVehiculo` (o el
 * defecto con `puedeGestionarDefecto`) ANTES de tocar nada (cepo `test/regression-portal-vehiculo-qr.test.ts`).
 */
export const NO_ENCONTRADO = { error: 'no_encontrado', mensaje: 'No hemos encontrado ese vehículo.' } as const
export const SIN_SESION = { error: 'sin_sesion', mensaje: 'Tu sesión ha caducado. Vuelve a entrar.' } as const
export const DATOS_INVALIDOS = { error: 'datos_invalidos', mensaje: 'No hemos entendido lo que nos has enviado.' } as const
/** Sin `PORTAL_PUBLIC_URL` https no hay a dónde apuntar el QR: 503 y NO se escribe ninguna fila. */
export const SIN_ENLACE = {
  error: 'sin_enlace',
  mensaje: 'Avería nuestra: no podemos formar el enlace del QR ahora mismo. No se ha creado nada.',
} as const

export async function cuerpoJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const c: unknown = await req.json()
    return typeof c === 'object' && c !== null && !Array.isArray(c) ? (c as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * Los vehículos de EMPRESA pasan además por la puerta de la flota (el menú no la ofrece a quien no la tiene);
 * el del particular no tiene puerta propia: su frontera es ser el dueño del bien.
 */
export async function puertaDelVehiculo(g: GestionVehiculo): Promise<NextResponse | null> {
  if (g.papel === 'dueno_particular') return null
  return (await puertaDeSesion('flota', 'escritura')) ? null : NextResponse.json(SIN_ACCESO, { status: 403 })
}
