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
//   · Alberto no ha escrito desde el móvil en las últimas 4 h (está en la conversación aunque el cliente conteste después);
//   · la IA eligió una FRASE de la lista cerrada (null = no está segura → solo Telegram) y el texto montado pasa el FILTRO.
// LISTA CERRADA (revisión adversarial PR #5528): la IA NO redacta texto libre; elige un id de `FRASES` (aprobadas) y la
// única variable es el NOMBRE DE PILA de la ficha, que pone el servidor. El filtro de contenido queda como segunda capa.
// Bajas / oposición a la prórroga: NUNCA «hecho»; frase FIJA («Alberto lo gestiona») + Telegram urgente (art. 22 LCS).
// Opt-out de los MENSAJES («no me escribáis», «stop»): confirmación fija una vez + `wa_opt_out_at`; si se mezcla con una baja
// de póliza (ambiguo) no se contesta y se avisa por Telegram.

export const VENTANA_MS = 24 * 60 * 60 * 1000
/** Margen de seguridad para no rozar el cierre de la ventana de 24 h de Meta (el envío tarda y el reloj difiere). */
export const MARGEN_VENTANA_MS = 30 * 60 * 1000
export const MAX_RESPUESTAS_CONVERSACION_DIA = 3
export const MAX_RESPUESTAS_DIA = 40
export const MAX_CARACTERES_RESPUESTA = 400
/** Si Alberto escribió desde el móvil en estas horas, él está en la conversación: la IA calla. */
export const HORAS_SILENCIO_TRAS_ALBERTO = 4
/** Tipos de entrante a los que solo se contesta con el acuse genérico (no se interpreta su contenido). */
export const TIPOS_ACUSE = ['image', 'document', 'audio', 'voice', 'video'] as const

// ── Lista CERRADA de frases aprobadas (la IA solo elige el id) ─────────────────────
// `{nombre}` = nombre de pila de la FICHA (lo pone el servidor; sin nombre válido se quita con su coma).
export const FRASES = {
  acuse: 'Recibido{nombre}, muchas gracias. Alberto lo revisa y le dice algo.',
  nota_fecha: 'Perfecto{nombre}, tomo nota. Alberto se lo revisa antes del vencimiento.',
  alberto_revisa: 'Gracias{nombre}. Alberto lo revisa y le contesta en cuanto pueda.',
  pedir_poliza: 'Si quiere que le preparemos un presupuesto, envíenos por aquí una foto de su póliza actual y Alberto lo revisa.',
  saludo: 'Gracias a usted{nombre}, un saludo.',
  baja: 'Recibido. Las bajas las gestiona Alberto personalmente y se pondrá en contacto con usted. Hasta entonces su póliza sigue igual.',
  // SOLO el servidor las pone (cliente con ficha única que cuenta un percance). Nunca afirman cobertura ni dicen «siniestro»
  // (el filtro lo prohíbe). `{telefono}` = teléfono de la compañía de SU póliza, del catálogo verificado, validado aparte.
  siniestro_asistencia: 'Lamentamos lo ocurrido{nombre}. Puede llamar ya al {telefono}, el teléfono de atención de su póliza. Alberto también le llama en cuanto pueda.',
  siniestro_alberto: 'Lamentamos lo ocurrido{nombre}. Alberto le llama ahora.',
} as const
/** Solo con `avisoVencimientoDisponible()` (aviso por plantilla encendido): la única frase que promete un aviso. */
export const FRASE_NOTA_FECHA_AVISO = 'Perfecto{nombre}, tomo nota. Le avisaremos antes del vencimiento.'
/** Confirmación del opt-out de MENSAJES (la pone el servidor, nunca la IA). Una sola vez: tras ella no se reclama más. */
export const CONFIRMACION_OPT_OUT = 'Entendido, no le volveremos a escribir por aquí. Si necesita algo, escríbanos cuando quiera.'
export type IdFrase = keyof typeof FRASES
export const IDS_FRASE = Object.keys(FRASES) as IdFrase[]
/** Frases que la IA NO puede elegir: las pone el servidor según el contenido (baja, percance). */
export const IDS_SOLO_SERVIDOR: readonly IdFrase[] = ['baja', 'siniestro_asistencia', 'siniestro_alberto']

const NOMBRE_PILA = /^[\p{L}][\p{L}'-]{1,29}$/u

/** El nombre de pila de la ficha, solo si parece un nombre (una palabra de letras); si no, null. PURO. */
export function nombrePilaSeguro(nombre: string | null | undefined): string | null {
  const primera = (nombre ?? '').trim().split(/\s+/)[0] ?? ''
  if (!NOMBRE_PILA.test(primera) || /^(sin|nombre|cliente|lead)$/i.test(primera)) return null
  return primera.charAt(0).toUpperCase() + primera.slice(1).toLowerCase()
}

/** Monta una frase de la lista con el nombre de pila (o sin él). */
export function montarFrase(plantilla: string, nombrePila: string | null): string {
  return plantilla.replace('{nombre}', nombrePila ? `, ${nombrePila}` : '')
}

/** Compatibilidad: acuse de media y frase de baja (las usa también el Telegram y los tests). */
export const ACUSE_GENERICO = montarFrase(FRASES.acuse, null)
export const RESPUESTA_BAJA = FRASES.baja

export type MotivoNoResponder =
  | 'flag_apagado' | 'sin_ficha_unica' | 'tipo_ficha' | 'conversacion_no_abierta' | 'opt_out' | 'silenciada'
  | 'sin_entrante' | 'ultimo_no_es_entrante' | 'entrante_historial' | 'fuera_de_ventana' | 'ya_respondida'
  | 'alberto_lleva_conversacion' | 'sin_saliente_previo' | 'tope_conversacion' | 'tope_diario' | 'tipo_no_admitido'
  | 'no_comercial' | 'ia_no_segura' | 'contenido_prohibido' | 'sin_migracion' | 'alberto_reciente' | 'opt_out_ambiguo'

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
  /** El echo más reciente de ALBERTO (escrito desde el móvil; `rol = 'corredor'`). null = ninguno. */
  ultimoSalienteHumano: Date | null
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
  if (e.ultimoSalienteHumano && e.ahora.getTime() - e.ultimoSalienteHumano.getTime() < HORAS_SILENCIO_TRAS_ALBERTO * 3_600_000) {
    return no('alberto_reciente')
  }
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
  // «Su siniestro está aprobado», «la grúa está incluida», «sigue cubierto»: afirmar cobertura o resultado también compromete.
  { motivo: 'cobertura_afirmada', re: /\b(aprobad[oa]s?|autorizad[oa]s?|aceptad[oa]s?|incluid[oa]s?|cubiert[oa]s?|cubre|cubren|siniestro|siniestros|indemniz\w*|peritaje|perito|grua|reparacion)\b/ },
  { motivo: 'precio_en_letra', re: /\b(cien|ciento|doscient\w*|trescient\w*|cuatrocient\w*|quinient\w*|seiscient\w*|setecient\w*|ochocient\w*|novecient\w*|mil|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|gratis|pagar|pague|cobrar|cobro|cargo|recibo)\b/ },
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

// ── Opt-out de los MENSAJES (≠ baja de la póliza) ─────────────────────────────────

const OPT_OUT = /\b(no (me|nos) (vuelva[ns]? a |volvais a )?(escrib(a|an|ais|as|ir)|mand(e|en|eis|es|ar)|envi(e|en|eis|es|ar)|contact(e|en|eis|es|ar)|molest(e|en|eis|es|ar)) (mas|nada|por aqui|por whatsapp|por este medio)|no (me|nos) (escrib(an|ais)|contact(en|eis)|molest(en|eis))(?=\s*([.!,;]|$))|no quiero (recibir )?(mas )?(avisos|mensajes|whatsapps?|publicidad|recordatorios)|(de )?baja de (los |estos )?(avisos|mensajes|whatsapps?|recordatorios|publicidad)|dej(a|ad|en|e) de (escribir\w*|mandar\w*|enviar\w*)|stop|basta de mensajes)\b/g

export type OptOut = 'opt_out' | 'ambiguo' | null

/**
 * ¿Pide que no le escribamos? `opt_out` = claro; `ambiguo` = además habla de dar de baja la PÓLIZA (o la IA lo leyó
 * como baja): no se contesta nada y decide Alberto; null = no lo pide. PURO.
 */
export function clasificarOptOut(intencion: string | null | undefined, textoEntrante: string | null | undefined): OptOut {
  const llano = quitarTildes((textoEntrante ?? '').toLowerCase())
  if (!OPT_OUT.test(llano)) return null
  OPT_OUT.lastIndex = 0
  const resto = llano.replace(OPT_OUT, ' ')
  OPT_OUT.lastIndex = 0
  return intencion === 'baja' || BAJA.test(resto) ? 'ambiguo' : 'opt_out'
}


// ── Siniestro / avería (04/11/2026): frase con el teléfono de SU compañía, o «Alberto le llama» ──────────────────

const NEGA_SINIESTRO = /\b(ningun[oa]?|nunca|sin|cubr\w*|cobertur\w*|incluy\w*|incluid\w*)\b/
const PERCANCE = /\b(siniestro|accidente|accidentad[oa]|choque|chocado|chocar|colision\w*|inundacion|inundad[oa]|averia\w*|incendio|fuga de agua|me han robado|robo|grua)\b/

/** ¿Cuenta un percance? La intención de la IA O palabras claras sin negación ni pregunta de cobertura. PURO. */
export function esSiniestro(intencion: string | null | undefined, textoEntrante: string | null | undefined): boolean {
  if (intencion === 'siniestro') return true
  const llano = quitarTildes((textoEntrante ?? '').toLowerCase())
  return PERCANCE.test(llano) && !NEGA_SINIESTRO.test(llano)
}

/** Ramo que se deduce del texto (solo si es inequívoco); null = no se sabe. PURO. */
export function ramoDePercance(textoEntrante: string | null | undefined): 'auto' | 'moto' | 'hogar' | null {
  const llano = quitarTildes((textoEntrante ?? '').toLowerCase())
  const moto = /\bmoto\b/.test(llano)
  const auto = /\b(coche|choque|chocado|chocar|colision\w*|grua|vehiculo|carretera|furgoneta)\b/.test(llano)
  const hogar = /\b(inundacion|inundad[oa]|fuga|humedad|gotera\w*|casa|piso|vivienda|incendio|cocina|bano|agua)\b/.test(llano)
  const ramos = [moto && 'moto', auto && !moto && 'auto', hogar && 'hogar'].filter(Boolean) as ('auto' | 'moto' | 'hogar')[]
  return ramos.length === 1 ? ramos[0] : null
}

/** Teléfono apto para ir en un mensaje: 9-12 dígitos, solo dígitos, espacios y un «+» inicial. PURO. */
export function telefonoApto(t: unknown): string | null {
  if (typeof t !== 'string') return null
  const v = t.trim()
  if (!/^\+?[0-9][0-9 ]{6,16}[0-9]$/.test(v)) return null
  const digitos = v.replace(/\D/g, '').length
  return digitos >= 9 && digitos <= 12 ? v : null
}

export type PolizaCandidataSiniestro = { tipo: string; aseguradora: string | null; codigoDgs: string | null }

/**
 * El teléfono de la compañía de la ÚNICA póliza en vigor candidata, o null (sin dato fiable o varias candidatas → la
 * frase «Alberto le llama»). `ramo` restringe las candidatas (producto de la IA o deducido del texto). `buscar` = catálogo
 * verificado (inyectado). Con el ramo conocido y ninguna póliza de ese ramo → null. PURO.
 */
export function elegirTelefonoSiniestro(
  candidatas: readonly PolizaCandidataSiniestro[] | null,
  ramo: string | null,
  buscar: (codigoDgs: string | null, aseguradora: string | null) => string | null,
): string | null {
  if (candidatas === null) return null
  const aptas = ramo ? candidatas.filter((c) => c.tipo === ramo) : candidatas
  if (aptas.length !== 1) return null
  return telefonoApto(buscar(aptas[0].codigoDgs, aptas[0].aseguradora))
}

export type DecisionRespuesta =
  | { enviar: true; texto: string; clase: 'ia' | 'acuse' | 'baja' | 'opt_out'; frase: IdFrase | 'opt_out' }
  | { enviar: false; motivo: MotivoNoResponder; detalle?: string }

/**
 * Tras la IA: qué se envía. `respuestaIA` llega SIN validar: debe ser un id de `FRASES` (o null). Orden: opt-out (fijo,
 * ambiguo = nada), baja (fija), acuse de media (fijo), y la frase elegida. TODO texto montado pasa además el filtro.
 */
export function decidirRespuesta(p: {
  esComercial: boolean
  descartaPersonal: boolean
  baja: boolean
  /** Cuenta un percance (ficha única): `telefono` ya elegido por el servidor (o null = «Alberto le llama»). */
  siniestro?: { telefono: string | null } | null
  optOut?: OptOut
  tipoEntrante: string
  respuestaIA: unknown
  promesaAviso: boolean
  nombrePila?: string | null
  redactar: (s: string) => string
}): DecisionRespuesta {
  if (p.optOut === 'ambiguo') return { enviar: false, motivo: 'opt_out_ambiguo' }
  if (p.optOut === 'opt_out') return conFiltro(CONFIRMACION_OPT_OUT, 'opt_out', 'opt_out', p)
  if (!p.esComercial || p.descartaPersonal) return { enviar: false, motivo: 'no_comercial' }
  // null = la IA no está segura: nada sale, ni siquiera la frase fija (lo decide Alberto con el aviso).
  if (p.respuestaIA === null || p.respuestaIA === undefined) return { enviar: false, motivo: 'ia_no_segura' }
  const nombre = nombrePilaSeguro(p.nombrePila)
  if (p.baja) return conFiltro(FRASES.baja, 'baja', 'baja', p)
  if (p.siniestro && p.tipoEntrante === 'text') return decidirSiniestro(p.siniestro.telefono, nombre, p)
  if (p.tipoEntrante !== 'text') {
    return (TIPOS_ACUSE as readonly string[]).includes(p.tipoEntrante)
      ? conFiltro(montarFrase(FRASES.acuse, nombre), 'acuse', 'acuse', p)
      : { enviar: false, motivo: 'tipo_no_admitido' }
  }
  const id = typeof p.respuestaIA === 'string' ? p.respuestaIA.trim() : ''
  if (!(IDS_FRASE as string[]).includes(id)) return { enviar: false, motivo: 'contenido_prohibido', detalle: 'fuera_de_lista' }
  // La baja SOLO la pone el servidor (texto/intención): elegida por la IA sin serlo, no se manda.
  if (id === 'baja') return { enviar: false, motivo: 'contenido_prohibido', detalle: 'baja_sin_baja' }
  if ((IDS_SOLO_SERVIDOR as string[]).includes(id)) return { enviar: false, motivo: 'contenido_prohibido', detalle: 'siniestro_sin_siniestro' }
  const plantilla = id === 'nota_fecha' && p.promesaAviso ? FRASE_NOTA_FECHA_AVISO : FRASES[id as IdFrase]
  return conFiltro(montarFrase(plantilla, nombre), 'ia', id as IdFrase, p)
}

/** Percance: con teléfono válido, la frase con él; si no, «Alberto le llama». El filtro mira la plantilla SIN el número. */
function decidirSiniestro(
  telefono: string | null,
  nombre: string | null,
  p: { promesaAviso: boolean; redactar: (s: string) => string },
): DecisionRespuesta {
  const tel = telefonoApto(telefono)
  if (tel === null) return conFiltro(montarFrase(FRASES.siniestro_alberto, nombre), 'ia', 'siniestro_alberto', p)
  const sonda = montarFrase(FRASES.siniestro_asistencia, nombre).replace('{telefono}', 'ese numero')
  const f = filtrarContenido(sonda, { promesaAviso: p.promesaAviso, redactar: p.redactar })
  if (!f.ok) return { enviar: false, motivo: 'contenido_prohibido', detalle: f.motivo }
  return { enviar: true, texto: f.texto.replace('ese numero', tel), clase: 'ia', frase: 'siniestro_asistencia' }
}

function conFiltro(
  texto: string,
  clase: 'ia' | 'acuse' | 'baja' | 'opt_out',
  frase: IdFrase | 'opt_out',
  p: { promesaAviso: boolean; redactar: (s: string) => string },
): DecisionRespuesta {
  // Segunda capa: una frase aprobada SIEMPRE pasa (lo fija un test); si un día no, no sale.
  const f = filtrarContenido(texto, { promesaAviso: p.promesaAviso, redactar: p.redactar })
  return f.ok ? { enviar: true, texto: f.texto, clase, frase } : { enviar: false, motivo: 'contenido_prohibido', detalle: f.motivo }
}

/** Línea del Telegram para un motivo de NO responder (sin datos personales). */
export const TEXTO_MOTIVO: Partial<Record<MotivoNoResponder, string>> = {
  ia_no_segura: 'la IA no estaba segura',
  contenido_prohibido: 'la respuesta propuesta no pasó el filtro',
  tipo_no_admitido: 'tipo de mensaje que no se contesta',
  no_comercial: 'no es una conversación de seguros',
  opt_out_ambiguo: 'pide que no le escribamos y además habla de baja de póliza: decide tú',
}

/** Añadido al prompt de sistema SOLO cuando se le pide respuesta (si no, el prompt es el de siempre). */
export function sistemaRespuesta(o: { promesaAviso: boolean }): string {
  const lista = IDS_FRASE.filter((id) => !(IDS_SOLO_SERVIDOR as string[]).includes(id))
    .map((id) => `  "${id}": «${montarFrase(id === 'nota_fecha' && o.promesaAviso ? FRASE_NOTA_FECHA_AVISO : FRASES[id], null)}»`)
    .join('\n')
  return `

ADEMÁS devuelve el campo "respuesta": el ID de UNA frase aprobada que se enviará al Contacto contestando a su ÚLTIMO mensaje, o null. NO redactes texto: solo el id (una cadena de esta lista):
${lista}
- "nota_fecha": si da una fecha (vencimiento, cobro…). "pedir_poliza": si quiere presupuesto o comparar y no ha mandado su póliza. "saludo": si solo da las gracias o se despide. "acuse"/"alberto_revisa": el resto de consultas que Alberto debe mirar.
- Si pide una baja o no renovar, o que no le escribamos: "respuesta": "acuse" (el sistema pone la frase correcta).
- Si cuenta un percance (accidente, avería, inundación, robo…): "intencion": "siniestro", "producto": el ramo si se sabe, y "respuesta": "acuse" (el sistema pone la frase y el teléfono correctos; tú nunca los escribes).
- Si no estás SEGURO, el mensaje no necesita respuesta, o no es de seguros: "respuesta": null.`
}
