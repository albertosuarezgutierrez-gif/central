// Descarga del MEDIA (imagen/PDF) que manda un cliente por WhatsApp (spec 2026-11-04 §6). PURO salvo `fetch` (inyectado).
//
// Es el ÚNICO fichero de `lib/whatsapp/` con Graph aparte de `graph.ts`, y SOLO hace `GET`:
//   1. GET https://graph.facebook.com/{version}/{media-id}  (Bearer)  → { url, mime_type, file_size }
//   2. GET {url}  (Bearer)  → los bytes. La URL tiene que ser de Meta (`*.fbsbx.com` / `*.facebook.com` / `*.whatsapp.net`)
//      por https: el token no viaja a ningún otro sitio.
// Nada de envío (`/messages`) ni de registro: lo vigila el cepo de `media.test.ts`.
// Tope 10 MB; mime de la lista cerrada (PDF, JPEG, PNG, HEIC). El token nunca sale en un error.

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export const MAX_BYTES_MEDIA = 10 * 1024 * 1024
export const MIMES_MEDIA = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif'] as const

const ID_META = /^\d{1,30}$/
const HOSTS_META = /(^|\.)(fbsbx\.com|facebook\.com|whatsapp\.net|fbcdn\.net)$/i

export function mimeAdmitido(mime: string | null | undefined): boolean {
  return typeof mime === 'string' && (MIMES_MEDIA as readonly string[]).includes(mime.toLowerCase().split(';')[0].trim())
}

/** ¿URL de descarga de Meta por https? Cualquier otra → no se le manda el token. */
export function urlMediaDeMeta(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && HOSTS_META.test(u.hostname) && u.username === '' && u.password === ''
  } catch {
    return false
  }
}

/**
 * ¿Se encola la descarga del media de este mensaje? Solo un ENTRANTE image/document de una conversación con UNA ficha
 * exacta (la del teléfono hoy, la misma que la de la conversación), sin opt-out y no descartada como personal.
 * (El opt-out de la conversación/ficha ya corta antes, en procesar.ts; aquí se repite por si acaso.)
 */
export function debeEncolarMedia(p: {
  direccion: 'entrante' | 'saliente'
  media: { id: string; mime: string | null } | null
  fichaUnica: boolean
  optOut: boolean
  personal: boolean
}): boolean {
  if (p.direccion !== 'entrante' || p.media === null) return false
  if (!p.fichaUnica || p.optOut || p.personal) return false
  // Un mime que Meta ya dice que no es PDF/imagen admitida no se descarga (si no lo dice, se mira al descargar).
  return p.media.mime === null || mimeAdmitido(p.media.mime)
}

/** Lecturas de póliza por WhatsApp al día (IA de visión): `ASEGURA_WHATSAPP_POLIZAS_MAX_DIA`, por defecto 10. Mal formada → 0 (no se lee). */
export function maxPolizasDia(env: Record<string, string | undefined> = process.env): number {
  const v = env.ASEGURA_WHATSAPP_POLIZAS_MAX_DIA?.trim()
  if (!v) return 10
  return /^\d{1,3}$/.test(v) ? Number(v) : 0
}

/** PURA: con las fichas que tienen ese DNI (null = no se pudo comprobar), ¿se sigue o se para? */
export function decidirDniLeido(clienteConversacion: string, fichasConEseDni: string[] | null): 'seguir' | 'revisar' {
  if (fichasConEseDni === null) return 'revisar'
  if (fichasConEseDni.length === 0) return 'seguir'
  return fichasConEseDni.length === 1 && fichasConEseDni[0] === clienteConversacion ? 'seguir' : 'revisar'
}

export type ResultadoMedia =
  | { ok: true; contenido: Buffer; mime: string }
  | { ok: false; motivo: 'id_invalido' | 'red' | 'http' | 'respuesta' | 'url_no_meta' | 'mime_no_admitido' | 'demasiado_grande' }

export function crearClienteMedia(opts: { version: string; fetch?: FetchLike; timeoutMs?: number }) {
  const f: FetchLike = opts.fetch ?? ((url, init) => fetch(url, init))
  const timeoutMs = opts.timeoutMs ?? 20_000

  async function get(url: string, token: string): Promise<Response | null> {
    try {
      return await f(url, { method: 'GET', headers: { authorization: `Bearer ${token}` }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(timeoutMs) })
    } catch {
      return null
    }
  }

  return {
    async descargar(mediaId: string, token: string): Promise<ResultadoMedia> {
      if (!ID_META.test(mediaId)) return { ok: false, motivo: 'id_invalido' }
      const meta = await get(`https://graph.facebook.com/${opts.version}/${mediaId}`, token)
      if (!meta) return { ok: false, motivo: 'red' }
      if (!meta.ok) return { ok: false, motivo: 'http' }
      const j = (await meta.json().catch(() => null)) as { url?: unknown; mime_type?: unknown; file_size?: unknown } | null
      if (!j || typeof j.url !== 'string') return { ok: false, motivo: 'respuesta' }
      if (!urlMediaDeMeta(j.url)) return { ok: false, motivo: 'url_no_meta' }
      const mime = typeof j.mime_type === 'string' ? j.mime_type.toLowerCase().split(';')[0].trim() : ''
      if (!mimeAdmitido(mime)) return { ok: false, motivo: 'mime_no_admitido' }
      if (typeof j.file_size === 'number' && j.file_size > MAX_BYTES_MEDIA) return { ok: false, motivo: 'demasiado_grande' }
      const bin = await get(j.url, token)
      if (!bin) return { ok: false, motivo: 'red' }
      if (!bin.ok) return { ok: false, motivo: 'http' }
      const largo = Number(bin.headers.get('content-length') ?? '0')
      if (largo > MAX_BYTES_MEDIA) return { ok: false, motivo: 'demasiado_grande' }
      const contenido = Buffer.from(await bin.arrayBuffer())
      if (contenido.length > MAX_BYTES_MEDIA) return { ok: false, motivo: 'demasiado_grande' }
      if (contenido.length === 0) return { ok: false, motivo: 'respuesta' }
      return { ok: true, contenido, mime }
    },
  }
}

/**
 * Aviso a Alberto (Telegram) cuando un cliente/lead manda por WhatsApp una póliza y ya se ha LEÍDO y enlazado a su ficha
 * (documento en Documentos + oportunidad creada/actualizada). Sin datos personales. Nunca lanza ni ofrece lanzar nada:
 * tarificar con los bots RPA es SIEMPRE con el botón 🤖 de Alberto, y el presupuesto, con su botón. `null` = no avisa
 * (el caso `revisar` ya avisó el propio lector). PURO.
 */
export function textoAvisoPolizaRecibida(r: { estado: string; completada?: boolean; yaExistia?: boolean; relacionado?: boolean }): string | null {
  if (r.estado === 'creada' || r.estado === 'actualizada') {
    const que = r.estado === 'creada' && r.yaExistia !== true ? 'oportunidad creada' : r.completada === false ? 'oportunidad ya completa' : 'oportunidad actualizada'
    return `📄 Un cliente ha mandado su póliza por WhatsApp: leída, guardada en Documentos y ${que}. ${r.relacionado ? 'Era de otra persona: queda relacionada con esta ficha. ' : ''}El presupuesto y los bots los lanzas tú.`
  }
  if (r.estado === 'ya_nuestra') return '📄 Un cliente ha mandado por WhatsApp una póliza que ya es nuestra: guardada en Documentos.'
  if (r.estado === 'no_es_seguro' || r.estado === 'sin_lectura' || r.estado === 'error' || r.estado === 'sin_persona') {
    return '📎 Un cliente ha mandado un archivo por WhatsApp que no he podido leer como póliza: guardado en Documentos, míralo tú.'
  }
  return null
}
