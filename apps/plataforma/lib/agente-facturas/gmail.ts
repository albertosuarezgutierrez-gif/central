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
  /**
   * `true` = imagen incrustada en el HTML del correo (`<img src="cid:…">`), no un
   * documento que el remitente quisiera adjuntar. Son los logos, banners y iconos
   * de redes de los correos maquetados.
   */
  inline: boolean
}

export interface CorreoCandidato {
  uid: number
  from: string
  subject: string
  fecha: string // YYYY-MM-DD
  adjuntos: Adjunto[]
  sinAdjunto: boolean // parece factura pero sin adjunto válido
  /**
   * Cabecera `Message-ID`. Es la ÚNICA identidad del correo que vale entre buzones:
   * los UID de IMAP son por buzón, así que para quitar una etiqueta hay que volver a
   * localizarlo dentro del buzón de esa etiqueta. `null` si el correo no la trae.
   */
  messageId: string | null
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
   * Buzón del que salieron estos UID. 🚨 Los UID de IMAP son **por buzón**: marcar o
   * etiquetar un mensaje contra un buzón distinto del que lo listó no encuentra nada
   * y **no lanza error** — la operación se pierde en silencio. Quien vaya a tocar
   * estos correos después tiene que decir de dónde salieron.
   */
  buzon: string
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
  let buzon = 'INBOX'
  await client.connect()
  try {
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
        // `related` de mailparser = la parte va referenciada por `cid:` desde el HTML
        // (logos, banners, iconos). Se conservan —una foto pegada en el cuerpo puede
        // ser un ticket— pero marcadas, para que no compitan con el PDF de la factura.
        const adjuntos: Adjunto[] = (parsed.attachments || [])
          .filter((a) => ATTACH_OK.test(a.contentType || ''))
          .map((a) => ({
            nombre: a.filename || 'adjunto',
            mime: a.contentType || 'application/octet-stream',
            buffer: a.content as Buffer,
            inline: a.related === true || (a.contentDisposition === 'inline' && !!a.cid),
          }))
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
          messageId: parsed.messageId || null,
        })
      }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
  return { correos: out, truncado, buzon }
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
 * Best-effort: si la etiqueta no existe o IMAP falla, no rompe la pasada — pero
 * **devuelve `false`**, y quien llame NO puede decir que lo encoló.
 *
 * 🚨 Por qué devuelve booleano (03/08/2026): la etiqueta de destino tiene que
 * existir en Gmail; `messageCopy` contra un buzón inexistente falla, y con el
 * `catch` mudo que había aquí el fallo desaparecía. Ese día el parte del latido
 * dijo «10 correos … etiquetados en Gmail para reintentar» cuando la etiqueta
 * `Facturas/Extraccion-fallida` **no se había creado todavía**: cero encolados y
 * una promesa falsa en el sitio exacto donde se estaba arreglando otra.
 *
 * `buzon` DEBE ser el que devolvió el listado (`ListadoCandidatos.buzon`): los UID
 * son por buzón, así que con el buzón equivocado esta llamada no encuentra el
 * mensaje y la cola se queda vacía sin que nada falle.
 */
/**
 * Quita una etiqueta a los correos indicados por `Message-ID`, en UNA sola sesión.
 *
 * 🚨 Por qué hace falta (05/08/2026): la cola `Facturas/Extraccion-fallida` solo
 * crecía. Un correo que un día no se pudo leer y al siguiente SÍ se leyó seguía
 * etiquetado como «extracción fallida» para siempre, así que la cola acababa
 * afirmando lo contrario de la verdad — la misma clase de mentira que el agente
 * vino a quitar, pero al revés.
 *
 * En Gmail-sobre-IMAP «quitar etiqueta» = borrar el mensaje DEL BUZÓN de la
 * etiqueta (no va a la Papelera: el mensaje sigue en Todos y en INBOX). Y como los
 * UID son por buzón, hay que volver a buscarlo ahí por `Message-ID`.
 *
 * Best-effort: devuelve cuántos quitó y nunca lanza.
 */
export async function quitarEtiqueta(messageIds: string[], etiqueta: string): Promise<number> {
  const ids = messageIds.filter(Boolean)
  if (ids.length === 0) return 0
  let quitados = 0
  let client: ImapFlow | null = null
  try {
    client = nuevoCliente()
    await client.connect()
    const boxes = await client.list()
    const match = boxes.find((b) => b.path === etiqueta || b.name === etiqueta)
    if (!match) return 0 // la etiqueta no existe: nada que quitar
    const lock = await client.getMailboxLock(match.path)
    try {
      for (const messageId of ids) {
        try {
          const encontrados = await client.search({ header: { 'message-id': messageId } }, { uid: true })
          if (!encontrados || encontrados.length === 0) continue
          await client.messageDelete(encontrados, { uid: true })
          quitados++
        } catch (e) {
          console.warn(`[facturas] no se pudo quitar "${etiqueta}" de ${messageId}:`, String(e).slice(0, 120))
        }
      }
    } finally {
      lock.release()
    }
  } catch (e) {
    console.warn('[facturas] limpieza de etiqueta no disponible:', String(e).slice(0, 140))
  } finally {
    await client?.logout().catch(() => {})
  }
  return quitados
}

export async function etiquetarCorreo(uid: number, etiqueta: string, buzon = 'INBOX'): Promise<boolean> {
  const client = nuevoCliente()
  await client.connect()
  try {
    const lock = await client.getMailboxLock(buzon)
    try {
      await client.messageCopy({ uid: String(uid) }, etiqueta, { uid: true })
      return true
    } catch (e) {
      console.warn(`[facturas] no se pudo etiquetar uid ${uid} en "${etiqueta}":`, String(e).slice(0, 140))
      return false
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
}

// Marca un correo como procesado: keyword IMAP + copia a la etiqueta si existe.
// `buzon` = el que devolvió el listado (ver `etiquetarCorreo`): con el buzón
// equivocado ni el flag ni la copia encuentran el mensaje, y ninguna de las dos
// operaciones lanza — el correo se reprocesaría cada día en silencio.
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
