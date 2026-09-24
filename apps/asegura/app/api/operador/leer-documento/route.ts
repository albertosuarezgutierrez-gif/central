import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { leerPoliza, revisarFichero } from '@/lib/documentos/extraer-poliza'
import { auditado } from '@/lib/auditoria'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST /api/operador/leer-documento — lee una póliza, un recibo o una foto y
 * devuelve SOLO lo que hace falta para abrir una oportunidad: ramo, compañía,
 * número, vencimiento y prima (24/09/2026, Alberto: «que el agente con IA busque
 * los datos que haya; la idea es hacer las cosas lo más rápido posible»).
 *
 * - Misma lectura que `/api/cartera/documentos` (`leerPoliza`), por el puerto de
 *   operador para que plataforma la use con la sesión de Alberto.
 * - **No escribe nada ni guarda el fichero**: el corredor revisa lo leído en el
 *   formulario y es él quien lo guarda.
 * - **No devuelve datos personales** (tomador, DNI, nacimiento, dirección): la
 *   oportunidad no los necesita y viajarían al navegador para nada.
 * - «No se pudo leer» es 422 con motivo, nunca 200 con todo a null: eso se
 *   pintaría como «el documento no trae nada».
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'esperaba un formulario con el fichero' }, { status: 400 })
  }
  const fichero = form.get('fichero')
  if (!(fichero instanceof File)) return NextResponse.json({ error: 'falta el fichero' }, { status: 400 })
  const reparo = revisarFichero({ type: fichero.type, size: fichero.size, name: fichero.name })
  if (reparo) return NextResponse.json({ error: reparo }, { status: 415 })

  const r = await leerPoliza(Buffer.from(await fichero.arrayBuffer()), fichero.type, fichero.name)
  if (r.fase === 'ninguno') return NextResponse.json({ error: r.motivo }, { status: 422 })

  const d = r.datos
  return NextResponse.json({
    leido: true,
    fuente: r.fuente,
    ramo: r.ramo,
    compania: d.compania,
    numeroPoliza: d.numeroPoliza,
    fechaVencimiento: d.fechaVencimiento,
    primaAnual: d.primaAnual,
  })
})
