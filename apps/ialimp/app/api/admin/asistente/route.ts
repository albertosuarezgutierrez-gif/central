// → app/api/admin/asistente/route.ts
// Chat de Vanessa sobre los datos de SU empresa. SEGURO por diseño:
//  - empresa_id SIEMPRE del lado servidor (requireEmpresaId), nunca del input.
//  - La IA NO escribe SQL: solo elige una "intención" de una lista fija y extrae parámetros.
//  - Cada intención = una consulta pre-escrita y scopeada por empresa_id.
//  - La IA redacta la respuesta SOLO con los datos que devuelve la consulta (no inventa).
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireEmpresaId } from '@/lib/tenant';
import { aiComplete } from '@/lib/ai-client';

type Intent =
  | 'quien_trabaja' | 'carga_semana' | 'sin_asignar'
  | 'agenda_dia' | 'facturas_cobrar' | 'agenda_limpiadora' | 'desconocido';

async function runIntent(intent: Intent, params: any, e: string) {
  switch (intent) {
    case 'quien_trabaja': {
      const fecha = params.fecha || null;
      return prisma.$queryRaw(Prisma.sql`
        SELECT l.nombre,
               CASE WHEN a.id IS NOT NULL THEN 'ausente' ELSE 'trabaja' END AS estado,
               d.turno
        FROM limpiadoras l
        JOIN limpiadora_disponibilidad d ON d.limpiadora_id=l.id AND d.activo=true
          AND d.dia_semana = EXTRACT(ISODOW FROM COALESCE(${fecha}::date, CURRENT_DATE))
        LEFT JOIN limpiadora_ausencias a ON a.limpiadora_id=l.id AND a.aprobada=true
          AND COALESCE(${fecha}::date, CURRENT_DATE) BETWEEN a.fecha_inicio AND a.fecha_fin
        WHERE l.empresa_id=${e}::uuid AND l.activa=true
        ORDER BY estado, l.nombre`);
    }
    case 'carga_semana':
      return prisma.$queryRaw(Prisma.sql`
        SELECT limpiadora_nombre,
               SUM(num_limpiezas)::int AS limpiezas,
               ROUND(SUM(minutos_estimados)/60.0,1) AS horas
        FROM carga_limpiadora
        WHERE empresa_id=${e}::uuid AND session_date BETWEEN CURRENT_DATE AND CURRENT_DATE+6
        GROUP BY limpiadora_nombre ORDER BY horas DESC`);
    case 'sin_asignar':
      return prisma.$queryRaw(Prisma.sql`
        SELECT property_name, session_date, hora_checkout
        FROM agenda_dia
        WHERE empresa_id=${e}::uuid AND limpiadora_id IS NULL
          AND session_date BETWEEN CURRENT_DATE AND CURRENT_DATE+1
        ORDER BY session_date, hora_checkout NULLS LAST`);
    case 'agenda_dia': {
      const fecha = params.fecha || null;
      return prisma.$queryRaw(Prisma.sql`
        SELECT property_name, hora_checkout, limpiadora_nombre
        FROM agenda_dia
        WHERE empresa_id=${e}::uuid
          AND session_date = COALESCE(${fecha}::date, CURRENT_DATE)
        ORDER BY hora_checkout NULLS LAST`);
    }
    case 'facturas_cobrar':
      return prisma.$queryRaw(Prisma.sql`
        SELECT ref_id, importe, fecha_vencimiento,
               (fecha_vencimiento < CURRENT_DATE) AS vencida
        FROM v_contab_tesoreria
        WHERE empresa_id=${e}::uuid AND flujo='cobro' AND realizado=false
        ORDER BY fecha_vencimiento NULLS LAST`);
    case 'agenda_limpiadora': {
      const nombre = String(params.nombre || '');
      return prisma.$queryRaw(Prisma.sql`
        SELECT property_name, session_date, hora_checkout
        FROM agenda_dia
        WHERE empresa_id=${e}::uuid
          AND limpiadora_nombre ILIKE ${'%' + nombre + '%'}
          AND session_date BETWEEN CURRENT_DATE AND CURRENT_DATE+6
        ORDER BY session_date, hora_checkout NULLS LAST`);
    }
    default:
      return [];
  }
}

const CLASIFICADOR = `Eres un clasificador. Dada la pregunta del usuario sobre la gestión de limpiezas, responde SOLO con un JSON (sin texto extra) así:
{"intent":"<una de: quien_trabaja|carga_semana|sin_asignar|agenda_dia|facturas_cobrar|agenda_limpiadora|desconocido>","params":{"fecha":"yyyy-mm-dd o null","nombre":"nombre de limpiadora o null"}}
Reglas: si piden quién trabaja/libra -> quien_trabaja. Carga/horas de la semana -> carga_semana. Limpiezas sin asignar -> sin_asignar. Qué hay un día concreto -> agenda_dia. Cobros/facturas pendientes -> facturas_cobrar. Agenda de una persona por su nombre -> agenda_limpiadora. Si no encaja -> desconocido. Interpreta "hoy", "mañana", "el lunes" como fecha ISO si puedes; si no, null.`;

export async function POST(req: NextRequest) {
  const e = await requireEmpresaId();
  if (!e) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { pregunta } = await req.json();
  if (!pregunta || typeof pregunta !== 'string')
    return NextResponse.json({ error: 'Falta la pregunta' }, { status: 400 });

  let intent: Intent = 'desconocido'; let params: any = {};
  try {
    const raw = await aiComplete(`${CLASIFICADOR}\n\nPregunta: "${pregunta}"`);
    const j = JSON.parse(raw.replace(/```json|```/g, '').trim());
    intent = j.intent; params = j.params || {};
  } catch { /* si falla, queda desconocido */ }

  if (intent === 'desconocido') {
    return NextResponse.json({
      intent,
      respuesta: 'No estoy seguro de eso. Puedo ayudarte con: quién trabaja un día, carga de la semana, limpiezas sin asignar, agenda de un día, facturas por cobrar, o la agenda de una limpiadora.',
      datos: [],
    });
  }

  const datos = await runIntent(intent, params, e);

  let respuesta = '';
  try {
    respuesta = await aiComplete(
      `Eres el asistente de una empresa de limpieza. Responde en español, claro y breve, SOLO con estos datos (no inventes nada; si la lista está vacía dilo):\nPregunta: "${pregunta}"\nDatos (JSON): ${JSON.stringify(datos)}`);
  } catch {
    respuesta = 'Aquí están los datos.';
  }

  return NextResponse.json({ intent, respuesta, datos });
}
