// → app/api/admin/prevision-semanal/route.ts
// Carga prevista por día de los próximos 7 días (desde agenda_dia). Scopeado por empresa_id.
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireEmpresaId } from '@/lib/tenant';

export async function GET(_req: NextRequest) {
  const e = await requireEmpresaId();
  if (!e) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const dias = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT session_date,
           COUNT(*)::int AS limpiezas,
           SUM(COALESCE(duracion_estimada_min, 120))::int AS minutos,
           COUNT(*) FILTER (WHERE limpiadora_id IS NULL)::int AS sin_asignar,
           COUNT(*) FILTER (WHERE hora_checkin_siguiente IS NOT NULL)::int AS con_entrada
    FROM agenda_dia
    WHERE empresa_id = ${e}::uuid
      AND session_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6
    GROUP BY session_date
    ORDER BY session_date`);

  const intensidad = (min: number) => (min > 600 ? 'fuerte' : min >= 240 ? 'normal' : 'flojo');

  return NextResponse.json({
    desde: 'CURRENT_DATE',
    dias: dias.map((d) => ({
      fecha: d.session_date instanceof Date ? d.session_date.toISOString().split('T')[0] : String(d.session_date).split('T')[0],
      limpiezas: d.limpiezas,
      horas_estimadas: Math.round((d.minutos / 60) * 10) / 10,
      sin_asignar: d.sin_asignar,
      con_entrada: d.con_entrada,
      intensidad: intensidad(d.minutos),
    })),
  });
}
