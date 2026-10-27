'use client'
import { useCallback, useEffect, useState } from 'react'
import { btnStyle } from '@/components/ui'
import {
  ETIQUETA_ESTADO_MODULO,
  interpretarModulos,
  notaModulo,
  textoEscritura,
  textoMotivoModulos,
  type ModuloFicha,
  type RespuestaModulos,
} from '@/lib/portal-modulos-asegura'

/**
 * «Módulos del portal» de un cliente: qué herramientas del portal (Patrimonio y alquileres, Flota, Portal del
 * Empleado) tiene activadas y el botón de activar/retirar. Lee y escribe por el puerto de asegura
 * (`/api/correduria/cliente/portal-modulos`); las reglas (Patrimonio solo con póliza en vigor) las decide asegura y
 * llegan ya como `puedeActivar` + `motivoNoActivar`. Si no se puede activar, el botón sigue ahí (desactivado en
 * aspecto, `aria-disabled`) y explica POR QUÉ: un hueco sin explicación parece una avería.
 * Cargando o ilegible NO es «sin módulos»: se dice, con botón de volver a comprobar.
 */
const COLOR_ESTADO: Record<ModuloFicha['estado'], string> = {
  activo: 'var(--positive)',
  solicitado: 'var(--warning)',
  inactivo: 'var(--muted)',
}

export default function ModulosPortal({ clienteId }: { clienteId: string }) {
  const [datos, setDatos] = useState<RespuestaModulos | null>(null)
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [explica, setExplica] = useState<string | null>(null)

  const consultar = useCallback(async () => {
    setCargando(true)
    try {
      const res = await fetch(`/api/correduria/cliente/portal-modulos?clienteId=${encodeURIComponent(clienteId)}`, { cache: 'no-store' })
      setDatos(interpretarModulos(res.status, await res.json().catch(() => null)))
    } catch {
      setDatos({ estado: 'error', motivo: 'red' })
    } finally {
      setCargando(false)
    }
  }, [clienteId])

  useEffect(() => {
    void consultar()
  }, [consultar])

  async function cambiar(m: ModuloFicha, accion: 'activar' | 'retirar') {
    setOcupado(m.id)
    setAviso(null)
    try {
      const res = await fetch('/api/correduria/cliente/portal-modulos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clienteId, modulo: m.id, accion }),
      })
      const d = textoEscritura(res.status, await res.json().catch(() => null), accion, m.nombre)
      setAviso(d)
      await consultar()
    } catch {
      setAviso({ ok: false, texto: `No se ha podido ${accion} «${m.nombre}»: no se pudo llegar a asegura. No consta ningún cambio.` })
    } finally {
      setOcupado(null)
    }
  }

  const marco: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10, minWidth: 0 }
  const sutil: React.CSSProperties = { margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--muted)', overflowWrap: 'anywhere' }

  if (datos === null) {
    return <div style={marco}><p style={sutil}>Comprobando los módulos del portal…</p></div>
  }
  if (datos.estado !== 'ok') {
    const texto =
      datos.estado === 'no_encontrado'
        ? 'asegura dice que esta ficha ya no está en la correduría.'
        : datos.estado === 'sin_configurar'
          ? 'El puerto con asegura no está conectado (falta ASEGURA_OPERADOR_SECRET).'
          : `No se han podido comprobar los módulos: ${textoMotivoModulos(datos.motivo)} No significa que no tenga ninguno.`
    return (
      <div style={marco}>
        <p style={sutil}>{texto}</p>
        <div>
          <button type="button" disabled={cargando} onClick={() => void consultar()} style={{ ...btnStyle('sutil'), minHeight: 44 }}>
            {cargando ? 'comprobando…' : 'Volver a comprobar'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={marco}>
      {datos.modulos.map((m) => {
        const bloqueado = !m.puedeActivar && m.estado !== 'activo' && m.motivoNoActivar !== null
        return (
          <div key={m.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, paddingBottom: 10, borderBottom: '1px solid var(--border)', minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
              <strong style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{m.nombre}</strong>
              <span style={{ fontSize: 12, fontWeight: 600, color: COLOR_ESTADO[m.estado] }}>{ETIQUETA_ESTADO_MODULO[m.estado]}</span>
            </div>
            {m.descripcion !== '' && <p style={{ ...sutil, maxWidth: '72ch' }}>{m.descripcion}</p>}
            {notaModulo(m.id) !== null && <p role="note" style={{ ...sutil, maxWidth: '72ch' }}>{notaModulo(m.id)}</p>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {m.estado !== 'activo' && (
                <button
                  type="button"
                  aria-disabled={!m.puedeActivar || ocupado !== null}
                  onClick={() => {
                    if (bloqueado) setExplica(explica === m.id ? null : m.id)
                    else if (m.puedeActivar && ocupado === null) void cambiar(m, 'activar')
                  }}
                  style={{
                    ...btnStyle(m.puedeActivar ? 'primario' : 'secundario'),
                    minHeight: 44, whiteSpace: 'normal', textAlign: 'left',
                    opacity: m.puedeActivar ? 1 : 0.6,
                  }}
                >
                  {ocupado === m.id ? 'guardando…' : m.estado === 'solicitado' ? 'Activar (lo ha pedido)' : 'Activar'}
                </button>
              )}
              {m.puedeRetirar && (
                <button
                  type="button"
                  disabled={ocupado !== null}
                  onClick={() => void cambiar(m, 'retirar')}
                  style={{ ...btnStyle('sutil'), minHeight: 44, whiteSpace: 'normal', textAlign: 'left' }}
                >
                  {m.estado === 'solicitado' ? 'Rechazar petición' : 'Retirar'}
                </button>
              )}
            </div>
            {/* El motivo se ve siempre que no se puede: sin pulsar nada no hay que adivinar. */}
            {bloqueado && (
              <p role="note" style={{ ...sutil, maxWidth: '72ch', color: explica === m.id ? 'var(--text)' : 'var(--muted)' }}>
                {m.motivoNoActivar}
              </p>
            )}
          </div>
        )
      })}
      {aviso && (
        <div role="status" style={{ fontSize: 12, color: aviso.ok ? 'var(--positive)' : 'var(--warning)', overflowWrap: 'anywhere' }}>
          {aviso.texto}
        </div>
      )}
    </div>
  )
}
