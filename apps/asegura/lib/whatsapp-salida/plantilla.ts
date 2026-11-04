// ÚNICO sitio de apps/asegura que ENVÍA algo a WhatsApp (plantilla de utilidad de Meta, `POST /{phone_number_id}/messages`).
// Vive FUERA de `lib/whatsapp/` a propósito: los cepos de ese directorio prohíben `/messages` y `graph.facebook.com`
// (el canal es de lectura). Quien lo llama (aviso de vencimiento) está apagado por defecto y tiene su propio tope diario.
// PURO salvo por `fetch`, que se inyecta (los tests pasan uno falso). El token NUNCA se loguea ni sale en un error.

import { z } from 'zod'
import { idMetaValido, type FetchLike } from '../whatsapp/graph.ts'

export type EntradaPlantilla = {
  version: string
  phoneNumberId: string
  token: string
  /** Solo dígitos con prefijo de país (34600123456), formato que pide Meta. */
  to: string
  plantilla: string
  idioma: string
  parametros: readonly string[]
  fetch?: FetchLike
  timeoutMs?: number
}

export type ResultadoEnvio =
  | { ok: true; wamid: string }
  // `definitivo`: Meta contestó 4xx (no se envió: reintentable con criterio). Red/5xx = ambiguo (pudo salir): NO se reintenta.
  | { ok: false; http: number; codigo: number | null; mensaje: string; definitivo: boolean }

const zOk = z.object({ messages: z.array(z.object({ id: z.string().min(5).max(200) }).passthrough()).min(1) }).passthrough()
const zError = z.object({ error: z.object({ code: z.number().optional(), message: z.string().optional() }).passthrough() }).passthrough()

/** Meta rechaza saltos de línea, tabuladores y >4 espacios seguidos en un parámetro; y límite de longitud. */
export function limpiarParametro(s: string): string {
  return s.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, 120)
}

export function cuerpoPlantilla(p: Pick<EntradaPlantilla, 'to' | 'plantilla' | 'idioma' | 'parametros'>): Record<string, unknown> {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: p.to,
    type: 'template',
    template: {
      name: p.plantilla,
      language: { code: p.idioma },
      components: [{ type: 'body', parameters: p.parametros.map((t) => ({ type: 'text', text: limpiarParametro(t) })) }],
    },
  }
}

export async function enviarPlantilla(p: EntradaPlantilla): Promise<ResultadoEnvio> {
  const invalido = (mensaje: string): ResultadoEnvio => ({ ok: false, http: 0, codigo: null, mensaje, definitivo: true })
  if (!idMetaValido(p.phoneNumberId)) return invalido('phone_number_id no válido')
  if (!/^\d{8,15}$/.test(p.to)) return invalido('destinatario no válido')
  if (!/^[a-z0-9_]{1,512}$/.test(p.plantilla)) return invalido('nombre de plantilla no válido')
  if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(p.idioma)) return invalido('idioma no válido')
  const f: FetchLike = p.fetch ?? ((url, init) => fetch(url, init))
  let res: Response
  try {
    res = await f(`https://graph.facebook.com/${p.version}/${p.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${p.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(cuerpoPlantilla(p)),
      cache: 'no-store',
      signal: AbortSignal.timeout(p.timeoutMs ?? 15_000),
    })
  } catch {
    return { ok: false, http: 0, codigo: null, mensaje: 'red', definitivo: false }
  }
  const cuerpo: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const e = zError.safeParse(cuerpo)
    return {
      ok: false,
      http: res.status,
      codigo: e.success ? (e.data.error.code ?? null) : null,
      mensaje: (e.success ? (e.data.error.message ?? '') : '').slice(0, 200) || `HTTP ${res.status}`,
      definitivo: res.status >= 400 && res.status < 500,
    }
  }
  const v = zOk.safeParse(cuerpo)
  // 200 sin wamid legible: pudo salir → ambiguo, no se reintenta.
  if (!v.success) return { ok: false, http: res.status, codigo: null, mensaje: 'respuesta inesperada', definitivo: false }
  return { ok: true, wamid: v.data.messages[0].id }
}
