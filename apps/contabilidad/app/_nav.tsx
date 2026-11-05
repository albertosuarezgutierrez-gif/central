'use client'
import { usePathname } from 'next/navigation'

const ENLACES = [
  { href: '/', texto: 'Inicio' },
  { href: '/evolucion', texto: 'Evolución' },
  { href: '/rentabilidad', texto: 'Rentabilidad' },
  { href: '/informes', texto: 'Informes' },
  { href: '/plan', texto: 'Plan de cuentas' },
  { href: '/diario', texto: 'Libro diario' },
  { href: '/mayor', texto: 'Mayor' },
  { href: '/asientos/nuevo', texto: 'Nuevo asiento' },
  { href: '/ajustes/reglas', texto: 'Ajustes' },
]

/** Menú de secciones: marca la activa con el acento de la empresa. Solo navegación: no decide permisos. */
export function NavContabilidad() {
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
