'use client'

// Alta MANUAL de una factura de huésped (p. ej. la pidió por Gmail): Alberto busca la reserva y
//  · genera el ENLACE del formulario para mandárselo al huésped (no se envía nada solo), o
//  · rellena él los datos fiscales → borrador + Telegram (igual que si los rellenara el huésped).
// Para CORREGIR un borrador se vuelven a enviar los datos de la misma reserva: sustituyen a los anteriores.
import { useState } from 'react'
import { eur } from '@/lib/dinero'
import { btnStyle, cardStyle } from '@/components/ui'
import DatosFiscalesForm, { type DatosFiscales, type RespuestaEnvio } from '@/components/factura/DatosFiscalesForm'

type Reserva = { reservationId: string; piso: string; huesped: string | null; desde: string | null; hasta: string | null; total: number | null; solicitud: string | null; factura: string | null }
const control: React.CSSProperties = { padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 16, minHeight: 44, background: 'var(--surface)', color: 'var(--text)', width: '100%', minWidth: 0, boxSizing: 'border-box' }
const fecha = (s: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—')

export default function AltaManual({ onHecho }: { onHecho: () => void }) {
  const [q, setQ] = useState('')
  const [reservas, setReservas] = useState<Reserva[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [elegida, setElegida] = useState<Reserva | null>(null)
  const [enlace, setEnlace] = useState<string | null>(null)
  const [rellenar, setRellenar] = useState(false)
  const [total, setTotal] = useState('')
  const [hecho, setHecho] = useState<string | null>(null)

  async function buscar(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setReservas(null)
    const r = await fetch(`/api/sivra/facturas/reservas?q=${encodeURIComponent(q)}`, { cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setError(j.error || `Error ${r.status}`); return }
    setReservas(j.reservas)
  }

  async function generarEnlace() {
    if (!elegida) return
    setError(null)
    const r = await fetch('/api/sivra/facturas/solicitud', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reservationId: elegida.reservationId }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setError(j.error || `Error ${r.status}`); return }
    setEnlace(j.url)
  }

  async function enviarDatos(d: DatosFiscales): Promise<RespuestaEnvio> {
    if (!elegida) return { ok: false, error: 'Elige una reserva' }
    const t = total.trim() ? Number(total.replace(/\./g, '').replace(',', '.')) : null
    if (t !== null && !(t > 0)) return { ok: false, error: 'Importe no válido' }
    const r = await fetch('/api/sivra/facturas/solicitud', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reservationId: elegida.reservationId, datos: d, total: t }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: j.error || `Error ${r.status}`, errores: j.errores }
    setHecho(j.propuesta === 'enviada' ? 'Borrador preparado y enviado a Telegram para tu ✅.' : 'Borrador preparado (el aviso de Telegram no ha salido: mira /telegram).')
    setRellenar(false)
    onHecho()
    return { ok: true }
  }

  return (
    <section style={{ ...cardStyle, marginBottom: 16 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>Nueva factura a mano</h2>
      <form onSubmit={buscar} style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
        <input style={control} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nº de reserva o nombre del huésped" aria-label="Buscar reserva" />
        <button type="submit" style={{ ...btnStyle('primario'), minHeight: 44 }}>Buscar</button>
      </form>
      {error && <p role="alert" style={{ color: 'var(--negative)' }}>{error}</p>}
      {reservas && reservas.length === 0 && <p style={{ color: 'var(--muted)' }}>Ninguna reserva de tus pisos coincide.</p>}
      {reservas && reservas.length > 0 && !elegida && (
        <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
          {reservas.map((r) => (
            <button key={r.reservationId} type="button" onClick={() => { setElegida(r); setEnlace(null); setHecho(null); setTotal('') }}
              style={{ ...btnStyle('sutil'), justifyContent: 'space-between', textAlign: 'left', minHeight: 44, flexWrap: 'wrap' }}>
              <span style={{ overflowWrap: 'anywhere' }}>{r.huesped ?? '—'} · {r.piso} · {fecha(r.desde)}→{fecha(r.hasta)} · {r.reservationId}</span>
              <span>{r.total === null ? '— sin importe' : eur(r.total)}{r.factura ? ` · factura ${r.factura}` : r.solicitud ? ` · solicitud ${r.solicitud}` : ''}</span>
            </button>
          ))}
        </div>
      )}
      {elegida && (
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <div style={{ overflowWrap: 'anywhere' }}>
            <strong>{elegida.huesped ?? '—'}</strong> · {elegida.piso} · reserva {elegida.reservationId} · {elegida.total === null ? 'importe desconocido' : `${eur(elegida.total)} (IVA incluido)`}
            <button type="button" onClick={() => { setElegida(null); setRellenar(false); setEnlace(null) }} style={{ ...btnStyle('sutil', 'sm'), marginLeft: 8, minHeight: 44 }}>Cambiar</button>
          </div>
          {elegida.factura && elegida.factura !== 'borrador'
            ? <p style={{ color: 'var(--muted)' }}>Esta reserva ya tiene la factura emitida. Una corrección será una rectificativa (aún no disponible).</p>
            : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={generarEnlace} style={{ ...btnStyle('secundario'), minHeight: 44 }}>Generar enlace para el huésped</button>
                <button type="button" onClick={() => setRellenar((v) => !v)} style={{ ...btnStyle('secundario'), minHeight: 44 }}>{rellenar ? 'Cerrar' : 'Rellenar yo los datos'}</button>
              </div>
            )}
          {enlace && (
            <div style={{ display: 'grid', gap: 6 }}>
              <input readOnly style={control} value={enlace} onFocus={(e) => e.currentTarget.select()} aria-label="Enlace del formulario" />
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Cópialo y mándaselo tú (no se envía nada automáticamente).</span>
            </div>
          )}
          {rellenar && (
            <div style={{ display: 'grid', gap: 12 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 600 }}>
                Total a facturar con IVA incluido (vacío = el de la reserva{elegida.total !== null ? `: ${eur(elegida.total)}` : ', que no consta'})
                <input style={control} inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder={elegida.total !== null ? String(elegida.total).replace('.', ',') : 'p. ej. 363,00'} />
              </label>
              <DatosFiscalesForm
                bilingue={false}
                urlCp={(cp) => `/api/correduria/codigo-postal?cp=${encodeURIComponent(cp)}`}
                urlVias={(provincia, municipio, q2) => `/api/correduria/catastro/vias?${new URLSearchParams({ provincia, municipio, q: q2 })}`}
                onEnviar={enviarDatos}
                textoBoton="Preparar borrador y mandarlo a Telegram"
              />
            </div>
          )}
          {hecho && <p role="status">{hecho}</p>}
        </div>
      )}
    </section>
  )
}
