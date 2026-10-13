import { NextResponse, after } from 'next/server'
import { workerAutorizado } from '@/lib/tarificador-worker-auth'
import { registrarResultado } from '@/lib/tarificador'
import { leerResultadoWorker } from '@/lib/tarificador-reglas'
import { eleccionIaActiva } from '@/lib/tarificador-eleccion-reglas'
import { intentarEleccionVersionIa } from '@/lib/tarificador-eleccion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// La elección de versión con IA corre en `after` (IA ≤30 s + Fly ~20 s + BD; con memoria no hay IA).
export const maxDuration = 90

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
 *
 * Versión de vehículo ambigua (13/10/2026): si el fallo trae `error.opcionesVersion` y queda en `requiere_humano`, con
 * `TARIFICADOR_IA_ELECCION=1` la IA elige DESPUÉS de responder al worker (`after`: el worker no espera a la IA) y, solo
 * con confianza alta, el mismo trabajo vuelve a `pendiente` y se relanza (`lib/tarificador-eleccion.ts`).
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
    if (l.r.tipo === 'error' && l.r.error.opcionesVersion && r.estadoTrabajo === 'requiere_humano' && eleccionIaActiva(process.env)) {
      const trabajoId = l.r.trabajoId
      after(() => intentarEleccionVersionIa(trabajoId).then(() => undefined))
    }
    return NextResponse.json(r)
  } catch (e) {
    // Sin el mensaje crudo hacia fuera (podría llevar la URL de la BD); al log, recortado.
    console.error('[tarificador] resultado', l.r.trabajoId, e instanceof Error ? e.message.slice(0, 300) : e)
    return NextResponse.json({ estado: 'error' }, { status: 503 })
  }
}
