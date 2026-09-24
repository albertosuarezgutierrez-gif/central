'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { MOTIVOS_PUERTO, type Sustituciones as RespSustituciones, type SustitucionPendiente } from '@/lib/correduria-puerto'
import Bloque from './Bloque'

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

  useEffect(() => {
    fetch('/api/correduria/sustituciones')
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

  // Como el resto de colas de «Hoy»: sin respuesta todavía o sin trabajo, no ocupa sitio.
  if (datos === null) return null

  if (datos.estado === 'sin_configurar') {
    return (
      <Bloque titulo="Seguimiento de sustituciones" Icono={RefreshCw} primero={primero}>
        <p style={pMuted}>
          ⏳ El puerto con asegura no está conectado. No lo leas como «no hay ninguna pendiente»: es
          que desde aquí no se puede mirar.
        </p>
      </Bloque>
    )
  }

  if (datos.estado === 'error') {
    return (
      <Bloque titulo="Seguimiento de sustituciones" Icono={RefreshCw} tono="malo" primero={primero}>
        <p style={{ ...pMuted, color: 'var(--negative)' }}>
          ⚠️ No se ha podido leer: {MOTIVOS_PUERTO[datos.motivo]} No significa que no haya ninguna.
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
          <Fila key={f.polizaVieja.id} f={f} />
        ))}
      </div>
    </Bloque>
  )
}

function Fila({ f }: { f: SustitucionPendiente }) {
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
    </div>
  )
}

const pMuted: React.CSSProperties = { fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, margin: 0 }
