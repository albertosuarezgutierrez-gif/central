// Factura imprimible (HTML que el navegador «Guarda como PDF»), con el QR tributario y la leyenda VeriFactu. PURO.
// Usa `@central/core-receipts` para escapar y para la COMPROBACIÓN FISCAL fail-closed: número, NIF del emisor, base, cuota, total
// y huella deben aparecer tal cual en la salida; si no, lanza y no se sirve. Lo pinta la ruta /facturas/[id]/imprimir.
import { assertFiscalIntegrity, escHtml } from '@central/core-receipts'
import { LEYENDA_VERIFACTU } from '@central/core-fiscal'
import { formatearEur, type GrupoIva } from '@central/module-taller'

export interface FacturaImprimible {
  numSerie: string
  tipo: string
  fechaExpedicion: string // AAAA-MM-DD
  emisor: { razon: string; nif: string; domicilio: string | null; nombreComercial: string | null }
  cliente: { nombre: string | null; nif: string | null; domicilio: string | null }
  rectifica: { numSerie: string; modo: string | null; motivo: string | null } | null
  lineas: { descripcion: string; cantidad: number; unidad: string; baseCent: number; ivaPuntosBasicos: number }[]
  desglose: GrupoIva[]
  baseCent: number
  cuotaIvaCent: number
  totalCent: number
  huella: string
  qrUrl: string
  /** PNG del QR en data URL (lo genera la ruta con `qrcode`). */
  qrDataUrl: string
  verifactu: boolean
  estado: string
  estadoEnvio: string
  pie: string
  cobros: { fecha: string; medio: string; importeCent: number }[]
}

const titulo = (t: string) =>
  t === 'F2' ? 'Factura simplificada' : t.startsWith('R') ? `Factura rectificativa (${t})` : 'Factura'
const fechaEs = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const pct = (pb: number) => `${(pb / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 })} %`
const cantidad = (c: number, u: string) => (u === 'ml' ? `${(c / 1000).toLocaleString('es-ES')} l` : u === 'min' ? `${c} min` : String(c))

export function renderFacturaHtml(f: FacturaImprimible): string {
  const e = escHtml
  const filas = f.lineas.map((l) => `<tr><td>${e(l.descripcion)}</td><td class="r">${e(cantidad(l.cantidad, l.unidad))}</td>` +
    `<td class="r">${e(pct(l.ivaPuntosBasicos))}</td><td class="r">${e(formatearEur(l.baseCent))}</td></tr>`).join('')
  const desglose = f.desglose.map((g) => `<tr><td>IVA ${e(pct(g.ivaPuntosBasicos))}</td><td class="r">${e(formatearEur(g.baseCent))}</td>` +
    `<td class="r">${e(formatearEur(g.cuotaCent))}</td></tr>`).join('')
  const avisos = [
    f.estado === 'anulada' ? '<p class="alerta">FACTURA ANULADA</p>' : '',
    f.estadoEnvio !== 'enviado' ? `<p class="alerta">Registro VeriFactu NO remitido a la AEAT (${e(f.estadoEnvio.replace('_', ' '))}).</p>` : '',
  ].join('')
  const cobros = f.cobros.length
    ? `<h2>Cobros</h2><table><tbody>${f.cobros.map((c) => `<tr><td>${e(fechaEs(c.fecha))}</td><td>${e(c.medio)}</td><td class="r">${e(formatearEur(c.importeCent))}</td></tr>`).join('')}</tbody></table>`
    : ''
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${e(titulo(f.tipo))} ${e(f.numSerie)}</title>
<style>
  *{box-sizing:border-box} body{font-family:'Nunito Sans',system-ui,sans-serif;color:#111;margin:0;background:#f4f4f5;padding:16px}
  .hoja{max-width:800px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:24px}
  h1{font-family:Quicksand,system-ui,sans-serif;font-size:22px;margin:0 0 4px} h2{font-size:15px;margin:20px 0 6px}
  .partes{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;margin:16px 0}
  @media (max-width:560px){.partes{grid-template-columns:minmax(0,1fr)}}
  .et{font-size:11px;text-transform:uppercase;color:#52525b;font-weight:700} .tenue{color:#52525b;font-size:13px}
  .tabla{overflow-x:auto} table{width:100%;border-collapse:collapse;font-size:14px} td,th{padding:6px 4px;border-bottom:1px solid #e4e4e7;text-align:left}
  .r{text-align:right;white-space:nowrap} .total td{font-weight:800;font-size:17px;border-top:2px solid #111}
  .vf{display:flex;gap:12px;align-items:center;margin-top:20px;flex-wrap:wrap} .vf img{width:132px;height:132px}
  .alerta{background:#fef2f2;color:#991b1b;padding:8px 12px;border-radius:8px;font-weight:700}
  .huella{font-family:ui-monospace,monospace;font-size:10px;word-break:break-all;color:#52525b}
  .barra{max-width:800px;margin:0 auto 12px;display:flex;justify-content:flex-end}
  .btn{min-height:44px;padding:10px 18px;border-radius:10px;border:0;background:#111;color:#fff;font-weight:700;cursor:pointer}
  @media print{body{background:#fff;padding:0}.hoja{border:0}.barra{display:none}}
</style></head><body>
<div class="barra"><button class="btn" onclick="window.print()">Imprimir / Guardar PDF</button></div>
<div class="hoja">
  ${avisos}
  <h1>${e(titulo(f.tipo))} ${e(f.numSerie)}</h1>
  <p class="tenue">Fecha de expedición: ${e(fechaEs(f.fechaExpedicion))}</p>
  ${f.rectifica ? `<p class="tenue">Rectifica la factura ${e(f.rectifica.numSerie)}${f.rectifica.modo === 'I' ? ' (por diferencias)' : f.rectifica.modo === 'S' ? ' (por sustitución)' : ''}${f.rectifica.motivo ? `: ${e(f.rectifica.motivo)}` : ''}</p>` : ''}
  <div class="partes">
    <div><div class="et">Emisor</div><strong>${e(f.emisor.razon)}</strong>${f.emisor.nombreComercial && f.emisor.nombreComercial !== f.emisor.razon ? `<div class="tenue">${e(f.emisor.nombreComercial)}</div>` : ''}
      <div>NIF ${e(f.emisor.nif)}</div>${f.emisor.domicilio ? `<div class="tenue">${e(f.emisor.domicilio)}</div>` : ''}</div>
    <div><div class="et">Cliente</div>${f.cliente.nif
      ? `<strong>${e(f.cliente.nombre ?? '')}</strong><div>NIF ${e(f.cliente.nif)}</div>${f.cliente.domicilio ? `<div class="tenue">${e(f.cliente.domicilio)}</div>` : ''}`
      : `<span class="tenue">${f.cliente.nombre ? e(f.cliente.nombre) : 'Cliente no identificado (factura simplificada)'}</span>`}</div>
  </div>
  <div class="tabla"><table><thead><tr><th>Concepto</th><th class="r">Cant.</th><th class="r">IVA</th><th class="r">Base</th></tr></thead><tbody>${filas}</tbody></table></div>
  <h2>Desglose</h2>
  <div class="tabla"><table><thead><tr><th>Tipo</th><th class="r">Base imponible</th><th class="r">Cuota</th></tr></thead><tbody>${desglose}
    <tr><td>Total base</td><td class="r">${e(formatearEur(f.baseCent))}</td><td class="r">${e(formatearEur(f.cuotaIvaCent))}</td></tr>
    <tr class="total"><td>Total factura</td><td></td><td class="r">${e(formatearEur(f.totalCent))}</td></tr></tbody></table></div>
  ${cobros}
  <div class="vf"><img src="${e(f.qrDataUrl)}" alt="Código QR tributario"/><div>
    ${f.verifactu ? `<strong>VERI*FACTU</strong><div>${e(LEYENDA_VERIFACTU)}</div>` : ''}
    <div class="huella">Huella ${e(f.huella)}</div></div></div>
  ${f.pie ? `<p class="tenue">${e(f.pie)}</p>` : ''}
</div></body></html>`
  assertFiscalIntegrity({
    numero: f.numSerie, fechaLocal: f.fechaExpedicion, emisorNif: f.emisor.nif, emisorRazon: f.emisor.razon,
    base: f.baseCent / 100, iva: f.cuotaIvaCent / 100, total: f.totalCent / 100, huella: f.huella,
  }, html)
  return html
}
