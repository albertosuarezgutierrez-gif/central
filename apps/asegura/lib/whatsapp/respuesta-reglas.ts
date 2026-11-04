// Respuesta AUTOMÁTICA de la IA por WhatsApp (decisión de Alberto, 04/11/2026). Reglas PURAS (sin BD ni red).
// Spec: docs/superpowers/specs/2026-11-04-whatsapp-correduria-respuestas-crm.md § «Respuesta automática».
//
// Cuándo CONTESTA (todas a la vez; con cualquier duda, NO):
//   · flag ASEGURA_WHATSAPP_RESPUESTA_ACTIVA=1 (+ canal + IA), conversación NO silenciada ni personal ni con opt-out;
//   · UNA ficha exacta (`clientes_candidatos === 1`) de tipo lead o cliente;
//   · el último mensaje de la conversación es un ENTRANTE en directo (no del historial importado), de hace < 24 h
//     (con margen), sin respuesta de la IA ya dada a ese mismo entrante;
//   · Alberto abrió la conversación (hay un saliente suyo antes) y NO ha escrito después del último entrante
//     (si el echo más reciente es suyo, él lleva la conversación);
//   · por debajo del tope diario (por conversación y total);
//   · tipo texto (o imagen/documento/audio/vídeo → solo el acuse genérico fijo);
//   · la IA dio una respuesta (null = no está segura → solo Telegram) y pasa el FILTRO de contenido.
// Bajas / oposición a la prórroga: NUNCA «hecho»; texto FIJO («Alberto lo gestiona») + Telegram urgente (art. 22 LCS).
// Prohibido en el texto: precios/importes, recomendar productos o coberturas (IDD), confirmar trámites, datos personales
// (también de terceros), enlaces, marcadores de redacción ([NOMBRE]…) y, mientras no haya avisos por plantilla, prometer
// avisos futuros.

export const VENTANA_MS = 24 * 60 * 60 * 1000
/** Margen de seguridad para no rozar el cierre de la ventana de 24 h de Meta (el envío tarda y el reloj difiere). */
export const MARGEN_VENTANA_MS = 30 * 60 * 1000
export const MAX_RESPUESTAS_CONVERSACION_DIA = 3
export const MAX_RESPUESTAS_DIA = 40
export const MAX_CARACTERES_RESPUESTA = 400
/** Tipos de entrante a los que solo se contesta con el acuse genérico (no se interpreta su contenido). */
export const TIPOS_ACUSE = ['image', 'document', 'audio', 'voice', 'video'] as const

export const ACUSE_GENERICO = 'Recibido, muchas gracias. Alberto lo revisa y le dice algo.'
export const RESPUESTA_BAJA =
  'Recibido. Las bajas las gestiona Alberto personalmente: se pone en contacto con usted para tramitarla. Hasta entonces no se ha cambiado nada en su póliza.'

export type MotivoNoResponder =
  | 'flag_apagado' | 'sin_ficha_unica' | 'tipo_ficha' | 'conversacion_no_abierta' | 'opt_out' | 'silenciada'
  | 'sin_entrante' | 'ultimo_no_es_entrante' | 'entrante_historial' | 'fuera_de_ventana' | 'ya_respondida'
  | 'alberto_lleva_conversacion' | 'sin_saliente_previo' | 'tope_conversacion' | 'tope_diario' | 'tipo_no_admitido'
  | 'no_comercial' | 'ia_no_segura' | 'contenido_prohibido' | 'sin_migracion'

/** Lo que el servidor sabe de la conversación ANTES de llamar a la IA. */
export type EstadoConversacionRespuesta = {
  flag: boolean
  tipoFicha: 'cliente' | 'lead' | 'beneficiario' | null
  clientesCandidatos: number | null
  estadoConversacion: string
  optOut: boolean
  silenciada: boolean
  /** El último entrante (por fecha). */
  ultimaEntrante: { id: string; tipo: string; fecha: Date; historial: boolean } | null
  /** El saliente más reciente (de quien sea). `ia` = lo mandó esta IA. */
  ultimoSaliente: { fecha: Date; ia: boolean } | null
  /** ¿Hay algún saliente de Alberto (no de la IA) en la conversación ANTES del último entrante? */
  haySalienteHumanoPrevio: boolean
  /** ¿La IA ya contestó a ESE entrante (sea cual sea el estado del envío)? */
  yaRespondida: boolean
  respuestasHoyConversacion: number
  respuestasHoyTotal: number
  ahora: Date
}

export type Pre = { ok: true } | { ok: false; motivo: MotivoNoResponder }

/** ¿Se le PIDE respuesta a la IA? (antes de llamarla: no se gasta prompt en lo que no se va a enviar). */
export function puedeResponder(e: EstadoConversacionRespuesta): Pre {
  const no = (motivo: MotivoNoResponder): Pre => ({ ok: false, motivo })
  if (!e.flag) return no('flag_apagado')
  if (e.optOut) return no('opt_out')
  if (e.silenciada) return no('silenciada')
  if (e.estadoConversacion !== 'abierta') return no('conversacion_no_abierta')
  if (e.clientesCandidatos !== 1) return no('sin_ficha_unica')
  if (e.tipoFicha !== 'lead' && e.tipoFicha !== 'cliente') return no('tipo_ficha')
  const ent = e.ultimaEntrante
  if (!ent) return no('sin_entrante')
  if (ent.historial) return no('entrante_historial')
  if (e.yaRespondida) return no('ya_respondida')
  if (e.ultimoSaliente && e.ultimoSaliente.fecha.getTime() >= ent.fecha.getTime()) {
    return no(e.ultimoSaliente.ia ? 'ya_respondida' : 'alberto_lleva_conversacion')
  }
  const edad = e.ahora.getTime() - ent.fecha.getTime()
  // Una fecha futura (reloj de Meta adelantado) tampoco es de fiar: fuera.
  if (edad < -5 * 60 * 1000 || edad > VENTANA_MS - MARGEN_VENTANA_MS) return no('fuera_de_ventana')
  if (!e.haySalienteHumanoPrevio) return no('sin_saliente_previo')
  if (e.respuestasHoyConversacion >= MAX_RESPUESTAS_CONVERSACION_DIA) return no('tope_conversacion')
  if (e.respuestasHoyTotal >= MAX_RESPUESTAS_DIA) return no('tope_diario')
  if (ent.tipo !== 'text' && !(TIPOS_ACUSE as readonly string[]).includes(ent.tipo)) return no('tipo_no_admitido')
  return { ok: true }
}

// ── Contenido ───────────────────────────────────────────────────────────────────

const quitarTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Cada regla, con su nombre (el nombre va a la auditoría/Telegram; el texto rechazado NO). */
const PROHIBIDO: { motivo: string; re: RegExp }[] = [
  { motivo: 'precio', re: /€|\beur(o|os)?\b|\d+\s*(%|por ?ciento)|\b(precio|precios|tarifa|prima|primas|cuesta|cuestan|costaria|coste|importe|descuento|rebaja|mas barato|mas caro|ahorra|ahorrar|ahorro|euros?)\b/ },
  { motivo: 'asesoramiento', re: /\b(recomiend\w*|aconsej\w*|conviene|convendria|sugiero|le sugiero|mejor opcion|mejor seguro|cobertura|coberturas|todo riesgo|terceros|franquicia|garantia|garantias|compania|aseguradora|mapfre|allianz|axa|generali|pelayo|zurich|reale|mutua|occident|catalana|santalucia|linea directa|fidelidade|caser|helvetia|liberty)\b/ },
  {
    motivo: 'tramite_confirmado',
    re: /\b(ya (esta|estan|queda|quedan|lo|la|se)|he |hemos |queda |quedan |esta |estan )?(dad[oa]s? de baja|anulad[oa]s?|cancelad[oa]s?|tramitad[oa]s?|cambiad[oa]s?|modificad[oa]s?|actualizad[oa]s?|renovad[oa]s?|aplicad[oa]s?|confirmad[oa]s?|hech[oa]s?|resuelt[oa]s?|realizad[oa]s?|gestionad[oa]s?|cobrad[oa]s?|pagad[oa]s?)\b|\b(le|te) confirmo\b|\bconfirmamos\b/,
  },
  { motivo: 'enlace', re: /https?:|www\.|\.(es|com|net|org)\b/ },
  { motivo: 'dato_personal', re: /\b(dni|nif|nie|iban|cuenta bancaria|numero de cuenta|tarjeta|contrasena|clave|codigo|direccion|domicilio|matricula|n(umero)? de poliza)\b/ },
]

/** Promesa de AVISO futuro: solo con `avisoVencimientoDisponible()` (aviso de vencimiento por plantilla encendido). */
const PROMESA_AVISO = /\b(le|te) (aviso|avisare|avisaremos|avisamos|escribire|escribiremos|recordare|recordaremos|mando|mandare|enviare)\b|\b(le|te) (llegara|llegaran) (un|el|los) (aviso|recordatorio|mensaje)|\b(aviso|recordatorio) (antes|\d+ dias)/

/** Lo que la IA puede decir en su lugar mientras la promesa esté apagada (va en el prompt). */
export const FRASE_SIN_PROMESA = 'tomo nota, Alberto se lo revisa antes del vencimiento'

export type Filtro = { ok: true; texto: string } | { ok: false; motivo: string }

/**
 * El texto que propone la IA, o el motivo por el que NO se envía. Conservador: ante la duda, rechaza.
 * `datoPersonal`: la redacción de PII del repo (inyectada para no acoplar el puro a module-seguros en los tests):
 * si cambia algo del texto, llevaba un dato (DNI, teléfono, email, IBAN, matrícula, nº largo) → fuera.
 */
export function filtrarContenido(bruto: unknown, opciones: { promesaAviso: boolean; redactar: (s: string) => string }): Filtro {
  if (typeof bruto !== 'string') return { ok: false, motivo: 'no_es_texto' }
  const texto = bruto.replace(/\s+/g, ' ').trim()
  if (texto.length < 2) return { ok: false, motivo: 'vacia' }
  if (texto.length > MAX_CARACTERES_RESPUESTA) return { ok: false, motivo: 'larga' }
  // Como mucho 3 frases: una respuesta larga es una respuesta que dice demasiado.
  if ((texto.match(/[.!?](\s|$)/g) ?? []).length > 3) return { ok: false, motivo: 'larga' }
  if (/\d{3,}/.test(texto)) return { ok: false, motivo: 'numero' }
  if (/\[[A-Z_]{2,}\]/.test(texto)) return { ok: false, motivo: 'marcador' }
  if (opciones.redactar(texto) !== texto) return { ok: false, motivo: 'dato_personal' }
  const llano = quitarTildes(texto.toLowerCase())
  // «60 días antes del vencimiento» no tiene importe; pero «60» sí pasa por el filtro de números (2 cifras admitidas).
  for (const r of PROHIBIDO) if (r.re.test(llano)) return { ok: false, motivo: r.motivo }
  if (!opciones.promesaAviso && PROMESA_AVISO.test(llano)) return { ok: false, motivo: 'promesa_aviso' }
  return { ok: true, texto }
}

const BAJA = /\b(baja|darme de baja|dar de baja|anular|anulen|anulacion|cancelar|cancelen|cancelacion|no renovar|no quiero renovar|que no se renueve|no lo renueve|ya no tengo (el|la|ese|este) (seguro|poliza)|me cambio de (compania|seguro)|oposicion a la prorroga)\b/

/** ¿Pide (o anuncia) una baja / oposición a la prórroga? Por la intención de la IA O por el texto (cualquiera basta). */
export function esBaja(intencion: string | null | undefined, textoEntrante: string | null | undefined): boolean {
  if (intencion === 'baja') return true
  return BAJA.test(quitarTildes((textoEntrante ?? '').toLowerCase()))
}

export type DecisionRespuesta =
  | { enviar: true; texto: string; clase: 'ia' | 'acuse' | 'baja' }
  | { enviar: false; motivo: MotivoNoResponder; detalle?: string }

/**
 * Tras la IA: qué se envía. `respuestaIA` llega SIN validar (la IA puede devolver cualquier cosa).
 * La baja manda sobre todo (texto fijo), luego el acuse de media, luego el texto libre filtrado.
 */
export function decidirRespuesta(p: {
  esComercial: boolean
  descartaPersonal: boolean
  baja: boolean
  tipoEntrante: string
  respuestaIA: unknown
  promesaAviso: boolean
  redactar: (s: string) => string
}): DecisionRespuesta {
  if (!p.esComercial || p.descartaPersonal) return { enviar: false, motivo: 'no_comercial' }
  // null = la IA no está segura: nada sale, ni siquiera la plantilla (lo decide Alberto con el aviso).
  if (p.respuestaIA === null || p.respuestaIA === undefined) return { enviar: false, motivo: 'ia_no_segura' }
  if (p.baja) return { enviar: true, texto: RESPUESTA_BAJA, clase: 'baja' }
  if (p.tipoEntrante !== 'text') {
    return (TIPOS_ACUSE as readonly string[]).includes(p.tipoEntrante)
      ? { enviar: true, texto: ACUSE_GENERICO, clase: 'acuse' }
      : { enviar: false, motivo: 'tipo_no_admitido' }
  }
  const f = filtrarContenido(p.respuestaIA, { promesaAviso: p.promesaAviso, redactar: p.redactar })
  if (!f.ok) return { enviar: false, motivo: 'contenido_prohibido', detalle: f.motivo }
  return { enviar: true, texto: f.texto, clase: 'ia' }
}

/** Línea del Telegram para un motivo de NO responder (sin datos personales). */
export const TEXTO_MOTIVO: Partial<Record<MotivoNoResponder, string>> = {
  ia_no_segura: 'la IA no estaba segura',
  contenido_prohibido: 'la respuesta propuesta no pasó el filtro',
  tipo_no_admitido: 'tipo de mensaje que no se contesta',
  no_comercial: 'no es una conversación de seguros',
}

/** Añadido al prompt de sistema SOLO cuando se le pide respuesta (si no, el prompt es el de siempre). */
export function sistemaRespuesta(o: { promesaAviso: boolean }): string {
  const aviso = o.promesaAviso
    ? '«Perfecto, tomo nota; le aviso antes del vencimiento»'
    : `«Perfecto, ${FRASE_SIN_PROMESA}» (NO prometas avisos ni recordatorios futuros)`
  return `

ADEMÁS devuelve el campo "respuesta": el mensaje de WhatsApp que se enviará TAL CUAL al Contacto en nombre de la correduría, contestando a su ÚLTIMO mensaje. Reglas de "respuesta":
- Español, de usted, 1 o 2 frases cortas, máximo 300 caracteres, sin emojis, sin saludo largo ni firma, sin nombres.
- Solo acuse + qué pasará después, sin comprometer nada. Ejemplos: ${aviso}; «Recibido, Alberto lo revisa y le dice algo».
- PROHIBIDO: precios, importes, porcentajes o descuentos; recomendar productos, compañías o coberturas; decir que un trámite (baja, anulación, cambio, pago, renovación) está hecho o confirmado; pedir o repetir DNI, IBAN, cuentas, direcciones, matrículas o números de póliza; datos de otras personas; enlaces; los marcadores [NOMBRE], [DNI]….
- Si pide una baja o no renovar: no la confirmes; di solo que Alberto la gestiona.
- Si no estás SEGURO de qué contestar, o el mensaje no necesita respuesta, o no es de seguros: "respuesta": null.`
}
