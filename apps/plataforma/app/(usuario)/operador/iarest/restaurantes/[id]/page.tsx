import { redirect, notFound } from 'next/navigation'
import { getAdmin } from '@/lib/superadmin'
import RestauranteDetalleClient from './RestauranteDetalleClient'

export const dynamic = 'force-dynamic'

export default async function RestauranteDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin()
  if (!admin) redirect('/dashboard')
  const { id } = await params
  return <RestauranteDetalleClient id={id} />
}
