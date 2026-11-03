/**
 * Aviso push a un CLIENTE pedido por `apps/asegura` (03/11/2026, regularización de RC fase 2): cuando Alberto pulsa ✅ y
 * sale el correo con el enlace `/datos/<token>`, asegura llama a `POST /api/operador/push-cliente` para avisar también en
 * la app. PURO: la BD y el envío se inyectan (`push-cliente-bd.ts` es el adaptador; el test usa dobles).
 *
 * 🚨 Decisiones (cepos en `push-cliente.test.ts`):
 *  - El TEXTO no viaja en la petición: lo fija el portal por `motivo` (lista cerrada). Con el secreto filtrado no se puede
 *    mandar a los móviles de los clientes un texto de phishing, y el aviso no lleva datos sensibles POR CONSTRUCCIÓN (ni
 *    importes, ni nº de póliza, ni compañía: la pantalla de bloqueo la ve cualquiera).
 *  - La `url` solo puede ser una RUTA del propio portal con el prefijo de su motivo (`/datos/…`): nunca un dominio, ni
 *    `//host`, ni `\`, ni `..`, ni query. El service worker la abre sobre el origen del portal.
 *  - Destinatarios: SOLO las identidades con `portal_vinculo` a ese cliente (la costura de siempre). Sin vínculo o sin
 *    suscripción → `sinSuscripcion`, nunca un error ni un «enviado».
 *  - Se respetan las preferencias del cliente («solo correo», «no molestar»): el correo ya ha salido, así que esa
 *    identidad se cuenta en `omitidasPorPreferencia` y no se le manda nada.
 *  - Suscripción muerta (404/410) → se borra, como en el cron `avisos-push`.
 */
import { bearerAutorizado } from '@central/module-seguros-pii'

/**
 * ¿Viene de asegura? `Bearer <ASEGURA_PORTAL_PUENTE_SECRET>` en tiempo constante. `leerSecreto` es `requireSecret` (lanza
 * si falta): sin secreto configurado NO se autoriza a nadie, tampoco en desarrollo.
 */
export function pushClienteAutorizado(cabecera: string | null, leerSecreto: (nombre: string) => string): boolean {
  let secreto: string | null
  try {
    secreto = leerSecreto('ASEGURA_PORTAL_PUENTE_SECRET')
  } catch {
    secreto = null
  }
  return bearerAutorizado(cabecera, secreto)
}

export type MotivoPushCliente = 'regularizacion_rc'

export const MOTIVOS_PUSH_CLIENTE: Record<MotivoPushCliente, { title: string; body: string; prefijoUrl: string; tag: string }> = {
  regularizacion_rc: {
    title: 'Grupo ASegura',
    body: 'Tienes una petición pendiente de datos de tu póliza. Toca para verla.',
    prefijoUrl: '/datos/',
    tag: 'peticion-datos',
  },
}

const RUTA_SEGURA = /^\/[A-Za-z0-9/_-]{0,200}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Ruta interna del portal con el prefijo pedido, o `null`. Nada de esquema, host, `//`, `\`, `..`, query ni fragmento. */
export function urlInternaPortal(url: unknown, prefijo: string): string | null {
  if (typeof url !== 'string') return null
  if (!RUTA_SEGURA.test(url) || url.startsWith('//') || url.includes('..')) return null
  if (!url.startsWith(prefijo) || url.length <= prefijo.length) return null
  return url
}

export type PeticionPushCliente = { clienteId: string; motivo: MotivoPushCliente; url: string }

/** Cuerpo de la petición → petición válida o `null` (400). PURO. */
export function leerPeticionPushCliente(b: unknown): PeticionPushCliente | null {
  if (!b || typeof b !== 'object') return null
  const o = b as Record<string, unknown>
  const clienteId = typeof o.clienteId === 'string' ? o.clienteId.trim() : ''
  if (!UUID.test(clienteId)) return null
  const motivo = o.motivo
  if (typeof motivo !== 'string' || !Object.prototype.hasOwnProperty.call(MOTIVOS_PUSH_CLIENTE, motivo)) return null
  const m = MOTIVOS_PUSH_CLIENTE[motivo as MotivoPushCliente]
  const url = urlInternaPortal(o.url, m.prefijoUrl)
  if (!url) return null
  return { clienteId, motivo: motivo as MotivoPushCliente, url }
}

export type SuscripcionPush = { id: string; identidadId: string; endpoint: string; p256dh: string; authKey: string }
export type PayloadPushCliente = { title: string; body: string; icon: string; data: { url: string; tag: string } }

export interface DepsPushCliente {
  identidadesDeCliente(clienteId: string): Promise<string[]>
  /** `true` = esta identidad no quiere push AHORA (canal «solo correo» o franja «no molestar»). */
  omitirPorPreferencia(identidadIds: string[]): Promise<Set<string>>
  suscripciones(identidadIds: string[]): Promise<SuscripcionPush[]>
  enviar(s: SuscripcionPush, payload: PayloadPushCliente): Promise<{ ok: boolean; gone: boolean }>
  borrarSuscripcion(s: SuscripcionPush): Promise<void>
  log?(m: string): void
}

export type ResultadoPushCliente = { enviados: number; fallidos: number; sinSuscripcion: boolean; omitidasPorPreferencia: number }

/** El payload: SOLO el texto fijo del motivo y la ruta interna. PURO. */
export function payloadPushCliente(p: PeticionPushCliente): PayloadPushCliente {
  const m = MOTIVOS_PUSH_CLIENTE[p.motivo]
  return { title: m.title, body: m.body, icon: '/icono-app', data: { url: p.url, tag: m.tag } }
}

export async function enviarPushACliente(p: PeticionPushCliente, d: DepsPushCliente): Promise<ResultadoPushCliente> {
  const identidades = [...new Set(await d.identidadesDeCliente(p.clienteId))]
  if (identidades.length === 0) return { enviados: 0, fallidos: 0, sinSuscripcion: true, omitidasPorPreferencia: 0 }
  const subs = await d.suscripciones(identidades)
  const conApp = [...new Set(subs.map((s) => s.identidadId))]
  if (conApp.length === 0) return { enviados: 0, fallidos: 0, sinSuscripcion: true, omitidasPorPreferencia: 0 }
  const omitir = await d.omitirPorPreferencia(conApp)
  const payload = payloadPushCliente(p)
  let enviados = 0
  let fallidos = 0
  for (const s of subs) {
    if (omitir.has(s.identidadId)) continue
    let r: { ok: boolean; gone: boolean }
    try {
      r = await d.enviar(s, payload)
    } catch (e) {
      d.log?.(`envío lanzó: ${e instanceof Error ? e.message : e}`)
      r = { ok: false, gone: false }
    }
    if (r.ok) enviados += 1
    else fallidos += 1
    if (r.gone) await d.borrarSuscripcion(s).catch(() => {})
  }
  return { enviados, fallidos, sinSuscripcion: false, omitidasPorPreferencia: conApp.filter((i) => omitir.has(i)).length }
}
