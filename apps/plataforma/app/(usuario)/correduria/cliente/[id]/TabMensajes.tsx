'use client'
import { useCallback, useEffect, useState } from 'react'
import { btnStyle } from '@/components/ui'
import { fechaHoraEs } from '@/lib/ficha-asegura'
import {
  leerMensaje,
  textoAvisoRespuesta,
  textoDesenlaceRespuesta,
  type AvisoRespuesta,
  type DesenlaceRespuesta,
  type MensajeCorredor,
} from '@/lib/mensajes-asegura'

/**
 * La conversación con el cliente (ASegura OS §Q.7): lo que escribió en su portal y lo que se le
 * contestó, por tema (póliza o general).
 *
 * 🚨 Abrir la pestaña NO lo da por leído: mirar y cerrar sin contestar haría desaparecer de «Hoy» a
 * alguien que espera. Sella contestar o «No necesita respuesta», y solo hasta el último mensaje que
 * había en pantalla (`hasta`): lo que entre mientras tanto sigue pendiente.
 *
 * - Contestar guarda la respuesta en su portal. El correo de aviso es OPCIONAL y va desmarcado:
 *   sale con este mismo clic, y no copia el texto (solo «tienes una respuesta», con el enlace).
 * - Un fallo de lectura se dice: una conversación vacía y una que no se ha podido leer no pueden
 *   verse igual.
 */
type Lectura = { estado: 'ok'; mensajes: MensajeCorredor[] } | { estado: 'sin_datos'; causa: string }

const MAX = 4000
const POR_PAGINA = 50

export default function TabMensajes({ clienteId, polizas }: {
  clienteId: string
  /** Pólizas vivas del cliente, para el tema de la respuesta. */
  polizas: { id: string; etiqueta: string }[]
}) {
  const [lectura, setLectura] = useState<Lectura | null>(null)
  const [tema, setTema] = useState('')
  const [cuerpo, setCuerpo] = useState('')
  const [avisar, setAvisar] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)
  const [ver, setVer] = useState(POR_PAGINA)

  const leer = useCallback(async (): Promise<Lectura> => {
    try {
      const res = await fetch(`/api/correduria/mensajes?clienteId=${encodeURIComponent(clienteId)}`)
      const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
      if (j?.estado === 'ok' && Array.isArray(j.mensajes)) {
        const lista = j.mensajes.map(leerMensaje)
        if (lista.some(x => x === null)) return { estado: 'sin_datos', causa: 'mensaje incompleto' }
        return { estado: 'ok', mensajes: lista as MensajeCorredor[] }
      }
      return { estado: 'sin_datos', causa: typeof j?.causa === 'string' ? j.causa : `HTTP ${res.status}` }
    } catch {
      return { estado: 'sin_datos', causa: 'sin conexión' }
    }
  }, [clienteId])

  useEffect(() => {
    let vivo = true
    leer().then((r) => { if (vivo) setLectura(r) })
    return () => { vivo = false }
  }, [leer])

  // El último mensaje que hay en pantalla: sellar más allá sería dar por visto lo que nadie ha visto.
  const hasta = lectura?.estado === 'ok' && lectura.mensajes.length > 0 ? lectura.mensajes[lectura.mensajes.length - 1].creadoAt : null
  const pendientes = lectura?.estado === 'ok' ? lectura.mensajes.filter(m => m.autor === 'cliente' && m.leidoAt === null).length : 0

  async function sinRespuesta() {
    if (!hasta) return
    setOcupado(true)
    setResultado(null)
    let ok = false
    try {
      const res = await fetch('/api/correduria/mensajes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'leidos', clienteId, hasta }),
      })
      ok = res.ok
    } catch { /* ok = false */ }
    setResultado({ ok, texto: ok ? 'Marcado como atendido: deja de salir en Hoy.' : 'NO se ha marcado: no se ha podido hablar con asegura. Recarga antes de repetir.' })
    if (ok) {
      const r = await leer()
      if (r.estado === 'ok') setLectura(r)
    }
    setOcupado(false)
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!cuerpo.trim()) { setResultado({ ok: false, texto: textoDesenlaceRespuesta('invalido') }); return }
    setOcupado(true)
    setResultado(null)
    let desenlace: DesenlaceRespuesta = 'error'
    let aviso: AvisoRespuesta = 'desconocido'
    try {
      const res = await fetch('/api/correduria/mensajes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'responder', clienteId, polizaId: tema || null, cuerpo, avisar, hasta }),
      })
      const j = (await res.json().catch(() => null)) as { desenlace?: DesenlaceRespuesta; aviso?: AvisoRespuesta } | null
      desenlace = j?.desenlace ?? 'error'
      aviso = j?.aviso ?? 'desconocido'
    } catch { /* desenlace 'error' = no se sabe */ }
    const ok = desenlace === 'enviado'
    const lineaAviso = ok ? textoAvisoRespuesta(aviso) : null
    setResultado({ ok, texto: [textoDesenlaceRespuesta(desenlace), lineaAviso].filter(Boolean).join(' ') })
    if (ok) {
      setCuerpo('')
      setAvisar(false)
      const r = await leer()
      if (r.estado === 'ok') setLectura(r)
    }
    setOcupado(false)
  }

  const nombreTema = (id: string | null) => (id === null ? 'General' : polizas.find(p => p.id === id)?.etiqueta ?? 'Otra póliza')

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
      <section>
        <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Conversación en su portal</h3>
        {lectura === null ? (
          <p style={{ color: 'var(--muted)', margin: 0 }}>Cargando…</p>
        ) : lectura.estado !== 'ok' ? (
          <p style={{ color: 'var(--warning)', margin: 0 }}>
            No se ha podido leer ({lectura.causa}). <strong>No significa que no haya escrito nada.</strong>
          </p>
        ) : lectura.mensajes.length === 0 ? (
          <p style={{ color: 'var(--muted)', margin: 0 }}>No ha escrito nada por el portal todavía.</p>
        ) : (
          <>
          {lectura.mensajes.length > ver && (
            <button type="button" onClick={() => setVer(v => v + POR_PAGINA)} style={{ ...btnStyle('sutil'), minHeight: 44, marginBottom: 8 }}>
              Ver {Math.min(POR_PAGINA, lectura.mensajes.length - ver)} anteriores
            </button>
          )}
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8, opacity: ocupado ? 0.6 : 1 }}>
            {lectura.mensajes.slice(-ver).map((m) => (
              <li key={m.id} style={{
                justifySelf: m.autor === 'corredor' ? 'end' : 'start',
                maxWidth: 'min(620px, 92%)',
                border: '1px solid var(--border)',
                borderLeft: m.autor === 'cliente' ? '3px solid var(--warning)' : '1px solid var(--border)',
                borderRadius: 10, padding: '8px 10px',
                background: m.autor === 'corredor' ? 'var(--panel)' : 'transparent',
              }}>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>
                  {m.autor === 'cliente' ? 'Cliente' : `Tú${m.actor ? ` (${m.actor})` : ''}`} · {fechaHoraEs(m.creadoAt)} · {nombreTema(m.polizaId)}
                  {m.autor === 'corredor' && (m.leidoAt ? ' · leído' : ' · sin constancia de lectura')}
                  {m.autor === 'cliente' && m.leidoAt === null && ' · pendiente'}
                </span>
                <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.cuerpo}</span>
              </li>
            ))}
          </ol>
          {pendientes > 0 && (
            <button type="button" onClick={sinRespuesta} disabled={ocupado} style={{ ...btnStyle('secundario'), minHeight: 44, marginTop: 10 }}>
              No necesita respuesta ({pendientes})
            </button>
          )}
          </>
        )}
      </section>

      <form onSubmit={enviar} style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Contestar</h3>
        <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
          Sobre qué
          <select value={tema} onChange={(e) => setTema(e.target.value)} disabled={ocupado} style={{ minHeight: 44, fontSize: 14 }}>
            <option value="">General</option>
            {polizas.map((p) => <option key={p.id} value={p.id}>{p.etiqueta}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
          Respuesta (la verá en su portal)
          <textarea value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} maxLength={MAX} rows={4} disabled={ocupado}
            style={{ width: '100%', boxSizing: 'border-box', fontSize: 14, padding: '8px 10px' }} />
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, minHeight: 44 }}>
          <input type="checkbox" checked={avisar} onChange={(e) => setAvisar(e.target.checked)} disabled={ocupado} style={{ width: 20, height: 20 }} />
          Avisarle por correo de que tiene respuesta (sin copiar el texto)
        </label>
        <div>
          <button type="submit" disabled={ocupado} style={{ ...btnStyle('primario'), minHeight: 44 }}>
            {ocupado ? 'Guardando…' : 'Contestar'}
          </button>
        </div>
        {resultado && (
          <p role="status" style={{ margin: 0, color: resultado.ok ? 'var(--positive)' : 'var(--negative)' }}>{resultado.texto}</p>
        )}
      </form>
    </div>
  )
}
