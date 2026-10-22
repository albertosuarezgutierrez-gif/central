'use client'

import Link from 'next/link'
import { useState } from 'react'

import { ETIQUETA_USO, type UsoInmueble } from '@/lib/patrimonio/usos'

export const PAGINA_INMUEBLES = 50

type Fila = { id: string; alias: string; uso: string; direccion: string | null; superficie: string | null }

/** Plegado perezoso: ~50 filas y «Ver más». Nada monta cientos de filas de golpe. */
export function ListaInmuebles({ inmuebles }: { inmuebles: Fila[] }) {
  const [visibles, setVisibles] = useState(PAGINA_INMUEBLES)
  if (inmuebles.length === 0) return <p className="suave" style={{ margin: 0 }}>Todavía no hay inmuebles dados de alta.</p>
  return (
    <>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        {inmuebles.slice(0, visibles).map((i) => (
          <li key={i.id}>
            <Link className="boton-tenue" style={{ width: '100%', minHeight: 44, justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }} href={`/patrimonio/inmueble/${i.id}`}>
              <span style={{ overflowWrap: 'anywhere', textAlign: 'left', minWidth: 0 }}>
                <strong>{i.alias}</strong>
                <br />
                <span className="suave" style={{ fontSize: 13 }}>{i.direccion ?? 'Dirección: no consta'}{i.superficie ? ` · ${i.superficie} m²` : ''}</span>
              </span>
              <span className="chip">{ETIQUETA_USO[i.uso as UsoInmueble] ?? i.uso}</span>
            </Link>
          </li>
        ))}
      </ul>
      {inmuebles.length > visibles && (
        <button type="button" className="boton boton-secundario" style={{ minHeight: 44, marginTop: 8 }} onClick={() => setVisibles((v) => v + PAGINA_INMUEBLES)}>
          Ver más ({inmuebles.length - visibles} restantes)
        </button>
      )}
    </>
  )
}
