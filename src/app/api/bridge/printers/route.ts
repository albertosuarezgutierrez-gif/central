export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Token requerido' }, { status: 401 })

  const supabase = createServerClient()

  const { data: bt } = await supabase
    .from('bridge_tokens')
    .select('local_id')
    .eq('token', token)
    .eq('activo', true)
    .single()

  if (!bt) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

  const { data: impresoras } = await supabase
    .from('impresoras')
    .select('id, nombre, ip_address, port, connection_type, mac_address')
    .eq('local_id', bt.local_id)
    .eq('activa', true)
    .in('connection_type', ['ip_local', 'usb_bridge'])

  return NextResponse.json({
    count: (impresoras ?? []).length,
    impresoras: impresoras ?? [],
  })
}
