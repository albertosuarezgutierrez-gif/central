import { notFound, redirect } from 'next/navigation'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import InventarioConteo, { type LineaConteo } from '@/app/_components/inventario-conteo'

export const dynamic = 'force-dynamic'

export default async function MiInventarioPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await getSession()
  if (!s) redirect('/login')
  const { id } = await params

  const inv = await prisma.almacenInventario.findFirst({ where: { id, cuentaId: s.id } })
  if (!inv) notFound()
  const espacio = await prisma.almacenEspacio.findUnique({ where: { id: inv.espacioId }, select: { nombre: true } })

  const lineas = await prisma.$queryRaw<LineaConteo[]>(Prisma.sql`
    SELECT il.id, m.nombre AS "materialNombre", il.cantidad_sistema AS "cantidadSistema", il.cantidad_contada AS "cantidadContada"
    FROM almacen_inventario_lineas il JOIN almacen_materiales m ON m.id = il.material_id
    WHERE il.inventario_id = ${id}::uuid AND il.cuenta_id = ${s.id}::uuid
    ORDER BY m.nombre ASC
  `)

  return (
    <main>
      <div className="page-head">
        <div>
          <h1>{espacio?.nombre ?? 'Inventario'}</h1>
          <div className="sub">Cuenta lo que veas de cada material y guarda</div>
        </div>
      </div>
      <InventarioConteo
        inventario={{ id: inv.id, estado: inv.estado, ciego: inv.ciego, espacioNombre: espacio?.nombre ?? '' }}
        lineas={lineas}
        canClose={s.tipo === 'oficina'}
        volverHref="/mi"
      />
    </main>
  )
}
