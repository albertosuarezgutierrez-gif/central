export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

const supa = () => createServerClient()

// POST /api/sugerencias — cualquier usuario autenticado envía una sugerencia.
// La lectura/gestión (GET/PATCH, solo super_admin) vive en /api/super/sugerencias,
// cubierta por el middleware shield.
export async function POST(req: NextRequest) {
  try {
    // Sesión FIRMADA: rol / restaurante_id / id se guardan en BD, deben ser de confianza
    const session = getSession(req)
    if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

    const body = await req.json()

    const { categoria, texto } = body
    if (!texto || texto.trim().length < 5) {
      return NextResponse.json({ error: 'El texto debe tener al menos 5 caracteres' }, { status: 400 })
    }
    if (!['bug', 'mejora', 'idea', 'urgente'].includes(categoria)) {
      return NextResponse.json({ error: 'Categoría inválida' }, { status: 400 })
    }

    const db = supa()
    const { data, error } = await db
      .from('sugerencias')
      .insert({
        local_id: session.restaurante_id || null,
        camarero_id: session.id || null,
        rol: session.rol,
        nombre_usuario: session.nombre,
        categoria,
        texto: texto.trim(),
      })
      .select('id')
      .single()

    if (error) throw error
    return NextResponse.json({ ok: true, id: data.id })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
