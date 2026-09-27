import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'

import { avisarPolizaDeclaradaDesdeAlta } from '@/lib/aviso-poliza-declarada'
import { prisma } from '@/lib/db'
import { extraerPoliza } from '@/lib/extraer-poliza'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

const MAX_BYTES = 10 * 1024 * 1024

/**
 * Reintenta leer un PDF protegido con la contraseña que la persona acaba de
 * escribir (Alberto, 19/09/2026: en vez de pedirle que «quite la protección»
 * —algo que la mayoría no sabe hacer— se le ofrece escribir la contraseña).
 *
 * El fichero viaja OTRA VEZ, completo: esta app no guarda los bytes del PDF
 * (solo el nombre; el documento en sí ya se archivó en la primera subida,
 * vía el puente a `apps/asegura`), así que no hay nada que reabrir en el
 * servidor sin que el navegador lo vuelva a mandar.
 *
 * Mismo aislamiento que el PATCH de esta misma póliza: `updateMany` filtrando
 * por `id` Y `identidadId`, 404 tanto si no existe como si es de otro — un
 * 403 confirmaría que la póliza existe.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }

  const { id } = await ctx.params

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 })
  }
  const fichero = form.get('documento')
  if (!(fichero instanceof File)) return NextResponse.json({ error: 'sin_fichero' }, { status: 400 })
  if (fichero.size > MAX_BYTES) return NextResponse.json({ error: 'fichero_grande' }, { status: 413 })

  const contrasenaCampo = form.get('contrasena')
  if (typeof contrasenaCampo !== 'string' || contrasenaCampo === '') {
    return NextResponse.json({ error: 'sin_contrasena' }, { status: 400 })
  }

  // La misma comprobación que el PATCH: existe Y es tuya, en la misma consulta.
  const actual = await prisma.portalPolizaDeclarada.findFirst({
    where: { id, identidadId: identidad.id },
    select: { id: true },
  })
  if (!actual) return NextResponse.json({ error: 'no_encontrada' }, { status: 404 })

  const buffer = Buffer.from(await fichero.arrayBuffer())
  const { datos, fuente, camposRamo, motivo } = await extraerPoliza(
    buffer,
    fichero.type,
    fichero.name,
    contrasenaCampo,
  )

  // 🚨 Si esta pasada tampoco ha leído nada (contraseña otra vez incorrecta, PDF
  // corrupto…), NO se toca la fila. `datos` vendría con todos los campos a
  // `null` — escribirlo borraría cualquier corrección manual que la persona ya
  // hubiera hecho por PATCH mientras el documento seguía sin leerse. Se
  // devuelve el motivo para que la pantalla lo diga, sin tocar la BD.
  if (fuente === 'none') {
    return NextResponse.json({ id, datos, fuente, camposRamo, motivo })
  }

  // Mismas columnas que el alta original: un reintento que SÍ lee el
  // documento tiene que dejar la fila exactamente como habría quedado si la
  // contraseña se hubiera sabido desde el principio.
  const { count } = await prisma.portalPolizaDeclarada.updateMany({
    where: { id, identidadId: identidad.id },
    data: {
      compania: datos.compania,
      numeroPoliza: datos.numeroPoliza,
      ramo: datos.ramo,
      primaAnual: datos.primaAnual,
      fechaVencimiento: datos.fechaVencimiento ? new Date(`${datos.fechaVencimiento}T00:00:00Z`) : null,
      matricula: datos.matricula,
      bastidor: datos.bastidor,
      fechaMatriculacion: datos.fechaMatriculacion
        ? new Date(`${datos.fechaMatriculacion}T00:00:00Z`)
        : null,
      referenciaCatastral: datos.referenciaCatastral,
      datosRamo: datos.datosRamo ?? Prisma.DbNull,
      datosRamoOrigen: datos.datosRamoOrigen ?? Prisma.DbNull,
      documentoNombre: fichero.name,
      extraccionBruta: { fuente, camposRamo, datos, reintento: true },
      actualizadaEn: new Date(),
    },
  })
  if (count === 0) return NextResponse.json({ error: 'no_encontrada' }, { status: 404 })

  // Best-effort: `fuente === 'none'` ya ha vuelto arriba, así que aquí siempre
  // se ha leído algo — Alberto se entera con el dato real en vez de con la
  // fila vacía que vio en la subida original.
  void avisarPolizaDeclaradaDesdeAlta({
    identidadId: identidad.id,
    compania: datos.compania,
    ramo: datos.ramo,
    numeroPoliza: datos.numeroPoliza,
    fechaVencimiento: datos.fechaVencimiento,
  })

  return NextResponse.json({ id, datos, fuente, camposRamo, motivo })
}
