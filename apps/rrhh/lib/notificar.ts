import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getTransporter, MAIL_FROM } from '@/lib/mailer'

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

/** Avisa al empleado por email cuando su solicitud es resuelta. Best-effort, silencioso si falla. */
export async function avisarEmpleado(email: string | null, tipo: string, estado: 'aprobada' | 'rechazada'): Promise<void> {
  if (!email) return
  try {
    const t = getTransporter()
    if (!t) return
    const estadoTexto = estado === 'aprobada' ? 'aprobada ✅' : 'rechazada ❌'
    const tipoTexto = tipo.replace(/_/g, ' ')
    await t.sendMail({
      from: MAIL_FROM,
      to: email,
      subject: `Tu solicitud de ${tipoTexto} ha sido ${estadoTexto}`,
      text: `Tu solicitud de ${tipoTexto} ha sido ${estadoTexto}.\n\nPuedes ver el estado de todas tus solicitudes en el portal del empleado.`,
    })
  } catch (e: any) {
    console.error('avisarEmpleado', e?.message)
  }
}

/** Nombre del empleado (para componer los avisos). */
export async function nombreEmpleado(empleadoId: string): Promise<string> {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT nombre FROM rrhh.empleados WHERE id = ${empleadoId}::uuid LIMIT 1`)
  return rows[0]?.nombre ?? 'Un empleado'
}
