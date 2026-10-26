'use client'

import Link from 'next/link'
import { useState } from 'react'

import type { EntradaCalendario, OrigenCalendario } from '@central/module-seguros-portal'

/**
 * La lista del calendario único (26/10/2026). Recibe las entradas YA compuestas y ordenadas por el servidor
 * (`componerCalendario`) y solo decide cuántas pinta: `tope` de golpe y «Ver más» (regla de rendimiento de la casa: nada
 * monta cientos de filas de golpe). El estado, la fecha y el origen se dicen con TEXTO, nunca solo con color.
 */
const ORIGEN: Record<OrigenCalendario, string> = {
  seguro: 'Seguro',
  recibo: 'Recibo',
  patrimonio: 'Patrimonio',
  recordatorio: 'Recordatorio',
  aviso: 'Aviso',
}

const TRAMO: Record<EntradaCalendario['tramo'], string | null> = {
  vencida: 'Vencida',
  hoy: 'Hoy',
  proxima: 'Se acerca',
  despues: null,
  sin_fecha: 'Sin fecha',
}

const fechaEs = (iso: string) => iso.split('-').reverse().join('/')

function cuando(e: EntradaCalendario): string {
  if (e.fecha === null || e.dias === null) return 'No sabemos cuándo te toca'
  if (e.dias === 0) return `Hoy (${fechaEs(e.fecha)})`
  if (e.dias > 0) return `${fechaEs(e.fecha)} · dentro de ${e.dias} ${e.dias === 1 ? 'día' : 'días'}`
  return `${fechaEs(e.fecha)} · hace ${-e.dias} ${e.dias === -1 ? 'día' : 'días'}`
}

export function ListaCalendario({ entradas, tope }: { entradas: EntradaCalendario[]; tope: number }) {
  const [limite, setLimite] = useState(tope)
  const visibles = entradas.slice(0, limite)
  const restan = entradas.length - visibles.length

  return (
    <>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        {visibles.map((e) => {
          const chip = TRAMO[e.tramo]
          return (
            <li key={e.clave} style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <strong style={{ overflowWrap: 'anywhere' }}>{e.titulo}</strong>
                <span className="chip">{ORIGEN[e.origen]}</span>
                {e.urgente && <span className="chip aviso">Requiere tu atención</span>}
                {chip !== null && <span className="chip">{chip}</span>}
              </div>
              <div className="suave" style={{ fontSize: 14, overflowWrap: 'anywhere' }}>
                {cuando(e)}
              </div>
              {e.detalle && <div style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{e.detalle}</div>}
              {e.href.startsWith('#') ? (
                <a href={e.href} style={{ display: 'inline-block', minHeight: 44, paddingBlock: 10 }}>
                  Ver o gestionar
                </a>
              ) : (
                <Link href={e.href} style={{ display: 'inline-block', minHeight: 44, paddingBlock: 10 }}>
                  Abrir
                </Link>
              )}
            </li>
          )
        })}
      </ul>
      {restan > 0 && (
        <button
          type="button"
          className="boton-tenue"
          style={{ minHeight: 44, marginTop: 12 }}
          onClick={() => setLimite((l) => l + tope)}
        >
          Ver más ({restan})
        </button>
      )}
    </>
  )
}
