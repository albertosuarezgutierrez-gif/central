import { NextResponse } from 'next/server'
import { construirMapa, huellaPantalla, sanearInventarioDom, validarMapa, validarRespuestaExplorador } from '@central/module-tarificacion'
import { workerAutorizado } from '@/lib/tarificador-worker-auth'
import { hayExplorador } from '@/lib/esquema-bd'
import { costeYModelo, exploracionViva, guardarMapa, pasosDe } from '@/lib/tarificador-explorador'
import { leerPeticionCierre } from '@/lib/tarificador-explorador-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/tarificador/explorador/cierre` — fin de la exploración. Bearer `TARIFICADOR_WORKER_SECRET`. Cuerpo
 * `{ trabajoId, motivoFin, redNoGet?, efectosEnPortal? }`. asegura CONSTRUYE el mapa a partir de SUS pasos guardados
 * (re-saneados y re-validados): el worker no escribe el mapa, solo aporta la red (origen + ruta) y los efectos vistos.
 * 200 `{ estado:'ok', pantallas, huecos, coste }` · 409 si ya estaba cerrada. No cambia el estado del trabajo (eso va por
 * el puerto de resultado, fase B).
 */
export async function POST(req: Request) {
  if (!workerAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const l = leerPeticionCierre(await req.json().catch(() => null))
  if (!l.ok) return NextResponse.json({ estado: 'error', errores: l.errores }, { status: 400 })
  const p = l.p
  try {
    if (!(await hayExplorador())) return NextResponse.json({ estado: 'error', motivo: 'explorador_sin_esquema' }, { status: 503 })
    const e = await exploracionViva(p.trabajoId)
    if (!e) return NextResponse.json({ estado: 'no_disponible', motivo: 'exploracion_no_en_curso' }, { status: 404 })
    if (e.cerrada) return NextResponse.json({ estado: 'conflicto', motivo: 'exploracion_cerrada' }, { status: 409 })
    const pasos = (await pasosDe(e.exploracionId)).map((x) => {
      const inv = sanearInventarioDom(x.inventario, undefined, { refs: true })
      const v = inv && x.respuesta ? validarRespuestaExplorador(x.respuesta, { inventario: inv, ramo: e.ramo, entrada: e.entrada }) : null
      return inv ? { huella: huellaPantalla(inv), inventario: inv, respuesta: v?.ok ? v.respuesta : null } : null
    }).filter((x) => x !== null)
    const c = await costeYModelo(e)
    const mapa = construirMapa(
      {
        entrada: e.entrada, compania: e.compania, producto: e.producto, modelo: c.modelo, fecha: new Date().toISOString().slice(0, 10),
        efectosEnPortal: p.efectosEnPortal, redNoGet: p.redNoGet, coste: { llamadas: c.llamadas, eurEstimado: c.eur }, motivoFin: p.motivoFin,
      },
      pasos,
    )
    if (!validarMapa(mapa)) return NextResponse.json({ estado: 'error', motivo: 'mapa_invalido' }, { status: 500 })
    if (!(await guardarMapa(e, mapa, p.motivoFin))) return NextResponse.json({ estado: 'conflicto', motivo: 'exploracion_cerrada' }, { status: 409 })
    return NextResponse.json({ estado: 'ok', pantallas: mapa.pantallas.length, huecos: mapa.huecos.length, resultado: mapa.resultado.alcanzado, coste: mapa.coste })
  } catch (err) {
    console.error('[tarificador/explorador] cierre', p.trabajoId, err instanceof Error ? err.message.slice(0, 200) : 'error')
    return NextResponse.json({ estado: 'error' }, { status: 503 })
  }
}
