// Envío de TEXTO libre a WhatsApp (`POST /{phone_number_id}/messages`). Vive en `lib/whatsapp-salida/` con `plantilla.ts`:
// son los DOS únicos ficheros de apps/asegura que envían (cepo en `texto.test.ts`); `lib/whatsapp/` sigue sin `/messages`.
// Decisión de Alberto (04/11/2026): la IA contesta sola, con TEXTO, dentro de la ventana de 24 h, a un lead/cliente
// con ficha única. Quién decide si se envía: `respuesta-reglas.ts` (puro) + `respuesta.ts` (BD, reserva idempotente), el ÚNICO llamador (cepo).
// Aquí solo el transporte. PURO salvo `fetch`, que se inyecta (los tests pasan uno falso).
//
// 🚫 Solo `type: 'text'` con `preview_url: false` (ni plantillas, ni media, ni interactivos) y UN intento: tras un
//    error o corte NO se reintenta (más vale ninguna respuesta que dos). Cepos en `texto.test.ts`.
// 🔐 Ni el token ni el número salen nunca en un error ni en un log: el error lleva el código de Meta y nada más.

import { z } from 'zod'
import { idMetaValido, type FetchLike } from '../whatsapp/graph.ts'

const BASE = 'https://graph.facebook.com'
export const MAX_TEXTO_ENVIO = 1000

/**
 * `incierto`: red caída, timeout o 5xx de Meta → PUDO salir. No se reintenta y se dice «no sé si salió»; un 4xx (o una
 * entrada rechazada antes de llamar) es un no rotundo.
 */
export type ResultadoEnvio = { ok: true; wamid: string } | { ok: false; http: number; codigo: number | null; incierto: boolean }

const zOk = z.object({ messages: z.array(z.object({ id: z.string().min(1).max(255) }).passthrough()).min(1) }).passthrough()
const zErr = z.object({ error: z.object({ code: z.number().optional() }).passthrough() }).passthrough()

export function crearEnviador(opts: { version: string; fetch?: FetchLike; timeoutMs?: number }) {
  const f: FetchLike = opts.fetch ?? ((url, init) => fetch(url, init))
  const timeoutMs = opts.timeoutMs ?? 15_000
  return {
    /** `toE164` con o sin «+»; se manda solo con dígitos (formato wa_id). */
    async enviarTexto(p: { phoneNumberId: string; token: string; toE164: string; texto: string }): Promise<ResultadoEnvio> {
      const to = p.toE164.replace(/^\+/, '')
      if (!idMetaValido(p.phoneNumberId) || !/^\d{8,15}$/.test(to)) return { ok: false, http: 0, codigo: null, incierto: false }
      const texto = p.texto.trim()
      if (texto === '' || texto.length > MAX_TEXTO_ENVIO) return { ok: false, http: 0, codigo: null, incierto: false }
      let res: Response
      try {
        res = await f(`${BASE}/${opts.version}/${p.phoneNumberId}/messages`, {
          method: 'POST',
          headers: { authorization: `Bearer ${p.token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body: texto } }),
          cache: 'no-store',
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch {
        // Corte o timeout: la petición pudo llegar a Meta.
        return { ok: false, http: 0, codigo: null, incierto: true }
      }
      const cuerpo: unknown = await res.json().catch(() => null)
      if (!res.ok) {
        const e = zErr.safeParse(cuerpo)
        return { ok: false, http: res.status, codigo: e.success ? e.data.error.code ?? null : null, incierto: res.status >= 500 }
      }
      const v = zOk.safeParse(cuerpo)
      // 200 sin wamid: Meta lo aceptó pero no sabemos su id. Cuenta como ENVIADO (no se reintenta) sin id.
      return v.success ? { ok: true, wamid: v.data.messages[0].id } : { ok: true, wamid: '' }
    },
  }
}
