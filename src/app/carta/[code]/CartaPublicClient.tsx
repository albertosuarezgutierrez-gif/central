'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

// ─── Types ───────────────────────────────────────────────────
type Producto = {
  id: string
  nombre: string
  descripcion: string | null
  precio: number | null
  categoria: string
}
type Restaurante = { nombre: string; slug: string }

// ─── Design tokens (paleta crema, orientada al cliente) ───────
const C = {
  paper: '#F6F1E7',
  paper2: '#EFE7D6',
  bone: '#FBF8F1',
  ink: '#1A1714',
  ink2: '#3A332C',
  ink3: '#6B5F52',
  ink4: '#9A8D7C',
  rule: '#D8CDB6',
  red: '#D9442B',
  redD: '#A8311E',
  amber: '#E8A33B',
}
const SN = "'Inter Tight',system-ui,sans-serif"
const SE = "'Newsreader',Georgia,serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"

// Orden preferido de categorías en la carta
const CAT_ORDER = [
  'entrantes', 'ensaladas', 'principales', 'carnes', 'pescados',
  'pasta', 'arroces', 'postres', 'bebidas', 'vinos', 'cervezas',
  'cafes', 'cafés', 'copas', 'otras',
]

function sortCategorias(cats: string[]): string[] {
  const lowers = cats.map(c => c.toLowerCase())
  const ordered = CAT_ORDER.filter(c => lowers.includes(c)).map(
    c => cats[lowers.indexOf(c)]
  )
  const rest = cats.filter(c => !CAT_ORDER.includes(c.toLowerCase()))
  return [...ordered, ...rest]
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ─── Loading screen ───────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{ minHeight: '100vh', background: C.paper, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: SM, fontSize: 11, color: C.ink3, letterSpacing: '.15em' }}>CARGANDO…</div>
    </div>
  )
}

// ─── Not found screen ─────────────────────────────────────────
function NotFoundScreen() {
  return (
    <div style={{ minHeight: '100vh', background: C.paper, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <div style={{ fontFamily: SE, fontSize: 28, fontStyle: 'italic', color: C.ink3 }}>Restaurante no encontrado</div>
      <div style={{ fontFamily: SN, fontSize: 14, color: C.ink4 }}>Comprueba el enlace o el código QR</div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────
export default function CartaPublicClient({ code }: { code: string }) {
  const searchParams = useSearchParams()
  const autoprint = searchParams.get('imprimir') === '1'

  const [restaurante, setRestauranteData] = useState<Restaurante | null>(null)
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    fetch(`/api/carta/${code}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setNotFound(true); setLoading(false); return }
        setRestauranteData(d.restaurante)
        setProductos(d.productos || [])
        setLoading(false)
      })
      .catch(() => { setNotFound(true); setLoading(false) })
  }, [code])

  // Auto-print cuando viene desde el botón PDF del owner
  useEffect(() => {
    if (!loading && !notFound && autoprint) {
      const t = setTimeout(() => window.print(), 900)
      return () => clearTimeout(t)
    }
  }, [loading, notFound, autoprint])

  if (loading) return <LoadingScreen />
  if (notFound) return <NotFoundScreen />

  // Agrupar por categoría
  const byCategoria = productos.reduce<Record<string, Producto[]>>((acc, p) => {
    const cat = p.categoria || 'Otras'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(p)
    return acc
  }, {})

  const categorias = sortCategorias(Object.keys(byCategoria))

  return (
    <div style={{ minHeight: '100vh', background: C.paper }}>
      {/* ── Google Fonts + global styles ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Newsreader:ital,wdth,wght@0,75..125,400..700;1,75..125,400..700&family=JetBrains+Mono:wght@400;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { -webkit-text-size-adjust: 100%; }
        body { background: #F6F1E7; }

        /* ── Responsive ── */
        .carta-restaurant-name { font-size: clamp(24px, 7vw, 40px); }
        .carta-header-wrap     { padding: clamp(28px,6vw,48px) 20px clamp(20px,4vw,32px); }
        .carta-container       { max-width: 680px; margin: 0 auto; padding: clamp(20px,4vw,32px) 16px 80px; }
        .producto-nombre       { min-width: 0; word-break: break-word; }
        .precio-col            { flex-shrink: 0; white-space: nowrap; }

        @media (max-width: 400px) {
          .carta-restaurant-name { font-size: 22px; }
          .carta-header-wrap     { padding: 24px 16px 18px; }
          .carta-container       { padding: 16px 12px 64px; }
        }

        @media print {
          .no-print { display: none !important; }
          body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 1.8cm 1.5cm; size: A4; }
          .carta-container { padding: 0 !important; max-width: 100% !important; }
          .cat-divider { break-after: avoid; }
          .producto-row { break-inside: avoid; }
        }
      `}</style>

      {/* ── Header de navegación (solo en pantalla) ── */}
      <div className="no-print" style={{
        background: C.ink, color: C.paper,
        padding: '10px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ fontFamily: SM, fontSize: 10, letterSpacing: '.15em', opacity: .5 }}>ia.rest</div>
        <button
          onClick={() => window.print()}
          style={{
            background: C.red, color: C.paper, border: 'none', borderRadius: 4,
            padding: '6px 16px', fontFamily: SN, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8"/>
          </svg>
          Guardar PDF
        </button>
      </div>

      {/* ── Cabecera del restaurante ── */}
      <div className="carta-header-wrap" style={{
        textAlign: 'center',
        borderBottom: `1px solid ${C.rule}`,
      }}>
        <div style={{
          fontFamily: SM, fontSize: 10, fontWeight: 700,
          letterSpacing: '.2em', color: C.ink3, textTransform: 'uppercase', marginBottom: 12,
        }}>
          Carta
        </div>
        <div className="carta-restaurant-name" style={{
          fontFamily: SE, fontStyle: 'italic',
          color: C.ink, lineHeight: 1.15,
        }}>
          {restaurante?.nombre}
        </div>
        {/* Ornamento */}
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <div style={{ height: 1, width: 48, background: C.rule }} />
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.red }} />
          <div style={{ height: 1, width: 48, background: C.rule }} />
        </div>
      </div>

      {/* ── Contenido de la carta ── */}
      <div className="carta-container">
        {categorias.map((cat, catIdx) => (
          <div key={cat} style={{ marginBottom: 44 }}>
            {/* Título de categoría */}
            <div className="cat-divider" style={{
              display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
            }}>
              <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.2em', color: C.red, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                {capitalize(cat)}
              </div>
              <div style={{ flex: 1, height: 1, background: C.rule }} />
            </div>

            {/* Productos */}
            {byCategoria[cat].map((p, i) => (
              <div
                key={p.id}
                className="producto-row"
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '13px 0',
                  borderBottom: i < byCategoria[cat].length - 1 ? `1px solid ${C.rule}` : 'none',
                }}>
                {/* Nombre + descripción */}
                <div className="producto-nombre">
                  <div style={{ fontFamily: SN, fontSize: 15, fontWeight: 600, color: C.ink, lineHeight: 1.3 }}>
                    {p.nombre}
                  </div>
                  {p.descripcion && (
                    <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginTop: 4, lineHeight: 1.5 }}>
                      {p.descripcion}
                    </div>
                  )}
                </div>
                {/* Precio */}
                <div className="precio-col" style={{
                  fontFamily: SE, fontSize: 16, fontStyle: 'italic',
                  color: C.ink2,
                }}>
                  {p.precio != null ? `${p.precio.toFixed(2)} €` : '—'}
                </div>
              </div>
            ))}
          </div>
        ))}

        {productos.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', fontFamily: SE, fontSize: 22, fontStyle: 'italic', color: C.ink4 }}>
            Carta no disponible
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{
        borderTop: `1px solid ${C.rule}`,
        padding: '24px 20px',
        textAlign: 'center',
      }}>
        <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, letterSpacing: '.12em', textTransform: 'uppercase' }}>
          Carta digital · ia.rest
        </div>
      </div>
    </div>
  )
}
