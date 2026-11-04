// Envoltorio con next/headers + BD de lib/dispositivo.ts (el puro es el que se prueba).
import { cookies } from 'next/headers'
import { tallerPorCodigoBd } from './db'
import { COOKIE_DISPOSITIVO, resolverTallerDelDispositivo } from './dispositivo'

export async function tallerDelDispositivo(): Promise<string | null> {
  const jar = await cookies()
  return resolverTallerDelDispositivo({ cookie: jar.get(COOKIE_DISPOSITIVO)?.value, porCodigo: tallerPorCodigoBd })
}
