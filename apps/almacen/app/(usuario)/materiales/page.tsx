import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { eur } from '@/lib/format'
import { MaterialForm } from '../_forms'

export const dynamic = 'force-dynamic'

export default async function MaterialesPage() {
  const s = await getSession()
  if (!s) redirect('/login')
  const [materiales, familias] = await Promise.all([
    prisma.almacenMaterial.findMany({ where: { cuentaId: s.id, activo: true }, orderBy: [{ nombre: 'asc' }] }),
    prisma.almacenFamilia.findMany({ where: { cuentaId: s.id, activo: true }, orderBy: [{ nombre: 'asc' }] }),
  ])
  const nombreFamilia = new Map(familias.map((f) => [f.id, f.nombre]))
  return (
    <main style={{ padding: 16 }}>
      <h1>Materiales</h1>
      <MaterialForm familias={familias.map((f) => ({ id: f.id, nombre: f.nombre }))} />
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Material</th><th>Familia</th><th>Total</th><th>Disp.</th><th>Ud/bandeja</th><th>Coste rep.</th></tr></thead>
          <tbody>
            {materiales.map((m) => (
              <tr key={m.id}>
                <td>{m.nombre}</td>
                <td>{m.familiaId ? nombreFamilia.get(m.familiaId) ?? '—' : '—'}</td>
                <td>{m.cantidadTotal}</td>
                <td>{m.cantidadDisponible}</td>
                <td>{m.unidadesPorBandeja}</td>
                <td>{eur(Number(m.costeReposicion))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
