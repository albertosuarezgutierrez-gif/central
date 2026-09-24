// El «avísame antes de que venza» visto desde la web. La web NO guarda nada (no tiene BD a
// propósito): reenvía a plataforma, que pone el Bearer hacia asegura, que es quien guarda y envía.
//
// 🚨 `RAMOS_CON_AVISO` tiene que ser exactamente el conjunto de slugs que asegura acepta
// (`RAMO_WEB_A_TIPO` de `apps/asegura/lib/aviso-web-reglas.ts`): si divergen, el visitante se
// apuntaría desde una página cuyo ramo asegura rechaza con 422. Lo vigila `lib/aviso.test.ts`.

/**
 * «Otro seguro» del selector de la portada (patinete, mascota, viaje…): el visitante escribe cuál.
 * Tiene que coincidir con `RAMO_WEB_OTRO` de asegura.
 */
export const RAMO_OTRO = 'otro'

/** Versión del texto de consentimiento de abajo. Tiene que coincidir con `CONSENTIMIENTO_VERSION` de asegura. */
export const CONSENTIMIENTO_VERSION = 'web-aviso-v1'

/** El token viaja en el fragmento (`#t=…`): no llega al servidor en la petición de la página ni queda en logs. */
export function tokenDelFragmento(hash: string): string | null {
  const m = /(?:^#|&)t=([^&]+)/.exec(hash)
  if (!m) return null
  try {
    const t = decodeURIComponent(m[1]!)
    return /^[A-Za-z0-9_-]{20,200}$/.test(t) ? t : null
  } catch {
    return null
  }
}

export type AccionAviso = 'solicitar' | 'confirmar' | 'baja'

export async function llamarAviso(accion: AccionAviso, cuerpo: unknown): Promise<{ ok: boolean; motivo: string | null; campo: string | null }> {
  try {
    const res = await fetch(`/api/aviso?accion=${accion}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; motivo?: string; campo?: string | null }
    return { ok: res.ok && j.ok === true, motivo: j.motivo ?? null, campo: j.campo ?? null }
  } catch {
    return { ok: false, motivo: 'No hemos podido conectar. Inténtalo de nuevo en un momento.', campo: null }
  }
}
