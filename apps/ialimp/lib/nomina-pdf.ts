// Genera la nómina (recibo de pago) de una limpiadora en PDF a partir de `partes_trabajo`,
// la guarda en su expediente (carpeta `nominas`, bucket privado) y lanza la solicitud de firma.
// Reusa la agregación de partes (misma fuente que /api/admin/nomina) y la firma de @central/module-rrhh.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { subirDocumento } from '@/lib/expediente-limpiadora'
import { solicitarFirma } from '@/lib/firma-limpiadora'
import { ACTOR_GESTOR } from '@/lib/carpetas-limpiadora'

const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} EUR`
const fechaCorta = (iso: string) => iso.split('-').reverse().join('/')

type Parte = { fecha: string; concepto: string; tiempo_min: number; cantidad: number; importe: number }

/** Construye los bytes del PDF de la nómina (puro: no toca BD ni Storage). */
async function construirPdf(opts: {
  empresa: string; limpiadora: string; dni: string | null
  desde: string; hasta: string; partes: Parte[]
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595.28, 841.89]) // A4
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.12, 0.11, 0.29)
  const muted = rgb(0.39, 0.45, 0.55)
  const line = rgb(0.89, 0.91, 0.94)
  const M = 48
  let y = 793

  const text = (s: string, x: number, yy: number, size = 10, f = font, color = ink) =>
    page.drawText(s, { x, y: yy, size, font: f, color })

  // Cabecera
  text(opts.empresa, M, y, 18, bold)
  text('RECIBO DE NÓMINA', 595.28 - M - bold.widthOfTextAtSize('RECIBO DE NÓMINA', 11), y + 3, 11, bold, muted)
  y -= 26
  text(`Periodo: ${fechaCorta(opts.desde)} — ${fechaCorta(opts.hasta)}`, M, y, 10, font, muted)
  y -= 24
  text('Trabajadora', M, y, 9, bold, muted); y -= 14
  text(opts.limpiadora, M, y, 12, bold)
  if (opts.dni) text(`DNI/NIE: ${opts.dni}`, 595.28 - M - 140, y, 10, font, muted)
  y -= 22
  page.drawLine({ start: { x: M, y }, end: { x: 595.28 - M, y }, thickness: 1, color: line })
  y -= 22

  // Cabecera de tabla
  const cFecha = M, cConcepto = M + 70, cCant = 360, cTiempo = 415, cImporte = 595.28 - M
  text('FECHA', cFecha, y, 8, bold, muted)
  text('CONCEPTO', cConcepto, y, 8, bold, muted)
  text('CANT.', cCant, y, 8, bold, muted)
  text('MIN.', cTiempo, y, 8, bold, muted)
  const hImp = 'IMPORTE'
  text(hImp, cImporte - bold.widthOfTextAtSize(hImp, 8), y, 8, bold, muted)
  y -= 8
  page.drawLine({ start: { x: M, y }, end: { x: 595.28 - M, y }, thickness: 0.7, color: line })
  y -= 16

  let totalImporte = 0, totalMin = 0
  for (const p of opts.partes) {
    const imp = Number(p.importe) * Number(p.cantidad)
    totalImporte += imp; totalMin += Number(p.tiempo_min || 0) * Number(p.cantidad)
    const concepto = p.concepto.length > 42 ? p.concepto.slice(0, 41) + '…' : p.concepto
    text(fechaCorta(p.fecha), cFecha, y, 9)
    text(concepto, cConcepto, y, 9)
    text(String(p.cantidad), cCant, y, 9)
    text(String(p.tiempo_min ?? ''), cTiempo, y, 9)
    const s = eur(imp)
    text(s, cImporte - font.widthOfTextAtSize(s, 9), y, 9)
    y -= 16
    if (y < 90) { y = 793; doc.addPage([595.28, 841.89]) } // salto simple si se llena
  }

  y -= 6
  page.drawLine({ start: { x: M, y }, end: { x: 595.28 - M, y }, thickness: 1, color: line })
  y -= 22
  text(`Total tiempo: ${Math.round(totalMin)} min`, M, y, 10, font, muted)
  const totLbl = 'TOTAL A PERCIBIR'
  const totVal = eur(totalImporte)
  text(totLbl, cImporte - bold.widthOfTextAtSize(`${totLbl}   ${totVal}`, 11), y, 11, bold)
  text(totVal, cImporte - bold.widthOfTextAtSize(totVal, 11), y - 18, 13, bold)
  y -= 56
  text('Documento generado electrónicamente. Conforme con la firma avanzada (Reglamento eIDAS, art. 26)',
    M, 56, 8, font, muted)
  text('que la trabajadora aplica al recibirlo en su portal.', M, 46, 8, font, muted)

  return doc.save()
}

/**
 * Genera la nómina de la limpiadora en el rango [desde, hasta], la guarda en su expediente
 * (carpeta `nominas`) y deja el documento en estado 'pendiente' de firma. Scope por empresa.
 */
export async function generarNominaLimpiadora(
  empresaId: string, limpiadoraId: string, desde: string, hasta: string
): Promise<{ id: string; nombre: string }> {
  const limp = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT l.nombre, l.dni, COALESCE(NULLIF(e.marca_nombre, ''), 'IALIMP') AS empresa
    FROM limpiadoras l LEFT JOIN empresas e ON e.id = l.empresa_id
    WHERE l.id = ${limpiadoraId}::uuid AND l.empresa_id = ${empresaId}::uuid LIMIT 1`)
  if (!limp[0]) throw new Error('Limpiadora no encontrada')

  const partes = await prisma.$queryRaw<Parte[]>(Prisma.sql`
    SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, concepto,
           tiempo_min, cantidad, importe
    FROM partes_trabajo
    WHERE empresa_id = ${empresaId}::uuid AND limpiadora_id = ${limpiadoraId}::uuid
      AND fecha BETWEEN ${desde}::date AND ${hasta}::date
    ORDER BY fecha, concepto`)
  if (partes.length === 0) throw new Error('No hay partes de trabajo en ese periodo')

  const bytes = await construirPdf({
    empresa: limp[0].empresa, limpiadora: limp[0].nombre, dni: limp[0].dni,
    desde, hasta, partes: partes.map(p => ({ ...p, tiempo_min: Number(p.tiempo_min), cantidad: Number(p.cantidad), importe: Number(p.importe) })),
  })

  const nombre = `Nomina_${desde}_${hasta}.pdf`
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const docu = await subirDocumento(empresaId, limpiadoraId, ACTOR_GESTOR, {
    carpeta: 'nominas', nombre, tipo: 'application/pdf', tamano: bytes.byteLength, bytes: buf,
  })
  await solicitarFirma(empresaId, limpiadoraId, docu.id) // estado → 'pendiente'
  return docu
}
