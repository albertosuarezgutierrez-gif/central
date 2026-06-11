// F0.7 · Notificaciones de comunicación (best-effort, no bloqueante).
// Resuelve los destinatarios de una conversación a sus emails (vía el directorio de
// cada vertical / grupos dinámicos) y avisa por email usando la API HTTP de Resend
// (sin dependencias nuevas). Si no hay RESEND_API_KEY, no hace nada (degrada limpio).
// Push queda pendiente: requiere un store de suscripciones a nivel de plataforma.
import { prisma } from './db'
import { getAdapter } from './adapters'
import { resolverGrupo, type NodoDescriptor } from './comunicacion'

/** Recolecta los emails de los destinatarios (sin duplicados). El nodo 'cuenta'
 *  (el propio dueño) se omite: es el remitente. */
export async function recopilarEmails(cuentaId: string, destinatarios: NodoDescriptor[]): Promise<string[]> {
  const emails = new Set<string>()
  for (const d of destinatarios) {
    try {
      if (d.tipo === 'grupo') {
        const personas = await resolverGrupo(cuentaId, d.grupoId)
        personas.forEach(p => { if (p.email) emails.add(p.email) })
      } else if (d.tipo === 'negocio' || d.tipo === 'persona') {
        const neg = await prisma.negocio.findFirst({ where: { id: d.negocioId } })
        if (!neg?.app || !neg.refExt) continue
        const adapter = getAdapter(neg.app)
        if (!adapter?.listarDirectorio) continue
        const dir = await adapter.listarDirectorio(neg.refExt)
        if (d.tipo === 'negocio') dir.forEach(p => { if (p.email) emails.add(p.email) })
        else { const p = dir.find(x => x.refPersona === d.refPersona); if (p?.email) emails.add(p.email) }
      }
    } catch { /* best-effort: un destinatario que falla no rompe el resto */ }
  }
  return [...emails]
}

/** Envía un aviso por email a cada destinatario (Resend HTTP). No-op sin API key. */
export async function enviarAvisoEmail(emails: string[], asunto: string, cuerpo: string): Promise<void> {
  const key = process.env.RESEND_API_KEY
  const from = process.env.MAIL_FROM || 'hola@ialimp.es'
  if (!key || emails.length === 0) return
  const texto = `${cuerpo}\n\n— Tienes un mensaje en el panel de la casa de marcas.`
  await Promise.allSettled(emails.map(to =>
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject: asunto, text: texto }),
    }).catch(() => undefined),
  ))
}

/** Orquestador: resuelve emails y avisa. Best-effort; nunca lanza. */
export async function notificarConversacion(cuentaId: string, destinatarios: NodoDescriptor[], asunto: string, cuerpo: string): Promise<void> {
  try {
    const emails = await recopilarEmails(cuentaId, destinatarios)
    await enviarAvisoEmail(emails, asunto, cuerpo)
  } catch { /* nunca rompe la creación de la conversación */ }
}
