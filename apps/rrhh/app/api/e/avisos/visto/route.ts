import { NextResponse } from 'next/server'
import { getSesionEmpleado } from '@/lib/empleado-tenant'
import { AuthError } from '@/lib/tenant'
import { marcarDocumentoVisto } from '@/lib/avisos'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** El empleado abre un documento SUYO → marca sus avisos como vistos (y la primera apertura). */
export async function POST(req: Request) {
  try {
    const { empleado_id, empresa_id } = await getSesionEmpleado()
    // sendBeacon manda text/plain: se lee como texto y se parsea.
    const body = await req.text().then(t => { try { return JSON.parse(t) } catch { return {} } })
    const docId = body?.documento_id
    if (typeof docId !== 'string' || !UUID.test(docId)) return NextResponse.json({ error: 'Documento no válido' }, { status: 400 })
    const ok = await marcarDocumentoVisto(empresa_id, empleado_id, docId)
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}
