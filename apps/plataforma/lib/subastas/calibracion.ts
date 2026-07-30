// ────────────────────────────────────────────────────────────────────────────
// Calibración con resultados REALES: lee las subastas concluidas con resultado
// capturado (`capturarResultados`) y delega el cálculo en el módulo puro.
// Con el corpus recién nacido devuelve [] — la UI simplemente no pinta nada.
// ────────────────────────────────────────────────────────────────────────────
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  calibracionAdjudicaciones,
  calibracionPorCargas,
  referenciaPorZona,
  type CalibracionCargas,
  type CalibracionZona,
  type ReferenciaZona,
} from '@central/module-subastas'

export async function calibracionResultados(): Promise<CalibracionZona[]> {
  const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT provincia, valor_subasta, importe_adjudicacion, resultado
    FROM subastas
    WHERE es_inmueble = true AND resultado IS NOT NULL
  `)
  return calibracionAdjudicaciones(
    filas.map((f) => ({
      provincia: f.provincia,
      valorSubasta: f.valor_subasta == null ? null : Number(f.valor_subasta),
      importeAdjudicacion: f.importe_adjudicacion == null ? null : Number(f.importe_adjudicacion),
      resultado: f.resultado,
    })),
  )
}

/**
 * Calibración cruzada con las CARGAS leídas: ¿el mercado castiga de verdad a las
 * fincas que arrastran cargas anteriores? Es la comprobación empírica de la regla
 * que aplica `cargasQueSubsisten`. Si el grupo `con_cargas` queda desierto mucho
 * más a menudo, el descuento exigido a esas fincas debería subir.
 *
 * Con el corpus recién nacido devuelve los tres grupos a cero: la UI dirá «aún
 * sin datos» en vez de pintar un número sin muestra.
 */
export async function calibracionCargas(): Promise<CalibracionCargas[]> {
  const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT provincia, valor_subasta, importe_adjudicacion, resultado, cargas, cargas_conocidas
    FROM subastas
    WHERE es_inmueble = true AND resultado IS NOT NULL
  `)
  return calibracionPorCargas(
    filas.map((f) => ({
      provincia: f.provincia,
      valorSubasta: f.valor_subasta == null ? null : Number(f.valor_subasta),
      importeAdjudicacion: f.importe_adjudicacion == null ? null : Number(f.importe_adjudicacion),
      resultado: f.resultado,
      cargasSubsistentes: f.cargas == null ? null : Number(f.cargas),
      cargasConocidas: f.cargas_conocidas ?? false,
    })),
  )
}

/**
 * Serie de €/m² PROPIA a partir de las tasaciones que las escrituras de hipoteca
 * pactaron «a efectos de subasta» y que el lector registral extrae de las
 * certificaciones. A diferencia de los comparables de portales, son tasaciones
 * reales — pero HISTÓRICAS, así que se actualizan con el IPV del INE que ya se
 * ingiere en `mercado_indices` (un año sin índice no se actualiza, no se estima).
 */
export async function valoracionPropiaPorZona(): Promise<ReferenciaZona[]> {
  const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT municipio, valoracion_pactada, valoracion_pactada_anio,
           COALESCE(superficie_catastro, superficie) AS superficie
    FROM subastas
    WHERE valoracion_pactada > 0 AND valoracion_pactada_anio IS NOT NULL
      AND municipio IS NOT NULL
      AND COALESCE(superficie_catastro, superficie) > 0
  `)

  // ⚠️ SIN factores de actualización, a propósito: `mercado_indices` es un
  // almacén clave-valor con la ÚLTIMA variación del IPV (p. ej. `ipv_andalucia_va`
  // = 12,4% en T3 2025), no una serie histórica por año. Con eso no se puede
  // llevar una tasación de 2009 a euros de hoy, y estimar el factor a ojo
  // convertiría una tasación real en un número inventado.
  //
  // Así que la serie se publica SOLO a valor histórico (`eurM2Actualizado` queda
  // en null y la UI debe decir de qué años es la muestra). Para completarlo hay
  // que ingerir la serie completa del IPV del INE (tabla Tempus 25171, ya se sabe
  // consultar) y pasar aquí `{ [año]: factor }` — el módulo puro ya lo soporta.
  const factores: Record<number, number> = {}

  return referenciaPorZona(
    filas.map((f) => ({
      zona: String(f.municipio).toUpperCase(),
      anio: Number(f.valoracion_pactada_anio),
      importe: Number(f.valoracion_pactada),
      superficie: f.superficie == null ? null : Number(f.superficie),
    })),
    factores,
  )
}
