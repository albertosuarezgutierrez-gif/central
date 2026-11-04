import { conTaller } from '@/lib/db'
import { tallerDelDispositivo } from '@/lib/dispositivo-servidor'
import { fichajeRrhhDisponible } from '@/lib/fichar-rrhh'
import { listarUsuariosLogin } from '@/lib/login'
import { marcaActual } from '@/lib/marca-servidor'
import { LoginCliente } from './LoginCliente'

export const dynamic = 'force-dynamic'

// Taller → usuario → PIN. Sin taller recordado en el dispositivo, solo se pide el código (no se enseña ningún nombre).
export default async function LoginPage() {
  const m = await marcaActual()
  const tallerId = await tallerDelDispositivo().catch(() => null)
  const usuarios = tallerId ? await listarUsuariosLogin(conTaller as never, tallerId).catch(() => []) : []
  return <LoginCliente logoUrl={m.logoUrl} nombre={m.nombre} conFichaje={fichajeRrhhDisponible()} conTaller={!!tallerId} usuarios={usuarios} />
}
