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

import type { EmailDeFicha } from './email-ficha'

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
      // 🚨 El cuerpo de error de Resend REPITE la dirección de destino
      // («Invalid `to` field…»), y estos logs viajan a Vercel: se tapan los
      // correos antes de escribirlos. El motivo del rechazo (`validation_error`,
      // `rate_limit_exceeded`…) sí se conserva, que es lo que sirve para
      // arreglarlo.
      console.error('[recaptacion-email] Resend rechazó el envío:', res.status, sinCorreos(await res.text().catch(() => '')))
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

// ── A QUIÉN se le manda (puro, sin red ni BD) ──────────────────────────────
//
// 🚨 Vive aquí, y no en `cartera-recaptacion.ts`, para poder probarse sin
// Prisma: el job `Tests (packages + guardián)` corre sin `prisma generate`, y
// un cepo que no se puede ejecutar es un cepo que no vigila.
//
// La regla de fondo es la misma que ya declara `apps/asegura/CLAUDE.md` sobre
// `/cliente/relaciones/aviso`: «el destinatario sale SIEMPRE de la ficha, nunca
// de la petición — un destinatario que viaja en un JSON convierte este puerto
// en un relay de correo con la firma de la correduría». El dominio de envío
// (`envios.grupoasegura.es`) tiene SPF/DKIM válidos, así que un relay abierto
// aquí es phishing firmado por Grupo ASegura.


export type DestinatarioRecaptacion =
  | { ok: true; to: string }
  | {
      ok: false
      /**
       * `destinatario_distinto` = la pantalla enseñaba OTRA dirección que la
       * que resuelve la ficha ahora mismo. No se manda a ninguna de las dos:
       * mandar a la resuelta sería escribir a quien Alberto no vio, y mandar a
       * la declarada es el agujero que esto cierra.
       */
      motivo: 'no_encontrado' | 'sin_email' | 'baja_de_correo' | 'ilegible' | 'destinatario_distinto'
      /** La dirección que SÍ resuelve la ficha, cuando la hay (para poder decirlo en pantalla). */
      resuelto: string | null
    }

/** Tapa cualquier dirección de correo de un texto antes de registrarlo. */
export function sinCorreos(texto: string): string {
  return texto.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '«correo oculto»')
}

function normalizar(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase()
}

/**
 * Decide la dirección de destino a partir del estado de la FICHA
 * (`estadoEmailDeFicha`, la única regla del repo sobre a qué correo se le
 * escribe a un cliente) y, opcionalmente, del correo que venía en el cuerpo.
 *
 * El correo del cuerpo NO enruta nada: solo sirve de confirmación de lo que
 * había en pantalla. Si no coincide con el de la ficha, no se manda nada.
 */
export function decidirDestinatarioRecaptacion(
  ficha: EmailDeFicha,
  emailDeclarado?: string | null,
): DestinatarioRecaptacion {
  if (ficha.estado !== 'ok') return { ok: false, motivo: ficha.estado, resuelto: null }
  const declarado = normalizar(emailDeclarado)
  if (declarado !== '' && declarado !== normalizar(ficha.email)) {
    return { ok: false, motivo: 'destinatario_distinto', resuelto: ficha.email }
  }
  return { ok: true, to: ficha.email }
}
