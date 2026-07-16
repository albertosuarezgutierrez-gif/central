import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { eur } from '@/lib/format'
import Acciones from './acciones'
import Comentarios from '../../comentarios'

export const dynamic = 'force-dynamic'

type StockRow = { espacio_id: string; nombre: string; disponible: number; en_transito: number }
type MovRow = {
  id: string; tipo: string; cantidad: number; motivo: string | null; realizado_por: string | null
  fecha: string; origen: string | null; destino: string | null
}

const TIPO_BADGE: Record<string, string> = {
  entrada: 'ok', devolucion: 'ok', salida: 'warn', ajuste: '', rotura: 'danger', transferencia: '',
}
const fmt = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })

export default async function MaterialDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const s = await getSession()
  if (!s) redirect('/login')
  const { id } = await params

  const material = await prisma.almacenMaterial.findFirst({
    where: { id, cuentaId: s.id, activo: true },
  })
  if (!material) notFound()

  const [porAlmacen, espacios, movimientos] = await Promise.all([
    prisma.$queryRaw<StockRow[]>(Prisma.sql`
      SELECT s.espacio_id, e.nombre, s.disponible, s.en_transito
      FROM almacen_stock s JOIN almacen_espacios e ON e.id = s.espacio_id
      WHERE s.material_id = ${id}::uuid AND s.cuenta_id = ${s.id}::uuid AND e.activo
        AND (s.disponible > 0 OR s.en_transito > 0)
      ORDER BY e.tipo = 'central' DESC, e.nombre ASC
    `),
    prisma.almacenEspacio.findMany({
      where: { cuentaId: s.id, activo: true }, orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
      select: { id: true, nombre: true },
    }),
    prisma.$queryRaw<MovRow[]>(Prisma.sql`
      SELECT mv.id, mv.tipo, mv.cantidad, mv.motivo, mv.realizado_por, mv.fecha,
             o.nombre AS origen, d.nombre AS destino
      FROM almacen_movimientos mv
      LEFT JOIN almacen_espacios o ON o.id = mv.espacio_origen_id
      LEFT JOIN almacen_espacios d ON d.id = mv.espacio_destino_id
      WHERE mv.material_id = ${id}::uuid AND mv.cuenta_id = ${s.id}::uuid
      ORDER BY mv.fecha DESC LIMIT 50
    `),
  ])

  const disponible = porAlmacen.reduce((a, r) => a + r.disponible, 0)
  const coste = Number(material.costeReposicion)

  return (
    <main>
      <div className="page-head">
        <div>
          <div className="crumb"><Link href="/materiales">Materiales</Link> ›</div>
          <h1>{material.nombre}</h1>
          <div className="sub">
            {material.categoria} · {disponible} uds disponibles
            {material.precioAlquiler != null ? ` · alquiler ${eur(Number(material.precioAlquiler))}` : ''}
            {coste > 0 ? ` · reposición ${eur(coste)}` : ''}
          </div>
        </div>
      </div>

      <div className="detalle-grid">
        <div>
          <div className="card">
            <div className="card-title">Stock por almacén</div>
            {porAlmacen.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>Sin stock en ningún almacén.</div>
            ) : (
              <ul className="rows">
                {porAlmacen.map((r) => (
                  <li key={r.espacio_id} className="row">
                    <Link href={`/almacenes/${r.espacio_id}`} className="row-name" style={{ color: 'inherit' }}>{r.nombre}</Link>
                    <span className="cell-strong" style={{ marginLeft: 'auto' }}>{r.disponible}</span>
                    {r.en_transito > 0 && <span className="badge">{r.en_transito} en tránsito</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Acciones materialId={material.id} espacios={espacios} />
        </div>

        <div className="card">
          <div className="card-title">Historial</div>
          {movimientos.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>Sin movimientos.</div>
          ) : (
            <ul className="rows timeline">
              {movimientos.map((m) => (
                <li key={m.id} className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 3 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className={`badge ${TIPO_BADGE[m.tipo] ?? ''}`}>{m.tipo}</span>
                    <span className="cell-strong">{m.cantidad > 0 ? '+' : ''}{m.cantidad}</span>
                    <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{fmt(m.fecha)}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {m.origen && m.destino ? `${m.origen} → ${m.destino}` : m.destino ? `→ ${m.destino}` : m.origen ? `${m.origen} →` : ''}
                    {m.motivo ? ` · ${m.motivo}` : ''}
                    {m.realizado_por ? ` · ${m.realizado_por}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Comentarios entidadTipo="material" entidadId={material.id} />
    </main>
  )
}
