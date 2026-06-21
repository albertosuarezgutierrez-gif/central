export const dynamic = 'force-dynamic'
export const maxDuration = 120
import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
const CLOUD = process.env.CLOUDINARY_CLOUD_NAME||''
const KEY   = process.env.CLOUDINARY_API_KEY||''
const SEC   = process.env.CLOUDINARY_API_SECRET||''
async function uploadCld(buf: Buffer, pid: string): Promise<string> {
  const ts = String(Math.floor(Date.now()/1000))
  const sig = createHmac('sha1',SEC).update(`overwrite=true&public_id=${pid}&timestamp=${ts}`).digest('hex')
  const B = 'iarestboundary'
  const parts: Buffer[] = []
  for (const [n,v] of [['api_key',KEY],['timestamp',ts],['public_id',pid],['overwrite','true'],['signature',sig]])
    parts.push(Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${v}\r\n`))
  parts.push(Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="file"; filename="slide.png"\r\nContent-Type: image/png\r\n\r\n`))
  parts.push(buf)
  parts.push(Buffer.from(`\r\n--${B}--\r\n`))
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, {
    method:'POST', headers:{'Content-Type':`multipart/form-data; boundary=${B}`}, body: Buffer.concat(parts),
  })
  const d = await res.json() as { public_id?: string; error?: { message: string } }
  if (d.error) throw new Error(d.error.message)
  return d.public_id!
}
export async function GET(req: NextRequest) {
  if (req.headers.get('x-story-secret') !== process.env.CRON_SECRET) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const BASE = 'https://www.iarest.es/api/ig-img'
  const titulo = encodeURIComponent('VeriFactu para restaurantes guia completa 2026')
  const SLIDES = [
    `${BASE}?tipo=slide&num=1&total=5&titulo=${titulo}`,
    `${BASE}?tipo=slide&num=2&total=5&titulo=${titulo}&punto=${encodeURIComponent('Desde enero 2026 las sociedades emiten facturas con hash SHA256')}`,
    `${BASE}?tipo=slide&num=3&total=5&titulo=${titulo}&punto=${encodeURIComponent('Si borras una factura Hacienda detecta que la cadena esta rota')}`,
    `${BASE}?tipo=slide&num=4&total=5&titulo=${titulo}&punto=${encodeURIComponent('En ia.rest el camarero cobra y la factura VeriFactu se genera sola')}`,
    `${BASE}?tipo=slide&num=5&total=5&titulo=${titulo}`,
  ]
  const pids: string[] = []
  for (let i=0; i<SLIDES.length; i++) {
    const res = await fetch(SLIDES[i])
    if (!res.ok) throw new Error(`Slide ${i+1} no disponible`)
    const buf = Buffer.from(await res.arrayBuffer())
    const pid = await uploadCld(buf, `iarest_slide_${i+1}`)
    pids.push(pid)
  }
  const videoUrl = `https://res.cloudinary.com/${CLOUD}/video/upload/fl_animated,dl_2500/${pids.join(',')}.gif`
  const slide1 = `https://res.cloudinary.com/${CLOUD}/image/upload/${pids[0]}.png`
  return NextResponse.json({ ok: true, pids, videoUrl, slide1 })
}
