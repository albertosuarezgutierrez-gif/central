// Lógica PURA del briefing consolidado: agrega los resúmenes financieros de los
// negocios de una cuenta y compone el texto del email. Sin red ni BD → testeable
// con `node --test`. La E/S (Prisma, fetch financiero, Resend) vive en el endpoint.
// El formateo de € se delega en el helper puro ./dinero (sin deps, seguro para el
// módulo puro; no se importa de ./financiero para no arrastrar financiero→db→prisma).
import { eur } from './dinero.ts'

function fmtEur(n: number): string {
  return eur(n)
}

export type NegocioResumen = {
  nombre: string
  sector: string
  ingresosYtd: number
  gastosYtd: number
  resultadoYtd: number
  disponible: boolean
  nota?: string
}

export type BriefingTotales = {
  ingresos: number
  gastos: number
  resultado: number
  negocios: number
  disponibles: number
}

export function agregarBriefing(items: NegocioResumen[]): BriefingTotales {
  return items.reduce<BriefingTotales>((acc, n) => {
    acc.negocios += 1
    if (n.disponible) {
      acc.disponibles += 1
      acc.ingresos += n.ingresosYtd
      acc.gastos += n.gastosYtd
      acc.resultado += n.resultadoYtd
    }
    return acc
  }, { ingresos: 0, gastos: 0, resultado: 0, negocios: 0, disponibles: 0 })
}

export function formatBriefingTexto(
  nombreCuenta: string,
  items: NegocioResumen[],
  totales: BriefingTotales,
  anio: number,
): { asunto: string; cuerpo: string } {
  const asunto = `📊 Briefing semanal ${anio} — ${nombreCuenta}`
  const lineas = items.map(n =>
    n.disponible
      ? `• ${n.nombre} (${n.sector}): ${fmtEur(n.ingresosYtd)} ingresos − ${fmtEur(n.gastosYtd)} gastos = ${fmtEur(n.resultadoYtd)}`
      : `• ${n.nombre} (${n.sector}): sin datos${n.nota ? ` — ${n.nota}` : ''}`,
  )
  const cuerpo = [
    `Hola ${nombreCuenta}, este es el resumen de tus negocios (año ${anio}, acumulado):`,
    '',
    ...lineas,
    '',
    `TOTAL consolidado (${totales.disponibles}/${totales.negocios} con datos):`,
    `  Ingresos:  ${fmtEur(totales.ingresos)}`,
    `  Gastos:    ${fmtEur(totales.gastos)}`,
    `  Resultado: ${fmtEur(totales.resultado)}`,
  ].join('\n')
  return { asunto, cuerpo }
}
