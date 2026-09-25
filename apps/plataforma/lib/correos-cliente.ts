/**
 * Los correos que Grupo ASegura ha mandado a un cliente, con lo que Resend nos ha contado de cada
 * uno (25/09/2026, Alberto: «comprobación de lo máximo posible de los envíos, por si algún cliente
 * reclama»). Puro: lectura defensiva del puerto de asegura y el titular de cada correo.
 *
 * Tres cosas que la pantalla NO puede afirmar, y por eso se modelan aparte:
 *  - «abierto» no prueba lectura (Apple Mail precarga las imágenes de todo lo que recibe) ni su
 *    ausencia prueba que no se leyera (quien bloquea imágenes): se enseña con esa salvedad;
 *  - un correo sin seguimiento (salió por SMTP, sin id de Resend) no tendrá eventos, y eso no es
 *    «no se entregó»;
 *  - sin evento de entrega TODAVÍA no es «no entregado»: Resend tarda segundos o minutos.
 */

export type TipoEventoCorreo =
  | 'email.sent' | 'email.delivered' | 'email.delivery_delayed' | 'email.opened' | 'email.clicked'
  | 'email.bounced' | 'email.complained' | 'email.failed' | 'email.suppressed'

const TIPOS: readonly TipoEventoCorreo[] = [
  'email.sent', 'email.delivered', 'email.delivery_delayed', 'email.opened', 'email.clicked',
  'email.bounced', 'email.complained', 'email.failed', 'email.suppressed',
]

export type EventoCorreo = { tipo: TipoEventoCorreo; fecha: string; detalle: Record<string, string> }
export type CorreoCliente = {
  id: string
  tipo: string
  asunto: string
  destino: string | null
  enviadoEn: string
  estado: 'enviado' | 'fallido'
  error: string | null
  conSeguimiento: boolean
  eventos: EventoCorreo[]
}

const cadena = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

/** `null` si no llega o no es lista (versión de asegura sin correos, o consulta caída) — nunca `[]`. */
export function leerCorreos(v: unknown): CorreoCliente[] | null {
  if (!Array.isArray(v)) return null
  const out: CorreoCliente[] = []
  for (const fila of v) {
    if (typeof fila !== 'object' || fila === null) continue
    const c = fila as Record<string, unknown>
    const id = cadena(c.id)
    const enviadoEn = cadena(c.enviadoEn)
    if (id === null || enviadoEn === null) continue
    const eventos: EventoCorreo[] = []
    for (const e of Array.isArray(c.eventos) ? c.eventos : []) {
      if (typeof e !== 'object' || e === null) continue
      const ev = e as Record<string, unknown>
      const tipo = cadena(ev.tipo) as TipoEventoCorreo | null
      const fecha = cadena(ev.fecha)
      if (tipo === null || !TIPOS.includes(tipo) || fecha === null) continue
      const detalle: Record<string, string> = {}
      if (typeof ev.detalle === 'object' && ev.detalle !== null) {
        for (const [k, val] of Object.entries(ev.detalle as Record<string, unknown>)) if (typeof val === 'string') detalle[k] = val
      }
      eventos.push({ tipo, fecha, detalle })
    }
    out.push({
      id,
      tipo: cadena(c.tipo) ?? 'otro',
      asunto: cadena(c.asunto) ?? '(sin asunto)',
      destino: cadena(c.destino),
      enviadoEn,
      estado: c.estado === 'fallido' ? 'fallido' : 'enviado',
      error: cadena(c.error),
      conSeguimiento: c.conSeguimiento === true,
      eventos,
    })
  }
  return out
}

export const NOMBRE_TIPO_CORREO: Record<string, string> = {
  felicitacion: 'Felicitación de cumpleaños',
}

export const ETIQUETA_EVENTO: Record<TipoEventoCorreo, string> = {
  'email.sent': 'Enviado',
  'email.delivered': 'Entregado',
  'email.delivery_delayed': 'Entrega retrasada',
  'email.opened': 'Abierto',
  'email.clicked': 'Clic en un enlace',
  'email.bounced': 'Rebotado',
  'email.complained': 'Marcado como spam',
  'email.failed': 'Falló el envío',
  'email.suppressed': 'No enviado (dirección bloqueada)',
}

export type Tono = 'bueno' | 'aviso' | 'malo' | 'neutro'
export type TitularCorreo = { texto: string; tono: Tono }

/**
 * El titular de un correo: lo MÁS fuerte que se puede afirmar con lo que ha llegado.
 * Un problema gana a todo (rebote, spam, fallo); después la lectura probada (clic), la apertura
 * con su salvedad, la entrega, y al final «enviado, sin confirmar aún».
 */
export function titularCorreo(c: CorreoCliente): TitularCorreo {
  if (c.estado === 'fallido') return { texto: 'No salió', tono: 'malo' }
  if (!c.conSeguimiento) return { texto: 'Enviado (sin seguimiento)', tono: 'neutro' }
  const hay = (t: TipoEventoCorreo) => c.eventos.some((e) => e.tipo === t)
  if (hay('email.bounced')) return { texto: 'Rebotado: no le llegó', tono: 'malo' }
  if (hay('email.suppressed')) return { texto: 'No enviado: dirección bloqueada', tono: 'malo' }
  if (hay('email.failed')) return { texto: 'Falló el envío', tono: 'malo' }
  if (hay('email.complained')) return { texto: 'Lo marcó como spam', tono: 'malo' }
  if (hay('email.clicked')) return { texto: 'Leído: pinchó un enlace', tono: 'bueno' }
  if (hay('email.opened')) return { texto: 'Entregado y abierto', tono: 'bueno' }
  if (hay('email.delivered')) return { texto: 'Entregado', tono: 'bueno' }
  if (hay('email.delivery_delayed')) return { texto: 'Entrega retrasada', tono: 'aviso' }
  return { texto: 'Enviado, pendiente de confirmar la entrega', tono: 'neutro' }
}
