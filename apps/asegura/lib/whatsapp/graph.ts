// Cliente MÍNIMO de la Graph API de Meta para el ALTA y la GESTIÓN de la conexión de WhatsApp
// (Embedded Signup, Tech Provider, número en Coexistence). PURO salvo por `fetch`, que se inyecta
// (los tests pasan uno falso). Doc: apps/asegura/docs/WHATSAPP.md.
//
// 🚫 NO hay aquí (ni debe haber) ninguna llamada de ENVÍO de mensajes (`/{phone_number_id}/messages`).
// Lo único que se hace con Meta:
//   · canjear el `code` del Embedded Signup por el token de negocio (GET oauth/access_token)
//   · suscribir la app a la WABA (POST /{waba_id}/subscribed_apps)
//   · pedir las dos sincronizaciones de Coexistence (POST /{phone_number_id}/smb_app_data)
//   · comprobar el número (GET /{phone_number_id}?fields=is_on_biz_app,platform_type)
// NO se registra el número (POST /register): en Coexistence ya está registrado en la app del móvil.
//
// El token y el App Secret NUNCA se loguean ni se devuelven en un error: el error solo lleva el
// código de Meta y un mensaje recortado (Meta no repite el token en sus mensajes).

import { z } from 'zod'

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export type ErrorGraph = { ok: false; http: number; codigo: number | null; subcodigo: number | null; mensaje: string }
export type ResultadoGraph<T> = { ok: true; datos: T } | ErrorGraph

export type TipoSync = 'smb_app_state_sync' | 'history'

/** Versión por defecto de la Graph API si falta WHATSAPP_GRAPH_API_VERSION (no es un secreto). */
export const VERSION_GRAPH_DEFECTO = 'v24.0'
const BASE = 'https://graph.facebook.com'
const ID_META = /^\d{1,30}$/

/** `vNN.N`; ausente → por defecto; mal formada → `null` (quien llama responde 503, no adivina). */
export function versionGraph(env: Record<string, string | undefined> = process.env): string | null {
  const v = env.WHATSAPP_GRAPH_API_VERSION?.trim()
  if (!v) return VERSION_GRAPH_DEFECTO
  return /^v\d{1,3}\.\d{1,2}$/.test(v) ? v : null
}

export function idMetaValido(id: unknown): id is string {
  return typeof id === 'string' && ID_META.test(id)
}

const zErrorMeta = z.object({
  error: z.object({ code: z.number().optional(), error_subcode: z.number().optional(), message: z.string().optional() }).passthrough(),
}).passthrough()

const zToken = z.object({ access_token: z.string().min(10), token_type: z.string().optional(), expires_in: z.number().optional() }).passthrough()
const zExito = z.object({ success: z.boolean() }).passthrough()
const zSync = z.object({ request_id: z.string().min(1).max(200).optional() }).passthrough()
const zNumero = z.object({ is_on_biz_app: z.boolean().optional(), platform_type: z.string().max(60).optional() }).passthrough()

function errorDe(http: number, cuerpo: unknown, porDefecto: string): ErrorGraph {
  const e = zErrorMeta.safeParse(cuerpo)
  if (e.success) {
    return {
      ok: false,
      http,
      codigo: e.data.error.code ?? null,
      subcodigo: e.data.error.error_subcode ?? null,
      mensaje: (e.data.error.message ?? porDefecto).slice(0, 200),
    }
  }
  return { ok: false, http, codigo: null, subcodigo: null, mensaje: porDefecto }
}

export function crearClienteGraph(opts: { version: string; fetch?: FetchLike; timeoutMs?: number }) {
  const f: FetchLike = opts.fetch ?? ((url, init) => fetch(url, init))
  const timeoutMs = opts.timeoutMs ?? 15_000
  const raiz = `${BASE}/${opts.version}`

  async function pedir<T>(url: string, init: RequestInit, esquema: z.ZodType<T>, queEs: string): Promise<ResultadoGraph<T>> {
    let res: Response
    try {
      res = await f(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
    } catch {
      return { ok: false, http: 0, codigo: null, subcodigo: null, mensaje: 'red' }
    }
    const cuerpo: unknown = await res.json().catch(() => null)
    if (!res.ok) return errorDe(res.status, cuerpo, `HTTP ${res.status} en ${queEs}`)
    const v = esquema.safeParse(cuerpo)
    if (!v.success) return { ok: false, http: res.status, codigo: null, subcodigo: null, mensaje: `respuesta inesperada en ${queEs}` }
    return { ok: true, datos: v.data }
  }

  const conToken = (token: string, extra: Record<string, string> = {}) => ({ authorization: `Bearer ${token}`, ...extra })

  return {
    /** El `code` del Embedded Signup → token de negocio. Sin `redirect_uri`: el code viene del popup del SDK JS. */
    async canjearCodigo(p: { appId: string; appSecret: string; code: string }): Promise<ResultadoGraph<{ token: string; expiraEnSeg: number | null }>> {
      const q = new URLSearchParams({ client_id: p.appId, client_secret: p.appSecret, code: p.code })
      const r = await pedir(`${raiz}/oauth/access_token?${q.toString()}`, { method: 'GET' }, zToken, 'oauth/access_token')
      return r.ok ? { ok: true, datos: { token: r.datos.access_token, expiraEnSeg: r.datos.expires_in ?? null } } : r
    },

    /** Suscribe NUESTRA app a los webhooks de esa WABA. */
    async suscribirApp(wabaId: string, token: string): Promise<ResultadoGraph<{ suscrita: boolean }>> {
      if (!idMetaValido(wabaId)) return { ok: false, http: 0, codigo: null, subcodigo: null, mensaje: 'waba_id no válido' }
      const r = await pedir(`${raiz}/${wabaId}/subscribed_apps`, { method: 'POST', headers: conToken(token) }, zExito, 'subscribed_apps')
      return r.ok ? { ok: true, datos: { suscrita: r.datos.success } } : r
    },

    /** Una de las dos sincronizaciones de Coexistence (cada una se puede pedir UNA sola vez, en las 24 h del alta). */
    async sincronizarSmb(phoneNumberId: string, token: string, tipo: TipoSync): Promise<ResultadoGraph<{ requestId: string | null }>> {
      if (!idMetaValido(phoneNumberId)) return { ok: false, http: 0, codigo: null, subcodigo: null, mensaje: 'phone_number_id no válido' }
      const r = await pedir(
        `${raiz}/${phoneNumberId}/smb_app_data`,
        { method: 'POST', headers: conToken(token, { 'content-type': 'application/json' }), body: JSON.stringify({ messaging_product: 'whatsapp', sync_type: tipo }) },
        zSync,
        `smb_app_data(${tipo})`,
      )
      return r.ok ? { ok: true, datos: { requestId: r.datos.request_id ?? null } } : r
    },

    /** Comprobación final: el número sigue en la app del móvil (`is_on_biz_app`) y su plataforma. */
    async estadoNumero(phoneNumberId: string, token: string): Promise<ResultadoGraph<{ isOnBizApp: boolean | null; platformType: string | null }>> {
      if (!idMetaValido(phoneNumberId)) return { ok: false, http: 0, codigo: null, subcodigo: null, mensaje: 'phone_number_id no válido' }
      const r = await pedir(`${raiz}/${phoneNumberId}?fields=is_on_biz_app,platform_type`, { method: 'GET', headers: conToken(token) }, zNumero, 'phone_number')
      // Campo ausente = «Meta no lo dijo» (null), nunca false.
      return r.ok ? { ok: true, datos: { isOnBizApp: r.datos.is_on_biz_app ?? null, platformType: r.datos.platform_type ?? null } } : r
    },
  }
}

export type ClienteGraph = ReturnType<typeof crearClienteGraph>
