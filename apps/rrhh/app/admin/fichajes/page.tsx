import { redirect } from 'next/navigation'
import { getSesion, AuthError } from '@/lib/tenant'
import FichajesClient from './FichajesClient'

export default async function Page() {
  try { await getSesion() } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }
  return <FichajesClient />
}
