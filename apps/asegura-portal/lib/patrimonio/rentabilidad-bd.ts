// PATRIMONIO (24/10/2026, P14) — lectura con BD de la RENTABILIDAD por inmueble. La regla es
// `rentabilidadPorInmueble` de `@central/module-patrimonio`; el periodo y las primas, `rentabilidad.ts` (puro).
//
// 🚨 Parte de `accesosPatrimonio(identidadId)` (cookie + `portal_vinculo`): los titulares, inmuebles, contratos y gastos
// salen SOLO de los titulares autorizados y vivos. Solo cuentan los gastos CONFIRMADOS; los propuestos por la IA se
// cuentan aparte (`gastosSinConfirmar`). Lanza si la BD falla: la página dice «no hemos podido leerlo», nunca «0 €».
import { rcEfectiva, rentabilidadConEdificios, type ResultadoConEdificios } from '@central/module-patrimonio'

import { prisma } from '../db'
import { getIdentidad } from '../session'
import { accesosPatrimonio } from './accesos'
import { fechaMadrid } from './dia-madrid'
import { patrimonioDeIdentidad } from './inmuebles-bd'
import { contratoDeFila, gastoDeFila, inmuebleDeFila, titularDeFila, type FilaContrato, type FilaGasto, type FilaInmueble } from './lectura'
import { periodoDeAnio, type Periodo } from './rentabilidad'
import { primasDeInmuebles } from './seguros-inmueble-bd'

export type RentabilidadDeIdentidad = {
  periodo: Periodo
  /** Con edificios (27/10/2026): sin edificios con unidades, `inmuebles` es el cálculo de siempre y `edificios` = []. */
  resultado: ResultadoConEdificios
  /** Alias del inmueble y nombre del titular, por id de inmueble; `edificioId` = edificio del que cuelga la unidad. */
  inmuebles: { id: string; alias: string; titular: string; edificioId: string | null; referenciaCatastral: string | null }[]
}

/** `null` = esta identidad no tiene patrimonio a la vista. `pedido` = `?anio=` sin fiar. */
export async function rentabilidadDeIdentidad(identidadId: string, pedido: unknown): Promise<RentabilidadDeIdentidad | null> {
  if ((await getIdentidad())?.id !== identidadId) return null
  const acc = await accesosPatrimonio(identidadId)
  if (acc.size === 0) return null
  const periodo = periodoDeAnio(pedido, fechaMadrid(new Date()))
  const desde = new Date(`${periodo.desde}T00:00:00Z`)
  const hasta = new Date(`${periodo.hasta}T00:00:00Z`)

  const titulares = await prisma.portalPatrimonioTitular.findMany({
    where: { clienteId: { in: [...acc.keys()] }, archivadoEn: null },
    select: { id: true, clienteId: true, tipo: true, deduceIva: true },
  })
  if (titulares.length === 0) return { periodo, resultado: rentabilidadConEdificios({ titulares: [], inmuebles: [], contratos: [], gastos: [], primas: [], ...periodo }), inmuebles: [] }
  // Los nombres salen de la lista de la pantalla de Patrimonio (la misma lectura, ya acotada por `accesosPatrimonio`).
  const nombres = new Map((await patrimonioDeIdentidad(identidadId)).map((t) => [t.clienteId, t.nombre]))

  const inmuebles = await prisma.portalPatrimonioInmueble.findMany({
    where: { archivadoEn: null, titularId: { in: titulares.map((t) => t.id) } },
    orderBy: { alias: 'asc' },
    take: 500,
  })
  const ids = inmuebles.map((i) => i.id)
  const [contratos, gastos, primas] = await Promise.all([
    prisma.portalPatrimonioContrato.findMany({
      where: { inmuebleId: { in: ids }, archivadoEn: null },
      include: { actualizaciones: { orderBy: { desde: 'asc' } } },
      take: 1000,
    }),
    prisma.portalPatrimonioGasto.findMany({
      where: { titularId: { in: titulares.map((t) => t.id) }, fecha: { gte: desde, lte: hasta }, estado: { in: ['confirmado', 'propuesto'] } },
      take: 10_000,
    }),
    // `null` = cartera o declaradas ilegibles: la rentabilidad avisará «el número no incluye seguros».
    primasDeInmuebles(identidadId, ids, periodo),
  ])

  const titularesPuros = titulares.map((t) => {
    return titularDeFila(t, { nombre: nombres.get(t.clienteId) ?? '', apellidos: null })
  })
  const nombrePorTitular = new Map(titularesPuros.map((t) => [t.id, t.nombre]))
  // Los gastos y seguros de un EDIFICIO se reparten entre sus unidades (m² o %): rentabilidad POR PISO.
  const resultado = rentabilidadConEdificios({
    titulares: titularesPuros,
    inmuebles: inmuebles.map((i) => inmuebleDeFila(i as FilaInmueble)),
    contratos: contratos.map((c) => contratoDeFila(c as FilaContrato, [], c.actualizaciones)),
    gastos: gastos.map((g) => gastoDeFila(g as FilaGasto)),
    primas,
    desde: periodo.desde,
    hasta: periodo.hasta,
  })
  const vivos = new Set(ids)
  return {
    periodo,
    resultado,
    inmuebles: inmuebles.map((i) => ({
      id: i.id,
      alias: i.alias,
      titular: nombrePorTitular.get(i.titularId) ?? '',
      edificioId: i.inmueblePadreId !== null && vivos.has(i.inmueblePadreId) ? i.inmueblePadreId : null,
      referenciaCatastral: rcEfectiva(i, i.inmueblePadreId === null ? null : (inmuebles.find((p) => p.id === i.inmueblePadreId) ?? null)),
    })),
  }
}
