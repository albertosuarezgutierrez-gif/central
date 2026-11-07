// Lógica de `POST /api/auth/solicitar` sin Next (se prueba con node:test). 503 `canal_no_disponible` (sin proveedor de correo; depende
// del entorno, no del correo pedido) ≠ 502 `envio_fallido` (el proveedor falló con un usuario real). Respuesta idéntica exista o no el correo.
import { solicitarCodigo, CANAL_NO_CONECTADO, type RepoAcceso, type CanalCodigo } from './acceso.ts'
import { obtenerCanalCorreo } from './canal-correo.ts'

export type RespuestaSolicitud = { status: number; body: Record<string, unknown>; headers?: Record<string, string> }

export async function resolverSolicitud(
  repo: RepoAcceso, entrada: { email: unknown; ip: string },
  canalDe: () => CanalCodigo | null = obtenerCanalCorreo,
): Promise<RespuestaSolicitud> {
  // En desarrollo local sin proveedor el código sale por consola (ver solicitarCodigo); en cualquier otro entorno, 503.
  const canal = canalDe() ?? (process.env.NODE_ENV === 'development' ? CANAL_NO_CONECTADO : null)
  if (!canal) return { status: 503, body: { error: 'canal_no_disponible' } }
  const r = await solicitarCodigo(repo, canal, entrada)
  if (!r.ok) return { status: r.status, body: { error: r.error }, headers: r.status === 429 ? { 'retry-after': String(r.retryAfter) } : undefined }
  return { status: 200, body: { ok: true, enviado: r.enviado } }
}
