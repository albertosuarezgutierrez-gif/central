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
  /**
   * Buzón del que salieron los UIDs. 🚨 Los UID de IMAP son POR BUZÓN: etiquetar
   * después con el buzón equivocado no da error, simplemente no encuentra el
   * mensaje y la etiqueta no se pone (silencio). Quien vaya a marcar un correo
   * tiene que decir de qué buzón lo sacó.
   */
  buzon: string
}

/** Cola de «llegó, pero no se pudo leer». La lee el Paso 0 de la skill `facturas-correo`. */
export const ETIQUETA_PDF_PENDIENTE = 'Facturas/PDF-pendiente'

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
  let buzonUsado = 'INBOX'
  await client.connect()
  try {
    if (opts.etiqueta) {
      try {
        const boxes = await client.list()
        const match = boxes.find((b) => b.path === opts.etiqueta || b.name === opts.etiqueta)
        if (match) buzonUsado = match.path
      } catch { /* usa INBOX */ }
    }
    const lock = await client.getMailboxLock(buzonUsado)
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
  return { correos: out, truncado, buzon: buzonUsado }
}

/** Variante sin presupuesto (compatibilidad con los llamadores que no lo acotan). */
export async function listarCandidatos(opts: { desde: Date; etiqueta?: string }): Promise<CorreoCandidato[]> {
  return (await listarCandidatosConLimite(opts)).correos
}

// Marca un correo como procesado: keyword IMAP + copia a la etiqueta si existe.
// `buzon` es el que devolvió el listado: si el candidato salió de `Facturas/Proveedor`,
// su UID NO existe en INBOX y el marcado se perdía sin decir nada.
export async function marcarProcesado(
  uid: number,
  etiqueta = 'Facturas/Procesada',
  buzon = 'INBOX',
): Promise<void> {
  const client = nuevoCliente()
  await client.connect()
  try {
    const lock = await client.getMailboxLock(buzon)
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

/**
 * Deja el correo en la cola de «llegó una factura y NO se pudo leer».
 *
 * 🚨 Deliberadamente NO pone `\Seen` ni `$Procesada` (a diferencia de
 * `marcarProcesado`): un hilo con `Facturas/PDF-pendiente` marcado además como
 * procesado quedaría fuera de la query base de la skill y no se reprocesaría
 * jamás. Aquí solo se encola para que alguien lo lea a mano.
 */
export async function etiquetarPendiente(
  uid: number,
  buzon = 'INBOX',
  etiqueta = ETIQUETA_PDF_PENDIENTE,
): Promise<void> {
  const client = nuevoCliente()
  await client.connect()
  try {
    const lock = await client.getMailboxLock(buzon)
    try {
      try {
        await client.messageCopy({ uid: String(uid) }, etiqueta, { uid: true })
      } catch {
        // La etiqueta puede no existir todavía. Se crea y se reintenta UNA vez:
        // si tampoco, se pierde el encolado pero el contador `noLeidas` lo cuenta.
        await client.mailboxCreate(etiqueta).catch(() => {})
        await client.messageCopy({ uid: String(uid) }, etiqueta, { uid: true }).catch(() => {})
      }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
}
