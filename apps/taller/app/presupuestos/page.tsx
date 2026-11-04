import { redirect } from 'next/navigation'
import { formatearEur } from '@central/module-taller'
import { paraPagina } from '@/lib/contexto'
import { Cabecera } from '../_marca'
import { claseEstado } from '../_ui'

export const dynamic = 'force-dynamic'
const PAGINA = 50

export default async function Pagina({ searchParams }: { searchParams: Promise<{ n?: string }> }) {
  const n = Math.min(Math.max(Number((await searchParams).n) || PAGINA, PAGINA), 1000)
  const datos = await paraPagina('presupuestos', async (tx, c) => {
    const ps = await tx.presupuesto.findMany({ where: { tallerId: c.tallerId }, orderBy: { creadoEn: 'desc' }, take: n + 1 })
    const pendientes = await tx.ordenTrabajo.findMany({ where: { tallerId: c.tallerId, estado: 'recepcion' }, orderBy: { numero: 'desc' }, take: 50 })
    const ids = [...ps.map((p) => p.vehiculoId), ...pendientes.map((o) => o.vehiculoId)]
    const vehs = await tx.vehiculo.findMany({ where: { tallerId: c.tallerId, id: { in: ids } }, select: { id: true, matricula: true } })
    const mat = (id: string) => vehs.find((v) => v.id === id)?.matricula ?? '—'
    return {
      hayMas: ps.length > n,
      pendientes: pendientes.map((o) => ({ id: o.id, numero: o.numero, matricula: mat(o.vehiculoId) })),
      ps: ps.slice(0, n).map((p) => ({ id: p.id, matricula: mat(p.vehiculoId), estado: p.estado, total: Number(p.totalCent) })),
    }
  })
  if (datos === 'sin_sesion') redirect('/login')
  return (
    <>
      <Cabecera conSalir />
      <main className="contenido">
        <h1>Presupuestos</h1>
        {datos === 'sin_permiso' ? <p className="tenue">Tu perfil no incluye los presupuestos.</p> : (
          <>
            <h2>Órdenes por presupuestar</h2>
            {datos.pendientes.length === 0 ? <p className="tenue">No hay ninguna.</p> : (
              <ul className="lista-simple">
                {datos.pendientes.map((o) => <li key={o.id}><a href={`/presupuestos/nuevo?ot=${o.id}`}>OT {o.numero} · {o.matricula}</a><span className="tenue">Crear presupuesto</span></li>)}
              </ul>
            )}
            <h2>Presupuestos</h2>
            {datos.ps.length === 0 ? <p className="tenue">Todavía no hay presupuestos.</p> : (
              <ul className="lista-simple">
                {datos.ps.map((p) => (
                  <li key={p.id}><a href={`/presupuestos/${p.id}`}>{p.matricula}</a><span className={claseEstado(p.estado)}>{p.estado}</span><strong>{formatearEur(p.total)}</strong></li>
                ))}
              </ul>
            )}
            {datos.hayMas && <p><a className="btn btn-sec" href={`/presupuestos?n=${n + PAGINA}`}>Ver más</a></p>}
          </>
        )}
        <p><a href="/" className="btn btn-sec">Volver</a></p>
      </main>
    </>
  )
}
