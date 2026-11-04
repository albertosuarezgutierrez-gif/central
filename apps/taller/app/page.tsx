import { redirect } from 'next/navigation'
import { conTaller } from '@/lib/db'
import { getSession } from '@/lib/session'
import { debeCambiarPin } from '@/lib/acceso'
import { urlPortalEmpleado } from '@/lib/enlaces'
import { Cabecera } from './_marca'

export const dynamic = 'force-dynamic'

const SECCIONES = [
  { href: '/recepcion', titulo: 'Recepción', desc: 'Entrada de vehículos' },
  { href: '/ordenes', titulo: 'Órdenes', desc: 'Órdenes de trabajo' },
  { href: '/presupuestos', titulo: 'Presupuestos', desc: 'Presupuestos y paquetes' },
  { href: '/ajustes', titulo: 'Ajustes', desc: 'Configuración del taller' },
  { href: '/cambiar-pin', titulo: 'Mi PIN', desc: 'Cambiar mi PIN' },
]

export default async function Inicio() {
  const s = await getSession()
  if (!s) redirect('/login')
  if (await conTaller(s.tallerId, (tx) => debeCambiarPin(tx as never, s))) redirect('/cambiar-pin')
  const nominas = urlPortalEmpleado()
  return (
    <>
      <Cabecera conSalir />
      <main className="contenido">
        <h1>Taller</h1>
        <nav className="rejilla" aria-label="Secciones">
          {SECCIONES.map(s => (
            <a key={s.href} href={s.href} className="tarjeta">
              <strong>{s.titulo}</strong>
              <span>{s.desc}</span>
            </a>
          ))}
          {nominas && (
            <a href={nominas} className="tarjeta" target="_blank" rel="noopener noreferrer">
              <strong>Mis nóminas</strong>
              <span>Portal del Empleado</span>
            </a>
          )}
        </nav>
      </main>
    </>
  )
}
