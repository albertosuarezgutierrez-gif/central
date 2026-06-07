import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { token, nombre, dni } = await req.json()
  if (!token || !nombre || !dni) {
    return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Buscar contrato
  const { data: contrato } = await supabase
    .from('evento_contratos')
    .select('id, estado, firmado_at')
    .eq('firma_token', token)
    .single()

  if (!contrato) return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 })
  if (contrato.firmado_at) return NextResponse.json({ error: 'Este contrato ya fue firmado' }, { status: 409 })

  // Obtener IP del cliente
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'desconocida'

  // Registrar firma
  const { error } = await supabase.from('evento_contratos').update({
    estado: 'firmado',
    firmado_nombre: nombre,
    firmado_dni: dni,
    firmado_ip: ip,
    firmado_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', contrato.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Actualizar estado del evento a confirmado si estaba en presupuesto
  const { data: contratoCompleto } = await supabase
    .from('evento_contratos')
    .select('evento_id, local_id')
    .eq('id', contrato.id).single()

  if (contratoCompleto) {
    await supabase.from('eventos')
      .update({ estado: 'confirmado' })
      .eq('id', contratoCompleto.evento_id)
      .in('estado', ['presupuesto', 'nuevo'])
  }

  return NextResponse.json({ ok: true, mensaje: 'Contrato firmado correctamente' })
}
