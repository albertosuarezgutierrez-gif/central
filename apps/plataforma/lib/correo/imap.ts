// lib/correo/imap.ts — Lector IMAP incremental para el triaje de correo.
//
// Extiende el patrón de lib/agente-facturas/gmail.ts (imapflow + mailparser, credenciales
// GMAIL_USER / GMAIL_APP_PASSWORD) pero para TODO lo nuevo de INBOX, no solo facturas, y con
// capacidad de ETIQUETAR (X-GM-LABELS vía messageCopy a la carpeta-etiqueta, ya probado en
// gmail.ts) y ARCHIVAR (quitar de INBOX). Una SOLA conexión por pasada: se abre `abrirTriaje()`,
// se opera sobre la sesión y se cierra en el finally del orquestador.
//
// Nunca toca la Papelera: archivar = messageDelete desde INBOX, que en Gmail solo QUITA la
// etiqueta INBOX (el correo permanece en «Todos los mensajes»). Requiere Auto-Expunge ON (default).
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'

export interface CorreoNuevo {
  uid: number
  messageId: string        // header Message-ID (dedupe estable entre pasadas)
  from: string             // dirección del remitente en minúsculas (para reglas)
  fromRaw: string          // remitente tal cual (nombre + dirección)
  subject: string
  fecha: Date
  labels: string[]         // etiquetas Gmail que YA lleva (para el skip)
  extracto: string         // asunto + cuerpo truncado ~1500 chars (para la IA)
}

function nuevoCliente(): ImapFlow {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) throw new Error('Faltan GMAIL_USER / GMAIL_APP_PASSWORD')
  return new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user, pass }, logger: false })
}

const EXTRACTO_MAX = 1500

export interface SesionTriaje {
  uidValidity: number
  /** Correos con UID > lastUid. Si uidValidity cambió, usa búsqueda por fecha (últimos 2 días). */
  listarNuevos(lastUid: number, uidValidityPrevio: number | null, max?: number): Promise<CorreoNuevo[]>
  /** Aplica una etiqueta Gmail (la crea si no existe). */
  etiquetar(uid: number, etiqueta: string): Promise<void>
  /** Saca el correo de INBOX (queda en «Todos»). */
  archivar(uid: number): Promise<void>
  cerrar(): Promise<void>
}

export async function abrirTriaje(): Promise<SesionTriaje> {
  const client = nuevoCliente()
  await client.connect()
  const lock = await client.getMailboxLock('INBOX')
  const mbox = client.mailbox
  const uidValidity = mbox && typeof mbox !== 'boolean' ? Number(mbox.uidValidity) : 0

  return {
    uidValidity,

    async listarNuevos(lastUid, uidValidityPrevio, max = 50) {
      const reset = uidValidityPrevio != null && uidValidityPrevio !== uidValidity
      // Objeto de búsqueda IMAP: por rango de UID (incremental) o por fecha (reset/primera vez).
      const busqueda: Record<string, unknown> = reset || lastUid <= 0
        ? { since: new Date(Date.now() - 2 * 86400_000) }   // reset / primera vez → últimos 2 días
        : { uid: `${lastUid + 1}:*` }

      const out: CorreoNuevo[] = []
      for await (const msg of client.fetch(busqueda, { uid: true, labels: true, source: true })) {
        // Con `uid:'N:*'` IMAP puede devolver el propio N si no hay nada nuevo: filtrar.
        if (!reset && lastUid > 0 && msg.uid <= lastUid) continue
        const parsed = await simpleParser(msg.source as Buffer)
        const fromRaw = parsed.from?.text || ''
        const from = (parsed.from?.value?.[0]?.address || '').toLowerCase()
        const subject = parsed.subject || ''
        const cuerpo = (parsed.text || '').replace(/\s+/g, ' ').trim()
        out.push({
          uid: msg.uid,
          messageId: parsed.messageId || `no-id:${uidValidity}:${msg.uid}`,
          from,
          fromRaw,
          subject,
          fecha: parsed.date || new Date(),
          labels: Array.from((msg.labels as Set<string> | undefined) ?? []),
          extracto: `${subject}\n${cuerpo}`.slice(0, EXTRACTO_MAX),
        })
        if (out.length >= max) break
      }
      return out
    },

    async etiquetar(uid, etiqueta) {
      // messageCopy a la carpeta-etiqueta = aplicar X-GM-LABELS en Gmail (crea la etiqueta si no existe).
      await client.messageCopy({ uid: String(uid) }, etiqueta, { uid: true }).catch(() => {})
    },

    async archivar(uid) {
      // En Gmail, borrar de INBOX quita la etiqueta INBOX (el correo queda en «Todos»). No es Papelera.
      await client.messageDelete({ uid: String(uid) }, { uid: true }).catch(() => {})
    },

    async cerrar() {
      lock.release()
      await client.logout().catch(() => {})
    },
  }
}
