export const dynamic = 'force-dynamic'
export const maxDuration = 120
import { NextRequest, NextResponse } from 'next/server'

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME || ''
const KEY   = process.env.CLOUDINARY_API_KEY || ''
const SEC   = process.env.CLOUDINARY_API_SECRET || ''
const ORIGIN = 'https://www.iarest.es'
const BASE_VIDEO = 'iarest_base_dark'   // clip de color de marca 1080x1920 (ya subido)
const W = 1080, H = 1920, DUR = 3, FADE = 800

// Sube un PNG a Cloudinary con basic auth (validado: la firma HMAC manual da Invalid Signature en esta cuenta)
async function uploadSlide(buf: Buffer, pid: string): Promise<string> {
  const B = 'iarestboundary'
  const ts = String(Math.floor(Date.now() / 1000))
  const auth = 'Basic ' + Buffer.from(`${KEY}:${SEC}`).toString('base64')
  const parts: Buffer[] = []
  for (const [n, v] of [['timestamp', ts], ['public_id', pid], ['overwrite', 'true']])
    parts.push(Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${v}\r\n`))
  parts.push(Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="file"; filename="s.png"\r\nContent-Type: image/png\r\n\r\n`))
  parts.push(buf)
  parts.push(Buffer.from(`\r\n--${B}--\r\n`))
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, {
    method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${B}`, Authorization: auth },
    body: Buffer.concat(parts),
  })
  const d = await res.json() as { public_id?: string; error?: { message: string } }
  if (d.error) throw new Error(`Cloudinary upload: ${d.error.message}`)
  return d.public_id!
}

// MP4 vertical: splice de cada slide (normalizada con c_pad) sobre el vídeo base, con crossfade.
function buildReelUrl(pids: string[]): string {
  const parts: string[] = [`w_${W},h_${H},c_fill`]
  pids.forEach((p, i) => {
    const fade = i === 0 ? '' : `,e_fade:${FADE}`
    parts.push(`l_${p}/c_pad,w_${W},h_${H},b_rgb:14110E/fl_splice,du_${DUR}/so_${i * DUR},fl_layer_apply${fade}`)
  })
  return `https://res.cloudinary.com/${CLOUD}/video/upload/${parts.join('/')}/q_auto/${BASE_VIDEO}.mp4`
}

// Genera el Reel a partir de slides de /api/ig-img y devuelve la URL del MP4 listo para publicar.
export async function generarReel(opts: { titulo: string; estilo?: string; puntos: string[] }): Promise<string> {
  const { titulo, estilo = 'editorial', puntos } = opts
  const total = puntos.length + 2
  const t = encodeURIComponent(titulo)
  const e = encodeURIComponent(estilo)
  const slideUrls = [`${ORIGIN}/api/ig-img?tipo=slide&estilo=${e}&num=1&total=${total}&titulo=${t}`]
  puntos.forEach((p, i) => slideUrls.push(`${ORIGIN}/api/ig-img?tipo=slide&estilo=${e}&num=${i + 2}&total=${total}&titulo=${t}&punto=${encodeURIComponent(p)}`))
  slideUrls.push(`${ORIGIN}/api/ig-img?tipo=slide&estilo=${e}&num=${total}&total=${total}&titulo=${t}`)

  const stamp = Date.now()
  const pids: string[] = []
  for (let i = 0; i < slideUrls.length; i++) {
    const r = await fetch(slideUrls[i])
    if (!r.ok) throw new Error(`Slide ${i + 1} no disponible (${r.status})`)
    const buf = Buffer.from(await r.arrayBuffer())
    pids.push(await uploadSlide(buf, `iarest_reel_${stamp}_${i + 1}`))
  }
  return buildReelUrl(pids)
}

export async function GET(req: NextRequest) {
  if (req.headers.get('x-story-secret') !== process.env.CRON_SECRET)
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sp = req.nextUrl.searchParams
  const titulo = sp.get('titulo') || 'ia.rest'
  const estilo = sp.get('estilo') || 'editorial'
  const puntos = [sp.get('p1'), sp.get('p2'), sp.get('p3')].filter(Boolean) as string[]
  try {
    const reelUrl = await generarReel({ titulo, estilo, puntos })
    return NextResponse.json({ ok: true, reelUrl })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
