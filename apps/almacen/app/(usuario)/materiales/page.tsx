import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { MaterialForm } from '../_forms'
import MaterialesTable, { type MaterialRow } from './materiales-table'

export const dynamic = 'force-dynamic'

export default async function MaterialesPage() {
  const s = await getSession()
  if (!s) redirect('/login')
  const [materiales, familias] = await Promise.all([
    prisma.almacenMaterial.findMany({ where: { cuentaId: s.id, activo: true }, orderBy: [{ nombre: 'asc' }] }),
    prisma.almacenFamilia.findMany({ where: { cuentaId: s.id, activo: true }, orderBy: [{ nombre: 'asc' }] }),
  ])
  const nombreFamilia = new Map(familias.map((f) => [f.id, f.nombre]))
  const rows: MaterialRow[] = materiales.map((m) => ({
    id: m.id,
    nombre: m.nombre,
    familia: m.familiaId ? nombreFamilia.get(m.familiaId) ?? '' : '',
    cantidadTotal: m.cantidadTotal,
    cantidadDisponible: m.cantidadDisponible,
    unidadesPorBandeja: m.unidadesPorBandeja,
    coste: Number(m.costeReposicion),
  }))

  return (
    <main>
      <div className="page-head">
        <div>
          <h1>Materiales</h1>
          <div className="sub">Maestro de artículos del almacén</div>
        </div>
        <span className="count-pill">{rows.length} material{rows.length === 1 ? '' : 'es'}</span>
      </div>

      <div className="card">
        <div className="card-title">Nuevo material</div>
        <MaterialForm familias={familias.map((f) => ({ id: f.id, nombre: f.nombre }))} />
      </div>

      <div className="card">
        <MaterialesTable rows={rows} />
      </div>
    </main>
  )
}
