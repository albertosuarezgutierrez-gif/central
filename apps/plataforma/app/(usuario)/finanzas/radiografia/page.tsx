import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// UNIFICACIÓN (F1): /banca es ahora el cuadro financiero ÚNICO (superconjunto de esta pantalla:
// misma cabecera + personal BBVA/Kutxa + negocios + fiscal enlazada, y además P&L de pisos, IA,
// tickets, tesorería y el libro completo). La Radiografía redirige a /banca conservando el periodo.
// `RadiografiaClient.tsx` SE BORRÓ el 02/09/2026: llevaba desde la unificación sin un solo consumidor
// (esta página ya solo redirige). «Reversible» no es dejar el cuerpo muerto en disco — para eso está
// el historial de git; lo que queda aquí es el redirect, que es lo que salva los marcadores viejos.
export default async function RadiografiaPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string; desde?: string; hasta?: string }>
}) {
  const params = await searchParams
  const qs = new URLSearchParams()
  if (params.year) qs.set('year', params.year)
  if (params.quarter) qs.set('quarter', params.quarter)
  if (params.desde) qs.set('desde', params.desde)
  if (params.hasta) qs.set('hasta', params.hasta)
  const q = qs.toString()
  redirect(q ? `/banca?${q}` : '/banca')
}
