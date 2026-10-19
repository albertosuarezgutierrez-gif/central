// F3a — «Listo para tarificar» de un lead, PRIMERO con los BOTS (gratis) (19/10/2026, spec lead → propuesta §F3 y §3.3;
// decisión de Alberto: los bots RPA van antes que Avant2 para no gastar 0,50€). PURO: sin BD, sin red, sin env (salvo el que
// se le pasa). La parte con BD es `tarificacion-lead.ts`; el puerto, `POST /api/operador/correo/tarificar-lead`.
//
// Qué decide esto:
//   · del contrato del lead (`info_riesgo.datosContrato`, ya descifrado por quien llama) + el bloque del riesgo
//     (`datosVehiculo`) → el `FormularioAuto` que encola el bot. Solo lo que el cliente DIJO o el riesgo ya tiene; lo que se
//     supone se DICE (supuestos a la vista en Telegram), y lo que el cliente escribió pero no se sabe traducir sin adivinar
//     (texto libre del seguro anterior, marca/modelo de la moto…) es `noLeidos`: ni se inventa ni se le repregunta.
//   · qué le falta a CADA bot (`faltanParaTarificar`, fuente única de module-tarificacion) → claves del CONTRATO para la
//     repregunta (F2). Un bot sin declaración (`null`) no es «no falta nada»: no se lanza.
//   · el tope diario (env `ASEGURA_TARIF_AUTO_TOPE_DIARIO`: inválido → 20, máximo duro 100) por día de Madrid.
// 🚨 TARIFICAR ≠ EMITIR. 🚨 Nada de valores en lo que sale de aquí hacia Telegram: claves, etiquetas y nombres de compañía.
import { contratoDatos } from '@central/module-seguros'
import { duermeEnGaraje, GARAJES_CONOCIDOS } from '@central/module-seguros/garajes'
import { faltanParaTarificar, type Faltante } from '@central/module-tarificacion'
import { RAMOS_TARIFICABLES_RPA, validarEntradaRamo } from './tarificador-reglas.ts'

// ─── Tope diario ─────────────────────────────────────────────────────────────

export const TOPE_DIARIO_DEFECTO = 20
export const TOPE_DIARIO_MAXIMO = 100
/** Lo que suma cada «➕ 10 más hoy» (`clp_top`). */
export const AMPLIACION_TOPE = 10
export const ENV_TOPE_DIARIO = 'ASEGURA_TARIF_AUTO_TOPE_DIARIO'

/** Tope diario de trabajos de bot desde leads. Vacío o inválido → 20; nunca más de 100. PURA. */
export function topeDiario(env: Record<string, string | undefined>): number {
  const t = (env[ENV_TOPE_DIARIO] ?? '').trim()
  if (!/^\d{1,4}$/.test(t)) return TOPE_DIARIO_DEFECTO
  const n = Number(t)
  if (n < 1) return TOPE_DIARIO_DEFECTO
  return Math.min(n, TOPE_DIARIO_MAXIMO)
}

/** Día de Madrid `aaaa-mm-dd` (la fila del contador). PURA (el reloj se inyecta). */
export function diaMadrid(ahora: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(ahora)
}

/** `aaaammdd` (lo que viaja en `clp_top:<aaaammdd>`) → `aaaa-mm-dd`, o `null` si no es una fecha real. PURA. */
export function diaDeCompacto(v: unknown): string | null {
  const m = typeof v === 'string' ? /^(\d{4})(\d{2})(\d{2})$/.exec(v.trim()) : null
  if (!m) return null
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

/** ¿Caben `n` trabajos más hoy? El tope efectivo nunca pasa de 100 aunque se amplíe. PURA. */
export function caben(usadas: number, tope: number, extra: number, n: number): boolean {
  const efectivo = Math.min(tope + Math.max(0, extra), TOPE_DIARIO_MAXIMO)
  return n > 0 && usadas + n <= efectivo
}

// ─── Del contrato del lead al formulario del bot ─────────────────────────────

/** Ramos de los bots que se pueden armar desde el contrato de un lead (comunidades: su formulario aún no se traduce). */
export const RAMOS_BOT_DESDE_LEAD = ['auto', 'moto'] as const
export type RamoBotLead = (typeof RAMOS_BOT_DESDE_LEAD)[number]
export const esRamoBotLead = (r: string): r is RamoBotLead => (RAMOS_BOT_DESDE_LEAD as readonly string[]).includes(r)

/** ¿Hay bot para este ramo en el código? Fuente: `RAMOS_TARIFICABLES_RPA` (la BD decide luego qué compañías). PURA. */
export function ramoConBot(ramo: string): boolean {
  return (RAMOS_TARIFICABLES_RPA as readonly string[]).includes(ramo)
}

export type Supuesto = { campo: string; texto: string }

export type EntradaFormulario = {
  ramo: RamoBotLead
  /** `datosContrato.valores` ya DESCIFRADOS; lo que no se pudo abrir NO viene (y su clave va en `ilegibles`). */
  valores: Readonly<Record<string, unknown>>
  ilegibles?: readonly string[]
  /** `info_riesgo.datosVehiculo` (o `null`). */
  bloque: Readonly<Record<string, unknown>> | null
  /** De la FICHA: fecha de nacimiento descifrada (ISO) o `null`. */
  fichaNacimiento: string | null
  /** `aaaa-mm-dd` de hoy (Madrid). */
  hoy: string
}

export type FormularioLead = {
  riesgo: Record<string, unknown>
  /** Lo que se SUPONE (se enseña en Telegram antes del botón). Sin valores personales. */
  supuestos: Supuesto[]
  /** Claves del contrato que el cliente contestó pero no se traducen sin adivinar: ni se repregunta ni se inventa. */
  noLeidos: string[]
  /** El bot solo tarifica al propio cliente como conductor y propietario: si no es así, no se lanza. */
  bloqueos: string[]
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
const txt = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')
const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const hay = (v: unknown) => v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '')

/** «dónde duerme» en palabras del cliente → garaje del bot. `null` = no se entiende (no se traduce a ojo). PURA. */
export function garajeDeTexto(v: unknown): { garajeNoche: boolean; tipoGaraje: 'calle' | 'colectivo' | 'individual' | null } | null {
  const s = sinTildes(txt(v))
  if (!s) return null
  const calle = /\b(calle|via publica|en la via|aparcad[oa] fuera|a la intemperie)\b/.test(s)
  const colectivo = /\b(comunitari[oa]|colectiv[oa]|de la comunidad|del edificio|parking publico)\b/.test(s)
  const individual = /\b(individual|propi[oa]|particular|cerrad[oa]|box|cochera)\b/.test(s)
  const garaje = /\bgaraje\b/.test(s)
  if (calle && !garaje && !colectivo && !individual) return { garajeNoche: false, tipoGaraje: 'calle' }
  if (calle) return null // «calle o garaje»: dos respuestas, no se elige
  if (colectivo && !individual) return { garajeNoche: true, tipoGaraje: 'colectivo' }
  if (individual && !colectivo) return { garajeNoche: true, tipoGaraje: 'individual' }
  if (garaje && !colectivo && !individual) return { garajeNoche: true, tipoGaraje: null }
  return null
}

/** Compañías por las que se reconoce el nombre en el texto del seguro anterior (solo nombres, ninguno ambiguo). */
const COMPANIAS_TEXTO: readonly [RegExp, string][] = [
  [/\bmapfre\b/, 'Mapfre'], [/\ballianz\b/, 'Allianz'], [/\bgenerali\b/, 'Generali'], [/\baxa\b/, 'AXA'],
  [/\bmutua madrilena\b/, 'Mutua Madrileña'], [/\blinea directa\b/, 'Línea Directa'], [/\breale\b/, 'Reale'],
  [/\bzurich\b/, 'Zurich'], [/\bliberty\b/, 'Liberty'], [/\boccident\b|\bcatalana occidente\b/, 'Occident'],
  [/\bsanta ?lucia\b/, 'Santalucía'], [/\bpelayo\b/, 'Pelayo'], [/\bverti\b/, 'Verti'], [/\bqualitas\b/, 'Qualitas'],
  [/\bgenesis\b/, 'Génesis'], [/\bfenix directo\b/, 'Fénix Directo'], [/\bhelvetia\b/, 'Helvetia'], [/\bcaser\b/, 'Caser'],
  [/\bplus ultra\b/, 'Plus Ultra'], [/\bregal\b/, 'Regal'], [/\bbalumba\b/, 'Balumba'], [/\bdirect seguros\b/, 'Direct Seguros'],
]

/**
 * El texto libre del «seguro anterior» → lo que piden los bots. CONSERVADOR: solo lo que se lee sin ambigüedad (un único
 * número de años, «sin partes» = 0 siniestros, una sola compañía reconocida). Lo demás queda `null` (no consta). PURA.
 */
export function historialDeTexto(v: unknown): { aniosAsegurado: number | null; siniestros5: number | null; compania: string | null; sinSeguro: boolean } {
  const s = sinTildes(txt(v))
  const vacio = { aniosAsegurado: null, siniestros5: null, compania: null, sinSeguro: false }
  if (!s) return vacio
  if (/\b(no tengo seguro|sin seguro|no tiene seguro|primer seguro|nunca he tenido seguro|es mi primer coche)\b/.test(s)) {
    return { ...vacio, aniosAsegurado: 0, sinSeguro: true }
  }
  const anios = [...s.matchAll(/(\d{1,2})\s*anos?\b/g)].map((m) => Number(m[1]))
  const distintos = [...new Set(anios)]
  // Con varios números («10 años asegurado, 8 sin partes») no se sabe cuál es cuál sin adivinar.
  const aniosAsegurado = distintos.length === 1 && /\b(llevo|asegurad[oa]s?|con ellos|en la compania|de seguro|anos con)\b/.test(s) ? distintos[0] : null
  const sinPartes = /\b(sin (dar )?(ningun )?(partes?|siniestros?)|ningun (parte|siniestro)|0 (partes|siniestros)|nunca he dado (un )?parte|no he dado (ningun )?parte)\b/.test(s)
  const conPartes = /\b(\d+|un|una|dos|tres) (partes?|siniestros?)\b/.test(s.replace(/\b0 (partes|siniestros)\b/g, ''))
  const siniestros5 = sinPartes && !conPartes ? 0 : null
  const cias = COMPANIAS_TEXTO.filter(([re]) => re.test(s)).map(([, n]) => n)
  return { aniosAsegurado, siniestros5, compania: cias.length === 1 ? cias[0] : null, sinSeguro: false }
}

/**
 * Contrato del lead + bloque del riesgo → `FormularioAuto` candidato (auto/moto). Nada personal se inventa: lo que falta
 * no se pone (lo dirá `faltanParaTarificar`). Lo supuesto va en `supuestos`. PURA.
 */
export function formularioBotDesdeLead(e: EntradaFormulario): FormularioLead {
  const v = e.valores
  const b = e.bloque ?? {}
  const supuestos: Supuesto[] = []
  const noLeidos = new Set<string>(e.ilegibles ?? [])
  const bloqueos: string[] = []
  const riesgo: Record<string, unknown> = { ramo: e.ramo }

  const matricula = txt(v.matricula) || txt(b.matricula)
  if (matricula) riesgo.matricula = matricula
  const cp = txt(v.cpCirculacion) || txt(b.cpCirculacion)
  if (cp) riesgo.codigoPostal = cp

  const conductor: Record<string, unknown> = {}
  const nac = txt(v.fechaNacimiento) || (e.fichaNacimiento && ISO.test(e.fichaNacimiento) ? e.fichaNacimiento : '')
  if (ISO.test(nac)) conductor.fechaNacimiento = nac
  if (ISO.test(txt(v.fechaCarnet))) conductor.fechaCarne = txt(v.fechaCarnet)
  conductor.sexo = v.sexo === 'H' ? 'hombre' : v.sexo === 'M' ? 'mujer' : null
  riesgo.conductor = conductor

  // Conductor y titular: el bot solo tarifica al propio cliente en los dos papeles. Si dijo otra persona, no se lanza.
  if (hay(v.conductor)) bloqueos.push('el conductor habitual es otra persona (el bot solo tarifica al propio cliente)')
  else {
    riesgo.tomadorEsConductor = true
    supuestos.push({ campo: 'conductor', texto: 'conductor habitual: el propio cliente (no ha dicho otro)' })
  }
  if (hay(v.propietario)) bloqueos.push('el titular del vehículo es otra persona (el bot solo tarifica al cliente como titular)')
  else {
    riesgo.tomadorEsPropietario = true
    supuestos.push({ campo: 'propietario', texto: 'titular: el propio cliente (no ha dicho otro)' })
  }

  // Garaje: el código del riesgo manda; si no, lo que dijo el cliente (si se entiende sin adivinar).
  const codigo = txt(b.garaje)
  if (codigo && GARAJES_CONOCIDOS[codigo]) {
    riesgo.garajeNoche = duermeEnGaraje(codigo)
    const clase = GARAJES_CONOCIDOS[codigo].clase
    const tipo = clase === 'calle' ? 'calle' : clase === 'comunitario' ? 'colectivo' : clase === 'individual' ? 'individual' : null
    if (tipo) riesgo.tipoGaraje = tipo
  } else if (hay(v.garaje)) {
    const g = garajeDeTexto(v.garaje)
    if (g) { riesgo.garajeNoche = g.garajeNoche; if (g.tipoGaraje) riesgo.tipoGaraje = g.tipoGaraje }
    else noLeidos.add('garaje')
  }

  // Seguro anterior (texto libre): solo lo que se lee sin dudas.
  if (hay(v.aseguradoAntes)) {
    const h = historialDeTexto(v.aseguradoAntes)
    if (h.aniosAsegurado !== null) riesgo.aniosAseguradoAnterior = h.aniosAsegurado
    if (h.siniestros5 !== null) riesgo.siniestrosUltimos5Anios = h.siniestros5
    if (h.compania) riesgo.companiaAnterior = h.compania
    if (!h.sinSeguro && (h.aniosAsegurado === null || h.siniestros5 === null || h.compania === null)) noLeidos.add('aseguradoAntes')
    if (h.sinSeguro && h.siniestros5 === null) noLeidos.add('aseguradoAntes')
  }

  const fm = txt(b.fechaMatriculacion)
  if (ISO.test(fm) && fm <= e.hoy) riesgo.fechaMatriculacion = fm
  const efecto = txt(v.fechaEfecto)
  if (ISO.test(efecto) && efecto > e.hoy) riesgo.fechaVencimiento = efecto

  if (e.ramo === 'auto') {
    riesgo.usoVehiculo = 'particular'
    riesgo.ambitoCirculacion = 'espana'
    riesgo.clasePermiso = 'b'
    supuestos.push({ campo: 'uso', texto: 'uso particular, circulación en España y carné B (los de por defecto del coche)' })
  } else if (hay(v.codigoVehiculo)) {
    // Moto: los portales piden marca, modelo y cilindrada POR SEPARADO; el texto libre («Honda PCX 125») no se parte a ojo.
    noLeidos.add('codigoVehiculo')
  }
  return { riesgo, supuestos, noLeidos: [...noLeidos], bloqueos }
}

// ─── Qué falta, en claves del CONTRATO ───────────────────────────────────────

/** Clave de un validador del bot («conductor.fechaCarne») → clave del contrato que la pregunta (`fechaCarnet`). PURA. */
export function claveContratoDeBot(ramo: string, claveBot: string): string | null {
  const raiz = claveBot.split(':')[0].trim()
  for (const f of contratoDatos(ramo).campos) {
    if (f.clave === raiz || (f.cubre ?? []).includes(raiz)) return f.clave
  }
  // Prefijo: «seleccionVehiculo.x» cubierto por «seleccionVehiculo», etc.
  const padre = raiz.split('.')[0]
  for (const f of contratoDatos(ramo).campos) if ((f.cubre ?? []).includes(padre)) return f.clave
  return null
}

export type ValoracionCompania =
  | { compania: string; estado: 'lista' }
  /** `preguntar`: claves del contrato a repreguntar. `noLeidas`: el cliente las dio pero no se traducen. `otros`: etiquetas sin pregunta. */
  | { compania: string; estado: 'faltan'; preguntar: string[]; noLeidas: string[]; otros: string[] }
  /** El bot de esa compañía no declara qué necesita: no se lanza (no es «no falta nada»). */
  | { compania: string; estado: 'sin_declaracion' }

/**
 * Para UNA compañía con bot activo: ¿llega a precio con este riesgo? Primero lo que falta (`faltanParaTarificar`, sin lo
 * que pone la ficha al encolar), luego la FORMA (`validarEntradaRamo`). Cada hueco → clave del contrato. PURA.
 */
export function valorarCompania(compania: string, ramo: RamoBotLead, f: FormularioLead): ValoracionCompania {
  const faltan: Faltante[] | null = faltanParaTarificar(compania, ramo, f.riesgo, { sinFicha: true })
  if (faltan === null) return { compania, estado: 'sin_declaracion' }
  const huecos: string[] = faltan.map((x) => x.clave)
  const etiquetas = new Map(faltan.map((x) => [x.clave, x.etiqueta]))
  if (!huecos.length) {
    const v = validarEntradaRamo(ramo, f.riesgo, compania)
    if (v.ok && !f.bloqueos.length) return { compania, estado: 'lista' }
    if (!v.ok) for (const err of v.errores ?? [v.mensaje]) { const k = err.split(':')[0].trim(); huecos.push(k); etiquetas.set(k, k) }
  }
  const noLeidos = new Set(f.noLeidos)
  const preguntar = new Set<string>()
  const noLeidas = new Set<string>()
  const otros = new Set<string>(f.bloqueos)
  for (const h of huecos) {
    const k = claveContratoDeBot(ramo, h)
    if (k === null) otros.add(etiquetas.get(h) ?? h)
    else if (noLeidos.has(k)) noLeidas.add(k)
    else preguntar.add(k)
  }
  if (!preguntar.size && !noLeidas.size && !otros.size) return { compania, estado: 'lista' }
  return { compania, estado: 'faltan', preguntar: [...preguntar], noLeidas: [...noLeidas], otros: [...otros] }
}

// ─── El cuerpo del puerto ────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export type PeticionTarificarLead =
  | { accion: 'revisar' | 'tarificar'; clienteId: string; oportunidadIds: string[]; actor: string }
  | { accion: 'ampliar_tope'; dia: string; actor: string }

/** `{ accion, clienteId, oportunidadIds[], actor }` · `{ accion:'ampliar_tope', dia:'aaaammdd', actor }`. PURA. */
export function validarPeticionTarificarLead(b: unknown, hoy: string): { ok: true; valor: PeticionTarificarLead } | { ok: false; motivo: string } {
  const o = typeof b === 'object' && b !== null && !Array.isArray(b) ? (b as Record<string, unknown>) : {}
  const actor = txt(o.actor).slice(0, 120)
  if (!/^[a-z][a-z0-9_.:@-]{2,119}$/i.test(actor)) return { ok: false, motivo: 'actor inválido' }
  if (o.accion === 'ampliar_tope') {
    const dia = diaDeCompacto(o.dia)
    if (!dia) return { ok: false, motivo: 'dia inválido (aaaammdd)' }
    // Solo HOY: un botón de otro día no amplía el de hoy (sería gastar el cupo de un día que ya pasó en otro).
    if (dia !== hoy) return { ok: false, motivo: 'ese botón es de otro día' }
    return { ok: true, valor: { accion: 'ampliar_tope', dia, actor } }
  }
  if (o.accion !== 'revisar' && o.accion !== 'tarificar') return { ok: false, motivo: 'accion desconocida' }
  const clienteId = txt(o.clienteId)
  if (!UUID.test(clienteId)) return { ok: false, motivo: 'clienteId inválido' }
  const ids = Array.isArray(o.oportunidadIds) ? [...new Set(o.oportunidadIds.filter((x): x is string => typeof x === 'string' && UUID.test(x)))] : []
  if (!ids.length || ids.length > 5) return { ok: false, motivo: 'oportunidadIds: de 1 a 5 uuid' }
  return { ok: true, valor: { accion: o.accion, clienteId, oportunidadIds: ids, actor } }
}
