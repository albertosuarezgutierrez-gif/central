import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { validarPeticion } from '@/lib/informes/validador'
import { ejecutarInforme } from '@/lib/informes/ejecutar'
import { recortarParaVista } from '@/lib/informes/motor'
import { LIMITE_VISTA } from '@/lib/informes/catalogo'

export const runtime = 'nodejs'
export const maxDuration = 60

// Vista previa de un informe. Misma autorización que el resto de /api/admin: sesión del
// responsable (getSesion). El empresa_id sale SOLO de la sesión; si el cliente manda uno,
// el validador (.strict) lo rechaza con 400.
export async function POST(req: Request) {
  try {
    const { empresa_id } = await getSesion()
    const body = await req.json().catch(() => null)
    const v = validarPeticion(body)
    if (!v.ok) return NextResponse.json({ error: 'Petición de informe no válida', errores: v.errores }, { status: 400 })
    const { resultado, cabecera } = await ejecutarInforme(empresa_id, v.peticion)
    return NextResponse.json({ resultado: recortarParaVista(resultado, LIMITE_VISTA), cabecera })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}
