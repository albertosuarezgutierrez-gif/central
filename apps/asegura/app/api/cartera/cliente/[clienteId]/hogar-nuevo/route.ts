import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { cotizar } from '@/lib/codeoscopic/cotizar'
import {
  prepararRetarificacionNuevaHogar,
  respuestaRetarificacion,
  type CuerpoRetarificacion,
} from '@/lib/retarificar-cartera'
import { direccionDesdeCatastro, type CatastroHogar } from '@/lib/codeoscopic/desde-cartera-hogar'
import { paramsDnploc } from '@central/core-catastro'
import { bajarCatastro } from '@central/core-catastro/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// La cotización del vendor puede tardar hasta 150 s (documentado). Sin este
// margen Vercel corta antes y nos quedamos sin saber si nos han cobrado — que
// es justo el estado que el libro de consumo tiene que contar como gasto.
export const maxDuration = 180

const RE_REF20 = /^[0-9A-Z]{20}$/

/**
 * Cotiza HOGAR para un cliente que HOY no tiene ninguna póliza: una
 * oportunidad nueva, presupuestada desde el Catastro (`/correduria/hogar` en
 * plataforma → aquí, botón «Pedir precio real ↗»). **Esta ruta GASTA 0,50€.**
 *
 * A diferencia de `POST /api/cartera/polizas/{id}/retarificar`, aquí no hay
 * ficha de la que sacar el riesgo: el Catastro se consulta DE NUEVO, en el
 * servidor, en cada llamada — nunca se confía en lo que el navegador diga que
 * vio, porque de eso depende m²/año/CP, que son parte del precio.
 *
 * Toda la orquestación (revisar gratis antes de gastar, construir el cuerpo
 * del vendor) vive en `lib/retarificar-cartera.ts`, compartida con la
 * retarificación de una póliza existente: dos copias de lo que gasta dinero
 * divergen, y la que diverge es la que nadie mira.
 */
export async function POST(req: Request, ctx: { params: Promise<{ clienteId: string }> }) {
  const session = await requireSession()
  const { clienteId } = await ctx.params

  const cuerpo = (await req.json().catch(() => ({}))) as CuerpoRetarificacion & { referencia?: unknown }

  const referencia = typeof cuerpo.referencia === 'string' ? cuerpo.referencia.replace(/[\s-]/g, '').toUpperCase() : ''
  if (!RE_REF20.test(referencia)) {
    return NextResponse.json(
      {
        error:
          'Falta (o no vale) la referencia catastral de 20 caracteres del piso. La de 14 es la del ' +
          'edificio y no trae m² ni año.',
        gastado: '0,00€',
      },
      { status: 422 },
    )
  }

  let catastro: CatastroHogar | null
  try {
    const datos = await bajarCatastro(referencia)
    if (datos === null) {
      return NextResponse.json(
        { error: 'El Catastro no tiene nada con esa referencia. No se cotiza sin saber el riesgo.', gastado: '0,00€' },
        { status: 404 },
      )
    }
    catastro = {
      metrosCuadrados: datos.superficie,
      anioConstruccion: datos.anioConstruccion,
      codigoPostal: datos.codigoPostal,
      uso: datos.uso,
      direccion: direccionDesdeCatastro(paramsDnploc(datos.direccion)),
    }
  } catch (e) {
    // Un fallo de RED no es «no existe»: es «no se ha podido mirar». No se
    // cotiza sobre un riesgo que no se ha podido leer.
    return NextResponse.json(
      {
        error: `No se ha podido consultar el Catastro (${e instanceof Error ? e.message : String(e)}). No se cotiza sin el riesgo.`,
        gastado: '0,00€',
      },
      { status: 503 },
    )
  }

  const p = await prepararRetarificacionNuevaHogar({
    clienteId,
    solicitadoPor: session.nombre ?? 'desconocido',
    cuerpo,
    catastro,
  })
  // Corta ANTES del vendor (422 faltan datos · 409 ramo · 404 cliente · 503):
  // esas respuestas llevan `gastado: '0,00€'` y son el caso normal.
  if (p.estado === 'corte') {
    return NextResponse.json(p.respuesta.cuerpo, { status: p.respuesta.status })
  }

  // ── La única línea que cuesta dinero, por el único embudo ────────────────
  const r = await cotizar(p.peticion)

  const res = respuestaRetarificacion(r, p)
  return NextResponse.json(res.cuerpo, { status: res.status })
}
