// Lectura de Gmail por IMAP para el agente de facturas.
// Credenciales: GMAIL_USER / GMAIL_APP_PASSWORD (app password, soporta IMAP).
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'

const INVOICE_KEYWORDS = /factura|recibo|adeudo|invoice|cargo|domiciliaci[oó]n|suministro|cuota/i
const ATTACH_OK = /(application\/pdf|image\/)/i

export interface Adjunto {
  nombre: string
  mime: string
  buffer: Buffer
}

export interface CorreoCandidato {
  uid: number
  from: string
  subject: string
  fecha: string // YYYY-MM-DD
  adjuntos: Adjunto[]
  sinAdjunto: boolean // parece factura pero sin adjunto válido
}

function nuevoCliente(): ImapFlow {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) throw new Error('Faltan GMAIL_USER / GMAIL_APP_PASSWORD')
  return new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user, pass }, logger: false })
}

// Lista correos candidatos a factura desde `desde` (Date). Si `etiqueta` existe
// como buzón en Gmail, se usa esa; si no, INBOX.
export async function listarCandidatos(opts: { desde: Date; etiqueta?: string }): Promise<CorreoCandidato[]> {
  const client = nuevoCliente()
  const out: CorreoCandidato[] = []
  await client.connect()
  try {
    let buzon = 'INBOX'
    if (opts.etiqueta) {
      try {
        const boxes = await client.list()
        const match = boxes.find((b) => b.path === opts.etiqueta || b.name === opts.etiqueta)
        if (match) buzon = match.path
      } catch { /* usa INBOX */ }
    }
    const lock = await client.getMailboxLock(buzon)
    try {
      for await (const msg of client.fetch({ since: opts.desde }, { uid: true, source: true })) {
        const parsed = await simpleParser(msg.source as Buffer)
        const adjuntos: Adjunto[] = (parsed.attachments || [])
          .filter((a) => ATTACH_OK.test(a.contentType || ''))
          .map((a) => ({ nombre: a.filename || 'adjunto', mime: a.contentType || 'application/octet-stream', buffer: a.content as Buffer }))
        const asunto = parsed.subject || ''
        const cuerpo = `${asunto} ${parsed.text || ''}`
        const pareceFactura = INVOICE_KEYWORDS.test(cuerpo)
        if (adjuntos.length === 0 && !pareceFactura) continue
        out.push({
          uid: msg.uid,
          from: parsed.from?.text || '',
          subject: asunto,
          fecha: (parsed.date || new Date()).toISOString().slice(0, 10),
          adjuntos,
          sinAdjunto: adjuntos.length === 0 && pareceFactura,
        })
      }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
  return out
}

// Marca un correo como procesado: keyword IMAP + copia a la etiqueta si existe.
export async function marcarProcesado(uid: number, etiqueta = 'Facturas/Procesada'): Promise<void> {
  const client = nuevoCliente()
  await client.connect()
  try {
    const lock = await client.getMailboxLock('INBOX')
    try {
      await client.messageFlagsAdd({ uid: String(uid) }, ['\\Seen', '$Procesada'], { uid: true }).catch(() => {})
      await client.messageCopy({ uid: String(uid) }, etiqueta, { uid: true }).catch(() => {})
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
}
