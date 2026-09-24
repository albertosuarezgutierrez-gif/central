import { cookies } from 'next/headers'
import { COOKIE_NAME, verifySessionToken } from './lib/auth'
import { registrarResolutorActor } from './lib/puerto-actor'

registrarResolutorActor(async () => {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  if (!token) return null
  // Solo la firma, sin BD: la ruta que llama ya exigió sesión válida; aquí basta saber de quién es.
  return (await verifySessionToken(token))?.cuentaId ?? null
})
