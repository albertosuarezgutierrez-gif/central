import { notFound } from 'next/navigation'
import Link from 'next/link'
import { itemPublico } from '@/lib/publico'
import { eur } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const it = await itemPublico(id)
  if (!it) notFound()

  return (
    <main>
      <div className="crumb">
        <Link href="/catalogo">← Catálogo</Link>
      </div>

      <div className="pub-detalle">
        <div className="pub-detalle-foto">
          {it.imagenUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={it.imagenUrl} alt={it.nombre} />
          ) : (
            <span className="pub-foto-ph big">🍽️</span>
          )}
        </div>

        <div className="pub-detalle-info">
          <div className="pub-detalle-cat muted">{it.categoria}</div>
          <h1>{it.nombre}</h1>
          {it.capacidad && <div className="pub-detalle-cap">{it.capacidad}</div>}

          <div className="pub-precio-grande">
            {eur(it.precioAlquiler)} <span className="muted">/ unidad</span>
          </div>

          <div className="pub-disp-linea">
            {it.disponible > 0 ? (
              <span className="badge ok">{it.disponible} unidades disponibles</span>
            ) : (
              <span className="badge danger">Sin stock disponible</span>
            )}
          </div>

          {it.disponible > 0 ? (
            <Link href={`/reservar?material=${it.id}`} className="btn btn-primary pub-detalle-cta">
              Solicitar reserva
            </Link>
          ) : (
            <Link href="/reservar" className="btn btn-ghost pub-detalle-cta">
              Consultar disponibilidad
            </Link>
          )}

          <p className="pub-detalle-nota muted">
            Las solicitudes se revisan y confirman por nuestro equipo. Te contactamos para cerrar fechas y precio final.
          </p>
        </div>
      </div>
    </main>
  )
}
