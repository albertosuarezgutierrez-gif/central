// Adaptador de «Mi empresa» (apps/empresa, empresa.grupoasegura.es): puerto `/api/operador/*` con Bearer
// HERRAMIENTAS_OPERADOR_SECRET (PROPIO; no reutilizar otros). Requiere en plataforma: EMPRESA_URL + HERRAMIENTAS_OPERADOR_SECRET.
// El `actor` (email del superadmin) lo pone SIEMPRE el servidor desde la sesión, nunca la petición: queda como prueba del OK
// de cada envío (`envio.confirmado_por`). Este adaptador NO envía nada por sí solo: solo reenvía el clic del operador.
import { requireSecret } from '@central/core-identity'

export type Respuesta = { status: number; json: unknown }

const base = () => process.env.EMPRESA_URL?.trim().replace(/\/$/, '') || null
/** requireSecret (sin fallback a literal). Ausente o vacío → null → 503 «sin_configurar» (falla cerrado, nunca sin Bearer). */
const secreto = (): string | null => {
  try { return requireSecret('HERRAMIENTAS_OPERADOR_SECRET').trim() || null } catch { return null }
}

export const herramientasConfigurado = () => base() !== null && secreto() !== null

async function llamar(path: string, init: RequestInit = {}): Promise<Respuesta> {
  const b = base(); const s = secreto()
  if (!b || !s) return { status: 503, json: { error: 'sin_configurar', detalle: 'define EMPRESA_URL + HERRAMIENTAS_OPERADOR_SECRET' } }
  try {
    const r = await fetch(`${b}${path}`, {
      ...init, cache: 'no-store', signal: AbortSignal.timeout(25_000),
      headers: { Authorization: `Bearer ${s}`, ...(init.body ? { 'content-type': 'application/json' } : {}) },
    })
    return { status: r.status, json: await r.json().catch(() => null) }
  } catch {
    // Sin respuesta NO es «no se hizo»: un envío pudo salir. La pantalla lo dice y manda refrescar la ficha antes de repetir.
    return { status: 502, json: { error: 'sin_respuesta' } }
  }
}

export const listarCuentas = () => llamar('/api/operador/cuentas')
export const fichaCuenta = (id: string) => llamar(`/api/operador/cuentas/${encodeURIComponent(id)}`)
export const altaCuenta = (cuerpo: Record<string, unknown>, actor: string) =>
  llamar('/api/operador/cuentas', { method: 'POST', body: JSON.stringify({ ...cuerpo, actor }) })
export const accionCuenta = (id: string, cuerpo: Record<string, unknown>, actor: string) =>
  llamar(`/api/operador/cuentas/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ ...cuerpo, actor }) })

/** Documento firmado / certificado (HTML), con la integridad ya verificada por «Mi empresa» (cabecera x-integridad). */
export async function documentoVersion(version: string, tipo: 'contrato' | 'certificado'): Promise<{ status: number; html: string | null; sha: string | null }> {
  const b = base(); const s = secreto()
  if (!b || !s) return { status: 503, html: null, sha: null }
  try {
    const r = await fetch(`${b}/api/operador/documentos/${encodeURIComponent(version)}?tipo=${tipo}`, { headers: { Authorization: `Bearer ${s}` }, cache: 'no-store', signal: AbortSignal.timeout(20_000) })
    if (!r.ok || r.headers.get('x-integridad') !== 'verificada') return { status: r.ok ? 409 : r.status, html: null, sha: null }
    return { status: 200, html: await r.text(), sha: r.headers.get('x-sha256') }
  } catch {
    return { status: 502, html: null, sha: null }
  }
}
