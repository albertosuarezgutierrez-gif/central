// Marca del taller para las pantallas (servidor): lee la personalización en BD con RLS y firma la URL del logo.
// Cualquier fallo (sin BD, sin Storage, sin taller) cae al DEFAULT: la app nunca se queda sin cabecera por la marca.
import { conTaller } from './db'
import { almacenActivo, SEGUNDOS_URL_FIRMADA } from './almacen'
import { leerMarcaGuardada } from './marca-repo'
import { resolverMarca, type MarcaTaller } from './marca'
import { getSession } from './session'
import { tallerDelDespliegue } from './login'

export async function marcaDelTaller(tallerId: string | null): Promise<MarcaTaller> {
  if (!tallerId) return resolverMarca('sin-taller')
  try {
    const g = await conTaller(tallerId, (tx) => leerMarcaGuardada(tx as never, tallerId))
    const logoUrl = g.logoRuta ? await almacenActivo().urlFirmada(tallerId, g.logoRuta, SEGUNDOS_URL_FIRMADA).catch(() => null) : null
    return resolverMarca(tallerId, { primario: g.primario, secundario: g.secundario, logoUrl })
  } catch {
    return resolverMarca(tallerId)
  }
}

/** Taller de la sesión; sin sesión (login), el del despliegue. */
export async function marcaActual(): Promise<MarcaTaller> {
  const s = await getSession().catch(() => null)
  return marcaDelTaller(s?.tallerId ?? tallerDelDespliegue())
}
