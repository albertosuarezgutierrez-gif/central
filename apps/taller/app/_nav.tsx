'use client'
import { usePathname } from 'next/navigation'

const ENLACES = [
  { href: '/', texto: 'Inicio' },
  { href: '/recepcion', texto: 'Recepción' },
  { href: '/citas', texto: 'Citas' },
  { href: '/ordenes', texto: 'Órdenes' },
  { href: '/presupuestos', texto: 'Presupuestos' },
  { href: '/ajustes', texto: 'Ajustes' },
]

/** Menú de la cabecera: marca la sección activa (relleno con el verde del taller). Solo navegación: no decide permisos. */
export function NavTaller() {
  const ruta = usePathname() ?? '/'
  const activo = (href: string) => (href === '/' ? ruta === '/' : ruta === href || ruta.startsWith(`${href}/`))
  return (
    <nav className="menu" aria-label="Secciones">
      {ENLACES.map((e) => (
        <a key={e.href} href={e.href} className={activo(e.href) ? 'menu-enlace activo' : 'menu-enlace'} aria-current={activo(e.href) ? 'page' : undefined}>{e.texto}</a>
      ))}
    </nav>
  )
}
