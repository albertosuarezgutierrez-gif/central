import { NextRequest, NextResponse } from 'next/server'
import { callAIVision, cleanJSON } from '@/lib/ai-client'

export const maxDuration = 90

// ── Barrera de coste (endpoint self-service SIN auth: es el alta pre-cuenta) ──────────────
// Este endpoint dispara visión IA (NVIDIA, con coste) y no hay sesión todavía (el
// restaurante aún no existe). Sin una barrera, un bucle anónimo agota la clave NVIDIA.
// No hay infraestructura de rate-limit reutilizable en ia-rest (no existe helper en
// `src/lib/*` ni tabla de rate-limit), así que aplicamos una guarda MÍNIMA y CONSERVADORA
// que acota el coste POR PETICIÓN (nº de imágenes + tamaño) y frena bucles en caliente sin
// romper el alta legítima (el cliente ya limita a 15 fotos).
// TODO(resiliencia): sustituir el limitador en memoria por un rate-limit por IP persistente
//   (tabla en BD / Upstash), fiable entre invocaciones serverless. El de abajo es best-effort:
//   solo captura ráfagas que caen en la misma instancia caliente.
const MAX_IMAGENES = 15
const MAX_BYTES_IMAGEN = 8 * 1024 * 1024   // ~8 MB por imagen (base64 crudo) — foto de carta holgada
const MAX_BYTES_TOTAL  = 40 * 1024 * 1024  // tope del cuerpo entero
// Limitador en memoria best-effort: ventana corta + tope generoso para NO tocar un alta real
// (unos pocos clics de "analizar"), pero cortar un script que martillea una instancia caliente.
const RL_VENTANA_MS = 60_000
const RL_MAX_POR_IP = 8
const rlHits = new Map<string, number[]>()
function rateLimited(ip: string): boolean {
  const ahora = Date.now()
  const prev = (rlHits.get(ip) ?? []).filter(t => ahora - t < RL_VENTANA_MS)
  prev.push(ahora)
  rlHits.set(ip, prev)
  if (rlHits.size > 5000) rlHits.clear() // evita fuga de memoria en la instancia
  return prev.length > RL_MAX_POR_IP
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
      || req.headers.get('x-real-ip') || 'desconocida'
    if (rateLimited(ip)) {
      return NextResponse.json({ error: 'Demasiadas peticiones, espera un momento e inténtalo de nuevo.' }, { status: 429 })
    }

    const { images } = await req.json()
    if (!images?.length) return NextResponse.json({ error: 'Sin imágenes' }, { status: 400 })
    if (images.length > MAX_IMAGENES) return NextResponse.json({ error: `Máximo ${MAX_IMAGENES} páginas` }, { status: 400 })

    // Acota el coste por petición: rechaza cuerpos desmesurados antes de llamar a la IA.
    let bytesTotal = 0
    for (const img of images as { data?: string }[]) {
      const bytes = typeof img?.data === 'string' ? img.data.length : 0
      if (bytes > MAX_BYTES_IMAGEN) {
        return NextResponse.json({ error: 'Alguna imagen es demasiado grande. Reduce su tamaño e inténtalo de nuevo.' }, { status: 413 })
      }
      bytesTotal += bytes
    }
    if (bytesTotal > MAX_BYTES_TOTAL) {
      return NextResponse.json({ error: 'El conjunto de imágenes es demasiado grande. Sube menos páginas o reduce su tamaño.' }, { status: 413 })
    }



    const normalizeType = (t: string): string => {
      if (t === 'image/jpg') return 'image/jpeg'
      const VALID = ['image/jpeg','image/png','image/gif','image/webp']
      return VALID.includes(t) ? t : 'image/jpeg'
    }
    const imageInputs = images.map((img: { data: string; mediaType: string }) => ({
      data: img.data,
      mediaType: normalizeType(img.mediaType),
    }))
    const onboardingPrompt = `Eres un experto en hostelería española. Extrae TODOS los platos, tapas, bebidas y postres de esta carta de restaurante.

Devuelve SOLO un JSON válido sin texto adicional ni markdown:
{"productos":[{"nombre":"string","descripcion":"string|null","precio":0.00,"categoria":"string","alergenos":["string"]}]}

Reglas:
- precio: número decimal o null si no aparece
- categoria: Entrantes, Tapas, Principales, Carnes, Pescados, Mariscos, Postres, Bebidas, Vinos, Cervezas, etc.
- alergenos: exactamente: ["Gluten","Crustáceos","Huevo","Pescado","Cacahuetes","Soja","Lácteos","Frutos de cáscara","Apio","Mostaza","Sésamo","Dióxido de azufre","Altramuces","Moluscos"]. [] si no hay.
- Incluye ABSOLUTAMENTE TODOS los productos visibles en todas las páginas`
    const msg = await callAIVision('Extrae carta de restaurante. Responde SOLO con JSON.', imageInputs, onboardingPrompt, 6000)

    const raw = msg ?? ''
    try {
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
      return NextResponse.json({ productos: parsed.productos || [] })
    } catch {
      return NextResponse.json({ error: 'Error al parsear respuesta IA', raw }, { status: 500 })
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    console.error('[onboarding/extract-carta] error:', e.status, e.message)
    return NextResponse.json({ error: e.message || 'Error al extraer la carta' }, { status: 500 })
  }
}
