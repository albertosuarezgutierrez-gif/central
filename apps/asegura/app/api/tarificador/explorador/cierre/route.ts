import { NextResponse } from 'next/server'
import { construirMapa, erroresDeIncidencias, esRespuestaLogin, huellaPantalla, resumenLoginParaMapa, sanearInventarioDom, validarMapa, validarRespuestaExplorador, type RespuestaExplorador } from '@central/module-tarificacion'
import { workerAutorizado } from '@/lib/tarificador-worker-auth'
import { hayExplorador } from '@/lib/esquema-bd'
import { PasoOcupado, anotarErroresUltimoPaso, conLockExploracion, costeYModelo, exploracionViva, guardarMapa, leerEstadoPaso, pasosDe, riesgoDeExploracion, type Bd } from '@/lib/tarificador-explorador'
import { ejecutarCierre } from '@/lib/tarificador-explorador-paso'
import { huecoDeDetalleFin, leerPeticionCierre } from '@/lib/tarificador-explorador-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

class MapaInvalido extends Error {}

/**
 * `POST /api/tarificador/explorador/cierre` — fin de la exploración. Bearer `TARIFICADOR_WORKER_SECRET`. Cuerpo
 * `{ trabajoId, motivoFin, detalleFin?, redNoGet?, efectosEnPortal?, presupuesto? }` (`presupuesto`: guardado, referencia y PDF → `mapa.presupuesto`) (`detalleFin`: código cerrado de qué cortó → `mapa.huecos`). asegura CONSTRUYE el mapa a partir de SUS pasos guardados
 * (re-saneados y re-validados): el worker no escribe el mapa, solo aporta la red (origen + ruta) y los efectos vistos.
 * Toma el MISMO try-lock por exploración que `paso` y respeta la IA reservada (`ejecutarCierre`): nunca corre a la vez que
 * un paso en vuelo → 409 `paso_en_curso` (el worker reintenta). 200 `{ estado:'ok', pantallas, huecos, coste }` · 409 si ya
 * estaba cerrada. No cambia el estado del trabajo: eso va por `/api/tarificador/resultado` (`resultado: 'explorado'`).
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
    // Re-validación con las MISMAS reglas que el paso: con datos reales, elegir/marcar solo con valor conocido. Sin riesgo
    // legible (`null`), esos pasos no entran en el mapa (conservador).
    const datosReales = e.conDatosReales ? { riesgo: await riesgoDeExploracion(e).catch(() => null) } : null
    let resumen: { pantallas: number; huecos: number; resultado: boolean; coste: { llamadas: number; eurEstimado: number } } | null = null
    const out = await ejecutarCierre<Bd>({
      conLock: (fn) => conLockExploracion(e, fn),
      leer: (bd) => leerEstadoPaso(e, bd),
      cerrar: async (bd) => {
        // `presupuestoEnCurso` se va calculando EN ORDEN (como en el paso): un 2.º guardar_presupuesto (Descargar) o un
        // `terminar` sin importes solo valen tras un guardado validado ANTERIOR.
        let enCurso = false
        const leidos = await pasosDe(e.exploracionId, bd)
        // LOGIN ASISTIDO (14/10/2026): sus pasos NO son pantallas del mapa (el validador normal los rechaza), pero su
        // estructura (sin valores) va a `huecos`: es la evidencia del SSO (una exploración no guarda el HTML como documento).
        const huecosLogin = leidos.filter((x) => esRespuestaLogin(x.respuesta)).map((x) => {
          const inv = sanearInventarioDom(x.inventario, undefined, { refs: true })
          return inv ? resumenLoginParaMapa(x.n, inv) : `login asistido, pantalla ${x.n}: inventario ilegible`
        })
        const pasos = leidos.map((x) => {
          const inv = sanearInventarioDom(x.inventario, undefined, { refs: true })
          const v = inv && x.respuesta ? validarRespuestaExplorador(x.respuesta, { inventario: inv, ramo: e.ramo, entrada: e.entrada, datosReales, presupuestoEnCurso: enCurso }) : null
          const respuesta: RespuestaExplorador | null = v?.ok ? v.respuesta : null
          if (respuesta?.acciones.some((a) => a.accion === 'avanzar' && a.efectoEsperado === 'guardar_presupuesto')) enCurso = true
          return inv ? { huella: huellaPantalla(inv), inventario: inv, respuesta } : null
        }).filter((x) => x !== null)
        // Lo que el ÚLTIMO lote no pudo aplicar (14/10/2026): a los `errores` de ese paso, con la etiqueta de SU inventario.
        if (p.incidencias.length && pasos.length) await anotarErroresUltimoPaso(e, erroresDeIncidencias(p.incidencias, pasos[pasos.length - 1].inventario), bd)
        const c = await costeYModelo(e, bd)
        const mapa = construirMapa(
          {
            entrada: e.entrada, compania: e.compania, producto: e.producto, modelo: c.modelo, fecha: new Date().toISOString().slice(0, 10),
            efectosEnPortal: p.efectosEnPortal, redNoGet: p.redNoGet, coste: { llamadas: c.llamadas, eurEstimado: c.eur }, motivoFin: p.motivoFin,
            presupuesto: p.presupuesto,
          },
          pasos,
        )
        const hueco = huecoDeDetalleFin(p.motivoFin, p.detalleFin)
        if (hueco) mapa.huecos.push(hueco)
        mapa.huecos.push(...huecosLogin)
        if (!validarMapa(mapa)) throw new MapaInvalido('mapa_invalido')
        resumen = { pantallas: mapa.pantallas.length, huecos: mapa.huecos.length, resultado: mapa.resultado.alcanzado, coste: mapa.coste }
        return guardarMapa(e, mapa, p.motivoFin, bd)
      },
    })
    if (out.tipo === 'conflicto') return NextResponse.json({ estado: 'conflicto', motivo: out.motivo }, { status: 409 })
    return NextResponse.json({ estado: 'ok', ...(resumen ?? {}) })
  } catch (err) {
    if (err instanceof PasoOcupado) return NextResponse.json({ estado: 'conflicto', motivo: 'paso_en_curso' }, { status: 409 })
    if (err instanceof MapaInvalido) return NextResponse.json({ estado: 'error', motivo: 'mapa_invalido' }, { status: 500 })
    console.error('[tarificador/explorador] cierre', p.trabajoId, err instanceof Error ? err.message.slice(0, 200) : 'error')
    return NextResponse.json({ estado: 'error' }, { status: 503 })
  }
}
