export const dynamic = 'force-dynamic'
export const maxDuration = 120
import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME || ''
const KEY   = process.env.CLOUDINARY_API_KEY || ''
const SEC   = process.env.CLOUDINARY_API_SECRET || ''
const ORIGIN = 'https://www.iarest.es'

async function uploadSlide(buf: Buffer, pid: string): Promise<string> {
  const ts = String(Math.floor(Date.now() / 1000))
  const eager = 'c_pad,w_1080,h_1920,b_rgb:14110E'
  const toSign = `eager=${eager}&overwrite=true&public_id=${pid}&timestamp=${ts}`
  const sig = createHmac('sha1', SEC).update(toSign).digest('hex')
  const B = 'iarestboundary'
  const parts: Buffer[] = []
  for (const [n, v] of [['api_key', KEY], ['timestamp', ts], ['public_id', pid], ['overwrite', 'true'], ['eager', eager], ['signature', sig]])
    parts.push(Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${v}\r\n`))
  parts.push(Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="file"; filename="slide.png"\r\nContent-Type: image/png\r\n\r\n`))
  parts.push(buf)
  parts.push(Buffer.from(`\r\n--${B}--\r\n`))
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, {
    method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${B}` }, body: Buffer.concat(parts),
  })
  const d = await res.json() as { public_id?: string; error?: { message: string } }
  if (d.error) throw new Error(d.error.message)
  return d.public_id!
}

function buildReelUrl(pids: string[]): string {
  const W = 1080, H = 1920, DUR = 3, FADE = 1000
  const kb = `e_zoompan:mode_ofl;maxzoom_1.12;du_${DUR}`
  const fit = `c_fill,w_${W},h_${H}`
  const segs: string[] = [`fl_splice,l_${pids[0]}/${fit}/${kb}/fl_layer_apply,e_transition,du_${DUR}`]
  for (let i = 1; i < pids.length; i++) {
    segs.push(`fl_splice,l_${pids[i]}/${fit}/${kb}/fl_layer_apply,e_fade:${FADE}`)
  }
  const base = `w_${W},h_${H},c_fill,b_rgb:14110E,du_${DUR}`
  return `https://res.cloudinary.com/${CLOUD}/video/upload/${base}/${segs.join('/')}/q_auto,f_mp4/v1/${pids[0]}.mp4`
}

export async function GET(req: NextRequest) {
  if (req.headers.get('x-story-secret') !== process.env.CRON_SECRET)
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const titulo = sp.get('titulo') || 'ia.rest'
  const puntos = [sp.get('p1'), sp.get('p2'), sp.get('p3')].filter(Boolean) as string[]
  const total = puntos.length + 2

  const t = encodeURIComponent(titulo)
  const slideUrls = [`${ORIGIN}/api/ig-img?tipo=slide&num=1&total=${total}&titulo=${t}`]
  puntos.forEach((punto, i) => slideUrls.push(`${ORIGIN}/api/ig-img?tipo=slide&num=${i + 2}&total=${total}&titulo=${t}&punto=${encodeURIComponent(punto)}`))
  slideUrls.push(`${ORIGIN}/api/ig-img?tipo=slide&num=${total}&total=${total}&titulo=${t}`)

  const pids: string[] = []
  for (let i = 0; i < slideUrls.length; i++) {
    const r = await fetch(slideUrls[i])
    if (!r.ok) throw new Error(`Slide ${i + 1} no disponible`)
    const buf = Buffer.from(await r.arrayBuffer())
    pids.push(await uploadSlide(buf, `iarest_reel_${Date.now()}_${i + 1}`))
  }

  const reelUrl = buildReelUrl(pids)
  return NextResponse.json({ ok: true, reelUrl, pids, slides: pids.length })
}
