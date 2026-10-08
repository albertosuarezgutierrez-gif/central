// El aviso de que un cliente ha pedido la BAJA de una póliza desde el portal.
//
// La solicitud nace RETENIDA 48 h para que Alberto pueda llamar al cliente antes de que firme (y se vaya): el aviso va
// inmediato y dice cuándo se libera sola. Mismo patrón que `aviso-poliza-declarada.ts`: best-effort, NUNCA lanza ni
// tumba la petición, y `sin_canal` (faltan las envs de Telegram en este proyecto) se distingue de `error`.
//
// Lo que NO dice: el nombre ni el correo del cliente, ni el nº de póliza entero (enmascarado), ni la prima. Sí dice lo
// que el cliente escribió en el motivo (compañía con la que se compara y precio que le ofrecen, para poder igualarlo).
import { escapeHtml, tgSend } from '@central/core-telegram'

export type ResultadoAviso = 'enviado' | 'sin_canal' | 'error'

export type ContextoBajaSolicitada = {
  polizaId: string
  compania: string | null
  numeroPoliza: string | null
  /** `venta` · `precio` · `otro` (el que vino de asegura: `venta_del_bien` también se reconoce). */
  motivo: string
  /** «competidor: X · precio_ofrecido: 123,45€», o el texto de «otro». */
  motivoTexto: string | null
  /** ISO si queda retenida; `null` = nace lista para firmar (efecto inminente). */
  liberaSolaAt: string | null
}

const MOTIVO: Record<string, string> = { venta: 'vendió el bien', venta_del_bien: 'vendió el bien', precio: 'precio', otro: 'otro motivo' }

/** `•••456`: lo justo para reconocer la póliza, nunca el número entero. */
export function enmascararPoliza(n: string | null): string | null {
  const t = n?.trim()
  if (!t) return null
  return t.length > 3 ? `•••${t.slice(-3)}` : '•••'
}

function cuando(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const f = d.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' })
  const h = d.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' })
  return `${f} a las ${h}`
}

/** `PLATAFORMA_URL` https o nada: no se inventa una URL. */
export function enlaceFicha(polizaId: string, base = process.env.PLATAFORMA_URL): string | null {
  const b = base?.trim().replace(/\/+$/, '')
  return b && b.startsWith('https://') ? `${b}/correduria/poliza/${encodeURIComponent(polizaId)}` : null
}

export function mensajeBajaSolicitada(c: ContextoBajaSolicitada, enlace: string | null): string {
  const poliza = [c.compania ?? 'compañía sin leer', enmascararPoliza(c.numeroPoliza) ? `nº ${enmascararPoliza(c.numeroPoliza)}` : null].filter(Boolean).join(' · ')
  const motivo = MOTIVO[c.motivo] ?? 'otro motivo'
  const detalle = c.motivoTexto ? `\n«${escapeHtml(c.motivoTexto)}»` : ''
  const plazo = c.liberaSolaAt
    ? `Llámale: queda retenida y se libera sola el ${cuando(c.liberaSolaAt)}.`
    : 'El efecto es inminente: ya puede firmarla.'
  const donde = enlace ? `\n${enlace}` : '\nMíralo en /correduria.'
  return `📤 Un cliente ha pedido la BAJA de una póliza desde el portal: ${escapeHtml(poliza)}.\nMotivo: ${motivo}.${detalle}\n${plazo}${donde}`
}

/** Nunca lanza: un fallo del aviso no puede impedir que la solicitud se guarde. */
export async function avisarBajaSolicitada(c: ContextoBajaSolicitada): Promise<ResultadoAviso> {
  try {
    const id = await tgSend(mensajeBajaSolicitada(c, enlaceFicha(c.polizaId)))
    if (id === null) {
      console.warn('[portal] baja solicitada sin avisar: falta TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID en este proyecto')
      return 'sin_canal'
    }
    return 'enviado'
  } catch (e) {
    console.error('[portal] no se ha podido avisar de la baja solicitada:', e instanceof Error ? e.message : e)
    return 'error'
  }
}
