// lib/sivra/agente-huesped/rancio.ts — PENDIENTES RANCIOS (política, pura y testeada).
//
// El problema que resuelve (06/09/2026): `modo noche` cubre el silencio de madrugada, pero un
// borrador que escala EN HORARIO no caduca. Si Alberto no le da a ✅ Enviar, la fila de
// `mensajes_pendientes_tg` se queda ahí indefinidamente: sin recordatorio, sin escalado y sin que el
// huésped reciba nada. Desde el código ese silencio es IDÉNTICO a una conversación atendida — es la
// regla «¿en qué pantalla lo va a ver?» aplicada al propio Alberto. Caso que lo dispara: la reserva
// 154375571 (House Sevillana) preguntó a las 15:41 por recomendaciones y seguía sin respuesta 29 h
// después, con el borrador esperando en Telegram (y Booking contando ese tiempo de respuesta).
//
// La cuenta se lleva en MINUTOS DE ATENCIÓN, no de reloj: las horas de 21:00 a 09:00 no cuentan
// contra Alberto. Un borrador propuesto a las 20:50 no debe darle un toque a las 22:00 (esa franja
// ya la gobierna `noche.ts`) ni acusar recibo al huésped como si llevara horas ignorándolo.
//
// Escalera, dos peldaños, y ninguno redacta nada (los textos son constantes por idioma, igual que en
// el modo noche: la red de seguridad no puede depender de la IA, que es justo lo que puede fallar):
//   1. MIN_RECORDATORIO de atención sin tocar el borrador → se le vuelve a poner delante a Alberto,
//      con los mismos botones (el aviso original ya ha bajado en el hilo de Telegram).
//   2. MIN_ACUSE_ESPERA sin respuesta → se le dice al huésped que lo estamos mirando. No responde su
//      pregunta (no sabemos la respuesta: por eso escaló), pero deja de ser silencio.
//
// No hay tercer peldaño a propósito: derivar al portal de reserva abre un caso contra el anfitrión y
// eso solo se justifica en una urgencia nocturna, que ya tiene su propio camino en `noche-guardia`.
//
// Sin imports a propósito: los módulos puros de esta carpeta se testean con `node --test`, que no
// resuelve un import relativo sin extensión.

/** Minutos de ATENCIÓN (09:00–21:00) sin tocar el borrador antes de volver a avisar a Alberto. */
export const MIN_RECORDATORIO = 45

/** Minutos de ATENCIÓN sin respuesta antes de decirle al huésped que lo estamos mirando. */
export const MIN_ACUSE_ESPERA = 180

// Franja de atención, en minutos desde medianoche. Coincide con HORARIO de `noche.ts`, y
// `rancio.test.ts` comprueba que no divergen: si alguien mueve una y no la otra, el barrido contaría
// como «tiempo de Alberto» horas en las que el modo noche dice que no hay nadie.
const ATENCION_DESDE = 9 * 60
const ATENCION_HASTA = 21 * 60

// Instante → { día local, minuto absoluto } en hora de Madrid. El minuto es un reloj de pared
// monotónico (día × 1440 + hora × 60 + min), lo que permite restar y comparar sin volver a tocar
// zonas horarias. Un salto de horario de verano desplaza la pared una hora dos veces al año: el
// error máximo es de 60 min sobre un umbral de 45, y siempre a favor de avisar antes.
function pared(d: Date): { dia: number; min: number } {
  const s = d.toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' })
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  if (!m) return { dia: 0, min: 0 }
  const dia = Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000)
  return { dia, min: dia * 1440 + Number(m[4]) * 60 + Number(m[5]) }
}

/**
 * Minutos de horario de atención transcurridos entre `desde` y `hasta` (hora de España).
 * Solo suma la franja 09:00–21:00 de cada día; las noches y lo anterior a `desde` no cuentan.
 */
export function minutosAtencion(desde: Date, hasta: Date): number {
  const a = pared(desde)
  const b = pared(hasta)
  if (b.min <= a.min) return 0
  let total = 0
  // Tope duro: un pendiente olvidado de hace meses no debe recorrer un bucle de miles de vueltas.
  // 400 días de franja ya superan cualquier umbral, así que saturar no cambia ninguna decisión.
  for (let d = a.dia, i = 0; d <= b.dia && i < 400; d++, i++) {
    const ini = Math.max(a.min, d * 1440 + ATENCION_DESDE)
    const fin = Math.min(b.min, d * 1440 + ATENCION_HASTA)
    if (fin > ini) total += fin - ini
  }
  return total
}

export type PeldanoRancio = 'recordatorio' | 'acuse' | null

/**
 * ¿Qué toca hacer con un pendiente? Un solo peldaño por pasada, y el acuse manda sobre el
 * recordatorio (si llevamos 4 h, lo urgente es que el huésped deje de estar a oscuras).
 *
 * `noRequiereRespuesta` (un «gracias, un saludo») no da ningún peldaño: nadie espera nada, y un
 * acuse de «lo estamos mirando» sobre una despedida es ruido que además promete una respuesta.
 */
export function peldanoRancio(p: {
  minutos: number
  recordado: boolean
  acusado: boolean
  noRequiereRespuesta: boolean
}): PeldanoRancio {
  if (p.noRequiereRespuesta) return null
  if (!p.acusado && p.minutos >= MIN_ACUSE_ESPERA) return 'acuse'
  if (!p.recordado && p.minutos >= MIN_RECORDATORIO) return 'recordatorio'
  return null
}

type Idioma = 'es' | 'en' | 'fr' | 'it' | 'de' | 'pt'
function normalizarIdioma(lang: string): Idioma {
  const l = (lang || '').slice(0, 2).toLowerCase()
  return (['es', 'en', 'fr', 'it', 'de', 'pt'] as const).includes(l as Idioma) ? (l as Idioma) : 'en'
}

// Lo que se le dice al huésped en el peldaño 2. NO responde su pregunta —no la sabemos, por eso
// escaló— y no promete una hora concreta: prometer «en 10 minutos» y no llegar es peor que el
// silencio. Sí abre la puerta a que marque urgencia, que es la información que nos falta.
const ESPERA: Record<Idioma, string> = {
  es: 'Hemos recibido tu mensaje y lo estamos revisando: queremos confirmarte el dato antes de contestarte, para no darte una información equivocada. Te escribimos en cuanto lo tengamos. Si es algo urgente, dínoslo por aquí y lo adelantamos.',
  en: "We've received your message and we're looking into it — we'd rather confirm the details before replying than give you the wrong information. We'll write back as soon as we have it. If it's urgent, just say so here and we'll prioritise it.",
  fr: "Nous avons bien reçu votre message et nous le traitons : nous préférons vérifier l'information avant de vous répondre plutôt que de vous donner une réponse erronée. Nous revenons vers vous dès que possible. Si c'est urgent, dites-le nous ici et nous traiterons en priorité.",
  it: "Abbiamo ricevuto il tuo messaggio e lo stiamo verificando: preferiamo confermare il dato prima di risponderti, per non darti un'informazione sbagliata. Ti scriviamo appena possibile. Se è urgente, scrivicelo qui e lo trattiamo con priorità.",
  de: 'Wir haben Ihre Nachricht erhalten und prüfen sie gerade: Wir möchten die Angaben bestätigen, bevor wir antworten, damit wir Ihnen nichts Falsches sagen. Wir melden uns, sobald wir es haben. Falls es dringend ist, schreiben Sie es uns hier — dann ziehen wir es vor.',
  pt: 'Recebemos a sua mensagem e estamos a verificá-la: preferimos confirmar a informação antes de responder, para não lhe dar dados errados. Escrevemos assim que a tivermos. Se for urgente, diga-nos por aqui e damos prioridade.',
}

/** Acuse de ESPERA (peldaño 2), en el idioma del huésped. */
export function textoEspera(lang: string): string {
  return ESPERA[normalizarIdioma(lang)]
}
