'use client'
import { useState } from 'react'
import {
  TIPOS_DOCUMENTO,
  etiquetaEstadoDocumento,
  etiquetaTipoDocumento,
  resumenDocumentos,
  revisarDocumento,
  type DocumentoResumen,
  type TipoDocumento,
} from '@central/module-seguros'

/**
 * Los documentos de un cliente / póliza / siniestro, con subida y «pedido».
 *
 * Tres estados de la lista y no dos: `inicial === null` es «no se ha podido
 * consultar» (asegura sin secreto, tabla caída) y se dice así — nunca como
 * «no tiene documentos». Y un documento «pedido» ES una fila: es lo que
 * distingue no habérselo pedido de que el cliente no lo mande.
 *
 * Los ficheros viven en `seguros.documentos` (asegura); esta pantalla habla con
 * `/api/correduria/documentos`, que reenvía al puerto con el secreto.
 */
export default function Documentos({
  clienteId,
  polizaId,
  siniestroId,
  inicial,
  sugeridos,
}: {
  clienteId?: string | null
  polizaId?: string | null
  siniestroId?: string | null
  inicial: DocumentoResumen[] | null
  /** Tipos que hacen falta (p. ej. para emitir): se ofrecen primero en «pedir». */
  sugeridos?: readonly TipoDocumento[]
}) {
  const [lista, setLista] = useState<DocumentoResumen[] | null>(inicial)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [tipo, setTipo] = useState<TipoDocumento>(sugeridos?.[0] ?? 'poliza')
  const [notas, setNotas] = useState('')
  const [fichero, setFichero] = useState<File | null>(null)

  const destino = { clienteId: clienteId ?? null, polizaId: polizaId ?? null, siniestroId: siniestroId ?? null }
  const resumen = resumenDocumentos(lista)

  async function subir() {
    if (!fichero) return setAviso('Elige un fichero.')
    const reparo = revisarDocumento({ type: fichero.type, size: fichero.size, name: fichero.name })
    if (reparo) return setAviso(reparo)
    setOcupado(true)
    setAviso(null)
    try {
      const form = new FormData()
      form.append('fichero', fichero)
      form.append('tipo', tipo)
      if (notas.trim()) form.append('notas', notas.trim())
      for (const [k, v] of Object.entries(destino)) if (v) form.append(k, v)
      const res = await fetch('/api/correduria/documentos', { method: 'POST', body: form })
      const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
      if (!res.ok || !j || j.estado !== 'ok') {
        setAviso(String(j?.error ?? j?.motivo ?? `error ${res.status}`))
        return
      }
      const d = j.documento as DocumentoResumen
      setLista((l) => [d, ...(l ?? [])])
      setAviso(j.repetido === true ? 'Guardado. Ojo: este cliente ya tenía un fichero idéntico.' : 'Guardado.')
      setFichero(null)
      setNotas('')
    } catch (e) {
      setAviso(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  async function pedir() {
    setOcupado(true)
    setAviso(null)
    try {
      const res = await fetch('/api/correduria/documentos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pedir: true, tipo, notas: notas.trim() || null, ...destino }),
      })
      const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
      if (!res.ok || !j || j.estado !== 'ok') return setAviso(String(j?.error ?? j?.motivo ?? `error ${res.status}`))
      setLista((l) => [j.documento as DocumentoResumen, ...(l ?? [])])
      setAviso('Anotado como pedido. Cuando llegue, súbelo y quedará como recibido.')
      setNotas('')
    } catch (e) {
      setAviso(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  async function revisar(id: string) {
    setOcupado(true)
    try {
      const res = await fetch(`/api/correduria/documentos/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'revisar' }),
      })
      if (!res.ok) return setAviso(`No se pudo marcar revisado (${res.status}).`)
      setLista((l) => (l ?? []).map((d) => (d.id === id ? { ...d, estado: 'revisado', revisadoEn: new Date().toISOString() } : d)))
    } finally {
      setOcupado(false)
    }
  }

  async function borrar(id: string) {
    if (!confirm('¿Borrar este documento? No se puede deshacer.')) return
    setOcupado(true)
    try {
      const res = await fetch(`/api/correduria/documentos/${id}`, { method: 'DELETE' })
      if (!res.ok) return setAviso(`No se pudo borrar (${res.status}).`)
      setLista((l) => (l ?? []).filter((d) => d.id !== id))
    } finally {
      setOcupado(false)
    }
  }

  const tipos: TipoDocumento[] = [...(sugeridos ?? []), ...TIPOS_DOCUMENTO.filter((t) => !sugeridos?.includes(t))]

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ fontSize: 13, color: resumen.estado === 'sin_consultar' ? '#c96' : 'var(--muted)' }}>
        {resumen.estado === 'sin_consultar' ? '❔ ' : ''}
        {resumen.titular}
      </div>

      {lista && lista.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {lista.map((d) => (
            <li
              key={d.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '8px 10px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                alignItems: 'center',
                fontSize: 13,
              }}
            >
              <span style={{ flex: '1 1 220px', minWidth: 0 }}>
                <strong>{etiquetaTipoDocumento(d.tipo)}</strong>
                {d.nombre ? <> · <span style={{ wordBreak: 'break-all' }}>{d.nombre}</span></> : null}
                {d.bytes ? <span style={{ color: 'var(--muted)' }}> · {(d.bytes / 1024).toFixed(0)} KB</span> : null}
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {etiquetaEstadoDocumento(d.estado)} · {new Date(d.creado).toLocaleDateString('es-ES')}
                  {d.notas ? ` · ${d.notas}` : ''}
                </div>
              </span>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {d.estado !== 'pedido' && (
                  <a href={`/api/correduria/documentos/${d.id}`} target="_blank" rel="noreferrer" style={btn}>
                    👁 Ver
                  </a>
                )}
                {d.estado === 'recibido' && (
                  <button type="button" onClick={() => revisar(d.id)} disabled={ocupado} style={btn}>
                    ✅ Revisado
                  </button>
                )}
                <button type="button" onClick={() => borrar(d.id)} disabled={ocupado} style={{ ...btn, color: '#c44' }}>
                  🗑
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <details>
        <summary style={{ cursor: 'pointer', fontSize: 13 }}>📎 Subir o pedir un documento</summary>
        <div style={{ display: 'grid', gap: 8, marginTop: 8, maxWidth: 520 }}>
          <label style={lbl}>
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDocumento)} style={inp}>
              {tipos.map((t) => (
                <option key={t} value={t}>
                  {etiquetaTipoDocumento(t)}
                </option>
              ))}
            </select>
          </label>
          <label style={lbl}>
            Fichero (PDF o foto, ≤ 10 MB)
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setFichero(e.target.files?.[0] ?? null)}
              style={inp}
            />
          </label>
          <label style={lbl}>
            Nota (opcional)
            <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="p. ej. «pedido por WhatsApp el 2/9»" style={inp} />
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={subir} disabled={ocupado || !fichero} style={{ ...btn, fontWeight: 600 }}>
              ⬆️ Guardar fichero
            </button>
            <button type="button" onClick={pedir} disabled={ocupado} style={btn}>
              ⏳ Anotar como pedido (sin fichero)
            </button>
          </div>
          {aviso && <div style={{ fontSize: 13, color: '#c96' }}>{aviso}</div>}
        </div>
      </details>
    </div>
  )
}

const btn: React.CSSProperties = {
  minHeight: 44,
  padding: '8px 12px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 13,
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
}
const lbl: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 13 }
const inp: React.CSSProperties = {
  minHeight: 44,
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'transparent',
  color: 'inherit',
  fontSize: 14,
}
