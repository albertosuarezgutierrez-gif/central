import { NextResponse } from 'next/server'
import { serialize } from '@/lib/serialize'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

// GET — listar programaciones (por propiedad o todas)
export async function GET(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { searchParams } = new URL(req.url)
    const propiedad_id = searchParams.get('propiedad_id')

    const programaciones = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        pg.*,
        p.nombre  AS propiedad_nombre,
        p.tipo    AS propiedad_tipo,
        c.nombre  AS cliente_nombre,
        l.nombre  AS limpiadora_nombre
      FROM programaciones pg
      JOIN propiedades p ON p.id = pg.propiedad_id
      JOIN clientes    c ON c.id = p.cliente_id
      LEFT JOIN limpiadoras l ON l.id = pg.limpiadora_id
      WHERE pg.empresa_id = ${empresa_id}::uuid
        ${propiedad_id ? Prisma.sql`AND pg.propiedad_id = ${propiedad_id}::uuid` : Prisma.sql``}
      ORDER BY pg.activa DESC, p.nombre ASC
    `)

    return NextResponse.json(serialize({ programaciones }))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST — crear programación
export async function POST(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const {
      propiedad_id, frecuencia = 'semanal',
      dias_semana, dias_mes, hora_inicio,
      tipo_servicio = 'rotacion', limpiadora_id,
      notas, fecha_inicio, fecha_fin, dias_antelacion = 30
    } = await req.json()

    if (!propiedad_id) {
      return NextResponse.json({ error: 'Propiedad obligatoria' }, { status: 400 })
    }

    // Validar que tenga días según frecuencia
    if (frecuencia === 'semanal' || frecuencia === 'quincenal') {
      if (!dias_semana?.length) {
        return NextResponse.json({ error: 'Selecciona al menos un día de la semana' }, { status: 400 })
      }
    }
    if (frecuencia === 'mensual' && !dias_mes?.length) {
      return NextResponse.json({ error: 'Selecciona al menos un día del mes' }, { status: 400 })
    }

    // Verificar propiedad pertenece a empresa
    const check = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT p.id FROM propiedades p
      WHERE p.id = ${propiedad_id}::uuid AND p.empresa_id = ${empresa_id}::uuid
    `)
    if (!check.length) return NextResponse.json({ error: 'Propiedad no válida' }, { status: 403 })

    const result = await prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO programaciones (
        empresa_id, propiedad_id, frecuencia,
        dias_semana, dias_mes, hora_inicio,
        tipo_servicio, limpiadora_id, notas,
        fecha_inicio, fecha_fin, dias_antelacion
      ) VALUES (
        ${empresa_id}::uuid,
        ${propiedad_id}::uuid,
        ${frecuencia},
        ${dias_semana     || null},
        ${dias_mes        || null},
        ${hora_inicio     ? hora_inicio + '::time' : null},
        ${tipo_servicio},
        ${limpiadora_id   ? limpiadora_id + '::uuid' : null},
        ${notas           || null},
        ${(fecha_inicio   || new Date().toISOString().split('T')[0]) + '::date'},
        ${fecha_fin       ? fecha_fin + '::date'  : null},
        ${Number(dias_antelacion)}
      )
      RETURNING *
    `)

    // Generar sesiones inmediatamente
    const prog = result[0]
    await generarSesiones(prog, empresa_id)

    return NextResponse.json({ ok: true, programacion: prog }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// Generar sesiones para una programación
async function generarSesiones(prog: any, empresa_id: string) {
  const hoy    = new Date()
  const hasta  = new Date()
  hasta.setDate(hasta.getDate() + prog.dias_antelacion)

  const fechasAGenerar: Date[] = []
  const cur = new Date(prog.fecha_inicio > hoy.toISOString().split('T')[0]
    ? prog.fecha_inicio : hoy)

  while (cur <= hasta) {
    const diaSemana = cur.getDay() || 7 // 1=lun, 7=dom
    const diaMes    = cur.getDate()

    let incluir = false
    if (prog.frecuencia === 'semanal' && prog.dias_semana?.includes(diaSemana)) {
      incluir = true
    } else if (prog.frecuencia === 'mensual' && prog.dias_mes?.includes(diaMes)) {
      incluir = true
    } else if (prog.frecuencia === 'quincenal' && prog.dias_semana?.includes(diaSemana)) {
      // Quincena: semanas 1 y 3 del mes
      const semana = Math.ceil(diaMes / 7)
      if (semana === 1 || semana === 3) incluir = true
    }

    if (incluir) fechasAGenerar.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }

  for (const fecha of fechasAGenerar) {
    const fechaStr = fecha.toISOString().split('T')[0]
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO cleaning_sessions (
        empresa_id, propiedad_id, cliente_id,
        property_name, session_date,
        hora_inicio, limpiadora_id, tipo_servicio,
        origen, external_reservation_id
      )
      SELECT
        ${empresa_id}::uuid,
        p.id,
        p.cliente_id,
        p.nombre,
        ${fechaStr}::date,
        ${prog.hora_inicio || null},
        ${prog.limpiadora_id ? prog.limpiadora_id + '::uuid' : null},
        ${prog.tipo_servicio},
        'programacion',
        ${'prog_' + prog.id + '_' + fechaStr}
      FROM propiedades p WHERE p.id = ${prog.propiedad_id}::uuid
      ON CONFLICT (external_reservation_id) DO NOTHING
    `)
  }

  return fechasAGenerar.length
}
