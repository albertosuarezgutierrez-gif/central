import { NextResponse } from 'next/server'
import { workerAutorizado } from '@/lib/tarificador-worker-auth'
import { hayPilotaje } from '@/lib/esquema-bd'
import { leerPeticionCierre, redactarResultadoPilotaje, redactarTextoPilotaje } from '@/lib/tarificador-pilotaje-reglas'
import { cerrarSesion, sesionViva, valoresPilotaje } from '@/lib/tarificador-pilotaje'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/tarificador/pilotaje/cierre` `{ trabajoId, motivoFin, nUltimo?, resultadoUltimo?, error?, botVersion? }` — el worker
 * cierra la sesión: la cabecera queda cerrada y el trabajo termina `ok` (o `error_definitivo` si trae `error`; un pilotaje
 * nunca se reintenta solo). 404 si ya no está viva. Funciona aunque el explorador se haya apagado entretanto (cerrar siempre se puede).
 */
export async function POST(req: Request) {
  if (!workerAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const l = leerPeticionCierre(body)
  if (!l.ok) return NextResponse.json({ estado: 'error', errores: l.errores }, { status: 400 })
  const bv = (body as { botVersion?: unknown }).botVersion
  const botVersion = typeof bv === 'string' && /^[0-9a-z.+-]{1,40}$/i.test(bv) ? bv : null
  try {
    if (!(await hayPilotaje())) return NextResponse.json({ estado: 'error', motivo: 'pilotaje_sin_esquema' }, { status: 503 })
    const s = await sesionViva(l.p.trabajoId)
    if (!s) return NextResponse.json({ estado: 'no_disponible', motivo: 'pilotaje_no_en_curso' }, { status: 404 })
    // Diagnóstico nuevo (resultado y mensaje de error): redactado como el inventario; sin saber qué quitar, no se guarda texto.
    const valores = valoresPilotaje(s.entrada, process.env)
    const p = valores === null
      ? { ...l.p, resultadoUltimo: null, error: l.p.error ? { tipo: l.p.error.tipo, mensaje: '(texto redactado)' } : null }
      : { ...l.p, resultadoUltimo: redactarResultadoPilotaje(l.p.resultadoUltimo, valores), error: l.p.error ? { tipo: l.p.error.tipo, mensaje: redactarTextoPilotaje(l.p.error.mensaje, valores) } : null }
    await cerrarSesion(s, p, botVersion)
    return NextResponse.json({ estado: 'cerrado' })
  } catch (err) {
    console.error('[tarificador/pilotaje] cierre', l.p.trabajoId, err instanceof Error ? err.message.slice(0, 200) : 'error')
    return NextResponse.json({ estado: 'error' }, { status: 503 })
  }
}
