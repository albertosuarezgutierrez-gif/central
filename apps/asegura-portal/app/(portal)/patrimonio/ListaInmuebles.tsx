'use client'

import Link from 'next/link'
import { useState } from 'react'

import { rutaManual } from '@central/module-seguros-portal'

import { ordenarConUnidades } from '@/lib/patrimonio/edificio-vista'
import { ETIQUETA_USO, type UsoInmueble } from '@/lib/patrimonio/usos'

export const PAGINA_INMUEBLES = 50

type Fila = { id: string; alias: string; uso: string; direccion: string | null; calleSinValidar?: boolean | null; superficie: string | null; inmueblePadreId?: string | null }

/** Plegado perezoso: ~50 filas y «Ver más». Nada monta cientos de filas de golpe. */
export function ListaInmuebles({ inmuebles }: { inmuebles: Fila[] }) {
  const [visibles, setVisibles] = useState(PAGINA_INMUEBLES)
  // Edificio sin división horizontal (27/10/2026): sus unidades van detrás de él, sangradas.
  const ordenadas = ordenarConUnidades(inmuebles)
  if (inmuebles.length === 0) {
    return (
      <p className="suave" style={{ margin: 0 }}>
        Todavía no hay inmuebles dados de alta. Empieza con «Añadir inmueble»; si necesitas ayuda, mira{' '}
        <Link href={rutaManual('alquileres')} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>cómo funciona Patrimonio</Link>.
      </p>
    )
  }
  return (
    <>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        {ordenadas.slice(0, visibles).map(({ fila: i, edificioId, unidades }) => (
          <li key={i.id} style={edificioId ? { paddingLeft: 16, minWidth: 0 } : { minWidth: 0 }}>
            <Link className="boton-tenue" style={{ width: '100%', minHeight: 44, justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }} href={`/patrimonio/inmueble/${i.id}`}>
              <span style={{ overflowWrap: 'anywhere', textAlign: 'left', minWidth: 0 }}>
                <strong>{i.alias}</strong>
                <br />
                <span className="suave" style={{ fontSize: 13 }}>{i.direccion ?? 'Dirección: no consta'}{i.superficie ? ` · ${i.superficie} m²` : ''}</span>
                {i.calleSinValidar === true && <span className="suave" style={{ fontSize: 12, display: 'block' }}>Calle por validar</span>}
                {unidades > 0 && <span className="suave" style={{ fontSize: 12, display: 'block' }}>{unidades} {unidades === 1 ? 'unidad' : 'unidades'}</span>}
              </span>
              <span className="chip">{i.uso === 'edificio' ? 'Edificio' : (ETIQUETA_USO[i.uso as UsoInmueble] ?? i.uso)}</span>
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
