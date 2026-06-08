import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'
import { aiComplete } from '@/lib/ai-client'
import { getTransporter, MAIL_FROM } from '@/lib/mailer'
import { emailFacturacionCliente } from '@/lib/facturacion'

export async function POST(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { cliente_id, periodo, enviar_email = false } = await req.json()
    const [year, month] = periodo.split('-').map(Number)
    const inicio = new Date(year, month - 1, 1).toISOString().split('T')[0]
    const fin    = new Date(year, month, 0).toISOString().split('T')[0]

    const [empresa, cliente, sesiones, quejas_data, valoraciones] = await Promise.all([
      prisma.$queryRaw<any[]>(Prisma.sql`SELECT nombre, email FROM empresas WHERE id = ${empresa_id}::uuid`),
      prisma.$queryRaw<any[]>(Prisma.sql`SELECT * FROM clientes WHERE id = ${cliente_id}::uuid`),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT cs.*, l.nombre AS limpiadora_nombre,
          EXTRACT(EPOCH FROM (cs.hora_salida - cs.hora_llegada))/3600.0 AS horas_trabajadas
        FROM cleaning_sessions cs
        LEFT JOIN limpiadoras l ON l.id = cs.limpiadora_id
        WHERE cs.empresa_id = ${empresa_id}::uuid AND cs.cliente_id = ${cliente_id}::uuid
          AND cs.session_date BETWEEN ${inicio}::date AND ${fin}::date
          AND cs.completed_at IS NOT NULL
        ORDER BY cs.session_date ASC
      `),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT q.*, p.nombre AS propiedad_nombre FROM quejas q
        LEFT JOIN propiedades p ON p.id = q.propiedad_id
        WHERE q.empresa_id = ${empresa_id}::uuid AND q.cliente_id = ${cliente_id}::uuid
          AND q.creada_at::date BETWEEN ${inicio}::date AND ${fin}::date
      `),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT AVG(valoracion)::numeric(3,1) AS media, COUNT(*) AS total
        FROM cleaning_sessions
        WHERE empresa_id = ${empresa_id}::uuid AND cliente_id = ${cliente_id}::uuid
          AND session_date BETWEEN ${inicio}::date AND ${fin}::date
          AND valoracion IS NOT NULL
      `)
    ])

    const c      = cliente[0]
    const e      = empresa[0]
    const totalH = sesiones.reduce((a: number, s: any) => a + (Number(s.horas_trabajadas) || 0), 0)
    const totalF = sesiones.reduce((a: number, s: any) => a + (Number(s.precio_final) || 0), 0)
    const mes    = new Date(year, month - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    const ratingMedio = valoraciones[0]?.media || null
    const incidenciasResueltas = quejas_data.filter((q: any) => q.estado === 'resuelta').length

    // ── Generar resumen narrativo con IA ──────────────────────────────────
    let resumen_ia = ''
    try {
      const prompt = `Eres el responsable de calidad de "${e.nombre}", empresa de limpieza profesional.
Redacta un informe mensual personalizado para el propietario "${c.nombre}".
Tono: profesional, cercano y positivo. Máximo 200 palabras. Solo prosa, sin bullets ni listas.
Estructura en 3 párrafos: 1) resumen de actividad del mes, 2) incidencias si las hay (si no hay, destacar la buena gestión), 3) cierre con recomendación o mensaje de confianza.

Datos del mes de ${mes}:
- Limpiezas completadas: ${sesiones.length}
- Horas trabajadas: ${totalH.toFixed(1)}h
- Incidencias detectadas: ${quejas_data.length} (${incidenciasResueltas} resueltas)
- Valoración media del servicio: ${ratingMedio ? ratingMedio + '/5' : 'sin valoraciones este mes'}
- Importe facturado: ${totalF > 0 ? totalF.toFixed(0) + '€' : 'pendiente de facturar'}

Responde SOLO con el texto del informe, sin títulos ni encabezados.`

      resumen_ia = await aiComplete(prompt)
      resumen_ia = resumen_ia.trim()
    } catch (_) {
      resumen_ia = `Durante ${mes} se realizaron ${sesiones.length} limpiezas con un total de ${totalH.toFixed(1)} horas de trabajo. ${quejas_data.length === 0 ? 'No se registraron incidencias.' : `Se registraron ${quejas_data.length} incidencias, de las cuales ${incidenciasResueltas} fueron resueltas.`} Gracias por confiar en ${e.nombre}.`
    }

    // ── Generar HTML del informe ──────────────────────────────────────────
    const html = `<html><head><meta charset="utf-8"><style>
body{font-family:Arial,sans-serif;margin:40px;color:#1e293b}
.header{background:#4f46e5;color:white;padding:24px;border-radius:8px;margin-bottom:24px}
.header h1{margin:0;font-size:24px}.header p{margin:4px 0;opacity:.8;font-size:14px}
.resumen-ia{background:#eef2ff;border-left:4px solid #4f46e5;padding:20px;border-radius:0 8px 8px 0;margin:24px 0;font-size:14px;line-height:1.7;color:#1e1b4b}
.resumen-ia h3{margin:0 0 12px;color:#4f46e5;font-size:13px;text-transform:uppercase;letter-spacing:.05em}
table{width:100%;border-collapse:collapse;margin:16px 0}
th{background:#f1f5f9;padding:10px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.05em}
td{padding:10px;border-bottom:1px solid #e2e8f0;font-size:13px}
.stat{display:inline-block;margin:8px 16px 8px 0;text-align:center}
.stat-n{font-size:28px;font-weight:800;color:#4f46e5}.stat-l{font-size:11px;color:#64748b}
.badge-ia{display:inline-block;background:#4f46e5;color:white;font-size:10px;padding:2px 8px;border-radius:99px;vertical-align:middle;margin-left:8px}
</style></head><body>
<div class="header">
  <h1>${e.nombre}</h1>
  <p>Informe de servicio — ${mes}</p>
  <p>Cliente: ${c.nombre}</p>
</div>
<div style="display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap">
  <div class="stat"><div class="stat-n">${sesiones.length}</div><div class="stat-l">Limpiezas</div></div>
  <div class="stat"><div class="stat-n">${totalH.toFixed(1)}h</div><div class="stat-l">Horas trabajadas</div></div>
  <div class="stat"><div class="stat-n">${quejas_data.length}</div><div class="stat-l">Incidencias</div></div>
  ${ratingMedio ? `<div class="stat"><div class="stat-n">${ratingMedio}⭐</div><div class="stat-l">Valoración</div></div>` : ''}
  <div class="stat"><div class="stat-n">${totalF > 0 ? totalF.toFixed(0) + '€' : '—'}</div><div class="stat-l">Facturado</div></div>
</div>

<div class="resumen-ia">
  <h3>Resumen del mes <span class="badge-ia">✨ IA</span></h3>
  ${resumen_ia.split('\n\n').map((p: string) => `<p style="margin:0 0 12px">${p}</p>`).join('')}
</div>

<h3 style="margin:16px 0 8px;color:#4f46e5">Limpiezas realizadas</h3>
<table>
  <tr><th>Fecha</th><th>Propiedad</th><th>Limpiadora</th><th>Estado</th>${c.tipo === 'comunidad' ? '<th>Firma</th>' : ''}</tr>
  ${sesiones.map((s: any) => `<tr>
    <td>${s.session_date}</td>
    <td>${s.property_name || '—'}</td>
    <td>${s.limpiadora_nombre || '—'}</td>
    <td>✅ Completada</td>
    ${c.tipo === 'comunidad' ? `<td>${s.firma_at ? '✅ Firmado' : '—'}</td>` : ''}
  </tr>`).join('')}
</table>

${quejas_data.length > 0 ? `
<h3 style="margin:24px 0 8px;color:#dc2626">Incidencias del mes</h3>
<table>
  <tr><th>Fecha</th><th>Propiedad</th><th>Descripción</th><th>Estado</th></tr>
  ${quejas_data.map((q: any) => `<tr>
    <td>${q.creada_at?.toString().slice(0, 10)}</td>
    <td>${q.propiedad_nombre || '—'}</td>
    <td>${q.descripcion}</td>
    <td>${q.estado}</td>
  </tr>`).join('')}
</table>` : ''}

<div style="margin-top:32px;padding:16px;background:#f8fafc;border-radius:8px;font-size:12px;color:#64748b">
  <strong>${e.nombre}</strong><br>Informe generado automáticamente por ialimp
</div>
</body></html>`

    // Guardar informe con resumen_ia
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO informes_mensuales (
        empresa_id, cliente_id, periodo,
        total_sesiones, total_horas, total_quejas, total_facturado,
        html_contenido, resumen_ia
      ) VALUES (
        ${empresa_id}::uuid, ${cliente_id}::uuid, ${periodo},
        ${sesiones.length}, ${totalH}, ${quejas_data.length}, ${totalF || 0},
        ${html}, ${resumen_ia}
      )
      ON CONFLICT (empresa_id, cliente_id, periodo) DO UPDATE SET
        html_contenido  = EXCLUDED.html_contenido,
        resumen_ia      = EXCLUDED.resumen_ia,
        total_sesiones  = EXCLUDED.total_sesiones,
        total_horas     = EXCLUDED.total_horas,
        total_quejas    = EXCLUDED.total_quejas,
        total_facturado = EXCLUDED.total_facturado
    `)

    // Enviar email si solicitado (al email de facturación; con fallback a contactos/notif)
    let email_enviado = false
    const t = getTransporter()
    const destinatario = await emailFacturacionCliente(empresa_id, c)
    if (enviar_email && destinatario && t) {
      try {
        await t.sendMail({
          from: `"${e.nombre}" <${MAIL_FROM}>`,
          to: destinatario,
          subject: `Informe de servicio ${mes} — ${e.nombre}`,
          html
        })
        await prisma.$executeRaw(Prisma.sql`
          UPDATE informes_mensuales
          SET email_enviado = true, email_enviado_at = NOW()
          WHERE empresa_id = ${empresa_id}::uuid
            AND cliente_id = ${cliente_id}::uuid
            AND periodo = ${periodo}
        `)
        email_enviado = true
      } catch (_) {}
    }

    return NextResponse.json({ ok: true, sesiones: sesiones.length, resumen_ia, email_enviado })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
