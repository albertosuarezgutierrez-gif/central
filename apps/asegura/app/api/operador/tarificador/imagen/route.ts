import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { anotarCambio, auditado } from '@/lib/auditoria'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { CABECERA_ACTOR, leerActor } from '@/lib/actor'
import { leerFilaImagen, publicarImagenProduccion } from '@/lib/tarificador-imagen'
import { elegirImagenProduccion } from '@/lib/tarificador-imagen-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/operador/tarificador/imagen` — la imagen del bot con la que se lanzan las máquinas AHORA (BD o env de respaldo),
 * su origen y si el interruptor de imágenes de prueba está encendido. Sin secretos.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const fila = await leerFilaImagen()
  const e = elegirImagenProduccion(fila?.imagen ?? null, process.env)
  return NextResponse.json({ estado: 'ok', imagen: e.imagen, origen: e.origen, aviso: e.aviso, commitAt: fila?.commitAt?.toISOString() ?? null, permitirImagenPrueba: fila?.permitirPrueba === true })
}

/**
 * `POST /api/operador/tarificador/imagen { imagen, commitAt, forzar? }` — publica la imagen de PRODUCCIÓN del bot en
 * `seguros.tarificador_imagen` (manda sobre la env `TARIFICADOR_FLY_IMAGE`, que queda de respaldo): sin redesplegar asegura.
 * Lo llama SOLO el workflow `tarificador-rpa-imagen.yml` tras construir sobre `main` (Bearer ASEGURA_OPERADOR_SECRET).
 * Regex estricta (`REGEX_IMAGEN_BOT`), nunca `rama-*`; 409 `imagen_anterior` si su commit es anterior al de la vigente
 * («No poner una imagen anterior») salvo `forzar: true`. La misma imagen → 200 `sin_cambios`. Sin el SQL → 503 `sin_migracion`.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') return NextResponse.json({ estado: 'error', mensaje: 'cuerpo JSON requerido' }, { status: 400 })
  const actor = leerActor(req.headers.get(CABECERA_ACTOR))
  const quien = actor.tipo === 'desconocido' ? `desconocido:${actor.motivo}` : `${actor.tipo}:${actor.id}`
  try {
    const r = await publicarImagenProduccion({ imagen: body.imagen, commitAt: body.commitAt, forzar: body.forzar, actor: quien })
    if (r.estado === 'sin_esquema') return NextResponse.json({ estado: 'sin_migracion', mensaje: 'falta el SQL 2026-10-27_tarificador_imagen: la imagen sigue saliendo de TARIFICADOR_FLY_IMAGE' }, { status: 503 })
    if (r.estado === 'rechazada') return NextResponse.json({ estado: 'rechazado', motivo: r.motivo }, { status: r.status })
    if (r.estado === 'publicada') anotarCambio({ entidad: 'tarificador_imagen', id: 'produccion', campo: 'produccion', antes: r.anterior, despues: r.imagen })
    return NextResponse.json({ estado: r.estado, imagen: r.imagen, anterior: r.anterior })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/imagen', e) }, { status: 503 })
  }
})
