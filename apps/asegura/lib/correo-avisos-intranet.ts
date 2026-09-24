/**
 * «Tienes algo esperándote en tu área de clientes» — el correo GENÉRICO de la
 * intranet del portal.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 *
 * El portal ya sabe decirle a cada cliente lo que tiene pendiente: es la campana
 * (`avisosDe()`, en `@central/module-seguros-portal`). El problema es que esa
 * campana **solo se ve entrando**, y nadie entra a un portal por si acaso. Un
 * recordatorio de ITV, una petición de acceso de su hijo o una autorización sin
 * aceptar se quedaban ahí hasta caducarse. Alberto, 15/09/2026: «si se lo
 * informas a través de la aplicación suya, él no tiene constancia de nada».
 *
 * Es la regla global del `CLAUDE.md` de la raíz —«¿en qué pantalla lo va a ver,
 * y tengo cómo saber que está ahí?»— aplicada al cliente de la correduría.
 *
 * ── 🚨 Lo que este correo NO dice ───────────────────────────────────────────
 *
 * **No copia el título del aviso.** La campana puede decir «ITV de 1234 ABC» o
 * «Renovación de la póliza 3021700291186», y eso es exactamente lo que la lista
 * `CAMPOS_PROHIBIDOS_EN_INVITACION` mantiene fuera de un correo: matrícula,
 * número de póliza, compañía, prima, DNI. La dirección la tecleó un humano y
 * puede ser un buzón compartido (`administracion@…`), así que el cuerpo dice
 * **cuántas cosas hay y de qué CLASE son** —«un vencimiento próximo», «una
 * solicitud de acceso»— y el enlace. El detalle se ve DENTRO, cuando la persona
 * ha probado que es ella.
 *
 * Eso responde a lo que se pidió («notificarle de que hay algo, o incluso
 * especificándole de qué es») sin convertir la bandeja de entrada en una copia
 * de la cartera.
 *
 * ── 🚨 Y cómo se añade un tipo nuevo ────────────────────────────────────────
 *
 * `ETIQUETA_POR_TIPO` es un `Record<TipoAviso, …>` sobre el tipo del catálogo:
 * el día que la campana aprenda a avisar de algo más (un recibo devuelto, un
 * documento nuevo), **esto deja de compilar hasta que ese algo tenga su
 * etiqueta**. Es a propósito: un tipo nuevo sin etiqueta saldría como «algo
 * pendiente» y nadie se enteraría de la omisión.
 */
import { HORAS_ENLACE_DIRECTO, type TipoAviso } from '@central/module-seguros-portal'
import { remitenteCorreo } from '@central/module-seguros'

/** Cómo se nombra cada clase de aviso en el correo. Singular y plural, en minúscula. */
export type EtiquetaCorreo = { uno: string; varios: string }

export const ETIQUETA_POR_TIPO: Record<TipoAviso, EtiquetaCorreo> = {
  peticion_recibida: {
    uno: 'una solicitud de acceso a tus seguros',
    varios: 'solicitudes de acceso a tus seguros',
  },
  autorizacion_pendiente: {
    uno: 'un acceso que alguien te ha dado y está esperando a que lo aceptes',
    varios: 'accesos que te han dado y están esperando a que los aceptes',
  },
  autorizacion_sin_aceptar: {
    uno: 'un acceso que diste y la otra persona aún no ha aceptado',
    varios: 'accesos que diste y la otra persona aún no ha aceptado',
  },
  obligacion_en_ventana: {
    uno: 'un vencimiento próximo',
    varios: 'vencimientos próximos',
  },
  // 🚨 Aquí NO se copia el valor guardado («0812»): el correo dice la CLASE y
  // el dato se ve dentro, cuando la persona ha probado que es ella. La
  // dirección de un asegurado no viaja a un buzón que pudo teclearse mal.
  datos_por_revisar: {
    uno: 'un dato de tu dirección que conviene revisar',
    varios: 'datos de tu dirección que conviene revisar',
  },
  carnet_en_ventana: {
    uno: 'un carné de conducir que caduca pronto',
    varios: 'carnés de conducir que caducan pronto',
  },
  // «Nos consta» y no «tienes»: la fecha sale de la ficha y puede estar vieja.
  // El correo no acusa a nadie de conducir sin carné — ver `avisos.ts`.
  carnet_caducado: {
    uno: 'un carné de conducir que nos consta caducado',
    varios: 'carnés de conducir que nos constan caducados',
  },
  anulacion_por_firmar: {
    uno: 'un documento pendiente de tu firma',
    varios: 'documentos pendientes de tu firma',
  },
}

/** Un aviso, reducido a lo único que el correo necesita: su clase. */
export type AvisoParaCorreo = { tipo: TipoAviso }

export type DatosAvisosIntranet = {
  /** Nombre de pila de la persona. `null` = no consta; se saluda sin nombre. */
  nombre: string | null
  /** Lo NUEVO, lo que todavía no se le ha contado. Nunca vacío: sin eso no se escribe. */
  avisos: readonly AvisoParaCorreo[]
  /**
   * 🚨 Cuántos avisos tiene en total su campana ahora mismo, que NO es
   * `avisos.length`: puede llevar semanas con tres sin resolver y hoy haberle
   * salido uno nuevo. Decir «tienes un aviso» cuando la campana marca 4 es
   * exactamente la mentira que este correo existe para no contar — así que el
   * cuerpo habla de lo NUEVO y, si hay más esperando, lo dice aparte.
   */
  total: number
  /** A dónde entra. Siempre https y siempre presente: sin enlace no se manda nada. */
  enlace: string
  /** `true` = el enlace lleva una llave de acceso directo (un solo uso, `HORAS_ENLACE_DIRECTO`). */
  directo?: boolean
}

export type CuerpoCorreo = { asunto: string; texto: string; html: string }

/** `['a','b','c']` → `a, b y c`. Vacío no ocurre (quien llama no escribe sin avisos). */
function enumerar(partes: readonly string[]): string {
  if (partes.length <= 1) return partes[0] ?? ''
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}

/**
 * Las clases presentes, contadas y nombradas, en el orden del catálogo (no en
 * el de llegada: así dos correos con lo mismo se leen igual).
 */
export function resumirAvisos(avisos: readonly AvisoParaCorreo[]): string {
  const orden = Object.keys(ETIQUETA_POR_TIPO) as TipoAviso[]
  const partes: string[] = []
  for (const tipo of orden) {
    const n = avisos.filter((a) => a.tipo === tipo).length
    if (n === 0) continue
    const e = ETIQUETA_POR_TIPO[tipo]
    partes.push(n === 1 ? e.uno : `${n} ${e.varios}`)
  }
  return enumerar(partes)
}

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * El cuerpo, PURO: sin red, sin BD y sin más `process.env` que el buzón de
 * respuesta, para que su cepo pueda recorrer el texto entero. Mismo motivo que
 * en `correo-aviso-acceso.ts`: un guardián que necesitara SMTP no lo correría
 * nadie.
 */
export function cuerpoAvisosIntranet(d: DatosAvisosIntranet): CuerpoCorreo {
  // 🚨 El enlace se valida AQUÍ además de en `enlacePortal()`, que es quien lo
  // construye hoy. No es redundancia: este cuerpo se re-exporta para que una
  // pantalla pueda enseñar el ensayo sin enviar, así que mañana puede llamarlo
  // alguien que no pase por aquella guarda. Un `http://` en un correo que lleva
  // a una sesión es justo lo que no puede salir de aquí, y el error es de
  // PROGRAMACIÓN (el enlace no lo teclea nadie): se lanza, no se degrada.
  if (!/^https:\/\//.test(d.enlace)) {
    throw new Error('enlace_no_https')
  }
  const comoSeEntra = d.directo
    ? `Con este enlace entras directamente, una sola vez y durante ${HORAS_ENLACE_DIRECTO} horas. Si ya lo usaste o ha caducado, entras con tu correo y un código de un solo uso. No lo reenvíes.`
    : 'Se entra con tu correo y un código de un solo uso; no hay contraseña que recordar.'
  const saludo = d.nombre?.trim() ? `Hola, ${d.nombre.trim()}:` : 'Hola:'
  const n = d.avisos.length
  const resumen = resumirAvisos(d.avisos)
  const asunto = n === 1 ? 'Novedades en tu área de clientes' : `${n} novedades en tu área de clientes`
  // Lo que ya estaba ahí de antes se nombra como lo que es: no se suma al «nuevo»
  // ni se calla. `total` puede venir por debajo si algo se resolvió entre medias,
  // y entonces esta frase no sale — nunca sale un número negativo de «además».
  const antes = Math.max(0, d.total - n)
  const ademas =
    antes === 0
      ? null
      : antes === 1
        ? 'Además, tenías ya otro aviso sin resolver.'
        : `Además, tenías ya otros ${antes} avisos sin resolver.`

  const texto = [
    saludo,
    '',
    `Te escribimos para avisarte de que tienes ${resumen} en tu área de clientes.`,
    ...(ademas ? ['', ademas] : []),
    '',
    `Puedes verlo aquí: ${d.enlace}`,
    '',
    comoSeEntra,
    '',
    'Un saludo,',
    'Grupo ASegura',
  ].join('\n')

  const html = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#111">',
    `<p>${escapar(saludo)}</p>`,
    `<p>Te escribimos para avisarte de que tienes <strong>${escapar(resumen)}</strong> en tu área de clientes.</p>`,
    ...(ademas ? [`<p>${escapar(ademas)}</p>`] : []),
    `<p><a href="${escapar(d.enlace)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none">Entrar en mi área de clientes</a></p>`,
    `<p style="color:#555;font-size:13px">${escapar(comoSeEntra)}</p>`,
    '<p>Un saludo,<br>Grupo ASegura</p>',
    '</div>',
  ].join('')

  return { asunto, texto, html }
}

export type ResultadoEnvio = 'enviado' | 'sin_proveedor' | 'rechazado'

/**
 * El envío. Devuelve el desenlace en vez de lanzar, por lo mismo que el resto de
 * correos de esta app: «no hay proveedor» es una variable de Vercel que falta, y
 * un reintento no la pone.
 */
export async function enviarAvisosIntranet(destino: string, d: DatosAvisosIntranet): Promise<ResultadoEnvio> {
  // El transporte se carga AQUÍ y no arriba: así el cepo del cuerpo corre con
  // `node --test`, que no sabe resolver `@central/core-email`.
  const { createMailTransporter } = await import('@central/core-email')
  const transporter = createMailTransporter()
  if (!transporter) {
    console.error('[asegura/avisos-intranet] no hay proveedor de correo configurado')
    return 'sin_proveedor'
  }
  const from = remitenteCorreo(process.env.ASEGURA_MAIL_FROM)
  const replyTo = process.env.ASEGURA_MAIL_REPLY_TO?.trim() || undefined
  const { asunto, texto, html } = cuerpoAvisosIntranet(d)
  try {
    await transporter.sendMail({ from, to: destino, ...(replyTo ? { replyTo } : {}), subject: asunto, text: texto, html })
    return 'enviado'
  } catch (e) {
    // El motivo, nunca el destino: un log es donde un dato personal sobrevive más tiempo.
    console.error('[asegura/avisos-intranet] fallo enviando el aviso:', e instanceof Error ? e.message : e)
    return 'rechazado'
  }
}
