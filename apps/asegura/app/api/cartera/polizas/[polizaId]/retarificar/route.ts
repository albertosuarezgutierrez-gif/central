import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { correduriaUnica } from '@/lib/cartera'
import { origenRetarificacion, type OrigenRetarificacion } from '@/lib/cartera-ficha'
import { precalificarAuto, type Resueltos } from '@/lib/codeoscopic/desde-cartera'
import {
  precalificarHogarCartera,
  type CatastroHogar,
  type ResueltosHogar,
  type SupuestoHogar,
} from '@/lib/codeoscopic/desde-cartera-hogar'
import {
  construirPeticionAuto,
  revisarDatosAuto,
  type DatosAuto,
} from '@/lib/codeoscopic/peticion-auto'
import {
  construirPeticionHogar,
  revisarDatosHogar,
  type DatosHogar,
} from '@/lib/codeoscopic/peticion-hogar'
import type { Supuesto } from '@/lib/codeoscopic/desde-cartera'
import { resolverConfig, explicarConfig } from '@/lib/codeoscopic/config'
import { lineasDeSeguro, hogarDisponible } from '@/lib/codeoscopic/catalogos'
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
 *
 * Ramifica por el ramo de la póliza (`origen.tipo`): AUTO y HOGAR construyen
 * su cuerpo cada uno con su mapeador y su revisor, y los dos pasan por el
 * MISMO `cotizar()`. Cualquier otro ramo es un 409 con el motivo de
 * `retarificabilidad()`, que es la misma frase que pinta la ficha.
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

  const cuerpo = (await req.json().catch(() => ({}))) as CuerpoPeticion

  // ── El cuerpo que viaja, según el ramo. Todo lo de aquí es GRATIS ─────────
  let preparado: Preparado
  if (origen.tipo === 'auto') {
    preparado = prepararAuto(origen, cuerpo, polizaId)
  } else if (origen.tipo === 'hogar') {
    preparado = await prepararHogar(origen, cuerpo, polizaId)
  } else {
    return NextResponse.json(
      {
        error: origen.retarificacion.motivo ?? `hoy no se retarifica el ramo «${origen.tipo}»`,
        gastado: '0,00€',
      },
      { status: 409 },
    )
  }
  if ('respuesta' in preparado) return preparado.respuesta

  // ── La llamada que cuesta dinero, por el único embudo ─────────────────────
  const r = await cotizar({
    correduriaId: correduria.id,
    cuerpo: preparado.peticion,
    motivo: preparado.motivo,
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
    supuestos: preparado.supuestos,
    ...(preparado.fuenteRiesgo !== undefined ? { fuenteRiesgo: preparado.fuenteRiesgo } : {}),
  })
}

type CuerpoPeticion = {
  resueltos?: Record<string, unknown>
  correcciones?: Record<string, unknown>
  catastro?: Record<string, unknown> | null
}

type Preparado =
  | {
      peticion: Record<string, unknown>
      motivo: string
      supuestos: Supuesto[] | SupuestoHogar[]
      fuenteRiesgo?: 'poliza' | 'gemela' | 'catastro' | null
    }
  | { respuesta: NextResponse }

function sinGasto(cuerpo: Record<string, unknown>, status: number): { respuesta: NextResponse } {
  return { respuesta: NextResponse.json({ ...cuerpo, gastado: '0,00€' }, { status }) }
}

// ─── AUTO ────────────────────────────────────────────────────────────────────

function prepararAuto(origen: OrigenRetarificacion, cuerpo: CuerpoPeticion, polizaId: string): Preparado {
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
  const datos: Partial<DatosAuto> = { ...pre.datos, ...limpiarCorrecciones<DatosAuto>(cuerpo.correcciones) }
  const faltan = revisarDatosAuto(datos)

  if (faltan.length > 0) {
    // 422 y NI UN CÉNTIMO gastado. Es el caso normal la primera vez.
    return sinGasto({ error: 'faltan datos para cotizar', faltan }, 422)
  }

  let peticion: Record<string, unknown>
  try {
    peticion = construirPeticionAuto(datos as DatosAuto)
  } catch (e) {
    return sinGasto({ error: e instanceof Error ? e.message : String(e) }, 422)
  }
  // Nuestra referencia, para casar después la cotización con la póliza.
  peticion.externalId = `poliza:${polizaId}`
  return { peticion, motivo: 'defensa-cartera', supuestos: pre.supuestos }
}

// ─── HOGAR ───────────────────────────────────────────────────────────────────

/**
 * 🚨 El contrato del `risk` de hogar del vendor NO está verificado (ver
 * `peticion-hogar.ts`). Un 400 de validación no se cobra y su mensaje dirá qué
 * campo sobra o falta; por eso el 502 devuelve el mensaje ENTERO del vendor.
 */
async function prepararHogar(
  origen: OrigenRetarificacion,
  cuerpo: CuerpoPeticion,
  polizaId: string,
): Promise<Preparado> {
  const s = esObjetoPlano(cuerpo.resueltos?.supuestos) ? cuerpo.resueltos.supuestos : {}
  const resueltos: ResueltosHogar = {
    municipioId: numero(cuerpo.resueltos?.municipioId),
    estadoCivilId: cadena(cuerpo.resueltos?.estadoCivilId),
    tipoVivienda: cadena(cuerpo.resueltos?.tipoVivienda),
    uso: cadena(cuerpo.resueltos?.uso),
    ocupacion: cadena(cuerpo.resueltos?.ocupacion),
    supuestos: {
      tipoVivienda: s.tipoVivienda === true,
      uso: s.uso === true,
      ocupacion: s.ocupacion === true,
    },
  }
  const catastro: CatastroHogar | null = esObjetoPlano(cuerpo.catastro)
    ? {
        metrosCuadrados: numero(cuerpo.catastro.metrosCuadrados),
        anioConstruccion: numero(cuerpo.catastro.anioConstruccion),
        codigoPostal: cadena(cuerpo.catastro.codigoPostal),
        uso: cadena(cuerpo.catastro.uso),
      }
    : null

  const pre = precalificarHogarCartera(
    origen.cliente,
    {
      numeroPoliza: origen.poliza.numeroPoliza,
      fechaVencimiento: origen.poliza.fechaVencimiento,
      hogar: origen.hogar,
    },
    resueltos,
    hoyIso(),
    catastro,
  )

  // Los números del formulario llegan como TEXTO («76», «61000»); se convierten
  // aquí y lo que no es número se descarta (queda lo precalificado), nunca a 0.
  const correcciones = limpiarCorrecciones<DatosHogar>(cuerpo.correcciones) as Record<string, unknown>
  for (const k of ['metrosCuadrados', 'anioConstruccion', 'capitalContinente', 'capitalContenido', 'municipioId']) {
    if (k in correcciones) {
      const n = numero(correcciones[k])
      if (n === null) delete correcciones[k]
      else correcciones[k] = n
    }
  }
  const datos: Partial<DatosHogar> = { ...pre.datos, ...(correcciones as Partial<DatosHogar>) }
  const faltan = revisarDatosHogar(datos)
  if (faltan.length > 0) {
    return sinGasto({ error: 'faltan datos para cotizar', faltan }, 422)
  }

  // ── El id del ramo: de `/insurance-lines` (gratis), nunca escrito a mano ──
  // Con el interruptor ignorado a propósito: mirar si hogar tarifica es una
  // consulta; el gasto lo decide `cotizar()` con el interruptor de verdad.
  const cfg = resolverConfig(process.env, { ignorarInterruptor: true })
  if (cfg.estado !== 'lista') {
    return sinGasto({ error: explicarConfig(cfg) }, 503)
  }
  const lineas = await lineasDeSeguro(cfg.config).catch(() => [])
  const hogar = hogarDisponible(lineas)
  if (hogar.estado !== 'disponible') {
    return sinGasto(
      { error: 'hogar no tarifica para esta organización (o no se ha podido comprobar)', hogar },
      409,
    )
  }

  let peticion: Record<string, unknown>
  try {
    peticion = construirPeticionHogar(datos as DatosHogar, hogar.id)
  } catch (e) {
    return sinGasto({ error: e instanceof Error ? e.message : String(e) }, 422)
  }
  peticion.externalId = `poliza:${polizaId}`
  return {
    peticion,
    motivo: 'defensa-cartera-hogar',
    supuestos: pre.supuestos,
    fuenteRiesgo: pre.fuenteRiesgo,
  }
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

function numero(v: unknown): number | null {
  if (typeof v === 'string' && v.trim() === '') return null
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

function esObjetoPlano(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function hoyIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Solo se aceptan correcciones CON valor: un campo vacío no borra lo supuesto. */
function limpiarCorrecciones<T>(c: Record<string, unknown> | undefined): Partial<T> {
  if (!c || typeof c !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(c)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'string' && v.trim() === '') continue
    out[k] = typeof v === 'string' ? v.trim() : v
  }
  return out as Partial<T>
}
