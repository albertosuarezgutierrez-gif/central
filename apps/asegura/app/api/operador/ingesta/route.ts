import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { leerIngesta } from '@/lib/ingesta'

export const dynamic = 'force-dynamic'

// GET /api/operador/ingesta — salud de la ingesta de CIMA (read-only).
//
// Tres estados, como el resto del puerto: `sin_configurar` (no hay conexión con
// la BD de origen) ≠ `error` (hay conexión y no se pudo leer) ≠ `ok`. Aguas
// abajo, los dos primeros se pintan como «no se ha podido comprobar», NUNCA
// como «la ingesta va bien»: es justo el fallo que este endpoint existe para
// evitar (dos meses de health-check en verde sobre datos que se perdían).
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  return NextResponse.json(await leerIngesta())
}
