// Asistente de la CORREDURÍA por Telegram (fase 1, 26/09/2026) — parte PURA (sin `@/` ni prisma →
// node --test). Alberto le pregunta por clientes, pólizas, vencimientos o impagados y el asistente
// contesta leyendo la cartera por el puerto de asegura. Fase 1 = SOLO LECTURA: no escribe en la
// cartera, no emite y no habla con nadie que no sea Alberto.
//
// Tres reglas de la casa que viven aquí y no en el prompt, porque un prompt se puede saltar:
// - Lo que NO trae una herramienta es «no consta», nunca «no tiene» (dato no mirado ≠ dato que no hay).
// - DNI/NIE, IBAN y tarjetas salen ENMASCARADOS hacia Telegram y hacia la IA.
// - Lo que aprende son PREFERENCIAS de trabajo; los datos de un cliente van a la cartera, no a su memoria.

// ── ¿Es un mensaje para la correduría? ───────────────────────────────────────────────────────────

/** Atajo explícito: `seguro: …`, `seguros …`, `/seguros …`, `correduría: …`. Siempre gana. */
const PREFIJO = /^\s*(?:\/seguros?\b|seguros?\s*[:,]|seguros\s|correduri[aá]\s*[:,])/i

/** Palabras que solo tienen sentido en la correduría (el contable no las maneja). */
const PROPIAS = /\b(p[oó]lizas?|siniestros?|renovaci(?:[oó]n|ones)|tomador(?:es)?|asegurad[oa]s?|retarific\w*|codeoscopic|avant2|cima|eiac|tirea|coberturas?|franquicia|carta verde|anulaci[oó]n(?:es)? de p[oó]liza)\b/i

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
  if (PROPIAS.test(t) || MATRICULA.test(t)) return 'correduria'
  if (CONTABLES.test(t)) return 'contable'
  return 'dudoso'
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
    .replace(/\b(?:\d{4}[ -]?){3}\d{4}\b/g, (m) => `…${m.replace(/[ -]/g, '').slice(-4)}`)
    .replace(/\b[XYZ]\d{7}[A-Z]\b/gi, (m) => `…${m.slice(-4)}`)
    .replace(/\b\d{8}[A-Z]\b/gi, (m) => `…${m.slice(-4)}`)
}

/** JSON compacto, enmascarado y recortado para la IA. El corte se DICE: un listado cortado no es completo. */
export function paraIA(valor: unknown, max = 7000): string {
  let s: string
  try { s = JSON.stringify(valor, (_k, v) => (v === null ? undefined : v)) ?? 'null' } catch { s = String(valor) }
  s = enmascarar(s)
  return s.length > max ? `${s.slice(0, max)}… [RECORTADO: hay más datos que no caben; dilo si importa]` : s
}

// ── Herramientas ─────────────────────────────────────────────────────────────────────────────────

export type NombreHerramienta =
  | 'buscar' | 'ficha_cliente' | 'ficha_poliza' | 'vencimientos' | 'impagados'
  | 'anulaciones_pendientes' | 'proponer_regla' | 'listar_reglas' | 'olvidar_regla'

const fn = (name: NombreHerramienta, description: string, properties: Record<string, unknown> = {}, required: string[] = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
})

export const HERRAMIENTAS = [
  fn('buscar', 'Busca en la cartera por nombre, DNI, teléfono, email, matrícula, número de póliza o dirección. Devuelve clientes con su clienteId. Úsala SIEMPRE antes de ficha_cliente si no tienes el id.',
    { q: { type: 'string', description: 'Término a buscar' } }, ['q']),
  fn('ficha_cliente', 'Ficha completa de un cliente: datos, pólizas (con polizaId), contactos y tareas.',
    { clienteId: { type: 'string' } }, ['clienteId']),
  fn('ficha_poliza', 'Ficha de una póliza: coberturas, recibos, siniestros e historial.',
    { polizaId: { type: 'string' } }, ['polizaId']),
  fn('vencimientos', 'Pólizas que vencen en los próximos N días (máx. 120).',
    { dias: { type: 'integer', description: 'Días hacia delante (1-120)' } }, ['dias']),
  fn('impagados', 'Recibos sin cobrar y pólizas en riesgo (cola de retención), con resumen.'),
  fn('anulaciones_pendientes', 'Pólizas sustituidas por otra de otra compañía cuya anulación sigue pendiente.'),
  fn('proponer_regla', 'Propón guardar una PREFERENCIA de trabajo de Alberto (cómo quiere las respuestas o un criterio del negocio). NUNCA datos de un cliente concreto. Alberto la confirma con un botón.',
    { regla: { type: 'string', description: 'La regla, en una frase' } }, ['regla']),
  fn('listar_reglas', 'Lista las reglas que ya has aprendido, con su número.'),
  fn('olvidar_regla', 'Olvida una regla aprendida por su número.',
    { numero: { type: 'integer' } }, ['numero']),
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
export function idValido(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : null
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
    '- Si una búsqueda da varios clientes posibles, enuméralos y pregunta cuál; no elijas tú.',
    '- Fase de SOLO LECTURA: no puedes emitir, modificar la cartera, anular ni enviar nada a nadie. Si te lo piden, di que eso se hace en la intranet (/correduria) y resume qué habría que hacer.',
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
export const MAX_VUELTAS = 5
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
