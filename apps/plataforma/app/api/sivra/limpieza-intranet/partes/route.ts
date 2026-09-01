import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { accesoLimpieza } from '@/lib/limpieza-acceso'
import { avisoEnviado, avisoPermitido, escapeHtml, tgSend, tgSendPhoto } from '@/lib/telegram'
import { PROPS_CALENDARIO } from '@/lib/sivra/constantes'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/
// El cliente comprime a ~1600px JPEG; esto es solo el tope duro (Vercel corta en 4,5 MB igualmente).
const MAX_FOTO_BYTES = 4 * 1024 * 1024

// POST /api/sivra/limpieza-intranet/partes — parte de incidencia de Sique Brilla sobre UNA limpieza
// (property_id + fecha): nota y/o foto. Se registra en la BD y se avisa a Alberto por Telegram
// (best-effort: si Telegram falla, el parte queda guardado igual con avisado_at NULL).
export async function POST(req: NextRequest) {
  const modo = await accesoLimpieza()
  if (!modo) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }
  const propertyId = String(form.get('propertyId') ?? '')
  const fecha = String(form.get('fecha') ?? '')
  const texto = String(form.get('texto') ?? '').trim().slice(0, 2000)
  const foto = form.get('foto')

  const piso = PROPS_CALENDARIO.find(p => p.id === propertyId)
  if (!piso) return NextResponse.json({ error: 'Piso desconocido' }, { status: 400 })
  if (!RE_FECHA.test(fecha)) return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })
  if (!texto && !(foto instanceof File && foto.size > 0)) {
    return NextResponse.json({ error: 'Escribe una nota o adjunta una foto' }, { status: 400 })
  }

  let fotoBuf: Buffer | null = null
  let fotoMime: string | null = null
  if (foto instanceof File && foto.size > 0) {
    if (foto.size > MAX_FOTO_BYTES) {
      return NextResponse.json({ error: 'La foto es demasiado grande' }, { status: 413 })
    }
    fotoBuf = Buffer.from(await foto.arrayBuffer())
    fotoMime = foto.type || 'image/jpeg'
  }

  try {
    const [fila] = await prisma.$queryRaw<Array<{ id: bigint }>>`
      INSERT INTO limpieza_partes (property_id, fecha, texto, foto, foto_mime)
      VALUES (${propertyId}, ${fecha}::date, ${texto || null}, ${fotoBuf}, ${fotoMime})
      RETURNING id
    `

    const [, m, d] = fecha.split('-')
    const caption = [
      `🧹 <b>Parte de la limpieza</b> — <b>${escapeHtml(piso.label)}</b> · limpieza del ${d}/${m}`,
      texto ? `«${escapeHtml(texto)}»` : '(solo foto, sin nota)',
    ].join('\n')
    // Va por el interruptor del panel /telegram (foto incluida, que `tgAviso` no cubre).
    // Silenciado ⇒ `msgId` null ⇒ el parte NO se marca como avisado: es la verdad, no se envió.
    const msgId = !(await avisoPermitido('pisos.limpieza-parte'))
      ? null
      : fotoBuf
        ? await tgSendPhoto({ data: fotoBuf, nombre: `parte_${fecha}.jpg` }, caption)
        : await tgSend(caption)
    if (msgId != null) await avisoEnviado('pisos.limpieza-parte')
    if (msgId != null) {
      await prisma.$executeRaw`UPDATE limpieza_partes SET avisado_at = now() WHERE id = ${fila.id}`
    }

    return NextResponse.json({ ok: true, avisado: msgId != null })
  } catch (err) {
    console.error('[limpieza-intranet/partes]', err)
    return NextResponse.json({ error: 'No se pudo guardar el parte' }, { status: 500 })
  }
}
