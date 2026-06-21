import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { aiComplete } from '@/lib/ai-client'
import { getTransporter, MAIL_FROM } from '@/lib/mailer'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const APP_URL       = process.env.NEXTAUTH_URL || 'https://app.ialimp.es'

// ─── Generador de HTML de propuesta ───────────────────────────────────────

function generarHTMLPropuesta(params: {
  empresa_nombre: string
  empresa_email: string
  lead_nombre: string
  lead_email: string
  zona: string
  tipo_servicio: string
  m2: number
  frecuencia: string
  precio_estimado: number
  servicios_incluidos: string[]
  argumentario: string
  fecha: string
}): string {
  const {
    empresa_nombre, lead_nombre, zona, tipo_servicio,
    m2, frecuencia, precio_estimado, servicios_incluidos,
    argumentario, fecha
  } = params

  const frecuenciaLabel: Record<string, string> = {
    semanal: 'Semanal',
    quincenal: 'Quincenal',
    mensual: 'Mensual',
    puntual: 'Puntual'
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Arial', sans-serif; background: #f1f5f9; color: #1e1b4b; }
  .page { max-width: 800px; margin: 0 auto; background: white; }
  .header { background: #4f46e5; color: white; padding: 40px 48px; }
  .header h1 { font-size: 28px; font-weight: 800; margin-bottom: 4px; }
  .header p { opacity: 0.85; font-size: 14px; }
  .badge { display: inline-block; background: rgba(255,255,255,0.2);
    padding: 4px 12px; border-radius: 99px; font-size: 12px; margin-top: 12px; }
  .content { padding: 48px; }
  .greeting { font-size: 18px; color: #4f46e5; font-weight: 700; margin-bottom: 16px; }
  .argumentario { font-size: 14px; line-height: 1.8; color: #374151;
    background: #eef2ff; border-left: 4px solid #4f46e5;
    padding: 20px 24px; border-radius: 0 8px 8px 0; margin-bottom: 32px; }
  .argumentario p { margin-bottom: 12px; }
  .argumentario p:last-child { margin-bottom: 0; }
  .section-title { font-size: 13px; font-weight: 700; color: #6366f1;
    text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 16px; }
  .resumen-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 32px; }
  .resumen-item { background: #f8fafc; border: 1px solid #e2e8f0;
    border-radius: 8px; padding: 16px; }
  .resumen-item .label { font-size: 11px; color: #94a3b8; text-transform: uppercase;
    letter-spacing: 0.05em; margin-bottom: 4px; }
  .resumen-item .value { font-size: 16px; font-weight: 700; color: #1e1b4b; }
  .precio-box { background: #4f46e5; color: white; border-radius: 12px;
    padding: 24px 32px; text-align: center; margin-bottom: 32px; }
  .precio-box .desde { font-size: 13px; opacity: 0.8; margin-bottom: 4px; }
  .precio-box .precio { font-size: 48px; font-weight: 900; line-height: 1; }
  .precio-box .mes { font-size: 16px; opacity: 0.8; }
  .precio-box .nota { font-size: 11px; opacity: 0.65; margin-top: 8px; }
  .servicios { margin-bottom: 32px; }
  .servicio-item { display: flex; align-items: center; gap: 10px;
    padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
  .servicio-item:last-child { border-bottom: none; }
  .check { width: 20px; height: 20px; background: #4f46e5; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    color: white; font-size: 11px; flex-shrink: 0; }
  .cta { background: #1e1b4b; color: white; border-radius: 12px;
    padding: 28px 32px; text-align: center; margin-bottom: 32px; }
  .cta h3 { font-size: 18px; margin-bottom: 8px; }
  .cta p { font-size: 13px; opacity: 0.75; margin-bottom: 16px; }
  .cta .btn { display: inline-block; background: #4f46e5; color: white;
    padding: 12px 32px; border-radius: 8px; font-weight: 700; font-size: 14px;
    text-decoration: none; }
  .footer { background: #f8fafc; padding: 24px 48px;
    font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <h1>${empresa_nombre}</h1>
    <p>Propuesta de servicio de limpieza profesional</p>
    <div class="badge">✨ Propuesta personalizada · ${fecha}</div>
  </div>

  <div class="content">
    <p class="greeting">Estimado/a ${lead_nombre},</p>

    <div class="argumentario">
      ${argumentario.split('\n\n').map((p: string) => `<p>${p.trim()}</p>`).join('')}
    </div>

    <p class="section-title">Resumen de su solicitud</p>
    <div class="resumen-grid">
      <div class="resumen-item">
        <div class="label">Tipo de servicio</div>
        <div class="value">${tipo_servicio || 'Limpieza general'}</div>
      </div>
      <div class="resumen-item">
        <div class="label">Superficie</div>
        <div class="value">${m2} m²</div>
      </div>
      <div class="resumen-item">
        <div class="label">Frecuencia</div>
        <div class="value">${frecuenciaLabel[frecuencia] || frecuencia}</div>
      </div>
      <div class="resumen-item">
        <div class="label">Zona</div>
        <div class="value">${zona || 'A confirmar'}</div>
      </div>
    </div>

    <div class="precio-box">
      <div class="desde">Precio estimado desde</div>
      <div class="precio">${precio_estimado.toFixed(0)}€</div>
      <div class="mes">/ mes</div>
      <div class="nota">Sin permanencia · Precio final según visita técnica</div>
    </div>

    <p class="section-title">Servicios incluidos</p>
    <div class="servicios">
      ${servicios_incluidos.map((s: string) =>
        `<div class="servicio-item"><div class="check">✓</div><span>${s}</span></div>`
      ).join('')}
    </div>

    <div class="cta">
      <h3>¿Le parece bien? Hablamos sin compromiso</h3>
      <p>Confirme su interés y le contactamos en menos de 24 horas para concretar los detalles</p>
      <a href="https://wa.me/34600000000?text=Hola,%20he%20recibido%20la%20propuesta%20y%20me%20interesa" class="btn">
        Confirmar interés por WhatsApp
      </a>
    </div>
  </div>

  <div class="footer">
    <strong>${empresa_nombre}</strong> · Propuesta generada automáticamente por ialimp ·
    Válida 30 días desde ${fecha}
  </div>
</div>
</body>
</html>`
}

// ─── Endpoint principal ────────────────────────────────────────────────────

// POST /api/admin/ia/agente-cotizador
// Body: { lead_id, empresa_id }
export async function POST(req: NextRequest) {
  try {
    const { lead_id, empresa_id } = await req.json()
    if (!lead_id || !empresa_id) {
      return NextResponse.json({ error: 'lead_id y empresa_id requeridos' }, { status: 400 })
    }

    // Obtener datos del lead y empresa en paralelo
    const [leads, empresas, config] = await Promise.all([
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT * FROM leads WHERE id = ${lead_id}::uuid AND empresa_id = ${empresa_id}::uuid
      `),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT nombre, email, telefono FROM empresas WHERE id = ${empresa_id}::uuid
      `),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT servicios, frecuencias FROM cotizador_config
        WHERE empresa_id = ${empresa_id}::uuid AND activo = true LIMIT 1
      `)
    ])

    if (!leads.length)   return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
    if (!empresas.length) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

    const lead    = leads[0]
    const empresa = empresas[0]
    const cfg     = config[0]

    // Extraer servicios incluidos de la config
    const serviciosConfig = cfg?.servicios || []
    const serviciosBase = Array.isArray(serviciosConfig)
      ? serviciosConfig.filter((s: any) => s.activo !== false).map((s: any) => s.nombre || s)
      : []

    // Servicios por defecto si no hay config
    const serviciosIncluidos = serviciosBase.length > 0 ? serviciosBase : [
      'Limpieza completa de todas las habitaciones',
      'Cocina y baños desinfectados',
      'Cambio de ropa de cama y toallas',
      'Control de calidad con checklist digital',
      'Informe fotográfico tras cada limpieza',
      'Comunicación directa con coordinadora',
      'Gestión de incidencias en menos de 2h'
    ]

    // ── Generar argumentario con IA ──────────────────────────────────
    let argumentario = ''
    try {
      const prompt = `Eres el comercial de "${empresa.nombre}", empresa profesional de limpieza en España.
Redacta un argumentario de venta personalizado para el cliente "${lead.nombre}" en 3 párrafos cortos.
Tono: profesional, cercano y convincente. Sin bullets. Solo prosa. Máximo 180 palabras en total.

Párrafo 1: Agradece su interés y personaliza según su perfil (${lead.tipo_servicio || 'limpieza'}, ${lead.m2 || '?'}m², zona ${lead.zona || 'local'}).
Párrafo 2: Destaca 2-3 ventajas concretas: ahorro de tiempo, gestión 100% digital, tranquilidad con informes fotográficos.
Párrafo 3: Cierre breve con llamada a la acción — confirmar interés para agendar visita técnica gratuita.

Precio estimado que ya se ha calculado: ${lead.precio_estimado || '?'}€/mes.
Frecuencia solicitada: ${lead.frecuencia || 'a definir'}.
No menciones competidores. No uses exclamaciones. Responde SOLO con el texto de los 3 párrafos separados por línea en blanco.`

      argumentario = (await aiComplete(prompt)).trim()
    } catch (_) {
      argumentario = `Estimado/a ${lead.nombre}, gracias por confiar en ${empresa.nombre} para el cuidado de su propiedad.\n\nNuestro equipo ofrece un servicio profesional y completamente digitalizado: control de calidad con checklist, informes fotográficos tras cada limpieza y atención directa con su coordinadora personal. Todo para que usted solo tenga que despreocuparse.\n\nNos gustaría concretar los detalles con usted. Confirme su interés y le contactamos en menos de 24 horas para agendar una visita técnica gratuita sin compromiso.`
    }

    // ── Generar HTML de la propuesta ─────────────────────────────────
    const fecha = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    const html  = generarHTMLPropuesta({
      empresa_nombre:      empresa.nombre,
      empresa_email:       empresa.email || '',
      lead_nombre:         lead.nombre,
      lead_email:          lead.email || '',
      zona:                lead.zona || '',
      tipo_servicio:       lead.tipo_servicio || 'Limpieza general',
      m2:                  Number(lead.m2) || 0,
      frecuencia:          lead.frecuencia || 'a definir',
      precio_estimado:     Number(lead.precio_estimado) || 0,
      servicios_incluidos: serviciosIncluidos,
      argumentario,
      fecha
    })

    // ── Guardar propuesta en Storage ──────────────────────────────────
    const storagePath = `propuestas/${empresa_id}/${lead_id}.html`
    const storageUrl  = SUPABASE_URL + '/storage/v1/object/propuestas-leads/' + storagePath

    await fetch(storageUrl, {
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'text/html; charset=utf-8',
        'x-upsert': 'true',
      },
      body: html,
    }).catch(() => { /* storage no crítico */ })

    const propuesta_url = SUPABASE_URL + '/storage/v1/object/public/propuestas-leads/' + storagePath

    // ── Actualizar lead con propuesta generada ────────────────────────
    await prisma.$executeRaw(Prisma.sql`
      UPDATE leads SET
        propuesta_html   = ${html},
        propuesta_url    = ${propuesta_url},
        propuesta_ia_at  = NOW(),
        estado           = CASE WHEN estado = 'nuevo' THEN 'propuesta_enviada' ELSE estado END
      WHERE id = ${lead_id}::uuid
    `)

    // ── Crear alerta para coordinadora ───────────────────────────────
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO alertas (empresa_id, tipo, titulo, descripcion, leida)
      VALUES (
        ${empresa_id}::uuid,
        'propuesta_generada',
        ${`✨ Propuesta: ${lead.nombre}`},
        ${`${lead.precio_estimado ? lead.precio_estimado + '€/mes' : 'precio a confirmar'} · generada automáticamente`},
        false
      )
    `)

    // ── Enviar email si hay credenciales y email del lead ─────────────
    let email_enviado = false
    const t = getTransporter()
    if (lead.email && t) {
      try {
        await t.sendMail({
          from: `"${empresa.nombre}" <${MAIL_FROM}>`,
          to: lead.email,
          subject: `Su propuesta de limpieza profesional — ${empresa.nombre}`,
          html,
          text: `Estimado/a ${lead.nombre}, adjuntamos su propuesta personalizada de ${empresa.nombre}. Precio estimado: ${lead.precio_estimado || '?'}€/mes.`
        })
        await prisma.$executeRaw(Prisma.sql`
          UPDATE leads SET propuesta_email_at = NOW() WHERE id = ${lead_id}::uuid
        `)
        email_enviado = true
      } catch (_) { /* email no crítico */ }
    }

    return NextResponse.json({
      ok: true,
      lead_id,
      propuesta_url,
      email_enviado,
      argumentario_preview: argumentario.slice(0, 120) + '...'
    })

  } catch (e: any) {
    console.error('[agente-cotizador] Error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
