// fetch server-side con guarda anti-SSRF que REVALIDA cada salto de redirección.
// Antes (auditoría 11/2026) se validaba solo la URL inicial y `fetch` seguía las
// redirecciones por su cuenta: un host público podía responder 302 → http://169.254.169.254/…
// Sin dependencias de la app (solo node:*), para poder probarse con `node --test`.
import dns from 'node:dns/promises'
import net from 'node:net'

// La URL la configura un usuario/propietario → input no confiable. Exigimos http(s) y que el
// host NO resuelva a una IP interna (loopback / link-local / privada / metadata cloud).
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number)
    return p[0] === 10 || p[0] === 127 || p[0] === 0
      || (p[0] === 169 && p[1] === 254)              // link-local + metadata
      || (p[0] === 172 && p[1] >= 16 && p[1] <= 31)
      || (p[0] === 192 && p[1] === 168)
      || (p[0] === 100 && p[1] >= 64 && p[1] <= 127) // CGNAT
  }
  const low = ip.toLowerCase().replace(/^\[|\]$/g, '')
  return low === '::1' || low === '::' || low.startsWith('fe80')
    || low.startsWith('fc') || low.startsWith('fd')  // ULA
    || low.startsWith('::ffff:')                     // IPv4-mapeada
}

export async function isSafePublicUrl(raw: string): Promise<boolean> {
  let u: URL
  try { u = new URL(raw) } catch { return false }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return false
  if (net.isIP(host)) return !isPrivateIp(host)     // la URL ya trae una IP literal
  try {
    const addrs = await dns.lookup(host, { all: true })
    if (!addrs.length) return false
    return !addrs.some(a => isPrivateIp(a.address))
  } catch { return false }
}

export class UrlNoPermitidaError extends Error {
  readonly url: string
  constructor(url: string, motivo = 'URL no permitida') {
    super(`${motivo} — ${url.slice(0, 60)}`)
    this.name = 'UrlNoPermitidaError'
    this.url = url
  }
}

export interface OpcionesFetchSeguro {
  /** Máximo de redirecciones que se siguen (por defecto 5). */
  maxSaltos?: number
  /** Validador de destino; por defecto `isSafePublicUrl`. Inyectable para tests. */
  validar?: (url: string) => Promise<boolean>
  /** `fetch` inyectable para tests. */
  fetchImpl?: typeof fetch
}

/**
 * `fetch` con `redirect: 'manual'`: valida la URL inicial y CADA destino de redirección antes de
 * pedirlo. Lanza `UrlNoPermitidaError` si algún salto no es válido, si se baja de https a http o si
 * se superan `maxSaltos`. Una redirección legítima (mismo host https, o de http a https) funciona igual.
 */
export async function fetchSeguro(url: string, init: RequestInit = {}, op: OpcionesFetchSeguro = {}): Promise<Response> {
  const maxSaltos = op.maxSaltos ?? 5
  const validar = op.validar ?? isSafePublicUrl
  const f = op.fetchImpl ?? fetch
  let actual = url
  for (let salto = 0; ; salto++) {
    if (!(await validar(actual))) throw new UrlNoPermitidaError(actual)
    const res = await f(actual, { ...init, redirect: 'manual' })
    const esRedireccion = res.status >= 300 && res.status < 400 && res.status !== 304
    const destino = res.headers.get('location')
    if (!esRedireccion || !destino) return res
    if (salto >= maxSaltos) throw new UrlNoPermitidaError(actual, 'Demasiadas redirecciones')
    let siguiente: URL
    try { siguiente = new URL(destino, actual) } catch { throw new UrlNoPermitidaError(destino, 'Redirección inválida') }
    if (new URL(actual).protocol === 'https:' && siguiente.protocol !== 'https:') {
      throw new UrlNoPermitidaError(siguiente.toString(), 'Redirección https→http')
    }
    actual = siguiente.toString()
  }
}
