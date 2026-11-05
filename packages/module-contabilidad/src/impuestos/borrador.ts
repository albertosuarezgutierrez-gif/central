// Borrador imprimible (HTML) y CSV de un modelo calculado. PURO. Es lo que se entrega MIENTRAS no exista el fichero oficial:
// «diseño oficial pendiente de contrastar» (el diseño de registro de la AEAT no se ha podido verificar; nunca se inventan posiciones).
import { formatearCentimos } from '../partida/dinero.ts'
import { DISENO_OFICIAL_PENDIENTE, type CalculoModelo, type Casilla } from './comun.ts'
import { AVISO_PRESENTACION } from './declaraciones.ts'

export const escaparHtml = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Neutraliza fórmulas de hoja de cálculo (=, +, -, @, tab, retorno) en texto libre. */
export const neutralizarFormulaCsv = (t: string) => (/^[=+\-@\t\r]/.test(t) ? `'${t}` : t)

export function valorCasilla(c: Casilla): string {
  if (c.tipo === 'porcentaje') return `${c.importe} %`
  if (c.tipo === 'numero') return String(c.importe)
  return formatearCentimos(c.importe)
}

export type TablaExtra = { titulo: string; columnas: readonly string[]; filas: readonly (readonly string[])[] }

export type OpcionesBorrador = { empresa: string; nif?: string; generado: string; extras?: readonly TablaExtra[] }

export function borradorHtml(c: CalculoModelo, o: OpcionesBorrador): string {
  const filas = c.casillas.map((x) => `<tr><td>${escaparHtml(x.casilla)}${x.certeza === 'media' ? ' <span class="media" title="Casilla pendiente de contrastar con el formulario vigente">*</span>' : ''}</td><td>${escaparHtml(x.descripcion)}</td><td class="num">${escaparHtml(valorCasilla(x))}</td><td class="origen">${x.origen.length ? escaparHtml(x.origen.slice(0, 12).join(', ')) + (x.origen.length > 12 ? ` … (+${x.origen.length - 12})` : '') : ''}</td></tr>`).join('')
  const extras = (o.extras ?? []).map((t) => `<h2>${escaparHtml(t.titulo)}</h2><table><thead><tr>${t.columnas.map((h) => `<th>${escaparHtml(h)}</th>`).join('')}</tr></thead><tbody>${t.filas.map((f) => `<tr>${f.map((v) => `<td>${escaparHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('')
  const lista = (titulo: string, xs: readonly string[], clase: string) => (xs.length ? `<div class="${clase}"><strong>${escaparHtml(titulo)}</strong><ul>${xs.map((x) => `<li>${escaparHtml(x)}</li>`).join('')}</ul></div>` : '')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Borrador modelo ${escaparHtml(c.modelo)} ${escaparHtml(c.periodo)} ${c.anio}</title>
<style>body{font:14px/1.45 system-ui,sans-serif;margin:16px auto;max-width:900px;padding:0 16px;color:#111}h1{font-size:1.3rem}h2{font-size:1.05rem;margin-top:1.6rem}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}.num{text-align:right;white-space:nowrap}.origen{font-size:.8rem;color:#555;word-break:break-word}.banda{background:#fff4d6;border:1px solid #e0b84a;padding:10px 12px;margin:12px 0}.aviso{background:#f3f3f3;padding:8px 12px;margin:10px 0}.error{background:#fde8e8;border:1px solid #d99;padding:8px 12px;margin:10px 0}.media{color:#a60}@media print{.banda{break-inside:avoid}}</style></head><body>
<h1>BORRADOR — Modelo ${escaparHtml(c.modelo)} · ${escaparHtml(c.periodo)} ${c.anio}</h1>
<p>${escaparHtml(o.empresa)}${o.nif ? ` · NIF ${escaparHtml(o.nif)}` : ''} · generado el ${escaparHtml(o.generado)}</p>
<div class="banda"><strong>Borrador sin validez ante la AEAT.</strong> ${escaparHtml(AVISO_PRESENTACION)} Fichero oficial: ${escaparHtml(DISENO_OFICIAL_PENDIENTE)}. Las casillas marcadas con * están pendientes de contrastar con el formulario vigente.</div>
${lista('No soportado (no se calcula)', c.noSoportado, 'error')}${lista('Avisos', c.avisos, 'aviso')}
<table><thead><tr><th>Casilla</th><th>Concepto</th><th>Importe</th><th>Origen (asientos/facturas)</th></tr></thead><tbody>${filas}</tbody></table>
<p><strong>Resultado:</strong> ${c.resultado === null ? 'no calculable' : escaparHtml(formatearCentimos(c.resultado))}</p>${extras}
${c.excluidas.length ? `<h2>Operaciones fuera del cálculo</h2><ul>${c.excluidas.map((e) => `<li>${escaparHtml(e.ref)}: ${escaparHtml(e.motivo)}</li>`).join('')}</ul>` : ''}
</body></html>`
}

/** CSV (punto y coma, coma decimal: Excel español) con una fila por casilla. */
export function borradorCsv(c: CalculoModelo): string {
  const esc = (t: string) => (/[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t)
  const cab = ['Modelo', 'Periodo', 'Ejercicio', 'Casilla', 'Concepto', 'Importe', 'Certeza', 'Origen'].join(';')
  const valor = (x: Casilla) => (x.tipo === 'importe' ? `${x.importe < 0 ? '-' : ''}${Math.floor(Math.abs(x.importe) / 100)},${String(Math.abs(x.importe) % 100).padStart(2, '0')}` : String(x.importe))
  const filas = c.casillas.map((x) => [c.modelo, c.periodo, String(c.anio), x.casilla, esc(neutralizarFormulaCsv(x.descripcion)), valor(x), x.certeza, esc(neutralizarFormulaCsv(x.origen.join(' ')))].join(';'))
  return ['﻿' + cab, ...filas, esc(`# BORRADOR sin validez ante la AEAT — ${DISENO_OFICIAL_PENDIENTE}`)].join('\r\n') + '\r\n'
}
