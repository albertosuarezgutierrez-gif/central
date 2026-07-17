import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { FamiliaForm } from '../_forms'
import FamiliasLista from './familias-lista'

export const dynamic = 'force-dynamic'

export default async function FamiliasPage() {
  const s = await getSession()
  if (!s) redirect('/login')
  const familias = await prisma.almacenFamilia.findMany({
    where: { cuentaId: s.id, activo: true },
    orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
  })
  return (
    <main>
      <div className="page-head">
        <div>
          <h1>Familias</h1>
          <div className="sub">Categorías del maestro (vajilla, cristalería, mantelería…)</div>
        </div>
        <span className="count-pill">{familias.length} familia{familias.length === 1 ? '' : 's'}</span>
      </div>

      <div className="card">
        <div className="card-title">Nueva familia</div>
        <FamiliaForm />
      </div>

      <div className="card">
        <FamiliasLista familias={familias.map((f) => ({ id: f.id, nombre: f.nombre }))} />
      </div>
    </main>
  )
}
