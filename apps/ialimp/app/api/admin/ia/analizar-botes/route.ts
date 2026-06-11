import { NextRequest, NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { nimVision } from '@central/core-ai'

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY!
const VISION_MODEL   = 'meta/llama-3.2-90b-vision-instruct'
const nimConfig = () => ({ apiKey: NVIDIA_API_KEY, visionModel: VISION_MODEL })

// POST /api/admin/ia/analizar-botes
// Recibe foto de los botes del kit y estima el nivel de cada producto
export async function POST(req: NextRequest) {
  try {
    const empresa_id = await requireEmpresaId()
    const { imagen_base64, media_type, limpiadora_id, session_id } = await req.json()
    if (!imagen_base64 || !limpiadora_id) return NextResponse.json({ error: 'imagen y limpiadora_id requeridos' }, { status: 400 })

    // Cargar kit de la limpiadora para el contexto del prompt
    const kit = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT k.id AS kit_id, ps.nombre, ps.unidad, k.nivel_actual AS nivel_previo, k.sesiones_desde_repo
      FROM kits_limpiadoras k
      JOIN productos_stock ps ON ps.id = k.producto_id
      WHERE k.limpiadora_id = ${limpiadora_id}::uuid
        AND k.empresa_id = ${empresa_id}::uuid
        AND k.activo = true
      ORDER BY ps.categoria, ps.nombre
    `)

    const kitStr = kit.map(k =>
      `- "${k.nombre}" (${k.unidad}): nivel previo ${k.nivel_previo ?? '?'}%, ${k.sesiones_desde_repo} sesiones desde reposición`
    ).join('\n')

    const prompt = `You are an AI assistant for a professional cleaning company in Spain.
Analyze this photo of cleaning product bottles/containers.

The cleaner's current kit contains:
${kitStr}

For each product you can identify in the photo, estimate the fill level as a percentage (0=empty, 100=full).
Look for: liquid level visible through translucent containers, how full spray bottles appear, product remaining.

Return ONLY a valid JSON array, no markdown:
[
  {"nombre": "product name matching kit", "nivel_estimado": 75, "confianza": "alta|media|baja", "notas": "optional observation"}
]

Rules:
- Only include products you can actually see in the photo
- nivel_estimado: integer 0-100
- confianza alta = clearly visible, media = partially visible, baja = estimated
- If a bottle is clearly new/full = 95-100%, clearly almost empty = 5-10%`

    const raw = await nimVision(
      nimConfig(), '',
      [{ data: imagen_base64, mediaType: media_type || 'image/jpeg' }],
      prompt, 600, { temperature: 0.05 },
    )
    const content = raw.replace(/```json|```/g, '').trim()

    let niveles: any[] = []
    try {
      const start = content.indexOf('['); const end = content.lastIndexOf(']') + 1
      niveles = JSON.parse(content.slice(start, end))
    } catch { niveles = [] }

    // Guardar niveles en kits_limpiadoras + foto
    const foto_url = `data:${media_type || 'image/jpeg'};base64,${imagen_base64.slice(0, 50)}...` // Solo referencia
    for (const nivel of niveles) {
      // Match por nombre aproximado
      const kitItem = kit.find(k =>
        k.nombre.toLowerCase().includes(nivel.nombre.toLowerCase()) ||
        nivel.nombre.toLowerCase().includes(k.nombre.toLowerCase())
      )
      if (!kitItem || nivel.nivel_estimado === undefined) continue

      await prisma.$executeRaw(Prisma.sql`
        UPDATE kits_limpiadoras
        SET nivel_actual = ${Number(nivel.nivel_estimado)},
            nivel_fecha  = now(),
            updated_at   = now()
        WHERE id = ${kitItem.kit_id}::uuid
      `)
    }

    // Si viene session_id, guardar referencia en cleaning_sessions
    if (session_id) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE cleaning_sessions
        SET foto_botes_url = ${`analizado_ia_${new Date().toISOString()}`}
        WHERE id = ${session_id}::uuid
      `).catch(() => {}) // campo puede no existir aún — fail silencioso
    }

    return NextResponse.json({
      ok: true,
      niveles,
      productos_actualizados: niveles.filter(n => n.nivel_estimado !== undefined).length,
    })
  } catch (e: any) {
    console.error('[analizar-botes]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
