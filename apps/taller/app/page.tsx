import { redirect } from 'next/navigation'
import { conTaller } from '@/lib/db'
import { getSession } from '@/lib/session'
import { usuarioDeSesion } from '@/lib/acceso'
import { urlPortalEmpleado } from '@/lib/enlaces'
import { Cabecera } from './_marca'

export const dynamic = 'force-dynamic'

// Trazos SVG (no emojis): el mismo dibujo en todos los móviles.
const ICONO = {
  recepcion: 'M5 17h14M6 17l1.5-6h9L18 17M7 17v2M17 17v2M9 13h6',
  citas: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  ordenes: 'M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1zM6 6h12v15H6zM9 11h6M9 15h6',
  presupuestos: 'M7 3h8l4 4v14H7zM14 3v5h5M10 13h6M10 17h6',
  facturas: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  ajustes: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 4v6M8 14v6',
  pin: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  nominas: 'M3 6h18v12H3zM3 10h18M7 15h4',
} as const

const SECCIONES = [
  { href: '/recepcion', titulo: 'Recepción', desc: 'Entrada de vehículos', icono: ICONO.recepcion },
  { href: '/citas', titulo: 'Citas', desc: 'Agenda e invitaciones', icono: ICONO.citas },
  { href: '/ordenes', titulo: 'Órdenes', desc: 'Órdenes de trabajo', icono: ICONO.ordenes },
  { href: '/presupuestos', titulo: 'Presupuestos', desc: 'Presupuestos y paquetes', icono: ICONO.presupuestos },
  { href: '/facturas', titulo: 'Facturas', desc: 'Facturas y cobros', icono: ICONO.facturas },
  { href: '/ajustes', titulo: 'Ajustes', desc: 'Configuración del taller', icono: ICONO.ajustes },
  { href: '/cambiar-pin', titulo: 'Mi PIN', desc: 'Cambiar mi PIN', icono: ICONO.pin },
]

function Icono({ d }: { d: string }) {
  return (
    <span className="tarjeta-icono" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
    </span>
  )
}

export default async function Inicio() {
  const s = await getSession()
  if (!s) redirect('/login')
  const u = await conTaller(s.tallerId, (tx) => usuarioDeSesion(tx as never, s))
  if (!u) redirect('/login') // baja, o PIN cambiado/reseteado desde otro sitio: la cookie vieja ya no vale
  if (u.debeCambiarPin === true) redirect('/cambiar-pin')
  const nominas = urlPortalEmpleado()
  return (
    <>
      <Cabecera conSalir />
      <main className="contenido">
        <h1>Taller</h1>
        <nav className="rejilla" aria-label="Secciones">
          {SECCIONES.map(s => (
            <a key={s.href} href={s.href} className="tarjeta">
              <Icono d={s.icono} />
              <span className="tarjeta-texto"><strong>{s.titulo}</strong><span className="desc">{s.desc}</span></span>
            </a>
          ))}
          {nominas && (
            <a href={nominas} className="tarjeta" target="_blank" rel="noopener noreferrer">
              <Icono d={ICONO.nominas} />
              <span className="tarjeta-texto"><strong>Mis nóminas</strong><span className="desc">Portal del Empleado</span></span>
            </a>
          )}
        </nav>
      </main>
    </>
  )
}
