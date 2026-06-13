import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { fingerprint } from '@/lib/agente-facturas/fingerprint';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year       = searchParams.get('year');
    const month      = searchParams.get('month');
    const propertyId = searchParams.get('propertyId');
    const category   = searchParams.get('category');

    // Excluye los gastos en bandeja (revisado=false). Los legacy (revisado NULL) sí cuentan.
    const conditions: Prisma.Sql[] = [Prisma.sql`(revisado IS DISTINCT FROM false)`]
    if (year)       conditions.push(Prisma.sql`EXTRACT(YEAR  FROM fecha) = ${parseInt(year)}`)
    if (month)      conditions.push(Prisma.sql`EXTRACT(MONTH FROM fecha) = ${parseInt(month)}`)
    if (propertyId) conditions.push(Prisma.sql`propiedad = ${propertyId}`)
    if (category)   conditions.push(Prisma.sql`categoria = ${category}`)
    const where = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`

    const gastos = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, fecha, proveedor, concepto, categoria, propiedad,
        base_imponible, iva, iva_porcentaje, irpf, irpf_porcentaje, total, notas,
        drive_url, carpeta_drive, drive_file_name, numero_factura, created_at
      FROM gastos
      ${where}
      ORDER BY fecha DESC, created_at DESC
      LIMIT 500
    `)
    const total = gastos.reduce((sum: number, g: any) => sum + parseFloat(g.total || 0), 0);
    return NextResponse.json({ gastos, total });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file           = formData.get('file') as File | null;
    const fecha          = formData.get('fecha') as string;
    const proveedor      = formData.get('proveedor') as string || '';
    const concepto       = formData.get('concepto') as string || '';
    const total          = parseFloat(formData.get('total') as string || '0');
    const categoria      = formData.get('categoria') as string || 'OTRO';
    const propiedad      = formData.get('propiedad') as string || '';
    const notas          = formData.get('notas') as string || '';
    const base_imponible = formData.get('base_imponible') ? parseFloat(formData.get('base_imponible') as string) : null;
    const iva            = formData.get('iva')            ? parseFloat(formData.get('iva')            as string) : null;
    const iva_porcentaje = formData.get('iva_porcentaje') ? parseFloat(formData.get('iva_porcentaje') as string) : null;
    const irpf           = formData.get('irpf')           ? parseFloat(formData.get('irpf')           as string) : null;
    const irpf_porcentaje = formData.get('irpf_porcentaje') ? parseFloat(formData.get('irpf_porcentaje') as string) : null;
    const numero_factura = (formData.get('numero_factura') as string) || null;
    const nif_proveedor  = (formData.get('nif_proveedor')  as string) || null;
    const fp = fingerprint({ nif_proveedor, proveedor, concepto });

    if (!fecha || !total) return NextResponse.json({ error: 'Fecha y total obligatorios' }, { status: 400 });

    let driveFileId: string | null = null;
    let driveUrl:    string | null = null;
    let carpetaDrive: string | null = null;
    let driveFileName: string | null = null;

    const DRIVE_SCRIPT_URL = process.env.DRIVE_SCRIPT_URL ||
      'https://script.google.com/macros/s/AKfycbwYMhD_7MpiytpoM3fYVW5dRlCUiQgMeTYLvI-5WGfcL-OAdXZEsa3UD7KdZa1PpQ/exec';

    if (file && file.size > 0 && DRIVE_SCRIPT_URL) {
      try {
        const bytes = await file.arrayBuffer();
        const b64   = Buffer.from(bytes).toString('base64');
        const driveRes = await fetch(DRIVE_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, mimeType: file.type, base64Data: b64, folder: propiedad || 'gastos' }),
        });
        if (driveRes.ok) {
          const driveData = await driveRes.json();
          driveFileId  = driveData.fileId  || null;
          driveUrl     = driveData.fileUrl || null;
          carpetaDrive = driveData.folder  || null;
          driveFileName = file.name;
        }
      } catch { /* Drive upload failed silently */ }
    }

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO gastos
        (fecha, proveedor, concepto, categoria, propiedad,
         base_imponible, iva, iva_porcentaje, irpf, irpf_porcentaje, total, notas,
         drive_url, carpeta_drive, drive_file_name, numero_factura, nif_proveedor,
         fingerprint, origen, revisado)
      VALUES
        (${fecha}::date, ${proveedor}, ${concepto}, ${categoria}, ${propiedad},
         ${base_imponible}, ${iva}, ${iva_porcentaje}, ${irpf}, ${irpf_porcentaje}, ${total}, ${notas},
         ${driveUrl}, ${carpetaDrive}, ${driveFileName}, ${numero_factura}, ${nif_proveedor},
         ${fp}, 'manual', true)
    `)
    return NextResponse.json({ success: true, ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
    await prisma.$executeRaw(Prisma.sql`DELETE FROM gastos WHERE id = ${id}`)
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
