import { cookies } from 'next/headers'
import { COOKIE_NAME, leerCookie, type SesionTaller } from './sesion-cookie'

export async function getSession(): Promise<SesionTaller | null> {
  const jar = await cookies()
  return leerCookie(jar.get(COOKIE_NAME)?.value, new Date())
}
