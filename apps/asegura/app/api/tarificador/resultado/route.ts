import { NextResponse } from 'next/server'
import { workerAutorizado } from '@/lib/tarificador-worker-auth'
import { registrarResultado } from '@/lib/tarificador'
import { leerResultadoWorker } from '@/lib/tarificador-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/tarificador/resultado` — el worker devuelve lo que sacó del portal. Bearer
 * `TARIFICADOR_WORKER_SECRET` (comparación en tiempo constante). Dos formas:
 *   `{ trabajoId, resultado: 'ok', ofertas: OfertaNormalizada[], pdfs: [{ nombre, base64 }] }`
 *   `{ trabajoId, resultado: 'error', error: { tipo, mensaje, url? }, capturaBase64?, html? }`
 * Ambas formas admiten `pasos` (traza: paso, inicio, duracionMs, ok, errorCodigo; sin datos personales) y
 * `botVersion` (semver del adaptador); la traza va a `tarificacion_trabajo_pasos` y la versión a `bot_version`.
 * Las ofertas van a `tarificaciones`/`tarificacion_precios` con `canal = 'rpa'`; los PDF, la captura
 * y el HTML (ya redactado por el worker) a `documentos`. Un trabajo que ya no está `en_curso` (lease
 * vencido) responde 409 y no pisa nada.
 *
 * Sin `auditado()`: este puerto no es el de operador (lo vigila `lib/auditoria.test.ts` solo allí);
 * el rastro es la propia fila de `tarificacion_trabajos` (estado, error, evidencia, sellos).
 * Se acepta aunque el canal se haya apagado después de lanzar: el bot ya entró, el dato se guarda.
 */
export async function POST(req: Request) {
  if (!workerAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const l = leerResultadoWorker(body)
  if (!l.ok) return NextResponse.json({ estado: 'error', errores: l.errores }, { status: 400 })
  // Traza descartada por traer claves no permitidas: se avisa (sin valores) y el resultado se guarda igual.
  if (l.r.trazaRechazada) console.warn('[tarificador] traza descartada', l.r.trabajoId, l.r.trazaRechazada.join(' | '))
  try {
    const r = await registrarResultado(l.r)
    if (r.estado === 'no_encontrado') return NextResponse.json(r, { status: 404 })
    if (r.estado === 'conflicto') return NextResponse.json(r, { status: 409 })
    return NextResponse.json(r)
  } catch (e) {
    // Sin el mensaje crudo hacia fuera (podría llevar la URL de la BD); al log, recortado.
    console.error('[tarificador] resultado', l.r.trabajoId, e instanceof Error ? e.message.slice(0, 300) : e)
    return NextResponse.json({ estado: 'error' }, { status: 503 })
  }
}
