// Inventario de ESTRUCTURA de todos los marcos de la página (13/10/2026), para mapear pantallas que el grabador no lee
// (Allianz AUTOS Turismos: app Angular en un iframe de OTRO origen). Lo dispara el runner SOLO cuando el error del
// intento lo pide (`ErrorMapaIncompleto` de allianz/auto). Alberto dio el OK a que el BOT lea la estructura.
//
// SOLO LECTURA: un `evaluate` por marco que recorre el DOM y devuelve atributos. No hace clic, no escribe, no navega, no
// dispara eventos. NUNCA lee `.value` de un input/textarea (el extractor no lo toca); de un `<select>` solo sus OPCIONES
// (catálogo), nunca cuál está elegida. Lo crudo pasa por `sanearInventarioDom` (@central/module-tarificacion): lista
// blanca de claves, filtro de datos personales, truncados y tope de 60 KB.

import { sanearInventarioDom, MAX_BYTES_INVENTARIO_DOM, type InventarioDom } from '@central/module-tarificacion'
import type { Frame, Page } from 'playwright'

/**
 * Extractor que corre EN EL MARCO. Va como TEXTO (no como función) a propósito: tsx envuelve las funciones con nombre
 * en `__name`, que no existe en la página. Visible = con caja y sin `display:none`/`visibility:hidden` (un control
 * estilizado sin caja se acepta si tiene `<label>`: su etiqueta es lo que se ve).
 */
export const EXTRACTOR_INVENTARIO = `(() => {
  const SEL = 'input,select,textarea,button,a[role=button],[role=button],[role=tab],[role=combobox],[role=checkbox],td[onclick],label';
  const CON_TEXTO = { button: 1, a: 1, td: 1, label: 1 };
  const ROLES_CON_TEXTO = { button: 1, tab: 1 };
  const corta = (s, n) => (s == null ? null : (String(s).replace(/\\s+/g, ' ').trim().slice(0, n) || null));
  const out = [];
  const lista = Array.from(document.querySelectorAll(SEL));
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
    if (CON_TEXTO[tag] || (role && ROLES_CON_TEXTO[role])) e.texto = corta(el.innerText || el.textContent || '', 200);
    if (tag === 'td' || tag === 'button' || tag === 'a') e.onclick = corta(el.getAttribute('onclick'), 200);
    if (tag === 'select') {
      e.opciones = Array.from(el.options).slice(0, 40).map((o) => ({ valor: o.value, texto: o.textContent }));
      e.opcionesTotal = el.options.length;
    }
    out.push(e);
  }
  return out;
})()`

/** Lo mínimo de un marco que usa el inventario (inyectable en los tests). */
type MarcoLeible = Pick<Frame, 'url' | 'name' | 'isDetached' | 'evaluate'>

const conTope = <T>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms).unref?.())])

/**
 * Inventario saneado de TODOS los marcos de la página (incluidos los de otro origen: Playwright entra en ellos). Un marco
 * que no responde en `msPorMarco` sale con `ilegible`. Nunca lanza: si no se puede, `null`.
 */
export async function capturarInventarioDom(page: Pick<Page, 'frames'>, maxBytes = MAX_BYTES_INVENTARIO_DOM, msPorMarco = 5_000): Promise<InventarioDom | null> {
  try {
    const marcos: unknown[] = []
    for (const f of page.frames() as MarcoLeible[]) {
      if (f.isDetached()) continue
      const elementos = await conTope(f.evaluate(EXTRACTOR_INVENTARIO) as Promise<unknown>, msPorMarco)
      marcos.push({ url: f.url(), nombre: f.name() || null, elementos: Array.isArray(elementos) ? elementos : [], ...(Array.isArray(elementos) ? {} : { ilegible: true }) })
    }
    return sanearInventarioDom({ marcos }, maxBytes)
  } catch {
    return null
  }
}
