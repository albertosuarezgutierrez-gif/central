import { catalogoPublico } from '@/lib/publico'
import ReservarClient from './reservar-client'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Solicitar reserva · Joaquín Jaén',
  description: 'Pide presupuesto de alquiler de material para tu evento.',
}

export default async function ReservarPage({
  searchParams,
}: {
  searchParams: Promise<{ material?: string }>
}) {
  const { material } = await searchParams
  const items = await catalogoPublico()
  // Solo se puede solicitar lo que tiene stock ahora mismo.
  const disponibles = items.filter((it) => it.disponible > 0)
  return (
    <main>
      <div className="pub-hero">
        <h1>Solicitar reserva</h1>
        <p className="pub-hero-sub">
          Dinos qué necesitas y para cuándo. Revisamos la disponibilidad y te confirmamos con el presupuesto.
        </p>
      </div>
      <ReservarClient items={disponibles} preseleccion={material ?? null} />
    </main>
  )
}
