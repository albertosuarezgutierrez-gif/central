// Adaptador Prisma de `acceso-password.ts`. Los FALLOS de contraseña se cuentan en BD (los ven todas las instancias) y
// SIN migración: van a `rrhh.acceso_otps`, separados de los códigos así:
//   · `email_hash` = `hashEmailFalloPassword(email)` (prefijo HMAC propio): nunca casa con el de un código, luego ni
//     `contarRecientesPorEmail` ni `ultimoOtp` del código lo ven.
//   · `ip` = `pwd:<ip>`: `contarRecientesPorIp` del código busca la IP tal cual y no lo cuenta.
//   · `codigo_hash` = marcador que no es un HMAC y `usado_at` = now(): aunque alguien diera con la fila, no se canjea.
// La limpieza de > 1 día de `crearOtp` también las barre.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { hashEmailFalloPassword } from '@/lib/acceso-email'
import type { RepoPassword } from '@/lib/acceso-password'

export const PREFIJO_IP_FALLO = 'pwd:'
export const MARCA_FALLO_PASSWORD = 'fallo-password'

export const repoPassword: RepoPassword = {
  async usuarioConHash(email) {
    // Determinista: la fila más antigua (la misma que `responsablePorEmail`, con la que se abre la sesión).
    const u = (await prisma.$queryRaw<{ id: string; pass_hash: string | null }[]>(Prisma.sql`
      SELECT id::text AS id, pass_hash FROM rrhh.usuarios_rrhh WHERE lower(trim(email)) = ${email}
      ORDER BY creada_at ASC, id ASC LIMIT 1`))[0]
    return u ? { usuario_id: u.id, pass_hash: u.pass_hash } : null
  },
  async contarFallosPorEmail(email, desde) {
    const r = await prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
      SELECT count(*) AS n FROM rrhh.acceso_otps
      WHERE email_hash = ${hashEmailFalloPassword(email)} AND creada_at >= ${desde.toISOString()}::timestamptz`)
    return Number(r[0]?.n ?? 0)
  },
  async contarFallosPorIp(ip, desde) {
    const r = await prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
      SELECT count(*) AS n FROM rrhh.acceso_otps
      WHERE ip = ${PREFIJO_IP_FALLO + ip} AND codigo_hash = ${MARCA_FALLO_PASSWORD} AND creada_at >= ${desde.toISOString()}::timestamptz`)
    return Number(r[0]?.n ?? 0)
  },
  async registrarFallo({ email, ip }) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO rrhh.acceso_otps (email_hash, codigo_hash, ip, usado_at)
      VALUES (${hashEmailFalloPassword(email)}, ${MARCA_FALLO_PASSWORD}, ${PREFIJO_IP_FALLO + ip}, now())`)
  },
}
