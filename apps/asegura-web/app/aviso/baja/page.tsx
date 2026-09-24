import type { Metadata } from 'next'
import CanjeAviso from '@/components/CanjeAviso'

// Página de un solo uso a la que lleva el correo: no se indexa ni se enlaza desde la web.
export const metadata: Metadata = {
  title: 'Darse de baja de los avisos',
  robots: { index: false, follow: false },
}

export default function Pagina() {
  return (
    <div className="wrap pagina">
      <h1>Darse de baja de los avisos</h1>
      <CanjeAviso accion="baja" />
    </div>
  )
}
