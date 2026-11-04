// /api/correduria/instagram — los últimos 50 borradores de Instagram de Grupo ASegura y su estado,
// para /correduria → Redes. Solo lectura: se aprueban en Telegram (`asig_*`).
//
// `estado: 'sin_migracion'` / `'error'` ≠ lista vacía: la pantalla tiene que poder decir «no se ha
// podido mirar» en vez de «no hay borradores».
import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { cuentaDelLibro } from '@/lib/correduria/cuenta-libro'
import { listarIg, esSinMigracion } from '@/lib/correduria/instagram-asegura-db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta

  const cuenta = await cuentaDelLibro()
  if (!cuenta.ok) return NextResponse.json({ estado: 'error', motivo: cuenta.motivo })

  try {
    const filas = await listarIg(cuenta.cuentaId, 50)
    return NextResponse.json({
      estado: 'ok',
      borradores: filas.map((f) => ({
        id: f.id, estado: f.estado, plantilla: f.plantilla, tema: f.tema, titulo: f.titulo,
        caption: f.caption, imageUrl: f.image_url, motivo: f.motivo, igPostId: f.ig_post_id,
        creadoAt: f.creado_at, decididoAt: f.decidido_at,
      })),
    })
  } catch (e) {
    if (esSinMigracion(e)) return NextResponse.json({ estado: 'sin_migracion' })
    return NextResponse.json({ estado: 'error', motivo: String(e).slice(0, 160) })
  }
}
