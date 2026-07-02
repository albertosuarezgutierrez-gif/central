import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getResumenFinanciero, getResumenPilar } from '@/lib/finanzas'
import { getProyeccionFiscal } from '@/lib/proyeccion-fiscal'
import { compararDeclaracion, importesDe, type ComparativaDeclaracion } from '@/lib/fiscal-deducciones'

export const dynamic = 'force-dynamic'

// GET /api/finanzas/comparativa?year= — estado de la declaración HOY y a FIN DE AÑO,
// cada uno en las dos modalidades (solo titular vs conjunta con el cónyuge).
// Pensado para responder la pregunta operativa: "¿cómo voy y cómo acabaría? ¿me
// interesa meter más gasto deducible antes del 31/12?"
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') || '') || new Date().getFullYear()

  try {
    const [resumen, pilar] = await Promise.all([
      getResumenFinanciero(session.id, year, 0),
      getResumenPilar(session.id, year, 0),
    ])
    const proy = await getProyeccionFiscal(session.id, year, resumen)

    const imp = importesDe(year)
    const descendientes = resumen.deducciones.descendientes.map(d => ({
      nombre: d.nombre,
      fechaNacimiento: d.fechaNacimiento,
      gradoDiscapacidad: d.gradoDiscapacidad,
      computoCompleto: d.computoCompleto,
    }))

    const comparar = (baseSinReduccion: number): ComparativaDeclaracion =>
      compararDeclaracion(
        baseSinReduccion,
        resumen.correduria.retencionesEstimadas, // retenciones REALES del titular
        pilar.rendimientoNeto,
        pilar.retenciones,
        resumen.deducciones.perfil,
        descendientes,
        year,
        imp,
      )

    // HOY: base devengada sin la reducción por conjunta (compararDeclaracion la aplica).
    const baseHoy = resumen.fiscal.baseImponibleSinReduccion
    // FIN DE AÑO: lo devengado + reservas futuras + recurrentes proyectados.
    // (baseProyectada viene sobre la base CON reducción → se traslada el delta.)
    const deltaFuturo = proy.baseProyectada - proy.baseReal
    const baseFin = Math.max(0, baseHoy + deltaFuturo)

    const hoy = comparar(baseHoy)
    const finAnio = comparar(baseFin)

    // Palanca de gasto sobre la base PROYECTADA del escenario recomendado a fin de año:
    // tipo marginal, cuánto gasto falta para bajar de tramo y ahorro estimado.
    const baseRef = finAnio.recomendacion === 'conjunta' ? finAnio.conjunta.base : finAnio.separada.titular.base
    const tramo = [...imp.tramos].reverse().find(t => baseRef >= t.desde) ?? imp.tramos[0]
    const idx = imp.tramos.indexOf(tramo)
    const previo = idx > 0 ? imp.tramos[idx - 1] : null
    const gastoParaBajarTramo = previo ? Math.max(0, baseRef - tramo.desde) : null
    const palanca = {
      tipoMarginal: tramo.tipo,
      ahorroPorMilGasto: Math.round(1000 * tramo.tipo),
      gastoParaBajarTramo,
      tipoPrevio: previo?.tipo ?? null,
      // Bajar de tramo ahorra el diferencial marginal sobre el tramo vaciado; el resto
      // del gasto sigue ahorrando al tipo del tramo inferior (no hay efecto acantilado).
      ahorroBajarTramo: previo && gastoParaBajarTramo ? Math.round(gastoParaBajarTramo * tramo.tipo) : null,
    }

    return NextResponse.json({
      year,
      hoy,
      finAnio,
      bases: { hoy: baseHoy, finAnio: baseFin, deltaFuturo: Math.round(deltaFuturo) },
      palanca,
      mesesRestantes: proy.mesesRestantes,
    })
  } catch (e) {
    console.error('[/api/finanzas/comparativa]', e)
    return NextResponse.json({ error: 'Error al calcular comparativa' }, { status: 500 })
  }
}
