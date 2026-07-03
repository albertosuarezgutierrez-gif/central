// Estado de la declaración HOY y a FIN DE AÑO, cada uno en las dos modalidades
// (solo titular vs conjunta). Extraído de /api/finanzas/comparativa para poder
// calcularlo también en el server component de /finanzas/fiscal (SSR) reutilizando
// el `resumen` ya calculado y evitar el doble cálculo + el spinner "Calculando…".
import { getResumenFinanciero, getResumenPilar, type ResumenFinanciero } from './finanzas'
import { getProyeccionFiscal } from './proyeccion-fiscal'
import { compararDeclaracion, importesDe, type ComparativaDeclaracion } from './fiscal-deducciones'

export type EstadoDeclaracion = {
  year: number
  hoy: ComparativaDeclaracion
  finAnio: ComparativaDeclaracion
  bases: { hoy: number; finAnio: number; deltaFuturo: number }
  palanca: {
    tipoMarginal: number
    ahorroPorMilGasto: number
    gastoParaBajarTramo: number | null
    tipoPrevio: number | null
    ahorroBajarTramo: number | null
  }
  mesesRestantes: number
}

export async function calcularEstadoDeclaracion(
  cuentaId: string,
  year: number,
  resumenPre?: ResumenFinanciero,
): Promise<EstadoDeclaracion> {
  // Reutiliza el `resumen` si ya lo calculó el llamante (SSR); si no, lo calcula.
  const resumen = resumenPre ?? (await getResumenFinanciero(cuentaId, year, 0))
  const [pilar, proy] = await Promise.all([
    getResumenPilar(cuentaId, year, 0),
    getProyeccionFiscal(cuentaId, year, resumen),
  ])

  const imp = importesDe(year)
  const descendientes = resumen.deducciones.descendientes.map(d => ({
    nombre: d.nombre,
    fechaNacimiento: d.fechaNacimiento,
    gradoDiscapacidad: d.gradoDiscapacidad,
    computoCompleto: d.computoCompleto,
  }))

  const comparar = (
    baseSinReduccion: number,
    retencionesTitular: number,
    rendimientoConyuge: number,
    retencionesConyuge: number,
  ): ComparativaDeclaracion =>
    compararDeclaracion(
      baseSinReduccion,
      retencionesTitular,
      rendimientoConyuge,
      retencionesConyuge,
      resumen.deducciones.perfil,
      descendientes,
      year,
      imp,
    )

  // HOY: base devengada sin la reducción por conjunta (compararDeclaracion la aplica),
  // retenciones y datos de Pilar reales a fecha de hoy.
  const baseHoy = resumen.fiscal.baseImponibleSinReduccion
  const retHoy = resumen.correduria.retencionesEstimadas
  const hoy = comparar(baseHoy, retHoy, pilar.rendimientoNeto, pilar.retenciones)

  // FIN DE AÑO: base devengada + reservas futuras + recurrentes proyectados. Para no
  // sesgar el resultado hacia "a pagar", se ANUALIZAN también las retenciones y el
  // rendimiento/retenciones de Pilar (run-rate del devengado a hoy). Orientativo.
  const deltaFuturo = proy.baseProyectada - proy.baseReal
  const baseFin = Math.max(0, baseHoy + deltaFuturo)
  const mesesTranscurridos = 12 - proy.mesesRestantes
  const factorAnual = mesesTranscurridos > 0 ? 12 / mesesTranscurridos : 1
  const finAnio = comparar(
    baseFin,
    retHoy * factorAnual,
    pilar.rendimientoNeto * factorAnual,
    pilar.retenciones * factorAnual,
  )

  // Palanca de gasto sobre la base PROYECTADA del escenario recomendado a fin de año.
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
    ahorroBajarTramo: previo && gastoParaBajarTramo ? Math.round(gastoParaBajarTramo * tramo.tipo) : null,
  }

  return {
    year,
    hoy,
    finAnio,
    bases: { hoy: baseHoy, finAnio: baseFin, deltaFuturo: Math.round(deltaFuturo) },
    palanca,
    mesesRestantes: proy.mesesRestantes,
  }
}
