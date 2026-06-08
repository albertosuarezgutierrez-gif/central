// → app/api/admin/operaciones/route.ts
// Centro de operaciones (sin IA): lo que hay que atender hoy. Scopeado por empresa_id.
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireEmpresaId } from '@/lib/tenant';

// Serializa fechas de Postgres (que llegan como objetos Date) a string YYYY-MM-DD
function fser(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().split('T')[0];
  return String(v).split('T')[0];
}

export async function GET(_req: NextRequest) {
  const e = await requireEmpresaId();
  if (!e) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const sinAsignar = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, property_name, session_date, hora_checkout, hora_checkin_siguiente
    FROM agenda_dia
    WHERE empresa_id = ${e}::uuid AND limpiadora_id IS NULL
      AND session_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 1
    ORDER BY session_date, hora_checkout NULLS LAST`);

  const ventanaAjustada = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, property_name, session_date, ventana_minutos, limpiadora_nombre
    FROM agenda_dia
    WHERE empresa_id = ${e}::uuid AND alerta_ventana = true
      AND session_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 1
    ORDER BY ventana_minutos`);

  const cobrosVencidos = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT ref_id, importe, fecha_vencimiento
    FROM v_contab_tesoreria
    WHERE empresa_id = ${e}::uuid AND flujo = 'cobro' AND realizado = false
      AND fecha_vencimiento IS NOT NULL AND fecha_vencimiento < CURRENT_DATE
    ORDER BY fecha_vencimiento`);

  const gastosPorVencer = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT id, nombre, proveedor, importe, fecha_proximo_cargo, dias_para_vencer
    FROM gastos_por_vencer
    WHERE empresa_id = ${e}::uuid AND activo = true AND es_ingreso = false
      AND dias_para_vencer IS NOT NULL AND dias_para_vencer BETWEEN 0 AND COALESCE(alerta_dias, 7)
    ORDER BY dias_para_vencer`);

  const ausenciasHoy = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT l.nombre, a.motivo, a.fecha_fin
    FROM limpiadora_ausencias a
    JOIN limpiadoras l ON l.id = a.limpiadora_id
    WHERE l.empresa_id = ${e}::uuid AND a.aprobada = true
      AND CURRENT_DATE BETWEEN a.fecha_inicio AND a.fecha_fin`);

  const stock = await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
    SELECT COUNT(*)::int AS n
    FROM inventario_alertas ia
    JOIN limpiadoras l ON l.id = ia.limpiadora_id
    WHERE l.empresa_id = ${e}::uuid AND ia.resuelta = false`);

  const alertas = await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
    SELECT COUNT(*)::int AS n FROM alertas WHERE empresa_id = ${e}::uuid AND leida = false`);

  return NextResponse.json({
    sin_asignar: {
      total: sinAsignar.length,
      items: sinAsignar.map((x: any) => ({ ...x, session_date: fser(x.session_date) })),
    },
    ventana_ajustada: {
      total: ventanaAjustada.length,
      items: ventanaAjustada.map((x: any) => ({ ...x, session_date: fser(x.session_date) })),
    },
    cobros_vencidos: {
      total: cobrosVencidos.length,
      importe: cobrosVencidos.reduce((a, r) => a + (Number(r.importe) || 0), 0),
      items: cobrosVencidos.map((x: any) => ({ ...x, fecha_vencimiento: fser(x.fecha_vencimiento) })),
    },
    gastos_por_vencer: {
      total: gastosPorVencer.length,
      items: gastosPorVencer.map((x: any) => ({ ...x, fecha_proximo_cargo: fser(x.fecha_proximo_cargo) })),
    },
    ausencias_hoy: {
      total: ausenciasHoy.length,
      items: ausenciasHoy.map((x: any) => ({ ...x, fecha_fin: fser(x.fecha_fin) })),
    },
    stock_alertas: stock[0]?.n || 0,
    alertas_sin_leer: alertas[0]?.n || 0,
  });
}
