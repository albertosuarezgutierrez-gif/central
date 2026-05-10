// /q/[token] — App pública del cliente QR
// Sin autenticación. Acceso solo por token único de mesa.
import type { Metadata } from 'next'
import QrClientApp from './QrClientApp'

export const metadata: Metadata = {
  title: 'Mesa digital · ia.rest',
  description: 'Pide y paga desde tu móvil',
}

export default async function QrPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <QrClientApp token={token} />
}
