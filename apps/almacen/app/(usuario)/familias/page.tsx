import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { FamiliaForm } from '../_forms'

export const dynamic = 'force-dynamic'

export default async function FamiliasPage() {
  const s = await getSession()
  if (!s) redirect('/login')
  const familias = await prisma.almacenFamilia.findMany({
    where: { cuentaId: s.id, activo: true }, orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
  })
  return (
    <main style={{ padding: 16 }}>
      <h1>Familias</h1>
      <FamiliaForm />
      <ul>{familias.map((f) => <li key={f.id}>{f.nombre}</li>)}</ul>
    </main>
  )
}
