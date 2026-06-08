export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ia.rest · GET/POST /api/feedback/[token]
// GET  → info del token (estado, restaurante_nombre, google_review_url)
// POST → guardar valoración; si nota>=4 devuelve google_url para redirigir

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { tgAlert } from '@/lib/telegram'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = createServerClient()

  const { data } = await supabase
    .from('feedback_visita')
    .select('estado, local_id, restaurantes(nombre, google_review_url)')
    .eq('token', token)
    .maybeSingle()

  if (!data) return NextResponse.json({ error: 'Token no válido' }, { status: 404 })

  const rest = data.restaurantes as unknown as { nombre: string; google_review_url: string | null } | null

  return NextResponse.json({
    estado:              data.estado,
    restaurante_nombre:  rest?.nombre ?? '',
    google_review_url:   rest?.google_review_url ?? null,
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = createServerClient()

  const { nota, comentario } = await req.json()
  if (!nota || nota < 1 || nota > 5) return NextResponse.json({ error: 'Nota inválida' }, { status: 400 })

  // Verificar token
  const { data: fb } = await supabase
    .from('feedback_visita')
    .select('id, estado, local_id, restaurantes(nombre, google_review_url, email_contacto)')
    .eq('token', token)
    .maybeSingle()

  if (!fb) return NextResponse.json({ error: 'Token no válido' }, { status: 404 })
  if (fb.estado === 'respondido') return NextResponse.json({ error: 'Ya valorado' }, { status: 409 })

  const rest = fb.restaurantes as unknown as { nombre: string; google_review_url: string | null; email_contacto: string | null } | null

  // Guardar respuesta
  await supabase.from('feedback_visita').update({
    nota,
    comentario: comentario || null,
    estado:     'respondido',
    respondido_at: new Date().toISOString(),
  }).eq('token', token)

  const estrellas = '⭐'.repeat(nota)

  // Alerta privada si nota baja (1-2) → owner antes de publicar
  if (nota <= 2) {
    await tgAlert(
      `⚠️ Valoración baja ${estrellas} en <b>${rest?.nombre ?? 'restaurante'}</b>\n${comentario ? `"${comentario.slice(0,120)}"` : 'Sin comentario'}`,
      'aviso'
    )
  } else {
    await tgAlert(
      `${estrellas} Nueva valoración <b>${nota}/5</b> en ${rest?.nombre ?? 'restaurante'}`,
      'info'
    )
  }

  return NextResponse.json({
    ok: true,
    google_url: nota >= 4 ? (rest?.google_review_url ?? null) : null,
  })
}
