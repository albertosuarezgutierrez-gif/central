import type { Metadata } from 'next'
import PedidoRapidoApp from './PedidoRapidoApp'

export const metadata: Metadata = {
  title: 'Pedido rápido · ia.rest',
  description: 'Tomar pedido por teléfono o mostrador',
}

export default function PedidoRapidoPage() {
  return <PedidoRapidoApp />
}
