'use client'
import { useState } from 'react'

import type { AnulacionEnRevision, AnulacionFirmada, AnulacionPendiente } from '@/lib/anulacion-firma'
import { avisarPendienteResuelto } from './PendienteDeTi'

/**
 * «Pendiente de tu firma» (ASegura OS, pieza 2-d-2): la carta de anulación que
 * el corredor ha preparado y que solo sale hacia la compañía con la firma del
 * tomador.
 *
 * Reglas:
 *  - La carta se enseña ENTERA antes de firmar: se firma lo que se ha leído.
 *  - La sesión del portal no basta: hace falta un código nuevo al correo.
 *  - El texto de consentimiento es el que devuelve asegura, el mismo que queda
 *    en la evidencia de la firma; aquí no se escribe una copia.
 *  - La vista de corredor lee pero no firma (el servidor también lo niega).
 *  - Un error al firmar NO se pinta como «firmada»: se dice que no se sabe.
 *  - Si ya hay un código vivo, la tarjeta abre en el campo del código: en el móvil, salir a leer el
 *    correo recarga la página, y volver al botón hacía pedir otro código que anulaba el leído.
 *  - Lo ya firmado no desaparece: sale abajo con su estado (firmada → enviada → confirmada).
 */
export function FirmarAnulacion({ anulaciones, firmadas, enRevision = [], consentimiento, corredor }: {
  anulaciones: AnulacionPendiente[]
  firmadas: AnulacionFirmada[]
  /** Bajas que pidió el cliente y revisamos: aún no se pueden firmar. */
  enRevision?: AnulacionEnRevision[]
  consentimiento: string
  corredor: boolean
}) {
  if (anulaciones.length === 0 && firmadas.length === 0 && enRevision.length === 0) return null
  return (
    <>
      {enRevision.length > 0 && (
        <section className="seccion" aria-labelledby="revision-titulo">
          <h2 id="revision-titulo">Baja que has pedido</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {enRevision.map((r) => <EnRevision key={r.id} r={r} />)}
          </div>
        </section>
      )}
      {anulaciones.length > 0 && (
        <section className="seccion" aria-labelledby="firma-titulo">
          <h2 id="firma-titulo">Pendiente de tu firma</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {anulaciones.map((a) => <Tarjeta key={a.id} a={a} consentimiento={consentimiento} corredor={corredor} />)}
          </div>
        </section>
      )}
      {firmadas.length > 0 && (
        <section className="seccion" aria-labelledby="firmadas-titulo">
          <h2 id="firmadas-titulo">Bajas que has firmado</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {firmadas.map((f) => <Firmada key={f.id} f={f} />)}
          </div>
        </section>
      )}
    </>
  )
}

function EnRevision({ r }: { r: AnulacionEnRevision }) {
  const poliza = [r.compania, r.numeroPoliza ? `nº ${r.numeroPoliza}` : null].filter(Boolean).join(' · ')
  const f = new Date(r.liberaSolaAt)
  const cuando = `${f.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' })} a las ${f.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' })}`
  return (
    <article className="vencimiento-tarjeta">
      <strong style={{ fontSize: 15, overflowWrap: 'anywhere' }}>Baja de tu póliza{poliza ? ` · ${poliza}` : ''}</strong>
      <p style={{ margin: 0, fontSize: 14 }}>
        La estamos revisando; podrás firmarla a partir del {cuando}. Te llamaremos antes, y si ya hemos hablado podrás firmarla en cuanto la liberemos.
      </p>
    </article>
  )
}

function Firmada({ f }: { f: AnulacionFirmada }) {
  const titulo = f.tipo === 'no_renovacion' ? 'No renovar tu póliza' : 'Baja de tu póliza'
  const poliza = [f.compania, f.numeroPoliza ? `nº ${f.numeroPoliza}` : null].filter(Boolean).join(' · ')
  const compania = f.compania ?? 'la compañía'
  const estado =
    f.estado === 'confirmada'
      ? `${compania} ha confirmado la baja${f.confirmadaEl ? ` (${fecha(f.confirmadaEl)})` : ''}.`
      : f.estado === 'comunicada'
        ? `Enviada a ${compania}${f.comunicadaEl ? ` el ${fecha(f.comunicadaEl)}` : ''}. Te avisamos cuando la confirme.`
        : `Nosotros se la comunicamos a ${compania} y te avisamos cuando la confirme.`
  return (
    <article className="vencimiento-tarjeta">
      <div style={{ display: 'grid', gap: 2 }}>
        <strong style={{ fontSize: 15, overflowWrap: 'anywhere' }}>✓ {titulo}{poliza ? ` · ${poliza}` : ''}</strong>
        <span className="suave" style={{ fontSize: 13 }}>Firmada el {fecha(f.firmadaEl)} · con efecto el {fecha(f.fechaEfecto)}</span>
      </div>
      <p style={{ margin: 0, fontSize: 14 }}>{estado}</p>
      {f.justificante && <p className="suave" style={{ margin: 0, fontSize: 13 }}>La carta firmada está en los documentos de esa póliza.</p>}
    </article>
  )
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })
}

function fecha(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

type Paso =
  | { paso: 'inicio' }
  /** `email: null` = el código se pidió antes de recargar: no sabemos a qué dirección enmascarada, solo hasta cuándo vale. */
  | { paso: 'codigo'; email: string | null; minutos: number; hasta?: string }
  | { paso: 'firmada'; firmadaEl: string }

function Tarjeta({ a, consentimiento, corredor }: { a: AnulacionPendiente; consentimiento: string; corredor: boolean }) {
  const [paso, setPaso] = useState<Paso>(() =>
    // Sin comparar con el reloj aquí: el servidor ya solo lo manda si estaba vivo, y comparar en el
    // render haría que servidor y navegador eligieran pasos distintos. Si caducó, «Firmar» lo dice.
    a.codigoCaducaEn
      ? { paso: 'codigo', email: null, minutos: 0, hasta: a.codigoCaducaEn }
      : { paso: 'inicio' },
  )
  const [codigo, setCodigo] = useState('')
  const [nombre, setNombre] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const titulo = a.tipo === 'no_renovacion' ? 'No renovar tu póliza' : 'Anular tu póliza'
  const poliza = [a.compania, a.numeroPoliza ? `nº ${a.numeroPoliza}` : null].filter(Boolean).join(' · ')

  async function enviar(cuerpo: Record<string, unknown>): Promise<{ status: number; j: Record<string, unknown> } | null> {
    try {
      const r = await fetch('/api/anulacion', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ anulacionId: a.id, ...cuerpo }),
      })
      return { status: r.status, j: ((await r.json().catch(() => null)) ?? {}) as Record<string, unknown> }
    } catch {
      return null
    }
  }

  async function pedirCodigo() {
    setOcupado(true)
    setAviso(null)
    const r = await enviar({ accion: 'codigo' })
    setOcupado(false)
    if (r?.j.estado === 'codigo_enviado' && typeof r.j.email === 'string') {
      setPaso({ paso: 'codigo', email: r.j.email, minutos: typeof r.j.minutos === 'number' ? r.j.minutos : 10 })
      setCodigo('')
      return
    }
    if (r?.j.estado === 'espera') {
      setAviso(`Acabamos de mandarte un código. Espera ${String(r.j.segundos ?? 60)} segundos para pedir otro.`)
      return
    }
    if (r?.j.estado === 'no_disponible' && typeof r.j.motivo === 'string') { setAviso(r.j.motivo); return }
    setAviso('No hemos podido mandarte el código. Inténtalo en unos minutos o llámanos.')
  }

  async function firmar() {
    setOcupado(true)
    setAviso(null)
    const r = await enviar({ accion: 'firmar', codigo, nombre, cartaHash: a.cartaHash })
    setOcupado(false)
    if (r?.j.estado === 'firmada' && typeof r.j.firmadaEl === 'string') { setPaso({ paso: 'firmada', firmadaEl: r.j.firmadaEl }); avisarPendienteResuelto('anulacion', a.id); return }
    if ((r?.j.estado === 'reintentar' || r?.j.estado === 'no_disponible') && typeof r.j.motivo === 'string') { setAviso(r.j.motivo); return }
    setAviso('No sabemos si la firma se ha guardado. Recarga la página antes de volver a intentarlo.')
  }

  if (paso.paso === 'firmada') {
    return (
      <article className="vencimiento-tarjeta">
        <strong style={{ fontSize: 15 }}>{titulo}{poliza ? ` · ${poliza}` : ''}</strong>
        <p style={{ margin: 0, fontSize: 14 }}>
          Firmada el {fecha(paso.firmadaEl)}. Nosotros se la comunicamos a la compañía y te avisamos cuando la confirme.
        </p>
      </article>
    )
  }

  return (
    <article className="vencimiento-tarjeta">
      <div style={{ display: 'grid', gap: 2 }}>
        <strong style={{ fontSize: 15 }}>{titulo}</strong>
        <span className="suave" style={{ fontSize: 13 }}>{poliza || 'Póliza'} · con efecto el {fecha(a.fechaEfecto)}</span>
      </div>

      {a.carta === null || a.cartaHash === null ? (
        <p className="suave" style={{ margin: 0, fontSize: 14 }}>
          A la carta le falta un dato de la póliza. Te llamamos para completarla antes de firmar.
        </p>
      ) : (
        <>
          <div
            style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.5, padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', overflowWrap: 'anywhere' }}
            aria-label="Carta que vas a firmar"
          >
            {a.carta}
          </div>

          {corredor ? (
            <p className="suave" style={{ margin: 0, fontSize: 14 }}>Vista de corredor: la firma la hace el cliente con un código a su correo.</p>
          ) : paso.paso === 'inicio' ? (
            <button type="button" className="boton" style={{ minHeight: 48 }} disabled={ocupado} onClick={pedirCodigo}>
              {ocupado ? 'Enviando…' : 'Mandarme un código para firmar'}
            </button>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              <p className="suave" style={{ margin: 0, fontSize: 14 }}>
                {paso.email
                  ? `Te hemos mandado un código a ${paso.email}. Caduca en ${paso.minutos} minutos.`
                  : `Ya te mandamos un código a tu correo. Vale hasta las ${paso.hasta ? hora(paso.hasta) : '—'}.`}
                {' '}Puedes ir al correo y volver: el código sigue valiendo aquí.
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
              {consentimiento && <p className="suave" style={{ margin: 0, fontSize: 13 }}>{consentimiento}</p>}
              <button
                type="button" className="boton" style={{ minHeight: 48 }}
                disabled={ocupado || codigo.length !== 6 || nombre.trim() === ''} onClick={firmar}
              >
                {ocupado ? 'Firmando…' : 'Firmar'}
              </button>
              <button type="button" className="boton-tenue" disabled={ocupado} onClick={pedirCodigo}>
                Mandarme otro código
              </button>
            </div>
          )}
        </>
      )}
      {aviso && <p className="error-linea" role="alert" style={{ margin: 0 }}>{aviso}</p>}
    </article>
  )
}
