import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// Exporta fichajes del mes en CSV para entrega a la ITSS (Inspección de Trabajo)
export async function GET(req: Request) {
  try {
    const { empresa_id } = await getSesion()
    const url = new URL(req.url)
    const mes = url.searchParams.get('mes') // YYYY-MM
    const empleadoId = url.searchParams.get('empleado_id') || null

    if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
      return NextResponse.json({ error: 'Parámetro mes requerido (YYYY-MM)' }, { status: 422 })
    }

    const filas = await prisma.$queryRaw<{
      empresa_nombre: string
      empleado_nombre: string
      nif: string | null
      fecha: string
      entrada_at: string
      salida_at: string | null
      horas_totales: number | null
      obra_nombre: string | null
      observaciones: string | null
    }[]>(
      Prisma.sql`
        SELECT
          emp.nombre                AS empresa_nombre,
          e.nombre                  AS empleado_nombre,
          e.nif,
          f.entrada_at::date::text  AS fecha,
          f.entrada_at,
          f.salida_at,
          f.horas_totales,
          o.nombre                  AS obra_nombre,
          f.observaciones
        FROM rrhh.fichajes f
        JOIN rrhh.empresas emp  ON emp.id = f.empresa_id
        JOIN rrhh.empleados e   ON e.id   = f.empleado_id
        LEFT JOIN rrhh.obras o  ON o.id   = f.obra_id
        WHERE f.empresa_id = ${empresa_id}::uuid
          AND to_char(f.entrada_at AT TIME ZONE 'Europe/Madrid', 'YYYY-MM') = ${mes}
          ${empleadoId ? Prisma.sql`AND f.empleado_id = ${empleadoId}::uuid` : Prisma.sql``}
        ORDER BY e.nombre, f.entrada_at
      `
    )

    const formatISO = (iso: string | null) => {
      if (!iso) return ''
      return new Date(iso).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', hour12: false }).replace(',', '')
    }

    const cabecera = ['Empresa', 'Empleado', 'NIF', 'Fecha', 'Entrada', 'Salida', 'Horas', 'Centro de trabajo', 'Observaciones']
    const lineas = filas.map(r => [
      r.empresa_nombre,
      r.empleado_nombre,
      r.nif ?? '',
      r.fecha,
      formatISO(r.entrada_at),
      formatISO(r.salida_at),
      r.horas_totales != null ? r.horas_totales.toFixed(2) : '',
      r.obra_nombre ?? '',
      r.observaciones ?? '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))

    const csv = [cabecera.join(';'), ...lineas].join('\r\n')
    const nombre = `fichajes_${mes}${empleadoId ? `_emp` : ''}.csv`

    return new Response('﻿' + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${nombre}"`,
      },
    })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}
