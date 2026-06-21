import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { analizarConvenio } from '@/lib/convenio-agente'

/** Lanza el agente especialista en convenios para la empresa del gestor. */
export async function POST() {
  try {
    const { empresa_id } = await getSesion()
    const r = await analizarConvenio(empresa_id)
    return NextResponse.json(r)
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    throw e
  }
}
