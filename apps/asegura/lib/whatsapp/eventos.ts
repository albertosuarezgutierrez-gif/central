// Los campos del webhook de WhatsApp que NO son mensajes nuevos, y las ediciones/borrados. PURO (Zod).
// Doc: apps/asegura/docs/WHATSAPP.md.
//
//   · `history`             → historial que la app del móvil comparte al conectar Coexistence. Alberto
//                             pulsa «No compartir chats» → llega con el error 2593109: se REGISTRA y nada
//                             más. Si trae hilos y WHATSAPP_IMPORTAR_HISTORIAL≠'1' → se descarta sin
//                             guardar texto: solo se cuentan hilos y mensajes.
//   · `smb_app_state_sync`  → contactos de la app del móvil. NO se importa nada (la fuente de la agenda es
//                             Google Contacts): solo acuse (cuántos llegaron).
//   · `account_update`      → PARTNER_REMOVED / ACCOUNT_OFFBOARDED / ACCOUNT_RECONNECTED → estado de la
//                             conexión + aviso a Alberto. El resto de eventos de cuenta se ignoran.
//   · mensajes `edit` / `revoke` (en `messages` y en `smb_message_echoes`) → se aplican al mensaje ORIGINAL
//                             (lo hace procesar.ts con `interpretarEdicion`).
//   · error 131060 (mensaje no admitido) → se cuenta y se registra; nunca tumba la recepción.
//
// Zod sin `.strict()` (Meta añade campos sin avisar): se valida lo que se USA.

import { z } from 'zod'
import { textoDeMensaje, type WebhookWhatsapp } from './payload.ts'

export const ERROR_HISTORIAL_NO_COMPARTIDO = 2593109
export const ERROR_MENSAJE_NO_ADMITIDO = 131060

const zErrores = z.array(z.object({ code: z.number() }).passthrough()).optional()
const zMetadata = z.object({ phone_number_id: z.string().optional() }).passthrough().optional()

const zHistorial = z
  .object({
    metadata: zMetadata,
    history: z
      .array(
        z
          .object({
            metadata: z.object({ phase: z.number().optional(), chunk_order: z.number().optional(), progress: z.number().optional() }).passthrough().optional(),
            threads: z.array(z.object({ messages: z.array(z.unknown()).optional() }).passthrough()).optional(),
            errors: zErrores,
          })
          .passthrough(),
      )
      .optional(),
    errors: zErrores,
  })
  .passthrough()

const zEstadoApp = z.object({ metadata: zMetadata, state_sync: z.array(z.unknown()).optional(), errors: zErrores }).passthrough()

const zCuenta = z
  .object({
    event: z.string().min(1).max(80),
    disconnection_info: z.object({ reason: z.string().max(80).optional() }).passthrough().optional(),
  })
  .passthrough()

const zConErrores = z
  .object({
    errors: zErrores,
    messages: z.array(z.object({ errors: zErrores }).passthrough()).optional(),
    message_echoes: z.array(z.object({ errors: zErrores }).passthrough()).optional(),
  })
  .passthrough()

export type EventoHistorial = {
  /** Códigos de error de Meta (2593109 = el negocio eligió NO compartir el historial). */
  errores: number[]
  hilos: number
  mensajes: number
  fase: number | null
  progreso: number | null
  /** El `value` tal cual (solo se guarda si WHATSAPP_IMPORTAR_HISTORIAL='1'). */
  valor: unknown
}
export type EventoCuenta = { wabaId: string | null; evento: string; motivo: string | null }
export type Eventos = {
  historial: EventoHistorial[]
  /** Elementos de `smb_app_state_sync` recibidos (contactos de la app): solo acuse, no se importan. */
  contactosSync: number
  cuentas: EventoCuenta[]
  /** Mensajes con el error 131060 (no admitido). */
  noAdmitidos: number
  /** Eventos de otro número de la WABA (no son de esta correduría). */
  otroNumero: number
}

const codigos = (e: { code: number }[] | undefined) => (e ?? []).map((x) => x.code)

export function extraerEventos(body: WebhookWhatsapp, phoneNumberId: string): Eventos {
  const out: Eventos = { historial: [], contactosSync: 0, cuentas: [], noAdmitidos: 0, otroNumero: 0 }
  for (const entrada of body.entry) {
    for (const cambio of entrada.changes) {
      if (cambio.field === 'history') {
        const v = zHistorial.safeParse(cambio.value)
        if (!v.success) continue
        const pnid = v.data.metadata?.phone_number_id
        if (pnid !== undefined && pnid !== phoneNumberId) {
          out.otroNumero++
          continue
        }
        const generales = codigos(v.data.errors)
        const trozos = v.data.history ?? []
        if (trozos.length === 0 && generales.length > 0) {
          out.historial.push({ errores: generales, hilos: 0, mensajes: 0, fase: null, progreso: null, valor: cambio.value })
        }
        for (const t of trozos) {
          const hilos = t.threads ?? []
          out.historial.push({
            errores: [...generales, ...codigos(t.errors)],
            hilos: hilos.length,
            mensajes: hilos.reduce((n, h) => n + (h.messages?.length ?? 0), 0),
            fase: t.metadata?.phase ?? null,
            progreso: t.metadata?.progress ?? null,
            valor: cambio.value,
          })
        }
      } else if (cambio.field === 'smb_app_state_sync') {
        const v = zEstadoApp.safeParse(cambio.value)
        if (!v.success) continue
        const pnid = v.data.metadata?.phone_number_id
        if (pnid !== undefined && pnid !== phoneNumberId) {
          out.otroNumero++
          continue
        }
        out.contactosSync += v.data.state_sync?.length ?? 0
      } else if (cambio.field === 'account_update') {
        const v = zCuenta.safeParse(cambio.value)
        if (!v.success) continue
        out.cuentas.push({ wabaId: typeof entrada.id === 'string' ? entrada.id : null, evento: v.data.event, motivo: v.data.disconnection_info?.reason ?? null })
      } else if (cambio.field === 'messages' || cambio.field === 'smb_message_echoes') {
        const v = zConErrores.safeParse(cambio.value)
        if (!v.success) continue
        const todos = [...codigos(v.data.errors), ...[...(v.data.messages ?? []), ...(v.data.message_echoes ?? [])].flatMap((m) => codigos(m.errors))]
        out.noAdmitidos += todos.filter((c) => c === ERROR_MENSAJE_NO_ADMITIDO).length
      }
    }
  }
  return out
}

/** Qué se hace con un trozo de historial. 2593109 manda sobre todo: Alberto dijo «No compartir chats». */
export function decisionHistorial(h: EventoHistorial, importar: boolean): 'no_compartido' | 'descartado' | 'guardar_crudo' | 'error_meta' | 'vacio' {
  if (h.errores.includes(ERROR_HISTORIAL_NO_COMPARTIDO)) return 'no_compartido'
  if (h.errores.length > 0) return 'error_meta'
  if (h.hilos === 0) return 'vacio'
  return importar ? 'guardar_crudo' : 'descartado'
}

// ── account_update ──────────────────────────────────────────────────────────────

export type EstadoConexion = 'conectada' | 'desconectada' | 'baja'

/** Evento de cuenta → estado de la conexión. Otro evento → `null` (no cambia nada). */
export function estadoDeEventoCuenta(evento: string, motivo: string | null): { estado: EstadoConexion; motivo: string } | null {
  if (evento === 'PARTNER_REMOVED') return { estado: 'desconectada', motivo: (motivo ?? 'SIN_MOTIVO').slice(0, 60) }
  if (evento === 'ACCOUNT_OFFBOARDED') return { estado: 'baja', motivo: 'ACCOUNT_OFFBOARDED' }
  if (evento === 'ACCOUNT_RECONNECTED') return { estado: 'conectada', motivo: 'ACCOUNT_RECONNECTED' }
  return null
}

const MOTIVO_TEXTO: Record<string, string> = {
  PRIMARY_INACTIVITY: 'la app WhatsApp Business del móvil lleva 14 días sin abrirse',
  COMPANION_INACTIVITY: 'un dispositivo vinculado lleva demasiado tiempo inactivo',
  BUSINESS_DOWNGRADE: 'la cuenta pasó de WhatsApp Business a WhatsApp normal',
  CHANGE_NUMBER: 'se cambió el número en la app del móvil',
  USER_RE_REGISTERED: 'el número se volvió a registrar en la app del móvil',
  ACCOUNT_DISCONNECTED: 'se desconectó desde la app del móvil',
  ACCOUNT_OFFBOARDED: 'la cuenta se dio de baja de la plataforma',
  ACCOUNT_RECONNECTED: 'la cuenta se ha vuelto a conectar',
}

/** El texto del Telegram. SIN datos personales: ni número ni nombre, solo el estado y el porqué. */
export function textoAvisoConexion(estado: EstadoConexion, motivo: string | null): string {
  const porque = motivo ? MOTIVO_TEXTO[motivo] ?? `motivo de Meta: ${motivo.replace(/[^A-Z0-9_]/gi, '').slice(0, 60)}` : 'Meta no dio el motivo'
  if (estado === 'conectada') return `🟢 WhatsApp de la correduría: conexión recuperada (${porque}). Los mensajes vuelven a entrar en el CRM.`
  const titulo = estado === 'baja' ? '🔴 WhatsApp de la correduría: BAJA de la conexión' : '🔴 WhatsApp de la correduría: DESCONECTADO del CRM'
  return `${titulo} (${porque}). Desde ahora NO entran mensajes en el CRM. Para volver: /correduria/ajustes/whatsapp → «Conectar mi WhatsApp Business».`
}

// ── edit / revoke ───────────────────────────────────────────────────────────────

export type Edicion =
  | { tipo: 'edit'; original: string; texto: string }
  | { tipo: 'revoke'; original: string }
  | { tipo: 'invalida'; motivo: string }

const WAMID = /^[\w.=:+/-]{1,255}$/

/** `null` = no es una edición ni un borrado (mensaje normal). */
export function interpretarEdicion(m: Record<string, unknown>): Edicion | null {
  if (m.type !== 'edit' && m.type !== 'revoke') return null
  const cuerpo = m[m.type as string]
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Record<string, unknown>
  const original = c.original_message_id
  if (typeof original !== 'string' || !WAMID.test(original)) return { tipo: 'invalida', motivo: 'sin_original' }
  if (m.type === 'revoke') return { tipo: 'revoke', original }
  const nuevo = (c.message && typeof c.message === 'object' ? c.message : {}) as Record<string, unknown>
  let texto: string
  if (typeof nuevo.type === 'string') texto = textoDeMensaje(nuevo as Record<string, unknown> & { type: string; text?: { body: string } })
  else if (nuevo.text && typeof (nuevo.text as { body?: unknown }).body === 'string') texto = (nuevo.text as { body: string }).body
  else return { tipo: 'invalida', motivo: 'sin_texto' }
  return { tipo: 'edit', original, texto }
}
