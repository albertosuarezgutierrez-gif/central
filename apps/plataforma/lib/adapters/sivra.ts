// Adaptador de la vertical sivra (inmobiliario). sivra es SINGLE-TENANT (la
// intranet de los pisos propios de Alberto en Sevilla), comparte la BD compartida
// (`properties`, `incomes`, `expenses`). No hay clientes/tenants de SaaS → se
// representa como UNA instancia propia (no bloqueable).

import { prisma } from '../db'
import { eur } from '../dinero'
import type { VerticalAdapter, ClienteSaaS, Cliente360, Metrica } from './types'

const SIVRA_ID = 'sivra-propia'

async function resumen(): Promise<{ pisos: number; ingresosMes: number; gastosMes: number }> {
  const [p, i, g] = await Promise.all([
    prisma.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*)::bigint AS n FROM properties`,
    prisma.$queryRaw<Array<{ t: number }>>`SELECT COALESCE(SUM(amount),0)::float AS t FROM incomes WHERE date >= date_trunc('month', CURRENT_DATE)`,
    prisma.$queryRaw<Array<{ t: number }>>`SELECT COALESCE(SUM(amount),0)::float AS t FROM expenses WHERE date >= date_trunc('month', CURRENT_DATE)`,
  ])
  return { pisos: Number(p[0]?.n ?? 0), ingresosMes: Number(i[0]?.t ?? 0), gastosMes: Number(g[0]?.t ?? 0) }
}

export const sivraAdapter: VerticalAdapter = {
  vertical: 'sivra',
  etiqueta: 'Inmobiliario (sivra)',
  puedeCrear: false,

  async listar() {
    try {
      const r = await resumen()
      const c: ClienteSaaS = {
        vertical: 'sivra',
        id: SIVRA_ID,
        nombre: 'SIVRA — instancia propia (Sevilla)',
        email: null,
        activo: true,
        puedeBloquear: false,
        metricas: [
          { label: 'Pisos', valor: String(r.pisos) },
          { label: 'Ingresos mes', valor: eur(r.ingresosMes) },
          { label: 'Gastos mes', valor: eur(r.gastosMes) },
        ],
      }
      return [c]
    } catch {
      return []
    }
  },

  async ficha(id) {
    if (id !== SIVRA_ID) return null
    const r = await resumen()
    const base = (await this.listar())[0]
    if (!base) return null
    const detalle: Metrica[] = [
      { label: 'Tipo', valor: 'Single-tenant (propia)' },
      { label: 'Pisos gestionados', valor: String(r.pisos) },
      { label: 'Resultado mes', valor: eur(r.ingresosMes - r.gastosMes) },
    ]
    const f: Cliente360 = { ...base, detalle }
    return f
  },

  async setActivo() {
    // Instancia propia: no se bloquea desde el panel.
    return false
  },

  // Directorio de sivra: limpiadoras activas (single-tenant, sin filtro empresa).
  async listarDirectorio(_refExt) {
    try {
      const rows = await prisma.$queryRaw<Array<{ id: string; nombre: string }>>`
        SELECT id, nombre FROM limpiadoras WHERE activa = true ORDER BY nombre`
      return rows.map(l => ({ refPersona: `limpiadora:${l.id}`, nombre: l.nombre, rol: 'limpiadora', email: null }))
    } catch {
      return []
    }
  },
}
