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
    const u = (await prisma.$queryRaw<{ id: string; nombre: string; empresa_id: string }[]>(Prisma.sql`
      SELECT id::text AS id, nombre, empresa_id::text AS empresa_id FROM rrhh.usuarios_rrhh
      WHERE lower(trim(email)) = ${email} LIMIT 1`))[0]
    if (!u) return null
    // Igual que el login anterior: las de usuario_empresas; si no hay ninguna, la empresa del alta.
    let empresas = await prisma.$queryRaw<{ id: string; nombre: string }[]>(Prisma.sql`
      SELECT e.id::text AS id, e.nombre FROM rrhh.empresas e
      JOIN rrhh.usuario_empresas ue ON ue.empresa_id = e.id
      WHERE ue.usuario_id = ${u.id}::uuid ORDER BY e.nombre ASC`)
    if (empresas.length === 0) {
      empresas = await prisma.$queryRaw<{ id: string; nombre: string }[]>(Prisma.sql`
        SELECT id::text AS id, nombre FROM rrhh.empresas WHERE id = ${u.empresa_id}::uuid`)
    }
    return { usuario_id: u.id, nombre: u.nombre, empresas }
  },
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
