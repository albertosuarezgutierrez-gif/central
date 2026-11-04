import { marcaActual } from '@/lib/marca-servidor'
import { LoginCliente } from './LoginCliente'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const m = await marcaActual()
  return <LoginCliente logoUrl={m.logoUrl} nombre={m.nombre} />
}
