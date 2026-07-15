'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/materiales', label: 'Materiales' },
  { href: '/familias', label: 'Familias' },
]

export default function NavLinks() {
  const pathname = usePathname()
  return (
    <div className="nav-links">
      {LINKS.map((l) => {
        const active = pathname === l.href || pathname.startsWith(l.href + '/')
        return (
          <Link key={l.href} href={l.href} className={`nav-link${active ? ' active' : ''}`}>
            {l.label}
          </Link>
        )
      })}
    </div>
  )
}
