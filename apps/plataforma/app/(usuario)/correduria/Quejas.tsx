'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { MessageSquareWarning } from 'lucide-react'
import { Badge, btnStyle } from '@/components/ui'
import { fechaEs } from '@/lib/ficha-asegura'
import Bloque from './Bloque'
import {
  CANALES_QUEJA,
  ESTADOS_QUEJA_RESUELTA,
  ETIQUETA_CANAL_QUEJA,
  ETIQUETA_ESTADO_QUEJA,
  ETIQUETA_MOTIVO_QUEJA,
  MOTIVOS_QUEJA,
  contadorQuejas,
  interpretarColaQuejas,
  interpretarEscrituraQueja,
  quejasAbiertas,
  quejasVencidas,
  textoMotivoQueja,
  type Queja,
  type RespuestaEscrituraQueja,
  type RespuestaQuejas,
} from '@/lib/quejas-asegura'

/**
 * Registro de QUEJAS Y RECLAMACIONES del SAC.
 *
 * El portal y la web publican que el SAC contesta en un mes. Aquí se anota la queja que llega
 * (por correo, teléfono, carta…) y se ve su reloj: van ordenadas por el plazo, no por la llegada.
 *
 * - **No se da por resuelta sin la respuesta escrita**: el botón se deshabilita, asegura lo exige
 *   y la BD tiene un CHECK. Sin texto no queda constancia de qué se contestó.
 * - **Un fallo de lectura no se calla** y el contador sube `null`, no 0.
 * - El bloque se ve siempre (compacto si no hay abiertas): es también donde se REGISTRA una queja
 *   nueva, y un botón que solo aparece cuando ya hay quejas no sirve para anotar la primera.
 */
type Mensaje = { tono: 'ok' | 'error'; texto: string }

const input = { width: '100%', minHeight: 44, fontSize: 14, padding: '8px 10px', boxSizing: 'border-box' as const }

function hoy(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

function porqueNoSeLee(r: RespuestaQuejas): string {
  if (r.estado === 'sin_configurar') return 'el puerto con asegura no está conectado en este proyecto'
  if (r.estado === 'no_desplegado') return 'la versión desplegada de asegura todavía no sirve esta ruta'
  return r.estado === 'error' ? textoMotivoQueja(r.motivo) : ''
}

function textoEscritura(r: RespuestaEscrituraQueja): string {
  if (r.estado === 'invalida') return r.motivos.join(' ')
  if (r.estado === 'no_permitida') return r.motivo
  if (r.estado === 'no_encontrada') return r.motivo ?? 'Esa queja ya no está en asegura; recarga.'
  if (r.estado === 'sin_configurar') return 'El puerto con asegura no está conectado: NO se ha guardado nada.'
  if (r.estado === 'error') return `No se ha guardado: ${textoMotivoQueja(r.motivo)}.`
  return ''
}

function EtiquetaPlazo({ q }: { q: Queja }) {
  const d = q.diasRestantes
  if (q.plazo === 'vencida' && d !== null) {
    const n = Math.abs(d)
    return <Badge tono="negativo">Fuera de plazo · {n} {n === 1 ? 'día' : 'días'}</Badge>
  }
  if (q.plazo === 'urgente' && d !== null) {
    return <Badge tono="aviso">{d === 0 ? 'Vence hoy' : `Quedan ${d} ${d === 1 ? 'día' : 'días'}`}</Badge>
  }
  if (q.plazo === 'en_plazo' && d !== null) return <Badge tono="neutral">Quedan {d} días</Badge>
  // Sin plazo calculable: se dice, no se supone «en plazo».
  return <Badge tono="aviso">Plazo sin calcular</Badge>
}

export default function Quejas({ onContador }: {
  /** Quejas abiertas (+ ilegibles). `null` = no se ha podido saber; nunca 0. */
  onContador?: (n: number | null) => void
}) {
  const [lectura, setLectura] = useState<RespuestaQuejas | null>(null)
  const [ok, setOk] = useState<Extract<RespuestaQuejas, { estado: 'ok' }> | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState<Mensaje | null>(null)
  const [alta, setAlta] = useState(false)

  const avisar = useRef(onContador)
  useEffect(() => { avisar.current = onContador }, [onContador])

  const leer = useCallback(async (): Promise<RespuestaQuejas> => {
    try {
      const res = await fetch('/api/correduria/quejas')
      return interpretarColaQuejas(res.status, await res.json().catch(() => null))
    } catch {
      return { estado: 'error', motivo: 'red' }
    }
  }, [])

  const adoptar = useCallback((r: RespuestaQuejas) => {
    setLectura(r)
    // Se conserva la última lectura buena si una recarga falla.
    if (r.estado === 'ok') setOk(r)
    avisar.current?.(contadorQuejas(r))
  }, [])

  useEffect(() => {
    let vivo = true
    leer().then((r) => { if (vivo) adoptar(r) })
    return () => { vivo = false }
  }, [leer, adoptar])

  async function escribir(metodo: 'POST' | 'PATCH', cuerpo: Record<string, unknown>, hecho: string): Promise<boolean> {
    setOcupado(true)
    setMensaje(null)
    let r: RespuestaEscrituraQueja
    try {
      const res = await fetch('/api/correduria/quejas', {
        method: metodo,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cuerpo),
      })
      r = interpretarEscrituraQueja(res.status, await res.json().catch(() => null))
    } catch {
      r = { estado: 'error', motivo: 'red' }
    }
    if (r.estado === 'ok') {
      const nueva = await leer()
      adoptar(nueva)
      setMensaje(nueva.estado === 'ok'
        ? { tono: 'ok', texto: hecho }
        : { tono: 'error', texto: `${hecho} Pero la cola no se ha podido refrescar (${porqueNoSeLee(nueva)}).` })
    } else {
      setMensaje({ tono: 'error', texto: textoEscritura(r) })
    }
    setOcupado(false)
    return r.estado === 'ok'
  }

  if (lectura === null) return null

  if (ok === null) {
    return (
      <Bloque tono="aviso" Icono={MessageSquareWarning} titulo="Quejas y reclamaciones (SAC)"
        accion={<Badge tono="aviso">No se han podido leer</Badge>}
        sub={<>No se han podido leer ({porqueNoSeLee(lectura)}). <strong>No significa que no haya ninguna con el plazo corriendo.</strong></>}>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          Cada queja tiene un mes para contestarse desde que se recibió, y ese plazo corre aunque esta pantalla no la vea.
        </p>
      </Bloque>
    )
  }

  const lista = quejasAbiertas(ok.quejas)
  const nVencidas = quejasVencidas(ok.quejas).length
  const hayAlarma = lista.length > 0 || ok.ilegibles > 0
  const inf = ok.informe

  return (
    <Bloque
      destacado={hayAlarma}
      tono={nVencidas > 0 ? 'malo' : hayAlarma ? 'aviso' : 'neutral'}
      Icono={MessageSquareWarning}
      titulo="Quejas y reclamaciones (SAC)"
      accion={
        nVencidas > 0
          ? <Badge tono="negativo">{nVencidas} fuera de plazo</Badge>
          : lista.length > 0
            ? <Badge tono="aviso">{lista.length} abierta{lista.length === 1 ? '' : 's'}</Badge>
            : <Badge tono="neutral">Ninguna abierta</Badge>
      }
      sub={<>Hay <strong>un mes</strong> para contestar desde que se recibe cada una. Van ordenadas por el plazo.</>}
    >
      {lectura.estado !== 'ok' && (
        <p style={{ fontSize: 12, color: 'var(--warning)', margin: '0 0 10px' }}>
          ⚠️ La última recarga falló ({porqueNoSeLee(lectura)}): lo de abajo es la lectura anterior.
        </p>
      )}
      {mensaje && (
        <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 10px', color: mensaje.tono === 'ok' ? 'var(--positive)' : 'var(--negative)' }}>
          {mensaje.texto}
        </p>
      )}
      {ok.ilegibles > 0 && (
        <p style={{ fontSize: 12, color: 'var(--warning)', margin: '0 0 10px' }}>
          ⚠️ {ok.ilegibles} queja{ok.ilegibles === 1 ? '' : 's'} llegó con una forma que esta pantalla no entiende. <strong>Está ahí</strong>: míralas en asegura.
        </p>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, opacity: ocupado ? 0.6 : 1 }}>
        {lista.map((q) => (
          <FilaQueja key={q.id} q={q} ocupado={ocupado} onCambiar={escribir} />
        ))}
      </ul>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: lista.length ? 12 : 0 }}>
        <button type="button" style={{ ...btnStyle(alta ? 'secundario' : 'primario', 'md'), minHeight: 44 }} onClick={() => setAlta((v) => !v)}>
          {alta ? 'Cerrar' : 'Registrar una queja recibida'}
        </button>
        {inf && (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {inf.año}: {inf.total} recibida{inf.total === 1 ? '' : 's'} · {inf.cerradasEnPlazo} contestada{inf.cerradasEnPlazo === 1 ? '' : 's'} en plazo
            {inf.cerradasFueraDePlazo > 0 && <> · <strong style={{ color: 'var(--negative)' }}>{inf.cerradasFueraDePlazo} fuera de plazo</strong></>}
          </span>
        )}
      </div>
      {alta && <FormularioAlta ocupado={ocupado} onGuardar={async (c) => { if (await escribir('POST', c, 'Queja registrada; su plazo ya corre.')) setAlta(false) }} />}
    </Bloque>
  )
}

function FilaQueja({ q, ocupado, onCambiar }: {
  q: Queja
  ocupado: boolean
  onCambiar: (m: 'PATCH', c: Record<string, unknown>, hecho: string) => Promise<boolean>
}) {
  return (
    <li style={{ borderTop: '1px solid var(--border)', padding: '10px 0' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <EtiquetaPlazo q={q} />
        <strong style={{ fontSize: 14 }}>{q.reclamante}</strong>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          {ETIQUETA_MOTIVO_QUEJA[q.motivo as keyof typeof ETIQUETA_MOTIVO_QUEJA] ?? q.motivo}
          {' · '}{ETIQUETA_CANAL_QUEJA[q.canal as keyof typeof ETIQUETA_CANAL_QUEJA] ?? q.canal}
          {' · '}{ETIQUETA_ESTADO_QUEJA[q.estado]}
        </span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0' }}>
        Recibida el <strong>{fechaEs(q.recibidaEl)}</strong> · contestar antes del <strong>{fechaEs(q.plazoEl)}</strong>
        {q.clienteId && <> · <Link href={`/correduria/cliente/${q.clienteId}`}>{q.clienteNombre ?? 'ver cliente'}</Link></>}
        {q.numeroPoliza && <> · póliza {q.numeroPoliza}</>}
      </p>
      <p style={{ fontSize: 13, margin: '6px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {q.detalleIlegible
          ? <em style={{ color: 'var(--warning)' }}>El detalle no se puede leer (clave de datos personales).</em>
          : q.detalle ?? <em style={{ color: 'var(--muted)' }}>Sin detalle.</em>}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        {q.estado === 'recibida' && (
          <button type="button" disabled={ocupado} style={{ ...btnStyle('secundario', 'md'), minHeight: 44 }}
            onClick={() => onCambiar('PATCH', { id: q.id, estado: 'en_tramite' }, 'Queja en trámite.')}>
            Pasar a trámite
          </button>
        )}
        <button type="button" disabled={ocupado} style={{ ...btnStyle('sutil', 'md'), minHeight: 44 }}
          onClick={() => { if (confirm('¿El cliente retira la queja?')) void onCambiar('PATCH', { id: q.id, estado: 'desistida' }, 'Anotado: el cliente desiste.') }}>
          El cliente desiste
        </button>
      </div>
      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, minHeight: 44, display: 'flex', alignItems: 'center' }}>Contestar y cerrar</summary>
        <FormularioRespuesta q={q} ocupado={ocupado} onCambiar={onCambiar} />
      </details>
    </li>
  )
}

function FormularioRespuesta({ q, ocupado, onCambiar }: {
  q: Queja
  ocupado: boolean
  onCambiar: (m: 'PATCH', c: Record<string, unknown>, hecho: string) => Promise<boolean>
}) {
  const [estado, setEstado] = useState<string>(ESTADOS_QUEJA_RESUELTA[0])
  const [respuesta, setRespuesta] = useState('')
  const puede = respuesta.trim().length > 0 && !ocupado
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
      <label style={{ fontSize: 12, fontWeight: 600 }}>
        Cómo se resolvió
        <select value={estado} onChange={(e) => setEstado(e.target.value)} style={input}>
          {ESTADOS_QUEJA_RESUELTA.map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO_QUEJA[e]}</option>)}
        </select>
      </label>
      <label style={{ fontSize: 12, fontWeight: 600 }}>
        Qué se le contestó (obligatorio: sin texto no queda constancia)
        <textarea value={respuesta} onChange={(e) => setRespuesta(e.target.value)} rows={4} maxLength={8000} style={{ ...input, resize: 'vertical' }} />
      </label>
      <button type="button" disabled={!puede} style={{ ...btnStyle('primario', 'md'), minHeight: 44, justifySelf: 'start' }}
        onClick={() => onCambiar('PATCH', { id: q.id, estado, respuesta }, 'Queja contestada y cerrada.')}>
        Guardar la respuesta
      </button>
    </div>
  )
}

function FormularioAlta({ ocupado, onGuardar }: {
  ocupado: boolean
  onGuardar: (c: Record<string, unknown>) => Promise<void>
}) {
  const [reclamante, setReclamante] = useState('')
  const [canal, setCanal] = useState<string>(CANALES_QUEJA[0])
  const [motivo, setMotivo] = useState<string>(MOTIVOS_QUEJA[0])
  const [recibidaEl, setRecibidaEl] = useState(hoy())
  const [detalle, setDetalle] = useState('')
  const puede = reclamante.trim() && detalle.trim() && recibidaEl && !ocupado
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <label style={{ fontSize: 12, fontWeight: 600 }}>
        Quién la presenta
        <input value={reclamante} onChange={(e) => setReclamante(e.target.value)} maxLength={200} style={input} />
      </label>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <label style={{ fontSize: 12, fontWeight: 600 }}>
          Por dónde llegó
          <select value={canal} onChange={(e) => setCanal(e.target.value)} style={input}>
            {CANALES_QUEJA.map((c) => <option key={c} value={c}>{ETIQUETA_CANAL_QUEJA[c]}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, fontWeight: 600 }}>
          De qué trata
          <select value={motivo} onChange={(e) => setMotivo(e.target.value)} style={input}>
            {MOTIVOS_QUEJA.map((m) => <option key={m} value={m}>{ETIQUETA_MOTIVO_QUEJA[m]}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, fontWeight: 600 }}>
          Recibida el
          <input type="date" value={recibidaEl} max={hoy()} onChange={(e) => setRecibidaEl(e.target.value)} style={input} />
        </label>
      </div>
      <label style={{ fontSize: 12, fontWeight: 600 }}>
        Qué reclama
        <textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={4} maxLength={8000} style={{ ...input, resize: 'vertical' }} />
      </label>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
        El plazo lo pone la fecha de recepción (un mes natural), no la de hoy.
      </p>
      <button type="button" disabled={!puede} style={{ ...btnStyle('primario', 'md'), minHeight: 44, justifySelf: 'start' }}
        onClick={() => onGuardar({ reclamante, canal, motivo, recibidaEl, detalle })}>
        Registrar
      </button>
    </div>
  )
}
