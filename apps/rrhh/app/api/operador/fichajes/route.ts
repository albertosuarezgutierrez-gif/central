import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { fichajeTallerAutorizado } from '@/lib/operador'
import { validarFichajeTaller } from '@/lib/fichaje-taller'
import { fichajeActivo, ficharEntrada, ficharSalida } from '@/lib/fichajes'
import { getIp } from '@/lib/rate-limit'

const ORIGEN = 'taller'

// POST { empresa_id, accion: 'entrada'|'salida', empleado_id | dni, ip? } — Bearer RRHH_FICHAJE_TALLER_SECRET.
// La hora la pone el SERVIDOR (now()); el taller no la manda. Reutiliza `ficharEntrada`/`ficharSalida` del portal.
// Sin ubicación (el taller no tiene GPS del trabajador): el fichaje queda marcado `sin_ubicacion` y con origen 'taller'.
// Duplicados: entrada con una entrada ya abierta → 409; salida sin entrada abierta → 409. Nunca se alterna solo.
export async function POST(req: Request) {
  if (!fichajeTallerAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const v = validarFichajeTaller(await req.json().catch(() => null))
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const d = v.datos

  const filas = await prisma.$queryRaw<{ id: string; nombre: string; estado: string }[]>(Prisma.sql`
    SELECT id::text AS id, nombre, estado FROM rrhh.empleados
    WHERE empresa_id = ${d.empresa_id}::uuid
      AND ${d.empleado_id
        ? Prisma.sql`id = ${d.empleado_id}::uuid`
        : Prisma.sql`upper(regexp_replace(coalesce(dni, ''), '[\\s.\\-]', '', 'g')) = ${d.dni}`}
    LIMIT 2`)
  if (filas.length === 0) return NextResponse.json({ error: 'Empleado no encontrado en esa empresa', codigo: 'empleado_no_encontrado' }, { status: 404 })
  if (filas.length > 1) return NextResponse.json({ error: 'Más de un empleado con ese identificador; usa empleado_id', codigo: 'identificador_ambiguo' }, { status: 409 })
  const emp = filas[0]
  if (emp.estado !== 'activo') return NextResponse.json({ error: 'El empleado no está activo', codigo: 'empleado_inactivo' }, { status: 403 })

  const activo = await fichajeActivo(d.empresa_id, emp.id)
  if (d.accion === 'entrada' && activo) return NextResponse.json({ error: 'Ya hay una entrada abierta', codigo: 'ya_fichado', entrada_at: activo.entrada_at }, { status: 409 })
  if (d.accion === 'salida' && !activo) return NextResponse.json({ error: 'No hay una entrada abierta', codigo: 'sin_entrada' }, { status: 409 })

  const extra = { sin_ubicacion: true, origen: ORIGEN, ip: d.ip ?? getIp(req) }
  const fichaje = d.accion === 'entrada'
    ? await ficharEntrada(d.empresa_id, emp.id, null, null, extra)
    : await ficharSalida(d.empresa_id, emp.id, null, null, extra)
  return NextResponse.json({ ok: true, accion: d.accion, empleado: { id: emp.id, nombre: emp.nombre }, fichaje }, { status: 201 })
}
