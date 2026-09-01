import { NextResponse } from 'next/server'

import { prisma } from '@/lib/db'
import { extraerPoliza } from '@/lib/extraer-poliza'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

const MAX_BYTES = 10 * 1024 * 1024

export async function POST(req: Request) {
  // La identidad SIEMPRE sale de la cookie, nunca del cuerpo de la petición:
  // es lo único que impide que alguien escriba en la bóveda de otro.
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }

  const form = await req.formData()
  const fichero = form.get('documento')
  if (!(fichero instanceof File)) return NextResponse.json({ error: 'sin_fichero' }, { status: 400 })
  if (fichero.size > MAX_BYTES) return NextResponse.json({ error: 'fichero_grande' }, { status: 413 })

  const buffer = Buffer.from(await fichero.arrayBuffer())
  const { datos, fuente } = await extraerPoliza(buffer, fichero.type, fichero.name)

  const poliza = await prisma.portalPolizaDeclarada.create({
    data: {
      identidadId: identidad.id,
      compania: datos.compania,
      numeroPoliza: datos.numeroPoliza,
      ramo: datos.ramo,
      primaAnual: datos.primaAnual,
      fechaVencimiento: datos.fechaVencimiento ? new Date(`${datos.fechaVencimiento}T00:00:00Z`) : null,
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
