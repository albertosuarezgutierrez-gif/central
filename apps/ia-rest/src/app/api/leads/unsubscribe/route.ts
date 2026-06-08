import { createServerClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const searchParams = req.nextUrl.searchParams
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'Token requerido' }, { status: 400 })
  }

  try {
    // Validar JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET_CRM || 'ia-rest-crm-2026') as {
      lead_id: string
      exp: number
    }

    const leadId = decoded.lead_id

    // Obtener lead para restaurante_id
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, restaurante_id')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
    }

    // Insertar en unsubscribes
    const { error: insertError } = await supabase
      .from('leads_unsubscribes')
      .insert({
        lead_id: leadId,
        restaurante_id: lead.restaurante_id,
        razon: 'no_interesado',
        unsubscribed_at: new Date().toISOString()
      })

    if (insertError && insertError.code !== '23505') {
      // 23505 = unique violation (ya desuscrito antes)
      throw insertError
    }

    return NextResponse.json(
      {
        ok: true,
        mensaje: 'Te has dado de baja. No te enviaremos más emails.'
      },
      { status: 200 }
    )
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
    }
    console.error('Error en unsubscribe:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    )
  }
}
