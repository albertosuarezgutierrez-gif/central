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
import { avanzarCursor, detalleLectura, planificarLectura, uidsALeer, type CursorCorreo, type PlanLectura } from '@/lib/subastas/correo-incremental'
import { codigoDelIntento, type CorreoOtp } from '@central/module-subastas'

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

/** Parseo de UN mensaje a `CorreoAlerta`. `null` si el cuerpo no se deja leer. */
async function aAlerta(source: Buffer, uid: number): Promise<CorreoAlerta | null> {
  try {
    const parsed = await simpleParser(source)
    return {
      messageId: parsed.messageId ?? `uid-${uid}`,
      subject: parsed.subject ?? '',
      from: parsed.from?.text ?? '',
      fecha: parsed.date ?? new Date(),
      html: typeof parsed.html === 'string' ? parsed.html : (parsed.textAsHtml ?? ''),
    }
  } catch (e) {
    console.error('[subastas/gmail] no se pudo parsear el correo', uid, e)
    return null
  }
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
        const alerta = await aAlerta(msg.source, msg.uid)
        if (alerta) out.push(alerta)
      }
      return out
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
}

/** Lote leído por `leerAlertasDesde`, con lo necesario para avanzar el cursor. */
export interface LoteAlertas {
  correos: CorreoAlerta[]
  /** Cursor a guardar DESPUÉS de procesar `correos` (nunca antes). */
  cursor: CursorCorreo
  /** Cómo se leyó (incremental / primera lectura), para el parte del latido. */
  detalle: string
  plan: PlanLectura
}

/**
 * Lectura INCREMENTAL de las alertas de un remitente: solo lo posterior al
 * último UID procesado.
 *
 * Por qué convive con `leerAlertas` en vez de sustituirla: la ingesta del BOE
 * (`lib/subastas-ingesta.ts`) relee a propósito su ventana completa —el corpus
 * de subastas se re-enriquece— y no tiene dónde guardar cursor. Este camino es
 * el de los portales inmobiliarios, cuyo corpus SÍ es acumulativo y donde
 * releer 30 días cada día se comía el presupuesto del cron (07/08/2026).
 *
 * El cursor que devuelve cubre los correos REALMENTE traídos del buzón, se
 * hayan podido parsear o no: un HTML ilegible falla igual mañana, y dejarlo sin
 * confirmar atascaría la cola para siempre en el mismo mensaje.
 */
export async function leerAlertasDesde(
  remitente: string,
  cursor: CursorCorreo | null,
  opts: { dias?: number; max?: number } = {},
): Promise<LoteAlertas> {
  const { dias = 30, max = 150 } = opts
  const client = nuevoCliente()
  await client.connect()
  try {
    const carpeta = await buzonTodos(client)
    const lock = await client.getMailboxLock(carpeta)
    try {
      const mbox = client.mailbox
      const uidValidity = mbox && typeof mbox !== 'boolean' ? Number(mbox.uidValidity) : 0
      const plan = planificarLectura({ cursor, uidValidityActual: uidValidity, dias })

      // En incremental se acota la búsqueda por rango de UID (barata en el
      // servidor); en bootstrap, por fecha. El `from` va siempre: estas alertas
      // viven en «Todos los mensajes» junto con el resto del buzón.
      const criterio =
        plan.modo === 'incremental'
          ? { from: remitente, uid: `${plan.desdeUid + 1}:*` }
          : { from: remitente, since: plan.desde }
      const uids = (await client.search(criterio, { uid: true })) || []
      const seleccion = uidsALeer([...uids], plan, max)
      if (!seleccion.length) {
        return {
          correos: [],
          cursor: avanzarCursor(cursor, [], uidValidity),
          detalle: detalleLectura(remitente, plan, 0),
          plan,
        }
      }

      const correos: CorreoAlerta[] = []
      const traidos: number[] = []
      for await (const msg of client.fetch(seleccion, { uid: true, source: true }, { uid: true })) {
        if (!msg.source) continue
        traidos.push(msg.uid)
        const alerta = await aAlerta(msg.source, msg.uid)
        if (alerta) correos.push(alerta)
      }
      return {
        correos,
        cursor: avanzarCursor(cursor, traidos, uidValidity),
        detalle: detalleLectura(remitente, plan, correos.length),
        plan,
      }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Segundo factor del login del Portal (ver `portal-otp.ts` para el porqué).
// ────────────────────────────────────────────────────────────────────────────

/** Quien manda los códigos. OJO: NO es `no-responder@boe.es` (las alertas). */
export const REMITENTE_OTP = 'noresponder-subastas@boe.es'

/**
 * Espera al correo con el código del intento de login EN CURSO.
 *
 * Abre UNA conexión IMAP y repregunta cada pocos segundos: el correo tarda
 * unos segundos en llegar, y reconectar en cada vuelta multiplica el tiempo y
 * el riesgo de que Gmail corte por exceso de conexiones.
 *
 * 🚨 `codigoDelIntento` descarta todo lo anterior a `intentoEn`. Si el correo
 * no llega dentro del plazo se devuelve `null` y el login se queda sin hacer:
 * mandar el código de la sesión anterior quemaría este intento contra un
 * Portal que bloquea cuentas.
 */
export async function esperarCodigoPortal(
  intentoEn: Date,
  timeoutMs = 45_000,
  intervaloMs = 4_000,
): Promise<string | null> {
  const client = nuevoCliente()
  await client.connect()
  try {
    const carpeta = await buzonTodos(client)
    const lock = await client.getMailboxLock(carpeta)
    try {
      // `since` en IMAP tiene granularidad de DÍA: acota la descarga, no
      // decide la frescura. Quien decide es `codigoDelIntento` con la hora.
      const desde = new Date(intentoEn.getTime() - 86400_000)
      const limite = Date.now() + timeoutMs

      do {
        const uids = (await client.search({ from: REMITENTE_OTP, since: desde }, { uid: true })) || []
        const seleccion = [...uids].sort((a, b) => b - a).slice(0, 20)
        if (seleccion.length) {
          const candidatos: CorreoOtp[] = []
          for await (const msg of client.fetch(seleccion, { uid: true, source: true }, { uid: true })) {
            if (!msg.source) continue
            const a = await aAlerta(msg.source, msg.uid)
            if (a) candidatos.push({ asunto: a.subject, cuerpo: a.html, fecha: a.fecha })
          }
          const codigo = codigoDelIntento(candidatos, intentoEn)
          if (codigo) return codigo
        }
        if (Date.now() + intervaloMs >= limite) break
        await new Promise((r) => setTimeout(r, intervaloMs))
      } while (Date.now() < limite)

      return null
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => {})
  }
}
