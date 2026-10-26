'use client'

// «Hoy» → cola «Solicitudes del portal» (26/10/2026): módulos («Herramientas») que los clientes piden desde el portal.
// Mismo patrón que `OportunidadesPatrimonio`. Activar/Rechazar reutilizan el POST de `/api/correduria/cliente/portal-modulos`
// (el servidor REVALIDA —p. ej. Patrimonio exige póliza EN VIGOR—, va auditado y deja `historial_interno`). Rechazar = `retirar`.
// Tras la acción la fila desaparece SIN desmontar la lista (se recarga en segundo plano). Vacío = la cola no se pinta.
// Error de lectura ≠ vacío. Lista acotada: ~50 + «Ver más».

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Clock, Inbox, TriangleAlert } from 'lucide-react'
import { btnStyle, Badge } from '@/components/ui'
import { fechaSolicitud, textoResultadoAccion, type LecturaSolicitudesPortal, type SolicitudPortal } from '@/lib/correduria/solicitudes-portal'
import Bloque from './Bloque'
import { ConIcono } from './iconos'

const POR_PAGINA = 50

export default function SolicitudesPortal() {
  const [d, setD] = useState<LecturaSolicitudesPortal | null>(null)
  const [ver, setVer] = useState(POR_PAGINA)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const cargar = useCallback(() => {
    fetch('/api/correduria/solicitudes-portal')
      .then((r) => (r.ok ? r.json() : { estado: 'error', motivo: `HTTP ${r.status}` }))
      .then((x: LecturaSolicitudesPortal) => setD(x))
      .catch(() => setD({ estado: 'error', motivo: 'red' }))
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function actuar(s: SolicitudPortal, accion: 'activar' | 'retirar') {
    if (!s.clienteId) return
    if (accion === 'retirar' && !window.confirm(`¿Rechazar «${s.moduloNombre}» para ${s.cliente}? La petición se retira.`)) return
    setOcupado(s.id); setAviso(null)
    try {
      const r = await fetch('/api/correduria/cliente/portal-modulos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clienteId: s.clienteId, modulo: s.modulo, accion }),
      })
      const t = textoResultadoAccion(accion, r.status, await r.json().catch(() => null))
      setAviso(t.ok ? `${t.texto} (${s.cliente} · ${s.moduloNombre})` : t.texto)
    } catch {
      setAviso('NO se sabe si se ha hecho: no se ha podido hablar con asegura. Mira la lista antes de repetir.')
    } finally {
      setOcupado(null)
      cargar()
    }
  }

  if (d === null) return null
  if (d.estado === 'sin_configurar') {
    return (
      <Bloque titulo="Solicitudes del portal" Icono={Inbox}>
        <p style={pMuted}><ConIcono i={Clock}>El puerto con asegura no está conectado: no se pueden mirar las solicitudes.</ConIcono></p>
      </Bloque>
    )
  }
  if (d.estado === 'error') {
    return (
      <Bloque titulo="Solicitudes del portal" Icono={Inbox} tono="malo">
        <p style={{ ...pMuted, color: 'var(--negative)' }}>
          <ConIcono i={TriangleAlert}>No se han podido leer las solicitudes: {d.motivo}. No significa que no haya.</ConIcono>
        </p>
      </Bloque>
    )
  }

  const { solicitudes } = d
  // Vacío: la cola no se pinta (salvo que acabemos de actuar: el aviso del resultado no puede desaparecer).
  if (solicitudes.length === 0 && !aviso) return null
  const visibles = solicitudes.slice(0, ver)
  return (
    <Bloque
      titulo={solicitudes.length > 0 ? `Solicitudes del portal · ${solicitudes.length}` : 'Solicitudes del portal · sin pendientes'}
      sub="Herramientas que los clientes han pedido desde el portal. Al activar, el servidor vuelve a comprobar las condiciones."
      Icono={Inbox}
      tono={solicitudes.length > 0 ? 'aviso' : 'neutral'}
    >
      {aviso && <p style={{ ...pMuted, marginBottom: 8 }} aria-live="polite">{aviso}</p>}
      {solicitudes.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
            {visibles.map((s) => (
              <div key={s.id} style={{ border: '1px solid var(--border)', borderLeft: `4px solid ${s.puedeActivar ? 'var(--positive)' : 'var(--warning)'}`, borderRadius: 8, padding: 12, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  {s.clienteId
                    ? <Link href={`/correduria/cliente/${s.clienteId}`} style={{ fontWeight: 700, fontSize: 15, overflowWrap: 'anywhere' }}>{s.cliente}</Link>
                    : <span style={{ fontWeight: 700, fontSize: 15, overflowWrap: 'anywhere' }}>{s.cliente}</span>}
                  {s.sinFicha && <Badge tono="aviso">Sin ficha</Badge>}
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>{s.moduloNombre}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Pedido el {fechaSolicitud(s.solicitadoEn)}</div>
                {!s.puedeActivar && s.motivoNoActivar && (
                  <div style={{ fontSize: 12, color: 'var(--warning)', marginTop: 4, overflowWrap: 'anywhere' }}>{s.motivoNoActivar}</div>
                )}
                <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    disabled={!s.puedeActivar || ocupado === s.id}
                    title={s.puedeActivar ? undefined : (s.motivoNoActivar ?? undefined)}
                    onClick={() => void actuar(s, 'activar')}
                    style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }}
                  >
                    Activar
                  </button>
                  <button
                    type="button"
                    disabled={!s.clienteId || ocupado === s.id}
                    title={s.clienteId ? undefined : 'Sin ficha vinculada no se puede rechazar desde aquí.'}
                    onClick={() => void actuar(s, 'retirar')}
                    style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}
                  >
                    Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
          {ver < solicitudes.length && (
            <button type="button" onClick={() => setVer((v) => v + POR_PAGINA)} style={{ marginTop: 10, minHeight: 44, padding: '0 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontWeight: 600 }}>
              Ver {Math.min(POR_PAGINA, solicitudes.length - ver)} más
            </button>
          )}
        </>
      )}
    </Bloque>
  )
}

const pMuted: React.CSSProperties = { fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, margin: 0 }
