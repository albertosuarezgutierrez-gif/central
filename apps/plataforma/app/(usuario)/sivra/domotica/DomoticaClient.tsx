'use client'
import { useCallback, useEffect, useState } from 'react'

type DP = { code: string; value: unknown }
type LogRow = { accion: string; reserva_ref: string | null; detalle: Record<string, unknown> | null; created_at: string }
type Disp = {
  id: string; nombre: string; tuya_device_id: string; piso: string | null;
  smoobu_apartment_id: number | null; config: Record<string, unknown>; activo: boolean;
  categoria: string | null; tipo?: 'ventilador' | 'acceso' | 'otro';
  estado: DP[] | null; errorEstado: string | null; log: LogRow[];
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
          return <TarjetaAcceso key={d.id} d={d} ocupado={ocupado} setOcupado={setOcupado} setError={setError} cargar={cargar} />
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
              <button onClick={cargar} disabled={ocupado} style={{ ...btn, padding: '0 12px' }} aria-label="Refrescar">↻</button>
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

function TarjetaAcceso({ d, ocupado, setOcupado, setError, cargar }: {
  d: Disp; ocupado: boolean; setOcupado: (b: boolean) => void;
  setError: (s: string | null) => void; cargar: () => Promise<void>;
}) {
  const [sonda, setSonda] = useState<SondaAcceso | null>(null)
  const [cargandoSonda, setCargandoSonda] = useState(false)

  async function sondear() {
    setCargandoSonda(true); setError(null)
    const r = await fetch(`/api/sivra/domotica/acceso/${d.id}`).then(x => x.json()).catch(() => null)
    if (!r || r.error) setError(r?.error || 'Error en la sonda')
    else setSonda(r.sonda)
    setCargandoSonda(false)
  }

  async function abrir() {
    if (!confirm('¿Abrir la puerta ahora? (pulso momentáneo, se cierra sola)')) return
    setOcupado(true); setError(null)
    const r = await fetch(`/api/sivra/domotica/acceso/${d.id}/abrir`, { method: 'POST' })
      .then(x => x.json()).catch(() => null)
    if (!r || r.error) setError(r?.error || 'Error al abrir')
    await cargar(); setOcupado(false)
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={sondear} disabled={cargandoSonda} style={{ ...btn, padding: '0 12px' }}>
            {cargandoSonda ? '…' : '🔍 Sonda'}
          </button>
          <button onClick={abrir} disabled={ocupado} style={{ ...btn, fontWeight: 700 }}>🚪 Abrir</button>
        </div>
      </div>

      <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>
        «Abrir» da un pulso momentáneo (se cierra sola). «Sonda» es solo lectura: lista lo que el
        aparato expone (PIN, tarjetas, accesos) sin abrir nada.
      </p>

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
