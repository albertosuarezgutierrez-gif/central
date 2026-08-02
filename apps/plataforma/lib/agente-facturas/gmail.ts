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

export interface ListadoCandidatos {
  correos: CorreoCandidato[]
  /** `true` = el listado se cortó por presupuesto de tiempo: NO se ha visto el buzón entero. */
  truncado: boolean
}

// Lista correos candidatos a factura desde `desde` (Date). Si `etiqueta` existe
// como buzón en Gmail, se usa esa; si no, INBOX.
//
// 🚨 `deadline` (epoch ms) acota el listado: bajar y parsear el `source` completo de
// cada mensaje de la ventana es la parte cara, y sin tope se come el `maxDuration`
// de la función entera — la pasada muere en 504 y NO llega a escribir su latido
// (incidente 31/07/2026, ver `app/api/cron/facturas-scan/route.ts`). Al cortar se
// devuelve `truncado: true`: quien llame NO puede decir «he mirado el buzón».
export async function listarCandidatosConLimite(
  opts: { desde: Date; etiqueta?: string; deadline?: number },
): Promise<ListadoCandidatos> {
  const client = nuevoCliente()
  const out: CorreoCandidato[] = []
  let truncado = false
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
        if (opts.deadline && Date.now() > opts.deadline) { truncado = true; break }
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
  return { correos: out, truncado }
}

/** Variante sin presupuesto (compatibilidad con los llamadores que no lo acotan). */
export async function listarCandidatos(opts: { desde: Date; etiqueta?: string }): Promise<CorreoCandidato[]> {
  return (await listarCandidatosConLimite(opts)).correos
}

/**
 * Copia el correo a una etiqueta de Gmail SIN marcarlo como visto ni procesado.
 * Se usa para encolar lo que no se pudo leer: la etiqueta sobrevive a la sesión y
 * al contenedor, así que un fallo de extracción deja rastro consultable en el buzón
 * en vez de evaporarse (el mismo patrón que `Facturas/PDF-pendiente` de la skill).
 * Best-effort: si la etiqueta no existe o IMAP falla, no rompe la pasada.
 */
export async function etiquetarCorreo(uid: number, etiqueta: string): Promise<void> {
  const client = nuevoCliente()
  await client.connect()
  try {
    const lock = await client.getMailboxLock('INBOX')
    try {
      await client.messageCopy({ uid: String(uid) }, etiqueta, { uid: true }).catch(() => {})
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
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
