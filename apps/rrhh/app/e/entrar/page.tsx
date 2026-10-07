import type { Metadata } from 'next'
import EntrarEmpleado from './EntrarEmpleado'

export const metadata: Metadata = { title: 'Acceso empleado · ia·rrhh', robots: { index: false, follow: false } }

// Entrada del Portal del Empleado por email + código. Neutra (sin branding): aún no sabemos de
// qué empresa es quien escribe, y mostrarla delataría que el email existe.
export default function Page() {
  return <EntrarEmpleado />
}
