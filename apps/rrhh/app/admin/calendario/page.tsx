import { getSesion, AuthError } from '@/lib/tenant'
import { redirect } from 'next/navigation'
import CalendarioClient from './CalendarioClient'

export default async function CalendarioPage() {
  try { await getSesion() } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }
  return <CalendarioClient />
}
