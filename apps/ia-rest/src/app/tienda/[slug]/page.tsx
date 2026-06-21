import type { Metadata } from 'next'
import StorefrontApp from './StorefrontApp'

export const metadata: Metadata = {
  title: 'Pedidos online · ia.rest',
  description: 'Haz tu pedido online',
}

export default async function TiendaPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <StorefrontApp slug={slug} />
}
