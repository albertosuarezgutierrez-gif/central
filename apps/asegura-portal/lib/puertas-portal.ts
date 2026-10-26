/**
 * Las PUERTAS de servidor que cierran lo que el menú no ofrece (26/10/2026): un autorizado puro que escribe a mano
 * `/herramientas/calendario` vuelve a `/inicio`, y su `POST` a `/api/recordatorios` o `/api/autorizaciones` es un 403.
 *
 * La regla NO está aquí: es `puertaAbierta()` de `@central/module-seguros-portal/menu-visible`, sobre los MISMOS hechos
 * que pintan el menú (`menuDeSesion`, identidad de la cookie y, en una página, la misma lectura que ya hizo el layout).
 * Aquí solo se lee y se decide qué hacer si la lectura entera revienta: hechos desconocidos, que en `lectura` abren
 * (como el menú) y en `escritura` cierran.
 *
 * 🚨 No es aislamiento entre clientes: ese lo da cada lectura (`carteraDeIdentidad`, `conceder()`…), que no cambian.
 */
import { HECHOS_DESCONOCIDOS, puertaAbierta, type ModoPuerta, type PuertaPortal } from '@central/module-seguros-portal'

import { menuDeSesion } from './menu-portal'

export async function puertaDeSesion(puerta: PuertaPortal, modo: ModoPuerta): Promise<boolean> {
  let menu: Awaited<ReturnType<typeof menuDeSesion>> = null
  try {
    menu = await menuDeSesion()
  } catch (e) {
    console.error(`[portal/puertas] no se pudo comprobar ${puerta}:`, e instanceof Error ? e.message : e)
  }
  return puertaAbierta(menu === null ? HECHOS_DESCONOCIDOS : menu.hechos, puerta, modo)
}

/** El 403 de una escritura que el menú no ofrece. Misma forma que el resto del portal: `{ error, mensaje }`. */
export const SIN_ACCESO = {
  error: 'sin_acceso',
  mensaje: 'Esto no está disponible con el acceso que tienes. Si crees que es un error, escríbenos.',
} as const
