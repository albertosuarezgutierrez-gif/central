'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { agruparCalidad, type IncidenciaCalidad } from '@central/module-seguros'
import {
  MOTIVOS_PUERTO,
  type CalidadDato,
} from '@/lib/correduria-puerto'
import { Badge, Pendiente } from '@/components/ui'
import Bloque from './Bloque'

const POR_PAGINA = 50

/**
 * 📊 Incidencias de calidad del dato en la cartera en vigor.
 *
 * Cada regla detecta un problema concreto medido: sin prima, DNI duplicado,
 * vencida sin renovación, etc. Alberto las revisa y arregla; desde el código
 * solo vemos si la ficha o póliza tienen el hueco.
 */
export default function Calidad({
  onContador,
  primero,
}: {
  /**
   * Cuántas incidencias detecta el scanner de calidad en la cartera en vigor.
   * `null` = no se sabe, y nunca 0: «0 incidencias» es la frase tranquilizadora
   * que aquí nadie ha medido. Va en `null` también con la lista TRUNCADA.
   */
  onContador?: (n: number | null) => void
  primero?: boolean
}) {
  const [datos, setDatos] = useState<CalidadDato | null>(null)
  const [ver, setVer] = useState<Record<string, number>>({})

  // Por REF: una lambda nueva del padre en cada render relanzaría el fetch si
  // esto viviera en las dependencias del efecto.
  const avisar = useRef(onContador)
  avisar.current = onContador

  useEffect(() => {
    fetch('/api/correduria/calidad')
      .then((r) => r.json())
      .then((d: CalidadDato) => {
        setDatos(d)
        // Una sola vez por carga, dentro del `.then` (en el render sería bucle).
        avisar.current?.(d.estado === 'ok' && !d.truncado ? d.incidencias.length : null)
      })
      .catch(() => {
        setDatos({ estado: 'error', motivo: 'red' })
        avisar.current?.(null)
      })
  }, [])

  if (datos === null) {
    return (
      <Bloque titulo="Calidad del dato" Icono={AlertTriangle} primero={primero}>
        <span style={pMuted}>Cargando…</span>
      </Bloque>
    )
  }

  if (datos.estado === 'sin_configurar') {
    return (
      <Bloque titulo="Calidad del dato" Icono={AlertTriangle} primero={primero}>
        <p style={pMuted}>
          ⏳ El puerto con asegura no está conectado. <strong>No lo leas como «el dato está
          perfecto»</strong>: es que desde aquí no se ha podido mirar.
        </p>
      </Bloque>
    )
  }

  if (datos.estado === 'error') {
    return (
      <Bloque titulo="Calidad del dato" Icono={AlertTriangle} tono="malo" primero={primero}>
        <p style={{ ...pMuted, color: 'var(--negative)' }}>
          ⚠️ No se ha podido leer: {MOTIVOS_PUERTO[datos.motivo]} <strong>No significa que el
          dato esté bien.</strong>
        </p>
      </Bloque>
    )
  }

  const { incidencias } = datos
  const grupos = agruparCalidad(incidencias)
  // `null` = no comprobado. Nunca se sustituye por 0.
  const total = incidencias.length
  const medido = datos.estado === 'ok'
  const hayAlarma = !datos.truncado && total > 0

  return (
    <Bloque
      titulo={
        total === 0 && medido
          ? 'Sin huecos en la cartera en vigor'
          : `${total} ${total === 1 ? 'incidencia' : 'incidencias'} de calidad`
      }
      Icono={AlertTriangle}
      tono={hayAlarma ? 'malo' : 'neutral'}
      destacado={hayAlarma}
      primero={primero}
    >
      {datos.truncado && (
        <p style={{ ...pMuted, color: 'var(--warning)', marginBottom: 10 }}>
          ⚠️ La lista viene recortada, así que el recuento de arriba <strong>no se ha podido
          comprobar</strong> completamente.
        </p>
      )}

      {total === 0 && medido ? (
        <p style={{ ...pMuted, marginTop: 10 }}>
          Comprobado: ninguna ficha ni póliza de la cartera en vigor tiene un hueco que
          estorbe a la hora de avisar, renovar o tarificar.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, marginTop: 12 }}>
          {grupos.map((g) => (
            <Grupo key={g.regla} grupo={g} ver={ver} setVer={setVer} />
          ))}
        </div>
      )}
    </Bloque>
  )
}

function Grupo({
  grupo,
  ver,
  setVer,
}: {
  grupo: ReturnType<typeof agruparCalidad>[number]
  ver: Record<string, number>
  setVer: React.Dispatch<React.SetStateAction<Record<string, number>>>
}) {
  const visibles = grupo.filas.slice(0, ver[grupo.regla] ?? POR_PAGINA)
  const tieneMs = grupo.filas.length > (ver[grupo.regla] ?? POR_PAGINA)

  return (
    <details style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, minWidth: 0 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
        {grupo.titulo} · {grupo.filas.length}
      </summary>
      <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>
        {grupo.queHacer}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
        {visibles.map((f) => (
          <Fila key={`${f.clienteId}-${f.polizaId}-${f.regla}`} f={f} />
        ))}
      </div>
      {tieneMs && (
        <button
          onClick={() =>
            setVer((v) => ({
              ...v,
              [grupo.regla]: (v[grupo.regla] ?? POR_PAGINA) + POR_PAGINA,
            }))
          }
          style={{
            marginTop: 10,
            minHeight: 44,
            padding: '0 16px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Ver {Math.min(POR_PAGINA, grupo.filas.length - (ver[grupo.regla] ?? POR_PAGINA))} más
        </button>
      )}
    </details>
  )
}

function Fila({ f }: { f: IncidenciaCalidad }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
        {f.clienteId && (
          <Link href={`/correduria/cliente/${f.clienteId}`} style={{ fontWeight: 700, fontSize: 15 }}>
            {f.cliente || f.clienteId}
          </Link>
        )}
        {f.polizaId && (
          <>
            <span style={{ color: 'var(--muted)' }}>
              {f.numeroPoliza && `nº ${f.numeroPoliza}`}
              {f.numeroPoliza && f.compania && ' · '}
              {f.compania}
            </span>
            <Link href={`/correduria/poliza/${f.polizaId}`} style={{ fontSize: 13, color: 'var(--link)' }}>
              Ver póliza
            </Link>
          </>
        )}
      </div>
      {f.dato && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          {f.dato.match(/^\d{4}-\d{2}-\d{2}$/)
            ? `Venció el ${fmtFecha(f.dato)}`
            : f.dato}
        </div>
      )}
      {f.relacionadoId && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          <Link href={`/correduria/cliente/${f.relacionadoId}`}>
            Otra ficha
          </Link>
        </div>
      )}
    </div>
  )
}

// Fecha siempre en formato español: "2026-11-03" → "03/11/2026".
function fmtFecha(iso: string): string {
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}

const pMuted: React.CSSProperties = { fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, margin: 0 }
