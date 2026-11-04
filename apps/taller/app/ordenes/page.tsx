import { redirect } from 'next/navigation'
import { paraPagina } from '@/lib/contexto'
import { tienePermiso } from '@/lib/permisos'
import { ESTADOS_OT } from '@central/module-taller'
import { Cabecera } from '../_marca'

export const dynamic = 'force-dynamic'
const PAGINA = 50
/** El mecánico solo ve los coches en los que se puede trabajar («mis OT» abiertas). */
const ABIERTAS = ['aceptado', 'en_curso', 'ampliacion_pendiente']

export default async function Pagina({ searchParams }: { searchParams: Promise<{ n?: string; estado?: string }> }) {
  const q = await searchParams
  const n = Math.min(Math.max(Number(q.n) || PAGINA, PAGINA), 1000)
  const datos = await paraPagina('ordenes_ver', async (tx, c) => {
    const mecanico = !tienePermiso(c.rol, 'contacto_cliente_ver')
    const estado = (ESTADOS_OT as readonly string[]).includes(q.estado ?? '') ? q.estado! : null
    const ots = await tx.ordenTrabajo.findMany({
      where: {
        tallerId: c.tallerId,
        ...(mecanico ? { estado: { in: ABIERTAS } } : estado ? { estado } : {}),
      },
      orderBy: { numero: 'desc' }, take: n + 1,
    })
    const vehs = await tx.vehiculo.findMany({ where: { tallerId: c.tallerId, id: { in: ots.map((o) => o.vehiculoId) } } })
    const mias = mecanico || tienePermiso(c.rol, 'partes')
      ? (await tx.parteHoras.findMany({ where: { tallerId: c.tallerId, mecanicoId: c.usuarioId, fin: null } })).map((p) => p.otId)
      : []
    return { mecanico, estado, hayMas: ots.length > n, mias,
      ots: ots.slice(0, n).map((o) => {
        const v = vehs.find((x) => x.id === o.vehiculoId)
        return { id: o.id, numero: o.numero, estado: o.estado, matricula: v?.matricula ?? '—', vehiculo: [v?.marca, v?.modelo].filter(Boolean).join(' ') }
      }) }
  })
  if (datos === 'sin_sesion') redirect('/login')
  return (
    <>
      <Cabecera conSalir />
      <main className="contenido">
        <h1>{datos !== 'sin_permiso' && datos.mecanico ? 'Mis órdenes' : 'Órdenes'}</h1>
        {datos === 'sin_permiso' ? <p className="tenue">Tu perfil no incluye las órdenes de trabajo.</p> : (
          <>
            {!datos.mecanico && (
              <nav className="fila" aria-label="Filtrar por estado">
                <a className="btn btn-sec" href="/ordenes">Todas</a>
                {ESTADOS_OT.map((e) => <a key={e} className="btn btn-sec" href={`/ordenes?estado=${e}`}>{e.replace('_', ' ')}</a>)}
              </nav>
            )}
            {datos.ots.length === 0 ? <p className="tenue">No hay órdenes.</p> : (
              <ul className="lista-simple">
                {datos.ots.map((o) => (
                  <li key={o.id}>
                    <a href={`/ordenes/${o.id}`}>OT {o.numero} · {o.matricula}</a>
                    <span className="tenue">{o.vehiculo}</span>
                    <span className="estado">{o.estado.replace('_', ' ')}</span>
                    {datos.mias.includes(o.id) && <span className="ok">Tu parte está abierto</span>}
                  </li>
                ))}
              </ul>
            )}
            {datos.hayMas && <p><a className="btn btn-sec" href={`/ordenes?n=${n + PAGINA}${datos.estado ? `&estado=${datos.estado}` : ''}`}>Ver más</a></p>}
          </>
        )}
        <p><a href="/" className="btn btn-sec">Volver</a></p>
      </main>
    </>
  )
}
