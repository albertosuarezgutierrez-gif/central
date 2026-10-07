/**
 * PROPUESTA DE ESCENARIOS (07/10/2026): varios presupuestos de la MISMA oportunidad que se enseñan juntos.
 * Caso real: el Mercedes de Rafael
 *   P1 · Ana tomadora y conductora, Rafael propietario
 *   P2 · Rafael tomador y propietario, Ana conductora
 *
 * PURO, sin BD. La etiqueta de cada escenario se DERIVA de la petición que viajó al vendor (`holder`,
 * `risk.owner`, `risk.primaryDriver`, `risk.secondaryDriver`): nadie la teclea, así que no puede decir
 * una cosa y la tarificación otra.
 *
 * 🚨 Personas por IDENTIDAD (DNI): dos personas con el mismo nombre de pila y distinto DNI NO se funden —
 *    se escriben con el nombre completo para que el cliente sepa cuál es cuál. Sin DNI no se afirma que
 *    sean la misma persona.
 * 🚨 Dato que no consta ≠ dato vacío: una figura que falta en la petición es «no consta», nunca el tomador
 *    por suposición; una prima ilegible es `null` y nunca entra en «la más económica».
 */

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : null)
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const entero = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 99 ? v : null)

/** Una persona de la petición: la identidad es el DNI; los nombres son solo para enseñarla. */
export type PersonaEscenario = { dni: string | null; pila: string | null; completo: string | null }

export type FigurasEscenario = {
  tomador: PersonaEscenario | null
  propietario: PersonaEscenario | null
  conductor: PersonaEscenario | null
  /** Conductor ocasional: `null` = no se declaró (no es «no consta»: es opcional). */
  ocasional: PersonaEscenario | null
}

function personaDe(v: unknown): PersonaEscenario | null {
  const o = obj(v)
  if (!o) return null
  const doc = obj(o.identificationDocument)
  const dni = txt(doc?.id)
  const pila = txt(o.name)
  const completo = [o.name, o.surname, o.surname2].map(txt).filter((x): x is string => x !== null).join(' ') || null
  if (!dni && !completo) return null
  return { dni: dni ? dni.toUpperCase().replace(/\s/g, '') : null, pila: pila ? pila.split(/\s+/)[0]! : null, completo }
}

/** Las figuras de una petición. `null` = petición ilegible (no «sin figuras»). */
export function figurasDePeticion(peticion: unknown): FigurasEscenario | null {
  const p = obj(peticion)
  if (!p) return null
  const risk = obj(p.risk)
  return {
    tomador: personaDe(p.holder),
    propietario: personaDe(risk?.owner),
    conductor: personaDe(risk?.primaryDriver),
    ocasional: personaDe(risk?.secondaryDriver),
  }
}

/** Clave de identidad: el DNI; sin DNI, un id que NUNCA coincide con el de alguien que sí lo tiene. */
export function identidadPersona(p: PersonaEscenario): string {
  return p.dni ? `dni:${p.dni}` : `sin-dni:${(p.completo ?? p.pila ?? '').toLowerCase()}`
}

/**
 * Cómo se escribe a cada persona en TODA la propuesta: el nombre de pila, salvo que ese nombre de pila lo
 * lleven dos identidades distintas (entonces, el completo). Se calcula sobre todos los escenarios a la vez:
 * «Ana» en P1 y «Ana» en P2 tienen que ser la misma Ana.
 */
export function nombresParaEtiquetas(figuras: ReadonlyArray<FigurasEscenario | null>): Map<string, string> {
  const porPila = new Map<string, Set<string>>()
  const personas: PersonaEscenario[] = []
  for (const f of figuras) {
    if (!f) continue
    for (const p of [f.tomador, f.propietario, f.conductor, f.ocasional]) {
      if (!p) continue
      personas.push(p)
      const pila = (p.pila ?? p.completo ?? '').toLowerCase()
      if (!porPila.has(pila)) porPila.set(pila, new Set())
      porPila.get(pila)!.add(identidadPersona(p))
    }
  }
  const out = new Map<string, string>()
  for (const p of personas) {
    const id = identidadPersona(p)
    if (out.has(id)) continue
    const pila = (p.pila ?? p.completo ?? '').toLowerCase()
    const ambiguo = (porPila.get(pila)?.size ?? 0) > 1
    out.set(id, (ambiguo ? p.completo : p.pila) ?? p.completo ?? p.pila ?? 'sin nombre')
  }
  return out
}

/** ¿El ramo tiene figuras de vehículo (propietario, conductores)? Mismo criterio que `rolesDelRamo`. */
function esVehiculo(ramo: string): boolean {
  return ramo === 'auto' || ramo === 'moto'
}

/**
 * «Tomador: Ana · Conductor: Ana · Propietario: Rafael». Fuera de coche y moto, solo el tomador.
 * Una figura que no viene en la petición es «no consta» (nunca se rellena con el tomador).
 */
export function etiquetaEscenario(f: FigurasEscenario | null, ramo: string, nombres: Map<string, string>): string {
  if (!f) return 'Intervinientes: no constan'
  const n = (p: PersonaEscenario | null) => (p ? nombres.get(identidadPersona(p)) ?? p.pila ?? p.completo ?? 'sin nombre' : 'no consta')
  const partes = [`Tomador: ${n(f.tomador)}`]
  if (esVehiculo(ramo)) {
    partes.push(`Conductor: ${n(f.conductor)}`, `Propietario: ${n(f.propietario)}`)
    if (f.ocasional) partes.push(`Ocasional: ${n(f.ocasional)}`)
  }
  return partes.join(' · ')
}

// ─── El seguro anterior que se declaró en ESA tarificación ──────────────────

export type SeguroAnteriorEscenario =
  | { estado: 'no_consta' }
  | { estado: 'sin_seguro' }
  | { estado: 'declarado'; companiaCodigo: string | null; aniosSinSiniestros: number | null; aniosAsegurado: number | null }

/** Lo que dijo la petición. `previouslyInsured: false` es «declaró que no tenía»; ausente es «no consta». */
export function seguroAnteriorDePeticion(peticion: unknown): SeguroAnteriorEscenario {
  const risk = obj(obj(peticion)?.risk)
  if (!risk) return { estado: 'no_consta' }
  const previa = obj(risk.previousInsurance)
  if (previa) {
    const codigo = obj(previa.previousCompany)?.code
    return {
      estado: 'declarado',
      companiaCodigo: typeof codigo === 'number' ? String(codigo) : txt(codigo),
      aniosSinSiniestros: entero(previa.yearsWithoutAccidents),
      aniosAsegurado: entero(previa.totalYearsInsured),
    }
  }
  if (risk.previouslyInsured === false) return { estado: 'sin_seguro' }
  return { estado: 'no_consta' }
}

/** Una línea para el documento. `compania` = nombre legible del código DGS, si se conoce. */
export function textoSeguroAnterior(s: SeguroAnteriorEscenario, compania: string | null): string {
  if (s.estado === 'no_consta') return 'Seguro anterior: no consta'
  if (s.estado === 'sin_seguro') return 'Seguro anterior: declarado sin seguro previo'
  const quien = compania ?? (s.companiaCodigo ? `compañía ${s.companiaCodigo}` : 'compañía no consta')
  const anios = s.aniosSinSiniestros === null
    ? 'años sin siniestros: no consta'
    : `${s.aniosSinSiniestros} ${s.aniosSinSiniestros === 1 ? 'año' : 'años'} sin siniestros`
  return `Seguro anterior: ${quien} · ${anios}`
}

// ─── Orden y «la más económica» ──────────────────────────────────────────────

export type OpcionEscenario = {
  compania: string
  producto: string | null
  modalidad: string | null
  /** Prima ANUAL. `null` = ilegible: nunca cuenta como la más barata. */
  primaEur: number | null
  coberturas: readonly string[]
}

export type EscenarioEntrada = {
  presupuestoId: string
  /** Referencia propia del presupuesto (`AS-AA-NNNN`); `null` = la BD aún no la tiene. */
  referencia: string | null
  ramo: string
  figuras: FigurasEscenario | null
  seguroAnterior: SeguroAnteriorEscenario
  opciones: readonly OpcionEscenario[]
}

export type EscenarioOrdenado = Omit<EscenarioEntrada, 'opciones'> & {
  /** 1, 2… en el orden FINAL del documento. */
  numero: number
  etiqueta: string
  /** Las opciones de la más barata a la más cara; las de prima ilegible, al final. */
  opciones: OpcionEscenario[]
  /** La prima más baja del escenario. `null` = ninguna opción con prima legible. */
  primaMinima: number | null
  masEconomica: boolean
}

/** Cuántas coberturas «clave» caben por opción en el documento (el resto, en el presupuesto de cada una). */
export const MAX_COBERTURAS_CLAVE = 6

export function coberturasClave(lista: readonly string[], max = MAX_COBERTURAS_CLAVE): string[] {
  const vistas = new Set<string>()
  const out: string[] = []
  for (const c of lista) {
    const t = c.trim()
    if (!t || vistas.has(t.toLowerCase())) continue
    vistas.add(t.toLowerCase())
    out.push(t)
    if (out.length >= max) break
  }
  return out
}

const porPrima = (a: number | null, b: number | null) => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : a - b)

/**
 * Ordena los escenarios por su prima más baja (los que no tienen ninguna legible, al final y en el orden en
 * que se eligieron) y marca «la más económica»: el escenario de prima mínima. Un empate exacto marca a los
 * dos (son igual de económicos; elegir uno sería inventar). Sin ninguna prima legible, no se marca ninguno.
 */
export function ordenarEscenarios(entrada: readonly EscenarioEntrada[]): EscenarioOrdenado[] {
  const nombres = nombresParaEtiquetas(entrada.map((e) => e.figuras))
  const conMinimo = entrada.map((e, i) => {
    const opciones = [...e.opciones].sort((a, b) => porPrima(a.primaEur, b.primaEur))
    const legibles = opciones.map((o) => o.primaEur).filter((x): x is number => x !== null && Number.isFinite(x))
    return { e, i, opciones, primaMinima: legibles.length ? Math.min(...legibles) : null }
  })
  conMinimo.sort((a, b) => porPrima(a.primaMinima, b.primaMinima) || a.i - b.i)
  const minimo = conMinimo[0]?.primaMinima ?? null
  return conMinimo.map(({ e, opciones, primaMinima }, k) => ({
    presupuestoId: e.presupuestoId,
    referencia: e.referencia,
    ramo: e.ramo,
    figuras: e.figuras,
    seguroAnterior: e.seguroAnterior,
    numero: k + 1,
    etiqueta: etiquetaEscenario(e.figuras, e.ramo, nombres),
    opciones: opciones.map((o) => ({ ...o, coberturas: coberturasClave(o.coberturas) })),
    primaMinima,
    masEconomica: minimo !== null && primaMinima !== null && primaMinima === minimo,
  }))
}

// ─── El aviso del lote (sin precio, ni compañía, ni el bien asegurado) ───────
// Mismo criterio que `mensaje-presupuesto.ts`: el aviso puede caer en un buzón compartido; el contenido lo abre
// el código de un solo uso en el portal. Cada enlace es UN escenario de ESTE tomador: el portal solo enseña un
// presupuesto a su tomador, así que los escenarios a nombre de otra persona le llegan a ella aparte.

export type DatosAvisoPropuesta = {
  nombre: string | null
  /** Referencia del lote (`ASP-AA-NNNN`). */
  referencia: string
  /** Los escenarios de ESTE tomador, en el orden del documento. `numero` es el del documento (1, 2…). */
  enlaces: ReadonlyArray<{ numero: number; enlace: string }>
  /** Cuántos escenarios tiene la propuesta entera (incluidos los de otro tomador). */
  total: number
  email: string
  /** El primer vencimiento de los presupuestos que se avisan: hasta cuándo valen TODOS. */
  venceEl: Date
}

/**
 * El WhatsApp del lote. Cada enlace lleva SU código de acceso (el de `mensajePresupuestoWhatsapp`, uno por
 * presupuesto: hasheado y atado a su token), así que no depende del correo. Si se puede afirmar su correo,
 * se le nombra como alternativa (le llegará otro código).
 */
export type DatosWhatsappPropuesta = Omit<DatosAvisoPropuesta, 'email' | 'enlaces'> & {
  email: string | null
  enlaces: ReadonlyArray<{ numero: number; enlace: string; codigo: string }>
}

function fechaEs(d: Date): string {
  return d.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' })
}
function saludo(nombre: string | null): string {
  const n = nombre?.trim()
  return n ? `Hola, ${n.split(/\s+/)[0]}` : 'Hola'
}
function lineaEnlace(e: { numero: number; enlace: string }): string {
  return `Escenario ${e.numero}: ${e.enlace}`
}
function lineasLote<E extends { numero: number; enlace: string }>(
  d: { referencia: string; total: number; enlaces: ReadonlyArray<E> }, linea: (e: E) => string = lineaEnlace,
): string[] {
  const otros = d.total - d.enlaces.length
  return [
    d.total > 1
      ? `Te he preparado una propuesta con ${d.total} escenarios (referencia ${d.referencia}): en cada uno cambia quién figura como tomador, conductor o propietario.`
      : `Te he preparado una propuesta (referencia ${d.referencia}).`,
    ...d.enlaces.map(linea),
    ...(otros > 0 ? [`${otros === 1 ? 'El otro escenario va' : `Los otros ${otros} escenarios van`} a nombre de otra persona y le llega${otros === 1 ? '' : 'n'} a ella por separado.`] : []),
  ]
}

export function mensajePropuestaWhatsapp(d: DatosWhatsappPropuesta): string {
  const email = d.email?.trim() || null
  // El código va ANTES de su enlace, como en el WhatsApp suelto: que lo lea antes de pulsar.
  return [
    `${saludo(d.nombre)}. Soy Alberto, de Grupo ASegura.`,
    ...lineasLote(d, (e) => `Escenario ${e.numero} (tu código de acceso es ${e.codigo}): ${e.enlace}`),
    `Al abrir cada enlace te pedirá su código de acceso, el que va junto a él. Te servirá también para aceptarlo si te convence.`,
    email ? `Si lo prefieres, también puedes entrar con tu correo ${email}: te llegará otro código.` : null,
    `Son válidos hasta el ${fechaEs(d.venceEl)}. Cualquier duda, me dices.`,
  ].filter((l): l is string => l !== null).join('\n\n')
}

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const AZUL = '#3364ee'
const TINTA = '#1b2340'
const LOGO_CORREO = 'https://grupoasegura.es/brand/logotipo-asegura-correo.png'

export function correoPropuesta(d: DatosAvisoPropuesta): { asunto: string; texto: string; html: string } {
  const asunto = d.total > 1 ? 'Tu propuesta de seguro con varios escenarios está lista' : 'Tu propuesta de seguro está lista'
  const vence = `Son válidos hasta el ${fechaEs(d.venceEl)}.`
  const codigo = 'Entra con este mismo correo: te llegará un código de acceso.'
  const texto = [`${saludo(d.nombre)}:`, ...lineasLote(d), codigo, vence, 'Si tienes cualquier duda, responde a este correo.', 'Alberto Suárez · Grupo ASegura'].join('\n\n')
  const cuerpo = "font-family:'Nunito Sans',system-ui,-apple-system,Segoe UI,Roboto,sans-serif"
  const titular = 'font-family:Quicksand,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-weight:700'
  const p = (t: string, extra = '') => `<p style="font-size:16px;line-height:1.6;margin:0 0 14px${extra}">${escapar(t)}</p>`
  const [intro, ...resto] = lineasLote(d)
  const otros = resto.slice(d.enlaces.length)
  const botones = d.enlaces
    .map((e) => `<div style="text-align:center;margin:12px 0"><a href="${escapar(e.enlace)}" style="display:inline-block;background:${AZUL};color:#fff;text-decoration:none;${titular};font-size:17px;padding:14px 28px;border-radius:10px">Ver escenario ${e.numero}</a></div>`)
    .join('')
  const html = [
    `<div style="background:#f3f5fc;padding:24px 12px">`,
    `<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e6e9f5;${cuerpo};color:${TINTA}">`,
    `<div style="padding:28px 32px 20px;border-bottom:4px solid ${AZUL}"><img src="${LOGO_CORREO}" width="220" height="32" alt="Grupo ASegura" style="display:block;width:220px;height:auto;border:0"></div>`,
    `<div style="padding:28px 32px">`,
    `<p style="${titular};font-size:24px;line-height:1.25;color:${AZUL};margin:0 0 14px">${escapar(saludo(d.nombre))}, tu propuesta está lista</p>`,
    p(intro!),
    botones,
    ...otros.map((t) => p(t)),
    p(codigo),
    p(vence, ';font-weight:700'),
    p('Si tienes cualquier duda, responde a este correo.'),
    `<p style="font-size:16px;line-height:1.5;margin:22px 0 0">Un saludo,<br><strong>Alberto Suárez</strong><br>Grupo ASegura</p>`,
    `</div>`,
    `<div style="background:#f3f5fc;padding:14px 32px;font-size:12px;line-height:1.5;color:#5a6280">Si un botón no funciona, copia su enlace en el navegador:<br>${d.enlaces.map((e) => `Escenario ${e.numero}: <a href="${escapar(e.enlace)}" style="color:${AZUL};word-break:break-all">${escapar(e.enlace)}</a>`).join('<br>')}</div>`,
    `</div></div>`,
  ].join('')
  return { asunto, texto, html }
}
