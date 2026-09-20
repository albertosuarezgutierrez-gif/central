// Escrituras de sesiones por dispositivo en `cuentas.session_jtis`. La lógica pura (recorte,
// dedupe) vive en `./sesiones.ts`, sin Prisma, para que `node --test` la cubra; aquí se repite en
// SQL en UN solo UPDATE a propósito: un read-modify-write dejaba que dos logins casi simultáneos
// (PC + móvil, o un reintento) se pisaran el jti, y el dispositivo pisado volvía a /login — justo
// el síntoma que esto arregla. Expresión probada contra la BD el 19/09/2026.
import { Prisma } from '@prisma/client'
import { prisma } from './db'
import { MAX_SESIONES } from './sesiones'

export async function registrarSesion(cuentaId: string, jti: string): Promise<void> {
  // array_remove + append = dedupe con el nuevo al final; el slice se queda con los MAX últimos.
  await prisma.$executeRaw(Prisma.sql`
    UPDATE public.cuentas
       SET session_jtis = (array_remove(session_jtis, ${jti}) || ARRAY[${jti}]::text[])
                          [GREATEST(1, cardinality(array_remove(session_jtis, ${jti})) + 2 - ${MAX_SESIONES}):]
     WHERE id = ${cuentaId}::uuid`)
}

/** Best-effort: el logout limpia la cookie aunque esto falle. */
export async function revocarSesion(cuentaId: string, jti: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE public.cuentas SET session_jtis = array_remove(session_jtis, ${jti}) WHERE id = ${cuentaId}::uuid`)
}
