import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica, resumenCartera } from '@/lib/cartera'

export const dynamic = 'force-dynamic'

// GET — resumen de la cartera para el cuadro de mando de plataforma (read-only).
// La respuesta conserva los TRES estados de ResumenCartera: quien consume no
// puede confundir «sin conectar» con «cartera vacía».
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ resumen: { estado: 'sin_configurar' } })
    const correduria = await correduriaUnica()
    // BD configurada pero sin fila de correduría: raro de verdad → error visible,
    // nunca un resumen a ceros.
    if (!correduria) return NextResponse.json({ resumen: { estado: 'error' } })
    const resumen = await resumenCartera(correduria.id)
    return NextResponse.json({ correduria: { nombre: correduria.nombre }, resumen })
  } catch {
    return NextResponse.json({ resumen: { estado: 'error' } })
  }
}
