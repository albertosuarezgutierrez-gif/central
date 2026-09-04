// «Papá, ¿me dejas ver tu seguro del coche?» — la petición de acceso.
//
// Es la dirección CONTRARIA a `autorizacion.ts`, y es la que de verdad pasa: el
// padre que no se maneja con el móvil no va a entrar a invitar a nadie, pero el
// hijo sí entra a pedírselo. Sin esto, la única forma de que exista una
// autorización es que la empiece justo quien menos usa el portal.
//
// ── Por qué es una TABLA APARTE y no una autorización «al revés» ────────────
//
// Una autorización que nace de una petición ya viene ACEPTADA por el
// autorizado: pedirla ES aceptarla. Si se modelara como una `portal_autorizacion`
// en estado raro, el día que alguien contara «autorizaciones pendientes de
// aceptar» estaría contando peticiones que nadie ha concedido todavía — y esa
// cuenta es justo la prueba del art. 7.1 RGPD. Son dos objetos con dos ciclos de
// vida distintos y se quedan separados.
//
// ── 🚨 EL ORÁCULO: lo que esta pantalla NO puede contestar ──────────────────
//
// Para pedir acceso hay que decir a QUIÉN. Y ahí está el peligro que no se ve:
// si la respuesta distingue «esa persona no está con nosotros» de «petición
// enviada», el portal se convierte en una máquina de comprobar quién es cliente
// de la correduría — a razón de un correo por intento, desde fuera, sin límite y
// sin dejar rastro que lo parezca. Con 32.600 fichas eso no es una curiosidad:
// es la cartera entera de Alberto expuesta a un bucle.
//
// Por eso `respuestaPublica()` COLAPSA a propósito los estados que dependen del
// destinatario —no existe, ya te autorizó, ya se lo pediste— en una sola frase.
// Lo que sí se puede decir es lo que depende SOLO de quien pregunta: que se ha
// pedido a sí mismo, o que ha gastado su cupo del día. Esa asimetría es el
// diseño, no una inconsistencia: un límite por DESTINATARIO volvería a filtrar
// («este me deja pedir cinco veces, luego existe»), así que el cupo es por
// SOLICITANTE y punto.

/** Lo que pasó de verdad. Vive en el servidor y NO se le enseña entero a nadie. */
export const RESULTADOS_PETICION = [
  'creada',
  'sin_destinatario',
  'ya_pendiente',
  'ya_autorizado',
  'a_si_mismo',
  'limite_diario',
] as const
export type ResultadoPeticion = (typeof RESULTADOS_PETICION)[number]

/** Lo que se le contesta a quien pregunta. Tres, y solo tres. */
export const RESPUESTAS_PUBLICAS = ['registrada', 'a_si_mismo', 'limite_diario'] as const
export type RespuestaPublica = (typeof RESPUESTAS_PUBLICAS)[number]

/**
 * 🚨 LA FUNCIÓN QUE IMPIDE EL ORÁCULO. Cuatro resultados distintos salen por la
 * misma puerta, y tiene que seguir siendo así: en el momento en que
 * `sin_destinatario` tenga respuesta propia, cualquiera puede recorrer una lista
 * de correos y sacar quién es cliente.
 *
 * `a_si_mismo` y `limite_diario` sí se dicen porque dependen SOLO de quien
 * pregunta: no revelan nada de nadie más.
 */
export function respuestaPublica(r: ResultadoPeticion): RespuestaPublica {
  if (r === 'a_si_mismo') return 'a_si_mismo'
  if (r === 'limite_diario') return 'limite_diario'
  return 'registrada'
}

/**
 * El texto ÚNICO de `registrada`. Está aquí, y no en la pantalla, para que no
 * se escriba dos veces con matices distintos — «te avisaremos cuando acepte»
 * en un sitio y «no hemos encontrado a esa persona» en otro reabre el oráculo
 * por la puerta del copy.
 *
 * Fíjate en lo que NO dice: ni que exista esa persona, ni que le haya llegado
 * nada. Dice lo único que es verdad en los cuatro casos.
 */
export const TEXTO_REGISTRADA =
  'Si esa persona tiene sus seguros con nosotros, le hemos hecho llegar tu petición. ' +
  'Te avisaremos aquí si la concede.'

/** Cupo por SOLICITANTE y día. Por destinatario volvería a filtrar. */
export const MAX_PETICIONES_DIA = 5

// ── Ciclo de vida ──────────────────────────────────────────────────────────

export const ESTADOS_PETICION = ['pendiente', 'concedida', 'rechazada', 'retirada', 'caducada'] as const
export type EstadoPeticion = (typeof ESTADOS_PETICION)[number]

/**
 * Una petición pendiente CADUCA. Sin esto, un «¿me dejas ver tu póliza?» de hace
 * tres años seguiría esperando una respuesta que ya no significa lo mismo: quien
 * la concediera hoy estaría contestando a una pregunta que no recuerda haber
 * leído. Treinta días es lo que dura una conversación de familia.
 */
export const DIAS_VIGENCIA_PETICION = 30

export function caducidadPeticion(desde: Date): Date {
  // En DÍAS, no en meses: `setUTCMonth(m+1)` sobre un 31 de enero da un 31 de
  // febrero que JavaScript normaliza al 3 de marzo sin avisar (misma lección
  // que `fechaAccionable()` del calendario).
  return new Date(desde.getTime() + DIAS_VIGENCIA_PETICION * 24 * 60 * 60 * 1000)
}

export type PeticionFechas = {
  readonly creadaEn: Date
  readonly caducaEn: Date
  readonly concedidaEn: Date | null
  readonly rechazadaEn: Date | null
  readonly retiradaEn: Date | null
}

/**
 * El orden de comprobación es deliberado, igual que en `estadoCodigo()`: lo
 * RESUELTO gana siempre a la caducidad. Una petición concedida el día 10 no se
 * convierte en «caducada» el día 31 — ya cumplió su función y lo que quedó
 * detrás es una autorización con su propia vigencia. Mirar la fecha primero
 * borraría de la pantalla del solicitante la única prueba de que se la
 * concedieron.
 */
export function estadoPeticion(p: PeticionFechas, hoy: Date): EstadoPeticion {
  if (p.retiradaEn !== null) return 'retirada'
  if (p.concedidaEn !== null) return 'concedida'
  if (p.rechazadaEn !== null) return 'rechazada'
  if (hoy >= p.caducaEn) return 'caducada'
  return 'pendiente'
}

/** Solo una PENDIENTE se puede conceder o rechazar. */
export function peticionResoluble(p: PeticionFechas, hoy: Date): boolean {
  return estadoPeticion(p, hoy) === 'pendiente'
}

// ── El mensaje que escribe quien pide ──────────────────────────────────────

export const MAX_MENSAJE_PETICION = 300

/**
 * «Papá, soy Marta, para lo del coche.» Sirve para que el destinatario sepa
 * quién le escribe sin tener que adivinarlo, y por eso se guarda tal cual.
 *
 * 🚨 Va a acabar delante de OTRA persona, así que es texto de un tercero: quien
 * lo pinte lo escapa, y nunca se mete en un asunto de correo ni en una
 * cabecera. Aquí solo se recorta y se normalizan los espacios; vacío es `null`,
 * no `''` — la cadena vacía es el valor de cajón que luego se cuela por todas
 * las guardas de NULL.
 */
export function normalizarMensajePeticion(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const limpio = v.replace(/\s+/g, ' ').trim()
  if (limpio === '') return null
  return limpio.slice(0, MAX_MENSAJE_PETICION)
}
