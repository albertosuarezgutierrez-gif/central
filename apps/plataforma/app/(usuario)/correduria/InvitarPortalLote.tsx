'use client'
import { useState } from 'react'
import { Mail } from 'lucide-react'

import { btnStyle } from '@/components/ui'
import { interpretarCenso, interpretarLote, type Censo, type ResultadoLote } from '@/lib/invitacion-lote'
import Bloque from './Bloque'

/**
 * Invitar al portal a TODOS los que se puede de una vez (23/09/2026).
 *
 * Medido ese día: el portal lleva desde el 01/09 y no se había mandado ni una
 * invitación; la única forma era ficha a ficha. Esto no cambia QUÉ se envía (es
 * el mismo correo, con las mismas guardas, uno por ficha) sino que deja hacerlo
 * con una sola decisión.
 *
 * 🚨 Nada sale sin que Alberto vea ANTES la lista de nombres y el texto, y
 * marque que lo ha revisado. Es la regla de comunicaciones salientes del
 * `CLAUDE.md` raíz: el clic sobre lo que ha visto es la autorización para ESE
 * envío. Preparar la lista no manda nada, y no se prepara sola al abrir la
 * pantalla (comprueba una a una las fichas y tarda).
 */
export default function InvitarPortalLote() {
  const [censo, setCenso] = useState<Censo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [revisado, setRevisado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoLote | null>(null)

  async function preparar() {
    setCargando(true)
    setError(null)
    setResultado(null)
    setRevisado(false)
    try {
      const res = await fetch('/api/correduria/portal-invitaciones', { cache: 'no-store' })
      const r = interpretarCenso(res.status, await res.json().catch(() => null))
      if (r.ok) setCenso(r.censo)
      else {
        setCenso(null)
        setError(r.motivo)
      }
    } catch {
      setError('No se ha podido hablar con plataforma. Vuelve a intentarlo.')
    } finally {
      setCargando(false)
    }
  }

  async function enviar() {
    if (!censo || !revisado) return
    setEnviando(true)
    try {
      const res = await fetch('/api/correduria/portal-invitaciones', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clienteIds: censo.destinatarios.map((d) => d.clienteId) }),
      })
      setResultado(interpretarLote(res.status, await res.json().catch(() => null)))
    } catch {
      setResultado(interpretarLote(502, { motivo: 'red' }))
    } finally {
      setEnviando(false)
      setCenso(null)
      setRevisado(false)
    }
  }

  const n = censo?.destinatarios.length ?? 0
  const enEsteLote = Math.min(n, censo?.maxPorLote ?? 0)

  return (
    <Bloque
      titulo="Invitar al portal"
      sub="Un correo a cada cliente en vigor que aún no entra. Sin llave dentro: entra él pidiendo un código a su correo."
      Icono={Mail}
    >
      {resultado && <Resultado r={resultado} />}

      {!censo && (
        <button type="button" style={btnStyle('secundario')} onClick={preparar} disabled={cargando}>
          {cargando ? 'Comprobando fichas…' : 'Preparar la lista'}
        </button>
      )}
      {error && <p style={{ color: 'var(--negative)', margin: '10px 0 0' }}>{error}</p>}

      {censo && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14 }}>
          <p style={{ margin: 0 }}>
            De <b>{censo.total}</b> clientes en vigor, se invitaría a <b>{n}</b>.
            {n > censo.maxPorLote && ` Van ${censo.maxPorLote} por tanda; el resto, en la siguiente.`}
          </p>

          {censo.fuera.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--muted)', fontSize: 14 }}>
              {censo.fuera.map((f) => (
                <li key={f.motivo}>
                  {f.n} {f.etiqueta}
                </li>
              ))}
            </ul>
          )}

          {n > 0 && (
            <details>
              <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>
                Ver los {n} nombres
              </summary>
              <ol style={{ margin: '6px 0 0', paddingLeft: 22, fontSize: 14, columns: '14rem', columnGap: 24 }}>
                {censo.destinatarios.map((d) => (
                  <li key={d.clienteId}>{d.nombre ?? '(ficha sin nombre legible)'}</li>
                ))}
              </ol>
            </details>
          )}

          {censo.muestra ? (
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--surface)' }}>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Asunto</div>
              <div style={{ fontWeight: 600, marginBottom: 8, overflowWrap: 'anywhere' }}>{censo.muestra.asunto}</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'inherit', fontSize: 14 }}>
                {censo.muestra.texto}
              </pre>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                Cada correo lleva el nombre de su cliente en el saludo.
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--negative)', margin: 0 }}>
              asegura no tiene configurada la dirección del portal (ASEGURA_PORTAL_URL): el correo no tendría a dónde llevar, así
              que no se ofrece enviar.
            </p>
          )}

          {n > 0 && censo.muestra && (
            <>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44, cursor: 'pointer' }}>
                <input type="checkbox" checked={revisado} onChange={(e) => setRevisado(e.target.checked)} style={{ width: 20, height: 20 }} />
                He revisado la lista y el texto
              </label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" style={btnStyle('primario')} onClick={enviar} disabled={!revisado || enviando}>
                  {enviando ? 'Enviando…' : `Enviar ${enEsteLote} invitaciones`}
                </button>
                <button type="button" style={btnStyle('sutil')} onClick={() => setCenso(null)} disabled={enviando}>
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </Bloque>
  )
}

function Resultado({ r }: { r: ResultadoLote }) {
  if (r.estado !== 'hecho') {
    return <p style={{ color: r.estado === 'error' ? 'var(--negative)' : 'var(--warning)', margin: '0 0 12px' }}>{r.motivo}</p>
  }
  return (
    <div style={{ margin: '0 0 12px' }}>
      <p style={{ margin: 0 }}>
        ✅ <b>{r.enviados}</b> invitaciones enviadas.
        {r.descartados > 0 && ` ${r.descartados} ya no tocaban (han entrado o se les invitó mientras tanto).`}
        {r.sinIntentar > 0 && ` Quedan ${r.sinIntentar} para otra tanda.`}
      </p>
      {r.parado && (
        <p style={{ color: 'var(--negative)', margin: '6px 0 0' }}>
          Se paró el envío: {r.parado === 'sin_correo_configurado' ? 'asegura no tiene proveedor de correo configurado' : 'no hay portal configurado'}. Reintentar no lo arregla: es una variable de Vercel.
        </p>
      )}
      {r.fallidos.length > 0 && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--warning)' }}>{r.fallidos.length} no se pudieron enviar</summary>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 14 }}>
            {r.fallidos.map((f) => (
              <li key={f.clienteId}>
                <a href={`/correduria/cliente/${f.clienteId}`}>ficha</a>: {f.motivo}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
