'use client'
import { useCallback, useEffect, useState } from 'react'
import { normalizarConfigAcceso, type ConfigAcceso } from '@/lib/domotica/tipo'

type DP = { code: string; value: unknown }
type LogRow = { accion: string; reserva_ref: string | null; detalle: Record<string, unknown> | null; created_at: string }
type PinRow = {
  reserva_ref: string; property_id: string | null; pin: string | null; modo: string | null;
  valido_desde: string; valido_hasta: string; estado: string; entregado: boolean;
}
type Disp = {
  id: string; nombre: string; tuya_device_id: string; piso: string | null;
  smoobu_apartment_id: number | null; config: Record<string, unknown>; activo: boolean;
  categoria: string | null; tipo?: 'ventilador' | 'acceso' | 'otro';
  estado: DP[] | null; errorEstado: string | null; log: LogRow[]; pins?: PinRow[];
}

const VENTILADOR_CODES = ['switch_fan', 'fan_switch', 'switch']
const LUZ_CODES = ['switch_led', 'switch_light', 'light']

const dp = (estado: DP[] | null, codes: string[]) =>
  estado?.find(s => codes.includes(s.code))?.value

const btn: React.CSSProperties = {
  minHeight: 44, padding: '0 16px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontSize: 14,
}

export default function DomoticaClient() {
  const [dispositivos, setDispositivos] = useState<Disp[] | null>(null)
  const [apartamentos, setApartamentos] = useState<{ id: number; name: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    setError(null)
    const r = await fetch('/api/sivra/domotica/dispositivos').then(x => x.json()).catch(() => null)
    if (!r || r.error) { setError(r?.error || 'Error cargando dispositivos'); setDispositivos([]); return }
    setDispositivos(r.dispositivos)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function descubrir() {
    setOcupado(true); setError(null)
    const r = await fetch('/api/sivra/domotica/descubrir', { method: 'POST' }).then(x => x.json()).catch(() => null)
    if (!r || r.error) setError(r?.error || 'Error buscando dispositivos')
    else setApartamentos(r.apartamentos || [])
    await cargar(); setOcupado(false)
  }

  async function comando(id: string, accion: string, valor?: unknown) {
    setOcupado(true); setError(null)
    const r = await fetch('/api/sivra/domotica/comando', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dispositivoId: id, accion, valor }),
    }).then(x => x.json()).catch(() => null)
    if (!r || r.error) setError(r?.error || 'Error enviando el comando')
    await cargar(); setOcupado(false)
  }

  async function guardarConfig(id: string, patch: Record<string, unknown>) {
    setOcupado(true)
    await fetch(`/api/sivra/domotica/dispositivos/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    }).catch(() => null)
    await cargar(); setOcupado(false)
  }

  return (
    <div style={{ padding: '16px 24px', maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: 0, letterSpacing: '-0.02em' }}>Domótica</h1>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, marginBottom: 0 }}>
            Ventiladores y dispositivos Tuya de los pisos
          </p>
        </div>
        <button onClick={descubrir} disabled={ocupado} style={btn}>🔍 Buscar dispositivos</button>
      </div>

      {error && (
        <div style={{
          borderRadius: 8, border: '1px solid var(--border)', borderLeft: '3px solid #ef4444',
          background: 'var(--surface)', color: 'var(--text)', padding: 12, fontSize: 13,
        }}>{error}</div>
      )}
      {dispositivos === null && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Cargando…</p>}
      {dispositivos?.length === 0 && !error && (
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          Sin dispositivos. Configura <code>TUYA_CLIENT_ID/SECRET</code> en Vercel, vincula la cuenta de
          Smart Life en platform.tuya.com y pulsa «Buscar dispositivos». Guía: <code>docs/DOMOTICA-TUYA.md</code>.
        </p>
      )}

      {dispositivos?.map(d => {
        if (d.tipo === 'acceso') {
          return <TarjetaAcceso key={d.id} d={d} apartamentos={apartamentos} ocupado={ocupado} setOcupado={setOcupado} setError={setError} cargar={cargar} />
        }
        const on = dp(d.estado, VENTILADOR_CODES) === true
        const luz = dp(d.estado, LUZ_CODES) === true
        const cfg = { autoOn: true, umbralC: 30, ...d.config } as { autoOn: boolean; umbralC: number }
        return (
          <div key={d.id} style={{
            borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)',
            padding: 16, display: 'flex', flexDirection: 'column', gap: 12, opacity: ocupado ? 0.6 : 1,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{d.nombre}</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>
                  {d.errorEstado ? `⚠️ ${d.errorEstado}` : d.estado ? (on ? '🟢 Encendido' : '⚪ Apagado') : 'Sin estado'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <SelectorTipo tipo={d.tipo || 'ventilador'} disabled={ocupado}
                  onChange={v => guardarConfig(d.id, { config: { tipoManual: v } })} />
                <button onClick={cargar} disabled={ocupado} style={{ ...btn, padding: '0 12px' }} aria-label="Refrescar">↻</button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => comando(d.id, on ? 'off' : 'on')} disabled={ocupado}
                style={{ ...btn, flex: 1, minWidth: 140, fontWeight: 700 }}>
                {on ? 'Apagar' : 'Encender'}
              </button>
              <select aria-label="Velocidad" disabled={ocupado} defaultValue=""
                onChange={e => e.target.value && comando(d.id, 'velocidad', e.target.value)}
                style={{ ...btn, padding: '0 8px' }}>
                <option value="" disabled>Velocidad</option>
                {['1', '2', '3', '4', '5', '6'].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              <button onClick={() => comando(d.id, luz ? 'luz_off' : 'luz_on')} disabled={ocupado} style={btn}>
                💡 {luz ? 'Apagar luz' : 'Luz'}
              </button>
            </div>

            <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>
              ⚠️ Si alguien usa el mando físico, el estado mostrado puede quedar desactualizado
              (limitación del hardware; los comandos siguen funcionando).
            </p>

            <div style={{ borderRadius: 8, border: '1px solid var(--border)', padding: 12, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--text)' }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44 }}>
                <span>Auto: encender a las 15:00 del día de llegada si Sevilla &gt; {cfg.umbralC} °C</span>
                <input type="checkbox" checked={!!cfg.autoOn} style={{ width: 20, height: 20 }}
                  onChange={e => guardarConfig(d.id, { config: { autoOn: e.target.checked } })} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44 }}>
                <span>Umbral (°C)</span>
                <input type="number" defaultValue={cfg.umbralC} min={20} max={45}
                  style={{ width: 70, minHeight: 36, border: '1px solid var(--border)', borderRadius: 8, padding: '0 8px', textAlign: 'right', background: 'var(--surface)', color: 'var(--text)' }}
                  onBlur={e => guardarConfig(d.id, { config: { umbralC: Number(e.target.value) || 30 } })} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44 }}>
                <span>Piso (reservas Smoobu)</span>
                <select value={d.smoobu_apartment_id ?? ''}
                  style={{ ...btn, minHeight: 36, maxWidth: '55%', padding: '0 8px' }}
                  onChange={e => guardarConfig(d.id, { smoobuApartmentId: Number(e.target.value) || null })}>
                  <option value="">— sin vincular —</option>
                  {apartamentos.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  {d.smoobu_apartment_id != null && !apartamentos.some(a => a.id === d.smoobu_apartment_id) && (
                    <option value={d.smoobu_apartment_id}>#{d.smoobu_apartment_id}</option>
                  )}
                </select>
              </label>
              <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>
                A las 11:30 del día de check-out se manda apagar siempre (por si quedó encendido).
                {!d.smoobu_apartment_id && ' ⚠️ Sin piso vinculado la automatización NO corre — pulsa «Buscar dispositivos» y elige el apartamento.'}
              </p>
            </div>

            <details>
              <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text)', minHeight: 44, display: 'flex', alignItems: 'center' }}>
                Últimas acciones
              </summary>
              <ul style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {d.log.length === 0 && <li>Sin acciones todavía.</li>}
                {d.log.map((l, i) => (
                  <li key={i}>
                    {new Date(l.created_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    {' — '}{l.accion}
                    {l.reserva_ref ? ` (reserva ${l.reserva_ref})` : ''}
                    {l.detalle && typeof l.detalle.temp === 'number' ? ` · ${l.detalle.temp} °C` : ''}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )
      })}
    </div>
  )
}

type BloqueSonda = { clave: string; ok: boolean; datos: unknown; error: string | null }
type SondaAcceso = {
  spec: BloqueSonda; status: BloqueSonda; pins: BloqueSonda;
  tarjetas: BloqueSonda; accesos: BloqueSonda; codigoAbrir: string | null;
}

const inp: React.CSSProperties = {
  minHeight: 36, border: '1px solid var(--border)', borderRadius: 8, padding: '0 8px',
  background: 'var(--surface)', color: 'var(--text)', fontSize: 13,
}
const fila: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 40,
}
const fmtDT = (s: string) => new Date(s).toLocaleString('es-ES', {
  timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})

function TarjetaAcceso({ d, apartamentos, ocupado, setOcupado, setError, cargar }: {
  d: Disp; apartamentos: { id: number; name: string }[]; ocupado: boolean;
  setOcupado: (b: boolean) => void; setError: (s: string | null) => void; cargar: () => Promise<void>;
}) {
  const [sonda, setSonda] = useState<SondaAcceso | null>(null)
  const [cargandoSonda, setCargandoSonda] = useState(false)
  const [mDesde, setMDesde] = useState('')
  const [mHasta, setMHasta] = useState('')
  const [mPin, setMPin] = useState('')

  const cfg = normalizarConfigAcceso(d.config as Partial<ConfigAcceso>)
  const pins = (d.pins || []).filter(p => p.estado !== 'borrado')

  async function saveCfg(patch: Partial<ConfigAcceso>) {
    setOcupado(true); setError(null)
    await fetch(`/api/sivra/domotica/dispositivos/${d.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: patch }),
    }).catch(() => null)
    await cargar(); setOcupado(false)
  }

  async function sondear() {
    setCargandoSonda(true); setError(null)
    const r = await fetch(`/api/sivra/domotica/acceso/${d.id}`).then(x => x.json()).catch(() => null)
    if (!r || r.error) setError(r?.error || 'Error en la sonda')
    else setSonda(r.sonda)
    setCargandoSonda(false)
  }

  async function cambiarTipo(v: string) {
    setOcupado(true); setError(null)
    await fetch(`/api/sivra/domotica/dispositivos/${d.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: { tipoManual: v } }),
    }).catch(() => null)
    await cargar(); setOcupado(false)
  }

  async function abrir() {
    if (!confirm('¿Abrir la puerta ahora? (pulso momentáneo, se cierra sola)')) return
    setOcupado(true); setError(null)
    const r = await fetch(`/api/sivra/domotica/acceso/${d.id}/abrir`, { method: 'POST' })
      .then(x => x.json()).catch(() => null)
    if (!r || r.error) setError(r?.error || 'Error al abrir')
    await cargar(); setOcupado(false)
  }

  async function crearPinManual() {
    if (!mDesde || !mHasta) { setError('Indica desde y hasta'); return }
    setOcupado(true); setError(null)
    const r = await fetch(`/api/sivra/domotica/acceso/${d.id}/pin`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ desde: mDesde, hasta: mHasta, pin: mPin || undefined }),
    }).then(x => x.json()).catch(() => null)
    if (!r || r.error) setError(r?.error || 'Error creando el PIN')
    else { setMDesde(''); setMHasta(''); setMPin('') }
    await cargar(); setOcupado(false)
  }

  // Repone la ventana de un PIN cuando la reserva cambió de fechas o cambiaron los márgenes.
  // El código NO cambia (se recrea con el mismo), así que lo que el huésped ya tenga sigue valiendo.
  async function ajustarVentana(ref: string) {
    if (!confirm('¿Reponer la ventana de este PIN con las fechas y los márgenes de hoy?\n\nEl código NO cambia. Se retira de la cerradura y se vuelve a crear igual, así que hay unos segundos en los que no abre.')) return
    setError('')
    const r = await fetch(`/api/sivra/domotica/acceso/${d.id}/pin/${encodeURIComponent(ref)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}',
    }).then(x => x.json()).catch(() => null)
    if (!r || r.error) setError(r?.error || 'Error ajustando la ventana')
    else if (r.sinCambio) setError('La ventana ya era la correcta: no se ha tocado nada.')
  }

  async function borrarPinRow(ref: string) {
    if (!confirm('¿Borrar este PIN? Dejará de funcionar en la cerradura.')) return
    setOcupado(true); setError(null)
    const r = await fetch(`/api/sivra/domotica/acceso/${d.id}/pin/${encodeURIComponent(ref)}`, { method: 'DELETE' })
      .then(x => x.json()).catch(() => null)
    if (!r || r.error) setError(r?.error || 'Error borrando el PIN')
    await cargar(); setOcupado(false)
  }

  function toggleApt(id: number, on: boolean) {
    const ids = on ? [...new Set([...cfg.smoobuApartmentIds, id])] : cfg.smoobuApartmentIds.filter(x => x !== id)
    saveCfg({ smoobuApartmentIds: ids })
  }

  return (
    <div style={{
      borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)',
      padding: 16, display: 'flex', flexDirection: 'column', gap: 12, opacity: ocupado ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>🔐 {d.nombre}</h2>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>
            {d.errorEstado ? `⚠️ ${d.errorEstado}` : d.estado ? '🟢 Accesible' : '⚪ Sin estado (¿offline?)'}
            {d.categoria ? ` · ${d.categoria}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <SelectorTipo tipo={d.tipo || 'acceso'} disabled={ocupado} onChange={cambiarTipo} />
          <button onClick={sondear} disabled={cargandoSonda} style={{ ...btn, padding: '0 12px' }}>
            {cargandoSonda ? '…' : '🔍 Sonda'}
          </button>
          {cfg.botonAbrir && <button onClick={abrir} disabled={ocupado} style={{ ...btn, fontWeight: 700 }}>🚪 Abrir</button>}
        </div>
      </div>

      <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>
        PIN automático por reserva (caduca solo). «Abrir» da un pulso momentáneo (se cierra sola).
        «Sonda» es solo lectura.
      </p>

      {/* ── PIN activos ── */}
      <div style={{ borderRadius: 8, border: '1px solid var(--border)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--text)' }}>
        <strong style={{ fontSize: 13 }}>🔑 PIN por reserva</strong>
        {pins.length === 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Sin PIN todavía. Se crean solos con las reservas (o añade uno manual abajo).</span>}
        {pins.map(p => (
          <div key={p.reserva_ref} style={{ ...fila, flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 6 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 700 }}>
                {p.estado === 'error' ? '⚠️ error' : p.pin || '—'}
                <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)' }}>
                  {p.modo ? ` · ${p.modo}` : ''}{p.entregado ? ' · entregado ✅' : ''}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                {p.property_id ? `${p.property_id} · ` : ''}reserva {p.reserva_ref}
                <br />{fmtDT(p.valido_desde)} → {fmtDT(p.valido_hasta)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {p.estado === 'activo' && !String(p.reserva_ref).startsWith('manual:') && (
                <button onClick={() => ajustarVentana(p.reserva_ref)} disabled={ocupado}
                  title="Reponer la ventana con las fechas y los márgenes de hoy (el código no cambia)"
                  style={{ ...btn, padding: '0 10px', minHeight: 36 }}>🔄 ventana</button>
              )}
              <button onClick={() => borrarPinRow(p.reserva_ref)} disabled={ocupado} style={{ ...btn, padding: '0 10px', minHeight: 36 }}>🗑️</button>
            </div>
          </div>
        ))}
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text)', minHeight: 40, display: 'flex', alignItems: 'center' }}>➕ Añadir PIN manual</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <label style={fila}><span style={{ fontSize: 12 }}>Desde</span>
              <input type="datetime-local" value={mDesde} onChange={e => setMDesde(e.target.value)} style={{ ...inp, maxWidth: '60%' }} /></label>
            <label style={fila}><span style={{ fontSize: 12 }}>Hasta</span>
              <input type="datetime-local" value={mHasta} onChange={e => setMHasta(e.target.value)} style={{ ...inp, maxWidth: '60%' }} /></label>
            <label style={fila}><span style={{ fontSize: 12 }}>PIN (opcional)</span>
              <input value={mPin} onChange={e => setMPin(e.target.value.replace(/\D/g, ''))} placeholder="auto" inputMode="numeric" style={{ ...inp, maxWidth: 120, textAlign: 'right' }} /></label>
            <button onClick={crearPinManual} disabled={ocupado} style={{ ...btn, fontWeight: 700 }}>Crear PIN</button>
          </div>
        </details>
      </div>

      {/* ── Configuración (todo editable) ── */}
      <details>
        <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text)', minHeight: 44, display: 'flex', alignItems: 'center' }}>⚙️ Configuración</summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8, fontSize: 13, color: 'var(--text)' }}>
          <label style={fila}><span>PIN automático por reserva</span>
            <input type="checkbox" checked={cfg.autoPin} style={{ width: 20, height: 20 }} onChange={e => saveCfg({ autoPin: e.target.checked })} /></label>
          <label style={fila}><span>Entrega del PIN</span>
            <select value={cfg.entrega} style={{ ...btn, minHeight: 36, maxWidth: '55%', padding: '0 8px' }}
              onChange={e => saveCfg({ entrega: e.target.value as ConfigAcceso['entrega'] })}>
              <option value="manual">Solo panel</option>
              <option value="aviso">Aviso a mí (Telegram)</option>
              <option value="huesped">Al huésped</option>
              <option value="ambos">Ambos</option>
            </select></label>
          <label style={fila}><span>Longitud del PIN</span>
            <input type="number" min={4} max={8} defaultValue={cfg.pinLongitud} style={{ ...inp, width: 70, textAlign: 'right' }}
              onBlur={e => saveCfg({ pinLongitud: Math.min(8, Math.max(4, Number(e.target.value) || 6)) })} /></label>
          <label style={fila}><span>Usar horario real del piso</span>
            <input type="checkbox" checked={cfg.usarHorarioPiso} style={{ width: 20, height: 20 }} onChange={e => saveCfg({ usarHorarioPiso: e.target.checked })} /></label>
          <label style={fila}><span>Margen antes del check-in (min)</span>
            <input type="number" min={0} defaultValue={cfg.margenEntradaMin} style={{ ...inp, width: 70, textAlign: 'right' }}
              onBlur={e => saveCfg({ margenEntradaMin: Math.max(0, Number(e.target.value) || 0) })} /></label>
          <label style={fila}><span>Margen tras el check-out (min)</span>
            <input type="number" min={0} defaultValue={cfg.margenSalidaMin} style={{ ...inp, width: 70, textAlign: 'right' }}
              onBlur={e => saveCfg({ margenSalidaMin: Math.max(0, Number(e.target.value) || 0) })} /></label>
          <label style={fila}><span>Borrar el PIN tras el check-out</span>
            <input type="checkbox" checked={cfg.autoBorrarTrasCheckout} style={{ width: 20, height: 20 }} onChange={e => saveCfg({ autoBorrarTrasCheckout: e.target.checked })} /></label>
          <label style={fila}><span>Mostrar botón «Abrir»</span>
            <input type="checkbox" checked={cfg.botonAbrir} style={{ width: 20, height: 20 }} onChange={e => saveCfg({ botonAbrir: e.target.checked })} /></label>

          <strong style={{ fontSize: 12, marginTop: 8 }}>Pisos de esta puerta (reservas)</strong>
          {apartamentos.length === 0 && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Pulsa «Buscar dispositivos» arriba para cargar la lista de apartamentos de Smoobu.</span>}
          {apartamentos.map(a => (
            <label key={a.id} style={fila}><span style={{ fontSize: 12 }}>{a.name}</span>
              <input type="checkbox" checked={cfg.smoobuApartmentIds.includes(a.id)} style={{ width: 20, height: 20 }}
                onChange={e => toggleApt(a.id, e.target.checked)} /></label>
          ))}
          {cfg.smoobuApartmentIds.filter(id => !apartamentos.some(a => a.id === id)).map(id => (
            <label key={id} style={fila}><span style={{ fontSize: 12 }}>#{id}</span>
              <input type="checkbox" checked style={{ width: 20, height: 20 }} onChange={() => toggleApt(id, false)} /></label>
          ))}

          <strong style={{ fontSize: 12, marginTop: 8 }}>Alertas</strong>
          {([
            ['primeraEntrada', 'Primera entrada del huésped'],
            ['fueraDeVentana', 'Entrada fuera de reserva'],
            ['sabotaje', 'Sabotaje / puerta forzada'],
            ['timbre', 'Timbre'],
            ['offlineAntesCheckin', 'Cerradura offline antes de un check-in'],
          ] as const).map(([k, label]) => (
            <label key={k} style={fila}><span style={{ fontSize: 12 }}>{label}</span>
              <input type="checkbox" checked={cfg.alertas[k]} style={{ width: 20, height: 20 }}
                onChange={e => saveCfg({ alertas: { ...cfg.alertas, [k]: e.target.checked } })} /></label>
          ))}
          <label style={fila}><span style={{ fontSize: 12 }}>Antelación aviso offline (horas)</span>
            <input type="number" min={1} defaultValue={cfg.alertas.offlineLeadHoras} style={{ ...inp, width: 70, textAlign: 'right' }}
              onBlur={e => saveCfg({ alertas: { ...cfg.alertas, offlineLeadHoras: Math.max(1, Number(e.target.value) || 12) } })} /></label>
        </div>
      </details>

      {sonda && (
        <div style={{ borderRadius: 8, border: '1px solid var(--border)', padding: 12, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text)' }}>
          <BloqueSondaView titulo="🔑 PIN" b={sonda.pins} />
          <BloqueSondaView titulo="🪪 Tarjetas" b={sonda.tarjetas} />
          <BloqueSondaView titulo="📋 Accesos" b={sonda.accesos} />
          <BloqueSondaView titulo="⚙️ Funciones (spec)" b={sonda.spec} />
          <BloqueSondaView titulo="📟 Estado (DPs)" b={sonda.status} />
          <p style={{ margin: 0, color: 'var(--muted)' }}>DP de apertura detectado: <code>{sonda.codigoAbrir || '—'}</code></p>
        </div>
      )}
    </div>
  )
}

// Override manual del tipo de aparato: la categoría Tuya del NIVIAN puede no reconocerse y entonces la
// cerradura se pinta como ventilador. Aquí se fuerza «Cerradura» para que salga su tarjeta de acceso.
function SelectorTipo({ tipo, onChange, disabled }: { tipo: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <select aria-label="Tipo de dispositivo" value={tipo} disabled={disabled}
      onChange={e => onChange(e.target.value)}
      style={{ ...btn, minHeight: 36, padding: '0 8px', fontSize: 12 }}>
      <option value="ventilador">🌀 Ventilador</option>
      <option value="acceso">🔐 Cerradura</option>
      <option value="otro">Otro</option>
    </select>
  )
}

function BloqueSondaView({ titulo, b }: { titulo: string; b: BloqueSonda }) {
  return (
    <details>
      <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>
        {titulo} — {b.ok ? '✅' : `❌ ${b.error}`}
      </summary>
      {b.ok && (
        <pre style={{ marginTop: 4, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--muted)', fontSize: 11 }}>
          {JSON.stringify(b.datos, null, 2)}
        </pre>
      )}
    </details>
  )
}
