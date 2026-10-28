'use client'
import { useState } from 'react'
import Bloque from '../../Bloque'
import { ETIQUETA_AUTOR, LIMITE_PLEGADO, citasNoEncontradas, cuentaSustituidos, mensajesVisibles, plegarTexto, puedeEditar, type Mensaje } from '@/lib/correduria/siniestro-hilo'
import { btnStyle } from '@/components/ui'
import { COLUMNA, ERROR, NOTA } from './estilos'

const FONDO: Record<Mensaje['autor'], string> = {
  compania: 'var(--surface)', ia: 'var(--warning-bg)', corredor: 'transparent', interna: 'var(--warning-bg)',
}

function fechaHora(iso: string | null): string {
  if (!iso) return 'sin fecha'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
}

function Burbuja({ m, editado, sustituido, onCopiar, onEnviado, onEditar }: {
  m: Mensaje; editado: boolean; sustituido: boolean
  onCopiar: (t: string) => void; onEnviado: (t: string) => void; onEditar: (m: Mensaje) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const texto = m.texto ?? ''
  const { visible, plegado } = plegarTexto(texto, abierto)
  return (
    <li style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: FONDO[m.autor], borderLeft: `3px solid ${m.autor === 'compania' ? 'var(--text)' : 'var(--border)'}`, ...(sustituido ? { opacity: 0.55 } : {}) }}>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
        <strong style={{ color: 'var(--text)' }}>{ETIQUETA_AUTOR[m.autor]}</strong> · {m.tipo} · {fechaHora(m.creadoAt)}
        {editado && <> · <em style={{ fontStyle: 'normal' }}>editado</em></>}
        {sustituido && <> · versión anterior</>}
      </span>
      {m.textoIlegible
        ? <p role="alert" style={{ ...ERROR, margin: 0 }}>No se pudo descifrar este mensaje</p>
        : <p style={{ margin: 0, fontSize: 14, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{visible}</p>}
      {m.autor === 'ia' && citasNoEncontradas(m.meta).length > 0 && (
        <p role="alert" style={{ ...ERROR, margin: 0, fontWeight: 600 }}>
          ⚠ Citas que NO aparecen en la póliza: {citasNoEncontradas(m.meta).join(' · ')}. Compruébalas antes de usar este texto.
        </p>
      )}
      {plegado && <button type="button" onClick={() => setAbierto(true)} style={{ ...btnStyle('sutil', 'sm'), justifySelf: 'start' }}>Ver todo</button>}
      {abierto && texto.length > LIMITE_PLEGADO && <button type="button" onClick={() => setAbierto(false)} style={{ ...btnStyle('sutil', 'sm'), justifySelf: 'start' }}>Plegar</button>}
      {m.documentoId && <a href={`/api/correduria/documentos/${m.documentoId}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>📎 Adjunto</a>}
      {puedeEditar(m) && (
        <button type="button" onClick={() => onEditar(m)} style={{ ...btnStyle('sutil', 'sm'), justifySelf: 'start' }}>Editar</button>
      )}
      {m.autor === 'ia' && m.tipo === 'borrador' && m.texto !== null && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" onClick={() => onCopiar(texto)} style={btnStyle('secundario', 'sm')}>Copiar</button>
          <button type="button" onClick={() => onEnviado(texto)} style={btnStyle('secundario', 'sm')}>Marcar como enviado</button>
        </div>
      )}
    </li>
  )
}

export default function Hilo({ mensajes, onCopiar, onEnviado, onEditar }: {
  mensajes: Mensaje[] | null; onCopiar: (t: string) => void; onEnviado: (t: string) => void; onEditar: (m: Mensaje) => void
}) {
  const [todos, setTodos] = useState(false)
  const [verAnteriores, setVerAnteriores] = useState(false)
  const sustituidos = cuentaSustituidos(mensajes ?? [])
  const lista = mensajesVisibles(mensajes ?? [], verAnteriores)
  const MAX = 50
  const visibles = todos ? lista : lista.slice(-MAX)
  return (
    <Bloque titulo="Hilo con la compañía">
      {mensajes === null ? (
        <p style={ERROR}>No se pudo leer el hilo. No significa que no haya mensajes.</p>
      ) : lista.length === 0 ? (
        <p style={NOTA}>Sin mensajes todavía.</p>
      ) : (
        <>
          {sustituidos > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, fontSize: 14 }}>
              <input type="checkbox" checked={verAnteriores} onChange={e => setVerAnteriores(e.target.checked)} style={{ width: 20, height: 20 }} />
              Ver versiones anteriores ({sustituidos})
            </label>
          )}
          {lista.length > MAX && !todos && (
            <button type="button" onClick={() => setTodos(true)} style={{ ...btnStyle('sutil', 'sm'), marginBottom: 8 }}>Ver {lista.length - MAX} anteriores</button>
          )}
          <ul style={{ ...COLUMNA, listStyle: 'none', margin: 0, padding: 0 }}>
            {visibles.map(v => <Burbuja key={v.mensaje.id} m={v.mensaje} editado={v.editado} sustituido={v.sustituido} onCopiar={onCopiar} onEnviado={onEnviado} onEditar={onEditar} />)}
          </ul>
        </>
      )}
    </Bloque>
  )
}
