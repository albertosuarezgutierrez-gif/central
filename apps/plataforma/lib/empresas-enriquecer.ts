// Orquestador del enriquecimiento de empresas: tope de gasto mensual + llamada al proveedor + upsert +
// ledger de coste. La lógica de proveedor vive en empresas-einforma (aislada). Aquí va la BD y el presupuesto.
import { prisma } from '@/lib/db'
import { enriquecerEinforma, einformaConfigurado, EinformaNoConfigurado, type DatosFinancieros } from '@/lib/empresas-einforma'

/** Tope de gasto mensual en € del enriquecimiento (default 50€). `0` = sin límite. */
function topeMensualEur(): number {
  const n = Number(process.env.EMPRESAS_ENRIQUECER_TOPE_MENSUAL_EUR ?? '50')
  return Number.isFinite(n) ? n : 50
}
/** Coste estimado por empresa enriquecida (informe financiero en pack, ~12€). Ajustable por env. */
function costePorEmpresaEur(): number {
  const n = Number(process.env.EMPRESAS_ENRIQUECER_COSTE_EUR ?? '12')
  return Number.isFinite(n) ? n : 12
}

/** Gasto de enriquecimiento del mes en curso (suma del ledger). */
export async function getGastoMesEur(): Promise<number> {
  const rows = await prisma.$queryRaw<{ total: number | null }[]>`
    SELECT COALESCE(SUM(coste_eur), 0)::float AS total
    FROM empresas_enriquecimiento_coste
    WHERE date_trunc('month', creado_en) = date_trunc('month', now())`
  return rows[0]?.total ?? 0
}

export interface ResultadoEnriquecimiento {
  ok: boolean
  empresaNorm: string
  datos?: DatosFinancieros
  coste?: number
  gastoMes?: number
  error?: 'no_configurado' | 'sin_cif' | 'tope_alcanzado' | 'proveedor'
  mensaje?: string
}

/**
 * Enriquece una empresa (por CIF) respetando el tope de gasto mensual. Registra el coste en el ledger y
 * hace upsert de los datos financieros. NO recalcula el score (eso lo hace la lectura getEmpresasYRadar).
 */
export async function enriquecerEmpresa(empresaNorm: string, cif?: string | null): Promise<ResultadoEnriquecimiento> {
  if (!einformaConfigurado()) {
    return { ok: false, empresaNorm, error: 'no_configurado', mensaje: 'Enriquecimiento pendiente: falta contratar la API de eInforma.' }
  }
  if (!cif) {
    return { ok: false, empresaNorm, error: 'sin_cif', mensaje: 'Falta el CIF para enriquecer esta empresa.' }
  }
  const tope = topeMensualEur()
  const coste = costePorEmpresaEur()
  const gasto = await getGastoMesEur()
  if (tope > 0 && gasto + coste > tope) {
    return { ok: false, empresaNorm, error: 'tope_alcanzado', gastoMes: gasto, mensaje: `Tope de gasto mensual alcanzado (${gasto.toFixed(2)}€ de ${tope}€).` }
  }

  let datos: DatosFinancieros
  try {
    datos = await enriquecerEinforma(cif)
  } catch (e) {
    if (e instanceof EinformaNoConfigurado) {
      return { ok: false, empresaNorm, error: 'no_configurado', mensaje: 'Enriquecimiento pendiente: falta contratar la API de eInforma.' }
    }
    return { ok: false, empresaNorm, error: 'proveedor', mensaje: e instanceof Error ? e.message : 'Error del proveedor' }
  }

  await prisma.$executeRaw`
    INSERT INTO empresas_enriquecimiento (
      empresa_norm, cif, razon_social, cnae, facturacion, n_empleados, patrimonio_neto,
      ebitda_n, ebitda_n1, fondo_maniobra, ultimo_deposito, incidencias_pago, incidencias_detalle,
      deuda_financiera, deuda_ebitda, refinanciaciones, fuente, coste_eur, actualizado_en)
    VALUES (
      ${empresaNorm}, ${datos.cif ?? cif}, ${datos.razonSocial}, ${datos.cnae}, ${datos.facturacion}, ${datos.nEmpleados}, ${datos.patrimonioNeto},
      ${datos.ebitdaN}, ${datos.ebitdaN1}, ${datos.fondoManiobra}, ${datos.ultimoDeposito}::date, ${datos.incidenciasPago}, ${datos.incidenciasDetalle},
      ${datos.deudaFinanciera}, ${datos.deudaEbitda}, ${datos.refinanciaciones}, 'einforma', ${coste}, now())
    ON CONFLICT (empresa_norm) DO UPDATE SET
      cif = EXCLUDED.cif, razon_social = EXCLUDED.razon_social, cnae = EXCLUDED.cnae,
      facturacion = EXCLUDED.facturacion, n_empleados = EXCLUDED.n_empleados, patrimonio_neto = EXCLUDED.patrimonio_neto,
      ebitda_n = EXCLUDED.ebitda_n, ebitda_n1 = EXCLUDED.ebitda_n1, fondo_maniobra = EXCLUDED.fondo_maniobra,
      ultimo_deposito = EXCLUDED.ultimo_deposito, incidencias_pago = EXCLUDED.incidencias_pago,
      incidencias_detalle = EXCLUDED.incidencias_detalle, deuda_financiera = EXCLUDED.deuda_financiera,
      deuda_ebitda = EXCLUDED.deuda_ebitda, refinanciaciones = EXCLUDED.refinanciaciones,
      coste_eur = EXCLUDED.coste_eur, actualizado_en = now()`

  await prisma.$executeRaw`
    INSERT INTO empresas_enriquecimiento_coste (empresa_norm, coste_eur, fuente)
    VALUES (${empresaNorm}, ${coste}, 'einforma')`

  return { ok: true, empresaNorm, datos, coste, gastoMes: gasto + coste }
}
