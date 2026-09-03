import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'

import { prisma } from '@/lib/db'
import { extraerPoliza } from '@/lib/extraer-poliza'
import { normalizarAlta } from '@/lib/poliza-editable'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

const MAX_BYTES = 10 * 1024 * 1024

/**
 * Alta de una póliza en la bóveda del cliente. Dos caminos, una sola ruta:
 *
 *  - `multipart/form-data` con `documento` → sube un PDF/foto, lo lee la IA y
 *    la fila nace SIN confirmar (los datos los ha adivinado un extractor).
 *  - `application/json` con los campos declarables → alta A MANO, para quien
 *    tiene la póliza en papel o no tiene el PDF. La fila nace confirmada: la
 *    ha escrito la persona con sus ojos.
 *
 * Los dos crean la misma fila (`procedencia: 'declarado'`): que el dato lo
 * aporte el cliente, con o sin papel, no lo convierte en dato verificado.
 */
export async function POST(req: Request) {
  // La identidad SIEMPRE sale de la cookie, nunca del cuerpo de la petición:
  // es lo único que impide que alguien escriba en la bóveda de otro.
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }

  const tipo = req.headers.get('content-type') ?? ''
  if (tipo.includes('application/json')) return altaAMano(req, identidad.id)
  return altaConDocumento(req, identidad.id)
}

async function altaConDocumento(req: Request, identidadId: string) {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 })
  }
  const fichero = form.get('documento')
  if (!(fichero instanceof File)) return NextResponse.json({ error: 'sin_fichero' }, { status: 400 })
  if (fichero.size > MAX_BYTES) return NextResponse.json({ error: 'fichero_grande' }, { status: 413 })

  const buffer = Buffer.from(await fichero.arrayBuffer())
  const { datos, fuente } = await extraerPoliza(buffer, fichero.type, fichero.name)

  const poliza = await prisma.portalPolizaDeclarada.create({
    data: {
      identidadId,
      compania: datos.compania,
      numeroPoliza: datos.numeroPoliza,
      ramo: datos.ramo,
      primaAnual: datos.primaAnual,
      fechaVencimiento: datos.fechaVencimiento ? new Date(`${datos.fechaVencimiento}T00:00:00Z`) : null,
      // Los tres del vehículo, si el documento los traía. `null` es lo normal:
      // una póliza de hogar no tiene matrícula, y una de auto puede no traer el
      // bastidor impreso. Se guardan ya validados por `extraer-poliza.ts` —un
      // bastidor que no cumple la forma llega `null`, porque un VIN mal leído no
      // es un dato incompleto, es OTRO coche.
      matricula: datos.matricula,
      bastidor: datos.bastidor,
      // Medianoche UTC, igual que el vencimiento: la columna es `date` y así el
      // día no se corre según la zona del servidor.
      fechaMatriculacion: datos.fechaMatriculacion
        ? new Date(`${datos.fechaMatriculacion}T00:00:00Z`)
        : null,
      // Siempre `declarado`: lo ha aportado el usuario. Que lo haya leído una IA
      // no lo convierte en dato verificado — al revés, es donde más se inventa.
      procedencia: 'declarado',
      confirmadaPorUsuario: false,
      documentoNombre: fichero.name,
      extraccionBruta: { fuente, datos },
    },
    select: { id: true },
  })

  return NextResponse.json({ id: poliza.id, datos, fuente })
}

async function altaAMano(req: Request, identidadId: string) {
  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 })
  }

  // La MISMA validación que el PATCH (`lib/poliza-editable.ts`): lo que se
  // rechaza al corregir se rechaza al crear. Y exige compañía o número: sin
  // nada que identifique el seguro, la fila es ruido.
  const normalizado = normalizarAlta(cuerpo)
  if (!normalizado.ok) return NextResponse.json({ error: normalizado.error }, { status: 400 })
  const { datos } = normalizado

  const poliza = await prisma.portalPolizaDeclarada.create({
    data: {
      identidadId,
      ...datos,
      // Sigue siendo un dato APORTADO por el cliente, no verificado contra la
      // compañía: `declarado`, igual que si viniera de un PDF.
      procedencia: 'declarado',
      // `true` desde el nacimiento, al contrario que en el alta con documento.
      // `confirmadaPorUsuario` significa una sola cosa: «una persona ha revisado
      // estos datos con sus ojos». En el PDF los adivina un extractor y la
      // persona todavía no los ha mirado; aquí los ha tecleado ella, campo a
      // campo, así que ya están revisados — dejarlo a `false` le pediría que
      // confirmara lo que acaba de escribir.
      confirmadaPorUsuario: true,
      // No hubo documento ni extractor: los dos huecos se declaran, no se
      // rellenan con un nombre de cajón ni con un JSON vacío. `DbNull` es el
      // NULL de SQL (la columna vacía, lo que `IS NULL` encuentra); `JsonNull`
      // guardaría el literal `null` DENTRO del JSON, que pasa todas las guardas
      // de NULL y es otro «no lo sé» disfrazado de valor.
      documentoNombre: null,
      extraccionBruta: Prisma.DbNull,
    },
    select: { id: true },
  })

  return NextResponse.json(
    {
      id: poliza.id,
      datos: {
        ...datos,
        // Columna `date`: se devuelve como `YYYY-MM-DD`, que es lo que la
        // pantalla pinta y lo que come `<input type="date">`.
        fechaVencimiento: datos.fechaVencimiento ? datos.fechaVencimiento.toISOString().slice(0, 10) : null,
      },
    },
    { status: 201 },
  )
}
