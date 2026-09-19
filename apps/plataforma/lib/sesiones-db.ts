// Escrituras de sesiones por dispositivo en `cuentas.session_jtis`. La lógica pura (recorte,
// dedupe) vive en `./sesiones.ts`, sin Prisma, para que `node --test` la cubra.
import { prisma } from './db'
import { anadirJti, quitarJti } from './sesiones'

export async function registrarSesion(cuentaId: string, jti: string): Promise<void> {
  const c = await prisma.cuenta.findUnique({ where: { id: cuentaId }, select: { sessionJtis: true } })
  await prisma.cuenta.update({
    where: { id: cuentaId },
    data: { sessionJtis: anadirJti(c?.sessionJtis ?? [], jti) },
  })
}

/** Best-effort: el logout limpia la cookie aunque esto falle. */
export async function revocarSesion(cuentaId: string, jti: string): Promise<void> {
  const c = await prisma.cuenta.findUnique({ where: { id: cuentaId }, select: { sessionJtis: true } })
  if (!c) return
  await prisma.cuenta.update({ where: { id: cuentaId }, data: { sessionJtis: quitarJti(c.sessionJtis, jti) } })
}
