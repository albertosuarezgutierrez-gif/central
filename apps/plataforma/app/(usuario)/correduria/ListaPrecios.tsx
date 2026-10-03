'use client'

// Lista de precios de una tarificación, pensada para el MÓVIL (28/09/2026). Sustituye a la tabla
// de 5-6 columnas de moto/auto nuevo: en el móvil se salía por la derecha (franquicia, firmeza y
// «Emitir» quedaban fuera de la pantalla) y repetía «Mapfre · Motos» en cada fila.
//
// Una fila = logo · cobertura y franquicia · prima · botón. La franquicia va SIEMPRE a la vista:
// es lo que distingue cuatro «Todo riesgo con franquicia» de la misma compañía. El panel de emitir
// se abre JUSTO debajo de su fila, no al final de la lista.

import { useState, type ReactNode } from 'react'
import { Badge, btnStyle } from '@/components/ui'
import { eur } from '@/lib/dinero'
import { CeldaCompania } from './CeldaCompania'
import { bloqueoCompania, esMismaCompaniaQueLaActual, reparosPorFila, textoBloqueoCorredor } from '@central/module-seguros'
import { textoPagasProponemos } from '@/lib/correduria/competencia-oportunidad'

/** Lo que paga hoy en la competencia, ya anualizado (`vistaCompetencia`). `anual: null` = no se compara, y `motivo` dice por qué. */
export type PrimaActualLista = { anual: number | null; motivo: string | null; compania: string | null }

export type PrecioLista = {
  id?: string
  compania?: string | null
  producto?: string | null
  categoria?: string | null
  modalidad?: string | null
  primaEur?: number | null
  franquiciaEur?: number | null
  firmeza?: string
  avisos?: string[]
}

export default function ListaPrecios<P extends PrecioLista>({
  precios,
  simulado,
  puedeEmitir,
  motivoNoEmitir,
  emision,
  detalle,
  actual,
}: {
  /** «Pagas X → te proponemos Y» (03/10/2026). Sin esto la lista es la de siempre. */
  actual?: PrimaActualLista | null
  precios: P[]
  simulado: boolean
  /** Sin esto no hay botón «Emitir» (p. ej. sin cotización guardada). */
  puedeEmitir?: boolean
  motivoNoEmitir?: string
  /** El panel de emisión de un precio; `cerrar` lo pliega. */
  emision?: (p: P, cerrar: () => void) => ReactNode
  /** Datos ramo-específicos que aparecen debajo de la cobertura (p. ej. franquicia doble para hogar). */
  detalle?: (p: P) => ReactNode
}) {
  const [abierta, setAbierta] = useState<string | null>(null)
  // De la más barata a la más cara; sin prima, al final. La clave es el id del vendor o la
  // posición ORIGINAL (nunca la posición tras ordenar: señalaría otra fila).
  // Lo que no cuadra de cada opción (prima, franquicia, identidad): se calcula sobre la lista
  // ORIGINAL, antes de ordenar, para que cada reparo caiga en su fila.
  const reparos = reparosPorFila(precios)
  const filas = precios
    .map((p, i) => ({ p, clave: p.id ?? `i${i}`, reparos: reparos[i] ?? [] }))
    .sort((a, b) => (a.p.primaEur ?? Infinity) - (b.p.primaEur ?? Infinity))
  const todasEstimadas = !simulado && precios.length > 0 && precios.every((p) => p.firmeza !== 'firme')

  return (
    <div>
      {todasEstimadas && (
        <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 6px' }}>
          Todos son precios <strong>estimados</strong>: la compañía puede cambiarlos al verificar los datos.
        </p>
      )}
      {actual && (
        actual.anual !== null
          ? <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 6px' }}>Hoy paga {eur(actual.anual)}/año{actual.compania ? ` con ${actual.compania}` : ''}.</p>
          : actual.motivo && <p style={{ color: 'var(--warning)', fontSize: 12, margin: '0 0 6px', overflowWrap: 'anywhere' }}>{actual.motivo}</p>
      )}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {filas.map(({ p, clave, reparos: reparosFila }) => {
          const abiertaEsta = abierta === clave
          return (
            <li key={clave} style={{ borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', minWidth: 0 }}>
                <div style={{ flex: '0 0 76px', minWidth: 0 }}>
                  <CeldaCompania compania={p.compania} producto={p.producto} />
                </div>
                <div style={{ flex: '1 1 auto', minWidth: 0, fontSize: 13, lineHeight: 1.3 }}>
                  <div style={{ overflowWrap: 'anywhere' }}>{p.categoria ?? <span style={{ color: 'var(--muted)' }}>cobertura sin declarar</span>}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                    {p.franquiciaEur === null || p.franquiciaEur === undefined ? 'franquicia no declarada' : p.franquiciaEur === 0 ? 'sin franquicia' : `franquicia ${eur(p.franquiciaEur)}`}
                  </div>
                  {detalle && <div style={{ fontSize: 12, marginTop: 4 }}>{detalle(p)}</div>}
                  {actual && (() => {
                    const t = textoPagasProponemos(actual.anual, p.primaEur)
                    return t ? (
                      <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text)', overflowWrap: 'anywhere' }}>
                        {t}{esMismaCompaniaQueLaActual(actual.compania, p.compania) === true ? ' · es su compañía actual' : ''}
                      </div>
                    ) : null
                  })()}
                  {!todasEstimadas && p.firmeza !== 'firme' && (
                    <Badge tono="aviso" title={p.avisos?.join(' · ')}>{p.firmeza ?? 'sin determinar'}</Badge>
                  )}
                  {simulado && <Badge tono="aviso">simulado</Badge>}
                  {bloqueoCompania(p.avisos) !== null && (
                    <div style={{ fontSize: 12, color: 'var(--negative)', fontWeight: 600, marginTop: 4 }}>{textoBloqueoCorredor(bloqueoCompania(p.avisos) as string, p.compania)}</div>
                  )}
                  {reparosFila.map((m) => (
                    <div key={m} style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 600, marginTop: 4, overflowWrap: 'anywhere' }}>⚠️ {m}</div>
                  ))}
                </div>
                <div style={{ flex: '0 0 auto', textAlign: 'right' }}>
                  <strong style={{ fontSize: 16, whiteSpace: 'nowrap' }}>{p.primaEur === null || p.primaEur === undefined ? '—' : eur(p.primaEur)}</strong>
                  <div style={{ color: 'var(--muted)', fontSize: 11 }}>al año</div>
                </div>
                {emision && (
                  <button
                    type="button"
                    disabled={!puedeEmitir}
                    title={puedeEmitir ? 'Confirmar con la compañía y emitir' : motivoNoEmitir}
                    aria-expanded={abiertaEsta}
                    onClick={() => setAbierta(abiertaEsta ? null : clave)}
                    style={{ ...btnStyle(abiertaEsta ? 'primario' : 'secundario', 'sm'), minHeight: 44, flex: '0 0 auto' }}
                  >
                    {abiertaEsta ? 'Cerrar' : 'Emitir'}
                  </button>
                )}
              </div>
              {abiertaEsta && emision && puedeEmitir && <div style={{ paddingBottom: 10 }}>{emision(p, () => setAbierta(null))}</div>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * La misma lista, PLEGADA: cuando debajo está «Qué verá el cliente» (que ya enseña todos los precios
 * de la más barata a la más cara), repetirla abierta eran dos listas de 31 filas seguidas. Aquí queda
 * solo para emitir cuando el cliente ya ha dicho que sí. Montaje perezoso: sin abrir, no hay DOM.
 */
export function ListaPreciosPlegada<P extends PrecioLista>({ titulo, ...props }: Parameters<typeof ListaPrecios<P>>[0] & { titulo?: string }) {
  const [abierta, setAbierta] = useState(false)
  return (
    <details onToggle={(e) => setAbierta((e.currentTarget as HTMLDetailsElement).open)} style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
      <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center', fontWeight: 600 }}>
        {titulo ?? `¿Ya ha dicho que sí? Emitir uno de los ${props.precios.length} precios`}
      </summary>
      {abierta && <ListaPrecios {...props} />}
    </details>
  )
}
