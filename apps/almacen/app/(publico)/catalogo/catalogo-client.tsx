'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { eur } from '@/lib/format'
import type { ItemCatalogo } from '@/lib/publico'

const PAGINA = 50

export default function CatalogoClient({ items }: { items: ItemCatalogo[] }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string>('')
  const [visible, setVisible] = useState(PAGINA)

  const categorias = useMemo(() => {
    const set = new Map<string, number>()
    for (const it of items) set.set(it.categoria, (set.get(it.categoria) ?? 0) + 1)
    return [...set.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)
  }, [items])

  const filtrados = useMemo(() => {
    const term = q.trim().toLowerCase()
    return items.filter((it) => {
      if (cat && it.categoria !== cat) return false
      if (term && !it.nombre.toLowerCase().includes(term)) return false
      return true
    })
  }, [items, q, cat])

  const mostrados = filtrados.slice(0, visible)

  function resetVisible(fn: () => void) {
    fn()
    setVisible(PAGINA)
  }

  return (
    <>
      <div className="pub-filtros">
        <input
          type="search"
          placeholder="Buscar material…"
          value={q}
          onChange={(e) => resetVisible(() => setQ(e.target.value))}
          className="pub-search"
        />
        <div className="chip-row pub-chips">
          <button className={`chip${cat === '' ? ' chip-active' : ''}`} onClick={() => resetVisible(() => setCat(''))}>
            Todo
          </button>
          {categorias.map((c) => (
            <button key={c} className={`chip${cat === c ? ' chip-active' : ''}`} onClick={() => resetVisible(() => setCat(c))}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="pub-count muted">
        {filtrados.length} {filtrados.length === 1 ? 'artículo' : 'artículos'}
      </div>

      {filtrados.length === 0 ? (
        <div className="card empty">
          <span className="emoji">🔍</span>
          <div className="title">Sin resultados</div>
          <div>Prueba con otra búsqueda o categoría.</div>
        </div>
      ) : (
        <div className="pub-grid">
          {mostrados.map((it) => (
            <Link key={it.id} href={`/catalogo/${it.id}`} className="pub-card">
              <div className="pub-foto">
                {it.imagenUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={it.imagenUrl} alt={it.nombre} loading="lazy" />
                ) : (
                  <span className="pub-foto-ph">🍽️</span>
                )}
                {it.disponible > 0 ? (
                  <span className="pub-disp ok">{it.disponible} disp.</span>
                ) : (
                  <span className="pub-disp agotado">Sin stock</span>
                )}
              </div>
              <div className="pub-card-body">
                <div className="pub-card-nombre">{it.nombre}</div>
                {it.capacidad && <div className="pub-card-cap muted">{it.capacidad}</div>}
                <div className="pub-card-precio">
                  {eur(it.precioAlquiler)} <span className="muted">/ ud.</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {visible < filtrados.length && (
        <div className="pub-vermas">
          <button className="btn btn-ghost" onClick={() => setVisible((v) => v + PAGINA)}>
            Ver más ({filtrados.length - visible})
          </button>
        </div>
      )}
    </>
  )
}
