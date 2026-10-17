// LOCALIZADOR COMÚN de controles (15/10/2026). Origen: el bot de Allianz Turismos se atascó con DOS «Matrícula» (la del
// formulario y el buscador «Buscar Aquí...» de la cabecera). Reglas DETERMINISTAS, reutilizables por todos los adaptadores:
//
//   1º PISTAS APRENDIDAS (lo que Alberto eligió en un atasco con un toque; `seguros.tarificador_conocimiento`, clave
//      `clavePista(paso, etiqueta)`): una pista que no casa con EXACTAMENTE un control válido se ignora y se informa (log +
//      fallo a asegura al cerrar: dos fallos seguidos la descartan).
//   2º HEURÍSTICA: por etiqueta (o rol + nombre) SOLO dentro del contenedor principal del formulario; fuera cabecera, `nav`,
//      menús, buscadores, controles ocultos o deshabilitados y campos bancarios o de pago. Queda 1 → ese. 0 o ≥2 → error de
//      mapa incompleto con los candidatos y, con el formador encendido, ATASCO: Telegram con un botón por candidato («usar
//      este»), cuyo selector es ya la PISTA estable que se aprenderá.
//
// 🚨 Este fichero NO pulsa ni rellena: devuelve un Locator que el adaptador usa por su camino guardado (guard.ts). Una pista
//    solo sirve para LOCALIZAR, y nunca un campo bancario o de pago (`validarPista` + la frontera de `senalCuentaBancaria`).
// 🔒 Nunca lee el VALOR de un control. Lo que sale (error, atasco, log) es estructura redactada.

import type { Frame, Locator, Page } from 'playwright'
import {
  MAX_CANDIDATOS_ATASCO,
  ROLES_PISTA,
  ambitoCerrado,
  clavePista,
  limpiarTextoAviso,
  normalizarEtiquetaPista,
  pistaDeDescripcion,
  redactarDatosPersonales,
  senalCuentaBancaria,
  textoBancarioOPago,
  pareceEmision,
  validarPista,
  type AtascoWorker,
  type Pista,
} from '@central/module-tarificacion'
import { ErrorTarificador } from './errores.ts'
import {
  SELECTOR_CAMPOS,
  TIPOS_INPUT_EDITABLES,
  anotarUso,
  confirmarAprendido,
  enPagina,
  nombreMarco,
  normalizarTexto,
  ordenarAprendido,
  type ContextoFormador,
} from './formador.ts'

/** Contenedor principal por defecto: el primero que exista (el adaptador puede fijar el suyo). */
export const CONTENEDORES_POR_DEFECTO = ['main', '[role=main]', '#appArea:not(iframe):not(frame)', '#content', '#contenido', '.main-content'] as const

/** Zonas que NUNCA son el formulario: cabecera, navegación, menús, buscadores. */
export const SELECTOR_ZONAS_EXCLUIDAS = 'header, nav, nx-header, mat-toolbar, [role=banner], [role=navigation], [role=menu], [role=menubar], [role=search], [role=toolbar]'

/** Placeholder / nombre de un buscador («Buscar Aquí...», «Search»). */
const RE_BUSCADOR = /^\s*(?:buscar|busca|busqueda|search)\b/

export type RolControl = (typeof ROLES_PISTA)[number]

export type BusquedaControl = {
  /** Paso del formulario (entra en la clave de la pista: la misma etiqueta en dos pasos no se mezcla). */
  paso: string
  /** Etiqueta visible del control (label/aria-label/aria-labelledby). Exacta tras normalizar (sin «*», «:», tildes, mayúsculas). */
  etiqueta?: string
  /** Alternativa a la etiqueta: rol ARIA + nombre accesible exacto. */
  rol?: RolControl
  nombre?: string
}

export type OpcionesLocalizar = {
  /** Para el mensaje del error («allianz/auto»). */
  adaptador: string
  /** Contenedor del formulario. Si lo fija el adaptador y no aparece, no hay candidatos (no se cae a toda la página). */
  contenedor?: string
  /** Formador del trabajo: trae las pistas aprendidas, recibe el atasco y los avisos. Sin él, solo heurística. */
  formador?: ContextoFormador
  /** El adaptador SABE que su campo es un autocompletado con placeholder «Buscar…» dentro del formulario. */
  admitirBuscador?: boolean
  /** Marca el error para que el runner adjunte el inventario de estructura (por defecto no). */
  pideInventarioDom?: boolean
}

export type Localizado = {
  locator: Locator
  origen: 'pista' | 'heuristica'
  clave: string
  /** Llamar SOLO tras usarlo sin error: suma una confirmación a la pista (en la heurística no hace nada). */
  confirmar: () => Promise<void>
}

/** Lo que se lee de un control en la página (estructura; nunca su valor). */
export type DescripcionControl = {
  tag: string
  type: string | null
  id: string | null
  name: string | null
  formcontrolname: string | null
  testid: string | null
  rol: string | null
  etiqueta: string | null
  placeholder: string | null
  ariaLabel: string | null
  title: string | null
  seccion: string | null
  oculto: boolean
  deshabilitado: boolean
  /** La zona excluida que lo contiene (tag o rol), o `null`. */
  zonaExcluida: string | null
  /** `[contenteditable]` (isContentEditable). */
  editableContenido?: boolean
}

export type MotivoDescarte = 'oculto' | 'deshabilitado' | 'cabecera_o_menu' | 'buscador' | 'bancario_o_pago' | 'emision' | 'etiqueta_distinta' | 'no_editable'

/** Candidato que viaja en el error (y, con su pista, en el atasco). */
export type CandidatoLocalizado = { n: number; tag: string; id: string | null; name: string | null; type: string | null; rol: string | null; etiqueta: string | null; pista: string | null }

/** Error de mapa incompleto del localizador (misma forma que el de los adaptadores: `portal`, definitivo, con `pideInventarioDom`). */
export class ErrorMapaIncompleto extends ErrorTarificador {
  readonly pideInventarioDom: boolean
  readonly sinAtasco = false
  readonly candidatos: readonly CandidatoLocalizado[]
  /** Qué decidió la heurística: `varios` (≥2 válidos: `candidatos` son ellos), `ninguno`, o `null` (sin contenedor). */
  readonly decision: 'ninguno' | 'varios' | null
  constructor(adaptador: string, que: string, candidatos: readonly CandidatoLocalizado[] = [], pideInventarioDom = false, decision: 'ninguno' | 'varios' | null = null) {
    super('portal', `${adaptador}: mapa incompleto: faltan ${redactarDatosPersonales(que)}`)
    this.name = 'ErrorMapaIncompleto'
    this.pideInventarioDom = pideInventarioDom
    this.candidatos = candidatos
    this.decision = decision
  }
}

// ─── Reglas puras ────────────────────────────────────────────────────────────

/** Las descripciones de un control que mira la frontera bancaria (las mismas que `exigirCampoNoBancario` de guard.ts). */
export function descripcionesFrontera(d: DescripcionControl): string[] {
  return [d.etiqueta, d.name, d.id, d.formcontrolname, d.ariaLabel, d.placeholder, d.title, d.seccion].filter((x): x is string => typeof x === 'string' && x !== '')
}

/** Lo que el propio control dice de sí (sin el título de su sección): sobre esto se mira la emisión. */
function descripcionesVivas(d: DescripcionControl): string[] {
  return descripcionesFrontera({ ...d, seccion: null })
}

/** ¿Es un control EDITABLE? `<input>` de tipo editable (no hidden/submit/button/casillas), `<select>`, `<textarea>`,
 * `[contenteditable]` o un rol de campo (`ROLES_PISTA`). PURA. */
export function esControlEditable(d: Pick<DescripcionControl, 'tag' | 'type' | 'rol' | 'editableContenido'>): boolean {
  const tag = d.tag.toLowerCase()
  if (tag === 'input') return (TIPOS_INPUT_EDITABLES as readonly string[]).includes((d.type ?? '').toLowerCase())
  if (tag === 'select' || tag === 'textarea' || d.editableContenido === true) return true
  return (ROLES_PISTA as readonly string[]).includes((d.rol ?? '').toLowerCase())
}

/**
 * Por qué se descarta un control, o `null` si vale. Orden fijo (el primer motivo gana). `etiqueta`: si se busca por etiqueta,
 * la del control tiene que ser IGUAL tras normalizar («Matrícula *» = «matrícula»; «Matrícula del remolque» no); si no se
 * pudo leer, NO casa. `etiquetaPista`: la etiqueta (ya normalizada) con la que se aprendió una pista; igual, exacta. PURA.
 */
export function motivoDescarte(d: DescripcionControl, o: { etiqueta?: string | null; etiquetaPista?: string | null; admitirBuscador?: boolean; soloEditables?: boolean } = {}): MotivoDescarte | null {
  if (d.oculto) return 'oculto'
  if (d.deshabilitado) return 'deshabilitado'
  if (d.zonaExcluida !== null) return 'cabecera_o_menu'
  if (!o.admitirBuscador) {
    const tipoBuscador = (d.type ?? '').toLowerCase() === 'search' || (d.rol ?? '').toLowerCase() === 'searchbox'
    const textoBuscador = [d.placeholder, d.ariaLabel, d.title].some((t) => typeof t === 'string' && RE_BUSCADOR.test(normalizarTexto(t)))
    if (tipoBuscador || textoBuscador) return 'buscador'
  }
  if (senalCuentaBancaria(descripcionesFrontera(d)) !== null || descripcionesFrontera(d).some((t) => textoBancarioOPago(t))) return 'bancario_o_pago'
  if (descripcionesVivas(d).some((t) => pareceEmision(t))) return 'emision'
  if (o.soloEditables && !esControlEditable(d)) return 'no_editable'
  if (o.etiqueta && (d.etiqueta === null || normalizarTexto(d.etiqueta) !== normalizarTexto(o.etiqueta))) return 'etiqueta_distinta'
  if (o.etiquetaPista !== undefined && (!o.etiquetaPista || normalizarEtiquetaPista(d.etiqueta) !== o.etiquetaPista)) return 'etiqueta_distinta'
  return null
}

export type Decision = { tipo: 'unico'; indice: number } | { tipo: 'ninguno' } | { tipo: 'varios'; indices: number[] }

/** Exactamente 1 válido → ese; 0 → ninguno; ≥2 → varios (no se adivina). PURA. */
export function decidir(descs: readonly DescripcionControl[], o: Parameters<typeof motivoDescarte>[1] = {}): { decision: Decision; descartes: { indice: number; motivo: MotivoDescarte }[] } {
  const validos: number[] = []
  const descartes: { indice: number; motivo: MotivoDescarte }[] = []
  descs.forEach((d, i) => {
    const m = motivoDescarte(d, o)
    if (m) descartes.push({ indice: i, motivo: m })
    else validos.push(i)
  })
  const decision: Decision = validos.length === 1 ? { tipo: 'unico', indice: validos[0]! } : validos.length === 0 ? { tipo: 'ninguno' } : { tipo: 'varios', indices: validos }
  return { decision, descartes }
}

/** Etiqueta que ve Alberto: la del control y su sección («Matrícula · Datos del vehículo»), redactada. PURA. */
export function etiquetaVisible(d: Pick<DescripcionControl, 'etiqueta' | 'placeholder' | 'ariaLabel' | 'seccion'>): string | null {
  const base = d.etiqueta ?? d.ariaLabel ?? d.placeholder
  const t = [base, d.seccion].filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.replace(/\s+/g, ' ').trim()).join(' · ')
  return t ? redactarDatosPersonales(t).slice(0, 120) : null
}

/** Texto del error con los candidatos (sin valores; se redacta en el constructor del error). PURA. */
export function textoFalta(que: string, ambito: string | null, decision: Decision, candidatos: readonly CandidatoLocalizado[], descartes: readonly { motivo: MotivoDescarte }[]): string {
  const donde = ambito ? `en «${ambito}»` : 'en toda la página (sin contenedor principal)'
  const cuenta = decision.tipo === 'ninguno' ? 'ningún candidato válido' : `${candidatos.length} candidatos válidos y no se elige a ciegas`
  const lista = candidatos.slice(0, 8).map((c) => `${c.n}: ${c.tag}${c.name ? `[name=${c.name}]` : ''}${c.etiqueta ? ` «${c.etiqueta}»` : ''}`).join('; ')
  const porMotivo = new Map<string, number>()
  for (const d of descartes) porMotivo.set(d.motivo, (porMotivo.get(d.motivo) ?? 0) + 1)
  const desc = [...porMotivo].map(([m, n]) => `${n} ${m}`).join(', ')
  return `${que} ${donde}: ${cuenta}${lista ? ` [${lista}]` : ''}${desc ? ` (descartados: ${desc})` : ''}`
}

// ─── DOM ─────────────────────────────────────────────────────────────────────

type Raiz = Page | Frame

const esPagina = (r: Raiz): r is Page => typeof (r as Page).mainFrame === 'function'
const marcoDe = (r: Raiz): string => (esPagina(r) ? 'principal' : nombreMarco(r.page(), r))

/** Describe los controles de un locator EN EL NAVEGADOR (estructura; nunca `value`). */
async function describir(l: Locator): Promise<DescripcionControl[]> {
  return l.evaluateAll(
    enPagina((els: Element[], zonas: string) =>
      els.map((el) => {
        const h = el as HTMLInputElement
        const tag = h.tagName.toLowerCase()
        const type = (h.getAttribute('type') ?? '').toLowerCase() || null
        const cs = getComputedStyle(h)
        const oculto = h.getClientRects().length === 0 || cs.visibility !== 'visible' || cs.display === 'none' || !!h.closest('[hidden], [aria-hidden="true"]')
        const deshabilitado = h.disabled === true || h.getAttribute('aria-disabled') === 'true' || !!h.closest('fieldset[disabled]')
        const zona = h.closest(zonas)
        const explicito = h.getAttribute('role')
        const implicito =
          tag === 'textarea' ? 'textbox'
            : tag === 'select' ? (h.hasAttribute('multiple') ? 'listbox' : 'combobox')
              : tag === 'input' ? (type === 'search' ? 'searchbox' : type === 'number' ? 'spinbutton' : ['', 'text', 'email', 'tel', 'url', null].includes(type) ? 'textbox' : null)
                : null
        // Texto de un nodo de ETIQUETA sin nada que pueda llevar el VALOR de un control: se salta el propio control (y todo lo
        // suyo) y cualquier control o parte de control (opciones, combobox, contenteditable…) que haya dentro. Recortado.
        const CONTROLES = 'input, select, textarea, button, option, [contenteditable], [role=combobox], [role=textbox], [role=listbox], [role=option], [role=spinbutton], [role=searchbox]'
        const textoPropio = (n: Element | null): string | null => {
          if (!n || n === h || h.contains(n)) return null
          const partes: string[] = []
          const andar = (x: Node) => {
            if (x.nodeType === 3) { partes.push(x.textContent ?? ''); return }
            if (x.nodeType !== 1) return
            const e = x as Element
            if (e === h || e.matches(CONTROLES)) return
            e.childNodes.forEach(andar)
          }
          n.childNodes.forEach(andar)
          const t = partes.join(' ').replace(/\s+/g, ' ').trim().slice(0, 100).trim()
          return t || null
        }
        let etiqueta: string | null = h.labels && h.labels.length > 0 ? textoPropio(h.labels[0]!) : null
        if (!etiqueta) etiqueta = (h.getAttribute('aria-label') ?? '').replace(/\s+/g, ' ').trim().slice(0, 100) || null
        if (!etiqueta) {
          const lb = h.getAttribute('aria-labelledby')
          if (lb) etiqueta = lb.split(/\s+/).map((i) => textoPropio(document.getElementById(i)) ?? '').join(' ').replace(/\s+/g, ' ').trim().slice(0, 100).trim() || null
        }
        const leyenda = h.closest('fieldset')?.querySelector('legend')
        const grupo = h.closest('[role=group][aria-label], [role=region][aria-label], section[aria-label]')
        const titulo = h.closest('section, fieldset, form')?.querySelector('h1, h2, h3, h4, h5, h6')
        const seccion = textoPropio(leyenda ?? null) ?? grupo?.getAttribute('aria-label') ?? textoPropio(titulo ?? null)
        return {
          tag,
          type,
          id: h.id || null,
          name: h.getAttribute('name'),
          formcontrolname: h.getAttribute('formcontrolname'),
          testid: h.getAttribute('data-testid'),
          rol: explicito ?? implicito,
          etiqueta,
          placeholder: h.getAttribute('placeholder'),
          ariaLabel: h.getAttribute('aria-label'),
          title: h.getAttribute('title'),
          seccion: seccion ? seccion.slice(0, 60) : null,
          oculto,
          deshabilitado,
          zonaExcluida: zona ? zona.getAttribute('role') ?? zona.tagName.toLowerCase() : null,
          editableContenido: (h as HTMLElement).isContentEditable === true,
        }
      }),
    ),
    SELECTOR_ZONAS_EXCLUIDAS,
  )
}

/** El contenedor del formulario: el del adaptador o el primer `CONTENEDORES_POR_DEFECTO` presente. `null` = no hay. */
async function contenedor(raiz: Raiz, o: OpcionesLocalizar): Promise<{ sel: string | null; l: Locator | null }> {
  if (o.contenedor) {
    const l = raiz.locator(o.contenedor)
    return { sel: o.contenedor, l: (await l.count().catch(() => 0)) > 0 ? l : null }
  }
  for (const sel of CONTENEDORES_POR_DEFECTO) {
    const l = raiz.locator(sel)
    if ((await l.count().catch(() => 0)) > 0) return { sel, l }
  }
  return { sel: null, l: null }
}

/** Locator de una pista ya validada (la gramática cerrada de module-tarificacion/pista.ts; nada de CSS libre). */
export function locatorDePista(raiz: Raiz, p: Pista): Locator {
  const base = p.ambito ? raiz.locator(p.ambito) : raiz.locator(':root')
  return p.base.tipo === 'css'
    ? base.locator(`${p.base.tag ?? ''}[${p.base.atributo}="${p.base.valor}"]`)
    : base.getByRole(p.base.rol, { name: p.base.nombre, exact: true })
}

const informar = (f: ContextoFormador | undefined, m: string, datos: Record<string, unknown>) => f?.log(m, datos)

/** 1º Las pistas aprendidas para esta clave. Devuelve el Locator si UNA casa con exactamente un control válido. */
async function porPistas(raiz: Raiz, clave: string, o: OpcionesLocalizar): Promise<Localizado | null> {
  const f = o.formador
  if (!f?.activo) return null
  const pistas = ordenarAprendido(f.conocimiento.filter((c) => c.clave === clave && c.tipo === 'campo'))
  const marco = marcoDe(raiz)
  for (const c of pistas) {
    const v = validarPista(c.selector)
    if (!v.ok) {
      informar(f, 'localizar_pista_ignorada', { clave, motivo: v.motivo })
      anotarUso(f, c, { rechazado: true })
      continue
    }
    // El MARCO en el que se aprendió tiene que ser este (sin marco guardado, no casa).
    if (c.marco !== marco) {
      informar(f, 'localizar_pista_ignorada', { clave, motivo: 'aprendida en otro marco' })
      anotarUso(f, c, { rechazado: true })
      continue
    }
    const l = locatorDePista(raiz, v.pista)
    const descs = await describir(l).catch(() => [] as DescripcionControl[])
    // Control editable y con la MISMA etiqueta (exacta normalizada) con la que se aprendió; sin etiqueta legible, no casa.
    const { decision } = decidir(descs, { etiquetaPista: v.pista.etiqueta, admitirBuscador: o.admitirBuscador, soloEditables: true })
    if (decision.tipo !== 'unico') {
      informar(f, 'localizar_pista_ignorada', { clave, motivo: decision.tipo === 'ninguno' ? 'no encuentra ningún control válido' : `encuentra ${decision.indices.length} controles válidos`, coincidencias: descs.length })
      anotarUso(f, c, { rechazado: true })
      continue
    }
    anotarUso(f, c, {})
    informar(f, 'localizar_pista', { clave })
    const origen = c.origen === 'humano' ? 'humano' : c.origen === 'ia' ? 'ia' : 'codigo'
    return {
      locator: l.nth(decision.indice),
      origen: 'pista',
      clave,
      confirmar: () => confirmarAprendido(f, { clave, tipo: 'campo', selector: c.selector, marco: c.marco, origen }),
    }
  }
  return null
}

/** Candidatos con su PISTA estable y ÚNICA en la página (la que se aprendería si Alberto lo elige). */
async function candidatosConPista(raiz: Raiz, ambito: string | null, descs: readonly DescripcionControl[], indices: readonly number[]): Promise<CandidatoLocalizado[]> {
  const out: CandidatoLocalizado[] = []
  for (const i of indices) {
    const d = descs[i]!
    let pista = pistaDeDescripcion({ tag: d.tag, id: d.id, name: d.name, formcontrolname: d.formcontrolname, testid: d.testid, rol: d.rol, nombre: d.etiqueta }, ambito)
    if (pista) {
      const v = validarPista(pista)
      const n = v.ok ? await locatorDePista(raiz, v.pista).count().catch(() => 0) : 0
      if (n !== 1) pista = null
    }
    out.push({ n: out.length + 1, tag: d.tag, id: d.id, name: d.name, type: d.type, rol: d.rol, etiqueta: etiquetaVisible(d), pista })
  }
  return out
}

/** Deja el checkpoint del ATASCO en el formador (solo candidatos con pista: lo elegido tiene que poder aprenderse). */
function prepararAtasco(f: ContextoFormador | undefined, clave: string, que: string, etiqueta: string | null, marco: string, candidatos: readonly CandidatoLocalizado[]): boolean {
  if (!f?.activo) return false
  const conPista = candidatos.filter((c) => c.pista !== null).slice(0, MAX_CANDIDATOS_ATASCO)
  if (!conPista.length) {
    informar(f, 'localizar_atasco_sin_pistas', { clave, candidatos: candidatos.length })
    return false
  }
  const atasco: AtascoWorker = {
    clave,
    tipo: 'campo',
    descripcion: limpiarTextoAviso(`${que}: elige cuál es (queda aprendido para la próxima vez)`, f.redactar, 300) ?? clave,
    etiqueta: limpiarTextoAviso(etiqueta, f.redactar, 120),
    textoEsperado: null,
    candidatos: conPista.map((c, i) => ({ n: i + 1, tag: c.tag, id: c.id, name: c.name, type: c.type, role: c.rol, texto: null, etiqueta: c.etiqueta, marco, selector: c.pista! })),
  }
  f.atasco = atasco
  informar(f, 'localizar_atasco', { clave, candidatos: atasco.candidatos.length })
  return true
}

/** Ámbito de las pistas: el contenedor sin `:not(...)` y solo si es CSS cerrado (`ambitoCerrado`); si no, sin ámbito. PURA. */
export function ambitoDePista(sel: string | null): string | null {
  if (!sel) return null
  const a = sel.replace(/:not\([^()]*\)/g, '').trim()
  return a && ambitoCerrado(a) ? a : null
}

/**
 * Localiza UN control por etiqueta (o rol + nombre) con las reglas de arriba. Devuelve el Locator (el adaptador lo rellena por
 * su camino guardado) o lanza `ErrorMapaIncompleto` con los candidatos (y deja el atasco si el formador está encendido).
 */
export async function localizarControl(raiz: Raiz, b: BusquedaControl, o: OpcionesLocalizar): Promise<Localizado> {
  const texto = b.etiqueta ?? b.nombre ?? b.rol ?? ''
  if (!texto.trim() || (!b.etiqueta && !b.rol)) throw new ErrorTarificador('portal', `${o.adaptador}: localizar sin etiqueta ni rol`)
  const clave = clavePista(b.paso, texto)
  const que = `el control «${texto}» del paso «${b.paso}»`

  const porPista = await porPistas(raiz, clave, o)
  if (porPista) return porPista

  const { sel: ambito, l: cont } = await contenedor(raiz, o)
  // Sin atasco propio → `pideInventarioDom` para que la red de la capa común (`atascoDeRespaldoHueco`) deje uno de respaldo.
  if (!cont && o.contenedor) throw new ErrorMapaIncompleto(o.adaptador, `${que}: no aparece el contenedor «${o.contenedor}»`, [], true)
  if (!cont) informar(o.formador, 'localizar_sin_contenedor', { clave })
  const zona = cont ?? raiz.locator('body')
  const matches = b.etiqueta ? zona.getByLabel(b.etiqueta) : zona.getByRole(b.rol!, { name: b.nombre ?? '', exact: true })
  const descs = await describir(matches).catch(() => [] as DescripcionControl[])
  const reglas = { etiqueta: b.etiqueta ?? null, admitirBuscador: o.admitirBuscador, soloEditables: true }
  const { decision, descartes } = decidir(descs, reglas)
  if (decision.tipo === 'unico') {
    return { locator: matches.nth(decision.indice), origen: 'heuristica', clave, confirmar: async () => undefined }
  }

  // 0 o ≥2: candidatos para el error y el atasco. Con 0, los controles editables válidos del contenedor (Alberto señala el bueno).
  let candidatos: CandidatoLocalizado[]
  if (decision.tipo === 'varios') {
    candidatos = await candidatosConPista(raiz, ambitoDePista(ambito), descs, decision.indices)
  } else {
    const todos = zona.locator(SELECTOR_CAMPOS)
    const dTodos = (await describir(todos).catch(() => [] as DescripcionControl[])).slice(0, 200)
    const validos = dTodos.map((d, i) => ({ d, i })).filter(({ d }) => motivoDescarte(d, { soloEditables: true, admitirBuscador: o.admitirBuscador }) === null).map(({ i }) => i)
    candidatos = await candidatosConPista(raiz, ambitoDePista(ambito), dTodos, validos.slice(0, MAX_CANDIDATOS_ATASCO))
  }
  const conAtasco = prepararAtasco(o.formador, clave, que, b.etiqueta ?? b.nombre ?? null, marcoDe(raiz), candidatos)
  // Sin atasco propio (formador apagado o ningún candidato con pista): nunca muere mudo. Con `pideInventarioDom` el runner
  // adjunta el inventario y `atascoDeRespaldoHueco` (formador.ts) deja el atasco de respaldo con los candidatos de la pantalla.
  throw new ErrorMapaIncompleto(o.adaptador, textoFalta(que, ambito, decision, decision.tipo === 'varios' ? candidatos : [], descartes), candidatos, o.pideInventarioDom === true || !conAtasco, decision.tipo)
}
