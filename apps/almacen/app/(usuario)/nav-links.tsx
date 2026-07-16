'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/panel', label: 'Panel' },
  { href: '/almacenes', label: 'Almacenes' },
  { href: '/materiales', label: 'Materiales' },
  { href: '/transferencias', label: 'Transferencias' },
  { href: '/movimientos', label: 'Movimientos' },
  { href: '/familias', label: 'Familias' },
]

export default function NavLinks() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const links = LINKS.map((l) => {
    const active = pathname === l.href || pathname.startsWith(l.href + '/')
    return (
      <Link key={l.href} href={l.href} className={`nav-link${active ? ' active' : ''}`} onClick={() => setOpen(false)}>
        {l.label}
      </Link>
    )
  })

  return (
    <>
      <button className="nav-burger" aria-label="Menú" onClick={() => setOpen((v) => !v)}>
        {open ? '✕' : '☰'}
      </button>
      <div className="nav-links">{links}</div>
      {open && <div className="nav-drawer">{links}</div>}
    </>
  )
}
