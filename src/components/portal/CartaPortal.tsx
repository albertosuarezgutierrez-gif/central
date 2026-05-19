'use client'
import { useState, useEffect } from 'react'
import { C, SE, SN, SM } from '@/lib/colors'

interface Producto { id: string; nombre: string; precio: number | null; categoria: string; activo: boolean; familia: string | null }
interface Props { sh: () => Record<string, string> }

export default function CartaPortal({ sh }: Props) {
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    fetch('/api/owner/carta', { headers: sh() })
      .then(r => r.json())
      .then(d => { setProductos(d.productos ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtrados = productos.filter(p =>
    busqueda ? p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || p.categoria.toLowerCase().includes(busqueda.toLowerCase()) : true
  )
  const porCategoria = filtrados.reduce((acc, p) => {
    if (!acc[p.categoria]) acc[p.categoria] = []
    acc[p.categoria].push(p)
    return acc
  }, {} as Record<string, Producto[]>)

  if (loading) return <div style={{ padding: 24, fontFamily: SN, fontSize: 12, color: C.ink3 }}>Cargando carta...</div>

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, letterSpacing: '.1em', marginBottom: 4 }}>CARTA</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, color: C.ink }}>Productos</div>
          <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>{productos.filter(p => p.activo).length} activos · {productos.length} total</div>
        </div>
      </div>
      <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar producto o categoría..."
        style={{ width: '100%', fontFamily: SN, fontSize: 13, background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '9px 12px', color: C.ink, outline: 'none', marginBottom: 16 }} />
      {(Object.entries(porCategoria) as [string, Producto[]][]).map(([cat, prods]) => (
        <div key={cat} style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, fontWeight: 700, letterSpacing: '.1em', marginBottom: 8, paddingBottom: 4, borderBottom: `1px solid ${C.ruleS}` }}>{cat.toUpperCase()}</div>
          {prods.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.ruleS}`, opacity: p.activo ? 1 : 0.4 }}>
              <div style={{ fontFamily: SN, fontSize: 13, color: C.ink }}>{p.nombre}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {!p.activo && <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, background: C.paper2, padding: '2px 6px', borderRadius: 4 }}>INACTIVO</div>}
                {p.precio !== null && <div style={{ fontFamily: SM, fontSize: 13, color: C.ink, fontWeight: 700 }}>{p.precio.toFixed(2)}€</div>}
              </div>
            </div>
          ))}
        </div>
      ))}
      <div style={{ marginTop: 8, fontFamily: SN, fontSize: 11, color: C.ink3 }}>
        Para editar precios o añadir productos → <a href="/owner?tab=carta" style={{ color: C.red }}>Panel del dueño · Carta</a>
      </div>
    </div>
  )
}
