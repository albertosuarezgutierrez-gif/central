// Genera con IA el cuerpo de un correo de la campaña. No guarda: el front lo
// mete en el editor para revisarlo antes de guardar.
import { NextRequest, NextResponse } from 'next/server'
import { isSuperadmin } from '@/lib/tenant'
import { aiGenerarCuerpo } from '@/lib/mailing'

export async function POST(req: NextRequest) {
  try {
    if (!await isSuperadmin()) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    const b = await req.json().catch(() => ({}))
    const cuerpo = await aiGenerarCuerpo(String(b?.brief || ''))
    return NextResponse.json({ cuerpo_html: cuerpo })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
