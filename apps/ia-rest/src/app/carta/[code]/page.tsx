// ============================================================
// /carta/[code] — página pública de la carta del restaurante
// No requiere auth. Se usa desde QR en mesas y enlaces directos.
// ============================================================

import { Suspense } from 'react'
import CartaPublicClient from './CartaPublicClient'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  return {
    title: 'Carta · ia.rest',
    description: 'Carta digital del restaurante',
    robots: { index: false, follow: false },
    openGraph: {
      title: 'Carta digital',
      url: `https://www.iarest.es/carta/${code}`,
    },
  }
}

export default async function CartaPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#F6F1E7' }} />}>
      <CartaPublicClient code={code} />
    </Suspense>
  )
}
