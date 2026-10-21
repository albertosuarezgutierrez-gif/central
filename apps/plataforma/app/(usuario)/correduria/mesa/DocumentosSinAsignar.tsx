'use client'

import { useState } from 'react'
import { btnStyle, cardStyle } from '@/components/ui'
import { ROTULO_COMPANIA, type DocumentoSinAsignar, type LecturaDocumentosSinAsignar } from '@/lib/correduria/correos-compania'
import SelectorCliente, { type ClienteElegido } from './SelectorCliente'

const PAGINA = 50
const BTN: React.CSSProperties = { ...btnStyle('secundario', 'sm'), minHeight: 44 }
const fechaEs = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const tamano = (b: number | null): string => (b === null ? '' : b >= 1_000_000 ? `${(b / 1_000_000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1000))} KB`)

/**
 * «Documentos sin asignar» de la bandeja (F1 del agente de correo, 21/10/2026): PDF de correos de compañía cuyo aviso no
 * casó con ninguna ficha. Se guardaron igual (no se pierden) y aquí se asignan a mano: Alberto ELIGE el cliente (nunca
 * por el nombre del fichero). ≤50 + «Ver más»; asignar quita la fila en local sin recargar. Una lectura nueva de la
 * bandeja llega con otra `key` (la pone `CorreosCompania`), así que no hace falta sincronizarla con un efecto.
 */
export default function DocumentosSinAsignar({ lectura }: { lectura: LecturaDocumentosSinAsignar }) {
  const [filas, setFilas] = useState<DocumentoSinAsignar[]>(lectura.estado === 'ok' ? lectura.filas : [])
  const [limite, setLimite] = useState(PAGINA)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [cliente, setCliente] = useState<ClienteElegido | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  if (lectura.estado === 'sin_migracion') {
    return <p style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>Los adjuntos de correo aún no se guardan: falta aplicar su migración en la BD.</p>
  }
  if (lectura.estado === 'error') {
    return <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>No se han podido leer los documentos sin asignar ({lectura.motivo}). Eso no significa que no haya.</p>
  }

  async function asignar(id: string) {
    if (!cliente) return
    setEnviando(true)
    setFallo(null)
    try {
      const r = await fetch('/api/correduria/correos-compania', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'asignar_documento', id, clienteId: cliente.clienteId }),
      })
      const j = (await r.json().catch(() => null)) as { estado?: string; motivo?: string } | null
      if (r.status === 200 && j?.estado === 'ok') {
        setFilas((f) => f.filter((d) => d.id !== id))
        setAbierto(null)
        setCliente(null)
      } else setFallo(`No se ha asignado: ${j?.motivo ?? `respuesta ${r.status}`}. Sigue como estaba.`)
    } catch {
      setFallo('No se ha asignado (sin conexión). Sigue como estaba.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Documentos sin asignar · {filas.length}{lectura.truncado ? '+' : ''}</h3>
      {filas.length === 0
        ? <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Ninguno: todos los PDF de compañía llegados están en su ficha.</p>
        : <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>PDF de correos de compañía cuyo aviso no casó con ninguna ficha (últimos 90 días).</p>}
      {lectura.descartados > 0 && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>{lectura.descartados} no se ha podido leer y no aparece.</p>}
      {filas.slice(0, limite).map((d) => (
        <article key={d.id} style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, padding: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 14, minWidth: 0 }}>
            <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{d.nombre ?? 'adjunto.pdf'}</span>
            {d.compania && <span>{ROTULO_COMPANIA[d.compania] ?? d.compania}</span>}
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{fechaEs(d.creado)}{d.bytes !== null ? ` · ${tamano(d.bytes)}` : ''}</span>
          </div>
          {abierto === d.id ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
              {!cliente
                ? <SelectorCliente onSelect={setCliente} />
                : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 14, overflowWrap: 'anywhere' }}>Cliente: <strong>{cliente.nombre}</strong></span>
                    <button type="button" disabled={enviando} onClick={() => void asignar(d.id)} style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }}>
                      {enviando ? 'Asignando…' : 'Asignar a su ficha'}
                    </button>
                    <button type="button" disabled={enviando} onClick={() => setCliente(null)} style={BTN}>Cambiar</button>
                  </div>
                )}
              {fallo && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>{fallo}</p>}
              <div><button type="button" disabled={enviando} onClick={() => { setAbierto(null); setCliente(null); setFallo(null) }} style={BTN}>Cancelar</button></div>
            </div>
          ) : (
            <div><button type="button" onClick={() => { setAbierto(d.id); setCliente(null); setFallo(null) }} style={BTN}>Asignar a cliente</button></div>
          )}
        </article>
      ))}
      {filas.length > limite && (
        <div><button type="button" onClick={() => setLimite((l) => l + PAGINA)} style={BTN}>Ver más ({filas.length - limite})</button></div>
      )}
    </div>
  )
}
