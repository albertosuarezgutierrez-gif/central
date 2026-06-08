'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const NAV = [
  { href: '/dashboard',   label: 'Dashboard',    icon: '⊞' },
  { href: '/income',      label: 'Ingresos',     icon: '€' },
  { href: '/expenses',    label: 'Gastos',       icon: '↙' },
  { href: '/properties',  label: 'Propiedades',  icon: '⌂' },
  { href: '/calendario',  label: 'Calendario',   icon: '◫' },
  { href: '/mensajes',    label: 'Mensajes',     icon: '✉' },
  { href: '/admin/limpiadoras', label: 'Limpiadoras', icon: '◈' },
  { href: '/pricing',     label: 'Pricing',      icon: '◎' },
  { href: '/mercado',     label: 'Mercado',      icon: '⊞' },
  { href: '/agente',      label: 'Agente IA',    icon: '✦' },
  { href: '/knowledge',   label: 'Knowledge',    icon: '◻' },
  { href: '/inversion',   label: 'Inversión',    icon: '🏡' },
]

function SivraLogo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={{ display: 'block', imageRendering: 'pixelated' }}>
      <rect x="1"  y="1"  width="8" height="8" fill="#7EC820" />
      <rect x="11" y="1"  width="8" height="8" fill="#7EC820" opacity="0.35" />
      <rect x="1"  y="11" width="8" height="8" fill="#7EC820" opacity="0.35" />
      <rect x="11" y="11" width="8" height="8" fill="#7EC820" />
    </svg>
  )
}

export default function Sidebar() {
  const path = usePathname()
  const [open, setOpen] = useState(false)

  const NavItems = () => (
    <>
      {/* Logo */}
      <div style={{
        padding: '18px 16px',
        borderBottom: '1px solid #E8EDF3',
        display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0,
      }}>
        <SivraLogo size={26} />
        <div>
          <div style={{ fontSize: '15px', fontWeight: 900, letterSpacing: '3px', color: '#1A2535', fontStyle: 'italic', lineHeight: 1.1 }}>
            SIVRA
          </div>
          <div style={{ fontSize: '8px', color: '#8A9DB5', letterSpacing: '2.5px', marginTop: '1px' }}>
            INTRANET · SEVILLA
          </div>
        </div>
      </div>

      {/* Nav — overflow-y:auto + min-h:0 para que todos los ítems sean accesibles */}
      <nav style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 10px' }}>
        {NAV.map(item => {
          const active = path === item.href || (item.href !== '/dashboard' && path.startsWith(item.href))
          return (
            <Link key={item.href} href={item.href}
              onClick={() => setOpen(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: '9px',
                padding: '9px 10px', borderRadius: '8px', marginBottom: '1px',
                textDecoration: 'none', transition: 'background 0.12s',
                background: active ? 'rgba(126,200,32,0.10)' : 'transparent',
                borderLeft: active ? '3px solid #7EC820' : '3px solid transparent',
                color: active ? '#1A2535' : '#6B7F96',
                fontWeight: active ? 600 : 400,
                fontSize: '13px', letterSpacing: '-0.01em',
              }}>
              <span style={{ width: '16px', textAlign: 'center', fontSize: '13px', opacity: active ? 1 : 0.5 }}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{
        padding: '12px 16px', borderTop: '1px solid #E8EDF3', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: '6px',
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7EC820', display: 'inline-block', flexShrink: 0 }} />
        <span style={{ fontSize: '10px', color: '#8A9DB5', letterSpacing: '0.5px' }}>
          Sevilla · 4 propiedades activas
        </span>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-14 md:hidden"
        style={{ background: '#FFFFFF', borderBottom: '1px solid #E8EDF3', boxShadow: '0 1px 4px rgba(26,37,53,.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SivraLogo size={22} />
          <span style={{ fontSize: '14px', fontWeight: 800, letterSpacing: '2px', color: '#1A2535', fontStyle: 'italic' }}>SIVRA</span>
        </div>
        <button onClick={() => setOpen(!open)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#6B7F96' }}>☰</button>
      </div>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,37,53,0.4)' }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: '220px',
            display: 'flex', flexDirection: 'column', background: '#FFFFFF',
            boxShadow: '4px 0 20px rgba(26,37,53,.12)',
          }}>
            <NavItems />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-56 z-30"
        style={{ background: '#FFFFFF', borderRight: '1px solid #E8EDF3', boxShadow: '2px 0 8px rgba(26,37,53,.04)' }}>
        <NavItems />
      </div>
    </>
  )
}
