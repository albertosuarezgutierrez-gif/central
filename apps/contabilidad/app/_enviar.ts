// POST JSON a una ruta interna y devuelve `{ ok, errores }` (los formularios de cierre e inmovilizado lo comparten).
export async function enviar(url: string, cuerpo: unknown): Promise<{ ok: boolean; errores: string[]; datos: Record<string, unknown> }> {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown> & { errores?: string[]; error?: string }
    return { ok: r.ok, errores: r.ok ? [] : (j.errores ?? [j.error ?? 'No se pudo completar la operación']), datos: j }
  } catch {
    return { ok: false, errores: ['Sin conexión: inténtalo de nuevo'], datos: {} }
  }
}
