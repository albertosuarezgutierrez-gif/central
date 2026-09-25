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
  /** Opcional: hay correos (cartas a compañías) que salen solo en texto. */
  html?: string
  adjuntos?: AdjuntoCorreo[]
}

export type AdjuntoCorreo = { nombre: string; contenido: string | Buffer; tipo: string }

export type ResultadoCorreoCliente = 'enviado' | 'sin_proveedor' | 'rechazado'

/**
 * El resultado con el motivo CRUDO del proveedor, para los remitentes que distinguen «dominio sin
 * verificar», «se cortó y pudo salir» o el código SMTP. `motivo` nunca lleva direcciones.
 */
export type EnvioDetallado = { resultado: ResultadoCorreoCliente; motivo?: string; codigo?: string }

export async function enviarCorreoCliente(c: CorreoCliente, fetchImpl: typeof fetch = fetch): Promise<ResultadoCorreoCliente> {
  return (await enviarCorreoSeguido(c, fetchImpl)).resultado
}

function contenidoBase64(a: AdjuntoCorreo): string {
  return (typeof a.contenido === 'string' ? Buffer.from(a.contenido, 'utf8') : a.contenido).toString('base64')
}

export async function enviarCorreoSeguido(c: CorreoCliente, fetchImpl: typeof fetch = fetch): Promise<EnvioDetallado> {
  const from = remitenteCorreo(process.env.ASEGURA_MAIL_FROM)
  const replyTo = process.env.ASEGURA_MAIL_REPLY_TO?.trim() || undefined
  const base = { correduriaId: c.correduriaId, clienteId: c.clienteId, tipo: c.tipo, asunto: c.asunto, destino: c.to }
  const apiKey = process.env.RESEND_API_KEY?.trim()

  if (apiKey) {
    try {
      const cuerpo = JSON.stringify({
        from, to: c.to, subject: c.asunto, text: c.texto,
        ...(c.html ? { html: c.html } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(c.adjuntos?.length
          ? { attachments: c.adjuntos.map((a) => ({ filename: a.nombre, content: contenidoBase64(a), content_type: a.tipo })) }
          : {}),
        tags: [{ name: 'categoria', value: etiquetaTipo(c.tipo) }],
      })
      // Resend limita a unas pocas peticiones por segundo y los crons (vencimientos, revisión anual)
      // mandan en ráfaga: un 429 no es un correo malo, se espera y se reintenta.
      let res: Response
      for (let intento = 1; ; intento++) {
        res = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: cuerpo,
          signal: AbortSignal.timeout(15_000),
        })
        if (res.status !== 429 || intento >= 4) break
        const espera = Math.min(5, Number(res.headers.get('retry-after')) || intento)
        await new Promise((r) => setTimeout(r, espera * 1000))
      }
      const json = res.ok ? ((await res.json().catch(() => null)) as { id?: string } | null) : null
      if (!res.ok || !json?.id) {
        const motivo = res.ok ? 'aceptado pero sin id en la respuesta (timeout leyéndola): pudo salir' : `${res.status} ${sinCorreos(await res.text().catch(() => ''))}`
        console.error(`[correo-envio] Resend rechazó «${c.tipo}»:`, motivo)
        await registrarEnvioCorreo({ ...base, resendId: null, proveedor: 'resend_api', estado: 'fallido', error: motivo })
        return { resultado: 'rechazado', motivo, codigo: String(res.status) }
      }
      await registrarEnvioCorreo({ ...base, resendId: json.id, proveedor: 'resend_api', estado: 'enviado' })
      return { resultado: 'enviado' }
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e)
      console.error(`[correo-envio] fallo de red con Resend («${c.tipo}»):`, motivo)
      await registrarEnvioCorreo({ ...base, resendId: null, proveedor: 'resend_api', estado: 'fallido', error: sinCorreos(motivo) })
      return { resultado: 'rechazado', motivo: sinCorreos(motivo) }
    }
  }

  // Sin API key: SMTP de siempre. Import dinámico: los cepos puros corren con `node --test`, que no
  // resuelve `@central/core-email`.
  const { createMailTransporter } = await import('@central/core-email')
  const transporter = createMailTransporter()
  if (!transporter) return { resultado: 'sin_proveedor' }
  try {
    await transporter.sendMail({
      from, to: c.to, ...(replyTo ? { replyTo } : {}), subject: c.asunto, text: c.texto,
      ...(c.html ? { html: c.html } : {}),
      ...(c.adjuntos?.length ? { attachments: c.adjuntos.map((a) => ({ filename: a.nombre, content: a.contenido, contentType: a.tipo })) } : {}),
    })
    await registrarEnvioCorreo({ ...base, resendId: null, proveedor: 'smtp', estado: 'enviado' })
    return { resultado: 'enviado' }
  } catch (e) {
    const motivo = sinCorreos(e instanceof Error ? e.message : String(e))
    const err = e as { code?: unknown; responseCode?: unknown }
    const codigo = err?.responseCode != null || err?.code != null ? String(err.responseCode ?? err.code) : undefined
    console.error(`[correo-envio] fallo SMTP («${c.tipo}»):`, motivo)
    await registrarEnvioCorreo({ ...base, resendId: null, proveedor: 'smtp', estado: 'fallido', error: motivo })
    return { resultado: 'rechazado', motivo, ...(codigo ? { codigo } : {}) }
  }
}
