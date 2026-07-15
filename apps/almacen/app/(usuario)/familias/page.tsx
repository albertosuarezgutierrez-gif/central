import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { FamiliaForm } from '../_forms'

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
        {familias.length === 0 ? (
          <div className="empty">
            <span className="emoji">🗂️</span>
            <div className="title">Aún no hay familias</div>
            <div>Crea la primera arriba para empezar a organizar el material.</div>
          </div>
        ) : (
          <ul className="rows">
            {familias.map((f) => (
              <li key={f.id} className="row">
                <span className="row-name">{f.nombre}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
