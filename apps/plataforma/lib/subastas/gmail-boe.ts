// ────────────────────────────────────────────────────────────────────────────
// Lector IMAP de las alertas del Portal de Subastas del BOE.
//
// Por qué NO se reutiliza `lib/correo/imap.ts`: aquel lector es incremental
// sobre INBOX y trunca el cuerpo a ~1500 caracteres para la IA del triaje. Aquí
// hace falta lo contrario — el HTML COMPLETO y buscar por remitente en todo el
// buzón, porque estas alertas llegan ya etiquetadas y archivadas (fuera de
// INBOX), así que un lector de INBOX no las vería nunca.
//
// Se abre «Todos los mensajes» por su `specialUse` \All, no por nombre: el
// nombre de esa carpeta depende del idioma de la cuenta.
// ────────────────────────────────────────────────────────────────────────────
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'

export const REMITENTE_BOE = 'no-responder@boe.es'

export interface CorreoAlerta {
  messageId: string
  subject: string
  from: string
  fecha: Date
  html: string
}

function nuevoCliente(): ImapFlow {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) throw new Error('Faltan GMAIL_USER / GMAIL_APP_PASSWORD')
  return new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user, pass }, logger: false })
}

/** Nombre de la carpeta «Todos los mensajes», resuelto por specialUse (no por idioma). */
async function buzonTodos(client: ImapFlow): Promise<string> {
  const lista = await client.list()
  const all = lista.find((m) => m.specialUse === '\\All')
  return all?.path ?? 'INBOX'
}

/**
 * Descarga las alertas del BOE de los últimos `dias`.
 *
 * @param remitente permite apuntar el lector a otro emisor de alertas
 *                  (Idealista, un servicer…) sin duplicar la conexión.
 */
export async function leerAlertas(
  dias = 7,
  max = 100,
  remitente = REMITENTE_BOE,
): Promise<CorreoAlerta[]> {
  const client = nuevoCliente()
  await client.connect()
  try {
    const carpeta = await buzonTodos(client)
    const lock = await client.getMailboxLock(carpeta)
    try {
      const desde = new Date(Date.now() - dias * 86400_000)
      const uids = (await client.search({ from: remitente, since: desde }, { uid: true })) || []
      // Los más recientes primero, acotado para no reventar el tiempo del cron.
      const seleccion = [...uids].sort((a, b) => b - a).slice(0, max)
      if (!seleccion.length) return []

      const out: CorreoAlerta[] = []
      for await (const msg of client.fetch(seleccion, { uid: true, source: true }, { uid: true })) {
        if (!msg.source) continue
        try {
          const parsed = await simpleParser(msg.source)
          out.push({
            messageId: parsed.messageId ?? `uid-${msg.uid}`,
            subject: parsed.subject ?? '',
            from: parsed.from?.text ?? '',
            fecha: parsed.date ?? new Date(),
            html: typeof parsed.html === 'string' ? parsed.html : (parsed.textAsHtml ?? ''),
          })
        } catch (e) {
          console.error('[subastas/gmail] no se pudo parsear el correo', msg.uid, e)
        }
      }
      return out
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
}
