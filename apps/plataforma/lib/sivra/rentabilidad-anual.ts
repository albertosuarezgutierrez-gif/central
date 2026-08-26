// lib/sivra/rentabilidad-anual.ts — facturación mes a mes contra el mismo mes del año anterior,
// con la fecha en que el motor tomó cada piso marcada encima.
//
// Petición de Alberto (26/08/2026): «comparar la evolución de reservas de un año para otro […]
// y tener en cuenta la fecha que activamos 100% nuestros precios dinámicos, a ver si sacamos
// con nuestras ideas más rentabilidad».
//
// 🚨 LO QUE HACE HONESTA ESTA COMPARACIÓN: un mes de este año y el mismo mes del año pasado NO
// son la misma cosa según dónde caiga hoy, y pintarlos juntos sin decirlo es el error clásico.
// Hay TRES regímenes y cada uno se compara contra su equivalente:
//
//   · CERRADO   (mes ya pasado)      → estancias consumidas contra estancias consumidas.
//   · EN CURSO  (el mes de hoy)      → lo que va del mes contra lo que iba del mes el año
//                                      pasado A LA MISMA ALTURA (no contra el mes entero, que
//                                      es la trampa que hace parecer que este año va fatal).
//   · CARTERA   (meses futuros)      → lo que hay reservado HOY contra lo que había reservado
//                                      el mismo día del año pasado. Es la comparación de RITMO,
//                                      la única que dice si vas por delante o por detrás.
//
// La regla que unifica los tres: una reserva cuenta en el mes M del año Y si su noche de entrada
// cae en M y **se reservó antes del corte de ese año** (hoy, o el mismo día del año anterior).
// Como `incomes.reserved_at` está informado al 100% desde 2024, el corte es exacto.
//
// ⚠️ SESGO CONOCIDO Y DECLARADO: una reserva cancelada se BORRA de `incomes`, así que la cifra
// del año pasado es «lo que sobrevivió» y la de este año incluye reservas que aún pueden caerse.
// La cartera de este año está, por construcción, algo inflada. No se corrige (no hay histórico
// de cancelaciones anterior al 12/08/2026): se DICE, que es lo que se puede hacer.
//
// ⚠️ Y LA ATRIBUCIÓN NO ES LA COMPARACIÓN: que un mes vaya mejor no significa que sea el motor.
// `atribucion` solo dice si el motor MANDABA en ese mes; nada más. Un mes 'no' es contexto.
//
// Módulo PURO (sin BD ni `@/`), testeable con `node --test`.

export type Regimen = 'cerrado' | 'en_curso' | 'cartera'
/** ¿Mandaba el motor en ese mes? NO es una afirmación de causa: solo de cobertura. */
export type Atribucion = 'no' | 'parcial' | 'si'

export type FilaMesPiso = {
  property_id: string
  /** 'YYYY-MM' de la noche de entrada */
  mes: string
  bruto: number
  noches: number
  reservas: number
}

export type Celda = { bruto: number; noches: number; reservas: number }

export type MesComparado = {
  property_id: string
  /** 1-12 */
  mesNum: number
  /** 'YYYY-MM' del año en curso */
  mes: string
  regimen: Regimen
  atribucion: Atribucion
  actual: Celda
  previo: Celda
  /** bruto actual − bruto previo. Siempre calculable (0 es 0 medido, no «no lo sé»). */
  deltaEur: number
  /** null cuando el año pasado fue 0: un % sobre cero no significa nada. */
  deltaPct: number | null
}

const VACIA: Celda = { bruto: 0, noches: 0, reservas: 0 }

/** Mismo día del calendario, un año antes. El 29-feb se recorta al 28 (no existe el año siguiente). */
export function cortePrevio(hoyISO: string): string {
  const [y, m, d] = hoyISO.split('-').map(Number)
  const anio = y - 1
  const ultimoDia = new Date(Date.UTC(anio, m, 0)).getUTCDate()
  const dia = Math.min(d, ultimoDia)
  return `${anio}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/** Régimen de un mes 'YYYY-MM' respecto de hoy. */
export function regimenDeMes(mes: string, hoyISO: string): Regimen {
  const mesHoy = hoyISO.slice(0, 7)
  if (mes < mesHoy) return 'cerrado'
  if (mes === mesHoy) return 'en_curso'
  return 'cartera'
}

/**
 * ¿Mandaba el motor en ese mes? `si` desde el mes SIGUIENTE al go-live (el mes del go-live es
 * mixto y se marca `parcial`), `no` antes. Sin go-live conocido → `no`.
 */
export function atribucionMotor(mes: string, goLiveISO: string | undefined): Atribucion {
  if (!goLiveISO) return 'no'
  const mesGoLive = goLiveISO.slice(0, 7)
  if (mes < mesGoLive) return 'no'
  if (mes === mesGoLive) return 'parcial'
  return 'si'
}

/**
 * Serie comparada por piso y mes. `filas` trae UNA fila por (piso, mes) de CADA año, ya
 * recortada por el corte de su año en el SQL — aquí solo se emparejan y se etiquetan.
 */
export function compararAnual(
  filas: FilaMesPiso[],
  opts: { hoyISO: string; goLive: Record<string, string>; pisos: string[] },
): MesComparado[] {
  const anioActual = Number(opts.hoyISO.slice(0, 4))
  const idx = new Map(filas.map((f) => [`${f.property_id}|${f.mes}`, f]))
  const out: MesComparado[] = []

  for (const pid of opts.pisos) {
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0')
      const mesA = `${anioActual}-${mm}`
      const mesP = `${anioActual - 1}-${mm}`
      const a = idx.get(`${pid}|${mesA}`)
      const p = idx.get(`${pid}|${mesP}`)
      const actual: Celda = a ? { bruto: a.bruto, noches: a.noches, reservas: a.reservas } : VACIA
      const previo: Celda = p ? { bruto: p.bruto, noches: p.noches, reservas: p.reservas } : VACIA
      out.push({
        property_id: pid,
        mesNum: m,
        mes: mesA,
        regimen: regimenDeMes(mesA, opts.hoyISO),
        atribucion: atribucionMotor(mesA, opts.goLive[pid]),
        actual,
        previo,
        deltaEur: Math.round((actual.bruto - previo.bruto) * 100) / 100,
        deltaPct: previo.bruto > 0
          ? Math.round(((actual.bruto - previo.bruto) / previo.bruto) * 1000) / 10
          : null,
      })
    }
  }
  return out
}

/** Suma de una serie (para la fila TOTAL). Mantiene régimen/atribución solo si TODOS coinciden. */
export function totalizar(serie: MesComparado[]): { actual: Celda; previo: Celda; deltaEur: number; deltaPct: number | null } {
  const acc = serie.reduce(
    (s, x) => ({
      aB: s.aB + x.actual.bruto, aN: s.aN + x.actual.noches, aR: s.aR + x.actual.reservas,
      pB: s.pB + x.previo.bruto, pN: s.pN + x.previo.noches, pR: s.pR + x.previo.reservas,
    }),
    { aB: 0, aN: 0, aR: 0, pB: 0, pN: 0, pR: 0 },
  )
  return {
    actual: { bruto: acc.aB, noches: acc.aN, reservas: acc.aR },
    previo: { bruto: acc.pB, noches: acc.pN, reservas: acc.pR },
    deltaEur: Math.round((acc.aB - acc.pB) * 100) / 100,
    deltaPct: acc.pB > 0 ? Math.round(((acc.aB - acc.pB) / acc.pB) * 1000) / 10 : null,
  }
}
