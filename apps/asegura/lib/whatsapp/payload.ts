// El cuerpo del webhook de WhatsApp Cloud API → los mensajes que interesan. PURO (Zod), sin BD.
//
// Dos campos (`changes[].field`) se procesan:
//   · `messages`            → `value.messages[]`: lo que escriben a la correduría (ENTRANTE).
//                             `value.statuses[]` (entregado/leído de lo que se envía) se IGNORA.
//   · `smb_message_echoes`  → `value.message_echoes[]`: lo que Alberto escribe desde la app del
//                             móvil en modo Coexistence (SALIENTE). La contraparte es `to`.
// `history`, `smb_app_state_sync` y `account_update` NO son mensajes: los lee `eventos.ts`. Las
// ediciones (`type:'edit'`) y borrados (`type:'revoke'`) entran aquí como un mensaje más (con su propio
// wamid, se guardan en crudo) y procesar.ts los aplica al mensaje ORIGINAL en vez de crear uno nuevo.
//
// Zod NO es `.strict()` aquí a propósito: Meta añade campos sin avisar y un campo nuevo no puede
// tumbar la recepción. Se valida lo que se USA; lo demás pasa. Lo estricto es la salida de la IA.
//
// Los tipos no-texto (imagen, audio, documento…) NO se descargan: se guarda el tipo y un marcador
// (`[imagen]`), con el pie de foto si lo trae.

import { z } from 'zod'

const zMensaje = z
  .object({
    id: z.string().min(1).max(255),
    from: z.string().max(40).optional(),
    to: z.string().max(40).optional(),
    timestamp: z.string().regex(/^\d{1,12}$/),
    type: z.string().min(1).max(40),
    text: z.object({ body: z.string() }).passthrough().optional(),
  })
  .passthrough()

const zValor = z
  .object({
    messaging_product: z.string().optional(),
    metadata: z.object({ phone_number_id: z.string().min(1), display_phone_number: z.string().optional() }).passthrough(),
    contacts: z.array(z.object({ wa_id: z.string().optional(), profile: z.object({ name: z.string().optional() }).passthrough().optional() }).passthrough()).optional(),
    messages: z.array(zMensaje).optional(),
    message_echoes: z.array(zMensaje).optional(),
    statuses: z.array(z.unknown()).optional(),
  })
  .passthrough()

const zCambio = z.object({ field: z.string(), value: z.unknown() }).passthrough()

export const zWebhookWhatsapp = z
  .object({
    object: z.literal('whatsapp_business_account'),
    entry: z.array(z.object({ id: z.string().optional(), changes: z.array(zCambio) }).passthrough()),
  })
  .passthrough()

export type WebhookWhatsapp = z.infer<typeof zWebhookWhatsapp>
export type Direccion = 'entrante' | 'saliente'

export type MensajeExtraido = {
  wamid: string
  direccion: Direccion
  campo: 'messages' | 'smb_message_echoes'
  /** El número de la OTRA persona tal cual lo da Meta (wa_id, sin `+`). Nunca se loguea. */
  contraparte: string | null
  tipo: string
  /** Texto escrito por la persona, o marcador del tipo (`[imagen] pie`). */
  texto: string
  fecha: Date
  /** Nombre del perfil de WhatsApp (solo entrantes, si Meta lo manda). */
  perfilNombre: string | null
  /** El trozo crudo de ESTE mensaje (metadata + contacto + mensaje), para guardarlo tal cual llegó. */
  crudo: Record<string, unknown>
}

export type Extraccion = { mensajes: MensajeExtraido[]; estados: number; otroNumero: number; otrosCampos: number; malFormados: number }

const MARCADOR: Record<string, string> = {
  image: '[imagen]',
  audio: '[audio]',
  voice: '[audio]',
  video: '[vídeo]',
  document: '[documento]',
  sticker: '[sticker]',
  location: '[ubicación]',
  contacts: '[contacto compartido]',
  reaction: '[reacción]',
  button: '[botón]',
  interactive: '[respuesta interactiva]',
  order: '[pedido]',
  system: '[aviso del sistema]',
  unsupported: '[mensaje no soportado]',
}

/** Texto de un mensaje según su tipo. Nunca descarga media: marcador + pie de foto si lo hay. */
export function textoDeMensaje(m: Record<string, unknown> & { type: string; text?: { body: string } }): string {
  if (m.type === 'text') return m.text?.body ?? ''
  const marcador = MARCADOR[m.type] ?? `[${m.type.replace(/[^a-z_]/gi, '').slice(0, 30) || 'desconocido'}]`
  const media = m[m.type]
  const pie = media && typeof media === 'object' && typeof (media as { caption?: unknown }).caption === 'string' ? (media as { caption: string }).caption : null
  if (m.type === 'button') {
    const t = (media as { text?: unknown } | undefined)?.text
    return typeof t === 'string' ? `${marcador} ${t}` : marcador
  }
  return pie ? `${marcador} ${pie}` : marcador
}

/**
 * Del cuerpo ya validado, los mensajes dirigidos a `phoneNumberId`. Lo de otro número de la WABA
 * se cuenta y se deja (no es de esta correduría). Un mensaje mal formado se cuenta, no tumba el resto.
 */
export function extraerMensajes(body: WebhookWhatsapp, phoneNumberId: string): Extraccion {
  const out: Extraccion = { mensajes: [], estados: 0, otroNumero: 0, otrosCampos: 0, malFormados: 0 }
  for (const entrada of body.entry) {
    for (const cambio of entrada.changes) {
      const campo = cambio.field
      if (campo !== 'messages' && campo !== 'smb_message_echoes') {
        out.otrosCampos++
        continue
      }
      const v = zValor.safeParse(cambio.value)
      if (!v.success) {
        out.malFormados++
        continue
      }
      const valor = v.data
      out.estados += valor.statuses?.length ?? 0
      const lista = campo === 'messages' ? valor.messages ?? [] : valor.message_echoes ?? []
      if (lista.length === 0) continue
      if (valor.metadata.phone_number_id !== phoneNumberId) {
        out.otroNumero += lista.length
        continue
      }
      const direccion: Direccion = campo === 'messages' ? 'entrante' : 'saliente'
      for (const m of lista) {
        const contraparte = (direccion === 'entrante' ? m.from : m.to) ?? null
        const contacto = valor.contacts?.find((c) => c.wa_id !== undefined && c.wa_id === contraparte) ?? (direccion === 'entrante' ? valor.contacts?.[0] : undefined)
        const nombre = direccion === 'entrante' ? contacto?.profile?.name?.trim() || null : null
        out.mensajes.push({
          wamid: m.id,
          direccion,
          campo,
          contraparte,
          tipo: m.type,
          texto: textoDeMensaje(m),
          fecha: new Date(Number(m.timestamp) * 1000),
          perfilNombre: nombre ? nombre.slice(0, 120) : null,
          crudo: { field: campo, metadata: valor.metadata, ...(contacto ? { contact: contacto } : {}), message: m },
        })
      }
    }
  }
  return out
}

/**
 * El crudo SIN datos personales, para lo que se conserva después de procesar: ids, tipos y fechas.
 * Fuera el texto, el pie, el nombre del perfil y los números (de los dos lados).
 */
export function crudoMinimizado(crudo: unknown): Record<string, unknown> {
  const c = (crudo && typeof crudo === 'object' ? crudo : {}) as Record<string, unknown>
  const m = (c.message && typeof c.message === 'object' ? c.message : {}) as Record<string, unknown>
  return {
    field: typeof c.field === 'string' ? c.field : null,
    phone_number_id: (c.metadata as { phone_number_id?: unknown } | undefined)?.phone_number_id ?? null,
    message: { id: m.id ?? null, type: m.type ?? null, timestamp: m.timestamp ?? null, ...originalDe(m) },
    minimizado: true,
  }
}

/** De una edición o un borrado se conserva a QUÉ mensaje apuntaba (un wamid, sin texto). */
function originalDe(m: Record<string, unknown>): { original_message_id?: unknown } {
  if (m.type !== 'edit' && m.type !== 'revoke') return {}
  const c = m[m.type as string]
  const o = c && typeof c === 'object' ? (c as { original_message_id?: unknown }).original_message_id : undefined
  return typeof o === 'string' ? { original_message_id: o.slice(0, 255) } : {}
}
