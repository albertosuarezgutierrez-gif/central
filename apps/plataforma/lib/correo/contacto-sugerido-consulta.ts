// La mitad con BD de la sugerencia de contacto (20/09/2026): «¿es la primera
// vez que veo escribir a esta dirección en un correo de correduría?».
// Impuro (Prisma) — vive aparte de `contacto-sugerido.ts`, que es puro.
import { prisma } from '@/lib/db'

/**
 * `true` = no hay NINGUNA fila previa de este remitente clasificada
 * `correduria`/`correduria-recibo` (la fila actual, todavía en 'pendiente' en
 * el momento en que se llama, no cuenta — por eso no hay que excluir su id a
 * mano). `false` = ya se vio antes, o no se pudo consultar: en la duda, NO se
 * repite el aviso — sugerir dos veces la misma persona sería más ruido que
 * ayuda, y la primera sugerencia ya quedó dicha.
 */
export async function esPrimerCorreoDeCorreduria(remitente: string): Promise<boolean> {
  try {
    const filas = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM correo_triaje
      WHERE remitente = ${remitente} AND categoria IN ('correduria', 'correduria-recibo')
    `
    return Number(filas[0]?.n ?? 1) === 0
  } catch {
    return false
  }
}
