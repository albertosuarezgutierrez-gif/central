// Exportación de una `Tabla` a CSV (Excel español) y a HTML imprimible (→ PDF con «Imprimir»). PURO.
// Dinero: céntimos enteros → texto con coma decimal SIN pasar por floats. Texto que empieza por = + - @ se neutraliza (inyección de fórmulas).
import type { Celda, Tabla } from './generar.ts'
import type { ColumnaInforme } from './catalogo.ts'
import { formatearCentimos } from '@central/module-contabilidad'

const fechaEs = (iso: string) => iso.split('-').reverse().join('/')

/** 216249 → «2162,49» (sin separador de miles ni símbolo: para hojas de cálculo). */
export function centimosACsv(c: number): string {
  const neg = c < 0
  const abs = Math.abs(c)
  return `${neg ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

export function neutralizarFormula(t: string): string {
  return /^[=+\-@\t\r]/.test(t) ? `'${t}` : t
}

function celdaCsv(v: Celda, col: ColumnaInforme): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return col.tipo === 'dinero' ? centimosACsv(v) : String(v)
  return col.tipo === 'fecha' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? fechaEs(v) : neutralizarFormula(v)
}

const escaparCsv = (t: string) => (/[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t)

/** CSV con BOM UTF-8, separador «;» y saltos CRLF (se abre bien en Excel en español). */
export function aCsv(t: Tabla): string {
  const filas = [...t.filas, ...(t.totales ? [t.totales] : [])]
  const lineas = [
    t.columnas.map((c) => escaparCsv(c.etiqueta)).join(';'),
    ...filas.map((f) => t.columnas.map((c) => escaparCsv(celdaCsv(f[c.clave] ?? null, c))).join(';')),
  ]
  return `﻿${lineas.join('\r\n')}\r\n`
}

export const escaparHtml = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function celdaHtml(v: Celda, col: ColumnaInforme): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return col.tipo === 'dinero' ? formatearCentimos(v) : String(v)
  return escaparHtml(col.tipo === 'fecha' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? fechaEs(v) : v)
}

/**
 * Documento HTML imprimible (PDF desde el navegador). Autónomo: sin recursos externos. `color` ya viene validado/oscurecido (AA) por la
 * marca; si no es `#rrggbb` se ignora.
 */
export function aHtmlImprimible(t: Tabla, marca: { nombre: string; color: string | null; sello: string }, generado: string): string {
  const color = marca.color && /^#[0-9a-f]{6}$/.test(marca.color) ? marca.color : '#1f3d99'
  const filas = [...t.filas.map((f) => ({ f, total: false })), ...(t.totales ? [{ f: t.totales, total: true }] : [])]
  const cab = t.columnas.map((c) => `<th class="${c.tipo === 'dinero' || c.tipo === 'numero' ? 'num' : ''}">${escaparHtml(c.etiqueta)}</th>`).join('')
  const cuerpo = filas.map(({ f, total }) =>
    `<tr${total ? ' class="total"' : ''}>${t.columnas.map((c) => `<td class="${c.tipo === 'dinero' || c.tipo === 'numero' ? 'num' : ''}">${celdaHtml(f[c.clave] ?? null, c)}</td>`).join('')}</tr>`).join('')
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escaparHtml(t.titulo)} — ${escaparHtml(marca.nombre)}</title>
<style>
  body{font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;padding:16px;color:#111;background:#fff}
  header{border-top:4px solid ${color};padding-top:8px;margin-bottom:12px}
  h1{font-size:20px;margin:0}.sub{color:#555;margin:2px 0}.sello{color:#555;font-size:12px}
  .aviso{background:#fff7e0;border:1px solid #e3c866;border-radius:8px;padding:6px 10px;margin:6px 0;font-size:13px}
  .scroll{overflow-x:auto}table{border-collapse:collapse;width:100%}
  th,td{text-align:left;padding:5px 8px;border-bottom:1px solid #ddd;font-size:13px}th{background:#f2f2f2}
  .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.total td{font-weight:700;border-top:2px solid #111}
  button{min-height:44px;padding:0 18px;border:0;border-radius:10px;background:${color};color:#fff;font-size:15px;cursor:pointer;margin-bottom:12px}
  footer{margin-top:14px;font-size:11px;color:#666}
  @media print{.no-imprimir{display:none}body{padding:0}.scroll{overflow:visible}tr{break-inside:avoid}}
</style></head><body>
<button class="no-imprimir" onclick="window.print()">Imprimir / guardar como PDF</button>
<header><h1>${escaparHtml(t.titulo)}</h1><p class="sub">${escaparHtml(marca.nombre)} · ${escaparHtml(t.subtitulo)}</p><p class="sello">${escaparHtml(marca.sello)}</p></header>
${t.avisos.map((a) => `<p class="aviso">${escaparHtml(a)}</p>`).join('')}
<div class="scroll"><table><thead><tr>${cab}</tr></thead><tbody>${cuerpo}</tbody></table></div>
<footer>Generado el ${escaparHtml(fechaEs(generado))}. Documento de trabajo: no sustituye a la contabilidad legalizada ni al asesoramiento de tu gestor.</footer>
</body></html>`
}
