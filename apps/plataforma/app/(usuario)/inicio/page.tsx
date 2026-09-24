import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { Pagina, PageHeader } from '@/components/ui'
import BandaInicio from './BandaInicio'
import TarjetaCorreduria from './TarjetaCorreduria'
import TarjetaBolsa from './TarjetaBolsa'
import TarjetaPisos from './TarjetaPisos'
import TarjetaBanco from './TarjetaBanco'
import { Esqueleto } from './piezas'
import AvisoInstalar from './AvisoInstalar'

// 🏠 Inicio (24/09/2026): resumen de los cuatro negocios. Cada bloque carga en su propio
// Suspense —si la correduría tarda (puerto HTTP, hasta 8 s), lo demás ya se ve— y cada tarjeta
// enlaza a su pantalla. Nada de detalle aquí: el detalle vive en su página (regla de la home).
export const dynamic = 'force-dynamic'

function saludo(): string {
  const h = Number(new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: 'numeric', hour12: false }).format(new Date()))
  return h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches'
}

export default async function InicioPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  const fecha = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  const nombre = session.nombre?.split(' ')[0]

  return (
    <Pagina ancho="tabla">
      <PageHeader titulo={`${saludo()}${nombre ? `, ${nombre}` : ''}`} sub={fecha.charAt(0).toUpperCase() + fecha.slice(1)} />
      <div style={{ display: 'grid', gap: 16 }}>
        <AvisoInstalar />
        <Suspense fallback={null}><BandaInicio /></Suspense>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 16 }}>
          <Suspense fallback={<Esqueleto titulo="Correduría" />}><TarjetaCorreduria /></Suspense>
          <Suspense fallback={<Esqueleto titulo="Bolsa · IBKR" />}><TarjetaBolsa /></Suspense>
          <TarjetaPisos />
          <Suspense fallback={<Esqueleto titulo="Banco" ancha />}><TarjetaBanco /></Suspense>
        </div>
      </div>
    </Pagina>
  )
}
