'use client'
import { useCallback, useEffect, useState } from 'react'
import { etiquetaEstadoSiniestro, etiquetaTipoSiniestro } from '@central/module-seguros'
import { btnStyle } from '@/components/ui'
import { fechaEs } from '@/lib/ficha-asegura'
import {
  interpretarEscrituraParte,
  interpretarPartes,
  textoMotivoParte,
  type ParteSiniestro,
  type RespuestaEscrituraParte,
} from '@/lib/partes-asegura'

/**
 * Partes del portal de ESTE cliente que aún no están vinculados a un siniestro
 * (03/10/2026). Cada uno trae la SUGERENCIA de asegura (misma póliza, fecha ±3
 * días): `fuerte` = un único candidato; `ambiguo` = varios, decide Alberto. Aquí
 * solo se PROPONE: vincular es un botón que pulsa él. La reconciliación horaria
 * de asegura vincula sola los fuertes con un siniestro de CIMA.
 *
 * Tres estados: `null` = no se ha podido leer (se dice), `[]` = ninguno pendiente
 * (no se pinta el bloque), con datos = la lista.
 */
export type PrecargaDesdeParte = { parteId: string; polizaId: string | null; fechaHora: string | null; descripcion: string }

export default function PartesSinVincular({ clienteId, onRegistrar, onCambio, recarga }: {
  clienteId: string
  onRegistrar: (p: PrecargaDesdeParte) => void
  /** Tras vincular: la ficha se recarga para pintar el parte dentro de su siniestro. */
  onCambio: () => void
  /** Cambia cuando se ha abierto/vinculado algo fuera: vuelve a leer. */
  recarga: number
}) {
  const [partes, setPartes] = useState<ParteSiniestro[] | null | undefined>(undefined)
  const [motivo, setMotivo] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<{ tono: 'ok' | 'error'; texto: string } | null>(null)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/correduria/partes?clienteId=${encodeURIComponent(clienteId)}&limite=200`)
      const r = interpretarPartes(res.status, await res.json().catch(() => null))
      if (r.estado === 'ok') {
        setPartes(r.partes.filter((p) => p.siniestroId === null && (p.estado === 'enviado' || p.estado === 'recibido')))
        setMotivo(null)
      } else {
        setPartes(null)
        setMotivo(r.estado === 'error' ? textoMotivoParte(r.motivo) : r.estado)
      }
    } catch {
      setPartes(null)
      setMotivo(textoMotivoParte('red'))
    }
  }, [clienteId])

  useEffect(() => { void cargar() }, [cargar, recarga])

  async function vincular(parteId: string, siniestroId: string) {
    setOcupado(parteId)
    setMensaje(null)
    let r: RespuestaEscrituraParte
    try {
      const res = await fetch('/api/correduria/partes', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: parteId, accion: 'vincular', siniestroId }),
      })
      r = interpretarEscrituraParte(res.status, await res.json().catch(() => null))
    } catch {
      r = { estado: 'error', motivo: 'red' }
    } finally {
      setOcupado(null)
    }
    if (r.estado === 'ok') {
      setMensaje({ tono: 'ok', texto: 'Parte vinculado. Sale dentro del siniestro, con su historial.' })
      void cargar()
      onCambio()
    } else {
      const m = 'motivo' in r ? textoMotivoParte(r.motivo) : r.estado === 'no_encontrado' ? 'el parte o el siniestro ya no existen.' : 'el puerto con asegura no está conectado.'
      setMensaje({ tono: 'error', texto: `No se ha vinculado: ${m}` })
    }
  }

  if (partes === undefined) return null
  if (partes === null) {
    return (
      <p style={{ ...caja, borderStyle: 'dashed', margin: '0 0 10px' }}>
        ⚠️ No se han podido leer los partes del portal de este cliente ({motivo ?? 'sin motivo'}). No lo leas como «no hay partes».
      </p>
    )
  }
  if (partes.length === 0) return null

  return (
    <div style={{ ...caja, margin: '0 0 10px' }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
        📨 Partes del portal sin vincular a un siniestro · {partes.length}
      </div>
      {mensaje && <div role="status" style={{ fontSize: 13, marginBottom: 6, color: mensaje.tono === 'ok' ? 'var(--positive)' : 'var(--negative)' }}>{mensaje.texto}</div>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
        {partes.map((p) => {
          const s = p.sugerencia
          return (
            <li key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, fontSize: 13 }}>
              <div style={{ fontWeight: 600 }}>
                {p.fechaHecho ? fechaEs(p.fechaHecho) : 'sin fecha'}{p.horaAproximada ? ` · ${p.horaAproximada} aprox.` : ''}
                {p.tipoSiniestro ? ` · ${p.tipoSiniestro}` : ''}
                <span style={{ fontWeight: 400, color: 'var(--muted)' }}> · {p.estado === 'enviado' ? 'sin mirar' : 'recibido'}</span>
              </div>
              <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '4px 0' }}>
                {p.descripcion ? (p.descripcion.length > 280 ? `${p.descripcion.slice(0, 280)}…` : p.descripcion) : <span style={{ color: 'var(--muted)' }}>sin descripción legible</span>}
              </div>
              {s === null ? (
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {p.polizaId === null ? 'Va sobre una póliza que no es de la cartera: no hay siniestro con el que compararlo.' : 'Sin sugerencia (no se pudo calcular).'}
                </div>
              ) : s.candidatos.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>Ningún siniestro de esa póliza a ±3 días. Si la compañía ya lo abrió, regístralo.</div>
              ) : (
                <div style={{ fontSize: 12 }}>
                  <div style={{ color: 'var(--muted)', marginBottom: 4 }}>
                    {s.tipo === 'fuerte' ? 'Coincide con un siniestro (misma póliza, fecha cercana):' : `Podría ser uno de estos ${s.candidatos.length} (no se elige solo):`}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {s.candidatos.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        disabled={ocupado !== null}
                        onClick={() => void vincular(p.id, c.id)}
                        style={{ ...btnStyle(s.tipo === 'fuerte' ? 'primario' : 'secundario', 'sm'), minHeight: 44 }}
                        title="Vincular este parte a ese siniestro"
                      >
                        🔗 {c.fecha ? fechaEs(c.fecha) : 'sin fecha'} · {etiquetaTipoSiniestro(c.tipo)} · {c.origen === 'cima' ? 'CIMA' : 'alta manual'}
                        {c.referencia ? ` · nº ${c.referencia}` : ''} · {etiquetaEstadoSiniestro(c.estado).toLowerCase()}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  disabled={ocupado !== null}
                  onClick={() => onRegistrar({
                    parteId: p.id,
                    polizaId: p.polizaId,
                    fechaHora: p.fechaHecho ? `${p.fechaHecho}T${p.horaAproximada ?? '12:00'}` : null,
                    descripcion: p.descripcion ?? '',
                  })}
                  style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}
                >
                  ➕ Registrar siniestro desde este parte
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const caja: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 10, padding: 10, fontSize: 13 }
