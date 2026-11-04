import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { Cabecera } from './_marca'

const SECCIONES = [
  { href: '/recepcion', titulo: 'Recepción', desc: 'Entrada de vehículos' },
  { href: '/ordenes', titulo: 'Órdenes', desc: 'Órdenes de trabajo' },
  { href: '/presupuestos', titulo: 'Presupuestos', desc: 'Presupuestos y paquetes' },
  { href: '/ajustes', titulo: 'Ajustes', desc: 'Configuración del taller' },
]

export default async function Inicio() {
  if (!(await getSession())) redirect('/login')
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
        </nav>
      </main>
    </>
  )
}
