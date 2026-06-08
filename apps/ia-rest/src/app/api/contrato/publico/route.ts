import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Token requerido' }, { status: 400 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('evento_contratos')
    .select('*, eventos(cliente_nombre, tipo, restaurantes(nombre,nif,direccion,ciudad,telefono))')
    .eq('firma_token', token)
    .neq('estado', 'cancelado')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Contrato no encontrado o expirado' }, { status: 404 })
  return NextResponse.json({ contrato: data })
}
