export const dynamic = 'force-dynamic'
export const maxDuration = 120
import { NextRequest, NextResponse } from 'next/server'
import { pickMusicTrack } from '@/lib/instagram-music'
import { pickAmbient } from '@/lib/instagram-reel-assets'

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME || ''
const KEY   = process.env.CLOUDINARY_API_KEY || ''
const SEC   = process.env.CLOUDINARY_API_SECRET || ''
const ORIGIN = process.env.IG_ORIGIN || 'https://www.iarest.es'
const BASE_VIDEO = 'iarest_base_dark'   // clip de color de marca 1080x1920 (ya subido) — lienzo/timeline
const W = 1080, H = 1920, DUR = 3, FADE = 800

// Un segmento del reel: o una imagen (slide de texto / mockup de producto, subida
// a Cloudinary en este run) o un clip de vídeo de ambiente (ya sembrado en Cloudinary).
type Segmento = { kind: 'image' | 'video'; pid: string }

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

// MP4 vertical 1080x1920: concatena (fl_splice) cada segmento sobre el vídeo base.
//   - imagen: c_pad sobre fondo de marca (estático; sin motion para máxima compatibilidad).
//   - vídeo:  c_fill al frame vertical, audio del clip silenciado (no pelea con la música).
//   - crossfade entre segmentos; pista de música opcional recortada a la duración total.
// NOTA: el splice de vídeo (l_video) + l_audio son EMPÍRICOS en Cloudinary; se validan con
// un render real. El motion (e_zoompan) se quitó porque rompía la reproducción del MP4.
function buildReelUrl(segs: Segmento[], audioPid?: string | null): string {
  const parts: string[] = [`w_${W},h_${H},c_fill`]
  segs.forEach((s, i) => {
    const off = i * DUR
    const fade = i === 0 ? '' : `,e_fade:${FADE}`
    if (s.kind === 'video') {
      parts.push(`l_video:${s.pid}/c_fill,w_${W},h_${H},e_volume:mute/fl_splice,du_${DUR}/so_${off},fl_layer_apply${fade}`)
    } else {
      parts.push(`l_${s.pid}/c_pad,w_${W},h_${H},b_rgb:14110E/fl_splice,du_${DUR}/so_${off},fl_layer_apply${fade}`)
    }
  })
  if (audioPid) {
    const total = segs.length * DUR
    parts.push(`l_audio:${audioPid}/du_${total},e_volume:65/fl_layer_apply`)
  }
  return `https://res.cloudinary.com/${CLOUD}/video/upload/${parts.join('/')}/q_auto/${BASE_VIDEO}.mp4`
}

// Construye la URL de una slide de /api/ig-img.
function slideUrl(params: Record<string, string>): string {
  const sp = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v) sp.set(k, v) })
  return `${ORIGIN}/api/ig-img?${sp}`
}

// Genera el Reel y devuelve la URL del MP4 listo para publicar.
// Secuencia (lo que "vende" en hostelería): gancho → producto en acción → ambiente real
// → puntos de valor (intercalando ambiente) → CTA. El ambiente se intercala SOLO si hay
// clips sembrados; si no, el reel es slides + mockup de producto + música.
export async function generarReel(opts: {
  titulo: string
  estilo?: string
  puntos: string[]
  modulo?: string
  audioPid?: string | null
}): Promise<string> {
  const { titulo, estilo = 'editorial', puntos, modulo = '' } = opts
  const audioPid = opts.audioPid !== undefined ? opts.audioPid : pickMusicTrack()
  const total = puntos.length + 2 // portada + puntos + cierre (numeración de slides)
  const m = modulo || ''

  // 1) Slides de imagen a renderizar vía ig-img (portada, mockup producto, puntos, cierre).
  const imageReqs: Array<{ key: string; url: string }> = []
  imageReqs.push({ key: 'portada', url: slideUrl({ tipo: 'slide', estilo, num: '1', total: String(total), titulo, modulo: m }) })
  // Mockup de producto "inventado" por el agente (la app en acción) — credibilidad.
  imageReqs.push({ key: 'producto', url: slideUrl({ tipo: 'producto', estilo, modulo: m }) })
  puntos.forEach((p, i) => imageReqs.push({
    key: `p${i + 1}`,
    url: slideUrl({ tipo: 'slide', estilo, num: String(i + 2), total: String(total), titulo, punto: p, modulo: m }),
  }))
  imageReqs.push({ key: 'cierre', url: slideUrl({ tipo: 'slide', estilo, num: String(total), total: String(total), titulo, modulo: m }) })

  // 2) Renderizar y subir cada slide a Cloudinary.
  const stamp = Date.now()
  const imgPid: Record<string, string> = {}
  for (let i = 0; i < imageReqs.length; i++) {
    const { key, url } = imageReqs[i]
    const r = await fetch(url)
    if (!r.ok) throw new Error(`Slide "${key}" no disponible (${r.status})`)
    const buf = Buffer.from(await r.arrayBuffer())
    imgPid[key] = await uploadSlide(buf, `iarest_reel_${stamp}_${i + 1}`)
  }

  // 3) Clips de ambiente (hasta 2) ya sembrados en Cloudinary; [] si no hay env.
  const amb = pickAmbient(2)

  // 4) Montar la secuencia, intercalando ambiente entre los puntos si lo hay.
  const segs: Segmento[] = []
  segs.push({ kind: 'image', pid: imgPid['portada'] })
  segs.push({ kind: 'image', pid: imgPid['producto'] })
  if (amb[0]) segs.push({ kind: 'video', pid: amb[0] })
  puntos.forEach((_, i) => {
    segs.push({ kind: 'image', pid: imgPid[`p${i + 1}`] })
    if (i === 0 && amb[1]) segs.push({ kind: 'video', pid: amb[1] })
  })
  segs.push({ kind: 'image', pid: imgPid['cierre'] })

  return buildReelUrl(segs, audioPid)
}

export async function GET(req: NextRequest) {
  if (req.headers.get('x-story-secret') !== process.env.CRON_SECRET)
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const sp = req.nextUrl.searchParams
  const titulo = sp.get('titulo') || 'ia.rest'
  const estilo = sp.get('estilo') || 'editorial'
  const modulo = sp.get('modulo') || ''
  const puntos = [sp.get('p1'), sp.get('p2'), sp.get('p3')].filter(Boolean) as string[]
  try {
    const reelUrl = await generarReel({ titulo, estilo, puntos, modulo })
    return NextResponse.json({ ok: true, reelUrl })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
