import type {
  ContratoLaboral,
  IncidenciaMes,
  TablasCotizacion,
  NominaDesglose,
  Devengos,
  DeduccionesEmpleado,
  CuotaPatronal,
} from './tipos'

function r2(n: number): number {
  return Math.round(n * 100) / 100
}

export function calcularNomina(
  contrato: ContratoLaboral,
  incidencias: IncidenciaMes[],
  tablas: TablasCotizacion,
  periodo: string,
): NominaDesglose {
  const { tipoContrato, jornadaPct, salarioBase, grupoCotizacion, irpfRetencionPct, conceptosFijos } = contrato

  // 1. Salario base proporcional a jornada
  const salarioEfectivo = r2(salarioBase * (jornadaPct / 100))

  // 2. Complementos fijos
  const complementosFijos = conceptosFijos.map(c => ({ concepto: c.nombre, importe: r2(c.importe) }))
  const totalComplementos = r2(complementosFijos.reduce((s, c) => s + c.importe, 0))

  // 3. Horas extra: €/hora = salarioBase / 160h (jornada completa mensual)
  const precioHora = r2(salarioBase / 160)
  const horasExtra = r2(
    incidencias
      .filter(i => i.tipo === 'horas_extra')
      .reduce((s, i) => s + (i.horas ?? 0) * precioHora, 0)
  )

  // 4. Pluses puntuales
  const pluses = incidencias
    .filter(i => i.tipo === 'plus_puntual')
    .map(i => ({ concepto: i.concepto, importe: r2(i.importe ?? 0) }))
  const totalPluses = r2(pluses.reduce((s, p) => s + p.importe, 0))

  // 5. Descuentos (ausencias injustificadas, baja IT, vacaciones sin retribuir)
  const diasLaborables = tablas.diasLaborablesMes
  const importeDia = r2(salarioEfectivo / diasLaborables)
  const descuentos = r2(
    incidencias
      .filter(i => ['ausencia_injustificada', 'baja_it', 'vacaciones'].includes(i.tipo))
      .reduce((s, i) => {
        if (i.importe != null) return s + i.importe
        return s + (i.dias ?? 0) * importeDia
      }, 0)
  )

  const totalDevengado = r2(salarioEfectivo + totalComplementos + horasExtra + totalPluses - descuentos)

  const devengos: Devengos = {
    salarioBase: salarioEfectivo,
    complementosFijos,
    horasExtra,
    pluses,
    descuentos,
    total: totalDevengado,
  }

  // 6. Base de cotización (clamp entre min y max del grupo)
  const { min, max } = tablas.bases[grupoCotizacion]
  const baseCotizacion = Math.max(min, Math.min(max, totalDevengado))

  // 7. Deducciones SS trabajador
  const tipos = tablas.tipos
  const desempleoTipo =
    tipoContrato === 'indefinido'
      ? tipos.desempleo_indefinido.trabajador
      : tipos.desempleo_temporal.trabajador

  const cc = r2(baseCotizacion * tipos.contingencias_comunes.trabajador)
  const desemp = r2(baseCotizacion * desempleoTipo)
  const fpTrab = r2(baseCotizacion * tipos.fp.trabajador)
  const irpf = r2(totalDevengado * (irpfRetencionPct / 100))

  const deducciones: DeduccionesEmpleado = {
    contingencias_comunes: cc,
    desempleo: desemp,
    fp: fpTrab,
    irpf,
    total: r2(cc + desemp + fpTrab + irpf),
  }

  const netoAPagar = r2(totalDevengado - deducciones.total)

  // 8. Cuota patronal (informativa)
  const desempleoEmpresa =
    tipoContrato === 'indefinido'
      ? tipos.desempleo_indefinido.empresa
      : tipos.desempleo_temporal.empresa

  const ccEmp = r2(baseCotizacion * tipos.contingencias_comunes.empresa)
  const desempEmp = r2(baseCotizacion * desempleoEmpresa)
  const fogasaEmp = r2(baseCotizacion * tipos.fogasa)
  const fpEmp = r2(baseCotizacion * tipos.fp.empresa)
  const atEpEmp = r2(baseCotizacion * tipos.at_ep)

  const cuotaPatronal: CuotaPatronal = {
    contingencias_comunes: ccEmp,
    desempleo: desempEmp,
    fogasa: fogasaEmp,
    fp: fpEmp,
    at_ep: atEpEmp,
    total: r2(ccEmp + desempEmp + fogasaEmp + fpEmp + atEpEmp),
  }

  return {
    periodo,
    devengos,
    baseCotizacion,
    baseIrpf: totalDevengado,
    deducciones,
    netoAPagar,
    cuotaPatronal,
    costeTotalEmpresa: r2(totalDevengado + cuotaPatronal.total),
  }
}
