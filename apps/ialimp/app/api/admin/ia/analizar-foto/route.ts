import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { signCleaningPhoto } from '@/lib/cleaning-photos'
import { nimVision } from '@iarest/core-ai'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY!
const VISION_MODEL   = 'meta/llama-3.2-90b-vision-instruct'
const nimConfig = () => ({ apiKey: NVIDIA_API_KEY, visionModel: VISION_MODEL })

// Tipos de respuesta del agente
interface AnalisisCalidad {
  hay_incidencia: boolean
  tipo: 'suciedad' | 'rotura' | 'desorden' | 'mancha' | 'otro' | 'ninguno'
  severidad: 'baja' | 'media' | 'alta'
  descripcion: string
  accion_recomendada: string
}

async function analizarImagenConIA(imageUrl: string): Promise<AnalisisCalidad> {
  // Descargar imagen desde Supabase Storage como base64.
  // Bucket cleaning-photos es privado -> firmamos; fallback al público + anon mientras siga abierto.
  const signed = await signCleaningPhoto(imageUrl)
  const imgResp = await fetch(signed || imageUrl,
    signed ? {} : { headers: { 'Authorization': 'Bearer ' + SUPABASE_ANON } })
  if (!imgResp.ok) throw new Error('No se pudo descargar la imagen: ' + imgResp.status)

  const buffer     = await imgResp.arrayBuffer()
  const base64     = Buffer.from(buffer).toString('base64')
  const mimeType   = imgResp.headers.get('content-type') || 'image/jpeg'

  const prompt = `Eres un inspector de limpieza profesional con 10 años de experiencia.
Analiza esta foto de un apartamento turístico justo después de una limpieza.
Detecta si hay algún problema visible.

Responde ÚNICAMENTE con un objeto JSON válido, sin markdown, sin explicaciones, sin texto extra:
{
  "hay_incidencia": boolean,
  "tipo": "suciedad|rotura|desorden|mancha|otro|ninguno",
  "severidad": "baja|media|alta",
  "descripcion": "descripción concisa máximo 80 caracteres",
  "accion_recomendada": "acción concisa máximo 100 caracteres"
}

Si no hay ningún problema visible, usa: hay_incidencia=false, tipo="ninguno", severidad="baja".`

  const content = await nimVision(
    nimConfig(), '',
    [{ data: base64, mediaType: mimeType }],
    prompt, 256, { temperature: 0.1 },
  )

  // Limpiar posibles markdown fences
  const clean = content.replace(/```json|```/g, '').trim()

  try {
    return JSON.parse(clean) as AnalisisCalidad
  } catch {
    // Fallback seguro si el JSON falla
    return {
      hay_incidencia: false,
      tipo: 'ninguno',
      severidad: 'baja',
      descripcion: 'Análisis no disponible',
      accion_recomendada: 'Revisar manualmente'
    }
  }
}

async function enviarPushCoordinadora(
  empresa_id: string,
  propiedad: string,
  descripcion: string,
  severidad: string
) {
  try {
    const VAPID_PUBLIC  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
    const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || ''
    if (!VAPID_PRIVATE) return

    // Push a todos los admin/coordinadores de la empresa (sin limpiadora_id)
    const subs = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT endpoint, p256dh, auth_key
      FROM push_subscriptions
      WHERE empresa_id = ${empresa_id}::uuid
        AND limpiadora_id IS NULL
    `)
    if (!subs.length) return

    const webpush = (await import('web-push')).default
    webpush.setVapidDetails('mailto:hola@ialimp.com', VAPID_PUBLIC, VAPID_PRIVATE)

    const emoji = severidad === 'alta' ? '🚨' : severidad === 'media' ? '⚠️' : '📸'

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          JSON.stringify({
            title: emoji + ' Incidencia detectada — ' + severidad.toUpperCase(),
            body: propiedad + ': ' + descripcion,
            icon: '/icon-192.png',
            badge: '/icon-192.png'
          })
        )
      } catch (e: any) {
        if (e.statusCode === 410) {
          await prisma.$executeRaw(Prisma.sql`
            DELETE FROM push_subscriptions WHERE endpoint = ${sub.endpoint}
          `)
        }
      }
    }
  } catch (_) { /* push no crítico */ }
}

// POST /api/admin/ia/analizar-foto
// Body: { foto_url, session_id, empresa_id, propiedad_id?, property_name? }
// Llamado automáticamente desde upload-photo tras subir la imagen
export async function POST(req: NextRequest) {
  try {
    // Ruta INTERNA (la llama upload-photo server-to-server). Exigir CRON_SECRET
    // evita que un admin la invoque con el empresa_id de otra empresa (IDOR).
    const secret = process.env.CRON_SECRET
    if (!secret || req.headers.get('authorization') !== 'Bearer ' + secret) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { foto_url, session_id, empresa_id, propiedad_id, property_name } = await req.json()

    if (!foto_url)    return NextResponse.json({ error: 'foto_url requerida' }, { status: 400 })
    if (!session_id)  return NextResponse.json({ error: 'session_id requerido' }, { status: 400 })
    if (!empresa_id)  return NextResponse.json({ error: 'empresa_id requerido' }, { status: 400 })
    if (!NVIDIA_API_KEY) return NextResponse.json({ error: 'NVIDIA_API_KEY no configurada' }, { status: 500 })

    // Analizar con IA visión
    const analisis = await analizarImagenConIA(foto_url)

    // Registrar el análisis en la tabla de fotos / checklist (auditoría)
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO foto_analisis (
        empresa_id, session_id, foto_url,
        hay_incidencia, tipo_incidencia, severidad,
        descripcion, accion_recomendada, analizado_at
      ) VALUES (
        ${empresa_id}::uuid,
        ${session_id}::uuid,
        ${foto_url},
        ${analisis.hay_incidencia},
        ${analisis.tipo},
        ${analisis.severidad},
        ${analisis.descripcion},
        ${analisis.accion_recomendada},
        NOW()
      )
      ON CONFLICT DO NOTHING
    `)

    if (analisis.hay_incidencia) {
      // Crear queja automática
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO quejas (
          empresa_id, sesion_id, propiedad_id,
          descripcion, categoria, estado,
          origen, foto_url, severidad
        ) VALUES (
          ${empresa_id}::uuid,
          ${session_id}::uuid,
          ${propiedad_id ? propiedad_id : null}::uuid,
          ${analisis.descripcion},
          ${analisis.tipo},
          'pendiente',
          'ia_foto',
          ${foto_url},
          ${analisis.severidad}
        )
      `)

      // Crear alerta
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO alertas (empresa_id, tipo, titulo, descripcion, leida)
        VALUES (
          ${empresa_id}::uuid,
          'incidencia_foto_ia',
          ${`[IA] ${analisis.severidad.toUpperCase()}: ${analisis.tipo} en ${property_name || 'propiedad'}`},
          ${`${analisis.descripcion} · ${analisis.accion_recomendada}`},
          false
        )
      `)

      // Push a coordinadora
      await enviarPushCoordinadora(
        empresa_id,
        property_name || 'Propiedad',
        analisis.descripcion,
        analisis.severidad
      )
    }

    return NextResponse.json({
      ok: true,
      analisis,
      incidencia_creada: analisis.hay_incidencia
    })

  } catch (e: any) {
    console.error('[analizar-foto] Error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
