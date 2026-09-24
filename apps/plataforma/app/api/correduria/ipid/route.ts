import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { listarIpidAsegura, retirarIpidAsegura, subirIpidAsegura } from '@/lib/ipid-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * /api/correduria/ipid — fichas IPID por compañía + producto. Reenvía al puerto de asegura.
 *
 *   GET
 *   POST   multipart { compania, producto, fichero }   (actor lo pone el servidor)
 *   DELETE ?id=
 */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const r = await listarIpidAsegura()
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const entrada = await req.formData().catch(() => null)
  const fichero = entrada?.get('fichero')
  if (!entrada || !(fichero instanceof File)) return NextResponse.json({ estado: 'invalida', motivo: 'Falta el PDF.' }, { status: 422 })
  // Se reconstruye el formulario: solo los campos conocidos, y el actor de la sesión el último.
  const form = new FormData()
  form.set('compania', String(entrada.get('compania') ?? ''))
  form.set('producto', String(entrada.get('producto') ?? ''))
  form.set('fichero', fichero)
  form.set('actor', guarda.session.email)
  const r = await subirIpidAsegura(form)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function DELETE(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const r = await retirarIpidAsegura(new URL(req.url).searchParams.get('id') ?? '')
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
