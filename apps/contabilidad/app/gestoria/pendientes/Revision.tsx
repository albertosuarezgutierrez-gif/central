'use client'
import { useState } from 'react'
import { enviar } from '../../_enviar'

type Comentario = { id: string; rol: 'dueno' | 'gestor'; autor: string; texto: string; creadoEn: string }
type Objeto = { tipo: 'asiento' | 'factura_recibida'; id: string }

/** Marcar como revisado + hilo de comentarios del objeto (se carga al abrirlo). Botones ≥ 44 px, sin tablas anchas. */
export function Revision({ objeto, comentarios }: { objeto: Objeto; comentarios: number }) {
  const [hilo, setHilo] = useState<Comentario[] | null>(null)
  const [n, setN] = useState(comentarios)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [hecho, setHecho] = useState(false)
  const clave = objeto.tipo === 'asiento' ? 'asientoId' : 'facturaId'

  async function cargar() {
    const r = await fetch(`/api/gestoria/comentarios?${clave}=${objeto.id}`).catch(() => null)
    if (!r || !r.ok) { setMsg({ ok: false, texto: 'No se pudo cargar el hilo.' }); return }
    setHilo(((await r.json()) as { comentarios: Comentario[] }).comentarios)
  }
  async function revisar() {
    const r = await enviar('/api/gestoria/revisiones', objeto)
    if (!r.ok) { setMsg({ ok: false, texto: r.errores.join(' · ') }); return }
    setHecho(true); setMsg({ ok: true, texto: 'Marcado como revisado.' })
  }
  async function comentar(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const form = ev.currentTarget
    const texto = String(new FormData(form).get('texto') ?? '')
    const r = await enviar('/api/gestoria/comentarios', { [clave]: objeto.id, texto })
    if (!r.ok) { setMsg({ ok: false, texto: r.errores.join(' · ') }); return }
    form.reset(); setN((x) => x + 1); setMsg(null); await cargar()
  }
  return (
    <div>
      <div className="fila">
        <button type="button" className="btn" onClick={revisar} disabled={hecho}>{hecho ? 'Revisado' : 'Marcar revisado'}</button>
        <details onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open && hilo === null) void cargar() }}>
          <summary className="btn btn-sec">Comentarios ({n})</summary>
          <div style={{ marginTop: 8 }}>
            {hilo === null ? <p className="tenue">Cargando…</p> : hilo.length === 0 ? <p className="tenue">Sin comentarios todavía.</p> : (
              <ul className="lista-simple">
                {hilo.map((c) => <li key={c.id}><strong>{c.autor}</strong> <span className="tenue">({c.rol === 'gestor' ? 'gestoría' : 'dueño'} · {new Date(c.creadoEn).toLocaleString('es-ES')})</span><br />{c.texto}</li>)}
              </ul>
            )}
            <form className="formulario" onSubmit={comentar}>
              <label className="campo">Nuevo comentario<textarea name="texto" rows={3} maxLength={2000} required style={{ width: '100%', boxSizing: 'border-box' }} /></label>
              <button type="submit" className="btn btn-sec">Añadir comentario</button>
            </form>
          </div>
        </details>
      </div>
      {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.texto}</p>}
    </div>
  )
}
