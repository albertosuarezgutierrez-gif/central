// Envío de email de recaptación por la API HTTP de Resend (NO por SMTP como
// el resto de correos de esta app — ver `@central/core-email` /
// `correo-aviso-acceso.ts`). El transporte SMTP no da tracking de
// apertura/clic; la API sí, activando `open`/`click` en la petición.
//
// Solo ESTE flujo usa la API directa: el resto de correos de la casa sigue
// por SMTP a propósito (no todos necesitan tracking, y mezclar dos
// transportes de correo con reglas distintas confundiría más de lo que
// resuelve). `RESEND_API_KEY` es la MISMA variable que ya usa el transporte
// SMTP (ver `apps/asegura/CLAUDE.md`, "el proveedor es RESEND").

export type PeticionResend = {
  url: 'https://api.resend.com/emails'
  headers: Record<string, string>
  body: {
    from: string
    to: string
    subject: string
    text: string
    html: string
    tags: { name: string; value: string }[]
  }
}

export function construirPeticionResend(d: {
  apiKey: string
  from: string
  to: string
  asunto: string
  texto: string
  html: string
}): PeticionResend {
  return {
    url: 'https://api.resend.com/emails',
    headers: { Authorization: `Bearer ${d.apiKey}`, 'content-type': 'application/json' },
    body: {
      from: d.from,
      to: d.to,
      subject: d.asunto,
      text: d.texto,
      html: d.html,
      // La categoría, no datos personales: sirve para filtrar en el dashboard
      // de Resend y para que el webhook (si algún día distingue por tag) sepa
      // de qué flujo viene.
      tags: [{ name: 'categoria', value: 'recaptacion' }],
    },
  }
}

export type ResultadoEnvioResend =
  | { ok: true; resendMessageId: string }
  | { ok: false; motivo: 'sin_api_key' | 'rechazado' }

/**
 * Envía de verdad. `fetchImpl` se inyecta para poder probar sin red (por
 * defecto, `fetch` global). El apellido "resend" en vez de reusar
 * `@central/core-email` es deliberado: ese paquete construye un transporter
 * SMTP, no hace peticiones HTTP a la API — mezclar los dos conceptos en un
 * mismo helper sería más confuso que tener dos caminos claros.
 */
export async function enviarEmailResend(
  d: { from: string; to: string; asunto: string; texto: string; html: string },
  fetchImpl: typeof fetch = fetch,
): Promise<ResultadoEnvioResend> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) return { ok: false, motivo: 'sin_api_key' }
  const peticion = construirPeticionResend({ apiKey, from: d.from, to: d.to, asunto: d.asunto, texto: d.texto, html: d.html })
  try {
    const res = await fetchImpl(peticion.url, {
      method: 'POST',
      headers: peticion.headers,
      body: JSON.stringify(peticion.body),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      console.error('[recaptacion-email] Resend rechazó el envío:', res.status, await res.text().catch(() => ''))
      return { ok: false, motivo: 'rechazado' }
    }
    const json = (await res.json().catch(() => null)) as { id?: string } | null
    if (!json?.id) return { ok: false, motivo: 'rechazado' }
    return { ok: true, resendMessageId: json.id }
  } catch (e) {
    console.error('[recaptacion-email] fallo de red mandando a Resend:', e instanceof Error ? e.message : e)
    return { ok: false, motivo: 'rechazado' }
  }
}
