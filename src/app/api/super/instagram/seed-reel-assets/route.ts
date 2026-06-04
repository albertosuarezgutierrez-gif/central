export const dynamic = 'force-dynamic'
export const maxDuration = 120
import { NextRequest, NextResponse } from 'next/server'

// Siembra (una vez) un pool de clips de AMBIENTE de hostelería en Cloudinary, tomados
// de Pexels (royalty-free, uso comercial sin atribución). Cloudinary los descarga por URL
// (no pasan por esta función). Devuelve el valor sugerido para CLOUDINARY_AMBIENT_IDS.
//
// Auth: Bearer CRON_SECRET (manual desde curl o /super). NO se ejecuta solo.
// Requiere: PEXELS_API_KEY (gratis en pexels.com/api) + CLOUDINARY_* ya configuradas.
//
// Uso:
//   curl -X POST "https://www.iarest.es/api/super/instagram/seed-reel-assets" \
//     -H "authorization: Bearer $CRON_SECRET"
// Luego: pegar el `ambientIdsEnv` devuelto en Vercel env como CLOUDINARY_AMBIENT_IDS.

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME || ''
const KEY = process.env.CLOUDINARY_API_KEY || ''
const SEC = process.env.CLOUDINARY_API_SECRET || ''

// Consultas de ambiente hostelero (vertical). Se toma 1 clip por consulta.
const QUERIES = ['restaurant interior', 'busy bar', 'chef kitchen cooking', 'waiter serving', 'coffee bar barista', 'restaurant kitchen pass']

type PexelsFile = { link: string; width: number; height: number; quality: string; file_type: string }
type PexelsVideo = { id: number; width: number; height: number; video_files: PexelsFile[] }

// Elige el mejor fichero VERTICAL (9:16-ish) y ligero de un vídeo de Pexels.
function pickVerticalFile(v: PexelsVideo): string | null {
  const verticales = (v.video_files || []).filter(f => f.file_type === 'video/mp4' && f.height > f.width)
  if (verticales.length === 0) return null
  // Preferir ~720 de ancho (HD ligero); si no, el más cercano.
  verticales.sort((a, b) => Math.abs((a.width || 0) - 720) - Math.abs((b.width || 0) - 720))
  return verticales[0].link
}

// Sube a Cloudinary por URL remota (basic auth) como resource_type=video.
async function uploadVideoByUrl(remoteUrl: string, pid: string): Promise<string> {
  const B = 'iarestseedboundary'
  const ts = String(Math.floor(Date.now() / 1000))
  const auth = 'Basic ' + Buffer.from(`${KEY}:${SEC}`).toString('base64')
  const parts: string[] = []
  for (const [n, v] of [['timestamp', ts], ['public_id', pid], ['overwrite', 'true'], ['file', remoteUrl]])
    parts.push(`--${B}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${v}\r\n`)
  const body = parts.join('') + `--${B}--\r\n`
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/video/upload`, {
    method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${B}`, Authorization: auth },
    body,
  })
  const d = await res.json() as { public_id?: string; error?: { message: string } }
  if (d.error) throw new Error(`Cloudinary: ${d.error.message}`)
  return d.public_id!
}

export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const PEXELS = process.env.PEXELS_API_KEY
  if (!PEXELS) return NextResponse.json({
    error: 'Falta PEXELS_API_KEY',
    como: 'Crea una key gratis en https://www.pexels.com/api/ y añádela en Vercel env como PEXELS_API_KEY.',
  }, { status: 400 })
  if (!CLOUD || !KEY || !SEC) return NextResponse.json({ error: 'Faltan CLOUDINARY_* en env' }, { status: 400 })

  const seeded: string[] = []
  const errores: string[] = []
  let idx = 0

  for (const q of QUERIES) {
    try {
      const r = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&orientation=portrait&size=medium&per_page=3`, {
        headers: { Authorization: PEXELS },
      })
      if (!r.ok) { errores.push(`${q}: Pexels HTTP ${r.status}`); continue }
      const data = await r.json() as { videos?: PexelsVideo[] }
      const video = (data.videos || []).find(v => pickVerticalFile(v))
      const link = video ? pickVerticalFile(video) : null
      if (!link) { errores.push(`${q}: sin clip vertical`); continue }
      idx++
      const pid = await uploadVideoByUrl(link, `iarest_amb_${idx}`)
      seeded.push(pid)
    } catch (e) {
      errores.push(`${q}: ${(e as Error).message}`)
    }
  }

  return NextResponse.json({
    ok: seeded.length > 0,
    seeded,
    ambientIdsEnv: seeded.join(','),
    siguiente: 'Pega `ambientIdsEnv` en Vercel env como CLOUDINARY_AMBIENT_IDS y redeploy. Para música, sube 3-5 pistas royalty-free a Cloudinary (resource_type=video) y rellena CLOUDINARY_MUSIC_IDS.',
    errores,
  })
}
