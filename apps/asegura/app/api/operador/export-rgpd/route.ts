import { NextResponse } from 'next/server'

import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { exportRgpdDeIdentidad } from '@/lib/export-rgpd'

export const dynamic = 'force-dynamic'

// GET /api/operador/export-rgpd?identidad=<uuid>
//
// El paquete del **derecho de acceso (art. 15 RGPD)** y de **portabilidad
// (art. 20)** de una persona: sus datos del portal, su ficha y pólizas de la
// cartera, y —esto es la mitad del art. 15— los fines, destinatarios, plazos,
// origen y derechos que tienen que acompañarlos.
//
// 🚨 Este puerto NO entrega nada al interesado. Habla con `plataforma`, que es
// donde Alberto trabaja la correduría: él genera el paquete y él lo envía, con
// el plazo de un mes que da el art. 12.3 y habiendo comprobado quién lo pide.
// Un endpoint que soltara el paquete a quien tuviera una sesión del portal
// convertiría un secuestro de sesión en una fuga de todo de golpe.
//
// Cuatro estados, como el resto de puertos: `sin_configurar` (la cartera no
// está conectada) · `no_encontrado` (se miró y esa identidad no existe) ·
// `error` (no se ha podido mirar) · `ok`. Y dentro del `ok`, el propio paquete
// dice si está **completo**: si alguna categoría no se pudo consultar viaja
// `completo: false`, porque un apartado que falta y uno vacío se leen igual.
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const identidad = (new URL(req.url).searchParams.get('identidad') ?? '').trim()
  if (identidad === '') return NextResponse.json({ estado: 'error' }, { status: 400 })

  try {
    const r = await exportRgpdDeIdentidad(identidad)
    if (r.estado === 'no_encontrado') return NextResponse.json(r, { status: 404 })
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/export-rgpd', e) })
  }
}
