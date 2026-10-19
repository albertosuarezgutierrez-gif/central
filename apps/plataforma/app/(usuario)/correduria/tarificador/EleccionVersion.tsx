'use client'

// Elegir la versión del vehículo (o la fila de catastro) en la bandeja (19/10/2026). El bot paró (`requiere_humano`) porque
// no puede adivinar cuál; la lista exacta viene de asegura (`opcionesVersion`, puede pasar de 20). Se filtra con un buscador
// pero el valor SIEMPRE es una opción de la lista (sin texto libre). Un solo clic; reintentar solo vuelve a pedir el precio.

import { useMemo, useRef, useState } from 'react'
import { btnStyle } from '@/components/ui'
import { BANDEJA_PAGINA, cuerpoEleccionVersion, filtrarOpcionesVersion } from '@/lib/tarificador-bandeja'
import type { CandidatoVersion } from '@central/module-tarificacion'

export default function EleccionVersion({ trabajoId, opciones, deshabilitado, alTerminar }: {
  trabajoId: string
  opciones: CandidatoVersion[]
  deshabilitado: boolean
  alTerminar: (aviso: string) => void | Promise<void>
}) {
  const [texto, setTexto] = useState('')
  const [indice, setIndice] = useState('')
  const [maximo, setMaximo] = useState(BANDEJA_PAGINA)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const enCurso = useRef(false)
  const elegida = cuerpoEleccionVersion(opciones, indice)
  const coincidentes = useMemo(() => filtrarOpcionesVersion(opciones, texto), [opciones, texto])
  // La elegida sigue visible aunque el filtro cambie o caiga fuera del tramo mostrado.
  const visibles = coincidentes.slice(0, maximo)
  if (indice !== '' && !visibles.includes(Number(indice)) && elegida) visibles.unshift(Number(indice))
  const inactivo = enviando || deshabilitado

  async function reintentar() {
    if (elegida === null || enCurso.current) return
    enCurso.current = true
    setEnviando(true); setError(null)
    try {
      const res = await fetch(`/api/correduria/tarificador/bandeja/${encodeURIComponent(trabajoId)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'reintentar', eleccionVersion: elegida }),
      })
      if (res.status === 200 || res.status === 202) {
        await alTerminar('Vuelve a la cola con la versión elegida: el bot lo intentará de nuevo.')
        return
      }
      const j = (await res.json().catch(() => null)) as { motivo?: string; mensaje?: string } | null
      const causa = j?.motivo ?? j?.mensaje
      setError(`No se pudo reintentar con esa versión (HTTP ${res.status})${causa ? `: ${causa}` : ''}.`)
    } catch {
      setError('No se pudo reintentar con esa versión (sin respuesta de red).')
    } finally {
      enCurso.current = false
      setEnviando(false)
    }
  }

  const campo = { minHeight: 44, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', padding: '0 8px', minWidth: 0, maxWidth: '100%' } as const
  return (
    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)', minWidth: 0 }}>
      {opciones.length > 8 && (
        <input type="search" aria-label="Buscar versión" placeholder={`Buscar entre ${opciones.length} versiones…`} value={texto}
          onChange={(e) => { setTexto(e.target.value); setMaximo(BANDEJA_PAGINA) }} disabled={inactivo} style={campo} />
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select aria-label="Versión del vehículo" value={indice} onChange={(e) => setIndice(e.target.value)} disabled={inactivo}
          style={{ ...campo, flex: '1 1 220px' }}>
          <option value="">{coincidentes.length === 0 ? 'Ninguna coincide con la búsqueda' : 'Elige la versión…'}</option>
          {visibles.map((i) => <option key={i} value={String(i)}>{opciones[i].etiqueta}</option>)}
        </select>
        <button type="button" onClick={() => void reintentar()} disabled={inactivo || elegida === null}
          style={{ ...btnStyle('primario'), minHeight: 44, opacity: inactivo || elegida === null ? 0.6 : 1 }}>
          {enviando ? 'Un momento…' : 'Reintentar con esta versión'}
        </button>
      </div>
      {coincidentes.length > maximo && (
        <button type="button" onClick={() => setMaximo((m) => m + BANDEJA_PAGINA)} disabled={inactivo} style={{ ...btnStyle('sutil'), minHeight: 44, justifySelf: 'start' }}>
          Ver más ({coincidentes.length - maximo} sin mostrar)
        </button>
      )}
      {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--negative)', overflowWrap: 'anywhere' }}>{error}</p>}
    </div>
  )
}
