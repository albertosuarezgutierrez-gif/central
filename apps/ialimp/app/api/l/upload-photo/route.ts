import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getLimpiadoraSession } from '@/lib/limpiadora-auth'
import { getSession } from '@/lib/tenant'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const BUCKET        = 'cleaning-photos'
const APP_URL       = process.env.NEXTAUTH_URL || 'https://app.ialimp.es'

// Items que NO se analizan (fotos de referencia, no de estado real)
const EXCLUIR_ANALISIS = ['referencia', 'ref', 'ejemplo', 'muestra']

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Solo alfanumérico/-/_ en los segmentos que van a la ruta de Storage (evita
// path traversal: item_id="../.." escaparía a otra sesión/bucket).
const safeSeg = (s: string) => (s || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)

export async function POST(req: NextRequest) {
  try {
    // Auth: la ruta está exenta en el middleware, así que validamos aquí.
    // La llaman la limpiadora (cookie limpiadora_token) y el admin (ialimp_session).
    const ls = await getLimpiadoraSession()
    const adminSess = ls ? null : await getSession()
    const empresaSesion = ls?.empresa_id || adminSess?.empresa_id
    if (!empresaSesion) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const form       = await req.formData()
    const file       = form.get('file') as File | null
    // /l envía 'sesion_id'; aceptamos ambos por compatibilidad
    const session_id = (((form.get('session_id') as string) || (form.get('sesion_id') as string)) || '').trim()
    const item_id    = safeSeg((form.get('item_id') as string) || (form.get('tipo') as string) || 'foto')
    const slot       = safeSeg((form.get('slot') as string) || '1')

    if (!file)                     return NextResponse.json({ error: 'No file' },             { status: 400 })
    if (!UUID_RE.test(session_id)) return NextResponse.json({ error: 'session_id inválido' }, { status: 400 })
    if (!item_id || !slot)         return NextResponse.json({ error: 'item/slot inválido' },  { status: 400 })
    if (!(file.type || '').startsWith('image/'))
      return NextResponse.json({ error: 'Solo se permiten imágenes' }, { status: 400 })

    const bytes  = await file.arrayBuffer()
    const sizeMB = bytes.byteLength / (1024 * 1024)
    if (sizeMB > 10) return NextResponse.json({ error: 'Foto demasiado grande (máx 10MB)' }, { status: 400 })

    // La sesión debe existir y ser de la empresa del que sube (frontera multi-tenant).
    const sesionData = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT empresa_id::text AS empresa_id, propiedad_id::text AS propiedad_id, property_name
      FROM cleaning_sessions
      WHERE id = ${session_id}::uuid
      LIMIT 1
    `)
    if (!sesionData.length || sesionData[0].empresa_id !== empresaSesion) {
      return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
    }

    const path      = 'sessions/' + session_id + '/' + item_id + '_' + slot + '.jpg'
    const uploadUrl = SUPABASE_URL + '/storage/v1/object/' + BUCKET + '/' + path

    const resp = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + SUPABASE_ANON,
        'Content-Type': file.type || 'image/jpeg',
        'x-upsert': 'true',
        'Cache-Control': 'max-age=432000',
      },
      body: bytes,
    })

    if (!resp.ok) {
      const err = await resp.text()
      return NextResponse.json({ error: 'Storage error ' + resp.status + ': ' + err }, { status: 500 })
    }

    const publicUrl = SUPABASE_URL + '/storage/v1/object/public/' + BUCKET + '/' + path

    // Disparar agentes IA en background para TODAS las fotos excepto las marcadas como referencia
    const esReferencia = EXCLUIR_ANALISIS.some(ex => item_id.toLowerCase().includes(ex))

    if (!esReferencia && process.env.NVIDIA_API_KEY) {
      const { empresa_id, propiedad_id, property_name } = sesionData[0]

      // Auth interna: el middleware exime las llamadas con Bearer CRON_SECRET
      const INTERNAL_AUTH = 'Bearer ' + (process.env.CRON_SECRET || '')

      // 1) calidad-fotos (detección de incidencias) — fire-and-forget
      fetch(APP_URL + '/api/admin/ia/analizar-foto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': INTERNAL_AUTH },
        body: JSON.stringify({ foto_url: publicUrl, session_id, empresa_id, propiedad_id, property_name })
      }).catch(() => {})

      // 2) comparación con la foto OBJETIVO del protocolo, si existe para este item — fire-and-forget
      try {
        const ref = await prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT pf.url, pf.caption, pf.estancia
          FROM protocolos p
          JOIN protocolo_fotos pf
            ON pf.protocolo_id = p.id AND pf.categoria = 'objetivo' AND pf.item_key = ${item_id}
          WHERE p.propiedad_id = ${propiedad_id}::uuid AND p.activo
          LIMIT 1
        `)
        if (ref.length > 0) {
          fetch(APP_URL + '/api/admin/ia/comparar-foto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': INTERNAL_AUTH },
            body: JSON.stringify({
              referencia_url: ref[0].url,
              foto_url: publicUrl,
              contexto: ref[0].caption || ref[0].estancia || 'el estado esperado',
              empresa_id,
              property_name
            })
          }).catch(() => {})
        }
      } catch (_) { /* comparación no crítica */ }
    }

    return NextResponse.json({ url: publicUrl, size_kb: Math.round(bytes.byteLength / 1024) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
