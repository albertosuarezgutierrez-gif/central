// 🧾 Cazador de deducciones — "dinero que dejas sobre la mesa".
// Revisa los gastos del periodo marcados como NO deducibles (personal) y, con la IA GRATIS de la
// pasarela, detecta los que en realidad parecen de la ACTIVIDAD (negocio) o de los PISOS (renta) y
// por tanto serían deducibles. Estima el ahorro fiscal al tramo marginal. La IA LEE y JUZGA, nunca
// inventa cifras: los importes salen tal cual de `getGastosControl`. Solo SUGIERE — la reclasificación
// la confirma Alberto en el libro (selector de negocio por fila). Degrada sin romper.
import { getGastosControl } from './finanzas'
import { aiComplete } from './ai-client'

// Mismo criterio de clasificación que POST /api/finanzas/gastos/sugerir (fuente de verdad del prompt).
const SYSTEM = `Eres el contable de Alberto (persona física, España; correduría de seguros + pisos turísticos en alquiler). Te doy UN cargo bancario que HOY está marcado como gasto personal. Decide si en realidad es deducible.

Buckets:
- "negocio": gasto de su actividad económica (correduría: software/CRM, hosting, gasolina/combustible para visitar clientes, material de oficina, cuota de autónomos/TGSS, formación, telefonía profesional…).
- "renta": gasto de sus pisos turísticos en alquiler (suministros luz/agua/internet del piso, reparaciones, mobiliario, comunidad de propietarios, IBI del piso, seguro del piso, plataformas Booking/Airbnb/Smoobu, limpieza…).
- "no_deducible": gasto personal/familiar (supermercado, restaurantes de ocio, ropa, farmacia personal, colegios, Bizum a amigos…).

REGLA CLAVE: sé PRUDENTE. Marca "negocio" o "renta" SOLO si hay indicio razonable de que lo es. Ante la duda, "no_deducible". No fuerces deducciones que Hacienda rechazaría.

Responde SOLO JSON, sin markdown:
{"bucket":"negocio|renta|no_deducible","motivo":"breve, máx 90 chars"}`

export type CandidatoDeduccion = {
  id: string
  fecha: string | null
  concepto: string
  banco: string
  importe: number
  bucketSugerido: 'negocio' | 'renta'
  destinoSugerido: 'turistico_pisos' | null  // solo cuando es inequívoco (renta → pisos); negocio se deja a mano
  motivo: string
}

export type CazaResultado = {
  candidatos: CandidatoDeduccion[]
  totalDeducible: number       // suma de los importes marcados deducibles por la IA
  ahorroEstimado: number       // totalDeducible × tramo marginal
  tramoMarginal: number        // % (0-1) usado para la estimación
  analizados: number           // cuántos cargos llegó a mirar la IA (puede ser < candidatos por tiempo)
  revisadosTotal: number       // cuántos no-deducibles había en el periodo (contexto)
}

const IMPORTE_MIN = 20         // por debajo de esto no merece la pena (ruido de consumo)
const MAX_CANDIDATOS = 20      // techo de llamadas a la IA por pasada
const PRESUPUESTO_MS = 45_000  // deja margen bajo maxDuration=60 del route

export async function cazarDeducciones(
  cuentaId: string, year: number, quarter: number,
  desde: string | undefined, hasta: string | undefined, tramoMarginal: number,
): Promise<CazaResultado> {
  const control = await getGastosControl(cuentaId, year, quarter, desde, hasta)
  const noDeducible = control.buckets.find(b => b.bucket === 'no_deducible')?.movs ?? []
  // Los cargos personales más grandes primero (mayor ahorro potencial), filtrando ruido de consumo.
  const cola = noDeducible
    .filter(m => m.importe >= IMPORTE_MIN)
    .sort((a, b) => b.importe - a.importe)
    .slice(0, MAX_CANDIDATOS)

  const candidatos: CandidatoDeduccion[] = []
  const inicio = Date.now()
  let analizados = 0
  for (const m of cola) {
    if (Date.now() - inicio > PRESUPUESTO_MS) break
    analizados++
    try {
      const raw = await aiComplete([
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Cargo de ${m.importe.toFixed(2)}€ (banco ${m.banco}): ${m.concepto}` },
      ], { timeoutMs: 8_000 })
      const clean = raw.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean) as { bucket?: string; motivo?: string }
      if (parsed.bucket === 'negocio' || parsed.bucket === 'renta') {
        candidatos.push({
          id: m.id,
          fecha: m.fecha,
          concepto: m.concepto,
          banco: m.banco,
          importe: m.importe,
          bucketSugerido: parsed.bucket,
          destinoSugerido: parsed.bucket === 'renta' ? 'turistico_pisos' : null,
          motivo: (parsed.motivo || '').slice(0, 90),
        })
      }
    } catch {
      // Un cargo que la IA no pudo juzgar (timeout/parse) simplemente no se sugiere. No rompe la pasada.
    }
  }

  const totalDeducible = candidatos.reduce((s, c) => s + c.importe, 0)
  return {
    candidatos,
    totalDeducible,
    ahorroEstimado: totalDeducible * tramoMarginal,
    tramoMarginal,
    analizados,
    revisadosTotal: noDeducible.length,
  }
}
