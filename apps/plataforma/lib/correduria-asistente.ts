// Asistente de la CORREDURÍA por Telegram (fase 1, 26/09/2026) — parte PURA (sin `@/` ni prisma →
// node --test). Alberto le pregunta por clientes, pólizas, vencimientos o impagados y el asistente
// contesta leyendo la cartera por el puerto de asegura. Solo habla con Alberto. Lo que escribe en la
// cartera (emitir, corregir la ficha, abrir una oportunidad) lo PROPONE y lo aplica Alberto con un botón.
//
// Tres reglas de la casa que viven aquí y no en el prompt, porque un prompt se puede saltar:
// - Lo que NO trae una herramienta es «no consta», nunca «no tiene» (dato no mirado ≠ dato que no hay).
// - DNI/NIE, IBAN y tarjetas salen ENMASCARADOS hacia Telegram y hacia la IA.
// - Lo que aprende son PREFERENCIAS de trabajo; los datos de un cliente van a la cartera, no a su memoria.

// ── ¿Es un mensaje para la correduría? ───────────────────────────────────────────────────────────

/** Atajo explícito: `seguro: …`, `seguros …`, `/seguros …`, `correduría: …`. Siempre gana. */
const PREFIJO = /^\s*(?:\/seguros?\b|seguros?\s*[:,]|correduri[aá]\s*[:,])/i

/** Palabras que solo tienen sentido en la correduría (el contable no las maneja). */
const PROPIAS = /\b(p[oó]lizas?|siniestros?|renovaci(?:[oó]n|ones)|tomador(?:es)?|asegurad[oa]s?|retarific\w*|codeoscopic|avant2|cima|eiac|tirea|coberturas?|franquicia|carta verde|anulaci[oó]n(?:es)? de p[oó]liza|oportunidad(?:es)?|leads?|impagad\w*|recibos? devuelt\w*|vencimientos?|mapfre|allianz|occident|reale|generali|axa|l[ií]nea directa|mutua madrile\w+|pelayo|liberty|zurich|santa ?luc[ií]a|helvetia|fiatc|asisa|sanitas|adeslas|dkv|fidelidade)\b/i

/** Matrícula española moderna (1234ABC / 1234 ABC). Un gasto no se pregunta por matrícula. */
const MATRICULA = /\b\d{4}\s?[B-DF-HJ-NP-TV-Z]{3}\b/i

/** Palabras del mundo contable: si aparecen y ninguna propia, el mensaje es del contable. */
const CONTABLES = /\b(gast[oéa]\w*|factura\w*|ingres\w*|movimient\w*|cargo\w*|banco|kutxa|bbva|irpf|hacienda|iva|modelo \d{3}|tarjeta|n[oó]mina|luz|agua|internet|netflix|pisos?|reservas?|booking|airbnb|hu[eé]sped\w*|amortiz\w*|deducci\w*|presupuesto|saldo)\b/i

export type Destino = 'correduria' | 'contable' | 'dudoso'

/**
 * Reparto del texto libre entre el asistente de la correduría y el contable. Determinista y
 * testeado; solo lo `dudoso` (p. ej. «¿qué tiene Pablo Guzmán?») pasa por la IA clasificadora.
 */
export function clasificarDestino(texto: string): Destino {
  const t = texto.trim()
  if (!t) return 'contable'
  if (PREFIJO.test(t)) return 'correduria'
  if (PROPIAS.test(t)) return 'correduria'
  // Lo contable ANTES que la matrícula: «1500 kWh» o «2000 BTC» parecen una matrícula y no lo son.
  if (CONTABLES.test(t)) return 'contable'
  if (MATRICULA.test(t)) return 'correduria'
  return 'dudoso'
}

/** ¿Lleva el atajo explícito? Con el asistente apagado, así se sabe a quién decirle que lo está. */
export function tienePrefijo(texto: string): boolean {
  return PREFIJO.test(texto)
}

/** La pregunta sin el atajo delante. */
export function sinPrefijo(texto: string): string {
  return texto.trim().replace(PREFIJO, '').trim()
}

/** Prompt de la IA clasificadora: una palabra. Ante cualquier otra cosa, el contable (lo de siempre). */
export const SYSTEM_CLASIFICADOR = [
  'Clasifica el mensaje de Alberto en UNA palabra:',
  '- correduria: pregunta por un cliente, una persona, una póliza, un seguro, un vehículo o algo de su correduría de seguros.',
  '- contable: dinero propio, gastos, ingresos, bancos, impuestos, facturas o sus pisos turísticos.',
  'Responde solo «correduria» o «contable».',
].join('\n')

export function leerClasificacion(respuesta: string | null | undefined): 'correduria' | 'contable' {
  return /corredur[ií]/i.test(respuesta ?? '') ? 'correduria' : 'contable'
}

// ── Enmascarado ──────────────────────────────────────────────────────────────────────────────────

/**
 * DNI/NIE → `…769Q`, IBAN → `ES…1234`, tarjeta → `…1234`. Se aplica a TODO lo que sale de una
 * herramienta antes de que lo vea la IA, y otra vez a la respuesta antes de Telegram (por si la
 * IA reconstruyera algo). El CIF de una empresa se deja: no es dato personal y sirve para buscar.
 */
export function enmascarar(texto: string): string {
  return texto
    .replace(/\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]{4}){4,7}(?:[ -]?[A-Z0-9]{1,3})?\b/g, (m) => {
      const limpio = m.replace(/[ -]/g, '')
      return `${limpio.slice(0, 2)}…${limpio.slice(-4)}`
    })
    // Solo si pasa el dígito de control (Luhn): un nº de póliza de 16 cifras no es una tarjeta.
    .replace(/\b(?:\d{4}[ -]?){3}\d{4}\b/g, (m) => {
      const d = m.replace(/[ -]/g, '')
      return luhn(d) ? `…${d.slice(-4)}` : m
    })
    .replace(/\b[XYZ]\d{7}[A-Z]\b/gi, (m) => `…${m.slice(-4)}`)
    .replace(/\b\d{8}[A-Z]\b/gi, (m) => `…${m.slice(-4)}`)
}

function luhn(digitos: string): boolean {
  let suma = 0
  for (let i = 0; i < digitos.length; i++) {
    let n = Number(digitos[digitos.length - 1 - i])
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9 }
    suma += n
  }
  return suma % 10 === 0
}

/**
 * JSON compacto, enmascarado y recortado para la IA. Los `null` SE QUEDAN: son «no consta», y
 * quitarlos haría que un campo desconocido desapareciera. El corte se DICE.
 */
export function paraIA(valor: unknown, max = 7000): string {
  let s: string
  try { s = JSON.stringify(valor) ?? 'null' } catch { s = String(valor) }
  s = enmascarar(s)
  return s.length > max ? `${s.slice(0, max)}… [RECORTADO: hay más datos que no caben; dilo si importa]` : s
}

// ── Herramientas ─────────────────────────────────────────────────────────────────────────────────

export type NombreHerramienta =
  | 'buscar' | 'ficha_cliente' | 'ficha_poliza' | 'vencimientos' | 'impagados'
  | 'anulaciones_pendientes' | 'proponer_regla' | 'listar_reglas' | 'olvidar_regla' | 'preparar_emision'
  | 'proponer_correccion' | 'proponer_oportunidad' | 'mi_dia' | 'oportunidades_cliente'

const fn = (name: NombreHerramienta, description: string, properties: Record<string, unknown> = {}, required: string[] = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
})

export const HERRAMIENTAS = [
  fn('buscar', 'Busca en la cartera por nombre, DNI, teléfono, email, matrícula, número de póliza o dirección. Devuelve clientes con su clienteId. Úsala SIEMPRE antes de ficha_cliente si no tienes el id.',
    { q: { type: 'string', description: 'Término a buscar' } }, ['q']),
  fn('ficha_cliente', 'Ficha completa de un cliente: datos, pólizas (con su polizaId interno), siniestros, contactos y relaciones. Sus oportunidades y tareas NO vienen aquí: usa oportunidades_cliente.',
    { clienteId: { type: 'string' } }, ['clienteId']),
  fn('ficha_poliza', 'Ficha de una póliza: coberturas, recibos, siniestros e historial.',
    { polizaId: { type: 'string' } }, ['polizaId']),
  fn('vencimientos', 'Pólizas que vencen en los próximos N días (máx. 120).',
    { dias: { type: 'integer', description: 'Días hacia delante (1-120)' } }, ['dias']),
  fn('mi_dia', 'Lo que Alberto tiene que hacer HOY en la correduría: tareas de sus oportunidades (vencidas y de hoy), llamadas de renovación que tocan y siniestros abiertos. Úsala para «¿qué tengo hoy?», «¿a quién llamo?», «¿qué hay pendiente?».'),
  fn('oportunidades_cliente', 'Oportunidades de venta (leads) de un cliente: ramo, estado, compañía y prima actuales, vencimiento y su próximo paso.',
    { clienteId: { type: 'string' } }, ['clienteId']),
  fn('impagados', 'Recibos sin cobrar y pólizas en riesgo (cola de retención), con resumen.'),
  fn('anulaciones_pendientes', 'Pólizas sustituidas por otra de otra compañía cuya anulación sigue pendiente.'),
  fn('proponer_regla', 'Propón guardar una PREFERENCIA de trabajo de Alberto (cómo quiere las respuestas o un criterio del negocio). NUNCA datos de un cliente concreto. Alberto la confirma con un botón.',
    { regla: { type: 'string', description: 'La regla, en una frase' } }, ['regla']),
  fn('listar_reglas', 'Lista las reglas que ya has aprendido, con su número.'),
  fn('olvidar_regla', 'Olvida una regla aprendida por su número.',
    { numero: { type: 'integer' } }, ['numero']),
  fn('preparar_emision', 'Prepara la EMISIÓN de un precio que Alberto ya confirmó en la web de Avant2 para una póliza de la cartera. NO emite: el sistema le manda a Alberto un resumen con un botón y es él quien pulsa. Si el proyecto tiene varios precios emitibles te devuelve la lista para que le preguntes cuál (y vuelves a llamar con quoteId).',
    {
      polizaId: { type: 'string', description: 'El polizaId INTERNO (uuid) de la póliza que se sustituye, sacado de ficha_cliente. NO el número de póliza de la compañía.' },
      projectId: { type: 'string', description: 'Número del proyecto de Avant2 (solo cifras)' },
      quoteId: { type: 'string', description: 'Opcional: el precio elegido (Q…) cuando hay varios' },
    }, ['polizaId', 'projectId']),
  fn('proponer_correccion', 'Propón CORREGIR la ficha de un cliente con los valores que Alberto te ha DICTADO en esta conversación (dirección, código postal, ciudad, provincia, nombre o apellidos). NO escribe: el sistema le manda el cambio con un botón y es él quien lo aplica. Pasa solo los campos que cambian, tal cual los dijo; nunca inventes ni completes un valor.',
    {
      clienteId: { type: 'string', description: 'La ficha a corregir (sácala de buscar o ficha_cliente)' },
      direccion: { type: 'string', description: 'Calle, número, piso y puerta' },
      codigoPostal: { type: 'string' },
      ciudad: { type: 'string' },
      provincia: { type: 'string' },
      nombre: { type: 'string', description: 'Solo si Alberto corrige el nombre (exige DNI archivado en la ficha)' },
      apellidos: { type: 'string', description: 'Solo si Alberto corrige los apellidos (exige DNI archivado en la ficha)' },
    }, ['clienteId']),
  fn('proponer_oportunidad', 'Propón ABRIR una oportunidad de venta (lead) para un cliente o lead de la cartera: p. ej. Alberto sube la póliza que tiene con otra compañía y dice «añádelo a oportunidades». NO escribe: el sistema le manda el resumen con un botón y es él quien la abre. Con usarDocumentos=true lee los documentos que Alberto ha subido al chat en la última hora (ramo, compañía, vencimiento, prima, nº de póliza). Lo que Alberto dicte manda sobre lo leído; nunca inventes un valor.',
    {
      clienteId: { type: 'string', description: 'La ficha (sácala de buscar). Si no sabes de quién es, pregúntaselo a Alberto.' },
      usarDocumentos: { type: 'boolean', description: 'true si Alberto se refiere a lo que acaba de subir' },
      ramo: { type: 'string', enum: ['auto', 'moto', 'hogar', 'vida', 'salud', 'decesos', 'responsabilidad_civil', 'comercio', 'comunidades', 'accidentes', 'otros'] },
      compania: { type: 'string', description: 'Compañía con la que está ahora' },
      prima: { type: 'number', description: 'Prima anual actual en euros' },
      vence: { type: 'string', description: 'Vencimiento de su póliza actual (aaaa-mm-dd)' },
      numeroPoliza: { type: 'string' },
      fechaPrimerPaso: { type: 'string', description: 'Solo si Alberto dice cuándo llamarle (aaaa-mm-dd)' },
    }, ['clienteId']),
] as const

/** Argumentos de una llamada, parseados sin lanzar. `null` = la IA mandó basura. */
export function leerArgumentos(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) return {}
  try {
    const v = JSON.parse(raw)
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch { return null }
}

export function diasValidos(v: unknown): number {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(120, Math.max(1, n)) : 30
}

/** Id de cliente/póliza: uuid. Evita que la IA meta una ruta o un nombre en la URL del puerto. */
export const ERROR_NO_UUID = 'ERROR: eso no es un id interno. Parece un número de póliza o un nombre: usa buscar/ficha_cliente y pasa el polizaId/clienteId (uuid) que devuelven.'

export function idValido(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s.toLowerCase() : null
}

/** Una regla que es en realidad un dato de cliente (DNI, teléfono, IBAN, email, matrícula) no se guarda. */
export function reglaConDatoPersonal(regla: string): boolean {
  return /\b\d{8}[A-Z]\b|\b[XYZ]\d{7}[A-Z]\b|\b[A-Z]{2}\d{2}\s?\d{4}|[\w.+-]+@[\w-]+\.[\w.]+|\b[6-9]\d{2}\s?\d{3}\s?\d{3}\b/i.test(regla)
    || MATRICULA.test(regla)
}

// ── Prompt ───────────────────────────────────────────────────────────────────────────────────────

export function systemAsistente(reglas: readonly string[], hoyIso: string): string {
  const l = [
    'Eres el asistente de la correduría de seguros de Alberto (Grupo ASegura). Hablas SOLO con Alberto, por Telegram.',
    `Hoy es ${hoyIso}.`,
    'Reglas ESTRICTAS:',
    '- Responde SOLO con lo que devuelvan las herramientas. Si un dato no aparece, di «no consta» o «no lo tengo»; NUNCA digas que no existe, NUNCA lo inventes ni lo estimes.',
    '- Si una herramienta falla o devuelve error, dilo: «no he podido leer X ahora mismo». Un fallo NO es «no hay nada».',
    '- Un campo a null significa «no consta / no se sabe», nunca 0 ni «no tiene». Si una lista trae `total` mayor que las filas que ves, di que hay más.',
    '- Si una búsqueda da varios clientes posibles, enuméralos y pregunta cuál; no elijas tú.',
    '- Para «¿qué tengo hoy?», «¿a quién llamo?» o «¿qué hay pendiente?» usa mi_dia. Las oportunidades de un cliente, con oportunidades_cliente.',
    '- La búsqueda por DNI, teléfono o email solo alcanza a una parte de las fichas (lo dice cada bloque): si no aparece, di que no lo encuentras por ese dato y prueba por nombre o matrícula; NUNCA digas que no es cliente.',
    '- Tú no mandas mensajes a clientes ni anulas pólizas: eso se hace en la intranet (/correduria). Lo único que puedes tocar de la cartera es PROPONER una corrección de la ficha con proponer_correccion (dirección, CP, ciudad, provincia, nombre o apellidos), solo con valores que Alberto te haya dicho, o abrir una oportunidad (abajo); él lo aplica con el botón. NUNCA digas que la ficha está corregida antes de que lo confirme el sistema. DNI, fecha de nacimiento, teléfonos, emails e IBAN se cambian en la ficha.',
    '- Oportunidades: puedes PROPONER abrir una con proponer_oportunidad (lead o cliente que tiene un seguro con otra compañía). Si Alberto habla de un documento que acaba de subir, pasa usarDocumentos=true. Necesitas la ficha: si no sabes de quién es, pregúntale el nombre y búscalo; si no tiene ficha, dile que la cree en /correduria. NUNCA digas que está abierta: eso solo lo confirma el sistema tras el botón.',
    '- Emitir: solo puedes PREPARAR una emisión con preparar_emision (necesitas la póliza y el número del proyecto de Avant2; pídeselos si faltan). El sistema le manda a Alberto el resumen con el botón y es él quien emite. NUNCA digas que una póliza está emitida: eso solo lo confirma el sistema tras el botón.',
    '- Los DNI, IBAN y tarjetas llegan enmascarados; no intentes reconstruirlos.',
    '- Aprende PREFERENCIAS: cuando Alberto te corrija o te diga cómo quiere algo «siempre», usa proponer_regla. Los datos de un cliente (teléfono, email, dirección…) NO son reglas: dile que los cambie en la ficha.',
    '- Estilo: español, breve (es un chat de móvil), sin markdown ni tablas. Importes en formato español (2.162,49€). Fechas dd/mm/aaaa.',
  ]
  if (reglas.length) {
    l.push('', 'Preferencias que Alberto te ha enseñado (cúmplelas):')
    reglas.forEach((r, i) => l.push(`${i + 1}. ${r}`))
  }
  return l.join('\n')
}

// ── Límites ──────────────────────────────────────────────────────────────────────────────────────

/** Vueltas máximas del bucle herramienta→IA por pregunta. Una pregunta normal usa 2-3. */
export const MAX_VUELTAS = 7
/** Preguntas máximas al día: tope duro contra un bucle o un reenvío masivo, aparte del tope en €. */
export const MAX_TURNOS_DIA = 150
/** Días que se guarda el TEXTO de preguntas y respuestas; después queda solo el rastro de acceso. */
export const DIAS_RETENCION_TEXTO = 90

/** ¿El interruptor de apagado está echado? Cualquier valor «sí» en `CORREDURIA_ASISTENTE_APAGADO`. */
export function apagado(valor: string | undefined): boolean {
  return /^(1|true|s[ií]|on|apagado)$/i.test((valor ?? '').trim())
}

/** Texto del botón de feedback y del force_reply que liga la nota con su turno. */
export function preguntaNota(turnoId: number): string {
  return `👎 ¿Qué ha fallado? Respóndeme a este mensaje y lo apunto — asistente seguros · turno ${turnoId}`
}

export function turnoDeNota(textoCitado: string): number | null {
  const m = textoCitado.match(/asistente seguros · turno (\d+)/)
  return m ? Number(m[1]) : null
}

/**
 * Lo que queda en el rastro de acceso de cada consulta. Los ids y los días se guardan; el TEXTO
 * libre (lo que se buscó, la regla propuesta) no, porque sobreviviría a la purga de 90 días con el
 * mismo dato personal que la pregunta borrada.
 */
export function rastroArgs(nombre: string, args: Record<string, unknown> | null): Record<string, unknown> {
  if (!args) return {}
  if (nombre === 'buscar') return { q: '[búsqueda]' }
  if (nombre === 'proponer_regla') return { regla: '[texto]' }
  if (nombre === 'proponer_correccion') {
    // Qué campos se tocaron, nunca sus valores: una dirección o un apellido son datos personales.
    return { clienteId: args.clienteId, campos: Object.keys(args).filter((k) => k !== 'clienteId') }
  }
  if (nombre === 'proponer_oportunidad') {
    // El ramo y si usó documentos, sí; compañía, prima o nº de póliza, no (son del contrato de un tercero).
    return { clienteId: args.clienteId, ramo: args.ramo, usarDocumentos: args.usarDocumentos === true, campos: Object.keys(args).filter((k) => k !== 'clienteId') }
  }
  const fuera: Record<string, unknown> = {}
  for (const k of ['clienteId', 'polizaId', 'dias', 'numero', 'projectId', 'quoteId']) if (k in args) fuera[k] = args[k]
  return fuera
}

/** Precio por 1.000 tokens cuando el catálogo no conoce el modelo: alto a propósito, para que el tope salte antes. */
export const PRECIO_CONSERVADOR_1K = 0.001

export function costeConservador(tokens: number): number {
  return +((Math.max(0, tokens) * PRECIO_CONSERVADOR_1K) / 1000).toFixed(6)
}

// ── Conversación ─────────────────────────────────────────────────────────────────────────────────

/**
 * ¿Es la RESPUESTA (reply) de Alberto a un mensaje de la correduría? Deslizar sobre una respuesta 🛡️
 * o sobre un aviso de seguros y escribir («¿y su mujer?») se perdía: el webhook descartaba todo reply
 * que no fuera de un flujo conocido. Solo cuenta lo que el propio bot dijo de la correduría.
 */
export function esRespuestaACorreduria(citado: string): boolean {
  const t = citado.trim()
  if (!t) return false
  if (/^(?:🛡️|🛡|🎯|✏️|🚀)/u.test(t)) return true
  return clasificarDestino(t) === 'correduria'
}

/** La pregunta con el mensaje al que responde, para que la IA sepa de qué se habla. */
export function conCita(texto: string, citado: string): string {
  const c = citado.trim().replace(/\s+/g, ' ').slice(0, 600)
  return c ? `${texto.trim()}\n\n(Responde a este mensaje tuyo: «${c}»)` : texto.trim()
}

type RastroGuardado = { nombre?: unknown; args?: unknown; ok?: unknown }

/**
 * Los ids que ya salieron en las consultas recientes (cliente, póliza, proyecto, precio). Sin esto,
 * cada mensaje («la Mapfre», «anual», «1») obligaba a la IA a buscar al cliente otra vez desde cero:
 * el historial guardaba el texto, no los ids. Solo los de llamadas que funcionaron, y validados.
 */
export function memoriaIds(rastros: readonly unknown[]): string | null {
  const vistos = new Map<string, Set<string>>()
  const poner = (k: string, v: unknown) => {
    const s = typeof v === 'string' ? v.trim() : ''
    const valido = k === 'projectId' ? /^\d{4,12}$/.test(s) : k === 'quoteId' ? /^Q\d{4,15}$/.test(s) : idValido(s) !== null
    if (!valido) return
    if (!vistos.has(k)) vistos.set(k, new Set())
    vistos.get(k)!.add(s)
  }
  for (const r of rastros) {
    if (!Array.isArray(r)) continue
    for (const x of r as RastroGuardado[]) {
      if (!x || x.ok !== true || typeof x.args !== 'object' || x.args === null) continue
      const a = x.args as Record<string, unknown>
      for (const k of ['clienteId', 'polizaId', 'projectId', 'quoteId']) poner(k, a[k])
    }
  }
  if (vistos.size === 0) return null
  const partes = [...vistos].map(([k, v]) => `${k}: ${[...v].slice(-3).join(', ')}`)
  return `Ids ya consultados en esta conversación (reutilízalos en vez de volver a buscar si hablamos de lo mismo): ${partes.join(' · ')}`
}

/** La fecha de hoy en Madrid (aaaa-mm-dd). `toISOString()` da el día anterior entre las 00:00 y las 02:00. */
export function hoyMadrid(ahora: Date = new Date()): string {
  return ahora.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}
