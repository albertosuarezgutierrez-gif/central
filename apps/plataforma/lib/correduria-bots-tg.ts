// BOTS DEL TARIFICADOR por TEXTO LIBRE en Telegram (15/10/2026) — parte PURA (sin `@/` ni prisma → node --test). La red y
// la BD viven en `correduria-bots-telegram.ts`; el bucle de IA es el MISMO del asistente de la correduría
// (`manejarCorreduriaTg`), que en «modo bots» cambia sus herramientas por estas, su prompt y su tope.
//
// Alberto escribe («prueba Allianz en la oportunidad del Hyundai de Manuel», «el campo atascado es la matrícula», «¿cómo
// va el precio de Manuel?») y la IA lo traduce a UNA de tres acciones de una lista blanca:
//   (a) lanzar un precio por bot de una oportunidad en una o varias compañías (solo precio; gratis; nunca emite);
//   (b) contestar a un atasco eligiendo un candidato de los que el propio atasco ofrece (acaba en el MISMO camino que el
//       botón `atq_e`: asegura → `elegirCandidatoAtasco` → `validarPista`; nunca un selector escrito por nadie);
//   (c) consultar el estado de los trabajos/precios (solo lectura, sin botón).
// Lo que lanza o cambia algo NO se hace al interpretar: se guarda una PROPUESTA en BD y se manda un botón
// `tbot_ok:<uuid>`; al pulsarlo, el contenido sale de la BD (nunca del botón) y se revalida todo.
//
// 🚨 Nunca emitir, contratar, grabar póliza, pagar ni enviar nada a terceros: si el texto lo pide, respuesta fija sin IA.
// 🚨 Tope de IA del modo bots: 0,50 € y 12 llamadas cada 24 h (ventana móvil), FAIL-CLOSED (sin poder contar, no se llama).
// 🚨 A la IA no van NIF, teléfono ni fecha de nacimiento: el servidor busca y resuelve; la IA solo ve etiquetas.

export const PREFIJO_BOTS_TG = 'tbot'
/** Topes del modo bots (Alberto, 15/10/2026). Ventana MÓVIL de 24 h, no el día natural. */
export const TOPE_BOTS_EUR = 0.5
export const TOPE_BOTS_LLAMADAS = 12
/** Minutos que vale un botón de propuesta. */
export const MINUTOS_PROPUESTA_BOTS = 15
/** Botones de elección como mucho (más = «sé más concreto»). */
export const MAX_CANDIDATOS_BOTS = 6
/** Ramos que se pueden lanzar desde Telegram: coche (formulario sacado del riesgo) y comunidades (formulario guardado). */
export const RAMOS_BOTS_TG = ['auto', 'comunidades'] as const
export type RamoBotsTg = (typeof RAMOS_BOTS_TG)[number]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v.trim())
const sinTildes = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// ── ¿Es para los bots? ───────────────────────────────────────────────────────────────────────────

const COMPANIAS = /\b(allianz|mapfre|occident|generali|reale|axa|helvetia|zurich|liberty|pelayo|fiatc|catalana|plus ultra|mutua)\b/
const BOTS = /\b(bots?|tarificador(?:es)?|atasc(?:o|os|ad[oa]s?))\b/
const PRUEBA_COMPANIA = /\b(prueba|probar|pruebale|lanza|lanzar|lanzale)\b/
const COMO_VA_PRECIO = /\bcomo van? (?:el |los )?precios?\b/

/**
 * ¿Este texto es para los bots del tarificador? Determinista (sin IA). Estrecho a propósito: «pide precio de la moto de
 * Pablo» sigue siendo Avant2 (el asistente de siempre); solo entra aquí lo que nombra bots/tarificador/atascos, «prueba
 * <compañía>» o «¿cómo va el precio…?». PURA.
 */
export function esParaBots(texto: string): boolean {
  const t = sinTildes(texto ?? '').replace(/[¿?¡!.,;:]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t) return false
  if (BOTS.test(t)) return true
  if (PRUEBA_COMPANIA.test(t) && COMPANIAS.test(t)) return true
  return COMO_VA_PRECIO.test(t)
}

const PROHIBIDA = [
  /\bemit(?:e|ir|ela|elo|irla|irlo|ido|ida)\b/, /\bemision\b/,
  /\bcontrat(?:a|ar|ala|alo|arla|arlo|e)\b/,
  /\bgrab(?:a|ar|ala|alo|arla|arlo|e)\b.{0,20}\bpoliza\b/,
  /\bpag(?:a|ar|ala|alo|ue|uele)\b/, /\bcobr(?:a|ar|ale|arle)\b/,
  /\b(?:manda|mandar|mandale|mandales|mandaselo|mandasela|envia|enviar|enviale|enviales|enviaselo|enviasela|reenvia|reenviar|reenviale)\b/,
  /\b(?:por|al|un|en) (?:correo|whatsapp|email|e-mail|mail|sms)\b/,
]

/** ¿Pide emitir, contratar, grabar póliza, pagar o enviar algo a un tercero? Ante la duda, sí (no se hace por aquí). PURA. */
export function pideAccionProhibida(texto: string): boolean {
  const t = sinTildes(texto ?? '').replace(/[¿?¡!.,;:]/g, ' ').replace(/\s+/g, ' ')
  return PROHIBIDA.some((r) => r.test(t))
}

export const TEXTO_PROHIBIDA =
  '🤖 Eso no se hace por aquí. Por Telegram los bots solo: pedir PRECIO de una oportunidad, contestar a un atasco y decirte cómo va. ' +
  'Emitir, contratar, grabar póliza, pagar o enviar algo a un cliente o a una compañía se hace en la ficha (/correduria).'

// ── Tope ─────────────────────────────────────────────────────────────────────────────────────────

export type UsoBots = { llamadas: number; eur: number }

/** ¿Cabe otra llamada a la IA? `null` (no se pudo contar) = NO (fail-closed). PURA. */
export function dentroDeTopeBots(uso: UsoBots | null): { ok: true } | { ok: false; texto: string } {
  if (uso === null || !Number.isFinite(uso.llamadas) || !Number.isFinite(uso.eur)) {
    return { ok: false, texto: '🤖 No he podido contar lo gastado en IA en las últimas 24 h, así que no la uso. Inténtalo en un rato o hazlo en /correduria/tarificador.' }
  }
  if (uso.llamadas >= TOPE_BOTS_LLAMADAS || uso.eur >= TOPE_BOTS_EUR) {
    return { ok: false, texto: `🤖 Se ha alcanzado el tope de IA de los bots por Telegram (${TOPE_BOTS_LLAMADAS} llamadas o 0,50€ cada 24 h). Mientras, lánzalo desde la ficha o /correduria/tarificador.` }
  }
  return { ok: true }
}

// ── Compañías ────────────────────────────────────────────────────────────────────────────────────

export type IntegracionBot = { compania: string; ramo: string }

/**
 * Compañías pedidas → claves con bot ACTIVO en ese ramo. `todas` = todas las activas. Una sola que no tenga bot → error que
 * dice cuáles hay (no se lanza una parte en silencio). PURA.
 */
export function companiasParaRamo(pedidas: unknown, integraciones: readonly IntegracionBot[], ramo: string):
  { ok: true; companias: string[] } | { ok: false; motivo: string } {
  const activas = [...new Set(integraciones.filter((i) => i.ramo === ramo).map((i) => i.compania))]
  const lista = activas.length ? activas.join(', ') : 'ninguna'
  if (!activas.length) return { ok: false, motivo: `ninguna compañía tiene bot activo en ${ramo}` }
  const brutas = Array.isArray(pedidas) ? pedidas : typeof pedidas === 'string' ? [pedidas] : []
  const claves = [...new Set(brutas.map((c) => (typeof c === 'string' ? sinTildes(c).trim().replace(/\s+/g, '_') : '')).filter(Boolean))]
  if (!claves.length) return { ok: false, motivo: `di en qué compañía; con bot activo en ${ramo}: ${lista}` }
  if (claves.includes('todas')) return { ok: true, companias: activas }
  const fuera = claves.filter((c) => !activas.includes(c))
  if (fuera.length) return { ok: false, motivo: `sin bot activo en ${ramo}: ${fuera.join(', ')}; con bot: ${lista}` }
  return { ok: true, companias: claves.slice(0, 10) }
}

// ── Oportunidades candidatas ─────────────────────────────────────────────────────────────────────

export type OportunidadBots = {
  id: string; clienteId: string; clienteNombre: string | null; ramo: string | null; estado: string
  vehiculo: string | null; matricula: string | null; aseguradora: string | null
}

const ABIERTAS = ['competencia', 'en_negociacion', 'pendiente_cliente']

/**
 * Oportunidades donde tiene sentido lanzar un bot: abiertas, de un ramo con bot desde Telegram y que casan con la pista
 * (marca/modelo/matrícula, todas sus palabras). Sin pista, todas las abiertas. PURA.
 */
export function candidatasBots(ops: readonly OportunidadBots[], pista: string | null | undefined, ramos: readonly string[] = RAMOS_BOTS_TG): OportunidadBots[] {
  const palabras = sinTildes(pista ?? '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((p) => p.length >= 2)
  const vistas = new Set<string>()
  return ops.filter((o) => {
    if (vistas.has(o.id)) return false
    vistas.add(o.id)
    if (!ABIERTAS.includes(o.estado) || !o.ramo || !ramos.includes(o.ramo)) return false
    if (!palabras.length) return true
    const hay = sinTildes(`${o.vehiculo ?? ''} ${(o.matricula ?? '').replace(/[^a-z0-9]/gi, '')} ${o.ramo} ${o.aseguradora ?? ''}`)
    return palabras.every((p) => hay.includes(p))
  })
}

/** Lo que ve ALBERTO en el botón/mensaje: vehículo · matrícula (ramo) — cliente. Nunca pasa por la IA. PURA. */
export function etiquetaOportunidad(o: OportunidadBots): string {
  const que = [o.vehiculo, o.matricula].filter(Boolean).join(' · ') || (o.ramo === 'comunidades' ? 'Comunidad' : 'Sin vehículo')
  return `${que} (${o.ramo ?? '—'})${o.clienteNombre ? ` — ${o.clienteNombre}` : ''}`.slice(0, 120)
}

/** Lo que ve la IA de una candidata: sin nombre ni matrícula (no le hacen falta). PURA. */
export function etiquetaParaIA(o: OportunidadBots): string {
  return `${o.vehiculo ?? (o.ramo === 'comunidades' ? 'comunidad' : 'vehículo sin dato')} (${o.ramo ?? '—'})`
}

// ── Atascos ──────────────────────────────────────────────────────────────────────────────────────

export type CandidatoAtascoTg = { n: number; tag: string; texto: string | null; etiqueta: string | null; id: string | null }

/** Rótulo de un candidato (el mismo criterio que `lineaCandidato`: texto → etiqueta → id). PURA. */
export function rotuloCandidato(c: Pick<CandidatoAtascoTg, 'texto' | 'etiqueta' | 'id'>): string {
  return (c.texto ?? c.etiqueta ?? c.id ?? '').trim()
}

/**
 * «El campo atascado es la matrícula» → qué candidato(s) del atasco casan. Determinista: el campo dicho, sin tildes, contra
 * texto/etiqueta del candidato (todas las palabras del campo dentro del rótulo). Con `n`, solo vale si está en la lista. El
 * resultado son NÚMEROS de la lista del atasco, nunca un selector. PURA.
 */
export function casarCandidatoAtasco(candidatos: readonly CandidatoAtascoTg[], campo: unknown, n: unknown):
  { tipo: 'uno'; n: number } | { tipo: 'varios'; ns: number[] } | { tipo: 'ninguno'; motivo: string } {
  if (n !== undefined && n !== null && n !== '') {
    const k = typeof n === 'number' ? n : typeof n === 'string' && /^\d{1,2}$/.test(n.trim()) ? Number(n) : NaN
    if (!Number.isInteger(k) || !candidatos.some((c) => c.n === k)) return { tipo: 'ninguno', motivo: `el ${String(n)} no está en la lista del atasco` }
    return { tipo: 'uno', n: k }
  }
  const palabras = sinTildes(typeof campo === 'string' ? campo : '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter((p) => p.length >= 2 && !['el', 'la', 'los', 'las', 'de', 'del', 'campo', 'es', 'un', 'una'].includes(p))
  if (!palabras.length) return { tipo: 'ninguno', motivo: 'no me has dicho qué campo es' }
  const norm = (s: string | null) => sinTildes(s ?? '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  // De más a menos estricto: rótulo IGUAL a lo dicho → palabras enteras → trozos. «matrícula» ≠ «fecha de matriculación».
  const dicho = palabras.join(' ')
  const iguales = candidatos.filter((c) => norm(c.texto) === dicho || norm(c.etiqueta) === dicho).map((c) => c.n)
  if (iguales.length === 1) return { tipo: 'uno', n: iguales[0]! }
  const enteras = candidatos.filter((c) => {
    const r = ` ${norm(`${c.texto ?? ''} ${c.etiqueta ?? ''}`)} `
    return palabras.every((p) => r.includes(` ${p} `))
  }).map((c) => c.n)
  if (enteras.length === 1) return { tipo: 'uno', n: enteras[0]! }
  const ns = enteras.length > 1 ? enteras : candidatos.filter((c) => {
    const r = sinTildes(`${c.texto ?? ''} ${c.etiqueta ?? ''}`)
    return palabras.every((p) => r.includes(p))
  }).map((c) => c.n)
  if (ns.length === 1) return { tipo: 'uno', n: ns[0]! }
  if (ns.length > 1) return { tipo: 'varios', ns: ns.slice(0, MAX_CANDIDATOS_BOTS) }
  return { tipo: 'ninguno', motivo: 'ningún candidato del atasco se llama así' }
}

// ── Botones ──────────────────────────────────────────────────────────────────────────────────────

export type DecisionBotonBots = { ok: true; accion: 'ok' | 'no'; id: string; quien: string } | { ok: false; toast: string }

/**
 * ¿Vale esta pulsación? SOLO la persona autorizada (from.id EXACTO = `TELEGRAM_CHAT_ID`; sin chat configurado, nadie) y
 * callbacks `tbot_ok:<uuid>` / `tbot_no:<uuid>`. El botón solo lleva el id: lo que se hace sale de la BD. PURA.
 */
export function decidirBotonBots(cb: { from?: { id?: unknown } | null } | null | undefined, accion: string, args: readonly string[], chatAutorizado: string | undefined): DecisionBotonBots {
  const esperado = String(chatAutorizado ?? '').trim()
  const quien = String(cb?.from?.id ?? '').trim()
  if (!esperado || !quien || quien !== esperado) return { ok: false, toast: 'Solo el titular puede hacerlo' }
  if ((accion !== 'ok' && accion !== 'no') || args.length !== 1 || !esUuid(args[0])) return { ok: false, toast: 'Botón no válido' }
  return { ok: true, accion, id: args[0]!.trim().toLowerCase(), quien }
}

export type CuerpoTarificar = { oportunidadId: string; ramo: RamoBotsTg; companias: string[] }
export type CuerpoAtasco = { atascoId: string; n: number; rotulo: string }
export type Propuesta = { tipo: 'tarificar'; cuerpo: CuerpoTarificar } | { tipo: 'atasco'; cuerpo: CuerpoAtasco }

/** Lee lo guardado en BD (jsonb). Algo raro → `null` (no se ejecuta nada). PURA. */
export function leerPropuesta(tipo: unknown, cuerpo: unknown): Propuesta | null {
  const o = typeof cuerpo === 'object' && cuerpo !== null && !Array.isArray(cuerpo) ? (cuerpo as Record<string, unknown>) : null
  if (!o) return null
  if (tipo === 'tarificar') {
    const ramo = o.ramo
    const companias = Array.isArray(o.companias) ? o.companias.filter((c): c is string => typeof c === 'string' && /^[a-z0-9_-]{1,40}$/.test(c)) : []
    if (!esUuid(o.oportunidadId) || (ramo !== 'auto' && ramo !== 'comunidades') || !companias.length || companias.length !== (o.companias as unknown[]).length) return null
    return { tipo, cuerpo: { oportunidadId: o.oportunidadId, ramo, companias } }
  }
  if (tipo === 'atasco') {
    const n = o.n
    if (!esUuid(o.atascoId) || typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 20 || typeof o.rotulo !== 'string') return null
    return { tipo, cuerpo: { atascoId: o.atascoId, n, rotulo: o.rotulo } }
  }
  return null
}

/**
 * Al confirmar un atasco: el candidato N tiene que seguir siendo el MISMO que se propuso (mismo rótulo). Si el atasco ya no
 * está esperando o la lista cambió, no se elige nada. PURA.
 */
export function atascoSigueIgual(candidatos: readonly CandidatoAtascoTg[] | null, c: CuerpoAtasco): boolean {
  if (!candidatos) return false
  const k = candidatos.find((x) => x.n === c.n)
  return !!k && rotuloCandidato(k) === c.rotulo
}

// ── Prompt y herramientas del modo bots ──────────────────────────────────────────────────────────

const fn = (name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
})

export const NOMBRES_HERRAMIENTAS_BOTS = ['bots_tarificar', 'bots_estado', 'bots_atascos', 'bots_atasco_responder'] as const

export const HERRAMIENTAS_BOTS = [
  fn('bots_tarificar', 'PROPONE pedir precio por BOT (gratis, solo precio, nunca emite) de UNA oportunidad en una o varias compañías. NO lanza nada: el sistema busca la oportunidad en el CRM y le manda a Alberto un botón para confirmar (o botones para elegir si hay varias). Pasa buscar (nombre del cliente o matrícula, tal cual lo dijo) y, si lo dijo, pista (marca/modelo del vehículo). companias: claves en minúscula (allianz, mapfre…) o ["todas"].',
    {
      buscar: { type: 'string', description: 'Nombre del cliente o matrícula, tal cual lo dijo Alberto' },
      pista: { type: 'string', description: 'Marca/modelo del vehículo si lo dijo (p. ej. «Hyundai»)' },
      oportunidadId: { type: 'string', description: 'Solo si ya te lo dio una herramienta' },
      companias: { type: 'array', items: { type: 'string' } },
    }, ['companias']),
  fn('bots_estado', 'Cómo van los precios POR BOT de una oportunidad (trabajos, estado, primas). Solo lectura. Lo pedido por Avant2 no sale aquí: dilo y que lo mire en la ficha. Pasa buscar (+ pista) o oportunidadId.',
    { buscar: { type: 'string' }, pista: { type: 'string' }, oportunidadId: { type: 'string' } }),
  fn('bots_atascos', 'Lista los bots ATASCADOS esperando respuesta: compañía, ramo, qué no encuentra y sus candidatos numerados. Solo lectura.'),
  fn('bots_atasco_responder', 'PROPONE la respuesta a un atasco: el candidato que Alberto dice (por número n o por el nombre del campo, p. ej. «matrícula»). NO elige nada: el sistema le manda a Alberto un botón para confirmar (o varios si el nombre casa con varios). Nunca inventes un selector: solo números de la lista del atasco.',
    { atascoId: { type: 'string', description: 'Si hay más de un atasco' }, n: { type: 'integer' }, campo: { type: 'string', description: 'Nombre del campo tal cual lo dijo' } }),
]

export function systemBots(hoyIso: string): string {
  return [
    `Eres el asistente de los BOTS del tarificador de la correduría de Alberto. Hoy es ${hoyIso}. Contestas en español, corto.`,
    'Solo puedes hacer tres cosas: proponer pedir PRECIO por bot de una oportunidad (bots_tarificar), proponer la respuesta a un atasco (bots_atasco_responder) y decir cómo van los precios o qué atascos hay (bots_estado, bots_atascos).',
    'Nunca emites, contratas, grabas pólizas, pagas ni envías nada a nadie. Si te lo piden, di que eso no se hace por aquí.',
    'Lo que lanza o cambia algo NO lo haces tú: el sistema le manda a Alberto un botón y es él quien confirma. No digas que está lanzado: di que tiene el botón.',
    'Nunca inventes una oportunidad, una compañía ni un campo: si una herramienta no lo encuentra, dilo y pregunta. Lo que no trae una herramienta es «no consta».',
  ].join('\n')
}
