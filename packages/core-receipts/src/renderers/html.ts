import type { ReceiptDoc, Branding } from '../types.ts'
import { assertFiscalIntegrity, formatFiscalNumber } from '../integrity.ts'

export function escHtml(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Importe con formato es-ES (miles con punto, coma decimal, 2 decimales) + euro. Agrupa SIEMPRE
// (también 4 cifras: "2.000,12 €") para cumplir la regla del monorepo y cuadrar con formatFiscalNumber
// (que usa useGrouping:'always'); si no, es-ES no agrupa 1000-9999 y assertFiscalIntegrity fallaría.
export function eur(n: unknown): string {
  const v = Number(n || 0)
  return v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }) + ' €'
}

export function fdate(s: unknown): string {
  if (!s) return '—'
  const d = new Date(String(s))
  if (isNaN(d.getTime())) return String(s)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Renderiza la factura como HTML imprimible (el usuario "Guarda como PDF").
 * Branding se inyecta como CSS custom properties --brand-*.
 * Valida la integridad fiscal (fail-closed) antes de devolver.
 */
export function renderInvoiceHtml(doc: ReceiptDoc, branding: Branding): string {
  const f = doc.fiscal
  const p = doc.presentacion ?? {}

  const filas = doc.lineas.map(l => `
      <tr>
        <td>${escHtml(l.descripcion)}</td>
        <td class="c">${escHtml(l.detalle || '—')}</td>
        <td class="r">${Number(l.cantidad || 0).toLocaleString('es-ES')}</td>
        <td class="r">${eur(l.precioUnitario)}</td>
        <td class="r">${eur(l.precioUnitario * l.cantidad)}</td>
      </tr>`).join('')

  const ivaPct = f.base ? Math.round((f.iva / f.base) * 100) : 0

  const html = `<!doctype html>
<html lang="${escHtml(branding.lang || 'es')}"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Factura ${escHtml(f.numero)}</title>
<style>
  :root{ --brand-primary:${escHtml(branding.primario)}; --brand-light:${escHtml(branding.light)}; --ink:#1e1b4b; --muted:#64748b; --line:#e2e8f0; }
  *{ box-sizing:border-box; }
  body{ font-family:'Nunito',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:var(--ink);
        margin:0; background:#f1f5f9; padding:24px; }
  .sheet{ max-width:780px; margin:0 auto; background:#fff; border:1px solid var(--line); border-radius:14px;
          padding:36px 40px; }
  .top{ display:flex; justify-content:space-between; align-items:flex-start; gap:24px; margin-bottom:28px; }
  .badge{ display:inline-block; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.5px;
          padding:3px 10px; border-radius:999px; background:var(--brand-light); color:var(--brand-primary); }
  h1{ font-size:24px; margin:6px 0 0; }
  .muted{ color:var(--muted); font-size:13px; line-height:1.5; }
  .parties{ display:flex; gap:24px; margin-bottom:24px; }
  .parties > div{ flex:1; }
  .label{ font-size:10px; font-weight:700; text-transform:uppercase; color:var(--muted); letter-spacing:.5px; margin-bottom:4px; }
  .strong{ font-weight:700; }
  .meta{ display:flex; gap:24px; flex-wrap:wrap; margin-bottom:22px; font-size:13px; }
  .meta b{ display:block; font-size:10px; text-transform:uppercase; color:var(--muted); letter-spacing:.5px; font-weight:700; }
  table{ width:100%; border-collapse:collapse; font-size:13px; margin-bottom:18px; }
  th{ text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:.5px; color:var(--muted);
      border-bottom:2px solid var(--line); padding:8px 6px; }
  td{ padding:9px 6px; border-bottom:1px solid var(--line); }
  td.r,th.r{ text-align:right; } td.c,th.c{ text-align:center; }
  .totales{ margin-left:auto; width:280px; font-size:14px; }
  .totales .row{ display:flex; justify-content:space-between; padding:6px 0; }
  .totales .grand{ border-top:2px solid var(--ink); margin-top:6px; padding-top:10px; font-size:18px; font-weight:800; }
  .foot{ margin-top:28px; font-size:11px; color:var(--muted); line-height:1.5; }
  .btn{ display:inline-flex; align-items:center; gap:8px; background:var(--brand-primary); color:#fff; border:none;
        font-family:inherit; font-size:14px; font-weight:700; padding:12px 20px; border-radius:10px; cursor:pointer; }
  .bar{ max-width:780px; margin:0 auto 16px; display:flex; justify-content:flex-end; }
  @media print{ body{ background:#fff; padding:0; } .sheet{ border:none; border-radius:0; } .bar{ display:none; } }
</style></head>
<body>
  <div class="bar"><button class="btn" onclick="window.print()">⬇ Descargar / Imprimir PDF</button></div>
  <div class="sheet">
    <div class="top">
      <div>
        <span class="badge">Factura · ${escHtml((p.estado || '').toUpperCase())}</span>
        <h1>${escHtml(f.numero)}</h1>
      </div>
      <div class="muted" style="text-align:right">
        <div class="strong" style="color:var(--ink);font-size:15px">${escHtml(branding.nombre)}</div>
        ${p.emisorEmail ? `<div>${escHtml(p.emisorEmail)}</div>` : ''}
      </div>
    </div>

    <div class="parties">
      <div>
        <div class="label">Emisor</div>
        <div class="strong">${escHtml(f.emisorRazon)}</div>
        ${f.emisorNif ? `<div class="muted">NIF: ${escHtml(f.emisorNif)}</div>` : ''}
        ${p.emisorDireccion ? `<div class="muted">${escHtml(p.emisorDireccion)}</div>` : ''}
        ${p.emisorEmail ? `<div class="muted">${escHtml(p.emisorEmail)}</div>` : ''}
        ${p.emisorTelefono ? `<div class="muted">Tel: ${escHtml(p.emisorTelefono)}</div>` : ''}
        ${p.emisorIban ? `<div class="muted">IBAN: ${escHtml(p.emisorIban)}</div>` : ''}
      </div>
      <div>
        <div class="label">Cliente</div>
        <div class="strong">${escHtml(f.destRazon || '')}</div>
        ${f.destNif ? `<div class="muted">NIF: ${escHtml(f.destNif)}</div>` : ''}
        ${p.destDireccion ? `<div class="muted">${escHtml(p.destDireccion)}</div>` : ''}
      </div>
    </div>

    <div class="meta">
      <div><b>Fecha de emisión</b>${fdate(p.fechaEmision)}</div>
      <div><b>Periodo</b>${fdate(p.periodoDesde)} – ${fdate(p.periodoHasta)}</div>
      ${p.vencimiento ? `<div><b>Vencimiento</b>${fdate(p.vencimiento)}</div>` : ''}
      ${p.concepto ? `<div><b>Concepto</b>${escHtml(p.concepto)}</div>` : ''}
    </div>

    <table>
      <thead><tr>
        <th>Descripción</th><th class="c">Piso</th><th class="r">Cant.</th>
        <th class="r">Precio</th><th class="r">Importe</th>
      </tr></thead>
      <tbody>${filas || '<tr><td colspan="5" class="muted">Sin líneas</td></tr>'}</tbody>
    </table>

    <div class="totales">
      <div class="row"><span class="muted">Base imponible</span><span>${eur(f.base)}</span></div>
      <div class="row"><span class="muted">IVA (${Number(ivaPct).toLocaleString('es-ES')}%)</span><span>${eur(f.iva)}</span></div>
      <div class="row grand"><span>Total</span><span>${eur(f.total)}</span></div>
    </div>

    <div class="foot">${escHtml(p.notaPie || `Documento generado por ${branding.nombre}.`)}</div>
  </div>
</body></html>`

  // Integridad fiscal: número, NIF emisor y cifras (base/IVA/total) deben aparecer verbatim.
  assertFiscalIntegrity(f, html, doc.glosa)
  // Nota: assertFiscalIntegrity formatea cifras con formatFiscalNumber (coma, 2 dec) → coincide con eur() (sin el ' €').
  void formatFiscalNumber
  return html
}
