'use client'
import { useState } from 'react'
import Bloque from '../../Bloque'
import { ETIQUETA_AUTOR, leerVeredicto, origenVolcado, type PartePortal, LIMITE_PLEGADO, citasNoEncontradas, cuentaSustituidos, mensajesVisibles, plegarTexto, puedeEditar, type Mensaje } from '@/lib/correduria/siniestro-hilo'
import { btnStyle } from '@/components/ui'
import { COLUMNA, ERROR, NOTA } from './estilos'
import VeredictoIa from './VeredictoIa'

const FONDO: Record<Mensaje['autor'], string> = {
  compania: 'var(--surface)', ia: 'var(--warning-bg)', corredor: 'transparent', interna: 'var(--warning-bg)',
}

function fechaHora(iso: string | null): string {
  if (!iso) return 'sin fecha'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
}

function Burbuja({ m, editado, sustituido, siniestroId, onCopiar, onEnviado, onEditar, onResponder, onValorado }: {
  m: Mensaje; editado: boolean; sustituido: boolean; siniestroId: string
  onResponder: (p: string) => void; onValorado: () => void
  onCopiar: (t: string) => void; onEnviado: (t: string) => void; onEditar: (m: Mensaje) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const texto = m.texto ?? ''
  const { visible, plegado } = plegarTexto(texto, abierto)
  const veredicto = m.autor === 'ia' && m.tipo === 'analisis' ? leerVeredicto(m.meta) : null
  const { emisor, fechaOriginal } = origenVolcado(m.meta)
  return (
    <li style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: FONDO[m.autor], borderLeft: `3px solid ${m.autor === 'compania' ? 'var(--text)' : 'var(--border)'}`, ...(sustituido ? { opacity: 0.55 } : {}) }}>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
        <strong style={{ color: 'var(--text)' }}>{ETIQUETA_AUTOR[m.autor]}</strong>{emisor ? ` · ${emisor}` : ''} · {m.tipo} · {fechaOriginal ? `${fechaHora(fechaOriginal)} (original)` : fechaHora(m.creadoAt)}
        {editado && <> · <em style={{ fontStyle: 'normal' }}>editado</em></>}
        {sustituido && <> · versión anterior</>}
      </span>
      {veredicto && !sustituido && <VeredictoIa v={veredicto} siniestroId={siniestroId} mensajeId={m.id} onResponder={onResponder} onValorado={onValorado} />}
      {m.textoIlegible
        ? <p role="alert" style={{ ...ERROR, margin: 0 }}>No se pudo descifrar este mensaje</p>
        : veredicto && !sustituido
          ? <details><summary style={{ ...NOTA, cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>Texto completo del análisis</summary><p style={{ margin: 0, fontSize: 14, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{texto}</p></details>
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

export default function Hilo({ siniestroId, mensajes, partesPortal, onCopiar, onEnviado, onEditar, onResponder, onValorado }: {
  siniestroId: string; partesPortal: PartePortal[] | null; onResponder: (p: string) => void; onValorado: () => void
  mensajes: Mensaje[] | null; onCopiar: (t: string) => void; onEnviado: (t: string) => void; onEditar: (m: Mensaje) => void
}) {
  const [todos, setTodos] = useState(false)
  const [verAnteriores, setVerAnteriores] = useState(false)
  const sustituidos = cuentaSustituidos(mensajes ?? [])
  const lista = mensajesVisibles(mensajes ?? [], verAnteriores)
  const MAX = 50
  const visibles = todos ? lista : lista.slice(-MAX)
  return (
    <>
    {partesPortal !== null && (
      <Bloque titulo="Partes del cliente" sub="Lo que el cliente ha comunicado desde su portal.">
        {partesPortal.length === 0 ? <p style={NOTA}>El cliente no ha comunicado nada desde el portal.</p> : (
          <ul style={{ ...COLUMNA, listStyle: 'none', margin: 0, padding: 0 }}>
            {partesPortal.map(p => (
              <li key={p.id} style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, overflowWrap: 'anywhere' }}>
                <span style={NOTA}>{p.fecha ? fechaHora(p.fecha) : 'sin fecha'}{p.documentos !== null ? ` · ${p.documentos} documento${p.documentos === 1 ? '' : 's'}` : ''}</span>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{p.descripcion ?? 'Sin descripción'}</p>
              </li>
            ))}
          </ul>
        )}
      </Bloque>
    )}
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
            {visibles.map(v => <Burbuja key={v.mensaje.id} m={v.mensaje} editado={v.editado} sustituido={v.sustituido} siniestroId={siniestroId} onCopiar={onCopiar} onEnviado={onEnviado} onEditar={onEditar} onResponder={onResponder} onValorado={onValorado} />)}
          </ul>
        </>
      )}
    </Bloque>
    </>
  )
}
