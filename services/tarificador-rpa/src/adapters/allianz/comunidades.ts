// Allianz ePAC — «Comunidades 2020» (05/10/2026). Escrito sobre la CAPTURA del formulario real
// (pestañas «Datos Básicos» / «Tarificar»); el LOGIN sigue con selectores TODO (sin captura).
//
// Autorizado por Alberto el 05/10/2026, SIN confirmación escrita de Allianz
// (`seguros.companias_integracion`, modo rpa_autorizada). Ritmo humano: una sesión a la vez con esta
// credencial (max_concurrencia 1) y `ctx.pausa()` entre pasos.
//
// Reglas para quien toque este fichero:
//   · Pulsar SIEMPRE con `ctx.pulsar(locator)`, nunca `locator.click()` (lo vigila el guardián de la raíz).
//     Los campos se rellenan con `fill`/`selectOption`/`setChecked`, no pulsando botones.
//   · 🚨 El formulario tiene «Aceptar» y el radio «ELIJA UNA OPCIÓN»: dan de ALTA. Dentro del formulario el
//     bot solo pulsa «Calcular». El guard los bloquea (TEXTOS_BLOQUEADOS_ALTA) y este fichero ni los
//     nombra en código (lo vigila test/regression-tarificador-rpa.test.ts). El radio NO se toca nunca.
//     («NUEVA ALTA» es solo la navegación hasta el formulario.)
//   · Tras el login y tras calcular: `await ctx.exigirSinCaptcha()`.
//   · Un dato que el portal exige y el riesgo no trae (`null`) → `ErrorTarificador('datos', …)`,
//     NUNCA se inventa un valor por defecto.
//   · Los campos se localizan por el TEXTO de la etiqueta de su fila (`campoPorEtiqueta`), no por id,
//     y DENTRO del iframe `appArea` (`marcoFormulario`), no en `page`. Tabla de campos: `CAMPOS`;
//     harness offline sin pulsar nada: `npx tsx scripts/probar-formulario.ts <html-de-evidencia>`.

import type { Frame, Locator, Page } from 'playwright'
import { comprobarUrl, importeEs, importePuntoDecimal } from '@central/module-tarificacion'
import type { CoberturaOferta, DesglosePrima, FranquiciaOferta, ModalidadPortal, OfertaNormalizada, PdfRef, RiesgoComunidad } from '@central/module-tarificacion'
import type { AdaptadorPortal, ContextoPortal } from '../../adaptador.ts'
import { ErrorTarificador } from '../../errores.ts'
import { acompanar, resolverConFormador, type PasoAcompanado, type ResolucionFormador } from '../../formador.ts'

/**
 * Selectores del LOGIN y de la ruta de menú. `null` = PENDIENTE DE CAPTURAS: el adaptador falla en
 * ese paso con `portal` (error_definitivo, no se reintenta) en vez de adivinar.
 * El formulario en sí NO usa selectores: va por etiqueta (ver `campoPorEtiqueta`).
 */
const SEL = {
  // URL pública de entrada de ePAC (dada por Alberto, 05/10/2026; no es secreta).
  urlLogin: 'https://www.e-pacallianz.com/ngx-azs-epac/public/home' as string | null,
}

function sel(clave: keyof typeof SEL): string {
  const s = SEL[clave]
  if (!s) throw new ErrorTarificador('portal', `allianz/comunidades: selector «${clave}» pendiente de capturas`)
  return s
}

/** Etiqueta visible del formulario que confirma que estamos en la pantalla correcta. */
const TITULO_FORMULARIO = 'Comunidades 2020'

// ───────────────────────── marco del formulario ─────────────────────────
//
// 🚨 (06/10/2026, trabajo a063e84e) El formulario NO está en la página: ePAC es una carcasa Angular
// (ndbx: cabecera, migas «Comunidades 2020») que carga la aplicación de cotización en el
// `<iframe id="appArea" name="appArea">` (un `<form target="appArea">` la manda al servlet de
// tarificación). Buscar «Fecha Inicio» en `page` esperaba 30 s y fallaba. Todo lo del formulario se
// busca en el MARCO que lo contiene, entre TODOS los marcos de la página (puede haber marcos anidados).

/** Lo que el adaptador necesita de una raíz de búsqueda: vale `Page` o `Frame`. */
export type Raiz = Pick<Frame, 'locator' | 'getByText'>

/** Marco preferente donde ePAC carga la aplicación. Solo orienta el orden de búsqueda. */
const NOMBRE_MARCO_APP = 'appArea'

/**
 * Primer marco (los hijos antes que la carcasa; `appArea` el primero) en el que `sonda` encuentra al
 * menos un elemento. Sondea hasta `timeoutMs`; si no aparece en ninguno → `ErrorTarificador('portal')`.
 */
export async function marcoCon(page: Page, sonda: (r: Raiz) => Locator, que: string, timeoutMs = 30_000): Promise<Frame> {
  const fin = Date.now() + timeoutMs
  for (;;) {
    const marcos = page.frames().slice().sort((a, b) => peso(b, page) - peso(a, page))
    for (const f of marcos) {
      if (f.isDetached()) continue
      if ((await sonda(f).count().catch(() => 0)) > 0) return f
    }
    if (Date.now() >= fin) {
      throw new ErrorTarificador('portal', `allianz/comunidades: «${que}» no aparece en ningún marco de la página (${marcos.length} marcos)`)
    }
    await page.waitForTimeout(500)
  }
}

function peso(f: Frame, page: Page): number {
  if (f === page.mainFrame()) return 0
  return f.name() === NOMBRE_MARCO_APP ? 2 : 1
}

/** Marco del formulario «Comunidades 2020» (el que tiene la etiqueta «Fecha Inicio»). */
export function marcoFormulario(page: Page, timeoutMs = 30_000): Promise<Frame> {
  return marcoCon(page, (r) => celdaEtiqueta(r, 'Fecha Inicio'), 'Fecha Inicio', timeoutMs)
}

// ───────────────────────── helpers por etiqueta ─────────────────────────

function literalXPath(t: string): string {
  if (!t.includes('"')) return `"${t}"`
  if (!t.includes("'")) return `'${t}'`
  throw new Error(`etiqueta con ambos tipos de comillas: ${t}`)
}

// Comparación de etiquetas: sin distinguir mayúsculas (el portal las pone a veces por CSS y a veces en
// el texto), con «*», «:» y el espacio duro (&nbsp;) como espacios, y espacios colapsados. Igual en XPath y en JS
// («ITE:Inspección…» casa con «ITE: Inspección…»; «Fecha Inicio *» con «Fecha Inicio»).
const MAYUS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÜÑÀÈÌÒÙ\u00a0*:'
const MINUS = 'abcdefghijklmnopqrstuvwxyzáéíóúüñàèìòù   '
function textoNormalizadoXPath(expr: string): string {
  return `normalize-space(translate(${expr},"${MAYUS}","${MINUS}"))`
}
/** Etiqueta → forma comparable (minúsculas, «*»/«:» como espacio, espacios colapsados). */
export function normalizarEtiqueta(t: string): string {
  return t.replace(/[*:]/g, ' ').replace(/[\s\u00a0]+/g, ' ').trim().toLowerCase()
}

const ETIQUETAS = 'self::td or self::th or self::label or self::span or self::b or self::strong or self::font or self::div or self::p or self::nobr or self::nx-label'
const CONTROLES = `*[self::input[not(@type="hidden")] or self::select or self::textarea or self::nx-dropdown]`

/** La celda/etiqueta cuyo texto (normalizado) es exactamente `etiqueta`. La más externa en orden de documento. */
export function celdaEtiqueta(raiz: Raiz, etiqueta: string): Locator {
  const e = literalXPath(normalizarEtiqueta(etiqueta))
  return raiz.locator(`xpath=(//*[${ETIQUETAS}][not(.//td)][${textoNormalizadoXPath('string(.)')}=${e}])[1]`)
}

/** Lo que el navegador devuelve al resolver un campo: id único del control o su ordinal entre `//CONTROLES`. */
type ControlResuelto = { id: string | null; ordinal: number; regla: 'celda' | 'fila' | 'izquierda' | 'siguiente' } | { error: string }

/**
 * Localiza el control de una fila del formulario por el TEXTO de su etiqueta (patrón tabla etiqueta → control;
 * validado contra el DOM real del marco con `scripts/probar-formulario.ts`, que comprueba también el MAPEO).
 *
 * 🚨 (06/10/2026) Antes era una UNIÓN XPath `(celda//C | fila//C | following::C)[n]`: la unión se ordena por
 * orden de DOCUMENTO, así que en una fila «Fecha Inicio [a] Fecha Fin [b]» buscar «Fecha Fin» devolvía [a] y
 * se tarificaba con el dato en otro campo, en silencio. Ahora es PRIORIDAD explícita, con «tramo» = controles
 * tras la etiqueta y ANTES del siguiente texto (otra etiqueta):
 *   (a) controles DENTRO de la celda de la etiqueta;
 *   (b) tramo de la etiqueta en su MISMA fila (`ancestor::tr[1]`). Con `indice` > 0 («Nº Edificios *» →
 *       input y luego el select «Contiguos»; DNI → input y luego el tipo de documento) y la fila acabada sin
 *       otra etiqueta, el tramo sigue en la fila que la contiene (tablas anidadas del servlet), hasta 3 niveles;
 *   (c) SOLO si la fila no tiene NINGÚN control después de la etiqueta: el control INMEDIATAMENTE anterior
 *       en la fila, sin texto entre ambos (asistencias de «PARTIDAS ASEGURABLES»: checkbox a la izquierda);
 *   (d) si la fila no da nada: el tramo en orden de documento (siguiente control, pero nunca saltando otra
 *       etiqueta: si antes aparece texto, no hay control y se dice).
 * Se prueba cada elemento con ese texto en orden de documento y vale el PRIMERO que da control: el título de
 * sección «% COMISIÓN» (sin control) va antes que la etiqueta «% Comisión» de su desplegable.
 * Sin control → `ErrorTarificador('portal')`. Devuelve un locator por `id` (si es único) o por ordinal.
 */
export async function campoPorEtiqueta(raiz: Raiz, etiqueta: string, indice = 0): Promise<Locator> {
  await celdaEtiqueta(raiz, etiqueta).waitFor({ state: 'attached' })
  const r = await etiquetasCandidatas(raiz, etiqueta).evaluateAll(FUENTE_RESOLVER, { controles: `//${CONTROLES}`, indice })
  if ('error' in r) throw new ErrorTarificador('portal', `allianz/comunidades: «${etiqueta}»${indice ? ` [#${indice}]` : ''}: ${r.error}`)
  if (r.id && !(r.id.includes('"') && r.id.includes("'"))) return raiz.locator(`xpath=//*[@id=${literalXPath(r.id)}]`)
  return raiz.locator(`xpath=(//${CONTROLES})[${r.ordinal + 1}]`)
}

/** Todos los elementos-etiqueta con ese texto (como `celdaEtiqueta`, sin quedarse con el primero). */
function etiquetasCandidatas(raiz: Raiz, etiqueta: string): Locator {
  const e = literalXPath(normalizarEtiqueta(etiqueta))
  return raiz.locator(`xpath=//*[${ETIQUETAS}][not(.//td)][${textoNormalizadoXPath('string(.)')}=${e}]`)
}

// Se pasa como TEXTO con un `__name` neutro: tsx/esbuild (keepNames) envuelve las funciones con nombre en
// `__name(…)`, que no existe en la página («ReferenceError: __name is not defined»).
const FUENTE_RESOLVER = new Function(
  'el',
  'a',
  `var __name = (f) => f; ${resolverUna.toString()}; return (${resolverControlEnDom.toString()})(el, a)`,
) as typeof resolverControlEnDom

/**
 * Se ejecuta EN EL NAVEGADOR (por `evaluateAll`): no puede usar nada de fuera de su cuerpo salvo `resolverUna`,
 * que va en el mismo texto. `etiquetas`: candidatas en orden de documento; `controles`: XPath de todos los controles.
 */
function resolverControlEnDom(etiquetas: Element[], a: { controles: string; indice: number }): ControlResuelto {
  let primerError: ControlResuelto = { error: 'no aparece la etiqueta' }
  for (const etiqueta of etiquetas) {
    // Un elemento DENTRO de otro candidato (label dentro de su td) es la misma etiqueta: se prueba el externo.
    if (etiquetas.some((o) => o !== etiqueta && o.contains(etiqueta))) continue
    const r = resolverUna(etiqueta, a)
    if (!('error' in r)) return r
    if (primerError.error === 'no aparece la etiqueta') primerError = r
  }
  return primerError
}

function resolverUna(etiqueta: Element, a: { controles: string; indice: number }): ControlResuelto {
  const doc = etiqueta.ownerDocument
  const snap = doc.evaluate(a.controles, doc, null, 7 /* ORDERED_NODE_SNAPSHOT_TYPE */, null)
  const todos: Element[] = []
  for (let i = 0; i < snap.snapshotLength; i++) todos.push(snap.snapshotItem(i) as Element)
  // Un control dentro de otro (p. ej. el input interno de un nx-dropdown) no cuenta aparte.
  const conjunto = new Set(todos)
  const esControl = (e: Element) => conjunto.has(e) && !todos.some((o) => o !== e && o.contains(e))
  const dentroDeControl = (n: Node) => todos.some((o) => o.contains(n))
  const textoNormal = (t: string) => t.replace(/[*:\u00a0]/g, ' ').trim()
  const ignorar = (n: Node) => {
    const p = n.parentElement
    return !p || /^(script|style|option|noscript)$/i.test(p.tagName)
  }
  // Recorre en orden de documento los nodos de `ambito` que van DESPUÉS de la etiqueta (fuera de ella).
  // Devuelve [controles del tramo, ¿se cerró por un texto?].
  const tramoTras = (ambito: Element): [Element[], boolean] => {
    const it = doc.createTreeWalker(ambito, 1 | 4 /* ELEMENT | TEXT */)
    const out: Element[] = []
    let n: Node | null = it.currentNode
    while ((n = it.nextNode())) {
      if (etiqueta === n || etiqueta.contains(n)) continue
      if (!(etiqueta.compareDocumentPosition(n) & 4 /* FOLLOWING */)) continue
      if (n.nodeType === 3) {
        if (!ignorar(n) && !dentroDeControl(n) && textoNormal(n.nodeValue ?? '') !== '') return [out, true]
      } else if (esControl(n as Element)) out.push(n as Element)
    }
    return [out, false]
  }
  const ok = (e: Element, regla: 'celda' | 'fila' | 'izquierda' | 'siguiente'): ControlResuelto => {
    const id = e.getAttribute('id')
    const unico = id && doc.querySelectorAll(`[id="${id.replace(/["\\]/g, '\\$&')}"]`).length === 1
    return { id: unico ? id : null, ordinal: todos.indexOf(e), regla }
  }
  // (a) dentro de la celda de la etiqueta.
  const propios = todos.filter((c) => esControl(c) && etiqueta.contains(c))
  if (propios.length > 0) {
    return propios[a.indice] ? ok(propios[a.indice], 'celda') : { error: `la celda solo tiene ${propios.length} control(es)` }
  }
  const fila = etiqueta.closest('tr')
  if (fila) {
    // (b) tramo en la misma fila; con indice > 0 y la fila agotada sin otra etiqueta, la fila contenedora.
    let ambito: Element | null = fila
    let [tramo, cerrado] = tramoTras(fila)
    for (let nivel = 0; tramo.length > 0 && tramo.length <= a.indice && !cerrado && nivel < 3; nivel++) {
      ambito = ambito?.parentElement?.closest('tr') ?? null
      if (!ambito) break
      ;[tramo, cerrado] = tramoTras(ambito)
    }
    if (tramo.length > 0) {
      return tramo[a.indice] ? ok(tramo[a.indice], 'fila') : { error: `su tramo solo tiene ${tramo.length} control(es)` }
    }
    const posteriores = todos.filter((c) => esControl(c) && fila.contains(c) && etiqueta.compareDocumentPosition(c) & 4)
    if (posteriores.length > 0) return { error: 'los controles de su fila son de otra etiqueta' }
    // (c) checkbox a la izquierda: el control inmediatamente anterior en la fila, sin texto entre medias.
    if (a.indice === 0) {
      const anteriores = todos.filter((c) => esControl(c) && fila.contains(c) && etiqueta.compareDocumentPosition(c) & 2)
      const previo = anteriores[anteriores.length - 1]
      if (previo) {
        const rango = doc.createRange()
        rango.setStartAfter(previo)
        rango.setEndBefore(etiqueta)
        if (textoNormal(rango.toString()) === '') return ok(previo, 'izquierda')
      }
    }
  }
  // (d) nada en la fila: siguiente control en el documento, sin saltar otra etiqueta.
  const [tramo] = tramoTras(doc.documentElement)
  if (tramo[a.indice]) return ok(tramo[a.indice], 'siguiente')
  return { error: 'no tiene control (ni en su celda, ni en su fila, ni antes de la siguiente etiqueta)' }
}

/**
 * Fila (`tr`) de una garantía de la tabla de partidas, por el texto de su etiqueta (y su grupo, si lo hay).
 * En el DOM real cada fila va en su PROPIA `<table>` (el grupo «Acción Agua» en una y «Bienes Comunes» en la
 * siguiente): la fila del grupo se busca hacia delante en el documento, no entre hermanos.
 */
export function filaPorEtiqueta(raiz: Raiz, etiqueta: string, grupo: string | null = null): Locator {
  const e = literalXPath(normalizarEtiqueta(etiqueta))
  const celda = `td[${textoNormalizadoXPath('string(.)')}=${e}]`
  if (grupo === null) return raiz.locator(`xpath=(//tr[${celda}])[1]`)
  const g = literalXPath(normalizarEtiqueta(grupo))
  return raiz.locator(`xpath=(//tr[td[${textoNormalizadoXPath('string(.)')}=${g}]]/following::tr[${celda}])[1]`)
}

/** «2026-10-05» → «05/10/2026» (formato de los campos de fecha de ePAC). */
export function fechaEs(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new ErrorTarificador('datos', `allianz/comunidades: fecha «${iso}» no es AAAA-MM-DD`)
  return `${m[3]}/${m[2]}/${m[1]}`
}

/** Exige el dato: si el portal lo pide y no lo tenemos, NO se inventa. */
function dato<T>(v: T | null | undefined, campo: string): T {
  if (v === null || v === undefined || v === '') {
    throw new ErrorTarificador('datos', `allianz/comunidades: el portal exige «${campo}» y el riesgo no lo trae`)
  }
  return v
}

/**
 * Genera una RegExp para búsqueda de texto insensible a mayúsculas y tolerante con espacios.
 * Escapa metacaracteres de regex y devuelve: `^\\s*<escapado>\\s*$` (insensible a mayúsculas).
 * Sirve para localizar textos en el DOM donde las mayúsculas son solo CSS (e.g., «Nueva Alta»).
 */
function textoExacto(t: string): RegExp {
  const escapado = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^\\s*${escapado}\\s*$`, 'i')
}

/** Tipo de control resuelto: decide cómo se rellena. */
export type TipoControl = 'texto' | 'select' | 'checkbox' | 'nx-dropdown' | 'otro'

export async function tipoControl(c: Locator): Promise<TipoControl> {
  return c.evaluate((el) => {
    const tag = el.tagName.toLowerCase()
    if (tag === 'select') return 'select'
    if (tag === 'nx-dropdown' || el.closest('nx-dropdown')) return 'nx-dropdown'
    if (tag === 'textarea') return 'texto'
    if (tag === 'input') {
      const t = ((el as HTMLInputElement).type || 'text').toLowerCase()
      if (t === 'checkbox') return 'checkbox'
      if (['text', 'search', 'tel', 'number', 'date', ''].includes(t)) return 'texto'
    }
    return 'otro'
  }) as Promise<TipoControl>
}

// ───────────────────────── formador con IA (FALLBACK + modo acompañado) ─────────────────────────
//
// 🚨 TARIFICAR ≠ EMITIR. El formador SOLO se consulta cuando la vía determinista no encuentra nada, y lo que
// propone la IA lo valida `formador.ts` (campo = control editable; acción = texto de la TABLA CERRADA y sin
// patrón de emisión) antes de devolver un Locator. Aquí no se le envía nada propio: la descripción es la
// etiqueta del formulario (nunca credenciales ni valores del riesgo) y el HTML lo redacta formador.ts.
// Apagado (`ctx.formador` ausente o `activo: false`, kill-switch `TARIFICADOR_FORMADOR_ACTIVO` en asegura)
// = comportamiento de siempre. Un fallo de la IA nunca tumba nada: devuelve null y se relanza el error original.

/** Dónde se resuelve un campo: página (para el formador) + contexto. */
type Entorno = { page: Page; ctx: ContextoPortal }

/** `campoPorEtiqueta` y, SOLO si no encuentra el campo y el formador está activo, el campo que valide el formador. */
async function campoResuelto(raiz: Raiz, e: Entorno, etiqueta: string, indice = 0): Promise<{ campo: Locator; confirmar: () => Promise<void> }> {
  try {
    return { campo: await campoPorEtiqueta(raiz, etiqueta, indice), confirmar: async () => undefined }
  } catch (err) {
    // Un dato que falta o cualquier error que no sea «no encuentro el campo» no es cosa del formador.
    if (!e.ctx.formador?.activo || (err instanceof ErrorTarificador && err.tipo !== 'portal')) throw err
    const r = await resolverConFormador(e.page, e.ctx.formador, {
      clave: `${etiqueta}${indice ? `#${indice}` : ''}`,
      tipo: 'campo',
      descripcion: `Campo editable del formulario «${etiqueta}»${indice ? ` (control nº ${indice + 1} de esa fila)` : ''}`,
    }).catch(() => null)
    if (!r) throw err
    e.ctx.log(`formador: campo «${etiqueta}» resuelto por ${r.origen}`)
    return { campo: r.locator, confirmar: r.confirmar }
  }
}

/** Mensaje de `marcoDeCalcular` cuando NO hay ningún «Calcular» (la ambigüedad —más de uno— NO activa el formador). */
const SIN_CALCULAR = 'no aparece en ningún marco'

/** Revisión del modo acompañado en un punto de enganche. Bloqueante → `ErrorTarificador`; cualquier otro fallo, se sigue. */
async function acompanarPaso(
  page: Page,
  ctx: ContextoPortal,
  punto: PasoAcompanado,
  pantallaEsperada: string,
  extra: { valoresLeidos?: Parameters<typeof acompanar>[3]['valoresLeidos']; modalidadPedida?: ModalidadPortal | null } = {},
): Promise<void> {
  if (!ctx.formador?.activo) return
  try {
    await acompanar(page, ctx.formador, punto, { pantallaEsperada, ...extra })
  } catch (e) {
    if (e instanceof ErrorTarificador) throw e
    ctx.log(`formador: acompañamiento «${punto}» no disponible`)
  }
}

/**
 * Texto y fechas. Las fechas (también el datepicker de ndbx, `input[nxDatefield]`) se TECLEAN con
 * `fill`: no se abre el calendario. Tras escribir se quita el foco (`blur`): las páginas del servlet
 * validan/recalculan en `onchange`/`onblur`. Si el valor no queda escrito (campo readonly) → `portal`.
 */
async function poner(raiz: Raiz, e: Entorno, etiqueta: string, valor: string | number, indice = 0): Promise<void> {
  const { campo: c, confirmar } = await campoResuelto(raiz, e, etiqueta, indice)
  const v = String(valor)
  await c.fill(v)
  await c.blur().catch(() => undefined)
  const escrito = await c.inputValue().catch(() => null)
  if (escrito !== null && escrito.trim() === '') {
    throw new ErrorTarificador('portal', `allianz/comunidades: «${etiqueta}» no aceptó el valor (¿solo lectura?)`)
  }
  await confirmar()
}

/** Control del desplegable ndbx que abre la lista (el propio `nx-dropdown`). */
function desplegableNx(c: Locator): Locator {
  return c.locator('xpath=ancestor-or-self::nx-dropdown[1]')
}

/** Opción de la lista abierta de un `nx-dropdown` (se pinta en el overlay del MISMO marco). */
function opcionNx(raiz: Raiz, valor: string): Locator {
  return raiz.locator('nx-dropdown-item, [role="option"]').filter({ hasText: textoExacto(valor) })
}

/**
 * Desplegable por etiqueta, con el valor como string LIBRE (TODO(valores admitidos): lista que solo tiene
 * Alberto). `<select>` nativo: por texto visible y, si no, por `value`. `nx-dropdown` (ndbx, no es un
 * `<select>`): se abre y se elige la opción de texto EXACTO, ambas pulsaciones por `ctx.pulsar` (guardadas).
 * Si ninguna opción casa, error de datos (no se elige «lo más parecido»).
 */
async function elegir(raiz: Raiz, e: Entorno, etiqueta: string, valor: string, indice = 0): Promise<void> {
  const { ctx } = e
  const { campo: s, confirmar } = await campoResuelto(raiz, e, etiqueta, indice)
  const tipo = await tipoControl(s)
  if (tipo === 'nx-dropdown') {
    await ctx.pulsar(desplegableNx(s))
    const opciones = opcionNx(raiz, valor)
    try {
      await opciones.first().waitFor({ state: 'visible', timeout: 5_000 })
    } catch {
      throw new ErrorTarificador('datos', `allianz/comunidades: «${etiqueta}» no admite el valor «${valor}»`)
    }
    if ((await opciones.count()) !== 1) throw new ErrorTarificador('datos', `allianz/comunidades: «${etiqueta}» tiene varias opciones «${valor}»`)
    await ctx.pulsar(opcionNx(raiz, valor))
    await confirmar()
    return
  }
  if (tipo !== 'select') {
    throw new ErrorTarificador('portal', `allianz/comunidades: «${etiqueta}» no es un desplegable reconocible (${tipo})`)
  }
  try {
    await s.selectOption({ label: valor }, { timeout: 5_000 })
  } catch {
    try {
      await s.selectOption({ value: valor }, { timeout: 5_000 })
    } catch {
      throw new ErrorTarificador('datos', `allianz/comunidades: «${etiqueta}» no admite el valor «${valor}»`)
    }
  }
  await confirmar()
}

/** Checkbox por etiqueta. Las asistencias salen DESHABILITADAS en el DOM capturado: si no se habilita, `portal`. */
async function marcar(raiz: Raiz, e: Entorno, etiqueta: string, valor: boolean): Promise<void> {
  try {
    const { campo, confirmar } = await campoResuelto(raiz, e, etiqueta)
    await campo.setChecked(valor, { timeout: 10_000 })
    await confirmar()
  } catch (err) {
    if (err instanceof ErrorTarificador) throw err
    throw new ErrorTarificador('portal', `allianz/comunidades: no se pudo marcar «${etiqueta}» (¿deshabilitado?)`)
  }
}

// ───────────────────────── login y navegación ─────────────────────────

async function login(page: Page, ctx: ContextoPortal): Promise<void> {
  await page.goto(sel('urlLogin'))
  await ctx.exigirSinCaptcha()
  // Login por etiqueta/rol (captura del 05/10/2026). Tracing apagado: lo vigila el guardián de la raíz.
  const usuario = page.getByLabel('Usuario', { exact: true })
  await usuario.fill(ctx.credenciales.usuario)
  await ctx.pausa()
  // Por la etiqueta salen DOS inputs (06/10/2026, strict mode violation): el campo es el
  // input[type=password] VISIBLE. exact: «Contraseña sensible a mayúsculas…» no es la etiqueta.
  await page
    .getByLabel('Contraseña', { exact: true })
    .and(page.locator('input[type="password"]'))
    .filter({ visible: true })
    .first()
    .fill(ctx.credenciales.contrasena)
  await ctx.pausa()
  // NUNCA «Recuperación de contraseña» (el guard la bloquea).
  await ctx.pulsar(page.getByRole('button', { name: 'INICIAR SESIÓN' }))
  await ctx.exigirSinCaptcha()
  // Logueado = aparece «Mediador principal» en la cabecera. Si no aparece, no se reintenta el login
  // (repetir un login rechazado es como se bloquea una cuenta).
  try {
    await page.getByText('Mediador principal').first().waitFor({ state: 'visible', timeout: 25_000 })
  } catch {
    throw new ErrorTarificador('credenciales', 'allianz/comunidades: no se llegó a la cabecera de ePAC tras el login (credenciales rechazadas o portal distinto)')
  }
  ctx.log('login ok')
}

async function abrirComunidades(page: Page, ctx: ContextoPortal): Promise<void> {
  // Ruta dada por Alberto: botón id «link_new_policy» «Nueva Alta» (cabecera de la home) → modal «Nueva Alta»
  // con acordeones → «Particulares» → tarjeta «Comunidades» → «Comunidades 2020».
  // El texto del DOM es «Nueva Alta» (las mayúsculas son CSS). «Nueva alta» es NAVEGACIÓN para cotizar, no
  // emisión (el guard ya no la bloquea). Alternativa en el menú: «Venta» → «Nueva Alta». El modal tiene «CERRAR».
  await ctx.pulsar(
    page.locator('#link_new_policy').or(page.getByRole('button', { name: textoExacto('Nueva Alta') })).first(),
  )
  await ctx.pausa()
  const modal = page.getByRole('dialog').filter({ hasText: /nueva alta/i }).first()
  await ctx.pulsar(modal.getByText(textoExacto('Particulares')).first())
  await ctx.pausa()
  await ctx.pulsar(modal.getByText(textoExacto('Comunidades')).first())
  await page.getByText(textoExacto(TITULO_FORMULARIO)).first().waitFor()
  await ctx.exigirSinCaptcha()
}

// ───────────────────────── formulario ─────────────────────────

/**
 * Un campo del formulario, en el orden en que se rellena. Tabla DECLARATIVA: la usa `rellenarRiesgo`
 * y el harness offline (`scripts/probar-formulario.ts`), que comprueba que cada locator resuelve sin
 * pulsar nada. `valor` → `undefined`/`null` = el riesgo no lo trae: si `obligatorio`, error de `datos`
 * (NUNCA un valor por defecto); si no, el campo no se toca y se respeta el valor del portal.
 */
export type CampoFormulario = {
  etiqueta: string
  /** Control N-ésimo tras la etiqueta (0 = el primero). */
  indice?: number
  tipo: 'texto' | 'fecha' | 'desplegable' | 'check'
  obligatorio: boolean
  valor: (r: RiesgoComunidad) => string | number | boolean | null | undefined
  /** Pausa humana tras el campo (fin de bloque). */
  pausa?: boolean
}

export const CAMPOS: readonly CampoFormulario[] = [
  // DATOS
  { etiqueta: 'Póliza a Reemplazar', tipo: 'texto', obligatorio: false, valor: (r) => r.polizaAReemplazar },
  { etiqueta: 'DNI/NIF/NIE/CIF', tipo: 'texto', obligatorio: false, valor: (r) => r.documentoIdentidad },
  // El select de tipo de documento va justo tras el campo de DNI; no tiene etiqueta propia.
  { etiqueta: 'DNI/NIF/NIE/CIF', indice: 1, tipo: 'desplegable', obligatorio: false, valor: (r) => r.tipoDocumento },
  { etiqueta: 'Fecha Inicio', tipo: 'fecha', obligatorio: true, valor: (r) => r.fechaEfecto },
  { etiqueta: 'Fecha Término', tipo: 'fecha', obligatorio: true, valor: (r) => r.fechaTermino, pausa: true },
  // DESCRIPCIÓN RIESGO
  { etiqueta: 'Metros Cuadrados', tipo: 'texto', obligatorio: true, valor: (r) => r.m2Construidos },
  { etiqueta: 'Año Construcción', tipo: 'texto', obligatorio: true, valor: (r) => r.anioConstruccion },
  { etiqueta: 'Año Reforma', tipo: 'texto', obligatorio: false, valor: (r) => r.anioRehabilitacion },
  { etiqueta: 'Tipo Vivienda', tipo: 'desplegable', obligatorio: true, valor: (r) => r.tipoVivienda },
  { etiqueta: 'Uso', tipo: 'desplegable', obligatorio: true, valor: (r) => r.uso },
  { etiqueta: 'Plantas sobre N. Calle', tipo: 'texto', obligatorio: true, valor: (r) => r.plantas },
  { etiqueta: 'Plantas bajo Nivel Calle', tipo: 'texto', obligatorio: false, valor: (r) => r.plantasBajoRasante },
  { etiqueta: 'Sótanos', tipo: 'texto', obligatorio: false, valor: (r) => r.sotanos },
  { etiqueta: 'Nº Edificios', tipo: 'texto', obligatorio: true, valor: (r) => r.numEdificios },
  // «Contiguos» es un select deshabilitado hasta que hay varios edificios: solo se toca si viene.
  { etiqueta: 'Nº Edificios', indice: 1, tipo: 'desplegable', obligatorio: false, valor: (r) => r.contiguos },
  { etiqueta: 'Nº Viv. y Locales', tipo: 'texto', obligatorio: true, valor: (r) => r.numViviendasYLocales },
  { etiqueta: 'Lista Propietarios / Arrendatarios', tipo: 'desplegable', obligatorio: true, valor: (r) => r.listaPropietarios },
  { etiqueta: 'Instalaciones Anexas (Deportivas, Piscinas, etc.)', tipo: 'check', obligatorio: false, valor: (r) => r.instalacionesAnexas },
  // C.P.: se teclea el código y se deja que el portal resuelva la población.
  // TODO(capturas): la lupa de «C.P./Población» abre un buscador; no se sabe si basta con teclear el CP
  // (aquí no se pulsa la lupa: si la población no se rellena sola, el cálculo fallará con `portal`).
  { etiqueta: 'C.P./Población', tipo: 'texto', obligatorio: true, valor: (r) => r.direccion.codigoPostal, pausa: true },
  // FORMA PAGO / % COMISIÓN: solo si el riesgo lo pide; si no, se respeta el valor por defecto del portal.
  { etiqueta: 'Primer Recibo', tipo: 'desplegable', obligatorio: false, valor: (r) => r.formaPagoPrimerRecibo },
  { etiqueta: 'Sucesivos', tipo: 'desplegable', obligatorio: false, valor: (r) => r.formaPagoSucesivos },
  { etiqueta: '% Comisión', tipo: 'desplegable', obligatorio: false, valor: (r) => r.comision },
  // PARTIDAS ASEGURABLES
  { etiqueta: 'Edificación Valor Reposición', tipo: 'texto', obligatorio: true, valor: (r) => r.capitalContinente },
  { etiqueta: 'Asistencia y Control de Plagas', tipo: 'check', obligatorio: false, valor: (r) => r.asistenciaPlagas },
  { etiqueta: 'Asesoramiento Jurídico', tipo: 'check', obligatorio: false, valor: (r) => r.asesoramientoJuridico },
  { etiqueta: 'Impago Cuotas Comunitarias', tipo: 'check', obligatorio: false, valor: (r) => r.impagoCuotas },
  // El portal lo escribe «Inspeción» (con una sola «c»): la etiqueta va TAL CUAL está en el DOM.
  { etiqueta: 'ITE:Inspeción Técnica Edificios', tipo: 'check', obligatorio: false, valor: (r) => r.ite, pausa: true },
]

async function rellenarRiesgo(raiz: Raiz, page: Page, r: RiesgoComunidad, ctx: ContextoPortal): Promise<void> {
  const e: Entorno = { page, ctx }
  // DOM real (06/10/2026): «Datos Básicos» y «Tarificar» son pestañas del menú del marco (`td#DATOSBASICOS`,
  // `td#TARIFICAR`); la de Tarificar dispara el MISMO avance que el botón de Datos Básicos, así que aquí no se
  // cambia de pestaña: se rellena todo en Datos Básicos y el avance va SOLO por `ctx.avanzarATarificar()`.
  for (const c of CAMPOS) {
    const v = c.valor(r)
    if (v === null || v === undefined || v === '') {
      if (c.obligatorio) dato(v, c.etiqueta)
    } else if (c.tipo === 'check') {
      await marcar(raiz, e, c.etiqueta, Boolean(v))
    } else if (c.tipo === 'desplegable') {
      await elegir(raiz, e, c.etiqueta, String(v), c.indice ?? 0)
    } else {
      await poner(raiz, e, c.etiqueta, c.tipo === 'fecha' ? fechaEs(String(v)) : (v as string | number), c.indice ?? 0)
    }
    if (c.pausa) await ctx.pausa()
  }
}

/**
 * El ÚNICO botón que el bot pulsa en este formulario. En el DOM real (06/10/2026) NO es `a`/`button`/`input`:
 * es el «footer button» del servlet, un `<div id="calcular" onclick="calcular();">Calcular</div>` (su vecino
 * es el de avance, que este fichero no nombra). Por id Y texto exacto: tiene que resolver a UNO solo.
 */
export function botonCalcular(raiz: Raiz): Locator {
  return raiz.locator('#calcular').filter({ hasText: textoExacto('Calcular') })
}

/** ¿El footer button está deshabilitado? El servlet lo marca con la clase `footerButtonDisabled`. */
async function deshabilitado(boton: Locator): Promise<boolean> {
  return boton.evaluate((el) => /disabled/i.test(el.className) || el.getAttribute('aria-disabled') === 'true')
}

/**
 * Marco con EXACTAMENTE un «Calcular» entre TODOS los marcos de la página (como `enMarcos` de guard.ts).
 * Cero en todos, o más de uno (en uno o en varios marcos) → `portal`: no se pulsa algo ambiguo.
 */
export async function marcoDeCalcular(page: Page, timeoutMs = 30_000): Promise<Frame> {
  const fin = Date.now() + timeoutMs
  for (;;) {
    let total = 0
    let marco: Frame | null = null
    for (const f of page.frames()) {
      if (f.isDetached()) continue
      const n = await botonCalcular(f).count().catch(() => 0)
      total += n
      if (n > 0) marco = f
    }
    if (total === 1 && marco) return marco
    if (total > 1) throw new ErrorTarificador('portal', `allianz/comunidades: «Calcular» resuelve a ${total} elementos entre los marcos`)
    if (Date.now() >= fin) throw new ErrorTarificador('portal', 'allianz/comunidades: «Calcular» no aparece en ningún marco de la página')
    await page.waitForTimeout(500)
  }
}

/** Inputs de importe de la fila «COSTE ANUAL DEL SEG. SEGÚN OPCIÓN» (Estándar, Personalizado). */
export function costesAnuales(raiz: Raiz): Locator {
  return filaPorEtiqueta(raiz, 'COSTE ANUAL DEL SEG. SEGÚN OPCIÓN').locator('input:not([type=radio]):not([type=hidden])')
}

/**
 * FALLBACK del formador para «Calcular»: solo si la vía determinista no lo encuentra en NINGÚN marco. La IA señala
 * entre los candidatos y `formador.ts` lo valida contra la tabla cerrada (clave `calcular` = «Calcular»/«Calcular
 * prima»/«Recalcular», único, visible, habilitado, sin patrón de emisión). `null` si está apagado o no valida.
 */
async function calcularConFormador(page: Page, ctx: ContextoPortal): Promise<ResolucionFormador | null> {
  if (!ctx.formador?.activo) return null
  return resolverConFormador(page, ctx.formador, {
    clave: 'calcular',
    tipo: 'accion',
    descripcion: 'Botón «Calcular» de la pestaña Datos Básicos del formulario Comunidades 2020',
    textoEsperado: 'Calcular',
  }).catch(() => null)
}

async function calcular(page: Page, ctx: ContextoPortal): Promise<Frame> {
  let marco: Frame | null = null
  let alterno: ResolucionFormador | null = null
  try {
    marco = await marcoDeCalcular(page)
  } catch (e) {
    // Solo «no aparece» (no «resuelve a N elementos»: lo ambiguo nunca se resuelve con la IA).
    if (!(e instanceof ErrorTarificador) || !e.message.includes(SIN_CALCULAR)) throw e
    alterno = await calcularConFormador(page, ctx)
    if (!alterno) throw e
    ctx.log('formador: «Calcular» resuelto por ' + alterno.origen)
  }
  if (marco) {
    // El servlet lo deja deshabilitado hasta dar el formulario por bueno: se espera (máx. ~15 s) y, si sigue
    // así, error claro en vez de pulsar un botón muerto y esperar 45 s al coste anual.
    for (let i = 0; await deshabilitado(botonCalcular(marco)); i++) {
      if (i >= 30) {
        throw new ErrorTarificador('portal', 'allianz/comunidades: «Calcular» sigue deshabilitado tras rellenar (¿falta un dato que el portal exige, p. ej. Población o Edificación Valor Reposición?)')
      }
      await page.waitForTimeout(500)
    }
    await ctx.pulsar(botonCalcular(marco))
  } else if (alterno) {
    await ctx.pulsar(alterno.locator)
  }
  await ctx.exigirSinCaptcha()
  // Espera a que «COSTE ANUAL DEL SEG. SEGÚN OPCIÓN» traiga el importe de Estándar (sondeo, máx. ~45 s).
  // El servlet puede recargar el marco al calcular: se vuelve a buscar el marco en cada vuelta.
  for (let i = 0; i < 90; i++) {
    const marco = await marcoCon(page, costesAnuales, 'COSTE ANUAL DEL SEG.', 0).catch(() => null)
    if (marco) {
      const v = await costesAnuales(marco).first().inputValue({ timeout: 1_000 }).catch(() => '')
      if (importeEs(v) !== null) {
        await alterno?.confirmar()
        return marco
      }
    }
    await page.waitForTimeout(500)
  }
  throw new ErrorTarificador('portal', 'allianz/comunidades: «Calcular» no devolvió el coste anual (¿errores de validación en el formulario?)')
}

// ───────────────────────── lectura ─────────────────────────

type Partida = {
  clave: string
  literal: string
  /** Texto del grupo bajo el que aparece la fila (`null` = la fila lleva su propio título). */
  grupo: string | null
  /** Etiqueta de la fila. */
  fila: string
  /** ¿La fila trae el select de franquicia en la 3.ª columna? (RC y Suma Asegurada: no.) */
  franquicia: boolean
}

/** Garantías de la tabla «Estándar / Personalizado / Franquicia» tal como se ven en la captura. */
export const PARTIDAS: readonly Partida[] = [
  { clave: 'cobertura_valor_estetico', literal: 'Cobertura Valor Estético', grupo: 'Edificación', fila: 'Cobertura Valor Estético', franquicia: false },
  { clave: 'accion_agua_bienes_comunes', literal: 'Acción Agua · Bienes Comunes', grupo: 'Acción Agua', fila: 'Bienes Comunes', franquicia: true },
  { clave: 'accion_agua_comunes_privativos', literal: 'Acción Agua · Bienes Comunes y Privativos', grupo: 'Acción Agua', fila: 'Bienes Comunes y Privativos', franquicia: true },
  { clave: 'desatasco_tuberias', literal: 'Desatasco Tuberías Comunitarias', grupo: null, fila: 'Desatasco Tuberías Comunitarias', franquicia: false },
  { clave: 'rc_agua_bienes_comunes', literal: 'RC por Acción del Agua · Bienes Comunes', grupo: 'Responsabilidad Civil por Acción del Agua', fila: 'Bienes Comunes', franquicia: true },
  { clave: 'rc_agua_comunes_privativos', literal: 'RC por Acción del Agua · Bienes Comunes y Privativos', grupo: 'Responsabilidad Civil por Acción del Agua', fila: 'Bienes Comunes y Privativos', franquicia: true },
  { clave: 'rc_suma_asegurada', literal: 'Responsabilidad Civil · Suma Asegurada', grupo: 'Responsabilidad Civil', fila: 'Suma Asegurada', franquicia: false },
  { clave: 'rc_contaminacion_suma_asegurada', literal: 'RC Contaminación · Suma Asegurada', grupo: 'Responsabilidad Civil Contaminación', fila: 'Suma Asegurada', franquicia: false },
  { clave: 'rotura_cristales_bienes_comunes', literal: 'Rotura Cristales · Bienes Comunes', grupo: 'Rotura Cristales', fila: 'Bienes Comunes', franquicia: true },
  { clave: 'rotura_cristales_comunes_privativos', literal: 'Rotura Cristales · Bienes Comunes y Privativos', grupo: 'Rotura Cristales', fila: 'Bienes Comunes y Privativos', franquicia: true },
  { clave: 'maquinaria_primer_riesgo', literal: 'Rotura Maquinaria / Avería Aparatos Electrónicos · Cobertura a Primer Riesgo', grupo: 'Rotura Maquinaria / Avería Aparatos Electrónicos', fila: 'Cobertura a Primer Riesgo', franquicia: true },
]

/** Filas con checkbox de asistencia: tras calcular, ePAC escribe «Incluida»/«Excluida» por columna. */
export const ASISTENCIAS: readonly { clave: string; literal: string; fila: string }[] = [
  { clave: 'asistencia_plagas', literal: 'Asistencia y Control de Plagas', fila: 'Asistencia y Control de Plagas' },
  { clave: 'asesoramiento_juridico', literal: 'Asesoramiento Jurídico', fila: 'Asesoramiento Jurídico' },
  { clave: 'impago_cuotas', literal: 'Impago Cuotas Comunitarias', fila: 'Impago Cuotas Comunitarias' },
  { clave: 'ite', literal: 'ITE: Inspección Técnica Edificios', fila: 'ITE:Inspeción Técnica Edificios' },
]

/** «Incluida»/«Excluida» → estado; cualquier otra cosa → null (sin dato, no «excluida»). */
export function estadoDeTexto(t: string | null | undefined): 'incluida' | 'excluida' | null {
  const v = (t ?? '').trim().toLowerCase()
  return v === 'incluida' ? 'incluida' : v === 'excluida' ? 'excluida' : null
}

/**
 * DOM real: la etiqueta va en una tabla anidada (checkbox + texto) y los estados en la fila EXTERIOR, como dos
 * pares de `<label>` «Incluida»/«Excluida» (Estándar, Personalizado) de los que ePAC muestra uno por columna
 * (el otro con `display:none`). Se leen solo los VISIBLES; antes de calcular no hay ninguno → `null`.
 */
async function leerEstadosAsistencia(raiz: Raiz, fila: string): Promise<['incluida' | 'excluida' | null, 'incluida' | 'excluida' | null]> {
  const textos = await filaPorEtiqueta(raiz, fila)
    .locator('xpath=ancestor::tr[1]')
    .locator('label')
    .evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0).map((e) => e.textContent ?? ''))
    .catch(() => [] as string[])
  const estados = textos.map(estadoDeTexto).filter((e) => e !== null)
  // Esperado: [Estándar, Personalizado]. Si no salen exactamente dos, no se afirma nada.
  return estados.length === 2 ? [estados[0], estados[1]] : [null, null]
}

type Celda = { texto: string | null; importe: number | null }

/** Valor de un control: texto de la opción elegida (select) o contenido (input). Vacío → `null`, nunca 0. */
async function leerControl(c: Locator): Promise<Celda> {
  const texto = await c
    .evaluate((el) => {
      if (el instanceof HTMLSelectElement) return el.selectedOptions[0]?.textContent ?? ''
      return (el as HTMLInputElement).value ?? ''
    })
    .catch(() => '')
  const t = texto.trim()
  // Una opción «Seleccione…» o vacía es «sin dato», no un valor.
  if (t === '' || /^seleccione/i.test(t)) return { texto: null, importe: null }
  return { texto: t, importe: importeEs(t) }
}

async function leerFila(raiz: Raiz, p: Partida): Promise<{ estandar: Celda; personalizado: Celda; franquicia: Celda | null }> {
  const fila = filaPorEtiqueta(raiz, p.fila, p.grupo)
  // DOM real (06/10/2026): cada fila trae también «anterior…» e «iC…» ocultos (`display:none`), así que no vale
  // el orden de los controles: cada columna va por el prefijo de su id (Estándar / Personalizado / Franquicia).
  // Personalizado puede ser input o select (las sumas aseguradas de RC); Franquicia, un select.
  const columna = async (prefijo: string): Promise<Celda | null> => {
    const c = fila.locator(`input[id^="${prefijo}"], select[id^="${prefijo}"]`)
    return (await c.count()) === 1 ? leerControl(c) : null
  }
  const vacio: Celda = { texto: null, importe: null }
  const estandar = (await columna('estandar')) ?? vacio
  const personalizado = (await columna('personalizado')) ?? vacio
  const franquicia = p.franquicia ? await columna('franquicia') : null
  return { estandar, personalizado, franquicia }
}

type LecturaCalculo = {
  /** Coste anual de la modalidad elegida según «COSTE ANUAL DEL SEG.» de Datos Básicos (referencia cruzada). */
  costeDatosBasicos: number | null
  coberturas: CoberturaOferta[]
  franquicias: FranquiciaOferta[]
}

/** Lee, ANTES de avanzar, la tabla de garantías de Datos Básicos para la modalidad elegida. */
async function leerCalculo(raiz: Raiz, ctx: ContextoPortal, modalidad: ModalidadPortal): Promise<LecturaCalculo> {
  const costes = costesAnuales(raiz)
  const columna = modalidad === 'estandar' ? 0 : 1
  const costeDatosBasicos = importeEs(await costes.nth(columna).inputValue().catch(() => ''))

  const coberturas: CoberturaOferta[] = []
  const franquicias: FranquiciaOferta[] = []
  for (const a of ASISTENCIAS) {
    const estados = await leerEstadosAsistencia(raiz, a.fila)
    coberturas.push({ clave: a.clave, literal: a.literal, estado: estados[columna], capital: null, limite: null, franquicia: null })
  }
  for (const p of PARTIDAS) {
    try {
      const f = await leerFila(raiz, p)
      const celda = columna === 0 ? f.estandar : f.personalizado
      // Capital = lo que muestra la columna elegida. Estado null: la tabla no dice «incluida» en estas filas.
      coberturas.push({ clave: p.clave, literal: p.literal, estado: null, capital: celda.importe, limite: null, franquicia: f.franquicia?.importe ?? null })
      if (f.franquicia?.texto) {
        franquicias.push({ ambito: p.clave, importeEur: f.franquicia.importe, literal: f.franquicia.importe === null ? f.franquicia.texto : null })
      }
    } catch (e) {
      // Una fila ilegible no tumba la oferta (la prima se lee después): se anota y se sigue.
      ctx.log(`partida «${p.literal}» ilegible: ${e instanceof Error ? e.message.slice(0, 120) : 'error'}`)
    }
  }
  return { costeDatosBasicos, coberturas, franquicias }
}

/**
 * Pestaña «Tarificar»: tabla Anual / Sucesivos con Prima Neta, Impuestos y Prima Total. Aquí los importes
 * van con PUNTO decimal y sin miles (`importePuntoDecimal`, no `importeEs`). Lo que no se lee es `null`.
 */
async function leerPrimas(raiz: Raiz): Promise<{ anual: DesglosePrima; sucesivos: DesglosePrima }> {
  const fila = async (etiqueta: string): Promise<[number | null, number | null]> => {
    const textos = await filaPorEtiqueta(raiz, etiqueta).locator('td').allInnerTexts().catch(() => [] as string[])
    const importes = textos.slice(1).map((t) => importePuntoDecimal(t)).filter((n): n is number => n !== null)
    // Esperado: [anual, sucesivos]. Si no salen exactamente dos importes, no se afirma ninguno.
    return importes.length === 2 ? [importes[0], importes[1]] : [null, null]
  }
  const [netaA, netaS] = await fila('Prima Neta')
  const [impA, impS] = await fila('Impuestos')
  const [totA, totS] = await fila('Prima Total')
  return {
    anual: { primaNetaEur: netaA, impuestosEur: impA, primaTotalEur: totA },
    sucesivos: { primaNetaEur: netaS, impuestosEur: impS, primaTotalEur: totS },
  }
}

/**
 * PDF del proyecto: pestaña «Proyecto» (no graba nada). La descarga se captura en paralelo
 * con la pulsación de «Proyecto»; se obtiene el fichero, se verifica que sea PDF y se
 * convierte a base64.
 */
async function descargarProyecto(page: Page, raiz: Raiz, ctx: ContextoPortal, nombre: string): Promise<PdfRef | null> {
  const pestana = raiz.getByText('Proyecto', { exact: true }).first()
  const descargar = page.waitForEvent('download', { timeout: 45_000 })

  // Lanzar descarga en paralelo con la pulsación
  const [, descarga] = await Promise.all([
    ctx.abrirProyecto(pestana),
    descargar,
  ]).catch(() => [undefined, null] as const)

  if (!descarga) {
    ctx.log('pdf: no se descargó tras abrir «Proyecto»')
    return null
  }

  // Leer el fichero desde el stream
  let bytes: Buffer | null = null
  try {
    const trozos: Buffer[] = []
    const flujo = await descarga.createReadStream()
    for await (const t of flujo) {
      trozos.push(Buffer.from(t))
    }
    bytes = Buffer.concat(trozos)
  } catch (e) {
    ctx.log(`pdf: error al leer la descarga: ${e instanceof Error ? e.message : 'error'}`)
    return null
  }

  // Un PDF de verdad empieza por «%PDF»; si no, no se adjunta (no se sube cualquier cosa).
  if (!bytes || bytes.length < 5 || bytes.subarray(0, 4).toString('latin1') !== '%PDF') {
    ctx.log('pdf: lo recibido no es un PDF; se omite')
    return null
  }

  return ctx.adjuntarPdf(nombre, bytes)
}

export const allianzComunidades: AdaptadorPortal = {
  compania: 'allianz',
  ramo: 'comunidades',
  credencial: 'ALLIANZ_EPAC',
  async tarificar(page, riesgo, ctx) {
    // UNA modalidad por trabajo (por defecto estándar). Querer las dos = DOS trabajos (dos pasadas):
    // tras «Aceptar» el formulario avanza y no hay vuelta atrás sin riesgo de dejar el portal a medias.
    const modalidad: ModalidadPortal = riesgo.modalidad ?? 'estandar'
    await login(page, ctx)
    await ctx.trasLogin()
    await acompanarPaso(page, ctx, 'login', 'Cabecera de ePAC logueada (aparece «Mediador principal»)')
    await abrirComunidades(page, ctx)
    // El formulario vive en un iframe (`appArea`): todo lo que sigue se busca en su marco.
    const formulario = await marcoFormulario(page)
    ctx.log(`formulario en el marco «${formulario.name() || '(sin nombre)'}»`)
    await rellenarRiesgo(formulario, page, riesgo, ctx)
    await acompanarPaso(page, ctx, 'formulario', 'Datos Básicos de «Comunidades 2020» con todos los campos rellenados', { modalidadPedida: modalidad })
    const resultado = await calcular(page, ctx)
    await acompanarPaso(page, ctx, 'tras_calcular', '«COSTE ANUAL DEL SEG. SEGÚN OPCIÓN» con importe tras pulsar Calcular', { modalidadPedida: modalidad })
    const calculo = await leerCalculo(resultado, ctx, modalidad)
    // Datos Básicos → elegir modalidad → «Aceptar» (SOLO avanza a Tarificar; guardado por fases).
    await ctx.elegirOpcion(modalidad)
    await ctx.pausa()
    await ctx.avanzarATarificar()
    await ctx.exigirSinCaptcha()
    // Tras el avance el servlet puede recargar o cambiar de marco: se busca el que trae «Prima Total».
    const tarificar = await marcoCon(page, (r) => filaPorEtiqueta(r, 'Prima Total'), 'Prima Total')
    const primas = await leerPrimas(tarificar)
    await acompanarPaso(page, ctx, 'resultado', 'Pestaña Tarificar con Prima Neta, Impuestos y Prima Total (anual y sucesivos)', {
      valoresLeidos: { primaNetaEur: primas.anual.primaNetaEur, impuestosEur: primas.anual.impuestosEur, primaTotalEur: primas.anual.primaTotalEur },
      modalidadPedida: modalidad,
    })
    if (primas.anual.primaTotalEur === null) {
      throw new ErrorTarificador('portal', 'allianz/comunidades: la pestaña Tarificar no trajo «Prima Total» anual legible')
    }
    const pdf = await descargarProyecto(page, tarificar, ctx, `proyecto-comunidades-2020-${modalidad}.pdf`)
    await acompanarPaso(page, ctx, 'proyecto', 'Pestaña Tarificar tras abrir «Proyecto» (descarga del PDF)', { modalidadPedida: modalidad })
    const avisos = [
      `Modalidad ${modalidad === 'estandar' ? 'Estándar' : 'Personalizado'} (la otra requiere otro trabajo)`,
      'Prima anual = Prima Total del primer año; los recibos sucesivos pueden diferir (ver desglose)',
      'Capitales y franquicias tal como los muestra la tabla de ePAC; «estado» solo en las asistencias (Incluida/Excluida)',
    ]
    if (pdf === null) avisos.push('PDF del proyecto no obtenido (TODO: confirmar si «Proyecto» da descarga o ventana)')
    if (calculo.costeDatosBasicos !== null && primas.sucesivos.primaTotalEur !== null && calculo.costeDatosBasicos !== primas.sucesivos.primaTotalEur) {
      avisos.push('El coste de Datos Básicos no coincide con la Prima Total de sucesivos: revisar a mano')
    }
    const oferta: OfertaNormalizada = {
      compania: 'Allianz',
      producto: `Comunidades 2020 · ${modalidad === 'estandar' ? 'Estándar' : 'Personalizado'}`,
      primaAnualEur: primas.anual.primaTotalEur,
      primaNetaEur: primas.anual.primaNetaEur,
      fraccionamiento: null,
      importeReciboEur: primas.sucesivos.primaTotalEur,
      coberturas: calculo.coberturas,
      franquicias: calculo.franquicias,
      validaHasta: null,
      referenciaPortal: null,
      pdf,
      desglose: { anual: primas.anual, sucesivos: primas.sucesivos },
      avisos,
    }
    return { ofertas: [oferta] }
  },
}
