import { NextResponse } from 'next/server'
import { workerAutorizado } from '@/lib/tarificador-worker-auth'
import { hayPilotaje } from '@/lib/esquema-bd'
import { exploradorActivo } from '@/lib/tarificador-explorador-reglas'
import { leerPeticionEstado } from '@/lib/tarificador-pilotaje-reglas'
import { configStorage, publicarEstado, redactarEstadoPilotaje, sesionViva, subirCaptura } from '@/lib/tarificador-pilotaje'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * `POST /api/tarificador/pilotaje/estado` — el worker, en MODO PILOTADO, publica la pantalla `n`: inventario saneado (se REDACTA
 * aquí otra vez con `redactarValoresInventario` antes de guardarlo), captura PNG (→ bucket privado `tarificador-pilotaje`) y el
 * resultado del comando de `n-1`. Bearer `TARIFICADOR_WORKER_SECRET`. 200 `{ estado: 'ok', leaseHasta, captura }`; 404 si la
 * sesión ya no está viva (el worker cierra); 409 si `n` no es el siguiente. Sin `auditado()`: puerto del worker; el rastro es la tabla.
 */
export async function POST(req: Request) {
  if (!workerAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!exploradorActivo(process.env)) return NextResponse.json({ estado: 'apagado', motivo: 'explorador_apagado (TARIFICADOR_EXPLORADOR_ACTIVO)' }, { status: 503 })
  const l = leerPeticionEstado(await req.json().catch(() => null))
  if (!l.ok) return NextResponse.json({ estado: 'error', errores: l.errores }, { status: 400 })
  const p = l.p
  try {
    if (!(await hayPilotaje())) return NextResponse.json({ estado: 'error', motivo: 'pilotaje_sin_esquema (aplicar 2026-11-03c_tarificador_pilotaje.sql)' }, { status: 503 })
    const s = await sesionViva(p.trabajoId)
    if (!s) return NextResponse.json({ estado: 'no_disponible', motivo: 'pilotaje_no_en_curso' }, { status: 404 })
    const red = redactarEstadoPilotaje(p, s.entrada, process.env)
    if (!red) return NextResponse.json({ estado: 'error', motivo: 'no_se_pudo_redactar' }, { status: 503 })
    const ruta = p.capturaBase64 ? await subirCaptura(configStorage(process.env), s.trabajoId, p.n, Buffer.from(p.capturaBase64, 'base64')) : null
    const r = await publicarEstado(s, red.p, red.inventario, ruta)
    if (r.estado === 'conflicto') return NextResponse.json(r, { status: 409 })
    return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[tarificador/pilotaje] estado', p.trabajoId, err instanceof Error ? err.message.slice(0, 200) : 'error')
    return NextResponse.json({ estado: 'error' }, { status: 503 })
  }
}
