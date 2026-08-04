import { catalogoPublico } from '@/lib/publico'
import CatalogoClient from './catalogo-client'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Catálogo de alquiler · Joaquín Jaén',
  description: 'Menaje y material para eventos en alquiler — disponibilidad en tiempo real.',
}

export default async function CatalogoPage() {
  const items = await catalogoPublico()
  return (
    <main>
      <div className="pub-hero">
        <h1>Alquiler para tus eventos</h1>
        <p className="pub-hero-sub">
          Menaje, mobiliario y material de catering. Disponibilidad real, actualizada al momento.
        </p>
      </div>
      <CatalogoClient items={items} />
    </main>
  )
}
