import { cookies } from 'next/headers'
import { COOKIE_ACCESO_WHATSAPP, COOKIE_NAME, verificarAccesoWhatsapp, verificarSesion, type AccesoWhatsapp } from './auth'
import { prisma } from './db'

export async function getIdentidad() {
  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  if (!token) return null
  const payload = await verificarSesion(token)
  if (!payload) return null
  const identidad = await prisma.portalIdentidad.findUnique({
    where: { id: payload.identidadId },
    select: { id: true, nombre: true },
  })
  if (!identidad) return null
  // `corredor` ≠ null = es Alberto mirando el portal como lo ve un cliente
  // (`lib/vista-corredor.ts`). Las lecturas no lo miran —la bóveda sale del
  // vínculo temporal—; lo miran la banda de aviso y el veto a escribir.
  return { ...identidad, corredor: payload.corredor }
}

export async function requireIdentidad() {
  const i = await getIdentidad()
  if (!i) throw new Error('Sin sesión de portal')
  return i
}

/**
 * La cookie de acceso por el CÓDIGO DEL WHATSAPP (07/10/2026), o `null`. NO es una identidad: solo
 * dice «abrió el presupuesto X con su código». Quien la use tiene que comprobar que el id es el que
 * pide y que el token sigue siendo el del presupuesto (`accesoWhatsappDe` de `lib/presupuesto.ts`).
 */
export async function getAccesoWhatsapp(): Promise<AccesoWhatsapp | null> {
  const jar = await cookies()
  const valor = jar.get(COOKIE_ACCESO_WHATSAPP)?.value
  if (!valor) return null
  return verificarAccesoWhatsapp(valor)
}
