// Adaptador Prisma de `acceso-responsable.ts`. Los códigos van a la MISMA tabla que los del empleado
// (`rrhh.acceso_otps`, puertos de `repoAcceso`); los separa el propósito en el hash, no la tabla.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getTransporter, MAIL_FROM } from '@/lib/mailer'
import { repoAcceso } from '@/lib/acceso-email-repo'
import { correoCodigoResponsable, remitente, type EnviarCodigoResponsable, type RepoResponsable } from '@/lib/acceso-responsable'

export const repoResponsable: RepoResponsable = {
  contarRecientesPorEmail: repoAcceso.contarRecientesPorEmail,
  contarRecientesPorIp: repoAcceso.contarRecientesPorIp,
  crearOtp: repoAcceso.crearOtp,
  ultimoOtp: repoAcceso.ultimoOtp,
  reservarIntento: repoAcceso.reservarIntento,
  gastarOtp: repoAcceso.gastarOtp,
  async responsablePorEmail(email) {
    // Determinista (ORDER BY): si hubiera duplicados por mayúsculas/espacios, siempre la MISMA fila, la más antigua
    // (la misma que mira la contraseña en `acceso-password-repo.ts`).
    const u = (await prisma.$queryRaw<{ id: string; nombre: string }[]>(Prisma.sql`
      SELECT id::text AS id, nombre FROM rrhh.usuarios_rrhh
      WHERE lower(trim(email)) = ${email} ORDER BY creada_at ASC, id ASC LIMIT 1`))[0]
    if (!u) return null
    return { usuario_id: u.id, nombre: u.nombre, empresas: await empresasAutorizadas(u.id) }
  },
}

/**
 * Empresas en las que puede entrar: SOLO las de `rrhh.usuario_empresas` (la misma fuente que revalida `getSesion` en cada
 * petición). Ya no hay respaldo a `usuarios_rrhh.empresa_id`: con él, retirar la última empresa de `usuario_empresas`
 * no cortaba el acceso. El alta (`/api/operador/empresas`) inserta la fila de `usuario_empresas`.
 */
export async function empresasAutorizadas(usuarioId: string): Promise<{ id: string; nombre: string }[]> {
  return prisma.$queryRaw<{ id: string; nombre: string }[]>(Prisma.sql`
    SELECT e.id::text AS id, e.nombre FROM rrhh.empresas e
    JOIN rrhh.usuario_empresas ue ON ue.empresa_id = e.id
    WHERE ue.usuario_id = ${usuarioId}::uuid ORDER BY e.nombre ASC, e.id ASC`)
}

/** Envío real. `false` si no hay transporte o falla (al que pide no se le dice: anti-enumeración). */
export const enviarCodigoResponsable: EnviarCodigoResponsable = async (c) => {
  const t = getTransporter()
  if (!t) { console.warn('[acceso-responsable] sin transporte de correo: código no enviado'); return false }
  try {
    const { subject, text, html } = correoCodigoResponsable(c)
    await t.sendMail({ from: remitente(MAIL_FROM, c.marcaAsegura), to: c.to, subject, text, html })
    return true
  } catch (e) {
    console.error('[acceso-responsable] fallo al enviar el código', e instanceof Error ? e.message : e)
    return false
  }
}
