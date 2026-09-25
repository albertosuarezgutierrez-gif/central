// Punto ÚNICO de salida de los correos a clientes con seguimiento (25/09/2026).
//
// Sale por la API HTTP de Resend (no por SMTP) porque es la que devuelve el id del correo: sin ese id
// los eventos del webhook (entregado, abierto, clic, rebote) no se pueden atar al cliente. Si no hay
// `RESEND_API_KEY`, cae al transporte SMTP de siempre y el envío queda registrado igual, marcado «sin
// seguimiento», que es la verdad: no habrá eventos que enseñar.
//
// Todo correo que pasa por aquí deja fila en `correo_envio` (salga bien o mal).
import { remitenteCorreo } from '@central/module-seguros'
import { registrarEnvioCorreo } from './correo-seguimiento'
import { sinCorreos } from './recaptacion-email'
import { etiquetaTipo } from './correo-eventos'

export type CorreoCliente = {
  correduriaId: string
  /** `null` solo si el destinatario aún no es una ficha (p. ej. un aviso de la web sin cliente). */
  clienteId: string | null
  /** Qué correo es (`felicitacion`, `invitacion_portal`…): etiqueta en Resend y en la ficha. */
  tipo: string
  to: string
  asunto: string
  texto: string
  html: string
}

export type ResultadoCorreoCliente = 'enviado' | 'sin_proveedor' | 'rechazado'

export async function enviarCorreoCliente(c: CorreoCliente, fetchImpl: typeof fetch = fetch): Promise<ResultadoCorreoCliente> {
  const from = remitenteCorreo(process.env.ASEGURA_MAIL_FROM)
  const replyTo = process.env.ASEGURA_MAIL_REPLY_TO?.trim() || undefined
  const base = { correduriaId: c.correduriaId, clienteId: c.clienteId, tipo: c.tipo, asunto: c.asunto, destino: c.to }
  const apiKey = process.env.RESEND_API_KEY?.trim()

  if (apiKey) {
    try {
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from, to: c.to, subject: c.asunto, text: c.texto, html: c.html,
          ...(replyTo ? { reply_to: replyTo } : {}),
          tags: [{ name: 'categoria', value: etiquetaTipo(c.tipo) }],
        }),
        signal: AbortSignal.timeout(15_000),
      })
      const json = res.ok ? ((await res.json().catch(() => null)) as { id?: string } | null) : null
      if (!res.ok || !json?.id) {
        const motivo = res.ok ? 'respuesta sin id' : `${res.status} ${sinCorreos(await res.text().catch(() => ''))}`
        console.error(`[correo-envio] Resend rechazó «${c.tipo}»:`, motivo)
        await registrarEnvioCorreo({ ...base, resendId: null, proveedor: 'resend_api', estado: 'fallido', error: motivo })
        return 'rechazado'
      }
      await registrarEnvioCorreo({ ...base, resendId: json.id, proveedor: 'resend_api', estado: 'enviado' })
      return 'enviado'
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e)
      console.error(`[correo-envio] fallo de red con Resend («${c.tipo}»):`, motivo)
      await registrarEnvioCorreo({ ...base, resendId: null, proveedor: 'resend_api', estado: 'fallido', error: sinCorreos(motivo) })
      return 'rechazado'
    }
  }

  // Sin API key: SMTP de siempre. Import dinámico: los cepos puros corren con `node --test`, que no
  // resuelve `@central/core-email`.
  const { createMailTransporter } = await import('@central/core-email')
  const transporter = createMailTransporter()
  if (!transporter) return 'sin_proveedor'
  try {
    await transporter.sendMail({ from, to: c.to, ...(replyTo ? { replyTo } : {}), subject: c.asunto, text: c.texto, html: c.html })
    await registrarEnvioCorreo({ ...base, resendId: null, proveedor: 'smtp', estado: 'enviado' })
    return 'enviado'
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e)
    console.error(`[correo-envio] fallo SMTP («${c.tipo}»):`, sinCorreos(motivo))
    await registrarEnvioCorreo({ ...base, resendId: null, proveedor: 'smtp', estado: 'fallido', error: sinCorreos(motivo) })
    return 'rechazado'
  }
}
