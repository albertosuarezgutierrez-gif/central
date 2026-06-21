import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// Página imprimible de una factura para el propietario.
// Devuelve HTML con estilos de impresión → el dueño puede "Guardar como PDF".

function esc(v: any): string {
  if (v === null || v === undefined) return ''
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
function eur(n: any): string {
  const v = Number(n || 0)
  return v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}
function fdate(s: any): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return String(s)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string, id: string }> }) {
  const { token, id } = await params

  // Validar token → cliente (dueño)
  const cli = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT c.id::text, c.empresa_id::text, c.nombre
    FROM clientes c WHERE c.access_token = ${token} LIMIT 1
  `)
  if (!cli.length) return new Response('No autorizado', { status: 401 })
  const cliente = cli[0]

  // Factura (debe ser del cliente y no estar en borrador)
  const fac = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT f.numero_factura, f.periodo_desde::text, f.periodo_hasta::text,
           f.fecha_emision::text, f.fecha_vencimiento::text, f.estado, f.concepto,
           f.base_imponible::float, f.iva_porcentaje::float,
           f.iva_importe::float, f.total::float,
           f.dest_razon_social, f.dest_nif, f.dest_direccion,
           e.nombre AS empresa_nombre, e.email AS empresa_email,
           e.razon_social AS empresa_razon_social, e.nif AS empresa_nif,
           e.direccion_fiscal AS empresa_direccion, e.iban AS empresa_iban,
           e.telefono AS empresa_telefono
    FROM facturas_clientes f
    JOIN empresas e ON e.id = f.empresa_id
    WHERE f.id = ${id}::uuid
      AND f.cliente_id = ${cliente.id}::uuid
      AND f.estado <> 'borrador'
    LIMIT 1
  `)
  if (!fac.length) return new Response('Factura no encontrada', { status: 404 })
  const f = fac[0]

  const lineas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT fl.descripcion, fl.cantidad::float, fl.precio_unitario::float,
           COALESCE(fl.importe, fl.cantidad * fl.precio_unitario)::float AS importe,
           p.nombre AS propiedad_nombre
    FROM factura_clientes_lineas fl
    LEFT JOIN propiedades p ON p.id = fl.propiedad_id
    WHERE fl.factura_id = ${id}::uuid
    ORDER BY fl.orden ASC, fl.id ASC
  `)

  const base = f.base_imponible ?? lineas.reduce((a, l) => a + Number(l.importe || 0), 0)
  const ivaPct = f.iva_porcentaje ?? 21
  const ivaImp = f.iva_importe ?? Math.round(base * ivaPct) / 100
  const total = f.total ?? Math.round((base + ivaImp) * 100) / 100

  const filas = lineas.map(l => `
      <tr>
        <td>${esc(l.descripcion)}</td>
        <td class="c">${esc(l.propiedad_nombre || '—')}</td>
        <td class="r">${Number(l.cantidad || 0).toLocaleString('es-ES')}</td>
        <td class="r">${eur(l.precio_unitario)}</td>
        <td class="r">${eur(l.importe)}</td>
      </tr>`).join('')

  const html = `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Factura ${esc(f.numero_factura)}</title>
<style>
  :root{ --indigo:#4f46e5; --ink:#1e1b4b; --muted:#64748b; --line:#e2e8f0; }
  *{ box-sizing:border-box; }
  body{ font-family:'Nunito',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:var(--ink);
        margin:0; background:#f1f5f9; padding:24px; }
  .sheet{ max-width:780px; margin:0 auto; background:#fff; border:1px solid var(--line); border-radius:14px;
          padding:36px 40px; }
  .top{ display:flex; justify-content:space-between; align-items:flex-start; gap:24px; margin-bottom:28px; }
  .badge{ display:inline-block; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.5px;
          padding:3px 10px; border-radius:999px; background:#eef2ff; color:var(--indigo); }
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
  .btn{ display:inline-flex; align-items:center; gap:8px; background:var(--indigo); color:#fff; border:none;
        font-family:inherit; font-size:14px; font-weight:700; padding:12px 20px; border-radius:10px; cursor:pointer; }
  .bar{ max-width:780px; margin:0 auto 16px; display:flex; justify-content:flex-end; }
  @media print{ body{ background:#fff; padding:0; } .sheet{ border:none; border-radius:0; } .bar{ display:none; } }
</style></head>
<body>
  <div class="bar"><button class="btn" onclick="window.print()">⬇ Descargar / Imprimir PDF</button></div>
  <div class="sheet">
    <div class="top">
      <div>
        <span class="badge">Factura · ${esc((f.estado||'').toUpperCase())}</span>
        <h1>${esc(f.numero_factura)}</h1>
      </div>
      <div class="muted" style="text-align:right">
        <div class="strong" style="color:var(--ink);font-size:15px">${esc(f.empresa_nombre)}</div>
        ${f.empresa_email ? `<div>${esc(f.empresa_email)}</div>` : ''}
      </div>
    </div>

    <div class="parties">
      <div>
        <div class="label">Emisor</div>
        <div class="strong">${esc(f.empresa_razon_social || f.empresa_nombre)}</div>
        ${f.empresa_nif ? `<div class="muted">NIF: ${esc(f.empresa_nif)}</div>` : ''}
        ${f.empresa_direccion ? `<div class="muted">${esc(f.empresa_direccion)}</div>` : ''}
        ${f.empresa_email ? `<div class="muted">${esc(f.empresa_email)}</div>` : ''}
        ${f.empresa_telefono ? `<div class="muted">Tel: ${esc(f.empresa_telefono)}</div>` : ''}
        ${f.empresa_iban ? `<div class="muted">IBAN: ${esc(f.empresa_iban)}</div>` : ''}
      </div>
      <div>
        <div class="label">Cliente</div>
        <div class="strong">${esc(f.dest_razon_social || cliente.nombre)}</div>
        ${f.dest_nif ? `<div class="muted">NIF: ${esc(f.dest_nif)}</div>` : ''}
        ${f.dest_direccion ? `<div class="muted">${esc(f.dest_direccion)}</div>` : ''}
      </div>
    </div>

    <div class="meta">
      <div><b>Fecha de emisión</b>${fdate(f.fecha_emision)}</div>
      <div><b>Periodo</b>${fdate(f.periodo_desde)} – ${fdate(f.periodo_hasta)}</div>
      ${f.fecha_vencimiento ? `<div><b>Vencimiento</b>${fdate(f.fecha_vencimiento)}</div>` : ''}
      ${f.concepto ? `<div><b>Concepto</b>${esc(f.concepto)}</div>` : ''}
    </div>

    <table>
      <thead><tr>
        <th>Descripción</th><th class="c">Piso</th><th class="r">Cant.</th>
        <th class="r">Precio</th><th class="r">Importe</th>
      </tr></thead>
      <tbody>${filas || '<tr><td colspan="5" class="muted">Sin líneas</td></tr>'}</tbody>
    </table>

    <div class="totales">
      <div class="row"><span class="muted">Base imponible</span><span>${eur(base)}</span></div>
      <div class="row"><span class="muted">IVA (${Number(ivaPct).toLocaleString('es-ES')}%)</span><span>${eur(ivaImp)}</span></div>
      <div class="row grand"><span>Total</span><span>${eur(total)}</span></div>
    </div>

    <div class="foot">Documento generado por ialimp para ${esc(cliente.nombre)}.</div>
  </div>
</body></html>`

  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}
