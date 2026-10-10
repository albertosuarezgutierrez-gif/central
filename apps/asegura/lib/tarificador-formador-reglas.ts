// Formador con IA del tarificador RPA — reglas PURAS del lado de asegura (06/10/2026). `node --test`.
//
// El worker (services/tarificador-rpa/src/formador.ts) no encuentra un campo o una acción PERMITIDA y
// pregunta aquí qué candidato es. La IA solo devuelve un ÍNDICE de la lista que mandó el worker; el
// worker lo VALIDA de forma determinista (lista cerrada de acciones + `pareceEmision`) antes de usarlo.
// TARIFICAR ≠ EMITIR: nada de aquí pulsa, decide precios ni habla con Codeoscopic.
//
// Fail-closed: kill-switch `TARIFICADOR_FORMADOR_ACTIVO === '1'`; tope de llamadas a la IA por trabajo;
// una respuesta de la IA que no se entiende, con confianza baja o fuera de rango → `null`.

import { coherenciaPrecio, redactarDatosPersonales, limpiarTextoAviso, type EventoAcompanamiento, type IncidenciaPrecio, type ModalidadPortal, type ValoresLeidos } from '@central/module-tarificacion'

export function formadorActivo(env: Record<string, string | undefined>): boolean {
  return env.TARIFICADOR_FORMADOR_ACTIVO === '1'
}

export const MAX_LLAMADAS_POR_DEFECTO = 12
/** Tope de llamadas a la IA por trabajo (`TARIFICADOR_FORMADOR_MAX_LLAMADAS`, 1..60; si no, 12). */
export function maxLlamadasIA(env: Record<string, string | undefined>): number {
  const n = Number((env.TARIFICADOR_FORMADOR_MAX_LLAMADAS ?? '').trim())
  return Number.isInteger(n) && n >= 1 && n <= 60 ? n : MAX_LLAMADAS_POR_DEFECTO
}

export function quedanLlamadas(usadas: number, max: number): boolean {
  return Number.isFinite(usadas) && usadas >= 0 && usadas < max
}

/** Confianza mínima para devolver un candidato al worker. */
export const CONFIANZA_MINIMA = 0.6
export const MAX_CANDIDATOS = 400

// ─── Estructura compacta (sin valores) ──────────────────────────────────────

export type Candidato = {
  tag: string
  id: string | null
  name: string | null
  type: string | null
  role: string | null
  clases: string | null
  texto: string | null
  etiqueta: string | null
  marco: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CLAVE = /^[a-z0-9_]{1,60}$/
const COMPANIA = /^[a-z0-9_-]{1,40}$/
const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

function cad(v: unknown, max: number, pii = false): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  if (!t) return null
  const r = pii ? redactarDatosPersonales(t) : t
  return r.slice(0, max)
}

/**
 * Re-proyecta lo que manda el worker a una LISTA BLANCA de claves (defensa en profundidad: aunque el
 * worker se equivocara y mandara `value`, aquí no pasa) y tapa datos personales en lo legible.
 */
export function leerEstructura(v: unknown): Candidato[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_CANDIDATOS) return null
  const out: Candidato[] = []
  for (const x of v) {
    const o = obj(x)
    if (!o) return null
    const tag = cad(o.tag, 30)
    if (!tag || !/^[a-z][a-z0-9-]*$/i.test(tag)) return null
    out.push({
      tag: tag.toLowerCase(),
      id: cad(o.id, 80),
      name: cad(o.name, 80),
      type: cad(o.type, 20),
      role: cad(o.role, 30),
      clases: cad(o.clases, 120),
      texto: cad(o.texto, 80, true),
      etiqueta: cad(o.etiqueta, 120, true),
      marco: cad(o.marco, 120),
    })
  }
  return out
}

// ─── Peticiones ──────────────────────────────────────────────────────────────

export type TipoClave = 'campo' | 'accion'
export type PeticionSugerir = { trabajoId: string; compania: string; ramo: string; clave: string; tipo: TipoClave; descripcion: string; estructura: Candidato[] }

function cabecera(o: Record<string, unknown>, errores: string[]): { trabajoId: string; compania: string; ramo: string } {
  const trabajoId = typeof o.trabajoId === 'string' ? o.trabajoId.trim() : ''
  const compania = typeof o.compania === 'string' ? o.compania.trim().toLowerCase() : ''
  const ramo = typeof o.ramo === 'string' ? o.ramo.trim() : ''
  if (!UUID.test(trabajoId)) errores.push('trabajoId no es un uuid')
  if (!COMPANIA.test(compania)) errores.push('compania no válida')
  if (!COMPANIA.test(ramo)) errores.push('ramo no válido')
  return { trabajoId, compania, ramo }
}

export function leerPeticionSugerir(body: unknown): { ok: true; p: PeticionSugerir } | { ok: false; errores: string[] } {
  const o = obj(body)
  if (!o) return { ok: false, errores: ['cuerpo no es un objeto'] }
  const errores: string[] = []
  const c = cabecera(o, errores)
  const clave = typeof o.clave === 'string' ? o.clave.trim() : ''
  if (!CLAVE.test(clave)) errores.push('clave no válida ([a-z0-9_], ≤60)')
  const tipo = o.tipo === 'campo' || o.tipo === 'accion' ? o.tipo : null
  if (!tipo) errores.push("tipo: 'campo' | 'accion'")
  const descripcion = cad(o.descripcion, 300, true) ?? ''
  const estructura = leerEstructura(o.estructura)
  if (!estructura) errores.push(`estructura: lista de 1..${MAX_CANDIDATOS} candidatos {tag, …}`)
  if (errores.length) return { ok: false, errores }
  return { ok: true, p: { ...c, clave, tipo: tipo!, descripcion, estructura: estructura! } }
}

export const PASOS = ['login', 'formulario', 'tras_calcular', 'resultado', 'proyecto'] as const
export type Paso = (typeof PASOS)[number]

export type PeticionRevisar = {
  trabajoId: string
  compania: string
  ramo: string
  paso: Paso
  pantallaEsperada: string
  estructura: Candidato[]
  textosAviso: string[]
  valoresLeidos: ValoresLeidos | null
  modalidadPedida: ModalidadPortal | null
}

const numONull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const modalidad = (v: unknown): ModalidadPortal | null => (v === 'estandar' || v === 'personalizado' ? v : null)

export function leerPeticionRevisar(body: unknown): { ok: true; p: PeticionRevisar } | { ok: false; errores: string[] } {
  const o = obj(body)
  if (!o) return { ok: false, errores: ['cuerpo no es un objeto'] }
  const errores: string[] = []
  const c = cabecera(o, errores)
  const paso = (PASOS as readonly string[]).includes(o.paso as string) ? (o.paso as Paso) : null
  if (!paso) errores.push(`paso: ${PASOS.join(' | ')}`)
  const pantallaEsperada = cad(o.pantallaEsperada, 200) ?? ''
  if (!pantallaEsperada) errores.push('pantallaEsperada vacía')
  // La estructura puede venir vacía en una pantalla sin controles (p. ej. un error a pantalla completa).
  const estructura = Array.isArray(o.estructura) && o.estructura.length === 0 ? [] : leerEstructura(o.estructura)
  if (!estructura) errores.push(`estructura: lista de 0..${MAX_CANDIDATOS} candidatos`)
  const textosAviso = Array.isArray(o.textosAviso)
    ? o.textosAviso.slice(0, 30).map((t) => limpiarTextoAviso(t)).filter((t): t is string => t !== null)
    : []
  const vl = obj(o.valoresLeidos)
  const valoresLeidos: ValoresLeidos | null = vl
    ? { primaNetaEur: numONull(vl.primaNetaEur), impuestosEur: numONull(vl.impuestosEur), primaTotalEur: numONull(vl.primaTotalEur), modalidad: modalidad(vl.modalidad) }
    : null
  if (errores.length) return { ok: false, errores }
  return { ok: true, p: { ...c, paso: paso!, pantallaEsperada, estructura: estructura!, textosAviso, valoresLeidos, modalidadPedida: modalidad(o.modalidadPedida) } }
}

export type PeticionConfirmar = { trabajoId: string; compania: string; ramo: string; clave: string; tipo: TipoClave; selector: string; marco: string | null; origen: 'ia' | 'codigo' | 'humano' }

export function leerPeticionConfirmar(body: unknown): { ok: true; p: PeticionConfirmar } | { ok: false; errores: string[] } {
  const o = obj(body)
  if (!o) return { ok: false, errores: ['cuerpo no es un objeto'] }
  const errores: string[] = []
  const c = cabecera(o, errores)
  const clave = typeof o.clave === 'string' ? o.clave.trim() : ''
  if (!CLAVE.test(clave)) errores.push('clave no válida')
  const tipo = o.tipo === 'campo' || o.tipo === 'accion' ? o.tipo : null
  if (!tipo) errores.push("tipo: 'campo' | 'accion'")
  const selector = typeof o.selector === 'string' ? o.selector.trim() : ''
  if (!selector || selector.length > 2000) errores.push('selector vacío o > 2000')
  const marco = o.marco === null || o.marco === undefined ? null : cad(o.marco, 300)
  const origen = o.origen === 'ia' || o.origen === 'codigo' || o.origen === 'humano' ? o.origen : null
  if (!origen) errores.push("origen: 'ia' | 'codigo' | 'humano'")
  if (errores.length) return { ok: false, errores }
  return { ok: true, p: { ...c, clave, tipo: tipo!, selector, marco, origen: origen! } }
}

export function leerPeticionCierre(body: unknown): { ok: true; p: { trabajoId: string; resultado: 'ok' | 'error' } } | { ok: false; errores: string[] } {
  const o = obj(body)
  const trabajoId = typeof o?.trabajoId === 'string' ? o.trabajoId.trim() : ''
  const resultado = o?.resultado === 'ok' || o?.resultado === 'error' ? o.resultado : null
  const errores = [...(UUID.test(trabajoId) ? [] : ['trabajoId no es un uuid']), ...(resultado ? [] : ["resultado: 'ok' | 'error'"])]
  return errores.length ? { ok: false, errores } : { ok: true, p: { trabajoId, resultado: resultado! } }
}

/** Con intervención = la IA tuvo que señalar algo o hubo un aviso bloqueante en el trabajo. */
export function eventoCierre(resultado: 'ok' | 'error', conIntervencion: boolean): EventoAcompanamiento {
  if (resultado === 'error') return 'fallo'
  return conIntervencion ? 'exito_con_ia' : 'exito_sin_ia'
}

// ─── Prompts ─────────────────────────────────────────────────────────────────

function lineaCandidato(c: Candidato, i: number): string {
  const partes = [`#${i}`, `<${c.tag}${c.type ? ` type=${c.type}` : ''}>`]
  if (c.id) partes.push(`id=${c.id}`)
  if (c.name) partes.push(`name=${c.name}`)
  if (c.role) partes.push(`role=${c.role}`)
  if (c.etiqueta) partes.push(`etiqueta="${c.etiqueta}"`)
  if (c.texto) partes.push(`texto="${c.texto}"`)
  if (c.clases) partes.push(`clases=${c.clases}`)
  if (c.marco) partes.push(`marco=${c.marco}`)
  return partes.join(' ')
}

export const SYSTEM_SUGERIR =
  'Eres un asistente que ayuda a un bot a COTIZAR (nunca contratar) un seguro en el portal web de una compañía. ' +
  'Recibes una lista numerada de elementos de la página (sin valores) y lo que el bot busca. ' +
  'Responde SOLO con JSON: {"indice": <número del candidato o null>, "confianza": <0..1>, "motivo": "<una frase>"}. ' +
  'Si ninguno encaja con seguridad, indice null. Nunca elijas nada que contrate, emita, formalice o grabe una póliza.'

export function promptSugerir(p: PeticionSugerir): string {
  const que = p.tipo === 'campo' ? `el CAMPO del formulario «${p.clave}»` : `el control de la ACCIÓN «${p.clave}»`
  return [
    `Compañía: ${p.compania}. Ramo: ${p.ramo}.`,
    `Busco ${que}.${p.descripcion ? ` Descripción: ${p.descripcion}` : ''}`,
    p.tipo === 'campo' ? 'Tiene que ser un control editable (input, select, textarea, desplegable), nunca un botón o enlace.' : 'Tiene que ser un botón, enlace o pestaña.',
    'Candidatos:',
    ...p.estructura.map(lineaCandidato),
  ].join('\n')
}

export const SYSTEM_REVISAR =
  'Eres un técnico de una correduría de seguros que supervisa a un bot que COTIZA (nunca contrata) en el portal de una compañía. ' +
  'Recibes la pantalla esperada, los elementos visibles (sin valores) y los textos de avisos/errores/modales. ' +
  'Responde SOLO con JSON: {"enPantallaEsperada": true|false, "avisos": [{"texto": "<aviso tal cual>", "interpretacion": "<qué significa para la correduría, en español llano>", "bloqueante": true|false}], "sugerencias": ["<frase>"]}. ' +
  'Bloqueante = el portal no deja seguir o el precio no sería válido. Un aviso informativo no es bloqueante. Nunca sugieras contratar ni emitir.'

export function promptRevisar(p: PeticionRevisar): string {
  return [
    `Compañía: ${p.compania}. Ramo: ${p.ramo}. Paso: ${p.paso}.`,
    `Pantalla esperada: ${p.pantallaEsperada}`,
    p.textosAviso.length ? `Avisos visibles:\n${p.textosAviso.map((t) => `- ${t}`).join('\n')}` : 'Avisos visibles: ninguno.',
    p.estructura.length ? `Elementos:\n${p.estructura.slice(0, 150).map(lineaCandidato).join('\n')}` : 'Elementos: ninguno.',
  ].join('\n')
}

// ─── Respuestas de la IA ─────────────────────────────────────────────────────

/** Primer objeto JSON balanceado del texto (la IA a veces añade prosa o ```json). */
export function primerObjetoJson(texto: string): Record<string, unknown> | null {
  const ini = texto.indexOf('{')
  if (ini < 0) return null
  let prof = 0
  let enCadena = false
  let escape = false
  for (let i = ini; i < texto.length; i++) {
    const ch = texto[i]
    if (enCadena) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') enCadena = false
      continue
    }
    if (ch === '"') enCadena = true
    else if (ch === '{') prof++
    else if (ch === '}' && --prof === 0) {
      try {
        return obj(JSON.parse(texto.slice(ini, i + 1)))
      } catch {
        return null
      }
    }
  }
  return null
}

export type Sugerencia = { indice: number; confianza: number; motivo: string }

export function parsearRespuestaSugerir(texto: string, nCandidatos: number): Sugerencia | null {
  const o = primerObjetoJson(texto)
  if (!o) return null
  const indice = o.indice
  const confianza = typeof o.confianza === 'number' ? o.confianza : Number(o.confianza)
  if (typeof indice !== 'number' || !Number.isInteger(indice) || indice < 0 || indice >= nCandidatos) return null
  if (!Number.isFinite(confianza) || confianza < CONFIANZA_MINIMA || confianza > 1) return null
  return { indice, confianza, motivo: cad(o.motivo, 300, true) ?? '' }
}

export type AvisoInterpretado = { texto: string; interpretacion: string; bloqueante: boolean }
export type Revision = { enPantallaEsperada: boolean | null; avisos: AvisoInterpretado[]; sugerencias: string[] }

/** `null` si no se entiende. Un `bloqueante` que no es exactamente `true` NO bloquea (no se para un trabajo por ruido). */
export function parsearRespuestaRevisar(texto: string): Revision | null {
  const o = primerObjetoJson(texto)
  if (!o) return null
  const en = typeof o.enPantallaEsperada === 'boolean' ? o.enPantallaEsperada : null
  const avisos: AvisoInterpretado[] = []
  for (const a of Array.isArray(o.avisos) ? o.avisos.slice(0, 20) : []) {
    const x = obj(a)
    const t = x ? cad(x.texto, 300, true) : null
    const i = x ? cad(x.interpretacion, 500, true) : null
    if (!t || !i) continue
    avisos.push({ texto: t, interpretacion: i, bloqueante: x!.bloqueante === true })
  }
  const sugerencias = (Array.isArray(o.sugerencias) ? o.sugerencias.slice(0, 10) : []).map((s) => cad(s, 300, true)).filter((s): s is string => s !== null)
  if (en === null && !avisos.length && !sugerencias.length) return null
  return { enPantallaEsperada: en, avisos, sugerencias }
}

/** Coherencia DETERMINISTA del paso `resultado` (no depende de la IA ni de que esté encendida). */
export function incidenciasResultado(p: PeticionRevisar): IncidenciaPrecio[] {
  if (p.paso !== 'resultado' || !p.valoresLeidos) return []
  return coherenciaPrecio(p.valoresLeidos, p.modalidadPedida)
}

// ─── Coste ───────────────────────────────────────────────────────────────────

/** Tarifa de REFERENCIA (€ por millón de tokens) del modelo flash por defecto. Orientativa: el real va en `ai_usos`. */
export const EUR_POR_MTOK_ENTRADA = 0.3
export const EUR_POR_MTOK_SALIDA = 1.2

/** ~4 caracteres por token. Redondeado a 6 decimales (numeric(10,6)). */
export function costeEstimado(caracteresEntrada: number, caracteresSalida: number): number {
  const e = Math.max(0, caracteresEntrada) / 4
  const s = Math.max(0, caracteresSalida) / 4
  return Math.round(((e * EUR_POR_MTOK_ENTRADA + s * EUR_POR_MTOK_SALIDA) / 1e6) * 1e6) / 1e6
}
