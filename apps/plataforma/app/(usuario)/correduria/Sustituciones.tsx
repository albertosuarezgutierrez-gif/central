'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Clock, RefreshCw, TriangleAlert } from 'lucide-react'
import { MOTIVOS_PUERTO, type Sustituciones as RespSustituciones, type SustitucionPendiente } from '@/lib/correduria-puerto'
import { ConIcono } from './iconos'
import Bloque from './Bloque'
import { btnStyle } from '@/components/ui'

/**
 * 🔁 Seguimiento de cambios de compañía: pólizas que se retarificaron y se
 * emitieron de verdad con otra compañía, esperando a que CIMA confirme que
 * el cliente la está pagando. Alberto, 20/09/2026: «se marcan sustituida, y
 * hay que hacerle seguimiento a que el cliente la pague — eso lo confirma
 * CIMA». Esta lista es ESE seguimiento, para que no dependa de acordarse de
 * abrir la ficha de cada cliente que cambió de compañía.
 *
 * 🚨 «Sustituida» NO es «cancelada»: la vieja sigue como viva de cara a CIMA
 * hasta que la compañía la dé de baja por su cauce; esto no lo decide esta
 * pantalla. Lo único que se comprueba aquí es si la NUEVA ya está confirmada.
 */
export default function Sustituciones({
  onContador,
  primero,
}: {
  /** `null` = no se ha podido leer, JAMÁS 0. */
  onContador?: (n: number | null) => void
  primero?: boolean
}) {
  const [datos, setDatos] = useState<RespSustituciones | null>(null)

  const avisar = useRef(onContador)
  avisar.current = onContador

  // Recarga SIN desmontar (tras sellar una anulación confirmada): la lista se sustituye, el bloque se queda.
  const cargar = useCallback(() => {
    fetch('/api/correduria/sustituciones', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: RespSustituciones) => {
        setDatos(d)
        avisar.current?.(d.estado === 'ok' ? d.filas.length : null)
      })
      .catch(() => {
        setDatos({ estado: 'error', motivo: 'red' })
        avisar.current?.(null)
      })
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Como el resto de colas de «Hoy»: sin respuesta todavía o sin trabajo, no ocupa sitio.
  if (datos === null) return null

  if (datos.estado === 'sin_configurar') {
    return (
      <Bloque titulo="Seguimiento de sustituciones" Icono={RefreshCw} primero={primero}>
        <p style={pMuted}>
          <ConIcono i={Clock}>El puerto con asegura no está conectado. No lo leas como «no hay ninguna pendiente»: es
          que desde aquí no se puede mirar.</ConIcono>
        </p>
      </Bloque>
    )
  }

  if (datos.estado === 'error') {
    return (
      <Bloque titulo="Seguimiento de sustituciones" Icono={RefreshCw} tono="malo" primero={primero}>
        <p style={{ ...pMuted, color: 'var(--negative)' }}>
          <ConIcono i={TriangleAlert}>No se ha podido leer: {MOTIVOS_PUERTO[datos.motivo]} No significa que no haya ninguna.</ConIcono>
        </p>
      </Bloque>
    )
  }

  const { filas } = datos
  // Leída y vacía: nada que hacer hoy. Un error SÍ se pinta (arriba), nunca se calla.
  if (filas.length === 0) return null

  return (
    <Bloque
      titulo={`Sustituidas pendientes de confirmar · ${filas.length}`}
      sub="Pólizas retarificadas y emitidas en otra compañía, a la espera de que CIMA confirme que el cliente la paga."
      Icono={RefreshCw}
      tono="aviso"
      destacado
      primero={primero}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
        {filas.map((f) => (
          <Fila key={f.polizaVieja.id} f={f} onSellada={cargar} />
        ))}
      </div>
    </Bloque>
  )
}

function Fila({ f, onSellada }: { f: SustitucionPendiente; onSellada: () => void }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderLeft: '4px solid var(--warning)', borderRadius: 8, padding: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <Link href={`/correduria/cliente/${f.clienteId}`} style={{ fontWeight: 700, fontSize: 15 }}>
          {f.cliente}
        </Link>
        <span style={{ fontSize: 12, color: 'var(--warning)' }}>
          {f.diasSustituida === 1 ? 'hace 1 día' : `hace ${f.diasSustituida} días`}
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
        De <Link href={`/correduria/poliza/${f.polizaVieja.id}`}>{f.polizaVieja.aseguradora}{f.polizaVieja.numeroPoliza ? ` nº ${f.polizaVieja.numeroPoliza}` : ''}</Link>
        {' → '}
        {f.polizaNueva ? (
          <Link href={`/correduria/poliza/${f.polizaNueva.id}`}>{f.polizaNueva.aseguradora}{f.polizaNueva.numeroPoliza ? ` nº ${f.polizaNueva.numeroPoliza}` : ''}</Link>
        ) : (
          <span title="El puerto no informó la póliza nueva en esta fila">?</span>
        )}
      </div>
      {f.viejaPendienteAnular === true && (
        <>
          <div style={{ fontSize: 12, color: 'var(--negative)', marginTop: 6 }}>
            <ConIcono i={TriangleAlert}>
              {f.viejaAviso === 'no_renovacion'
                ? `Confirma en ${f.polizaVieja.aseguradora} que la vieja no renueva${f.viejaVence ? ` (vence ${f.viejaVence.slice(8, 10)}/${f.viejaVence.slice(5, 7)}/${f.viejaVence.slice(0, 4)})` : ''}: si nadie comunicó la baja, renueva sola.`
                : `La vieja sigue en vigor en CIMA: posible doble seguro. Confirma su anulación en ${f.polizaVieja.aseguradora}.`}
            </ConIcono>
          </div>
          <AnulacionConfirmada polizaViejaId={f.polizaVieja.id} compania={f.polizaVieja.aseguradora} onSellada={onSellada} />
        </>
      )}
      {f.viejaCierre === 'anulacion_confirmada' && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>✅ Anulación de la vieja confirmada por la compañía (CIMA aún no la refleja).</div>
      )}
    </div>
  )
}

/**
 * «Anulación confirmada por la compañía» (17/10/2026): la compañía confirmó la baja de la vieja por su cauce
 * (correo, intranet) antes que CIMA. Se sella con el MOTIVO (obligatorio: de dónde sale) y, si se sabe, la fecha
 * de efecto. No cambia el estado de la póliza: lo confirmará CIMA. Solo saca la fila del aviso de doble seguro.
 */
function AnulacionConfirmada({ polizaViejaId, compania, onSellada }: { polizaViejaId: string; compania: string; onSellada: () => void }) {
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [efecto, setEfecto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sellar() {
    if (motivo.trim().length < 10) {
      setError('Di de dónde sale la confirmación (p. ej. «correo del 30/09, anulación con efecto 01/11/2026»).')
      return
    }
    setEnviando(true)
    setError(null)
    try {
      const r = await fetch('/api/correduria/sustituciones', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ polizaViejaId, motivo: motivo.trim(), fechaEfectoBaja: efecto || null }),
      })
      const j = (await r.json().catch(() => null)) as { estado?: string; motivo?: string } | null
      if (j?.estado === 'ok') {
        setAbierto(false)
        onSellada()
      } else if (j?.estado === 'sin_configurar') {
        setError('No está configurado el enlace con la cartera: no se ha sellado nada.')
      } else if (j?.estado === 'sin_respuesta' || r.status >= 500) {
        setError(`${j?.motivo ?? `HTTP ${r.status}`}: no sé si se ha sellado. Recarga antes de repetir.`)
      } else {
        setError(j?.motivo ?? `No se ha podido (HTTP ${r.status}).`)
      }
    } catch {
      setError('No se ha podido llegar al servidor: no sé si se ha sellado. Recarga antes de repetir.')
    } finally {
      setEnviando(false)
    }
  }

  if (!abierto) {
    return (
      <div style={{ marginTop: 8 }}>
        <button type="button" onClick={() => setAbierto(true)} style={{ ...btnStyle('secundario'), minHeight: 44, maxWidth: '100%', whiteSpace: 'normal', textAlign: 'center' }}>
          ✓ Anulación confirmada por la compañía
        </button>
      </div>
    )
  }
  return (
    <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, maxWidth: 420 }}>
      <label style={{ fontSize: 12 }}>
        Motivo (obligatorio): ¿cómo lo ha confirmado {compania}?
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder={`p. ej. ${compania} confirma por correo 30/09 anulación con efecto 01/11/2026`}
          style={{ display: 'block', width: '100%', boxSizing: 'border-box', minHeight: 66, fontSize: 14 }}
        />
      </label>
      <label style={{ fontSize: 12 }}>
        Fecha de efecto de la baja (opcional)
        <input type="date" value={efecto} onChange={(e) => setEfecto(e.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', minHeight: 44 }} />
      </label>
      <p style={pMuted}>No cambia el estado de la póliza (lo confirmará CIMA): solo deja de avisarse como posible doble seguro.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={sellar} disabled={enviando} style={{ ...btnStyle('primario'), minHeight: 44 }}>{enviando ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" onClick={() => setAbierto(false)} disabled={enviando} style={{ ...btnStyle('secundario'), minHeight: 44 }}>Cancelar</button>
      </div>
      {error && <div role="alert" style={{ color: 'var(--negative)', fontSize: 12 }}>{error}</div>}
    </div>
  )
}

const pMuted: React.CSSProperties = { fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, margin: 0 }
