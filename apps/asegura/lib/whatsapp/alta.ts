// Alta de la conexión de WhatsApp (Embedded Signup v4, Coexistence, Tech Provider sin BSP). La
// orquestación es PURA: todo lo que toca red o BD llega por `deps` (los tests pasan dobles).
// La ruta: app/api/operador/whatsapp/alta/route.ts. Doc: docs/WHATSAPP.md.
//
// Orden y por qué:
//   1. Secretos (WHATSAPP_APP_ID, WHATSAPP_APP_SECRET con requireSecret) y versión → si falta algo, 503.
//   2. Cuerpo (Zod estricto) → 422.
//   3. Cifrado del token disponible (encryptField da `v1:`) → si no, 503. ANTES del canje: el `code` es de
//      UN SOLO USO y un token que no se puede guardar cifrado no se guarda en claro.
//   4. Canje del code → token de negocio. 5. Se guarda (ids + token cifrado) ANTES de seguir.
//   6. Suscribir la app a la WABA. 7-8. Syncs de Coexistence (contactos, luego historial; una vez cada uno,
//      solo si la suscripción fue bien: si no, el webhook del historial se perdería). 9. Verificación.
// NO se registra el número (en Coexistence ya está registrado) y NO se envía ningún mensaje.

import { z } from 'zod'
import type { ClienteGraph, ErrorGraph } from './graph.ts'
import type { NombreSecretoWhatsapp } from './secretos.ts'

const ID = z.string().regex(/^\d{1,30}$/)

export const zAltaWhatsapp = z
  .object({
    code: z.string().min(8).max(4096),
    waba_id: ID,
    phone_number_id: ID,
    business_id: ID.nullable().optional(),
  })
  .strict()

export type DepsAlta = {
  secreto: (n: NombreSecretoWhatsapp) => string | null
  /** `null` = WHATSAPP_GRAPH_API_VERSION mal formada. */
  version: string | null
  graph: (version: string) => ClienteGraph
  cifrar: (texto: string) => string
  /** WHATSAPP_PHONE_NUMBER_ID del webhook (para avisar si no casa con el número conectado). */
  numeroDelWebhook: string | null
  guardarAlta: (d: { wabaId: string; phoneNumberId: string; businessId: string | null; tokenCifrado: string }) => Promise<void>
  guardarSuscripcion: () => Promise<void>
  guardarSync: (tipo: 'contactos' | 'historial', requestId: string | null) => Promise<void>
  guardarVerificacion: (v: { isOnBizApp: boolean | null; platformType: string | null }) => Promise<void>
}

type ErrorPublico = Omit<ErrorGraph, 'ok'>
export type Paso = { estado: 'ok' | 'fallo' | 'sin_pedir'; error?: ErrorPublico; guardado?: boolean; requestId?: string | null; motivo?: string }
export type RespuestaAlta = { status: number; cuerpo: Record<string, unknown> }

const publico = (e: ErrorGraph): ErrorPublico => ({ http: e.http, codigo: e.codigo, subcodigo: e.subcodigo, mensaje: e.mensaje })

function cifradoDisponible(cifrar: (t: string) => string): boolean {
  try {
    return cifrar('comprobacion').startsWith('v1:')
  } catch {
    return false
  }
}

async function intentar(f: () => Promise<void>): Promise<boolean> {
  try {
    await f()
    return true
  } catch {
    return false
  }
}

export async function darDeAltaWhatsapp(cuerpo: unknown, deps: DepsAlta): Promise<RespuestaAlta> {
  const appId = deps.secreto('WHATSAPP_APP_ID')
  const appSecret = deps.secreto('WHATSAPP_APP_SECRET')
  const faltan = [!appId && 'WHATSAPP_APP_ID', !appSecret && 'WHATSAPP_APP_SECRET', !deps.version && 'WHATSAPP_GRAPH_API_VERSION (mal formada)'].filter(Boolean)
  if (!appId || !appSecret || !deps.version) return { status: 503, cuerpo: { estado: 'sin_configurar', faltan } }

  const v = zAltaWhatsapp.safeParse(cuerpo)
  if (!v.success) return { status: 422, cuerpo: { estado: 'invalido', motivo: 'se esperaba {code, waba_id, phone_number_id, business_id?}' } }
  const { code, waba_id: wabaId, phone_number_id: phoneNumberId } = v.data
  const businessId = v.data.business_id ?? null

  if (!cifradoDisponible(deps.cifrar)) return { status: 503, cuerpo: { estado: 'sin_clave_pii', motivo: 'sin PII_ENCRYPTION_KEY el token no se guarda (y el code no se gasta)' } }

  const g = deps.graph(deps.version)
  const canje = await g.canjearCodigo({ appId, appSecret, code })
  if (!canje.ok) return { status: 502, cuerpo: { estado: 'canje_fallido', error: publico(canje), motivo: 'repite «Conectar mi WhatsApp Business» (el code caduca y es de un solo uso)' } }
  const token = canje.datos.token

  let tokenCifrado: string
  try {
    tokenCifrado = deps.cifrar(token)
  } catch {
    return { status: 503, cuerpo: { estado: 'sin_clave_pii' } }
  }
  if (!tokenCifrado.startsWith('v1:')) return { status: 503, cuerpo: { estado: 'sin_clave_pii' } }
  if (!(await intentar(() => deps.guardarAlta({ wabaId, phoneNumberId, businessId, tokenCifrado })))) {
    return { status: 500, cuerpo: { estado: 'error_guardando', motivo: 'el token no se pudo guardar: repite el alta' } }
  }

  const pasos: Record<string, Paso> = { canje: { estado: 'ok', guardado: true } }

  const sus = await g.suscribirApp(wabaId, token)
  if (sus.ok && sus.datos.suscrita) pasos.suscripcion = { estado: 'ok', guardado: await intentar(deps.guardarSuscripcion) }
  else pasos.suscripcion = { estado: 'fallo', ...(sus.ok ? { motivo: 'Meta respondió success=false' } : { error: publico(sus) }) }

  for (const [clave, tipo, local] of [
    ['syncContactos', 'smb_app_state_sync', 'contactos'],
    ['syncHistorial', 'history', 'historial'],
  ] as const) {
    if (pasos.suscripcion.estado !== 'ok') {
      pasos[clave] = { estado: 'sin_pedir', motivo: 'sin suscripción el webhook se perdería; repite el alta' }
      continue
    }
    const s = await g.sincronizarSmb(phoneNumberId, token, tipo)
    pasos[clave] = s.ok
      ? { estado: 'ok', requestId: s.datos.requestId, guardado: await intentar(() => deps.guardarSync(local, s.datos.requestId)) }
      : { estado: 'fallo', error: publico(s) }
  }

  const avisos: string[] = []
  const ver = await g.estadoNumero(phoneNumberId, token)
  if (ver.ok) {
    pasos.verificacion = { estado: 'ok', guardado: await intentar(() => deps.guardarVerificacion(ver.datos)) }
    if (ver.datos.isOnBizApp === false) avisos.push('Meta dice que el número NO está en la app WhatsApp Business (is_on_biz_app=false): no es Coexistence.')
    if (ver.datos.isOnBizApp === null) avisos.push('Meta no dijo si el número sigue en la app del móvil (is_on_biz_app ausente).')
    if (ver.datos.platformType !== null && ver.datos.platformType !== 'CLOUD_API') avisos.push(`platform_type=${ver.datos.platformType.slice(0, 40)} (se esperaba CLOUD_API).`)
  } else {
    pasos.verificacion = { estado: 'fallo', error: publico(ver) }
  }

  if (!deps.numeroDelWebhook) avisos.push('Falta WHATSAPP_PHONE_NUMBER_ID en asegura: el webhook no procesará mensajes hasta ponerlo (y redeploy).')
  else if (deps.numeroDelWebhook !== phoneNumberId) avisos.push('WHATSAPP_PHONE_NUMBER_ID de asegura NO es el número que se acaba de conectar: los mensajes se ignorarán hasta corregirlo.')

  const todoOk = Object.values(pasos).every((p) => p.estado === 'ok')
  return { status: 200, cuerpo: { estado: todoOk ? 'ok' : 'parcial', pasos, avisos, wabaId, phoneNumberId } }
}
