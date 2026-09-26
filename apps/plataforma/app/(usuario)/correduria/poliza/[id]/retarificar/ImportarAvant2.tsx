'use client'
// Traer a la intranet un proyecto hecho a mano en la web de Avant2 y emitirlo desde
// aquí (fila 13, 26/09/2026). Tres pasos: número del proyecto → precios que la
// compañía ya deja emitir → el panel de emisión de siempre (`Emision`).
//
// Nada de esto gasta: la vista previa es una lectura y el enlace no llama a ReRate.
// El único paso con coste y contrato es «Emitir» dentro de `Emision`, con sus guardas.
import { useState, type ComponentProps } from 'react'
import { eur } from '@/lib/dinero'
import { fechaEs } from '@/lib/ficha-asegura'
import type { OfertaImportable, VistaImportacion } from '@/lib/retarificar-asegura'
import { pedirImportacion, pedirVistaImportacion } from './acciones'
import { Emision } from './emision'

type Importada = {
  compania: string
  categoria: string
  primaEur: number | null
  oferta: NonNullable<ComponentProps<typeof Emision>['ofertaImportada']>
}

const boton = { minHeight: 44, padding: '0 16px', fontWeight: 600 } as const

export default function ImportarAvant2({ polizaId }: { polizaId: string }) {
  const [projectId, setProjectId] = useState('')
  const [vista, setVista] = useState<VistaImportacion | null>(null)
  const [cargando, setCargando] = useState(false)
  const [enlazando, setEnlazando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importada, setImportada] = useState<Importada | null>(null)

  async function buscar() {
    const id = projectId.trim()
    if (!/^\d{1,12}$/.test(id)) {
      setError('El número del proyecto son solo cifras (lo ves en la URL de Avant2: /production/NÚMERO/…).')
      return
    }
    setError(null)
    setCargando(true)
    setVista(await pedirVistaImportacion(id, polizaId))
    setCargando(false)
  }

  async function enlazar(o: OfertaImportable) {
    if (vista?.estado !== 'ok') return
    setError(null)
    setEnlazando(o.quoteId)
    const r = await pedirImportacion({ projectId: vista.projectId, polizaId, quoteId: o.quoteId })
    setEnlazando(null)
    if (r.estado !== 'ok') {
      setError(r.mensaje)
      return
    }
    if (!('compania' in r)) {
      setError('asegura respondió sin la compañía del precio: no se puede seguir.')
      return
    }
    setImportada({
      compania: r.compania,
      categoria: r.categoria,
      primaEur: r.primaEur,
      oferta: {
        offerId: r.offerId,
        primaEur: r.primaEur,
        firmeza: r.firmeza,
        caducaEn: r.caducaEn,
        avisos: r.avisos,
        projectId: r.projectId,
        cuenta: r.cuenta,
        cuentaAviso: r.cuentaAviso,
        quoteCrudo: r.quoteCrudo,
      },
    })
  }

  if (importada) {
    return (
      <Emision
        compania={importada.compania}
        categoria={importada.categoria}
        primaEur={importada.primaEur}
        ofertaImportada={importada.oferta}
        onCerrar={() => setImportada(null)}
      />
    )
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Traer un proyecto hecho en Avant2</h2>
      <p className="muted">
        Para emitir desde aquí un precio que ya tarificaste y confirmaste en la web de Avant2. No gasta nada:
        solo lee el proyecto y lo enlaza a esta póliza.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
        <label style={{ flex: '1 1 200px' }}>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>Número del proyecto</span>
          <input
            inputMode="numeric"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="40000001"
            style={{ minHeight: 44, width: '100%', maxWidth: 260 }}
          />
        </label>
        <button type="button" onClick={buscar} disabled={cargando} style={boton}>
          {cargando ? 'Leyendo…' : 'Ver precios'}
        </button>
      </div>

      {error && <p className="err" style={{ marginTop: 12 }}>{error}</p>}
      {vista && vista.estado !== 'ok' && <p className="err" style={{ marginTop: 12 }}>{vista.mensaje}</p>}

      {vista?.estado === 'ok' && (
        <div style={{ marginTop: 16 }}>
          {vista.bloqueos.length > 0 && (
            <div className="err" style={{ marginBottom: 12 }}>
              <strong>No se puede enlazar:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {vista.bloqueos.map((b) => <li key={b}>{b}</li>)}
              </ul>
            </div>
          )}
          {vista.tomador === 'coincide' && <p className="muted">✓ El tomador del proyecto es el cliente de esta póliza (por DNI).</p>}
          {vista.vehiculo === 'coincide' && <p className="muted">✓ Es el mismo vehículo que el de esta póliza (por matrícula).</p>}

          {vista.ofertas.length === 0 ? (
            <p>
              Ningún precio de este proyecto se puede emitir todavía. Confírmalo en Avant2 (preemisión) y vuelve a
              leerlo.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
              {vista.ofertas.map((o) => (
                <li key={o.quoteId} className="card" style={{ margin: 0 }}>
                  <div style={{ fontWeight: 600 }}>
                    {o.compania ?? '—'} · {o.categoria ?? o.modalidad ?? '—'}
                  </div>
                  <div className="muted" style={{ fontSize: 14 }}>
                    {o.pago ?? 'Pago —'} · prima {o.primaEur !== null ? eur(o.primaEur) : '—'}
                    {o.primerReciboEur !== null && o.primerReciboEur !== o.primaEur && <> · primer recibo {eur(o.primerReciboEur)}</>}
                    {o.efecto && <> · efecto {fechaEs(o.efecto)}</>}
                    {o.caduca && <> · caduca {fechaEs(o.caduca)}</>}
                  </div>
                  <button
                    type="button"
                    onClick={() => enlazar(o)}
                    disabled={vista.bloqueos.length > 0 || enlazando !== null}
                    style={{ ...boton, marginTop: 8 }}
                  >
                    {enlazando === o.quoteId ? 'Enlazando…' : 'Usar este precio'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {vista.otras > 0 && (
            <p className="muted" style={{ fontSize: 13 }}>
              {vista.otras} precio(s) más del proyecto no se pueden emitir desde aquí (sin confirmar en Avant2 o
              caducados).
            </p>
          )}
        </div>
      )}
    </div>
  )
}
