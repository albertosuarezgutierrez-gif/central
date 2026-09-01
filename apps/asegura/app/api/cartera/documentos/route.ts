import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { requireSession } from '@/lib/session'
import { leerPolizaAuto, revisarFichero } from '@/lib/documentos/extraer-auto'
import { camposLeidos, seLeyoAlgoAuto } from '@central/module-seguros'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Leer un PDF grande y esperar al modelo pasa de los 10 s por defecto.
export const maxDuration = 120

/**
 * Sube una póliza y devuelve lo que el agente ha leído.
 *
 * 🚨 **Esta ruta NO gasta cotizaciones.** Lee un documento; el precio se pide
 * aparte y con su propio botón. Se separan a propósito: leer es barato y se
 * puede repetir, cotizar cuesta 0,50€ y no.
 *
 * ─── Lo que esta ruta NO hace, y es deliberado ──────────────────────────────
 * 1. **No escribe en la cartera.** La conexión a la base real es SELECT-only
 *    (rol `central_asegura`), y así debe seguir mientras el traspaso no esté
 *    cerrado: escribir en la base de Manuel desde aquí es exactamente lo que no
 *    queremos. Lo leído se devuelve para revisar y para rellenar la cotización.
 * 2. **No guarda el fichero.** Falta decidir dónde y cuánto tiempo se conservan
 *    documentos con DNI y matrícula dentro, y a un lead sin póliza hoy no se le
 *    puede adjuntar nada (`cliente_documentos` no existe). Guardar PII antes de
 *    haber decidido su ciclo de vida es peor que no guardarla.
 *    Sí se devuelve el **hash** del contenido, que permite reconocer un
 *    documento repetido sin conservarlo.
 */
export async function POST(req: Request) {
  await requireSession()

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'esperaba un formulario con el fichero' }, { status: 400 })
  }

  const fichero = form.get('fichero')
  if (!(fichero instanceof File)) {
    return NextResponse.json({ error: 'falta el fichero' }, { status: 400 })
  }

  // Se revisa ANTES de leer nada: rechazar aquí ahorra el viaje entero.
  const reparo = revisarFichero({ type: fichero.type, size: fichero.size, name: fichero.name })
  if (reparo) return NextResponse.json({ error: reparo }, { status: 415 })

  const buffer = Buffer.from(await fichero.arrayBuffer())
  const hash = createHash('sha256').update(buffer).digest('hex')

  const r = await leerPolizaAuto(buffer, fichero.type, fichero.name)

  // 🚨 «No se pudo leer» NO se devuelve como 200 con todo a null: eso se
  // pintaría como «esta póliza no tiene datos», que es otra cosa.
  if (r.fuente === 'none') {
    return NextResponse.json(
      { error: r.motivo ?? 'No se ha podido leer el documento.', leido: false, hash },
      { status: 422 },
    )
  }

  return NextResponse.json({
    leido: true,
    fuente: r.fuente,
    hash,
    nombre: fichero.name,
    datos: r.datos,
    campos: camposLeidos(r.datos),
    // `true` con cero campos es posible: el modelo respondió pero no encontró
    // nada. Es distinto de no haber podido mirar, y la pantalla lo dice distinto.
    algoLeido: seLeyoAlgoAuto(r.datos),
    // La procedencia viaja con el dato desde el primer momento, para que nadie
    // aguas abajo tenga que acordarse de ponerla.
    procedencia: 'documento' as const,
  })
}
