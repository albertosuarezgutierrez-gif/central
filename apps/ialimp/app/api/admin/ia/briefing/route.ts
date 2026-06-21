import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'
import { aiComplete } from '@/lib/ai-client'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const empresa_id = await requireEmpresaId()
    const hoy     = new Date().toISOString().split('T')[0]
    const manana  = new Date(Date.now() + 86400000).toISOString().split('T')[0]
    const diaNombre = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

    // Recoger todos los datos en paralelo
    const [sesionesHoy, sesionesManana, ausenciasHoy, alertas, quejas, stock, facturas, empresa] = await Promise.all([
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT cs.property_name, cs.hora_inicio, cs.tipo_servicio,
               cs.completed_at IS NOT NULL AS completada,
               cs.limpiadora_id IS NULL    AS sin_asignar,
               l.nombre AS limpiadora_nombre
        FROM cleaning_sessions cs
        LEFT JOIN limpiadoras l ON l.id = cs.limpiadora_id
        WHERE cs.empresa_id = ${empresa_id}::uuid
          AND cs.session_date = ${hoy}::date
        ORDER BY cs.hora_inicio ASC NULLS LAST
      `),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT cs.property_name, cs.hora_inicio,
               cs.limpiadora_id IS NULL AS sin_asignar,
               l.nombre AS limpiadora_nombre
        FROM cleaning_sessions cs
        LEFT JOIN limpiadoras l ON l.id = cs.limpiadora_id
        WHERE cs.empresa_id = ${empresa_id}::uuid
          AND cs.session_date = ${manana}::date
        ORDER BY cs.hora_inicio ASC NULLS LAST
      `),
      // NUEVO: limpiadoras ausentes hoy (aprobadas)
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT l.nombre AS limpiadora_nombre, la.motivo, la.fecha_fin
        FROM limpiadora_ausencias la
        JOIN limpiadoras l ON l.id = la.limpiadora_id
        WHERE l.empresa_id = ${empresa_id}::uuid
          AND la.aprobada = true
          AND ${hoy}::date BETWEEN la.fecha_inicio AND la.fecha_fin
        ORDER BY l.nombre
      `),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT tipo, COALESCE(titulo, descripcion, tipo) AS mensaje FROM alertas
        WHERE empresa_id = ${empresa_id}::uuid AND leida = false
        ORDER BY creada_at DESC LIMIT 5
      `),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT descripcion, severidad FROM quejas
        WHERE empresa_id = ${empresa_id}::uuid AND estado = 'pendiente'
        ORDER BY creada_at DESC LIMIT 3
      `),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT nombre, stock_actual, stock_minimo FROM productos_stock
        WHERE empresa_id = ${empresa_id}::uuid
          AND stock_actual <= stock_minimo AND activo = true
        LIMIT 5
      `),
      // NUEVO: estado de facturación (cuentas por cobrar). Cast a int/float -> evita BigInt en JSON
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE estado IN ('emitida','vencida'))::int                  AS pendientes_count,
          COALESCE(SUM(total) FILTER (WHERE estado IN ('emitida','vencida')),0)::float8 AS pendientes_importe,
          COUNT(*) FILTER (
            WHERE estado = 'vencida'
               OR (estado = 'emitida' AND fecha_vencimiento IS NOT NULL AND fecha_vencimiento < CURRENT_DATE)
          )::int                                                                        AS vencidas_count,
          COALESCE(SUM(total) FILTER (
            WHERE estado = 'vencida'
               OR (estado = 'emitida' AND fecha_vencimiento IS NOT NULL AND fecha_vencimiento < CURRENT_DATE)
          ),0)::float8                                                                  AS vencidas_importe,
          COUNT(*) FILTER (WHERE estado = 'borrador')::int                              AS borradores_count
        FROM facturas_clientes
        WHERE empresa_id = ${empresa_id}::uuid
      `),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT nombre FROM empresas WHERE id = ${empresa_id}::uuid
      `)
    ])

    const fact = facturas[0] || { pendientes_count: 0, pendientes_importe: 0, vencidas_count: 0, vencidas_importe: 0, borradores_count: 0 }

    // KPIs para el briefing
    const kpis = {
      sesiones_hoy_total:    sesionesHoy.length,
      sesiones_hoy_ok:       sesionesHoy.filter((s: any) => !s.sin_asignar).length,
      sesiones_hoy_sin:      sesionesHoy.filter((s: any) => s.sin_asignar).length,
      sesiones_hoy_hechas:   sesionesHoy.filter((s: any) => s.completada).length,
      sesiones_manana_total: sesionesManana.length,
      sesiones_manana_sin:   sesionesManana.filter((s: any) => s.sin_asignar).length,
      ausencias_hoy:         ausenciasHoy.length,
      alertas_pendientes:    alertas.length,
      quejas_pendientes:     quejas.length,
      productos_bajo_stock:  stock.length,
      facturas_pendientes:   Number(fact.pendientes_count) || 0,
      importe_pendiente:     Number(fact.pendientes_importe) || 0,
      facturas_vencidas:     Number(fact.vencidas_count) || 0,
      importe_vencido:       Number(fact.vencidas_importe) || 0,
      facturas_borrador:     Number(fact.borradores_count) || 0,
    }

    // Construir contexto para la IA
    const sesionesTexto = sesionesHoy.length
      ? sesionesHoy.map((s: any) =>
          `• ${s.property_name} (${s.tipo_servicio || 'limpieza'})` +
          (s.hora_inicio ? ` a las ${String(s.hora_inicio).slice(0, 5)}` : ' sin hora') +
          (s.sin_asignar ? ' ⚠️ SIN ASIGNAR' : ` → ${s.limpiadora_nombre}`) +
          (s.completada ? ' ✅' : '')
        ).join('\n')
      : 'Sin sesiones programadas hoy'

    const mananaTexto = sesionesManana.length
      ? sesionesManana.map((s: any) =>
          `• ${s.property_name}` +
          (s.sin_asignar ? ' ⚠️ sin asignar' : ` → ${s.limpiadora_nombre}`)
        ).join('\n')
      : 'Sin sesiones mañana'

    const ausenciasTexto = ausenciasHoy.length
      ? ausenciasHoy.map((a: any) => `• ${a.limpiadora_nombre} (${a.motivo || 'ausente'})`).join('\n')
      : 'Equipo completo hoy'

    const alertasTexto = alertas.length
      ? alertas.map((a: any) => `• ${a.mensaje}`).join('\n')
      : 'Sin alertas pendientes'

    const quejasTexto = quejas.length
      ? quejas.map((q: any) => `• [${q.severidad || 'media'}] ${q.descripcion}`).join('\n')
      : 'Sin quejas pendientes'

    const stockTexto = stock.length
      ? stock.map((p: any) => `• ${p.nombre}: ${p.stock_actual} uds (mín ${p.stock_minimo})`).join('\n')
      : 'Stock OK'

    const eur = (n: number) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
    const facturacionTexto =
      kpis.facturas_pendientes === 0 && kpis.facturas_borrador === 0
        ? 'Sin facturas pendientes de cobro'
        : [
            kpis.facturas_pendientes > 0
              ? `• ${kpis.facturas_pendientes} factura(s) pendiente(s) de cobro por ${eur(kpis.importe_pendiente)}`
              : null,
            kpis.facturas_vencidas > 0
              ? `• ⚠️ ${kpis.facturas_vencidas} VENCIDA(S) por ${eur(kpis.importe_vencido)}`
              : null,
            kpis.facturas_borrador > 0
              ? `• ${kpis.facturas_borrador} en borrador por emitir`
              : null,
          ].filter(Boolean).join('\n')

    const prompt = `Eres el asistente de coordinación de "${empresa[0]?.nombre || 'la empresa'}".
Genera un briefing diario conciso para la coordinadora. Hoy es ${diaNombre}.
Tono: directo, profesional, útil. Máximo 150 palabras. Sin títulos ni bullets — solo prosa natural, una idea por bloque.

Datos de hoy:
SESIONES HOY (${kpis.sesiones_hoy_total} total · ${kpis.sesiones_hoy_hechas} hechas · ${kpis.sesiones_hoy_sin} sin asignar):
${sesionesTexto}

MAÑANA (${kpis.sesiones_manana_total} sesiones, ${kpis.sesiones_manana_sin} sin asignar):
${mananaTexto}

EQUIPO — AUSENCIAS HOY (${kpis.ausencias_hoy}):
${ausenciasTexto}

ALERTAS ACTIVAS (${kpis.alertas_pendientes}):
${alertasTexto}

QUEJAS PENDIENTES (${kpis.quejas_pendientes}):
${quejasTexto}

STOCK BAJO (${kpis.productos_bajo_stock} productos):
${stockTexto}

FACTURACIÓN — CUENTAS POR COBRAR:
${facturacionTexto}

Empieza directamente con el resumen. Cubre operaciones (hoy y mañana) Y negocio (facturación). Si todo va bien, dilo con confianza. Si hay urgencias (sin asignar, vencidas, quejas graves), destácalas primero.`

    let resumen = ''
    try {
      resumen = (await aiComplete(prompt)).trim()
    } catch (_) {
      // Fallback sin IA
      const partes = []
      if (kpis.sesiones_hoy_total === 0) {
        partes.push('Sin sesiones programadas para hoy.')
      } else {
        partes.push(`Hoy hay ${kpis.sesiones_hoy_total} sesión${kpis.sesiones_hoy_total > 1 ? 'es' : ''} (${kpis.sesiones_hoy_hechas} hechas).` +
          (kpis.sesiones_hoy_sin > 0 ? ` ⚠️ ${kpis.sesiones_hoy_sin} sin asignar.` : ' Todas asignadas ✅'))
      }
      if (kpis.ausencias_hoy > 0)      partes.push(`${kpis.ausencias_hoy} limpiadora${kpis.ausencias_hoy > 1 ? 's ausentes' : ' ausente'} hoy.`)
      if (kpis.quejas_pendientes > 0)  partes.push(`${kpis.quejas_pendientes} queja${kpis.quejas_pendientes > 1 ? 's' : ''} pendiente${kpis.quejas_pendientes > 1 ? 's' : ''}.`)
      if (kpis.productos_bajo_stock > 0) partes.push(`${kpis.productos_bajo_stock} producto${kpis.productos_bajo_stock > 1 ? 's' : ''} bajo mínimo de stock.`)
      if (kpis.facturas_vencidas > 0)  partes.push(`⚠️ ${kpis.facturas_vencidas} factura${kpis.facturas_vencidas > 1 ? 's' : ''} vencida${kpis.facturas_vencidas > 1 ? 's' : ''} por ${eur(kpis.importe_vencido)}.`)
      else if (kpis.facturas_pendientes > 0) partes.push(`${kpis.facturas_pendientes} factura${kpis.facturas_pendientes > 1 ? 's' : ''} pendiente${kpis.facturas_pendientes > 1 ? 's' : ''} de cobro (${eur(kpis.importe_pendiente)}).`)
      resumen = partes.join(' ')
    }

    return NextResponse.json({
      ok: true,
      fecha: hoy,
      dia: diaNombre,
      resumen,
      kpis,
      detalle: {
        sesiones_hoy:    sesionesHoy,
        sesiones_manana: sesionesManana,
        ausencias_hoy:   ausenciasHoy,
        alertas,
        quejas,
        stock,
        facturacion: {
          pendientes_count:   kpis.facturas_pendientes,
          pendientes_importe: kpis.importe_pendiente,
          vencidas_count:     kpis.facturas_vencidas,
          vencidas_importe:   kpis.importe_vencido,
          borradores_count:   kpis.facturas_borrador,
        }
      }
    })

  } catch (e: any) {
    console.error('[briefing] Error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
