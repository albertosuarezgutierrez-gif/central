import { redirect } from 'next/navigation'
import { getSesionEmpleado } from '@/lib/empleado-tenant'
import EntrarEmpleado from './EntrarEmpleado'

// Entrada del Portal del Empleado por email + código. Marca Grupo ASegura siempre (26/10/2026); sin empresa conocida
// (mostrarla delataría que el email existe). Metadatos y manifest: los del layout raíz.
export default async function Page() {
  // App instalada: si ya hay sesión, directo al portal (start_url del manifest).
  try { await getSesionEmpleado(); redirect('/e') } catch (e) { if ((e as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw e }
  return <EntrarEmpleado />
}
