import nodemailer from 'nodemailer'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

const MAIL_FROM = process.env.MAIL_FROM || 'rrhh@central.local'

/** Transporter SMTP best-effort. Devuelve null si no hay credenciales configuradas. */
function getTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env
  if (!SMTP_USER || !SMTP_PASSWORD) return null
  return nodemailer.createTransport({
    host: SMTP_HOST || 'smtp.ionos.es',
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT || 587) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  })
}

/** Emails de los responsables de RR.HH. de una empresa. */
async function responsables(empresaId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT email FROM rrhh.usuarios_rrhh WHERE empresa_id = ${empresaId}::uuid`)
  return rows.map(r => r.email).filter(Boolean)
}

/**
 * Avisa por email a los responsables de RR.HH. Best-effort y NO bloqueante:
 * si no hay SMTP configurado o falla, no lanza. Listo para funcionar en cuanto
 * se carguen las env de correo (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD).
 */
export async function avisarResponsables(empresaId: string, asunto: string, texto: string): Promise<void> {
  try {
    const t = getTransporter()
    if (!t) return // sin credenciales → no-op silencioso
    const to = await responsables(empresaId)
    if (!to.length) return
    await t.sendMail({ from: MAIL_FROM, to, subject: asunto, text: texto })
  } catch (e: any) {
    console.error('avisarResponsables', e?.message)
  }
}

/** Nombre del empleado (para componer los avisos). */
export async function nombreEmpleado(empleadoId: string): Promise<string> {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT nombre FROM rrhh.empleados WHERE id = ${empleadoId}::uuid LIMIT 1`)
  return rows[0]?.nombre ?? 'Un empleado'
}
