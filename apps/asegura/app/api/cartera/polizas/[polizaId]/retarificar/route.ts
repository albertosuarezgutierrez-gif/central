import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { correduriaUnica } from '@/lib/cartera'
import { origenRetarificacion } from '@/lib/cartera-ficha'
import { precalificarAuto, type Resueltos } from '@/lib/codeoscopic/desde-cartera'
import {
  construirPeticionAuto,
  revisarDatosAuto,
  type DatosAuto,
} from '@/lib/codeoscopic/peticion-auto'
import { cotizar } from '@/lib/codeoscopic/cotizar'
import { resumirCotizacion } from '@/lib/codeoscopic/respuesta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// La cotización del vendor puede tardar hasta 150 s (documentado). Sin este
// margen Vercel corta antes y nos quedamos sin saber si nos han cobrado — que
// es justo el estado que el libro de consumo tiene que contar como gasto.
export const maxDuration = 180

/**
 * Retarifica una póliza de la cartera. **Esta ruta GASTA 0,50€ por llamada.**
 *
 * Es la única de `/api/cartera/*` que cuesta dinero, y por eso:
 *   - es `POST`, nunca un `GET` que un prefetch del navegador pueda disparar;
 *   - vuelve a revisar los datos GRATIS antes de llamar: si falta algo devuelve
 *     422 con la lista completa y no se gasta nada;
 *   - deja que `cotizar()` haga de portero (interruptor, libro y tope), en vez
 *     de repetir aquí esas decisiones.
 *
 * En el cuerpo llegan los huecos que la ficha no tiene (versión del vehículo,
 * municipio, garaje…) y las correcciones del corredor. Aquí NO se rellena nada
 * solo: lo que se podía suponer ya lo ha puesto el mapeador, marcado como tal.
 */
export async function POST(req: Request, ctx: { params: Promise<{ polizaId: string }> }) {
  const session = await requireSession()
  const { polizaId } = await ctx.params

  const correduria = await correduriaUnica().catch(() => null)
  if (!correduria) {
    return NextResponse.json(
      {
        error:
          'No se ha podido resolver la correduría, así que ni se consulta la cartera sin filtro ' +
          'ni se cotiza. Esto NO significa que la póliza no exista.',
      },
      { status: 503 },
    )
  }

  const origen = await origenRetarificacion(correduria.id, polizaId)
  if (!origen) return NextResponse.json({ error: 'póliza no encontrada' }, { status: 404 })

  const cuerpo = (await req.json().catch(() => ({}))) as {
    resueltos?: Record<string, unknown>
    correcciones?: Partial<DatosAuto>
  }

  const resueltos: Resueltos = {
    municipioId: numero(cuerpo.resueltos?.municipioId),
    estadoCivilId: cadena(cuerpo.resueltos?.estadoCivilId),
    fechaMatriculacion: cadena(cuerpo.resueltos?.fechaMatriculacion),
    codigoVehiculo: cadena(cuerpo.resueltos?.codigoVehiculo),
    garaje: cadena(cuerpo.resueltos?.garaje),
    garajeEsSupuesto: cuerpo.resueltos?.garajeEsSupuesto === true,
  }

  const pre = precalificarAuto(origen.cliente, origen.poliza, resueltos, hoyIso())

  // Las correcciones del corredor mandan sobre lo supuesto: es una persona
  // diciendo el dato de verdad. Se revisa OTRA VEZ con el resultado, porque una
  // corrección puede arreglar un hueco y también puede romper otra regla.
  const datos: Partial<DatosAuto> = { ...pre.datos, ...limpiarCorrecciones(cuerpo.correcciones) }
  const faltan = revisarDatosAuto(datos)

  if (faltan.length > 0) {
    // 422 y NI UN CÉNTIMO gastado. Es el caso normal la primera vez.
    return NextResponse.json(
      { error: 'faltan datos para cotizar', faltan, gastado: '0,00€' },
      { status: 422 },
    )
  }

  let peticion: Record<string, unknown>
  try {
    peticion = construirPeticionAuto(datos as DatosAuto)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), gastado: '0,00€' },
      { status: 422 },
    )
  }
  // Nuestra referencia, para casar después la cotización con la póliza.
  peticion.externalId = `poliza:${polizaId}`

  const r = await cotizar({
    correduriaId: correduria.id,
    cuerpo: peticion,
    motivo: 'defensa-cartera',
    solicitadoPor: session.nombre ?? 'desconocido',
  })

  if (!r.ok) {
    // 402 cuando el freno es el TOPE: eso no es un fallo, es el tope haciendo
    // su trabajo, y la pantalla lo cuenta distinto de un error del vendor.
    return NextResponse.json(
      { error: r.mensaje, razon: r.razon },
      { status: r.razon === 'tope' ? 402 : r.razon === 'vendor' ? 502 : 503 },
    )
  }

  return NextResponse.json({
    ok: true,
    coste: r.coste,
    restantesHoy: r.restantesHoy,
    resumen: resumirCotizacion(r.cotizacion),
    projectId: r.cotizacion.projectId,
    precios: r.cotizacion.precios,
    fallos: r.cotizacion.fallos,
    // Los supuestos viajan CON el precio para que la pantalla los enseñe al
    // lado de la prima, no en otra pestaña: son la letra pequeña de esa cifra.
    supuestos: pre.supuestos,
  })
}

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

function numero(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

function hoyIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Solo se aceptan correcciones CON valor: un campo vacío no borra lo supuesto. */
function limpiarCorrecciones(c: Partial<DatosAuto> | undefined): Partial<DatosAuto> {
  if (!c || typeof c !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(c)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'string' && v.trim() === '') continue
    out[k] = typeof v === 'string' ? v.trim() : v
  }
  return out as Partial<DatosAuto>
}
