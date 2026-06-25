import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { renderInvoiceHtml } from '@central/core-receipts'
import type { ReceiptDoc } from '@central/core-receipts'
import { getBranding } from '@/lib/branding'

// Página imprimible de una factura para el propietario.
// Devuelve HTML con estilos de impresión → el dueño puede "Guardar como PDF".
// El HTML lo genera el renderer compartido `renderInvoiceHtml` de @central/core-receipts
// (paridad visual con la plantilla anterior; branding DEFAULT indigo).

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

  const doc: ReceiptDoc = {
    kind: 'factura-cliente',
    fiscal: {
      numero: f.numero_factura,
      fechaLocal: String(f.fecha_emision ?? ''),
      emisorNif: f.empresa_nif ?? '',
      emisorRazon: f.empresa_razon_social || f.empresa_nombre || '',
      destNif: f.dest_nif ?? undefined,
      destRazon: f.dest_razon_social || cliente.nombre || '',
      base: Number(base),
      iva: Number(ivaImp),
      total: Number(total),
    },
    lineas: lineas.map(l => ({
      descripcion: l.descripcion,
      cantidad: Number(l.cantidad || 0),
      // El importe de línea actual = COALESCE(importe, cantidad*precio); para reproducirlo
      // exactamente pasamos como precioUnitario el importe/cantidad (el renderer hace precio×cant).
      precioUnitario: Number(l.cantidad) ? Number(l.importe || 0) / Number(l.cantidad) : Number(l.precio_unitario || 0),
      detalle: l.propiedad_nombre || undefined,
    })),
    presentacion: {
      estado: f.estado,
      fechaEmision: f.fecha_emision,
      periodoDesde: f.periodo_desde,
      periodoHasta: f.periodo_hasta,
      vencimiento: f.fecha_vencimiento,
      concepto: f.concepto,
      emisorEmail: f.empresa_email,
      emisorTelefono: f.empresa_telefono,
      emisorIban: f.empresa_iban,
      emisorDireccion: f.empresa_direccion,
      destDireccion: f.dest_direccion,
      // Pie idéntico al actual: "Documento generado por ialimp para <cliente>."
      notaPie: `Documento generado por ialimp para ${cliente.nombre}.`,
    },
  }

  // Branding por empresa (white-label): cada empresa ve su marca en la factura.
  // getBranding lee empresas.marca_nombre/logo_url/color_* (defaults = ialimp indigo si no
  // configurado). Para Sique Brilla = su oro/negro; resto = indigo ialimp. Nunca lanza.
  const b = await getBranding(cliente.empresa_id)
  const branding = {
    nombre: b.nombre,
    logoUrl: b.logo_url ?? undefined,
    primario: b.primario,
    secundario: b.secundario,
    light: b.light,
    lang: 'es' as const,
  }

  const html = renderInvoiceHtml(doc, branding)
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}
