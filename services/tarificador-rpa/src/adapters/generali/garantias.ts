// Generali auto 0.2.59 (01/11/2026) · GARANTÍAS del presupuesto, leídas del PDF del proyecto o, si no hay, de la pantalla «Garantías y Resultados».
// Alberto: el presupuesto nunca puede mostrar «No figura». Antes la oferta de Generali salía con `coberturas: []`. Mismo formato que Mapfre/Allianz
// (`OfertaNormalizada.coberturas` / `franquicias`), reutilizando el parser de `mapfre/garantias.ts` y el texto de PDF de `pdf-texto.ts`.
//
// 🚨 Solo LECTURA. La pantalla se lee con JS de lectura (texto de tablas), sin pulsar nada. Nunca se inventa un estado, un límite ni una franquicia.
// 🚨 SUPUESTO SIN VALIDAR con el portal real: no hay captura de la tabla de garantías de «Garantías y Resultados» ni PDF real de Generali; el lector
//    toma las tablas visibles que hablan de garantías/coberturas/capitales (no la de «Modalidades de Seguro», que es el precio) y el parser acepta
//    «etiqueta + valor» por celdas. Casillas marcadas = incluida, desmarcadas = excluida. Sin texto legible → [] + aviso «coberturas no leídas».
// 🚨 Sin datos personales en avisos ni logs (solo recuentos).
import type { Frame, Page } from 'playwright'
import type { CoberturaOferta, FranquiciaOferta, OfertaNormalizada } from '@central/module-tarificacion'
import { coberturasDeLineas, textoALineas } from '../mapfre/garantias.ts'
import { textoDePdf } from '../../pdf-texto.ts'

export const AVISO_GARANTIAS_PDF_GENERALI = 'Garantías leídas del PDF del presupuesto de Generali.'
export const AVISO_GARANTIAS_PANTALLA_GENERALI = 'Garantías leídas de la pantalla «Garantías y Resultados» de Generali (el PDF del presupuesto no se pudo leer).'
export const AVISO_GARANTIAS_SIN_LEER_GENERALI = 'Garantías de Generali NO leídas (ni del PDF del presupuesto ni de la pantalla): coberturas no leídas.'

export type GarantiasLeidas = { coberturas: CoberturaOferta[]; franquicias: FranquiciaOferta[] }

/** Texto de un PDF → garantías (PURA; nunca lanza). */
export function garantiasDePdfGenerali(bytes: Uint8Array | Buffer | null | undefined): GarantiasLeidas {
  try {
    if (!bytes) return { coberturas: [], franquicias: [] }
    return coberturasDeLineas(textoALineas(textoDePdf(Buffer.from(bytes))))
  } catch {
    return { coberturas: [], franquicias: [] }
  }
}

/**
 * Pone las garantías en la oferta. Orden: PDF > pantalla. Sin ninguna → `coberturas: []` + aviso «coberturas no leídas» (asegura marca el estudio
 * INCOMPLETO; nunca se inventan). PURA.
 */
export function ofertasConGarantiasGenerali(ofertas: readonly OfertaNormalizada[], deLaPdf: GarantiasLeidas, deLaPantalla: GarantiasLeidas): OfertaNormalizada[] {
  const elegida = deLaPdf.coberturas.length > 0
    ? { g: deLaPdf, aviso: AVISO_GARANTIAS_PDF_GENERALI }
    : deLaPantalla.coberturas.length > 0 ? { g: deLaPantalla, aviso: AVISO_GARANTIAS_PANTALLA_GENERALI } : null
  return ofertas.map((o) => (elegida
    ? { ...o, coberturas: elegida.g.coberturas, franquicias: elegida.g.franquicias, avisos: [...o.avisos, elegida.aviso] }
    : { ...o, avisos: [...o.avisos, AVISO_GARANTIAS_SIN_LEER_GENERALI] }))
}

/**
 * SOLO LECTURA (texto JS, no función: tsx envolvería las funciones con nombre en `__name`). Por tabla visible que hable de garantías/coberturas/capitales
 * y que NO sea la de modalidades/precio: una línea por fila, con las celdas separadas por tabulador; una casilla añade «Incluida»/«No incluida» y un
 * desplegable su opción elegida. Nunca valores de campos de texto libres (podrían ser datos personales).
 */
export const JS_GARANTIAS_PANTALLA_GENERALI = `(() => {
  const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const txt = (e) => String(e.textContent || '').replace(/[\\s\\u00a0]+/g, ' ').trim();
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
  const lineas = [];
  document.querySelectorAll('table').forEach((t) => {
    if (!vis(t) || lineas.length >= 400) return;
    if (t.querySelector('table')) return;
    const n = norm(txt(t));
    if (n.indexOf('modalidades de seguro') >= 0 || n.indexOf('recibo anual') >= 0 || n.indexOf('prima anualidad') >= 0) return;
    if (!/garantia|cobertura|capital|franquicia|limite/.test(n)) return;
    Array.from(t.rows || []).forEach((r) => {
      const partes = [];
      Array.from(r.cells || []).forEach((c) => {
        let v = txt(c);
        const cb = c.querySelector('input[type=checkbox]');
        if (cb) v = (v + ' ' + (cb.checked ? 'Incluida' : 'No incluida')).trim();
        const sel = c.querySelector('select');
        if (sel && sel.selectedIndex >= 0) v = (v + ' ' + txt(sel.options[sel.selectedIndex])).trim();
        if (v) partes.push(v.slice(0, 120));
      });
      if (partes.length > 0) lineas.push(partes.join('\\t'));
    });
  });
  return lineas;
})()`

/** Garantías de la pantalla «Garantías y Resultados» (todos los marcos). Solo lectura; nunca lanza (sin lectura → vacío). */
export async function leerGarantiasPantallaGenerali(page: Page): Promise<GarantiasLeidas> {
  const lineas: string[] = []
  try {
    for (const f of page.frames() as Frame[]) {
      if (f.isDetached()) continue
      const l = (await f.evaluate(JS_GARANTIAS_PANTALLA_GENERALI).catch(() => null)) as string[] | null
      if (Array.isArray(l)) lineas.push(...l.filter((x) => typeof x === 'string'))
    }
  } catch { /* sin lectura */ }
  return coberturasDeLineas(lineas)
}
