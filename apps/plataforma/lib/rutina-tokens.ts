// Tokens de RUTINA validados contra BD (tabla `rutina_tokens`) — vía alternativa a la env
// `ALERTA_TOKEN` de Vercel. Ver la cabecera de `prisma/sql/2026-07-27_rutina_tokens.sql` para el
// porqué; en corto: la env está duplicada a mano en Vercel + en el entorno de cada rutina, deriva, y
// una sesión de Claude no puede repararla (el conector de Vercel no escribe envs). En BD sí se puede
// rotar sin redeploy y sin entrar a Vercel, igual que `empresas_acceso_token`/`trading_acceso_token`.
//
// 🔒 ALCANCE: un token de esta tabla abre ÚNICAMENTE `/api/internal/alerta` (mandar un Telegram).
// NO abre `/api/trading/*` ni el pricing. Si vas a usar `rutinaDeToken` en otro endpoint, para y
// piénsalo: el guardián `test/regression-rutina-tokens.test.ts` lo impide en CI a propósito.
//
// Corre en runtime Node (route handlers), NUNCA en el middleware edge (que no tiene Prisma). Por eso
// las rutas que dependan de este camino tienen que estar en `PUBLIC` del middleware y revalidar en su
// handler — como ya hace `/api/internal/alerta`.
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/db'

/** SHA-256 hex del token. Lo que se guarda en BD; el valor en claro nunca se persiste. */
export function hashRutinaToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/**
 * Devuelve el nombre de la rutina dueña del token, o null si no vale.
 * Nunca lanza: un fallo de BD degrada a "no autorizado", no a 500 (y el caller ya tiene otras vías).
 */
export async function rutinaDeToken(bearer: string | null | undefined): Promise<string | null> {
  // Piso de longitud: no vamos a la BD por cada cabecera basura de internet. Los tokens que emitimos
  // son de 43+ chars (32 bytes en base64url).
  if (!bearer || bearer.length < 24) return null
  const hash = hashRutinaToken(bearer)
  try {
    const filas = await prisma.$queryRaw<{ rutina: string }[]>`
      SELECT rutina FROM rutina_tokens WHERE token_sha256 = ${hash} AND activo IS TRUE LIMIT 1`
    const rutina = filas[0]?.rutina ?? null
    if (!rutina) return null
    // Telemetría best-effort: deja rastro de que ESA rutina sí llegó a avisar. Se espera a propósito
    // (en serverless una promesa suelta puede morir con la función), pero no puede tumbar el aviso.
    try {
      await prisma.$executeRaw`
        UPDATE rutina_tokens SET ultimo_uso_en = now() WHERE token_sha256 = ${hash}`
    } catch { /* la telemetría nunca bloquea el aviso */ }
    return rutina
  } catch {
    return null
  }
}
