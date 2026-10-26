import type { Metadata } from 'next'
import EntrarEmpleado from './EntrarEmpleado'

export const metadata: Metadata = { title: 'Acceso empleado · ia·rrhh', robots: { index: false, follow: false } }

// Entrada del Portal del Empleado por email + código. Neutra (sin branding): aún no sabemos de
// qué empresa es quien escribe, y mostrarla delataría que el email existe.
// Con `?m=asegura` (enlace que da la correduría a sus empresas) lleva la marca Grupo ASegura. No depende del
// email ni de la empresa, así que no delata si un email existe.
export default async function Page({ searchParams }: { searchParams: Promise<{ m?: string | string[] }> }) {
  const { m } = await searchParams
  return <EntrarEmpleado marcaAsegura={m === 'asegura'} />
}
