import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { signCleaningPhoto } from '@/lib/cleaning-photos'
import { nimVision } from '@iarest/core-ai'

export const runtime = 'nodejs'
export const maxDuration = 60

const SUPABASE_ANON  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY!
const VISION_MODEL   = 'meta/llama-3.2-90b-vision-instruct'
const nimConfig = () => ({ apiKey: NVIDIA_API_KEY, visionModel: VISION_MODEL })

interface Comparacion {
  coincide: boolean
  accion: 'ok' | 'revisar'
  observaciones: string[]
}

async function descargarBuffer(url: string): Promise<Buffer> {
  // Bucket cleaning-photos privado -> firmamos; fallback al público + anon mientras siga abierto.
  const signed = await signCleaningPhoto(url)
  const r = await fetch(signed || url,
    signed ? {} : { headers: { Authorization: 'Bearer ' + SUPABASE_ANON } })
  if (!r.ok) throw new Error('No se pudo descargar imagen: ' + r.status)
  return Buffer.from(await r.arrayBuffer())
}

// NVIDIA NIM admite 1 imagen por peticion -> componemos referencia | foto en una sola imagen.
async function componerMontaje(refBuf: Buffer, fotoBuf: Buffer): Promise<string> {
  const Jimp = (await import('jimp')).default as any
  const H = 720, GAP = 16, BAND = 40
  const [ref, foto] = await Promise.all([Jimp.read(refBuf), Jimp.read(fotoBuf)])
  ref.resize(Jimp.AUTO, H)
  foto.resize(Jimp.AUTO, H)
  const wRef = ref.getWidth(), wFoto = foto.getWidth()
  const canvas = new Jimp(wRef + wFoto + GAP, H + BAND, 0xf1f5f9ff)
  canvas.composite(new Jimp(wRef,  BAND - 8, 0x4f46e5ff), 0, 0)            // banda indigo (referencia)
  canvas.composite(new Jimp(wFoto, BAND - 8, 0x16a34aff), wRef + GAP, 0)   // banda verde (foto limpiadora)
  try {
    const font = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE)
    canvas.print(font, 8, 6, 'REFERENCIA')
    canvas.print(font, wRef + GAP + 8, 6, 'FOTO LIMPIADORA')
  } catch { /* etiquetas opcionales */ }
  canvas.composite(ref, 0, BAND)
  canvas.composite(foto, wRef + GAP, BAND)
  const out = await canvas.quality(72).getBufferAsync(Jimp.MIME_JPEG)
  return out.toString('base64')
}

async function compararConIA(montajeB64: string, contexto: string): Promise<Comparacion> {
  const prompt = `Eres control de calidad de limpieza de un piso turistico.
La imagen contiene DOS fotos lado a lado: IZQUIERDA = REFERENCIA (como debe quedar «${contexto}»), DERECHA = FOTO enviada por la limpiadora.
Decide si la foto de la limpiadora es VALIDA. Marca accion="revisar" SOLO si: (a) es claramente OTRA estancia o zona distinta, (b) FALTA un elemento importante que si aparece en la referencia, o (c) hay SUCIEDAD o DESORDEN evidente.
NO marques revisar por diferencias de iluminacion, angulo, encuadre, calidad de foto ni detalles menores.
Responde UNICAMENTE con JSON valido, sin markdown:
{"coincide": true|false, "accion": "ok"|"revisar", "observaciones": ["maximo 3 frases breves"]}`

  const txt = await nimVision(
    nimConfig(), '',
    [{ data: montajeB64, mediaType: 'image/jpeg' }],
    prompt, 400, { temperature: 0.1 },
  )
  const clean = txt.replace(/```json|```/g, '').trim()
  try {
    const j = JSON.parse(clean)
    return {
      coincide: !!j.coincide,
      accion: j.accion === 'ok' ? 'ok' : 'revisar',
      observaciones: Array.isArray(j.observaciones) ? j.observaciones.slice(0, 3).map(String) : [],
    }
  } catch {
    // Ante la duda, a revision manual (nunca damos por buena una limpieza por defecto).
    return { coincide: false, accion: 'revisar', observaciones: ['No se pudo interpretar el analisis; revisar manualmente.'] }
  }
}

// POST /api/admin/ia/comparar-foto
// Body: { referencia_url, foto_url, contexto?, empresa_id?, property_name? }
// NOTA: el "score" del modelo no es fiable; solo se usan accion/coincide como semaforo.
// La IA NUNCA bloquea una limpieza: solo deja aviso para que la coordinadora decida.
export async function POST(req: NextRequest) {
  try {
    // Ruta INTERNA (la llama upload-photo server-to-server). Exigir CRON_SECRET
    // evita que un admin la invoque con el empresa_id de otra empresa (IDOR).
    const secret = process.env.CRON_SECRET
    if (!secret || req.headers.get('authorization') !== 'Bearer ' + secret) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { referencia_url, foto_url, contexto, empresa_id, property_name } = await req.json()
    if (!referencia_url) return NextResponse.json({ error: 'referencia_url requerida' }, { status: 400 })
    if (!foto_url)       return NextResponse.json({ error: 'foto_url requerida' }, { status: 400 })
    if (!NVIDIA_API_KEY) return NextResponse.json({ error: 'NVIDIA_API_KEY no configurada' }, { status: 500 })

    const [refBuf, fotoBuf] = await Promise.all([descargarBuffer(referencia_url), descargarBuffer(foto_url)])
    const montaje   = await componerMontaje(refBuf, fotoBuf)
    const resultado = await compararConIA(montaje, contexto || 'el estado esperado de la estancia')

    if (resultado.accion === 'revisar' && empresa_id) {
      try {
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO alertas (empresa_id, tipo, titulo, descripcion, leida)
          VALUES (
            ${empresa_id}::uuid,
            'comparacion_foto_ia',
            ${`[IA] Revisar foto — ${property_name || 'propiedad'}`},
            ${resultado.observaciones.join(' · ') || 'La foto no coincide con la referencia.'},
            false
          )
        `)
      } catch (_) { /* alerta no critica */ }
    }

    return NextResponse.json({ ok: true, resultado })
  } catch (e: any) {
    console.error('[comparar-foto] Error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
