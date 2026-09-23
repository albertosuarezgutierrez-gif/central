'use client'
import { useState } from 'react'
import { eur } from '@/lib/dinero'

/**
 * Aceptar una opción del presupuesto (pieza 4-d).
 *
 * Reglas:
 *  - El documento se enseña ENTERO antes de firmar: se firma lo que se ha leído.
 *  - La sesión del portal no basta: hace falta un código nuevo al correo.
 *  - El texto de consentimiento es el que devuelve asegura, el mismo que queda
 *    en la evidencia de la firma; aquí no se escribe una copia.
 *  - La vista de corredor lee pero no firma (el servidor también lo niega).
 *  - Un error al firmar NO se pinta como «aceptada»: se dice que no se sabe.
 */
type PasoRev = { paso: 'revisar'; consentimiento: string; documento: string; documentoHash: string; anulacion: { compania: string; numeroPoliza: string; fechaEfecto: string; carta: string; advertencia: string | null } | null; sinAnulacion: string | null }
type PasoCodigo = { paso: 'codigo'; email: string; minutos: number; consentimiento: string; documentoHash: string }

export function AceptarOpcion({ presupuestoId, opcionId, prima, compania, corredor }: {
  presupuestoId: string
  opcionId: string
  prima: number | null
  compania: string
  corredor: boolean
}) {
  const [paso, setPaso] = useState<{ paso: 'inicio' } | PasoRev | PasoCodigo | { paso: 'aceptada'; aceptadoEl: string }>({ paso: 'inicio' })
  const [codigo, setCodigo] = useState('')
  const [nombre, setNombre] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  async function enviar(cuerpo: Record<string, unknown>): Promise<{ status: number; j: Record<string, unknown> } | null> {
    try {
      const r = await fetch('/api/presupuesto/firma', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ presupuestoId, opcionId, ...cuerpo }),
      })
      return { status: r.status, j: ((await r.json().catch(() => null)) ?? {}) as Record<string, unknown> }
    } catch {
      return null
    }
  }

  async function elegir() {
    setOcupado(true)
    setAviso(null)
    const r = await enviar({ accion: 'preparar' })
    setOcupado(false)

    if (r?.status === 200 && r.j.estado === 'ok' && typeof r.j.documento === 'string') {
      setPaso({
        paso: 'revisar',
        consentimiento: typeof r.j.consentimiento === 'string' ? r.j.consentimiento : '',
        documento: r.j.documento,
        documentoHash: typeof r.j.documentoHash === 'string' ? r.j.documentoHash : '',
        anulacion: (typeof r.j.anulacion === 'object' && r.j.anulacion !== null) ? {
          compania: typeof (r.j.anulacion as Record<string, unknown>).compania === 'string' ? (r.j.anulacion as Record<string, unknown>).compania as string : '',
          numeroPoliza: typeof (r.j.anulacion as Record<string, unknown>).numeroPoliza === 'string' ? (r.j.anulacion as Record<string, unknown>).numeroPoliza as string : '',
          fechaEfecto: typeof (r.j.anulacion as Record<string, unknown>).fechaEfecto === 'string' ? (r.j.anulacion as Record<string, unknown>).fechaEfecto as string : '',
          carta: typeof (r.j.anulacion as Record<string, unknown>).carta === 'string' ? (r.j.anulacion as Record<string, unknown>).carta as string : '',
          advertencia: (typeof (r.j.anulacion as Record<string, unknown>).advertencia === 'string') ? (r.j.anulacion as Record<string, unknown>).advertencia as string : null,
        } : null,
        sinAnulacion: typeof r.j.sinAnulacion === 'string' ? r.j.sinAnulacion : null,
      })
      return
    }
    if (r?.j.estado === 'no_disponible' && typeof r.j.motivo === 'string') {
      setAviso(r.j.motivo)
      return
    }
    setAviso('No hemos podido preparar la aceptación. Inténtalo en unos minutos o llámanos.')
  }

  async function pedirCodigo() {
    if (paso.paso !== 'revisar') return
    setOcupado(true)
    setAviso(null)
    const r = await enviar({ accion: 'codigo' })
    setOcupado(false)

    if (r?.j.estado === 'codigo_enviado' && typeof r.j.email === 'string') {
      setPaso({ paso: 'codigo', email: r.j.email, minutos: typeof r.j.minutos === 'number' ? r.j.minutos : 10, consentimiento: paso.consentimiento, documentoHash: paso.documentoHash })
      setCodigo('')
      return
    }
    if (r?.j.estado === 'espera') {
      setAviso(`Acabamos de mandarte un código. Espera ${String(r.j.segundos ?? 60)} segundos para pedir otro.`)
      return
    }
    if (r?.j.estado === 'no_disponible' && typeof r.j.motivo === 'string') {
      setAviso(r.j.motivo)
      return
    }
    setAviso('No hemos podido mandarte el código. Inténtalo en unos minutos o llámanos.')
  }

  async function firmar() {
    if (paso.paso !== 'codigo') return
    setOcupado(true)
    setAviso(null)
    const r = await enviar({ accion: 'firmar', codigo, nombre, documentoHash: paso.documentoHash })
    setOcupado(false)

    if (r?.j.estado === 'aceptado' && typeof r.j.aceptadoEl === 'string') {
      setPaso({ paso: 'aceptada', aceptadoEl: r.j.aceptadoEl })
      return
    }
    if ((r?.j.estado === 'reintentar' || r?.j.estado === 'no_disponible') && typeof r.j.motivo === 'string') {
      setAviso(r.j.motivo)
      return
    }
    setAviso('No sabemos si la aceptación se ha guardado. Recarga la página antes de volver a intentarlo.')
  }

  function fecha(iso: string): string {
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  }

  if (paso.paso === 'aceptada') {
    return (
      <article className="vencimiento-tarjeta">
        <strong style={{ fontSize: 15 }}>Has aceptado esta opción</strong>
        <p style={{ margin: 0, fontSize: 14 }}>
          Aceptada el {fecha(paso.aceptadoEl)}. Tu corredor tramita la emisión con la compañía; no tienes
          cobertura nueva hasta que te confirmemos que está emitida.
        </p>
      </article>
    )
  }

  const puedeAceptar = prima !== null

  return (
    <article className="vencimiento-tarjeta">
      <div style={{ display: 'grid', gap: 2 }}>
        <strong style={{ fontSize: 15 }}>Elegir esta opción</strong>
        <span className="suave" style={{ fontSize: 13 }}>{compania} · {puedeAceptar ? eur(prima) : '—'}</span>
      </div>

      {!puedeAceptar ? (
        <p className="suave" style={{ margin: 0, fontSize: 14 }}>
          Esta opción no tiene precio. Escríbeme para revisarla.
        </p>
      ) : (
        <>
          {paso.paso === 'inicio' ? (
            <button type="button" className="boton" style={{ minHeight: 48 }} disabled={ocupado} onClick={elegir}>
              {ocupado ? 'Cargando…' : 'Elegir esta opción'}
            </button>
          ) : paso.paso === 'revisar' ? (
            <>
              <div
                style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.5, padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', overflowWrap: 'anywhere' }}
                aria-label="Documento que vas a firmar"
              >
                {paso.documento}
              </div>

              {paso.anulacion && (
                <div style={{ marginTop: 12, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                  <strong style={{ fontSize: 14 }}>También firmas la anulación de tu póliza</strong>
                  <p style={{ fontSize: 13, margin: '6px 0 0' }}>
                    {paso.anulacion.compania} (nº {paso.anulacion.numeroPoliza}) · con efecto el {fecha(paso.anulacion.fechaEfecto)}
                  </p>
                  <p style={{ whiteSpace: 'pre-wrap', fontSize: 13, margin: '6px 0 0', lineHeight: 1.4, overflowWrap: 'anywhere' }}>
                    No se enviará a {paso.anulacion.compania} hasta que la nueva póliza esté emitida.
                  </p>
                  {paso.anulacion.carta && (
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: '8px 0 0', padding: 8, background: 'var(--background)', borderRadius: 4, lineHeight: 1.4, overflowWrap: 'anywhere' }}>
                      {paso.anulacion.carta}
                    </div>
                  )}
                  {paso.anulacion.advertencia && (
                    <p style={{ fontSize: 12, margin: '6px 0 0', color: 'var(--alarma)', fontWeight: 500 }}>
                      {paso.anulacion.advertencia}
                    </p>
                  )}
                </div>
              )}

              {paso.sinAnulacion && (
                <div style={{ marginTop: 12, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                  <p style={{ margin: 0, fontSize: 13 }}>{paso.sinAnulacion}</p>
                </div>
              )}

              {corredor ? (
                <p className="suave" style={{ margin: 0, fontSize: 14 }}>Vista de corredor: la firma la hace el cliente con un código a su correo.</p>
              ) : (
                <button type="button" className="boton" style={{ minHeight: 48 }} disabled={ocupado} onClick={pedirCodigo}>
                  {ocupado ? 'Enviando…' : 'Mandarme un código para firmar'}
                </button>
              )}
            </>
          ) : paso.paso === 'codigo' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <p className="suave" style={{ margin: 0, fontSize: 14 }}>
                Te hemos mandado un código a {paso.email}. Caduca en {paso.minutos} minutos.
              </p>
              <label style={{ display: 'grid', gap: 4, fontSize: 14 }}>
                Código
                <input
                  className="campo" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                  value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 14 }}>
                Tu nombre y apellidos
                <input className="campo" autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </label>
              {paso.consentimiento && <p className="suave" style={{ margin: 0, fontSize: 13 }}>{paso.consentimiento}</p>}
              <button
                type="button" className="boton" style={{ minHeight: 48 }}
                disabled={ocupado || codigo.length !== 6 || nombre.trim() === ''} onClick={firmar}
              >
                {ocupado ? 'Firmando…' : 'Firmar y aceptar'}
              </button>
              <button type="button" className="boton-tenue" disabled={ocupado} onClick={pedirCodigo}>
                Mandarme otro código
              </button>
            </div>
          ) : null}
        </>
      )}

      {aviso && <p className="error-linea" role="alert" style={{ margin: 0 }}>{aviso}</p>}
    </article>
  )
}
