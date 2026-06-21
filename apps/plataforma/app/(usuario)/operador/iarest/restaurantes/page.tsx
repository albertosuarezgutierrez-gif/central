import { redirect } from 'next/navigation'
import { getAdmin } from '@/lib/superadmin'
import RestaurantesClient from './RestaurantesClient'

export const dynamic = 'force-dynamic'

export default async function RestaurantesPage() {
  const admin = await getAdmin()
  if (!admin) redirect('/dashboard')
  return <RestaurantesClient />
}
