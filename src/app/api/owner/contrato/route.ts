import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// GET /api/owner/contrato?restaurante_id=xxx
// Devuelve la última aceptación del contrato para este restaurante
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const restaurante_id = searchParams.get('restaurante_id')
    if (!restaurante_id) {
      return NextResponse.json({ error: 'Falta restaurante_id' }, { status: 400 })
    }

    // Verificar sesión
    const session = req.headers.get('x-ia-session')
    if (!session) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

    const sb = createServerClient()

    const { data, error } = await sb
      .from('contract_acceptances')
      .select('accepted_at, contract_version, ip_address')
      .eq('restaurante_id', restaurante_id)
      .order('accepted_at', { ascending: false })
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ aceptacion: data ?? null })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
