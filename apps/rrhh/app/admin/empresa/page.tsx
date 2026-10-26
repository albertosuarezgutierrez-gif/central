import { redirect } from 'next/navigation'
import { getSesion, AuthError } from '@/lib/tenant'

// La documentación de empresa vive en Ajustes (/admin/cuenta): esta pantalla era un duplicado exacto (26/10/2026).
// Se conserva la ruta para los marcadores y enlaces antiguos.
export default async function Page() {
  try { await getSesion() } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }
  redirect('/admin/cuenta')
}
