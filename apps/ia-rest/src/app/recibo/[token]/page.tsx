// /recibo/[token] — e-recibo público del cliente. Sin sesión: el token es el secreto.
import type { Metadata } from 'next'
import { createServerClient } from '@/lib/supabase'
import type { ReciboSnapshot } from '@/lib/recibo'
import ReciboView, { ReciboNoDisponible } from './ReciboView'

export const metadata: Metadata = {
  title: 'Tu recibo · ia.rest',
  description: 'Recibo digital de tu consumición',
}

export default async function ReciboPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createServerClient()
  const { data } = await supabase
    .from('recibos_digitales')
    .select('snapshot, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (!data || (data.expires_at && new Date(data.expires_at) < new Date())) {
    return <ReciboNoDisponible />
  }
  return <ReciboView snapshot={data.snapshot as ReciboSnapshot} />
}
