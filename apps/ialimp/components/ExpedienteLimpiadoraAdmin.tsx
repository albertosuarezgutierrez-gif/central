'use client'
// Gestión RR.HH. de la limpiadora desde el panel: expediente documental + generar nómina PDF
// + solicitar firma. Consume las rutas /api/admin/limpiadoras/[id]/expediente|nomina.
import { useState, useEffect, useCallback } from 'react'

const C = {
  primary: 'var(--brand-primary)', light: 'var(--brand-light)',
  bg: '#f1f5f9', text: '#1e293b', muted: '#64748b', border: '#e2e8f0',
  ok: '#16a34a', okBg: '#f0fdf4', warn: '#d97706', red: '#dc2626', redBg: '#fef2f2',
}

type Carpeta = { id: string; etiqueta: string }
type Doc = { id: string; carpeta: string; nombre: string; estado_firma: string; creada_at: string; url: string | null }

// Quincena por defecto (1ª: 1–15, 2ª: 16–fin de mes) del mes actual.
function quincenaActual() {
  const hoy = new Date(); const y = hoy.getFullYear(); const m = hoy.getMonth()
  const dd = hoy.getDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  if (dd <= 15) return { desde: `${y}-${pad(m + 1)}-01`, hasta: `${y}-${pad(m + 1)}-15` }
  const fin = new Date(y, m + 1, 0).getDate()
  return { desde: `${y}-${pad(m + 1)}-16`, hasta: `${y}-${pad(m + 1)}-${fin}` }
}

export default function ExpedienteLimpiadoraAdmin() {
  const [limpiadoras, setLimpiadoras] = useState<any[]>([])
  const [sel, setSel] = useState<string>('')
  const [carpetas, setCarpetas] = useState<Carpeta[]>([])
  const [docs, setDocs] = useState<Doc[]>([])
  const [carpeta, setCarpeta] = useState('contratos')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [rango, setRango] = useState(quincenaActual())
  const [busy, setBusy] = useState(false)

  const limpSel = limpiadoras.find(l => l.id === sel)

  useEffect(() => {
    fetch('/api/admin/limpiadoras').then(r => r.json()).then(d => {
      const act = (d.limpiadoras || []).filter((l: any) => l.activa)
      setLimpiadoras(act)
      if (act[0]) setSel(act[0].id)
    })
  }, [])

  const cargar = useCallback(async (id: string) => {
    if (!id) return
    setLoading(true); setErr(''); setMsg('')
    const r = await fetch(`/api/admin/limpiadoras/${id}/expediente`)
    if (r.ok) { const d = await r.json(); setDocs(d.documentos); setCarpetas(d.carpetas); if (d.carpetas[0]) setCarpeta(c => d.carpetas.some((x: Carpeta) => x.id === c) ? c : d.carpetas[0].id) }
    setLoading(false)
  }, [])
  useEffect(() => { if (sel) cargar(sel) }, [sel, cargar])

  async function subir(file: File) {
    setBusy(true); setErr(''); setMsg('')
    const fd = new FormData(); fd.set('carpeta', carpeta); fd.set('file', file)
    const r = await fetch(`/api/admin/limpiadoras/${sel}/expediente`, { method: 'POST', body: fd })
    if (r.ok) { setMsg('Documento subido'); await cargar(sel) } else setErr((await r.json()).error ?? 'Error al subir')
    setBusy(false)
  }
  async function generarNomina() {
    setBusy(true); setErr(''); setMsg('')
    const r = await fetch(`/api/admin/limpiadoras/${sel}/nomina`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rango),
    })
    if (r.ok) { setMsg('Nómina generada y enviada a firmar'); await cargar(sel) } else setErr((await r.json()).error ?? 'Error al generar')
    setBusy(false)
  }
  async function solicitarFirma(docId: string) {
    setBusy(true); setErr('')
    const r = await fetch(`/api/admin/limpiadoras/${sel}/expediente/${docId}`, { method: 'POST' })
    if (r.ok) { setMsg('Firma solicitada'); await cargar(sel) } else setErr((await r.json()).error ?? 'Error')
    setBusy(false)
  }
  async function borrar(docId: string) {
    if (!confirm('¿Borrar este documento?')) return
    setBusy(true); setErr('')
    const r = await fetch(`/api/admin/limpiadoras/${sel}/expediente/${docId}`, { method: 'DELETE' })
    if (r.ok) await cargar(sel); else setErr((await r.json()).error ?? 'Error')
    setBusy(false)
  }

  const etiqueta = (id: string) => carpetas.find(c => c.id === id)?.etiqueta ?? id
  const estadoChip = (e: string) =>
    e === 'firmado' ? { t: '✔ Firmado', bg: C.okBg, c: C.ok } :
    e === 'pendiente' ? { t: '✍ Pendiente de firma', bg: '#fffbeb', c: C.warn } :
    { t: 'Sin firma', bg: C.bg, c: C.muted }

  const inputStyle = { padding: '9px 12px', borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 14, color: C.text, outline: 'none', fontFamily: 'inherit' as const }

  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 4 }}>Expediente y nóminas</h2>
      <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>Sube documentos, genera la nómina en PDF y mándala a firmar. La limpiadora la firma desde su app con un código por email.</p>

      {limpiadoras.length === 0 && <div style={{ color: C.muted, fontSize: 14 }}>No hay limpiadoras activas.</div>}

      {limpiadoras.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
            <select value={sel} onChange={e => setSel(e.target.value)} style={{ ...inputStyle, minWidth: 200 }}>
              {limpiadoras.map(l => <option key={l.id} value={l.id}>{l.nombre}{!l.email ? ' (sin email)' : ''}</option>)}
            </select>
            {limpSel && !limpSel.email && (
              <span style={{ fontSize: 12, color: C.red, fontWeight: 700 }}>⚠️ Sin email: no podrá firmar hasta añadirlo en su ficha.</span>
            )}
          </div>

          {/* Generar nómina */}
          <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${C.border}`, padding: 16, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 10 }}>💶 Generar nómina (de los partes de trabajo)</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ fontSize: 12, color: C.muted }}>Desde <input type="date" value={rango.desde} onChange={e => setRango(r => ({ ...r, desde: e.target.value }))} style={inputStyle} /></label>
              <label style={{ fontSize: 12, color: C.muted }}>Hasta <input type="date" value={rango.hasta} onChange={e => setRango(r => ({ ...r, hasta: e.target.value }))} style={inputStyle} /></label>
              <button onClick={generarNomina} disabled={busy} style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: C.primary, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {busy ? '…' : 'Generar y enviar a firmar'}
              </button>
            </div>
          </div>

          {/* Subir documento */}
          <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${C.border}`, padding: 16, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 10 }}>📄 Subir documento</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={carpeta} onChange={e => setCarpeta(e.target.value)} style={inputStyle}>
                {carpetas.map(c => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
              </select>
              <input type="file" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) subir(f); e.currentTarget.value = '' }} style={{ fontSize: 13 }} />
            </div>
          </div>

          {msg && <div style={{ background: C.okBg, color: C.ok, borderRadius: 10, padding: '8px 12px', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{msg}</div>}
          {err && <div style={{ background: C.redBg, color: C.red, borderRadius: 10, padding: '8px 12px', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>⚠️ {err}</div>}

          {/* Lista de documentos */}
          {loading && <div style={{ color: C.muted, padding: '16px 0' }}>Cargando…</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!loading && docs.length === 0 && <div style={{ color: C.muted, fontSize: 14, padding: '16px 0' }}>Sin documentos todavía.</div>}
            {docs.map(d => {
              const chip = estadoChip(d.estado_firma)
              return (
                <div key={d.id} style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {d.url ? <a href={d.url} target="_blank" rel="noreferrer" style={{ fontWeight: 700, fontSize: 14, color: C.text, textDecoration: 'none' }}>{d.nombre}</a> : <span style={{ fontWeight: 700, fontSize: 14 }}>{d.nombre}</span>}
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{etiqueta(d.carpeta)} · {new Date(d.creada_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: chip.bg, color: chip.c, whiteSpace: 'nowrap' }}>{chip.t}</span>
                  {d.estado_firma === 'sin_firma' && (
                    <button onClick={() => solicitarFirma(d.id)} disabled={busy} style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.light, color: C.primary, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Pedir firma</button>
                  )}
                  <button onClick={() => borrar(d.id)} disabled={busy} title="Borrar" style={{ padding: '6px 9px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'white', color: C.red, fontSize: 12, cursor: 'pointer' }}>🗑</button>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
