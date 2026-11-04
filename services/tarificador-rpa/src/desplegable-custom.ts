// 0.3.43 (Pelayo real 04/11/2026, «Tipo de documento» del modal «Datos del Tomador»): `elegir`/`seleccionar` sobre un CUSTOM ELEMENT de desplegable
// SIN <select> nativo (`<pelayo-smart-select>`: shadow abierto con `pelayo-label > label`, un `div` disparador visible y `li` OCULTOS = opciones).
// GENERAL (no de Pelayo), con el patrón del nx-dropdown: abrir el disparador y pulsar la opción de texto EXACTO, ambas por el `pulsar` guardado.
//   · el texto (espacios colapsados) tiene que casar EXACTO con UNA opción (nunca subcadena: «NIF» no casa con «DNI/NIF»); si las opciones ya
//     están en el DOM (aunque ocultas) y ninguna casa, NO se pulsa nada;
//   · un texto que nombra una acción final no se pulsa (además del guard de siempre en cada clic);
//   · solo se pulsa DENTRO del propio custom element (su disparador, sus opciones) o una opción de un overlay LIGADO a él (aria-controls/aria-owns);
//   · al final se comprueba que el control MUESTRA ese texto.
// Los scripts de página van como cuerpo de `new Function` (tsx envuelve las funciones con nombre en `__name`, que no existe en la página).
import { randomUUID } from 'node:crypto'
import type { Frame, Locator } from 'playwright'
import { pareceEmision, RE_TEXTO_ACCION_FINAL_SIN_TEXTO } from '@central/module-tarificacion'

/** Atributo temporal con el que se señala el disparador/la opción a pulsar (Playwright perfora los shadow roots abiertos por CSS). */
export const ATRIBUTO_DESPLEGABLE = 'data-tarificador-desp'

export type ResultadoDesplegableCustom = 'ok' | 'no_encontrada' | 'accion_final' | 'sin_disparador' | 'no_aplicada'

/** Motivo legible (sin PII: nunca el texto de la opción) de cada resultado que no es `ok`. */
export const MOTIVO_DESPLEGABLE_CUSTOM: Record<Exclude<ResultadoDesplegableCustom, 'ok'>, string> = {
  no_encontrada: 'ninguna opción del desplegable casa EXACTAMENTE con ese texto (no se pulsó ninguna opción)',
  accion_final: 'el texto de la opción nombra una acción final: no se pulsa',
  sin_disparador: 'no hay disparador visible dentro del desplegable',
  no_aplicada: 'tras pulsar la opción el control no muestra ese texto',
}

/** Texto normalizado (espacios colapsados, recortado). Exacto: ni mayúsculas ni acentos se tocan. Pura. */
export const normalizarTextoOpcion = (s: string): string => s.replace(/\s+/g, ' ').trim()

/** ¿El texto nombra una acción final (emisión, contratar, firmar, pagar, IBAN…)? Pura. */
export function textoOpcionDeAccionFinal(t: string): boolean {
  return pareceEmision(t) || RE_TEXTO_ACCION_FINAL_SIN_TEXTO.test(t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase())
}

const LIB = `
  const norm = (s) => String(s == null ? '' : s).replace(/\\s+/g, ' ').trim();
  const vis = (e) => {
    const w = e.ownerDocument.defaultView, cs = w.getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
    const r = e.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const raices = (host) => {
    const rs = [host];
    if (host.shadowRoot) rs.push(host.shadowRoot);
    for (let k = 0; k < rs.length && k < 30; k++) for (const x of Array.from(rs[k].querySelectorAll('*'))) if (x.shadowRoot && rs.length < 30 && rs.indexOf(x.shadowRoot) < 0) rs.push(x.shadowRoot);
    return rs;
  };
  // Overlay LIGADO: elementos que nombran aria-controls / aria-owns del host o de algo de su interior (misma raíz o documento).
  const ligados = (host, rs) => {
    const out = [];
    for (const r of rs) {
      const xs = r === host ? [host] : [];
      for (const x of Array.from(r.querySelectorAll('[aria-controls],[aria-owns]'))) xs.push(x);
      if (r === host && host.matches('[aria-controls],[aria-owns]') && xs.indexOf(host) < 0) xs.push(host);
      for (const x of xs) {
        const ids = (String(x.getAttribute('aria-controls') || '') + ' ' + String(x.getAttribute('aria-owns') || '')).split(/\\s+/).filter((i) => i);
        for (const id of ids) {
          const rz = x.getRootNode();
          const t = (rz && rz.getElementById ? rz.getElementById(id) : null) || x.ownerDocument.getElementById(id);
          if (t && out.indexOf(t) < 0 && rs.indexOf(t) < 0) out.push(t);
        }
      }
    }
    return out;
  };
  const opciones = (host) => {
    const rs = raices(host);
    for (const l of ligados(host, rs)) { rs.push(l); if (l.shadowRoot) rs.push(l.shadowRoot); }
    const out = [];
    for (const r of rs) for (const x of Array.from(r.querySelectorAll('li,[role=option]'))) if (out.indexOf(x) < 0 && out.length < 400) out.push(x);
    return out;
  };
  const exactas = (host, v) => opciones(host).filter((o) => norm(o.textContent) === v);
`

/** Cuenta, SIN pulsar, las opciones (aunque ocultas) y las de texto exacto. */
const SCRIPT_CONTAR = new Function('host', 'v', LIB + `
  return { total: opciones(host).length, exactas: exactas(host, v).length };
`) as (host: Element, v: string) => { total: number; exactas: number }

/** Marca el DISPARADOR: un control explícito del shadow (combobox/aria-haspopup/button) o el primer hijo VISIBLE del shadow que no es rótulo ni lista; sin shadow, el host. */
const SCRIPT_DISPARADOR = new Function('host', 'arg', LIB + `
  const [at, mc] = arg;
  const fuera = (e) => !!e.closest('label,li,ul,ol,[role=option],[role=listbox]') || /-label$/.test(String(e.localName || ''));
  let t = null;
  if (host.shadowRoot) {
    for (const e of Array.from(host.shadowRoot.querySelectorAll('[role=combobox],[aria-haspopup],button,[role=button]'))) { if (!fuera(e) && vis(e)) { t = e; break; } }
    if (!t) for (const e of Array.from(host.shadowRoot.children)) {
      const n = String(e.localName || '');
      if (['style', 'script', 'slot', 'template', 'label', 'li', 'ul', 'ol'].indexOf(n) >= 0 || /-label$/.test(n) || e.matches('[role=option],[role=listbox]')) continue;
      if (vis(e)) { t = e; break; }
    }
  } else if (vis(host)) t = host;
  if (!t) return { ok: false, abierto: false };
  t.setAttribute(at, mc);
  return { ok: true, abierto: host.getAttribute('aria-expanded') === 'true' || t.getAttribute('aria-expanded') === 'true' };
`) as (host: Element, arg: [string, string]) => { ok: boolean; abierto: boolean }

/** Marca la ÚNICA opción VISIBLE y habilitada de texto exacto. */
const SCRIPT_OPCION = new Function('host', 'arg', LIB + `
  const [v, at, mc] = arg;
  const xs = exactas(host, v).filter((o) => vis(o) && o.getAttribute('aria-disabled') !== 'true' && !o.hasAttribute('disabled'));
  if (xs.length !== 1) return false;
  xs[0].setAttribute(at, mc);
  return true;
`) as (host: Element, arg: [string, string, string]) => boolean

/** ¿El control MUESTRA el texto? Algún nodo visible del interior (no rótulo ni opción) cuyo texto propio, o una línea de su innerText, es EXACTAMENTE v. */
const SCRIPT_MUESTRA = new Function('host', 'v', LIB + `
  const fuera = (e) => !!e.closest('label,li,[role=option],[role=listbox]') || /-label$/.test(String(e.localName || ''));
  const rs = raices(host);
  for (const r of rs) {
    const xs = r === host ? [host] : [];
    for (const x of Array.from(r.querySelectorAll('*'))) xs.push(x);
    for (const e of xs) {
      if (r !== host || e !== host) { if (fuera(e) || !vis(e)) continue; }
      const lineas = String(e.innerText || '').split('\\n').map(norm);
      if (lineas.indexOf(v) >= 0) return true;
      if ((e.getAttribute('value') && norm(e.getAttribute('value')) === v && e !== host)) return true;
    }
  }
  return false;
`) as (host: Element, v: string) => boolean

const quitarMarca = (loc: Locator) => loc.evaluate((n, at) => (n as Element).removeAttribute(at), ATRIBUTO_DESPLEGABLE, { timeout: 2_000 }).catch(() => undefined)

/**
 * Elige `texto` en el custom element de desplegable `loc` (el host, ya localizado VIVO). Ver cabecera. Los clics van SOLO por `pulsarGuardado`
 * (guard). Si la opción no está: `no_encontrada` (si sus opciones ya estaban en el DOM, sin pulsar nada; si no, tras abrir y sin pulsar opción).
 */
export async function elegirDesplegableCustom(marco: Frame, loc: Locator, texto: string, pulsarGuardado: (b: Locator) => Promise<void>, esperaMs = 3_000): Promise<ResultadoDesplegableCustom> {
  const v = normalizarTextoOpcion(texto)
  if (v === '' || v.length > 80) return 'no_encontrada'
  if (textoOpcionDeAccionFinal(v)) return 'accion_final'
  const antes = await loc.evaluate(SCRIPT_CONTAR, v, { timeout: 5_000 }).catch(() => null)
  if (!antes) return 'no_encontrada'
  // Opciones ya en el DOM (aunque ocultas) y ninguna (o más de una) exacta: rechazo SIN pulsar nada.
  if (antes.total > 0 && antes.exactas !== 1) return 'no_encontrada'
  const mcD = randomUUID().slice(0, 12)
  const disp = await loc.evaluate(SCRIPT_DISPARADOR, [ATRIBUTO_DESPLEGABLE, mcD] as [string, string], { timeout: 5_000 }).catch(() => null)
  if (!disp || !disp.ok) return 'sin_disparador'
  const disparador = marco.locator(`[${ATRIBUTO_DESPLEGABLE}="${mcD}"]`)
  const mcO = randomUUID().slice(0, 12)
  const marcarOpcion = () => loc.evaluate(SCRIPT_OPCION, [v, ATRIBUTO_DESPLEGABLE, mcO] as [string, string, string], { timeout: 5_000 }).catch(() => false)
  try {
    let marcada = disp.abierto ? await marcarOpcion() : false
    if (!marcada) {
      await pulsarGuardado(disparador)
      for (let t = 0; t < esperaMs && !marcada; t += 150) {
        marcada = await marcarOpcion()
        if (!marcada) await marco.page().waitForTimeout(150)
      }
    }
    if (!marcada) return 'no_encontrada'
    const opcion = marco.locator(`[${ATRIBUTO_DESPLEGABLE}="${mcO}"]`)
    try {
      await pulsarGuardado(opcion)
    } finally {
      await quitarMarca(opcion)
    }
    for (let t = 0; t < esperaMs; t += 150) {
      if (await loc.evaluate(SCRIPT_MUESTRA, v, { timeout: 2_000 }).catch(() => false)) return 'ok'
      await marco.page().waitForTimeout(150)
    }
    return 'no_aplicada'
  } finally {
    await quitarMarca(disparador)
  }
}
