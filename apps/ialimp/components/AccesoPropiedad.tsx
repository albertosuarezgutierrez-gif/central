'use client'
import { useState } from 'react'
import { photoSrc } from '@/lib/photo'

const C = {
  primary: 'var(--brand-primary)', brand: 'var(--brand-secondary)', light: 'var(--brand-light)',
  bg: '#f1f5f9', text: '#1e293b', muted: '#64748b', border: '#e2e8f0',
  ok: '#16a34a', okBg: '#f0fdf4', warn: '#d97706', warnBg: '#fffbeb',
  red: '#dc2626', redBg: '#fef2f2',
}

const TIPOS_ACCESO = [
  { id: 'llave',       label: '🔑 Llave física',   desc: 'Se entrega la llave directamente' },
  { id: 'caja_llaves', label: '📦 Caja de llaves',  desc: 'Caja con código en la fachada o portal' },
  { id: 'codigo',      label: '🔢 Código / PIN',     desc: 'Cerradura electrónica con código' },
  { id: 'smartlock',   label: '📱 Smartlock / App',  desc: 'Apertura por app o código QR' },
  { id: 'portero',     label: '🏢 Portero / Conserje', desc: 'El portero entrega las llaves' },
  { id: 'otro',        label: '🔓 Otro',             desc: 'Método de acceso específico' },
]

function FileIcon({ tipo }: { tipo: string }) {
  if (tipo.startsWith('image/')) return <span style={{ fontSize: 28 }}>🖼️</span>
  if (tipo === 'application/pdf') return <span style={{ fontSize: 28 }}>📄</span>
  if (tipo.startsWith('video/')) return <span style={{ fontSize: 28 }}>🎥</span>
  return <span style={{ fontSize: 28 }}>📎</span>
}

function formatBytes(b: number) {
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB'
  return (b / (1024 * 1024)).toFixed(1) + ' MB'
}

interface Archivo {
  url: string; nombre: string; tipo: string; tamano: number; subido_at: string
}

interface Props {
  propiedadId: string
  propiedadNombre: string
  token: string
  instruccionesIniciales?: string
  tipoAccesoInicial?: string
  codigoAccesoInicial?: string
  archivosIniciales?: Archivo[]
  soloLectura?: boolean  // true en la vista de la limpiadora
}

export default function AccesoPropiedad({
  propiedadId, propiedadNombre, token,
  instruccionesIniciales = '', tipoAccesoInicial = 'llave',
  codigoAccesoInicial = '', archivosIniciales = [],
  soloLectura = false
}: Props) {
  const [instrucciones, setInstrucciones] = useState(instruccionesIniciales)
  const [tipoAcceso, setTipoAcceso]       = useState(tipoAccesoInicial || 'llave')
  const [codigoAcceso, setCodigoAcceso]   = useState(codigoAccesoInicial || '')
  const [archivos, setArchivos]           = useState<Archivo[]>(archivosIniciales)
  const [editando, setEditando]           = useState(false)
  const [guardando, setGuardando]         = useState(false)
  const [subiendo, setSubiendo]           = useState(false)
  const [guardado, setGuardado]           = useState(false)
  const [error, setError]                 = useState('')
  const [vistaArchivo, setVistaArchivo]   = useState<Archivo | null>(null)

  const tipoConfig = TIPOS_ACCESO.find(t => t.id === tipoAcceso) || TIPOS_ACCESO[0]
  const tieneInfo  = instrucciones.trim() || codigoAcceso.trim() || archivos.length > 0

  async function guardar() {
    setGuardando(true); setError('')
    try {
      const r = await fetch(`/api/propietario/${token}/acceso`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propiedad_id: propiedadId, instrucciones_acceso: instrucciones, tipo_acceso: tipoAcceso, codigo_acceso: codigoAcceso })
      })
      const d = await r.json()
      if (!d.ok) { setError(d.error || 'Error al guardar'); return }
      setEditando(false); setGuardado(true)
      setTimeout(() => setGuardado(false), 3000)
    } catch { setError('Error de conexión') }
    setGuardando(false)
  }

  async function subirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSubiendo(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('propiedad_id', propiedadId)
      fd.append('accion', 'add')
      const r = await fetch(`/api/propietario/${token}/acceso`, { method: 'POST', body: fd })
      const d = await r.json()
      if (d.ok) setArchivos(d.archivos || [])
      else setError(d.error || 'Error al subir')
    } catch { setError('Error al subir el archivo') }
    setSubiendo(false)
    e.target.value = ''
  }

  async function eliminarArchivo(archivo: Archivo) {
    if (!confirm(`¿Eliminar "${archivo.nombre}"?`)) return
    const fd = new FormData()
    fd.append('propiedad_id', propiedadId)
    fd.append('accion', 'remove')
    fd.append('url', archivo.url)
    const r = await fetch(`/api/propietario/${token}/acceso`, { method: 'POST', body: fd })
    const d = await r.json()
    if (d.ok) setArchivos(d.archivos || [])
  }

  // ── VISTA DE LA LIMPIADORA (solo lectura) ────────────────────────
  if (soloLectura) {
    if (!tieneInfo) return null
    return (
      <div style={{ background: '#fffbeb', border: `1px solid #fcd34d`, borderLeft: `4px solid ${C.warn}`, borderRadius: 12, padding: '14px 16px', margin: '0 0 12px' }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: C.warn, marginBottom: 8 }}>
          🔑 Instrucciones de acceso
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: instrucciones || codigoAcceso ? 10 : 0 }}>
          <span style={{ fontSize: 18 }}>{tipoConfig.label.split(' ')[0]}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{tipoConfig.label.slice(tipoConfig.label.indexOf(' ') + 1)}</span>
        </div>
        {codigoAcceso && (
          <div style={{ background: 'white', borderRadius: 8, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>🔢</span>
            <div>
              <div style={{ fontSize: 11, color: C.muted }}>Código de acceso</div>
              <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: '0.12em', color: C.primary }}>{codigoAcceso}</div>
            </div>
          </div>
        )}
        {instrucciones && (
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{instrucciones}</div>
        )}
        {archivos.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Archivos adjuntos</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {archivos.map((a, i) => (
                <a key={i} href={a.url} target="_blank" rel="noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'white', borderRadius: 8, padding: '8px 12px', textDecoration: 'none', border: `1px solid ${C.border}` }}>
                  <FileIcon tipo={a.tipo} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nombre}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{formatBytes(a.tamano)} · Toca para abrir</div>
                  </div>
                  <span style={{ fontSize: 16, color: C.primary }}>↗</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── VISTA DEL PROPIETARIO (editable) ────────────────────────────
  return (
    <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden', marginBottom: 16 }}>
      {/* Header */}
      <div style={{ background: tieneInfo ? C.light : C.bg, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>{propiedadNombre}</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            🔑 {tieneInfo ? `${tipoConfig.label} · ${archivos.length > 0 ? archivos.length + ' archivo(s)' : 'sin archivos'}` : 'Sin instrucciones de acceso todavía'}
          </div>
        </div>
        {!editando && (
          <button onClick={() => setEditando(true)}
            style={{ background: C.primary, color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {tieneInfo ? '✏️ Editar' : '+ Añadir'}
          </button>
        )}
        {guardado && <span style={{ fontSize: 13, color: C.ok, fontWeight: 700 }}>✅ Guardado</span>}
      </div>

      {/* Preview modo no edición */}
      {!editando && tieneInfo && (
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}` }}>
          {codigoAcceso && (
            <div style={{ background: C.light, borderRadius: 10, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>🔢</span>
              <div>
                <div style={{ fontSize: 11, color: C.muted }}>Código de acceso</div>
                <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '0.12em', color: C.primary }}>{codigoAcceso}</div>
              </div>
            </div>
          )}
          {instrucciones && (
            <p style={{ fontSize: 13, color: C.text, lineHeight: 1.6, margin: '0 0 10px', whiteSpace: 'pre-wrap' }}>{instrucciones}</p>
          )}
          {archivos.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {archivos.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px' }}>
                  <FileIcon tipo={a.tipo} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nombre}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{formatBytes(a.tamano)}</div>
                  </div>
                  <a href={a.url} target="_blank" rel="noreferrer"
                    style={{ fontSize: 13, color: C.primary, fontWeight: 600, textDecoration: 'none' }}>Ver →</a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Formulario edición */}
      {editando && (
        <div style={{ padding: '16px' }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: C.primary, marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
            ✏️ Editando acceso: {propiedadNombre}
          </div>
          {error && (
            <div style={{ background: C.redBg, border: `1px solid #fca5a5`, borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: C.red }}>{error}</div>
          )}

          {/* Tipo de acceso */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Tipo de acceso
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {TIPOS_ACCESO.map(t => (
                <button key={t.id} onClick={() => setTipoAcceso(t.id)}
                  style={{
                    padding: '10px 12px', borderRadius: 8, border: `2px solid ${tipoAcceso === t.id ? C.primary : C.border}`,
                    background: tipoAcceso === t.id ? C.light : 'white', cursor: 'pointer', textAlign: 'left',
                    fontFamily: 'inherit', transition: 'all 0.15s'
                  }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: tipoAcceso === t.id ? C.primary : C.text }}>{t.label}</div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Código si aplica */}
          {['caja_llaves', 'codigo', 'smartlock'].includes(tipoAcceso) && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Código de acceso
              </label>
              <input
                value={codigoAcceso}
                onChange={e => setCodigoAcceso(e.target.value)}
                placeholder="Ej: 1234, A#72B, 0000#"
                style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 22, fontWeight: 800, letterSpacing: '0.15em', fontFamily: 'monospace', boxSizing: 'border-box', color: C.primary }}
              />
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Solo la verá la empresa de limpieza</div>
            </div>
          )}

          {/* Instrucciones texto */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Instrucciones detalladas
            </label>
            <textarea
              value={instrucciones}
              onChange={e => setInstrucciones(e.target.value)}
              rows={5}
              placeholder="Ej: La caja de llaves está a la derecha de la puerta principal. El código es 1234#. Una vez dentro, las llaves del piso están colgadas en el perchero de la entrada..."
              style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5, boxSizing: 'border-box', color: C.text }}
            />
          </div>

          {/* Upload archivos */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Archivos adjuntos <span style={{ fontWeight: 400, textTransform: 'none' }}>(fotos, PDF, vídeos — máx 20MB c/u)</span>
            </label>

            {/* Archivos existentes */}
            {archivos.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {archivos.map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', background: C.bg }}>
                    <FileIcon tipo={a.tipo} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nombre}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>{formatBytes(a.tamano)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <a href={a.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: C.primary, fontWeight: 600, textDecoration: 'none' }}>Ver</a>
                      <button onClick={() => eliminarArchivo(a)}
                        style={{ background: 'none', border: 'none', color: C.red, fontSize: 16, cursor: 'pointer', padding: '0 4px' }}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Botón subir */}
            <label style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '14px', border: `2px dashed ${C.border}`, borderRadius: 10,
              cursor: subiendo ? 'wait' : 'pointer', background: C.bg, color: C.muted, fontSize: 13, fontWeight: 600
            }}>
              <input type="file" accept="image/*,.pdf,video/*" onChange={subirArchivo} style={{ display: 'none' }} disabled={subiendo} />
              {subiendo ? '⏳ Subiendo...' : '📎 Subir foto, PDF o vídeo'}
            </label>
          </div>

          {/* Botones guardar/cancelar */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setEditando(false); setError('') }}
              style={{ flex: 1, padding: '12px', background: 'white', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, color: C.muted, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
              Cancelar
            </button>
            <button onClick={guardar} disabled={guardando}
              style={{ flex: 2, padding: '12px', background: C.primary, border: 'none', borderRadius: 10, fontSize: 14, color: 'white', cursor: guardando ? 'wait' : 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>
              {guardando ? 'Guardando...' : '💾 Guardar instrucciones'}
            </button>
          </div>
        </div>
      )}

      {/* Modal vista archivo */}
      {vistaArchivo && (
        <div onClick={() => setVistaArchivo(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 12 }}>Toca para cerrar</div>
          {vistaArchivo.tipo.startsWith('image/') && (
            <img src={photoSrc(vistaArchivo.url)} alt={vistaArchivo.nombre} style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: 8 }} />
          )}
        </div>
      )}
    </div>
  )
}
