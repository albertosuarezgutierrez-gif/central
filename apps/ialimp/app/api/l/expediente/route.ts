import { NextResponse } from 'next/server'
import { getLimpiadoraSession } from '@/lib/limpiadora-auth'
import { carpetasVisibles } from '@central/module-documental'
import { ACTOR_TITULAR, CARPETAS } from '@/lib/carpetas-limpiadora'
import { listarExpediente } from '@/lib/expediente-limpiadora'

// GET — la limpiadora ve su propio expediente (documentos + carpetas visibles).
export async function GET() {
  const ses = await getLimpiadoraSession()
  if (!ses) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const documentos = await listarExpediente(ses.empresa_id, ses.limpiadora_id, ACTOR_TITULAR)
  return NextResponse.json({ carpetas: carpetasVisibles(CARPETAS, ACTOR_TITULAR), documentos })
}
