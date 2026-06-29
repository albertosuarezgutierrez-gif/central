import { NextRequest, NextResponse } from 'next/server'
import { normalizarLectura, type FormatoIngesta, type LecturaCruda } from '@central/module-geo'
import { ingestaAutorizada } from '@/lib/ingest-auth'
import { getVehiculoPorDevice, porteActivoDeVehiculo, ingerirPosicion } from '@/lib/transporte-repo'

// Ingesta de posiciones GPS AGNÓSTICA del fabricante. Cada cliente conecta el tracker que quiera y lo
// apunta a /api/ingest/<formato> (osmand | traccar | generico) identificándose por `device_id`:
//  - osmand   → balizas baratas y la app Traccar Client (GET con query params; velocidad en nudos)
//  - traccar  → webhook "Forward" de un servidor Traccar (POST JSON con position/device)
//  - generico → nuestro JSON limpio { deviceId, lat, lng, velocidadKmh?, rumbo?, capturadoAt? }
// La normalización es pura (@central/module-geo); aquí solo resolvemos el vehículo por su device_id,
// le buscamos el porte activo y reusamos `ingerirPosicion` (la MISMA vía que el conductor por enlace:
// escribe la posición y dispara geocerca/km reales). Auth por clave de ingesta (no por cookie).

const FORMATOS: FormatoIngesta[] = ['osmand', 'traccar', 'generico']

export const dynamic = 'force-dynamic'

function paramsObjeto(req: NextRequest): Record<string, string> {
  const o: Record<string, string> = {}
  req.nextUrl.searchParams.forEach((v, k) => { o[k] = v })
  return o
}

async function ingerir(lecturas: LecturaCruda[]): Promise<{ ingeridas: number; ignoradas: number }> {
  let ingeridas = 0
  let ignoradas = 0
  for (const l of lecturas) {
    const veh = await getVehiculoPorDevice(l.deviceId)
    if (!veh) { ignoradas++; continue } // device sin vehículo asignado → se ignora (sin filtrar identidad)
    const porteId = await porteActivoDeVehiculo(veh.id)
    await ingerirPosicion({
      vehiculoId: veh.id,
      porteId,
      lat: l.lat,
      lng: l.lng,
      velocidadKmh: l.velocidadKmh,
      rumbo: l.rumbo,
      capturadoAt: l.capturadoAt ? new Date(l.capturadoAt) : null,
    })
    ingeridas++
  }
  return { ingeridas, ignoradas }
}

async function handle(req: NextRequest, formato: string, body: unknown) {
  if (!FORMATOS.includes(formato as FormatoIngesta)) {
    return NextResponse.json({ error: 'Formato no soportado' }, { status: 400 })
  }
  if (!ingestaAutorizada(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Acepta un objeto único o un lote (array). Cada elemento se normaliza por el formato indicado.
  const crudas = Array.isArray(body) ? body : [body]
  const lecturas = crudas
    .map((c) => normalizarLectura(formato as FormatoIngesta, c))
    .filter((l): l is LecturaCruda => l != null)

  if (lecturas.length === 0) {
    return NextResponse.json({ ok: false, error: 'Sin lecturas válidas' }, { status: 400 })
  }

  const r = await ingerir(lecturas)
  return NextResponse.json({ ok: true, ...r })
}

// GET: protocolo OsmAnd (balizas y Traccar Client mandan la posición en la query string).
export async function GET(req: NextRequest, { params }: { params: Promise<{ formato: string }> }) {
  const { formato } = await params
  return handle(req, formato, paramsObjeto(req))
}

// POST: JSON (traccar/generico) o, si no hay cuerpo JSON, los query params (osmand por POST).
export async function POST(req: NextRequest, { params }: { params: Promise<{ formato: string }> }) {
  const { formato } = await params
  const body = await req.json().catch(() => null)
  return handle(req, formato, body ?? paramsObjeto(req))
}
