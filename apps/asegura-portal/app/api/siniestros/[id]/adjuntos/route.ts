import { NextResponse } from 'next/server'

import { MAX_BYTES_DOCUMENTO } from '@central/module-seguros'

import { guardarAdjunto } from '@/lib/adjuntos-parte'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
// Un PDF de 10 MB contra el pooler tarda; el tope de Vercel por defecto no llega.
export const maxDuration = 60

type Ctx = { params: Promise<{ id: string }> }

/**
 * Adjunta UN fichero a un parte de siniestro ya creado.
 *
 * ─── Por qué de uno en uno ───────────────────────────────────────────────────
 * La pantalla llama a esta ruta una vez por fichero. Si el cuarto falla, los
 * tres primeros ya están dentro y se puede decir cuál es el que falta. Un
 * `multipart` con las cuatro fotos y una transacción todo-o-nada pierde las tres
 * buenas por culpa de la cuarta — y esas fotos no se pueden volver a hacer con
 * el coche ya retirado.
 *
 * ─── Y por qué el parte va PRIMERO ───────────────────────────────────────────
 * El `id` de la URL es un parte que YA existe (`POST /api/siniestros`). Nunca al
 * revés: un fichero subido antes que su parte es un fichero huérfano que no ve
 * nadie, ni el cliente ni Alberto.
 *
 * La identidad sale de la cookie y la pertenencia del parte se comprueba en
 * `guardarAdjunto()`: los ids viajan en la URL y no los firma nadie.
 */
export async function POST(req: Request, ctx: Ctx) {
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
    return NextResponse.json({ error: 'cuerpo_invalido', motivo: 'No hemos podido leer el fichero.' }, { status: 400 })
  }

  const fichero = form.get('documento')
  if (!(fichero instanceof File)) {
    return NextResponse.json({ error: 'sin_fichero', motivo: 'No llegó ningún fichero.' }, { status: 400 })
  }

  // El tamaño se corta ANTES de leer el cuerpo entero en memoria. El motivo con
  // las cifras lo pone `revisarDocumento()` dentro de `guardarAdjunto`, que es
  // el mismo texto que ya vio la pantalla antes de subir.
  if (fichero.size > MAX_BYTES_DOCUMENTO) {
    return NextResponse.json(
      {
        error: 'fichero_grande',
        motivo: `«${fichero.name}» pesa ${(fichero.size / 1024 / 1024).toFixed(1)} MB y el máximo son ${MAX_BYTES_DOCUMENTO / 1024 / 1024} MB.`,
      },
      { status: 413 },
    )
  }

  const contenido = Buffer.from(await fichero.arrayBuffer())
  const r = await guardarAdjunto(identidad.id, id, {
    nombre: fichero.name,
    mime: fichero.type,
    contenido,
  })

  // El motivo viaja tal cual: es texto para leer en pantalla, al lado del
  // fichero que ha fallado. Un «error» genérico deja a la persona sin saber si
  // reintentar, si cambiar de fichero o si llamar.
  if (!r.ok) return NextResponse.json({ error: 'no_guardado', motivo: r.motivo }, { status: r.status })

  return NextResponse.json({ adjunto: r.adjunto }, { status: 201 })
}
