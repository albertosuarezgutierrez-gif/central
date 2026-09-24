import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { historialClienteAsegura } from '@/lib/cliente-edicion-asegura'

export const dynamic = 'force-dynamic'

/**
 * POST /api/correduria/cliente/nota { clienteId, texto } — añade una nota FECHADA a la ficha
 * (`historial_interno` tipo `nota`, por el puerto de asegura). Las notas se añaden, no se
 * reescriben: la de ayer sigue ahí mañana. Quién la escribe lo pone el servidor.
 */
export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const clienteId = typeof b?.clienteId === 'string' ? b.clienteId.trim() : ''
  const texto = typeof b?.texto === 'string' ? b.texto.trim() : ''
  if (clienteId === '' || texto === '') return NextResponse.json({ estado: 'invalido', motivo: 'Falta el cliente o el texto.' }, { status: 422 })
  const r = await historialClienteAsegura({ clienteId, tipo: 'nota', texto, actor: guarda.session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
