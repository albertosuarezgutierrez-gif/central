// Inventario de ESTRUCTURA de todos los marcos de la página (13/10/2026), para mapear pantallas que el grabador no lee
// (Allianz AUTOS Turismos: app Angular en un iframe de OTRO origen). Lo dispara el runner SOLO cuando el error del
// intento lo pide (`ErrorMapaIncompleto` de allianz/auto). Alberto dio el OK a que el BOT lea la estructura.
//
// SOLO LECTURA: un `evaluate` por marco que recorre el DOM y devuelve atributos. No hace clic, no escribe, no navega, no
// dispara eventos. NUNCA lee `.value` de un input/textarea (el extractor no lo toca); de un `<select>` solo sus OPCIONES
// (catálogo), nunca cuál está elegida. Lo crudo pasa por `sanearInventarioDom` (@central/module-tarificacion): lista
// blanca de claves, filtro de datos personales, truncados y tope de 60 KB.

import { sanearInventarioDom, MAX_BYTES_INVENTARIO_DOM, MAX_MARCOS_INVENTARIO, type InventarioDom } from '@central/module-tarificacion'
import type { ElementHandle, Frame, JSHandle, Page } from 'playwright'
import { SELECTOR_AVANCE_SERVLET, SELECTOR_DIALOGO, tituloDialogoVivo } from './guard.ts'

/**
 * Extractor que corre EN EL MARCO. Va como TEXTO (no como función) a propósito: tsx envuelve las funciones con nombre
 * en `__name`, que no existe en la página. Visible = con caja y sin `display:none`/`visibility:hidden` (un control
 * estilizado sin caja se acepta si tiene `<label>`: su etiqueta es lo que se ve).
 *
 * `explora = true` (EXPLORADOR IA, 13/10/2026) devuelve además, EN EL MISMO ORDEN que `elementos`, la lista de NODOS (para
 * re-resolver la `ref` del inventario sin buscar por texto), `conValor` por control (SOLO el booleano: el `.value` se mira
 * dentro de la página y nunca sale de ella), `titulos` como `{ texto, tag }` (h1-h6/legend/th/caption visibles) e
 * `importes` (texto corto con € o decimales y la etiqueta de su fila), y el div clicable del servlet de Allianz
 * (`SELECTOR_AVANCE_SERVLET` de guard.ts: el avance de Datos básicos de Comunidades no es un button). Sigue sin escribir,
 * pulsar ni navegar.
 */
function extractor(explora: boolean): string {
  return `(() => {
  const EXPLORA = ${explora ? 'true' : 'false'};
  // EXPLORACIÓN: también el avance del servlet de Allianz (un div con id y onclick, no un button; selector de guard.ts).
  // SOLO ese selector exacto; el módulo solo lo deja avanzar si es el avance autorizado de Datos básicos.
  const SEL_SERVLET = ${JSON.stringify(SELECTOR_AVANCE_SERVLET)};
  // Enlaces, menús, opciones y mat-icon (14/10/2026, Mapfre wmediadores/NSEI: menús de enlaces y lupas con mat-icon).
  // Solo estructura y texto visible del control; nunca valores. Los controles de elección de fila NO (guardián: solo guard.ts).
  // AngularJS (14/10/2026, fallo a5f06f70): las tarjetas de wmediadores son \`div.card-link[ng-click]\` con un \`<p>\` dentro (ni
  // <a> ni <button>); sin esto el inventario solo veía el menú superior. Su manejador viaja como \`onclick\` (el saneado lo
  // admite y la IA/el validador lo miran igual). En exploración un div no es avanzable (\`esAvanzable\`): no amplía acciones.
  const SEL = 'input,select,textarea,button,a,[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=combobox],[role=checkbox],mat-icon,td[onclick],[ng-click],[data-ng-click],label' + (EXPLORA ? ',' + SEL_SERVLET : '');
  const ngClick = (el) => el.getAttribute('ng-click') || el.getAttribute('data-ng-click');
  const esDivServlet = (el) => EXPLORA && el.matches(SEL_SERVLET);
  // EXPLORACIÓN: título del DIÁLOGO/modal más cercano (la MISMA función y el MISMO selector que la comprobación viva de
  // guard.ts, \`pulsarGuardadoDialogoAutorizado\`). Solo se lee.
  const SEL_DIALOGO = ${JSON.stringify(SELECTOR_DIALOGO)};
  const tituloDialogo = (${tituloDialogoVivo.toString()});
  const CON_TEXTO = { button: 1, a: 1, td: 1, label: 1, 'mat-icon': 1 };
  const ROLES_CON_TEXTO = { button: 1, tab: 1, link: 1, menuitem: 1, option: 1 };
  const corta = (s, n) => (s == null ? null : (String(s).replace(/\\s+/g, ' ').trim().slice(0, n) || null));
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return !(r.width === 0 && r.height === 0);
  };
  const out = [];
  const nodos = [];
  // DIAGNÓSTICO (no exploración): también dentro de shadow DOM ABIERTO (componentes web). En exploración no: sus refs se
  // re-resuelven por handle y el bucle IA queda como estaba.
  const todos = (raiz, acc, prof) => {
    for (const el of Array.from(raiz.querySelectorAll(SEL))) acc.push(el);
    if (EXPLORA || prof > 4 || acc.length > 2000) return acc;
    for (const h of Array.from(raiz.querySelectorAll('*'))) if (h.shadowRoot) todos(h.shadowRoot, acc, prof + 1);
    return acc;
  };
  const lista = todos(document, [], 0);
  for (let i = 0; i < lista.length && out.length < 600; i++) {
    const el = lista[i];
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (tag === 'input' && type === 'hidden') continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0 && !(el.labels && el.labels.length)) continue;
    const role = el.getAttribute('role');
    const e = {
      tag: tag,
      id: el.id || null,
      name: el.getAttribute('name'),
      type: el.getAttribute('type'),
      role: role,
      ariaLabel: el.getAttribute('aria-label'),
      placeholder: el.getAttribute('placeholder'),
      formControlName: el.getAttribute('formcontrolname'),
      requerido: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
      deshabilitado: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
    };
    if (el.labels && el.labels.length) {
      e.etiqueta = corta(Array.from(el.labels).map((l) => l.innerText || l.textContent || '').join(' '), 200);
    } else if (el.getAttribute('aria-labelledby')) {
      e.etiqueta = corta(el.getAttribute('aria-labelledby').split(/\\s+/).map((id) => { const x = document.getElementById(id); return x ? (x.innerText || x.textContent || '') : ''; }).join(' '), 200);
    }
    const divServlet = esDivServlet(el);
    const ng = ngClick(el);
    if (CON_TEXTO[tag] || (role && ROLES_CON_TEXTO[role]) || divServlet || ng) e.texto = corta(el.innerText || el.textContent || '', 200);
    if (tag === 'td' || tag === 'button' || tag === 'a' || divServlet) e.onclick = corta(el.getAttribute('onclick'), 200);
    if (ng && !e.onclick) e.onclick = corta(ng, 200);
    if (tag === 'select') {
      e.opciones = Array.from(el.options).slice(0, 40).map((o) => ({ valor: o.value, texto: o.textContent }));
      e.opcionesTotal = el.options.length;
    }
    if (EXPLORA && (tag === 'input' || tag === 'select' || tag === 'textarea')) {
      // Solo el booleano: el valor no sale de la página. Casillas/opciones: marcadas; su valor por defecto es «on».
      e.conValor = el.checked === true || (type !== 'checkbox' && String(el.value || '') !== '' && !(tag === 'input' && el.value === 'on' && type !== 'text'));
      // Estado INVÁLIDO (14/10/2026), solo el booleano: aria-invalid, clase «*-invalid» (Angular ng-invalid, is-invalid…)
      // o el contenedor NDBX/nx del campo marcado con error.
      const caja = el.closest ? el.closest('nx-formfield,.nx-formfield') : null;
      e.invalido = el.getAttribute('aria-invalid') === 'true'
        || /(^|\\s)[\\w-]*-invalid(\\s|$)/.test(String(el.getAttribute('class') || ''))
        || !!(caja && /(^|\\s)[\\w-]*(has-error|invalid)[\\w-]*(\\s|$)/.test(String(caja.getAttribute('class') || '')));
      // ¿AUTOCOMPLETA? (14/10/2026) aria-autocomplete list/both/inline o un datalist (atributo list): su rellenar puede repintar.
      const ac = String(el.getAttribute('aria-autocomplete') || '').toLowerCase();
      if (tag !== 'select' && (ac === 'list' || ac === 'both' || ac === 'inline' || el.hasAttribute('list'))) e.autocompletar = true;
    }
    if (EXPLORA) {
      const dlg = tituloDialogo(el, SEL_DIALOGO);
      if (dlg) e.dialogo = dlg;
    }
    out.push(e);
    nodos.push(el);
  }
  if (!EXPLORA) return out;
  const titulos = [];
  for (const h of Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,legend,th,caption'))) {
    if (titulos.length >= 40) break;
    if (!visible(h)) continue;
    const t = corta(h.innerText || h.textContent || '', 200);
    if (t) titulos.push({ texto: t, tag: h.tagName.toLowerCase() });
  }
  const importes = [];
  const RE = /^(?:€\\s*)?-?[\\d.,]{1,15}\\s*(?:€|eur(?:os)?)?$/i;
  for (const n of Array.from(document.querySelectorAll('td,th,span,strong,b,div,p,dd,li,label,output'))) {
    if (importes.length >= 40) break;
    if (n.children.length > 0) continue;
    const t = corta(n.innerText || n.textContent || '', 40);
    if (!t || t.length > 30 || !/\\d/.test(t) || !RE.test(t) || !(/€|eur/i.test(t) || /,\\d{1,2}$/.test(t))) continue;
    if (!visible(n)) continue;
    let etiqueta = null;
    const fila = n.closest('tr');
    if (fila && fila.cells && fila.cells.length > 1 && fila.cells[0] !== n) etiqueta = corta(fila.cells[0].innerText || fila.cells[0].textContent || '', 200);
    if (!etiqueta && n.previousElementSibling) etiqueta = corta(n.previousElementSibling.innerText || n.previousElementSibling.textContent || '', 200);
    importes.push({ texto: t, etiqueta: etiqueta });
  }
  return { elementos: out, nodos: nodos, titulos: titulos, importes: importes };
})()`
}

export const EXTRACTOR_INVENTARIO = extractor(false)
export const EXTRACTOR_EXPLORACION = extractor(true)

/**
 * Los marcos de VARIAS pestañas como si fueran una página (14/10/2026: Mapfre abre NSEI en una pestaña nueva). La pestaña
 * más reciente va PRIMERO (el inventario se trunca por tamaño y la que importa es la última abierta). Sin pestañas abiertas,
 * los de `porDefecto`. Puro.
 */
export function marcosDePestanas<F>(abiertas: ReadonlyArray<{ frames(): F[] }>, porDefecto: { frames(): F[] }): { frames(): F[] } {
  const lista = abiertas.length > 0 ? [...abiertas].reverse() : [porDefecto]
  return { frames: () => lista.flatMap((p) => p.frames()) }
}

/** Lo mínimo de un marco que usa el inventario (inyectable en los tests). */
type MarcoLeible = Pick<Frame, 'url' | 'name' | 'isDetached' | 'evaluate'>

const conTope = <T>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms).unref?.())])

/**
 * Inventario saneado de TODOS los marcos de la página (incluidos los de otro origen: Playwright entra en ellos). Un marco
 * que no responde en `msPorMarco` sale con `ilegible`. Nunca lanza: si no se puede, `null`.
 */
export async function capturarInventarioDom(page: Pick<Page, 'frames'>, maxBytes = MAX_BYTES_INVENTARIO_DOM, msPorMarco = 5_000, msTotal = 15_000): Promise<InventarioDom | null> {
  try {
    const marcos: unknown[] = []
    const fin = Date.now() + msTotal
    for (const f of (page.frames() as MarcoLeible[]).slice(0, MAX_MARCOS_INVENTARIO)) {
      if (f.isDetached()) continue
      const resta = fin - Date.now()
      if (resta <= 0) break
      const elementos = await conTope(f.evaluate(EXTRACTOR_INVENTARIO) as Promise<unknown>, Math.min(msPorMarco, resta))
      marcos.push({ url: f.url(), nombre: f.name() || null, elementos: Array.isArray(elementos) ? elementos : [], ...(Array.isArray(elementos) ? {} : { ilegible: true }) })
    }
    return sanearInventarioDom({ marcos }, maxBytes)
  } catch {
    return null
  }
}

// ─── Explorador IA (13/10/2026) ──────────────────────────────────────────────

/** Un nodo señalable del inventario de exploración: su marco y su handle (el MISMO elemento que se inventarió). */
export type NodoExploracion = { marco: Frame; handle: ElementHandle<Node> }

export type InventarioExploracion = {
  /** Saneado con `{ refs: true }`: es lo ÚNICO que sale hacia asegura (y la IA). */
  inventario: InventarioDom
  /** ref (`m<i>e<j>`) → nodo. Solo las refs que sobrevivieron al saneado. Nunca sale del proceso. */
  nodos: Map<string, NodoExploracion>
  /** Suelta los handles (se llama antes de la siguiente captura). */
  liberar: () => Promise<void>
}

type MarcoExplorable = Pick<Frame, 'url' | 'name' | 'isDetached' | 'evaluateHandle'>

/**
 * Inventario de EXPLORACIÓN: el mismo saneado que `capturarInventarioDom` (lista blanca, sin valores ni datos personales,
 * ≤60 KB) más `ref` por elemento, `conValor`, `titulos {texto, tag}` e `importes`, y la lista de NODOS en el mismo orden
 * que el crudo (la ref es el índice crudo: `m<marco>e<índice>`). Solo lectura. `null` si no se puede leer.
 */
export async function capturarInventarioExploracion(page: Pick<Page, 'frames'>, maxBytes = MAX_BYTES_INVENTARIO_DOM, msPorMarco = 5_000, msTotal = 15_000): Promise<InventarioExploracion | null> {
  const handles: JSHandle[] = []
  const liberar = async () => {
    await Promise.all(handles.splice(0).map((h) => h.dispose().catch(() => undefined)))
  }
  try {
    const marcos: unknown[] = []
    const porMarco: { marco: Frame; nodos: (ElementHandle<Node> | null)[] }[] = []
    const fin = Date.now() + msTotal
    for (const f of (page.frames() as (MarcoExplorable & Frame)[]).slice(0, MAX_MARCOS_INVENTARIO)) {
      if (f.isDetached()) continue
      const resta = fin - Date.now()
      if (resta <= 0) break
      const h = await conTope(f.evaluateHandle(EXTRACTOR_EXPLORACION) as Promise<JSHandle>, Math.min(msPorMarco, resta))
      let datos: { elementos?: unknown; titulos?: unknown; importes?: unknown } | null = null
      let nodos: (ElementHandle<Node> | null)[] = []
      if (h) {
        handles.push(h)
        const [d, n] = await Promise.all([
          conTope(h.evaluate((x: { elementos: unknown; titulos: unknown; importes: unknown }) => ({ elementos: x.elementos, titulos: x.titulos, importes: x.importes })), msPorMarco),
          conTope(h.getProperty('nodos'), msPorMarco),
        ])
        datos = d
        if (n) {
          handles.push(n)
          const props = await conTope(n.getProperties(), msPorMarco)
          if (props) {
            for (const [k, v] of props) {
              handles.push(v)
              const i = Number(k)
              if (Number.isInteger(i) && i >= 0 && i < 1000) nodos[i] = v.asElement()
            }
          }
        }
      }
      const elementos = Array.isArray(datos?.elementos) ? datos!.elementos : null
      if (!elementos) nodos = []
      marcos.push({
        url: f.url(), nombre: f.name() || null, elementos: elementos ?? [],
        ...(elementos ? { titulos: Array.isArray(datos?.titulos) ? datos!.titulos : [], importes: Array.isArray(datos?.importes) ? datos!.importes : [] } : { ilegible: true }),
      })
      porMarco.push({ marco: f, nodos })
    }
    const inventario = sanearInventarioDom({ marcos }, maxBytes, { refs: true })
    if (!inventario) {
      await liberar()
      return null
    }
    const mapa = new Map<string, NodoExploracion>()
    inventario.marcos.forEach((m, im) => {
      for (const el of m.elementos) {
        const r = el.ref ? /^m(\d+)e(\d+)$/.exec(el.ref) : null
        if (!r || Number(r[1]) !== im) continue
        const pm = porMarco[im]
        const handle = pm?.nodos[Number(r[2])]
        if (pm && handle) mapa.set(el.ref!, { marco: pm.marco, handle })
      }
    })
    return { inventario, nodos: mapa, liberar }
  } catch {
    await liberar()
    return null
  }
}
