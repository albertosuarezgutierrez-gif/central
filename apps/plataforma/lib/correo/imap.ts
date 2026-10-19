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
import { esCorreoAutomatico } from './lead-correduria.ts'
import { ADJ_PRESUPUESTO_PASADA, adjuntosDeRespuestaLead, type AdjuntoCorreo } from './lead-correduria-adjuntos.ts'

export interface CorreoNuevo {
  uid: number
  messageId: string        // header Message-ID (dedupe estable entre pasadas)
  from: string             // dirección del remitente en minúsculas (para reglas)
  fromRaw: string          // remitente tal cual (nombre + dirección)
  subject: string
  fecha: Date
  labels: string[]         // etiquetas Gmail que YA lleva (para el skip)
  extracto: string         // asunto + cuerpo truncado ~1500 chars (para la IA)
  /**
   * Cuerpo en texto CON sus saltos de línea (hasta ~20.000 chars). El `extracto` los colapsa y las
   * tablas de los correos de devolución de recibos se leen por líneas (`leerCorreoDevolucion`).
   */
  texto?: string
  /**
   * PDFs adjuntos, SOLO de los remitentes de `REMITENTES_CON_PDF` (Allianz manda sus avisos de
   * recibos devueltos y de pólizas anuladas en un PDF, no en el cuerpo). El resto no los guarda:
   * una pasada son hasta 50 correos y no se sujetan en memoria adjuntos que nadie va a leer.
   */
  pdfs?: Buffer[]
  /**
   * Direcciones a las que IBA el correo (To, Cc, Delivered-To, X-Original-To, X-Forwarded-To), en
   * minúsculas y sin repetir. Es lo que distingue un lead que escribe a hola@grupoasegura.es de
   * cualquier otro correo del mismo buzón (19/10/2026). `[]` = no se pudo leer ninguna cabecera.
   */
  destinatarios?: string[]
  /** Message-IDs de los que este correo es respuesta (In-Reply-To + References), para casar el hilo. */
  referencias?: string[]
  /** Lista, autorespuesta o envío masivo (`List-Unsubscribe`, `Auto-Submitted`, `Precedence`): nunca un lead. */
  automatico?: boolean
  /**
   * Fotos y PDF de lo que PUEDE ser la respuesta de un lead en su hilo (19/10/2026, F2): solo si es respuesta, iba a un
   * buzón de la correduría y no es automático; con topes (`lead-correduria-adjuntos.ts`). Si el hilo no casa, se
   * descartan en memoria. Nunca a la IA ni a Telegram: asegura los guarda cifrados.
   */
  adjuntosLead?: AdjuntoCorreo[]
  /** Documentos válidos que se quedaron fuera por tope (se dice en el aviso; no es «no mandó nada»). */
  adjuntosLeadOmitidos?: number
}

const RE_DIRECCION = /[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/gi
const CABECERAS_DESTINO = ['to', 'cc', 'delivered-to', 'x-original-to', 'x-forwarded-to']

/** Puro: direcciones de destino a partir de las líneas de cabecera crudas (`parsed.headerLines`). */
export function destinatariosDe(lineas: readonly { key: string; line: string }[] | undefined): string[] {
  const out = new Set<string>()
  for (const { key, line } of lineas ?? []) {
    if (!CABECERAS_DESTINO.includes(key.toLowerCase())) continue
    const valor = line.slice(line.indexOf(':') + 1)
    for (const m of valor.matchAll(RE_DIRECCION)) out.add(m[0].toLowerCase())
  }
  return [...out]
}

/** Puro: los Message-ID de In-Reply-To/References (mailparser da string o string[]). */
export function referenciasDe(inReplyTo: unknown, references: unknown): string[] {
  const todas = [inReplyTo, ...(Array.isArray(references) ? references : [references])]
  const out = new Set<string>()
  for (const v of todas) {
    if (typeof v !== 'string') continue
    for (const m of v.matchAll(/<[^<>\s]+>/g)) out.add(m[0])
  }
  return [...out]
}

/** Dominios cuyos PDFs adjuntos se conservan para leerlos (ver `CorreoNuevo.pdfs`). */
const REMITENTES_CON_PDF = ['allianz.es']
/** Direcciones EXACTAS (el dominio sería gmail.com, de todo el mundo): la factura mensual de Sique Brilla. */
const DIRECCIONES_CON_PDF = ['limpiezascruzz@gmail.com']
const PDF_MAX_BYTES = 2_000_000
const PDF_MAX_POR_CORREO = 3

function pdfsDe(from: string, adjuntos: { contentType?: string; filename?: string; content?: Buffer; size?: number }[] | undefined): Buffer[] | undefined {
  const dominio = from.split('@')[1] ?? ''
  if (!DIRECCIONES_CON_PDF.includes(from) && !REMITENTES_CON_PDF.some((d) => dominio === d || dominio.endsWith(`.${d}`))) return undefined
  const pdfs = (adjuntos ?? [])
    .filter((a) => (a.contentType === 'application/pdf' || /\.pdf$/i.test(a.filename ?? '')) && a.content && a.content.length <= PDF_MAX_BYTES)
    .slice(0, PDF_MAX_POR_CORREO)
    .map((a) => a.content as Buffer)
  return pdfs.length ? pdfs : undefined
}

function nuevoCliente(): ImapFlow {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) throw new Error('Faltan GMAIL_USER / GMAIL_APP_PASSWORD')
  return new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user, pass }, logger: false })
}

const EXTRACTO_MAX = 1500
const TEXTO_MAX = 20_000

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
      const presupuestoAdjuntos = { bytes: ADJ_PRESUPUESTO_PASADA }
      for await (const msg of client.fetch(busqueda, { uid: true, labels: true, source: true })) {
        // Con `uid:'N:*'` IMAP puede devolver el propio N si no hay nada nuevo: filtrar.
        if (!reset && lastUid > 0 && msg.uid <= lastUid) continue
        const parsed = await simpleParser(msg.source as Buffer)
        const fromRaw = parsed.from?.text || ''
        const from = (parsed.from?.value?.[0]?.address || '').toLowerCase()
        const subject = parsed.subject || ''
        const cuerpo = (parsed.text || '').replace(/\s+/g, ' ').trim()
        const destinatarios = destinatariosDe(parsed.headerLines)
        const referencias = referenciasDe(parsed.inReplyTo, parsed.references)
        const automatico = esCorreoAutomatico(parsed.headerLines)
        const adjLead = adjuntosDeRespuestaLead({ referencias, destinatarios, automatico }, parsed.attachments, presupuestoAdjuntos)
        out.push({
          uid: msg.uid,
          messageId: parsed.messageId || `no-id:${uidValidity}:${msg.uid}`,
          from,
          fromRaw,
          subject,
          fecha: parsed.date || new Date(),
          labels: Array.from((msg.labels as Set<string> | undefined) ?? []),
          extracto: `${subject}\n${cuerpo}`.slice(0, EXTRACTO_MAX),
          texto: (parsed.text || '').slice(0, TEXTO_MAX),
          pdfs: pdfsDe(from, parsed.attachments),
          destinatarios,
          referencias,
          automatico,
          ...(adjLead ? { adjuntosLead: adjLead.adjuntos, adjuntosLeadOmitidos: adjLead.omitidos } : {}),
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

// ─── El HILO completo, sin mirar etiqueta ni carpeta (19/10/2026) ────────────

/** Un correo del hilo tal como lo ve «Todos los mensajes» (sin cuerpo: solo quién y cuándo). */
export interface MensajeHilo { from: string; fecha: Date | null; messageId: string | null }

const HILO_TIMEOUT_MS = 20_000

/**
 * Todos los correos de los hilos de Gmail a los que pertenece alguno de esos Message-ID, buscados en «Todos los mensajes»
 * (`\All`, se llame «All Mail» o «Todos»): lo que un filtro etiquetó o archivó sin pasar por INBOX también está. Usa
 * X-GM-THRID (`threadId`). Conexión propia y de solo lectura (la llaman el cron Y el webhook de Telegram).
 * `null` = no se pudo mirar (red, carpeta, ninguna ancla encontrada): NUNCA equivale a «el hilo está vacío».
 */
export async function leerHiloCompleto(messageIds: readonly string[]): Promise<MensajeHilo[] | null> {
  const anclas = [...new Set(messageIds.filter((m) => typeof m === 'string' && /^<[^<>\s]+>$/.test(m)))].slice(0, 20)
  if (!anclas.length) return null
  let client: ImapFlow | null = null
  const trabajo = (async (): Promise<MensajeHilo[] | null> => {
    client = nuevoCliente()
    await client.connect()
    const carpetas = await client.list()
    const todos = carpetas.find((c) => c.specialUse === '\\All')?.path ?? '[Gmail]/All Mail'
    const lock = await client.getMailboxLock(todos, { readOnly: true })
    try {
      const hilos = new Set<string>()
      for (const id of anclas) {
        const uids = await client.search({ header: { 'message-id': id } }, { uid: true })
        if (!uids || !uids.length) continue
        for await (const m of client.fetch(uids.slice(0, 3), { threadId: true }, { uid: true })) if (m.threadId) hilos.add(String(m.threadId))
      }
      if (!hilos.size) return null // ninguna ancla encontrada: no sabemos de qué hilo hablamos
      const out: MensajeHilo[] = []
      for (const t of hilos) {
        const uids = await client.search({ threadId: t }, { uid: true })
        if (!uids || !uids.length) continue
        for await (const m of client.fetch(uids.slice(0, 200), { envelope: true, internalDate: true }, { uid: true })) {
          const f = m.envelope?.from?.[0]?.address
          const interna = m.internalDate instanceof Date ? m.internalDate : m.internalDate ? new Date(m.internalDate) : null
          const cab = m.envelope?.date instanceof Date ? m.envelope.date : null
          // La más tardía de las dos fechas: ante la duda, «llegó después» (conservador).
          const fecha = interna && cab ? (interna > cab ? interna : cab) : (interna ?? cab)
          out.push({ from: (f || '').toLowerCase(), fecha, messageId: m.envelope?.messageId ?? null })
        }
      }
      return out
    } finally {
      lock.release()
    }
  })()
  try {
    return await Promise.race([trabajo, new Promise<null>((r) => setTimeout(() => r(null), HILO_TIMEOUT_MS))])
  } catch {
    return null
  } finally {
    const c = client as ImapFlow | null
    if (c) await c.logout().catch(() => {})
    trabajo.catch(() => {})
  }
}
