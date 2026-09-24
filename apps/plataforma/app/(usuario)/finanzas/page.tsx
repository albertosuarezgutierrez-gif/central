import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// UNIFICACIÓN (02/09/2026): `/finanzas` y `/banca` eran DOS hubs financieros conviviendo, y su
// pestaña «Categorías» montaba LITERALMENTE el mismo componente que el segmento Personal de
// /banca — la misma pantalla en dos URLs, con enlaces de ida y vuelta entre ellas.
//
// Lo que NO era duplicado (los banners de salud de extracción, ayudas y novedad fiscal, y los
// KPIs propios) se trajo entero a /banca como el segmento «Ingresos»; `FinanzasClient` se monta
// allí con `embebido`. Aquí queda el redirect, que es lo que salva los marcadores viejos.
//
// Los `?tab=gastos|fiscal` que este hub redirigía a sus páginas propias se siguen atendiendo:
// esas páginas (/finanzas/gastos, /finanzas/fiscal, /finanzas/pilar, /finanzas/tarjeta-credito)
// NO se tocan, solo dejan de colgar de un hub que ya no existe.
export default async function FinanzasPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string; tab?: string }>
}) {
  const params = await searchParams
  if (params.tab === 'gastos') redirect('/finanzas/gastos')
  if (params.tab === 'fiscal') redirect('/finanzas/fiscal')
  // La pestaña «Categorías» vivía aquí y en /banca?tab=personal. Sobrevive la de /banca.
  if (params.tab === 'categorias') redirect('/banca?tab=personal')

  const qs = new URLSearchParams({ tab: 'ingresos' })
  if (params.year) qs.set('year', params.year)
  if (params.quarter) qs.set('quarter', params.quarter)
  redirect(`/banca?${qs.toString()}`)
}
