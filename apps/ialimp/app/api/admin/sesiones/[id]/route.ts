import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'
import { sendPushToLimpiadora } from '@/lib/push'

// PATCH — editar sesión: asignar / reasignar / DESASIGNAR limpiadora y otros campos.
// Scope obligatorio por empresa_id. No deja tocar una sesión ya completada.
// Se actualiza SOLO el campo enviado (un UPDATE por campo): así una reasignación
// solo toca limpiadora_id y nunca se ejecutan COALESCE que choquen de tipo
// (p. ej. hora_inicio es TEXT, no time → un cast ::time rompía con 42804).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await params
    const body = await req.json()

    // Sesión actual (y comprobación de pertenencia a la empresa)
    const actual = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, completed_at, limpiadora_id::text AS limpiadora_id FROM cleaning_sessions
      WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
    `)
    if (!actual.length) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })

    const cambiaLimpiadora = Object.prototype.hasOwnProperty.call(body, 'limpiadora_id')

    // No se reasigna una limpieza ya completada
    if (cambiaLimpiadora && actual[0].completed_at) {
      return NextResponse.json(
        { error: 'No se puede reasignar: la limpieza ya está completada' },
        { status: 409 }
      )
    }

    const scope = Prisma.sql`WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid`

    // Cada campo, solo si se envía (sin COALESCE → sin choques de tipo)
    if (body.property_name !== undefined)
      await prisma.$executeRaw(Prisma.sql`UPDATE cleaning_sessions SET property_name = ${body.property_name} ${scope}`)
    if (body.session_date)
      await prisma.$executeRaw(Prisma.sql`UPDATE cleaning_sessions SET session_date = ${body.session_date}::date ${scope}`)
    if (body.hora_inicio !== undefined)
      await prisma.$executeRaw(Prisma.sql`UPDATE cleaning_sessions SET hora_inicio = ${body.hora_inicio} ${scope}`)
    if (body.tipo_servicio !== undefined)
      await prisma.$executeRaw(Prisma.sql`UPDATE cleaning_sessions SET tipo_servicio = ${body.tipo_servicio} ${scope}`)
    if (body.notas !== undefined)
      await prisma.$executeRaw(Prisma.sql`UPDATE cleaning_sessions SET notas = ${body.notas} ${scope}`)
    // Ventana horaria (columnas TIME → castear ::time; NO castear hora_inicio que es TEXT)
    if (body.hora_checkout !== undefined)
      await prisma.$executeRaw(Prisma.sql`UPDATE cleaning_sessions SET hora_checkout = ${body.hora_checkout || null}::time ${scope}`)
    if (body.hora_checkin_siguiente !== undefined)
      await prisma.$executeRaw(Prisma.sql`UPDATE cleaning_sessions SET hora_checkin_siguiente = ${body.hora_checkin_siguiente || null}::time ${scope}`)
    if (body.num_huespedes !== undefined)
      await prisma.$executeRaw(Prisma.sql`UPDATE cleaning_sessions SET num_huespedes = ${body.num_huespedes ?? null} ${scope}`)
    if (body.orden_manual !== undefined)
      await prisma.$executeRaw(Prisma.sql`UPDATE cleaning_sessions SET orden_manual = ${body.orden_manual ?? null} ${scope}`)
    if (body.urgente_manual !== undefined)
      await prisma.$executeRaw(Prisma.sql`UPDATE cleaning_sessions SET urgente_manual = ${!!body.urgente_manual} ${scope}`)

    // Si cambió la ventana (checkout/checkin), recalcular ventana_minutos + alerta_ventana
    if (body.hora_checkout !== undefined || body.hora_checkin_siguiente !== undefined) {
      const hv = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT hora_checkout::text AS co, hora_checkin_siguiente::text AS ci
        FROM cleaning_sessions ${scope}
      `)
      const co = hv[0]?.co, ci = hv[0]?.ci
      let vmin: number | null = null, alerta = false
      if (co && ci) {
        const [hO, mO] = String(co).split(':').map(Number)
        const [hI, mI] = String(ci).split(':').map(Number)
        vmin   = (hI * 60 + mI) - (hO * 60 + mO)
        alerta = vmin < 120
      }
      await prisma.$executeRaw(Prisma.sql`UPDATE cleaning_sessions SET ventana_minutos = ${vmin}, alerta_ventana = ${alerta} ${scope}`)
    }

    // Limpiadora: asignar (uuid) o DESASIGNAR si llega null / '' / vacío
    if (cambiaLimpiadora) {
      const lid = body.limpiadora_id
      if (lid)
        await prisma.$executeRaw(Prisma.sql`UPDATE cleaning_sessions SET limpiadora_id = ${lid}::uuid ${scope}`)
      else
        await prisma.$executeRaw(Prisma.sql`UPDATE cleaning_sessions SET limpiadora_id = NULL ${scope}`)
    }

    const result = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT cs.*, cs.session_date::text AS session_date,
             l.nombre AS limpiadora_nombre, l.color AS limpiadora_color
      FROM cleaning_sessions cs
      LEFT JOIN limpiadoras l ON l.id = cs.limpiadora_id
      WHERE cs.id = ${id}::uuid AND cs.empresa_id = ${empresa_id}::uuid
    `)

    // hora_* puede venir como Date (time de Postgres), ISO string o "HH:MM:SS"
    const hhmm = (v: any): string => {
      if (!v) return ''
      if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString().slice(11, 16)
      const t = String(v)
      return (t.includes('T') ? t.split('T')[1] : t).slice(0, 5)
    }
    const limpiadoraCambiada = cambiaLimpiadora && (body.limpiadora_id || null) !== (actual[0].limpiadora_id || null)

    // Aviso push a la limpiadora al asignarle/reasignarle a mano (no al desasignar
    // ni si ya la tenía). No crítico: si faltan VAPID/suscripciones, se omite.
    if (limpiadoraCambiada && body.limpiadora_id) {
      const s = result[0] || {}
      const fecha = s.session_date || ''
      const hora = hhmm(s.hora_inicio) ? ' ' + hhmm(s.hora_inicio) : ''
      const entrada = s.hora_checkin_siguiente ? ` · 🔴 Entra ${hhmm(s.hora_checkin_siguiente)}` : ''
      await sendPushToLimpiadora(
        empresa_id,
        body.limpiadora_id,
        '🧹 Nueva limpieza asignada',
        `${s.property_name || 'Limpieza'} · ${fecha}${hora}${entrada}`
      )
    }

    // Aviso a la limpiadora YA asignada si cambió la fecha/hora (y NO se reasignó:
    // en ese caso ya se avisó arriba). Para que se entere del cambio de horario.
    const cambiaHorario = !!body.session_date || body.hora_inicio !== undefined
    if (cambiaHorario && !limpiadoraCambiada && actual[0].limpiadora_id && !actual[0].completed_at) {
      const s = result[0] || {}
      const fecha = s.session_date || ''
      const hora = hhmm(s.hora_inicio) ? ' ' + hhmm(s.hora_inicio) : ''
      await sendPushToLimpiadora(
        empresa_id,
        actual[0].limpiadora_id,
        '⏰ Cambio de horario',
        `${s.property_name || 'Limpieza'} · ahora ${fecha}${hora}`
      )
    }

    return NextResponse.json({ ok: true, sesion: result[0] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE — cancelar sesión. SOLO origen='manual' (las sincronizadas con Smoobu
// las recrearía pms/sync) y solo si no ha empezado ni está completada.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await params

    const check = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id, started_at, completed_at, origen FROM cleaning_sessions
      WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
    `)
    if (!check.length) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

    if (check[0].origen !== 'manual') {
      return NextResponse.json(
        { error: 'Solo se pueden eliminar limpiezas manuales (las de Smoobu se recrearían al sincronizar)' },
        { status: 409 }
      )
    }
    if (check[0].started_at || check[0].completed_at) {
      return NextResponse.json({ error: 'No se puede eliminar: la limpieza ya empezó o está completada' }, { status: 409 })
    }

    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM cleaning_sessions WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid AND origen = 'manual'
    `)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
