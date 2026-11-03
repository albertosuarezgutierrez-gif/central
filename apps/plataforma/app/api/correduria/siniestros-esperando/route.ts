import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { esperandoAsegura } from '@/lib/correduria/siniestro-hilo-red'

export const dynamic = 'force-dynamic'

/** GET — siniestros esperando a la compañía: [{ siniestroId, clienteId, polizaNumero, dias }] (proxy a asegura). */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const r = await esperandoAsegura(guarda.acceso.correduriaId)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
