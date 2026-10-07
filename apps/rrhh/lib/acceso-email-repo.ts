// Adaptador Prisma (SQL crudo, schema `rrhh`) de los puertos de `acceso-email.ts`.
// Tablas: `rrhh.acceso_otps` y `rrhh.empleados.sesion_version` (migración 0021_acceso_email.sql).
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getTransporter, MAIL_FROM } from '@/lib/mailer'
import { correoCodigo, type Candidato, type EnviarCodigo, type OtpFila, type RepoAcceso } from '@/lib/acceso-email'

export const repoAcceso: RepoAcceso = {
  async contarRecientesPorEmail(emailHash, desde) {
    const r = await prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
      SELECT count(*) AS n FROM rrhh.acceso_otps WHERE email_hash = ${emailHash} AND creada_at >= ${desde.toISOString()}::timestamptz`)
    return Number(r[0]?.n ?? 0)
  },
  async contarRecientesPorIp(ip, desde) {
    const r = await prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
      SELECT count(*) AS n FROM rrhh.acceso_otps WHERE ip = ${ip} AND creada_at >= ${desde.toISOString()}::timestamptz`)
    return Number(r[0]?.n ?? 0)
  },
  async crearOtp(f) {
    // Limpieza oportunista: lo de hace más de un día ya no cuenta para nada (ni topes ni canje).
    await prisma.$executeRaw(Prisma.sql`DELETE FROM rrhh.acceso_otps WHERE creada_at < now() - interval '1 day'`)
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO rrhh.acceso_otps (email_hash, codigo_hash, ip) VALUES (${f.email_hash}, ${f.codigo_hash}, ${f.ip})`)
  },
  async ultimoOtp(emailHash) {
    const r = await prisma.$queryRaw<OtpFila[]>(Prisma.sql`
      SELECT id::text AS id, codigo_hash, creada_at, intentos, usado_at FROM rrhh.acceso_otps
      WHERE email_hash = ${emailHash} ORDER BY creada_at DESC LIMIT 1`)
    return r[0] ?? null
  },
  async reservarIntento(otpId, max) {
    const n = await prisma.$executeRaw(Prisma.sql`
      UPDATE rrhh.acceso_otps SET intentos = intentos + 1
      WHERE id = ${otpId}::uuid AND usado_at IS NULL AND intentos < ${max}`)
    return n === 1
  },
  async gastarOtp(otpId) {
    const n = await prisma.$executeRaw(Prisma.sql`
      UPDATE rrhh.acceso_otps SET usado_at = now() WHERE id = ${otpId}::uuid AND usado_at IS NULL`)
    return n === 1
  },
  async reservarIntentoPin(otpId, max) {
    const n = await prisma.$executeRaw(Prisma.sql`
      UPDATE rrhh.acceso_otps SET intentos_pin = intentos_pin + 1
      WHERE id = ${otpId}::uuid AND usado_at IS NOT NULL AND intentos_pin < ${max}`)
    return n === 1
  },
  async candidatosPorEmail(email) {
    return prisma.$queryRaw<Candidato[]>(Prisma.sql`
      SELECT e.id::text AS empleado_id, e.empresa_id::text AS empresa_id, COALESCE(emp.nombre, '') AS empresa_nombre,
             e.nombre, e.pin_hash, e.sesion_version
      FROM rrhh.empleados e JOIN rrhh.empresas emp ON emp.id = e.empresa_id
      WHERE lower(trim(e.email)) = ${email} AND e.estado = 'activo'
      ORDER BY emp.nombre, e.id`)
  },
}

/** Envío real (remitente de rrhh, `MAIL_FROM`). `false` si no hay transporte o falla: no se dice al usuario. */
export const enviarCodigoAcceso: EnviarCodigo = async (c) => {
  const t = getTransporter()
  if (!t) { console.warn('[acceso-email] sin transporte de correo: código no enviado'); return false }
  try {
    const { subject, text } = correoCodigo(c)
    await t.sendMail({ from: MAIL_FROM, to: c.to, subject, text })
    return true
  } catch (e) {
    console.error('[acceso-email] fallo al enviar el código', e instanceof Error ? e.message : e)
    return false
  }
}
