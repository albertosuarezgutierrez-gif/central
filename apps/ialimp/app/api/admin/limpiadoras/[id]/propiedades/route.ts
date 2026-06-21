// → app/api/admin/limpiadoras/[id]/propiedades/route.ts
// GET: pisos de la empresa + cuáles conoce esta limpiadora.
// PUT: guarda el listado de pisos que conoce (array de IDs) en limpiadoras.propiedades.
// Scopeado por empresa_id: la limpiadora y los pisos deben ser de la empresa en sesión.
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireEmpresaId } from '@/lib/tenant';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const e = await requireEmpresaId();
  if (!e) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { id } = await params;

  const limp = await prisma.$queryRaw<{ nombre: string; propiedades: string[] }[]>(Prisma.sql`
    SELECT nombre, COALESCE(propiedades,'{}') AS propiedades
    FROM limpiadoras WHERE id=${id}::uuid AND empresa_id=${e}::uuid LIMIT 1`);
  if (!limp.length) return NextResponse.json({ error: 'Limpiadora no encontrada' }, { status: 404 });

  const pisos = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, nombre, direccion FROM propiedades
    WHERE empresa_id=${e}::uuid ORDER BY nombre`);

  return NextResponse.json({
    nombre: limp[0].nombre,
    conoce: (limp[0].propiedades || []).map(String),
    pisos,
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const e = await requireEmpresaId();
  if (!e) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { id } = await params;
  const { propiedades } = await req.json();
  if (!Array.isArray(propiedades)) return NextResponse.json({ error: 'propiedades debe ser un array' }, { status: 400 });

  // Filtra a SOLO pisos que existen y son de la empresa (evita meter ids ajenos)
  const validos = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM propiedades WHERE empresa_id=${e}::uuid AND id = ANY(${propiedades}::uuid[])`);
  const ids = validos.map((v) => v.id);

  const upd = await prisma.$executeRaw(Prisma.sql`
    UPDATE limpiadoras SET propiedades=${ids}::text[]
    WHERE id=${id}::uuid AND empresa_id=${e}::uuid`);
  if (upd === 0) return NextResponse.json({ error: 'Limpiadora no encontrada' }, { status: 404 });

  return NextResponse.json({ ok: true, guardados: ids.length });
}
