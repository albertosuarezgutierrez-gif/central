import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// El chat contable vive ahora en /asistentes junto al de precios (02/09/2026). Aquí queda el
// redirect, que es lo que salva los marcadores viejos y los enlaces del propio panel.
export default async function ContableRedirect() {
  redirect('/asistentes?a=contable')
}
