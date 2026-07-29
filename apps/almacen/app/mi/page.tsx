import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

type Row = { id: string; espacioNombre: string; estado: string; ciego: boolean; mio: boolean }

export default async function MiPage() {
  const s = await getSession()
  if (!s) redirect('/login')

  // Inventarios abiertos: los asignados a este empleado primero, y los sin asignar.
  const inventarios = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT i.id, e.nombre AS "espacioNombre", i.estado, i.ciego,
           (i.empleado_id = ${s.empleadoId}::uuid) AS mio
    FROM almacen_inventarios i JOIN almacen_espacios e ON e.id = i.espacio_id
    WHERE i.cuenta_id = ${s.id}::uuid AND i.estado = 'abierto'
      AND (i.empleado_id = ${s.empleadoId}::uuid OR i.empleado_id IS NULL)
    ORDER BY mio DESC, i.created_at DESC
  `)

  return (
    <main>
      <div className="page-head">
        <div>
          <h1>Hola, {s.nombre.split(' ')[0]}</h1>
          <div className="sub">Tus tareas de inventario</div>
        </div>
      </div>

      {s.tipo === 'oficina' && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="muted" style={{ fontSize: 13 }}>Estás viendo la vista de empleado. Vuelve al <Link href="/panel" style={{ color: 'var(--accent-ink)' }}>panel de oficina</Link>.</div>
        </div>
      )}

      {inventarios.length === 0 ? (
        <div className="card empty">
          <span className="emoji">✅</span>
          <div className="title">No tienes conteos pendientes</div>
          <div>Cuando la oficina te asigne un inventario, aparecerá aquí.</div>
        </div>
      ) : (
        <div className="cards-grid">
          {inventarios.map((i) => (
            <Link key={i.id} href={`/mi/inventario/${i.id}`} className="card almacen-card">
              <div className="almacen-head">
                <span className="almacen-nombre">{i.espacioNombre}</span>
                {i.mio ? <span className="badge ok">asignado</span> : <span className="badge">abierto</span>}
              </div>
              <div className="muted">{i.ciego ? 'Conteo ciego' : 'Conteo abierto'} · toca para contar →</div>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
