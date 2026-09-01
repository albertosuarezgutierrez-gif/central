'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Item = { label: string; icon: string; href: string; group: string }

const BASE_ITEMS: Item[] = [
  { label: 'Inicio', icon: '🏠', href: '/banca', group: 'Mi negocio' },
  { label: 'Negocios (holding)', icon: '🏢', href: '/banca?tab=negocios', group: 'Mi negocio' },
  { label: 'Finanzas', icon: '💶', href: '/finanzas', group: 'Mi negocio' },
  { label: 'Contable', icon: '🧮', href: '/contable', group: 'Mi negocio' },
  { label: 'Gastos', icon: '🧾', href: '/finanzas?tab=gastos', group: 'Mi negocio' },
  { label: 'Apartamentos', icon: '🏨', href: '/apartamentos', group: 'Mi negocio' },
  { label: 'Limpiezas', icon: '🧹', href: '/limpiezas', group: 'Mi negocio' },
  { label: 'Comunicación', icon: '💬', href: '/comunicacion', group: 'Mi negocio' },
  { label: 'Avisos Telegram', icon: '🔔', href: '/telegram', group: 'Mi negocio' },
  { label: 'Concursos', icon: '🏛️', href: '/concursos', group: 'Mi negocio' },
]

const OPERADOR_ITEMS: Item[] = [
  { label: 'Clientes', icon: '🏢', href: '/operador/clientes', group: 'Operador' },
  { label: 'ia-rest', icon: '🍽️', href: '/operador/iarest', group: 'Operador' },
  { label: 'Estructura', icon: '🗺️', href: '/operador/estructura', group: 'Operador' },
  { label: 'Flota (mapa)', icon: '🛰️', href: '/operador/flota-mapa', group: 'Operador' },
]

export default function CommandPalette({ isOperator }: { isOperator: boolean }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const items = isOperator ? [...BASE_ITEMS, ...OPERADOR_ITEMS] : BASE_ITEMS
  const filtered = query
    ? items.filter(i => i.label.toLowerCase().includes(query.toLowerCase()) || i.group.toLowerCase().includes(query.toLowerCase()))
    : items

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
        setQuery('')
        setSelected(0)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10)
  }, [open])

  useEffect(() => { setSelected(0) }, [query])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter' && filtered[selected]) { navigate(filtered[selected].href) }
  }

  function navigate(href: string) {
    setOpen(false)
    setQuery('')
    router.push(href)
  }

  if (!open) return null

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .palette-panel { width: calc(100% - 32px) !important; max-width: unset !important; max-height: 80vh !important; display: flex; flex-direction: column; }
          .palette-list { flex: 1; overflow-y: auto; }
        }
      `}</style>
      <div
        onClick={() => setOpen(false)}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '80px 16px 16px' }}
      >
      <div
        onClick={e => e.stopPropagation()}
        className="palette-panel"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', width: '100%', maxWidth: '500px', boxShadow: '0 20px 60px rgba(0,0,0,.2)', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)', gap: '10px' }}>
          <span style={{ fontSize: '16px' }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ir a…"
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: '15px', background: 'transparent', color: 'var(--text)' }}
          />
          <span style={{ fontSize: '11px', color: 'var(--muted)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '2px 6px' }}>Esc</span>
        </div>

        <div className="palette-list" style={{ maxHeight: '320px', overflowY: 'auto' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: '14px' }}>Sin resultados</div>
          )}
          {filtered.map((item, i) => {
            const showGroup = i === 0 || filtered[i - 1].group !== item.group
            return (
              <div key={item.href}>
                {showGroup && (
                  <div style={{ padding: '8px 16px 4px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {item.group}
                  </div>
                )}
                <button
                  onClick={() => navigate(item.href)}
                  onMouseEnter={() => setSelected(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    width: '100%', padding: '10px 16px', border: 'none', textAlign: 'left',
                    background: i === selected ? 'var(--primary-light)' : 'transparent',
                    color: i === selected ? 'var(--primary)' : 'var(--text)',
                    fontSize: '14px', fontWeight: i === selected ? 700 : 400, cursor: 'pointer',
                  }}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              </div>
            )
          })}
        </div>

        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--muted)' }}>
          <span>↑↓ navegar</span>
          <span>↵ abrir</span>
          <span>Cmd/Ctrl+K abrir/cerrar</span>
        </div>
      </div>
    </div>
    </>
  )
}
