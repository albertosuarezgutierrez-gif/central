export const dynamic = 'force-dynamic'
export const maxDuration = 120
import { NextRequest, NextResponse } from 'next/server'

// Siembra (una vez) un pool de MÚSICA royalty-free en Cloudinary a partir de enlaces MP3
// públicos (p.ej. Pixabay, cuyos enlaces de CDN son fetchables). Cloudinary los descarga
// por URL (no pasan por esta función). Devuelve el valor para CLOUDINARY_MUSIC_IDS.
//
// Auth: POST con `Authorization: Bearer CRON_SECRET`, o GET desde el NAVEGADOR estando
// logueado en /super (el middleware del escudo __super_shield ya protege /api/super/*).
//
// Uso (navegador, logueado en /super):
//   /api/super/instagram/seed-music?urls=<mp3_1>|<mp3_2>|<mp3_3>     (URLs URL-encoded, separadas por |)
// Uso (curl):
//   curl -X POST .../seed-music -H "authorization: Bearer $CRON_SECRET" \
//     -H 'content-type: application/json' -d '{"urls":["https://cdn.pixabay.com/.../a.mp3"]}'
//
// Después: pegar el `musicIdsEnv` devuelto en Vercel env como CLOUDINARY_MUSIC_IDS y redeploy.

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME || ''
const KEY = process.env.CLOUDINARY_API_KEY || ''
const SEC = process.env.CLOUDINARY_API_SECRET || ''

// Sube a Cloudinary por URL remota (basic auth) como resource_type=video (el audio es
// un recurso de tipo video en Cloudinary, que es lo que espera la capa `l_audio:`).
async function uploadAudioByUrl(remoteUrl: string, pid: string): Promise<string> {
  const B = 'iarestmusicboundary'
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

async function seed(urls: string[]): Promise<NextResponse> {
  if (!CLOUD || !KEY || !SEC) return NextResponse.json({ error: 'Faltan CLOUDINARY_* en env' }, { status: 400 })
  if (urls.length === 0) return NextResponse.json({
    error: 'Sin enlaces de música',
    como: 'Pasa 3-5 enlaces MP3 públicos. En el navegador: ?urls=<mp3_1>|<mp3_2>|<mp3_3>. ' +
          'Gratis en pixabay.com/music (instrumentales, uso comercial sin atribución): abre la pista, ' +
          'botón de descarga → copia el enlace directo del MP3.',
  }, { status: 400 })

  const seeded: string[] = []
  const errores: string[] = []
  for (let i = 0; i < urls.length; i++) {
    try {
      seeded.push(await uploadAudioByUrl(urls[i], `iarest_music_${i + 1}`))
    } catch (e) {
      errores.push(`#${i + 1}: ${(e as Error).message}`)
    }
  }

  return NextResponse.json({
    ok: seeded.length > 0,
    seeded,
    musicIdsEnv: seeded.join(','),
    siguiente: 'Copia `musicIdsEnv` y pégalo en Vercel env como CLOUDINARY_MUSIC_IDS, luego redeploy. ' +
               'Genera un reel y comprueba que suena (🎵).',
    errores,
  })
}

function parseUrls(raw: string | null): string[] {
  if (!raw) return []
  return raw.split('|').map(s => s.trim()).filter(Boolean)
}

// POST: Bearer CRON_SECRET, body { urls: string[] } (o ?urls= en la query).
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  let urls = parseUrls(req.nextUrl.searchParams.get('urls'))
  if (urls.length === 0) {
    const body = await req.json().catch(() => ({})) as { urls?: string[] }
    if (Array.isArray(body.urls)) urls = body.urls.map(s => String(s).trim()).filter(Boolean)
  }
  return seed(urls)
}

// GET: protegido por el middleware del escudo /api/super/* → lanzable desde el navegador.
export async function GET(req: NextRequest) {
  return seed(parseUrls(req.nextUrl.searchParams.get('urls')))
}
