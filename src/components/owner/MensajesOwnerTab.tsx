'use client'
// MensajesOwnerTab — auditoría de mensajes entre roles
// Retención: 5 días · Descarga PDF del rango seleccionado
// Mayo 2026

import { useState, useEffect, useCallback, useRef } from 'react'

const C = {
  bg:    '#14110E',
  bg1:   '#1C1814',
  bg2:   '#231F1A',
  ink:   '#F6F1E7',
  ink2:  '#D8CDB6',
  ink3:  '#9A8E82',
  ink4:  '#6B5F52',
  verm:  '#D9442B',
  vermD: '#A8311E',
  amber: '#E8A33B',
  green: '#3F7D44',
  rule:  '#2E2820',
}
const SN = 'Inter Tight, sans-serif'
const SE = 'Newsreader, Georgia, serif'
const SM = 'JetBrains Mono, monospace'

type Msg = {
  id: string
  camarero_id: string | null
  rol_origen: string
  nombre_origen: string
  rol_destino: string
  destinatario_id: string | null
  tipo: string
  texto: string
  mesa_ref: string | null
  leido_por: string[]
  created_at: string
}

function rolColor(r: string) {
  if (r === 'cocina')    return '#4FC3F7'
  if (r === 'camarero')  return C.green
  if (r === 'jefe_sala') return C.amber
  if (r === 'running')   return '#CE93D8'
  return C.ink3
}
function rolLabel(r: string) {
  if (r === 'cocina')    return 'Cocina'
  if (r === 'camarero')  return 'Camarero'
  if (r === 'jefe_sala') return 'Jefe de sala'
  if (r === 'running')   return 'Running'
  if (r === 'todos')     return 'Todos'
  return r
}
function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function isoToInput(iso: string) {
  return iso.split('T')[0]
}
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return isoToInput(d.toISOString())
}

export default function MensajesOwnerTab({ sh }: { sh: () => Record<string, string> }) {
  const [mensajes, setMensajes] = useState<Msg[]>([])
  const [loading, setLoading]   = useState(false)
  const [desde, setDesde]       = useState(daysAgo(5))
  const [hasta, setHasta]       = useState(isoToInput(new Date().toISOString()))
  const [filtroRol, setFiltroRol] = useState<string>('todos')
  const [generandoPDF, setGenerandoPDF] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ desde, hasta })
      if (filtroRol !== 'todos') params.set('rol', filtroRol)
      const r = await fetch(`/api/owner/mensajes-auditoria?${params}`, { headers: sh() })
      if (!r.ok) return
      const d = await r.json()
      setMensajes(d.mensajes ?? [])
    } finally {
      setLoading(false)
    }
  }, [desde, hasta, filtroRol, sh])

  useEffect(() => { cargar() }, [cargar])

  // ── Generar PDF via ventana de impresión ─────────────────────────────────
  const descargarPDF = useCallback(async () => {
    if (mensajes.length === 0) return
    setGenerandoPDF(true)

    const restauranteNombre = document.title.replace(' — ia.rest', '') || 'Restaurante'

    const htmlRows = mensajes.map(m => {
      const leido = (m.leido_por ?? []).length > 1 ? '✓ Visto' : '— No visto'
      const leidoColor = (m.leido_por ?? []).length > 1 ? '#3F7D44' : '#9A8E82'
      return `
        <tr class="msg-row">
          <td class="td-time">${fmtDateTime(m.created_at)}</td>
          <td>
            <span class="rol-badge" style="color:${rolColor(m.rol_origen)}">${rolLabel(m.rol_origen)}</span>
            <span class="nombre">${m.nombre_origen}</span>
          </td>
          <td class="td-destino">${rolLabel(m.rol_destino)}</td>
          <td class="td-texto">${m.texto.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</td>
          <td class="td-leido" style="color:${leidoColor}">${leido}</td>
        </tr>`
    }).join('')

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Mensajes — ${fmtDate(desde)} al ${fmtDate(hasta)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,400;0,600;1,400&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter Tight', sans-serif; color: #1A1714; background: #fff; padding: 32px 40px; }
  .header { border-bottom: 2px solid #D9442B; padding-bottom: 20px; margin-bottom: 28px; }
  .logo { font-family: 'Newsreader', serif; font-size: 28px; font-style: italic; color: #D9442B; }
  .titulo { font-size: 13px; color: #6B5F52; margin-top: 4px; letter-spacing: 0.5px; text-transform: uppercase; }
  .meta { display: flex; gap: 32px; margin-top: 12px; }
  .meta-item { font-size: 12px; color: #3A332C; }
  .meta-item strong { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;
    color: #6B5F52; padding: 8px 10px; border-bottom: 1px solid #D8CDB6; text-align: left; }
  .msg-row td { padding: 10px 10px; border-bottom: 1px solid #EFE7D6; vertical-align: top; font-size: 12.5px; }
  .msg-row:last-child td { border-bottom: none; }
  .td-time { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #6B5F52; white-space: nowrap; width: 130px; }
  .rol-badge { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; display: block; }
  .nombre { font-size: 12px; color: #1A1714; }
  .td-destino { font-size: 11px; color: #6B5F52; white-space: nowrap; }
  .td-texto { font-family: 'Newsreader', serif; font-size: 13.5px; font-style: italic; color: #1A1714; line-height: 1.4; }
  .td-leido { font-size: 11px; font-weight: 600; white-space: nowrap; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #D8CDB6;
    font-size: 10px; color: #9A8E82; display: flex; justify-content: space-between; }
  .total { background: #F6F1E7; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px;
    font-size: 12px; color: #3A332C; display: flex; gap: 24px; }
  .total strong { font-weight: 700; }
  @media print {
    body { padding: 20px 24px; }
    @page { margin: 0; size: A4; }
  }
</style>
</head>
<body>
<div class="header">
  <div class="logo">ia.rest</div>
  <div class="titulo">Historial de mensajes entre roles</div>
  <div class="meta">
    <div class="meta-item"><strong>Período:</strong> ${fmtDate(desde + 'T00:00:00')} – ${fmtDate(hasta + 'T00:00:00')}</div>
    <div class="meta-item"><strong>Total mensajes:</strong> ${mensajes.length}</div>
    <div class="meta-item"><strong>Generado:</strong> ${fmtDateTime(new Date().toISOString())}</div>
  </div>
</div>
<div class="total">
  <span><strong>${mensajes.filter(m => m.rol_origen === 'camarero').length}</strong> de camarero</span>
  <span><strong>${mensajes.filter(m => m.rol_origen === 'cocina').length}</strong> de cocina</span>
  <span><strong>${mensajes.filter(m => m.rol_origen === 'jefe_sala').length}</strong> de jefe sala</span>
  <span><strong>${mensajes.filter(m => (m.leido_por ?? []).length > 1).length}</strong> vistos</span>
</div>
<table>
  <thead>
    <tr>
      <th>Fecha y hora</th>
      <th>Emisor</th>
      <th>Para</th>
      <th>Mensaje</th>
      <th>Estado</th>
    </tr>
  </thead>
  <tbody>
    ${htmlRows}
  </tbody>
</table>
<div class="footer">
  <span>ia.rest — www.iarest.es</span>
  <span>Retención: 5 días · Documento generado automáticamente</span>
</div>
</body>
</html>`

    const win = window.open('', '_blank', 'width=900,height=700')
    if (win) {
      win.document.write(html)
      win.document.close()
      setTimeout(() => { win.print(); setGenerandoPDF(false) }, 800)
    } else {
      setGenerandoPDF(false)
    }
  }, [mensajes, desde, hasta])

  // ── Agrupar mensajes por fecha para separadores ──────────────────────────
  const agrupados = mensajes.reduce<{ fecha: string; msgs: Msg[] }[]>((acc, m) => {
    const fecha = fmtDate(m.created_at)
    const last = acc[acc.length - 1]
    if (last && last.fecha === fecha) { last.msgs.push(m); return acc }
    acc.push({ fecha, msgs: [m] }); return acc
  }, [])

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* ── Filtros ── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end',
        marginBottom: 20, padding: '16px 20px',
        background: C.bg1, borderRadius: 12, border: `1px solid ${C.rule}`,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontFamily: SN, fontSize: 10, color: C.ink4, textTransform: 'uppercase', letterSpacing: 0.8 }}>Desde</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
            min={daysAgo(5)} max={hasta}
            style={{ fontFamily: SM, fontSize: 13, background: C.bg2, border: `1px solid ${C.rule}`,
              borderRadius: 8, padding: '7px 10px', color: C.ink, outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontFamily: SN, fontSize: 10, color: C.ink4, textTransform: 'uppercase', letterSpacing: 0.8 }}>Hasta</label>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
            min={desde} max={isoToInput(new Date().toISOString())}
            style={{ fontFamily: SM, fontSize: 13, background: C.bg2, border: `1px solid ${C.rule}`,
              borderRadius: 8, padding: '7px 10px', color: C.ink, outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontFamily: SN, fontSize: 10, color: C.ink4, textTransform: 'uppercase', letterSpacing: 0.8 }}>Rol</label>
          <select value={filtroRol} onChange={e => setFiltroRol(e.target.value)}
            style={{ fontFamily: SN, fontSize: 13, background: C.bg2, border: `1px solid ${C.rule}`,
              borderRadius: 8, padding: '7px 10px', color: C.ink, outline: 'none' }}>
            <option value="todos">Todos los roles</option>
            <option value="camarero">Camarero</option>
            <option value="cocina">Cocina</option>
            <option value="jefe_sala">Jefe de sala</option>
            <option value="running">Running</option>
          </select>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          {/* Contador */}
          {!loading && (
            <div style={{ fontFamily: SM, fontSize: 12, color: C.ink3, paddingBottom: 8 }}>
              {mensajes.length} mensaje{mensajes.length !== 1 ? 's' : ''}
            </div>
          )}
          {/* Botón PDF */}
          <button
            onClick={descargarPDF}
            disabled={mensajes.length === 0 || generandoPDF}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8,
              background: mensajes.length === 0 ? C.bg2 : C.verm,
              border: 'none', cursor: mensajes.length === 0 ? 'default' : 'pointer',
              fontFamily: SN, fontSize: 13, fontWeight: 600, color: '#fff',
              opacity: mensajes.length === 0 ? 0.4 : 1,
            }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            {generandoPDF ? 'Generando…' : 'Descargar PDF'}
          </button>
        </div>
      </div>

      {/* ── Nota retención ── */}
      <div style={{
        marginBottom: 16, padding: '8px 14px',
        background: `${C.amber}15`, border: `1px solid ${C.amber}40`,
        borderRadius: 8, fontFamily: SN, fontSize: 12, color: C.amber,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={C.amber} strokeWidth={2}>
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        Los mensajes se conservan 5 días. Descarga el PDF antes si necesitas guardarlos.
      </div>

      {/* ── Contenido ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, fontFamily: SE, fontStyle: 'italic', color: C.ink3 }}>
          Cargando mensajes…
        </div>
      ) : mensajes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 18, color: C.ink3 }}>
            Sin mensajes en este período
          </div>
          <div style={{ fontFamily: SN, fontSize: 12, color: C.ink4, marginTop: 6 }}>
            Recuerda que solo se guardan los últimos 5 días
          </div>
        </div>
      ) : (
        <div ref={listRef} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {agrupados.map(({ fecha, msgs }) => (
            <div key={fecha}>
              {/* Separador de fecha */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 12px',
              }}>
                <div style={{ flex: 1, height: 1, background: C.rule }} />
                <span style={{ fontFamily: SM, fontSize: 11, color: C.ink4, whiteSpace: 'nowrap' }}>
                  {fecha}
                </span>
                <div style={{ flex: 1, height: 1, background: C.rule }} />
              </div>

              {/* Mensajes del día */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {msgs.map(m => {
                  const visto = (m.leido_por ?? []).length > 1
                  return (
                    <div key={m.id} style={{
                      display: 'grid',
                      gridTemplateColumns: '110px 1fr 100px 80px',
                      gap: 12, alignItems: 'start',
                      padding: '10px 14px',
                      background: C.bg1,
                      borderRadius: 8,
                      border: `1px solid ${C.rule}`,
                      marginBottom: 4,
                    }}>
                      {/* Hora */}
                      <div style={{ fontFamily: SM, fontSize: 11, color: C.ink4, paddingTop: 2, whiteSpace: 'nowrap' }}>
                        {fmtTime(m.created_at)}
                        {m.mesa_ref && (
                          <div style={{ fontWeight: 700, color: C.ink3, marginTop: 2 }}>{m.mesa_ref}</div>
                        )}
                      </div>

                      {/* Mensaje */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{ fontFamily: SN, fontSize: 10, fontWeight: 700,
                            color: rolColor(m.rol_origen), textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            {rolLabel(m.rol_origen)}
                          </span>
                          <span style={{ fontFamily: SN, fontSize: 12, color: C.ink2 }}>{m.nombre_origen}</span>
                          <span style={{ fontFamily: SN, fontSize: 11, color: C.ink4 }}>→</span>
                          <span style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>{rolLabel(m.rol_destino)}</span>
                        </div>
                        <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 14,
                          color: C.ink, lineHeight: 1.4 }}>
                          &ldquo;{m.texto}&rdquo;
                        </div>
                      </div>

                      {/* Tipo */}
                      <div style={{
                        fontFamily: SN, fontSize: 10, color: C.ink4,
                        textTransform: 'uppercase', letterSpacing: 0.5, paddingTop: 2,
                      }}>
                        {m.tipo === 'alerta' ? (
                          <span style={{ color: C.amber }}>⚠ Alerta</span>
                        ) : m.tipo === 'sistema' ? (
                          <span style={{ color: C.ink4 }}>Sistema</span>
                        ) : 'Texto'}
                      </div>

                      {/* Estado leído */}
                      <div style={{
                        fontFamily: SN, fontSize: 11, fontWeight: 600,
                        color: visto ? C.green : C.ink4,
                        paddingTop: 2,
                      }}>
                        {visto ? '✓✓ Visto' : '✓ Enviado'}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
