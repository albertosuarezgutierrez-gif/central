// PATRIMONIO (22/10/2026, paso 6) — generador de gastos `propuesto` desde plantillas y derramas, SIN prisma (puertos).
// La BD real está en `generar-gastos-bd.ts`; la ruta es `app/api/cron/patrimonio-gastos/route.ts`.
//
// Idempotente por `clave` (`<plantilla>:<YYYY-MM>` / `<derrama>:<n>`; índice único (titular_id, clave) en BD):
// correr el cron dos veces no duplica. Si la persona descartó un gasto, su clave sigue existiendo y NO se regenera.
// Importe `null` de la plantilla = variable: el gasto nace `propuesto` SIN importe (nunca 0) y espera la factura.
// El reloj no se lee aquí: `hoy` entra como parámetro.
import {
  cuotasDerrama,
  generarOcurrencias,
  inicioDeMes,
  pendientesDeMaterializar,
  sumarMeses,
  type Derrama,
  type OcurrenciaGasto,
  type PlantillaGasto,
} from '@central/module-patrimonio'

export type OrigenGenerado = 'plantilla' | 'derrama'
export type GastoGenerado = OcurrenciaGasto & { origen: OrigenGenerado }

export interface PuertosGenerador {
  /** Plantillas ACTIVAS de titulares e inmuebles no archivados. */
  plantillas(): Promise<PlantillaGasto[]>
  /** Derramas no archivadas (de comunidad y titular no archivados). `titularId` = id de `portal_patrimonio_titular`. */
  derramas(): Promise<Derrama[]>
  /** Claves ya persistidas de ese titular (cualquier estado, también `descartado`). */
  clavesDe(titularId: string): Promise<ReadonlySet<string>>
  /** Cuáles de estos inmuebles están ARCHIVADOS (la derrama cuelga de su `inmuebleId`, sin relación en el schema). */
  inmueblesArchivados(ids: readonly string[]): Promise<ReadonlySet<string>>
  /** `duplicado` = el índice único dijo que ya existía (P2002 tolerado). */
  insertar(g: GastoGenerado): Promise<'creado' | 'duplicado'>
}

export type ResumenGenerador = { creados: number; duplicados: number; errores: number }

/** Ventana de plantillas: desde el 1 del mes anterior hasta hoy (lo futuro no se propone; lo muy viejo no se rescata). */
export function ventanaPlantillas(hoy: string): { desde: string; hasta: string } {
  return { desde: sumarMeses(inicioDeMes(hoy), -1), hasta: hoy }
}

export async function generarGastosPropuestos(p: PuertosGenerador, hoy: string): Promise<ResumenGenerador> {
  const { desde, hasta } = ventanaPlantillas(hoy)
  const candidatos: GastoGenerado[] = []
  const plantillas = await p.plantillas()
  const archivadosPl = await p.inmueblesArchivados([...new Set(plantillas.flatMap((x) => (x.inmuebleId === null ? [] : [x.inmuebleId])))])
  for (const pl of plantillas) {
    if (pl.inmuebleId !== null && archivadosPl.has(pl.inmuebleId)) continue
    for (const o of generarOcurrencias(pl, desde, hasta)) candidatos.push({ ...o, origen: 'plantilla' })
  }
  const derramas = await p.derramas()
  // Inmueble archivado = no se proponen gastos nuevos de sus derramas (defensa además de lo que filtre el adaptador).
  const archivados = await p.inmueblesArchivados([...new Set(derramas.map((d) => d.inmuebleId))])
  for (const d of derramas) {
    if (archivados.has(d.inmuebleId)) continue
    // Todas las cuotas ya vencidas (la clave evita repetir las ya generadas); las futuras esperan a su mes.
    for (const o of cuotasDerrama(d)) if (o.fecha <= hasta) candidatos.push({ ...o, origen: 'derrama' })
  }

  const porTitular = new Map<string, GastoGenerado[]>()
  for (const c of candidatos) porTitular.set(c.titularId, [...(porTitular.get(c.titularId) ?? []), c])

  const r: ResumenGenerador = { creados: 0, duplicados: 0, errores: 0 }
  for (const [titularId, lista] of porTitular) {
    let existentes: ReadonlySet<string>
    try {
      existentes = await p.clavesDe(titularId)
    } catch {
      r.errores += lista.length
      continue
    }
    const nuevos = new Set(pendientesDeMaterializar(lista, existentes).map((o) => o.clave))
    for (const g of lista) {
      if (!nuevos.has(g.clave)) {
        r.duplicados++
        continue
      }
      nuevos.delete(g.clave)
      try {
        const x = await p.insertar(g)
        if (x === 'creado') r.creados++
        else r.duplicados++
      } catch {
        // Una fila rota no tumba la pasada: se cuenta y el resto sigue.
        r.errores++
      }
    }
  }
  return r
}
