export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ia.rest · GET /api/propinas/[token]
// Info pública de la propina: restaurante, camarero, estado, opciones importe

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = createServerClient()

  const { data } = await supabase
    .from('propinas')
    .select(`
      estado, local_id,
      restaurantes(nombre, propinas_opciones_eur),
      turno_id,
      comanda_id,
      comandas(camarero_id, personal(nombre))
    `)
    .eq('token', token)
    .maybeSingle()

  if (!data) return NextResponse.json({ error: 'Token no válido' }, { status: 404 })

  const rest = data.restaurantes as unknown as { nombre: string; propinas_opciones_eur: number[] | null } | null
  const camarero = (data.comandas as unknown as { camarero_id: string; personal: { nombre: string } | null } | null)?.personal

  return NextResponse.json({
    estado:             data.estado,
    restaurante_nombre: rest?.nombre ?? '',
    camarero_nombre:    camarero?.nombre ?? null,
    opciones:           rest?.propinas_opciones_eur ?? [1, 2, 3, 5],
  })
}
