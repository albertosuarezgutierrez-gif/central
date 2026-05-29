'use client'
import { useEffect, useState, Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

interface Item { id: string; nombre: string; descripcion: string | null; precio_eur: number; precio_final_eur: number; pdf_url: string | null }
interface Portal {
  titulo: string; descripcion: string | null; estado: string
  imagen_url: string | null; color_primario: string
  fecha_evento: string | null; fecha_limite_pago: string | null
  items: Item[]
  restaurantes: { nombre: string; logo_url: string | null }
}

function CobroInner() {
  const { slug } = useParams<{ slug: string }>()
  const sp = useSearchParams()
  const pagoOk = sp.get('pago') === 'ok'

  const [portal, setPortal] = useState<Portal | null>(null)
  const [notFound, setNotFound] = useState(false)
  // selección múltiple: { [item_id]: cantidad }
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/cobros/${slug}`)
      .then(r => r.json())
      .then(d => { if (d.portal) setPortal(d.portal); else setNotFound(true) })
      .catch(() => setNotFound(true))
  }, [slug])

  const toggleItem = (id: string) => {
    setCantidades(prev => {
      if (prev[id]) {
        const next = { ...prev }
        delete next[id]
        return next
      }
      return { ...prev, [id]: 1 }
    })
  }

  const setCantidad = (id: string, delta: number) => {
    setCantidades(prev => {
      const actual = prev[id] ?? 0
      const nueva = actual + delta
      if (nueva <= 0) {
        const next = { ...prev }
        delete next[id]
        return next
      }
      return { ...prev, [id]: nueva }
    })
  }

  const totalSeleccionados = Object.values(cantidades).reduce((a, b) => a + b, 0)
  const totalImporte = portal
    ? Object.entries(cantidades).reduce((acc, [id, qty]) => {
        const item = portal.items.find(i => i.id === id)
        return acc + (item ? item.precio_final_eur * qty : 0)
      }, 0)
    : 0

  const pagar = async () => {
    if (totalSeleccionados === 0 || !nombre.trim()) {
      setError('Selecciona al menos una opción e introduce tu nombre')
      return
    }
    setCargando(true); setError('')
    const items = Object.entries(cantidades).map(([item_id, cantidad]) => ({ item_id, cantidad }))
    const res = await fetch(`/api/cobros/${slug}/checkout`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, nombre_pagador: nombre, email_pagador: email })
    })
    const d = await res.json()
    if (d.checkout_url) window.location.href = d.checkout_url
    else { setError(d.error ?? 'Error al procesar el pago'); setCargando(false) }
  }

  if (!portal && !notFound) return (
    <div style={{ minHeight: '100vh', background: '#14110E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#9C8E7E', fontFamily: 'Inter Tight,sans-serif' }}>Cargando...</p>
    </div>
  )
  if (notFound) return (
    <div style={{ minHeight: '100vh', background: '#14110E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#9C8E7E', fontFamily: 'Inter Tight,sans-serif' }}>Portal no encontrado</p>
    </div>
  )

  const col = portal!.color_primario || '#D9442B'
  const r = parseInt(col.slice(1,3),16), g = parseInt(col.slice(3,5),16), b = parseInt(col.slice(5,7),16)
  const textCol = (r*299+g*587+b*114)/1000 > 128 ? '#1A1714' : '#F6F1E7'
  const colBg = col + '18'

  return (
    <div style={{ minHeight: '100vh', background: '#F6F1E7', fontFamily: 'Inter Tight,sans-serif' }}>

      {/* HERO */}
      <div style={{ background: col, padding: '2rem 1.25rem 1.5rem' }}>
        <div style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center' }}>
          {portal!.imagen_url ? (
            <img src={portal!.imagen_url} alt={portal!.titulo}
              style={{ maxHeight: 100, maxWidth: 260, objectFit: 'contain', margin: '0 auto 1.25rem', display: 'block' }} />
          ) : (
            <div style={{ width: 56, height: 56, borderRadius: 12, background: 'rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: 24 }}>🎫</div>
          )}
          <h1 style={{ fontFamily: 'Newsreader,serif', fontSize: '1.6rem', color: textCol, margin: '0 0 .4rem' }}>
            {portal!.titulo}
          </h1>
          {portal!.descripcion && (
            <p style={{ fontSize: 13, color: textCol, opacity: .8, margin: 0, lineHeight: 1.6 }}>{portal!.descripcion}</p>
          )}
          {(portal!.fecha_evento || portal!.fecha_limite_pago) && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: '.875rem', flexWrap: 'wrap' }}>
              {portal!.fecha_evento && (
                <div style={{ background: 'rgba(255,255,255,.18)', borderRadius: 8, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14 }}>📅</span>
                  <span style={{ fontFamily: 'Inter Tight,sans-serif', fontSize: 12, color: textCol, fontWeight: 600 }}>
                    {new Date(portal!.fecha_evento + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                </div>
              )}
              {portal!.fecha_limite_pago && portal!.estado !== 'cerrado' && (
                <div style={{ background: 'rgba(255,255,255,.18)', borderRadius: 8, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14 }}>⏳</span>
                  <span style={{ fontFamily: 'Inter Tight,sans-serif', fontSize: 12, color: textCol, fontWeight: 600 }}>
                    Plazo hasta el {new Date(portal!.fecha_limite_pago).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} a las {new Date(portal!.fecha_limite_pago).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '1.5rem 1.25rem 5rem' }}>

        {pagoOk && (
          <div style={{ background: '#EAF3DE', border: '1px solid #3F7D44', borderRadius: 12, padding: '1rem', marginBottom: '1.25rem', textAlign: 'center' }}>
            <p style={{ color: '#3F7D44', margin: 0, fontWeight: 600 }}>✓ Pago confirmado. ¡Gracias!</p>
          </div>
        )}

        {portal!.estado === 'cerrado' ? (
          <div style={{ background: '#FBF8F1', border: '1px solid #D8CDB6', borderRadius: 12, padding: '2rem', textAlign: 'center' }}>
            <p style={{ color: '#9C8E7E', margin: 0 }}>Este portal de pago está cerrado.</p>
          </div>
        ) : (
          <>
            {/* Selección múltiple */}
            <div style={{ background: '#FBF8F1', border: '1px solid #D8CDB6', borderRadius: 14, padding: '1.25rem', marginBottom: '1rem' }}>
              <p style={{ fontSize: 11, color: '#9C8E7E', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600, margin: '0 0 .75rem' }}>
                Elige tu menú — puedes seleccionar varios
              </p>
              {portal!.items.map((item) => {
                const sel = !!cantidades[item.id]
                const qty = cantidades[item.id] ?? 0
                return (
                  <div key={item.id}
                    style={{ border: `1.5px solid ${sel ? col : '#D8CDB6'}`, borderRadius: 12,
                      background: sel ? colBg : '#F6F1E7', marginBottom: '.5rem', transition: 'all .2s', overflow: 'hidden' }}>
                    {/* Fila principal — click para toggle */}
                    <div onClick={() => toggleItem(item.id)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {/* Checkbox visual */}
                        <div style={{ width: 20, height: 20, borderRadius: 6,
                          border: `1.5px solid ${sel ? col : '#D8CDB6'}`,
                          background: sel ? col : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {sel && <span style={{ color: textCol, fontSize: 12, lineHeight: 1, fontWeight: 700 }}>✓</span>}
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500, color: '#1A1714' }}>{item.nombre}</div>
                          {item.descripcion && <div style={{ fontSize: 12, color: '#9C8E7E' }}>{item.descripcion}</div>}
                          {item.pdf_url && (
                            <a href={item.pdf_url} target="_blank" onClick={e => e.stopPropagation()}
                              style={{ fontSize: 11, color: col, textDecoration: 'none', fontWeight: 600 }}>📄 Ver carta completa</a>
                          )}
                        </div>
                      </div>
                      <span style={{ fontFamily: 'Newsreader,serif', fontSize: '1.1rem', color: col, fontWeight: 500, flexShrink: 0, marginLeft: 10 }}>
                        {item.precio_final_eur.toFixed(2)} €
                      </span>
                    </div>
                    {/* Fila cantidad — solo si seleccionado */}
                    {sel && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 12px 10px', gap: 8 }}
                        onClick={e => e.stopPropagation()}>
                        <span style={{ fontSize: 12, color: '#9C8E7E', marginRight: 4 }}>Cantidad:</span>
                        <button onClick={() => setCantidad(item.id, -1)}
                          style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${col}`, background: 'transparent',
                            color: col, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>−</button>
                        <span style={{ fontSize: 15, fontWeight: 600, color: '#1A1714', minWidth: 20, textAlign: 'center' }}>{qty}</span>
                        <button onClick={() => setCantidad(item.id, 1)}
                          style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: col,
                            color: textCol, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>+</button>
                        <span style={{ fontSize: 13, color: '#6B5F52', marginLeft: 4, fontWeight: 500 }}>
                          = {(item.precio_final_eur * qty).toFixed(2)} €
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Datos pagador */}
            <div style={{ background: '#FBF8F1', border: '1px solid #D8CDB6', borderRadius: 14, padding: '1.25rem', marginBottom: '1rem' }}>
              <p style={{ fontSize: 11, color: '#9C8E7E', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600, margin: '0 0 .75rem' }}>Tus datos</p>
              <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre y apellidos *"
                style={{ width: '100%', padding: '10px 12px', background: '#F6F1E7', border: '1px solid #D8CDB6', borderRadius: 10, color: '#1A1714', fontSize: 14, outline: 'none', marginBottom: 8, boxSizing: 'border-box' as const }} />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email (para confirmación)"
                style={{ width: '100%', padding: '10px 12px', background: '#F6F1E7', border: '1px solid #D8CDB6', borderRadius: 10, color: '#1A1714', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }} />
            </div>

            {error && <p style={{ color: '#D9442B', fontSize: 13, marginBottom: '1rem' }}>{error}</p>}

            {/* Resumen total */}
            {totalSeleccionados > 0 && (
              <div style={{ background: colBg, border: `1px solid ${col}30`, borderRadius: 12, padding: '10px 14px', marginBottom: '1rem',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#6B5F52' }}>{totalSeleccionados} unidad{totalSeleccionados !== 1 ? 'es' : ''}</span>
                <span style={{ fontFamily: 'Newsreader,serif', fontSize: '1.2rem', color: col, fontWeight: 600 }}>
                  Total: {totalImporte.toFixed(2)} €
                </span>
              </div>
            )}

            <button onClick={pagar} disabled={totalSeleccionados === 0 || !nombre.trim() || cargando}
              style={{ width: '100%', padding: 14, background: col, color: textCol, border: 'none', borderRadius: 12,
                fontSize: 15, fontWeight: 600, cursor: totalSeleccionados === 0 || !nombre.trim() ? 'not-allowed' : 'pointer',
                opacity: totalSeleccionados === 0 || !nombre.trim() || cargando ? .5 : 1, transition: 'opacity .2s' }}>
              {cargando ? 'Procesando...' : totalSeleccionados > 0 ? `Pagar ${totalImporte.toFixed(2)} € con tarjeta` : 'Pagar con tarjeta'}
            </button>
            <p style={{ fontSize: 11, color: '#9C8E7E', textAlign: 'center', marginTop: 8 }}>🔒 Pago seguro procesado por Stripe</p>
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid #D8CDB6' }}>
          <a href="https://www.iarest.es" target="_blank"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, textDecoration: 'none', color: '#9C8E7E', fontSize: 12 }}>
            <div style={{ width: 6, height: 6, background: '#D9442B', borderRadius: '50%' }} />
            Cobros gestionados por <strong style={{ color: '#6B5F52', marginLeft: 3 }}>ia.rest</strong>
          </a>
        </div>
      </div>
    </div>
  )
}

export default function CobroPage() {
  return <Suspense fallback={null}><CobroInner /></Suspense>
}
