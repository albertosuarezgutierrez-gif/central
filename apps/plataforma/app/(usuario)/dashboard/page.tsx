import { redirect } from 'next/navigation'

// Ruta heredada: destino de ~15 fallbacks de operador (`redirect('/dashboard')`) y de bookmarks
// antiguos. Desde el 24/09/2026 la home es `/inicio` (resumen de los cuatro negocios); el antiguo
// resumen del holding sigue vivo en `/banca?tab=negocios`.
export default function DashboardRedirect() {
  redirect('/inicio')
}
