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
import { HORAS_ENLACE_DIRECTO, type CampoCambioPoliza, type TipoAviso } from '@central/module-seguros-portal'
import { emailAvisable } from './avisos-vencimiento-reglas.ts'

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
  acceso_por_revisar: {
    uno: 'un acceso a tus seguros que conviene revisar',
    varios: 'accesos a tus seguros que conviene revisar',
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
  // No sale por aquí (el cumpleaños tiene su propio correo, `correo-felicitacion.ts`); la etiqueta
  // existe porque el Record lo exige.
  felicitacion: { uno: 'una felicitación', varios: 'felicitaciones' },
  // Ni compañía ni número: el cambio de compañía, si lo es, se explica DENTRO (la campana lo dice).
  poliza_emitida: { uno: 'una póliza nueva', varios: 'pólizas nuevas' },
  parte_actualizado: { uno: 'novedades de un parte de siniestro', varios: 'novedades de tus partes de siniestro' },
  // Ni qué cambió ni cuánto: precio, fechas o una baja se ven DENTRO (la campana lo dice).
  poliza_modificada: { uno: 'cambios en una de tus pólizas', varios: 'pólizas con cambios' },
}

/**
 * 📱 La invitación a usar la app (Alberto, 27/09/2026: «hay que convencer al cliente de que use la
 * app»). Cada correo es la ocasión de pasarle al canal que no depende de que abra el correo: el
 * portal instalado en el móvil, con los avisos al momento. Una frase y sin insistir: el botón de
 * instalar y el de activar avisos ya están dentro, en la cabecera del portal.
 */
export const INVITACION_APP =
  'Consejo: añade tu área de clientes a la pantalla de inicio del móvil (botón «Instalar» al entrar) y activa las notificaciones. Así te enteras al momento de cualquier cambio en tus seguros, sin esperar a este correo.'

/**
 * Un aviso, reducido a lo único que el correo necesita: su clase. El detalle de una póliza (ramo y
 * qué cambió) viaja aparte en `DatosAvisosIntranet.detalles`: nunca el título ni nada con números.
 */
export type AvisoParaCorreo = { tipo: TipoAviso }

/**
 * Lo que el correo puede decir de UNA póliza: el ramo («Hogar») y qué cambió. 🚨 Nada más: ni nº de
 * póliza, ni matrícula, ni DNI, ni importes, ni compañía.
 */
export type DetalleAviso =
  | { tipo: 'poliza_modificada'; ramo: string | null; campos: readonly CampoCambioPoliza[]; estadoNuevo: string | null }
  | { tipo: 'poliza_emitida'; ramo: string | null; sustituye: boolean }

export type DatosAvisosIntranet = {
  /** Nombre de pila de la persona. `null` = no consta; se saluda sin nombre. */
  nombre: string | null
  /** Lo NUEVO, lo que todavía no se le ha contado. Nunca vacío: sin eso no se escribe. */
  avisos: readonly AvisoParaCorreo[]
  /** Ramo y tipo de cambio de las pólizas de `avisos`. Sin detalle, el texto es neutro. */
  detalles?: readonly DetalleAviso[]
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

/** Nombre corto de cada clase para el ASUNTO y las viñetas. Record: un tipo nuevo no compila sin él. */
export const ASUNTO_POR_TIPO: Record<TipoAviso, string> = {
  peticion_recibida: 'solicitud de acceso',
  autorizacion_pendiente: 'acceso pendiente de aceptar',
  autorizacion_sin_aceptar: 'acceso sin aceptar',
  acceso_por_revisar: 'acceso por revisar',
  obligacion_en_ventana: 'vencimiento próximo',
  datos_por_revisar: 'dato de tu dirección por revisar',
  carnet_en_ventana: 'carné de conducir próximo a caducar',
  carnet_caducado: 'carné de conducir caducado',
  anulacion_por_firmar: 'documento pendiente de tu firma',
  felicitacion: 'felicitación',
  poliza_emitida: 'póliza nueva',
  parte_actualizado: 'novedades de un parte de siniestro',
  poliza_modificada: 'cambios en una de tus pólizas',
}

const CAMBIO_POR_CAMPO: Record<CampoCambioPoliza, { solo: string; en: string }> = {
  estado: { solo: 'cambio de estado', en: 'el estado' },
  fechas: { solo: 'cambio en la renovación', en: 'la renovación' },
  prima: { solo: 'cambio en el precio', en: 'el precio' },
  forma_pago: { solo: 'cambio en la forma de pago', en: 'la forma de pago' },
  coberturas: { solo: 'cambio en las coberturas', en: 'las coberturas' },
  documentos: { solo: 'nuevo documento', en: 'los documentos' },
  siniestros: { solo: 'novedad en un siniestro', en: 'los siniestros' },
}

const PREFIJO_NEUTRO = 'Novedades en tu área de clientes'

/**
 * Qué le pasó a una póliza, en una frase sin números. Puro.
 *
 * 🚨 Renovación: si entre lo cambiado están las FECHAS y el estado NO cambia (`estadoNuevo` null),
 * la póliza se ha renovado (vencimiento movido un año y, de paso, precio y coberturas). Se dice
 * «se ha renovado», no «cambios»: es lo que preguntó un cliente real. Sin importes: el precio y las
 * coberturas se ven dentro.
 */
export function frasePoliza(d: DetalleAviso): { asunto: string; linea: string; ramo: string | null } {
  const ramo = d.ramo?.trim() || null
  const sujeto = ramo ? `Tu seguro de ${ramo}` : null
  const neutro = (c: string) => `${PREFIJO_NEUTRO}: ${c}`
  const con = (accion: string, neutra: string) => {
    const t = sujeto ? `${sujeto}: ${accion}` : neutro(neutra)
    return { asunto: t, linea: t, ramo }
  }
  if (d.tipo === 'poliza_emitida') {
    return con(d.sustituye ? 'cambio de compañía, póliza nueva' : 'póliza nueva', d.sustituye ? 'cambio de compañía, póliza nueva' : 'póliza nueva')
  }
  const campos = d.campos
  if (campos.includes('estado') && d.estadoNuevo === 'baja') return con('póliza dada de baja', 'póliza dada de baja')
  if (campos.includes('fechas') && !campos.includes('estado') && d.estadoNuevo === null) {
    const t = sujeto ? `${sujeto} se ha renovado` : 'Una de tus pólizas se ha renovado'
    const resto = campos.filter((c) => c === 'prima' || c === 'coberturas')
    const linea = resto.length > 0 ? `${t}; revisa ${enumerar(resto.map((c) => CAMBIO_POR_CAMPO[c].en))}` : t
    return { asunto: sujeto ? t : neutro('póliza renovada'), linea, ramo }
  }
  if (campos.length === 0) return con(ASUNTO_POR_TIPO.poliza_modificada, ASUNTO_POR_TIPO.poliza_modificada)
  const frase = campos.length === 1 ? CAMBIO_POR_CAMPO[campos[0]!].solo : `cambios en ${enumerar(campos.map((c) => CAMBIO_POR_CAMPO[c].en))}`
  return con(frase, frase)
}

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

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/**
 * El asunto y las viñetas. Con detalle de póliza: una viñeta por póliza («Tu seguro de Hogar: ...»).
 * Los demás avisos van agrupados por clase y contados («2 vencimientos próximos»). Sin ramo, texto
 * neutro pero con el TIPO de cambio. Puro.
 */
export function componerAsuntoYLineas(d: DatosAvisosIntranet): { asunto: string; lineas: string[] } {
  const n = d.avisos.length
  const cola = [...(d.detalles ?? [])]
  const frases: ReturnType<typeof frasePoliza>[] = []
  const resto: AvisoParaCorreo[] = []
  for (const a of d.avisos) {
    if (a.tipo === 'poliza_modificada' || a.tipo === 'poliza_emitida') {
      const i = cola.findIndex((x) => x.tipo === a.tipo)
      if (i >= 0) {
        frases.push(frasePoliza(cola.splice(i, 1)[0]!))
        continue
      }
    }
    resto.push(a)
  }
  const lineas = frases.map((f) => cap(f.linea))
  if (frases.length > 0 && resto.length > 0) lineas.push(cap(resumirAvisos(resto)))
  // Sin detalle de póliza no hay viñetas: el cuerpo sigue la frase de siempre con el resumen.
  if (frases.length === 0) {
    const asunto =
      n === 1 ? `${PREFIJO_NEUTRO}: ${ASUNTO_POR_TIPO[d.avisos[0]!.tipo]}` : `${n} novedades en tu área de clientes`
    return { asunto, lineas: [] }
  }
  let asunto: string
  if (n === 1) asunto = cap(frases[0]!.asunto)
  else {
    const ramos = new Set(frases.map((f) => f.ramo))
    const comun = frases.length === n && ramos.size === 1 ? [...ramos][0]! : null
    asunto = comun ? `Tu seguro de ${comun}: ${n} novedades` : `${n} novedades en tu área de clientes`
  }
  return { asunto, lineas }
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
  const { asunto, lineas } = componerAsuntoYLineas(d)
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
  const intro = lineas.length > 0 ? 'Te escribimos para avisarte de lo siguiente en tu área de clientes:' : `Te escribimos para avisarte de que tienes ${resumen} en tu área de clientes.`

  const texto = [
    saludo,
    '',
    intro,
    ...lineas.map((l) => `- ${l}`),
    ...(ademas ? ['', ademas] : []),
    '',
    `Puedes verlo aquí: ${d.enlace}`,
    '',
    comoSeEntra,
    '',
    INVITACION_APP,
    '',
    'Un saludo,',
    'Grupo ASegura',
  ].join('\n')

  const html = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#111">',
    `<p>${escapar(saludo)}</p>`,
    `<p>${escapar(intro)}</p>`,
    ...(lineas.length > 0 ? [`<ul>${lineas.map((l) => `<li>${escapar(l)}</li>`).join('')}</ul>`] : []),
    ...(ademas ? [`<p>${escapar(ademas)}</p>`] : []),
    `<p><a href="${escapar(d.enlace)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none">Entrar en mi área de clientes</a></p>`,
    `<p style="color:#555;font-size:13px">${escapar(comoSeEntra)}</p>`,
    `<p style="background:#eef3fe;border-radius:8px;padding:10px 12px;font-size:14px">📱 ${escapar(INVITACION_APP)}</p>`,
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
export async function enviarAvisosIntranet(
  destino: string,
  d: DatosAvisosIntranet,
  quien: { correduriaId: string; clienteId: string },
): Promise<ResultadoEnvio> {
  // Import dinámico: así el cepo del cuerpo corre con `node --test`, que no
  // sabe resolver el punto único de envío.
  const { enviarCorreoSeguido } = await import('./correo-envio')
  const { asunto, texto, html } = cuerpoAvisosIntranet(d)
  const r = await enviarCorreoSeguido({ ...quien, tipo: 'aviso_intranet', to: destino, asunto, texto, html })
  if (r.resultado === 'rechazado') {
    // El motivo, nunca el destino: un log es donde un dato personal sobrevive más tiempo.
    console.error('[asegura/avisos-intranet] fallo enviando el aviso:', r.motivo ?? r.codigo ?? '')
  } else if (r.resultado === 'sin_proveedor') {
    console.error('[asegura/avisos-intranet] no hay proveedor de correo configurado')
  }
  return r.resultado
}


// ── Quién recibe y cuándo: decisiones PURAS (el cron solo las aplica) ───────────────────────────────

const MS_DIA = 86_400_000
/** Máximo UN correo por cliente cada 7 días. */
export const DIAS_ENTRE_CORREOS = 7
/** Una hora de holgura: el sello se escribe segundos después del envío y el cron no corre al segundo. */
const MARGEN_MS = 3_600_000

/**
 * `false` = hace menos de 7 días que se le escribió: hoy NO se envía y NO se sella (lo pendiente
 * sale junto en el siguiente). `ultimoSello` = el `enviado_en` más reciente de `portal_aviso_enviado`.
 */
export function tocaEscribir(ultimoSello: Date | null, hoy: Date): boolean {
  if (ultimoSello === null) return true
  return hoy.getTime() - ultimoSello.getTime() >= DIAS_ENTRE_CORREOS * MS_DIA - MARGEN_MS
}

/** Dominios de la propia correduría (y de pruebas) a los que un aviso a clientes NUNCA sale. */
const DOMINIOS_INTERNOS = ['grupoasegura.es', 'grupoasegura.com']
const DOMINIOS_PRUEBA = ['example.com', 'example.org', 'example.net']
const TLD_PRUEBA = ['invalid', 'test', 'example', 'localhost']

/** Dirección de la casa, de pruebas o reservada: no es un cliente. Mira el dominio, no un literal. */
export function esDireccionInterna(email: string): boolean {
  const dom = email.trim().toLowerCase().split('@').pop() ?? ''
  if (dom === '') return false
  const esDe = (base: string) => dom === base || dom.endsWith(`.${base}`)
  return DOMINIOS_INTERNOS.some(esDe) || DOMINIOS_PRUEBA.some(esDe) || TLD_PRUEBA.includes(dom.split('.').pop() ?? '')
}

/** Un evento de Resend sobre un correo que se mandó a `destino` (ya descifrado). */
export type EventoRebote = { tipo: string; tipoRebote?: string | null; destino: string }

/**
 * Direcciones a las que no se escribe más: rebote DURO (`Permanent`; uno `Transient` es un buzón
 * lleno y se reintenta), queja de spam, o supresión de Resend (ya rebotó antes). En minúscula.
 */
export function direccionesBloqueadas(eventos: readonly EventoRebote[]): Set<string> {
  const out = new Set<string>()
  for (const e of eventos) {
    const duro = e.tipo === 'email.bounced' && (e.tipoRebote ?? '').toLowerCase() === 'permanent'
    if (duro || e.tipo === 'email.complained' || e.tipo === 'email.suppressed') out.add(e.destino.trim().toLowerCase())
  }
  return out
}

/**
 * La primera dirección de la lista (ya en orden de preferencia y en claro) que sirve: con forma de
 * email, no canal de la correduría, no interna y no rebotada. `null` = sin canal.
 */
export function elegirDestino(candidatas: readonly (string | null)[], bloqueadas: ReadonlySet<string>): string | null {
  for (const c of candidatas) {
    if (!emailAvisable(c) || esDireccionInterna(c) || bloqueadas.has(c.trim().toLowerCase())) continue
    return c
  }
  return null
}
