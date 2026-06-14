'use client'
// HorarioTab — Control horario (registro de jornada legal RD 8/2019)
// Informe por empleado (horas/días/media/semana) + excesos, descansos y horas extra.
// Todo gobernado por config_horario (límites + toggles que el dueño edita aquí).

import React, { useState, useEffect, useCallback } from 'react'
import { C, SE, SN, SM } from '@/lib/colors'

const h = (n: number) => n.toLocaleString('es', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' h'

interface ResumenEmp {
  camarero_id: string | null
  camarero_nombre: string | null
  dias_trabajados: number
  horas_totales: number
  media_diaria: number
  horas_por_semana: Record<string, number>
  excesos: { tipo: 'dia' | 'semana'; clave: string; horas: number; limite: number }[]
}
interface Descanso { camarero_id: string | null; camarero_nombre: string | null; tipo: string; fecha: string; horas: number; minimo: number }
interface Extra { camarero_id: string | null; camarero_nombre: string | null; horas_extra: number; tope_anual: number; supera_tope: boolean }
interface Punto { fecha: string; horas: number }
interface CosteLinea { camarero_id: string | null; camarero_nombre: string | null; horas: number; coste_hora: number; coste: number }
interface Coste { lineas: CosteLinea[]; horas_total: number; coste_total: number; ventas: number; pct_sobre_ventas: number | null; ventas_por_hora: number | null }
const eur = (n: number) => n.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

export default function HorarioTab({ sh }: { sh: () => Record<string, string> }) {
  const hoy = new Date()
  const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0]
  const [desde, setDesde] = useState(primero)
  const [hasta, setHasta] = useState(hoy.toISOString().split('T')[0])
  const [resumen, setResumen] = useState<ResumenEmp[]>([])
  const [detalle, setDetalle] = useState<Record<string, Punto[]>>({})
  const [descansos, setDescansos] = useState<Descanso[]>([])
  const [extras, setExtras] = useState<Extra[]>([])
  const [coste, setCoste] = useState<Coste | null>(null)
  const [loading, setLoading] = useState(false)
  const [verConfig, setVerConfig] = useState(false)
  const [aviso, setAviso] = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/owner/horario?desde=${desde}&hasta=${hasta}`, { headers: sh() })
      const d = await r.json()
      if (d.ok) { setResumen(d.resumen ?? []); setDetalle(d.detalle ?? {}); setDescansos(d.descansos ?? []); setExtras(d.extras ?? []); setCoste(d.coste ?? null) }
    } finally { setLoading(false) }
  }, [desde, hasta, sh])
  useEffect(() => { cargar() }, [cargar])

  const guardarCoste = async (camareroId: string, valor: string) => {
    await fetch('/api/owner/horario/coste', {
      method: 'POST', headers: { ...sh(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ camarero_id: camareroId, coste_hora: valor.trim() === '' ? null : Number(valor) }),
    })
    cargar()
  }

  const autocerrar = async () => {
    setAviso('')
    const r = await fetch('/api/owner/horario/autocierre', { method: 'POST', headers: sh() })
    const d = await r.json()
    if (d.ok) { setAviso(d.cerrados ? `Autocerrados ${d.cerrados} turno(s) colgados (> ${d.limite_horas}h)` : 'No había turnos colgados'); cargar() }
    else setAviso('Error: ' + (d.error ?? 'no se pudo'))
    setTimeout(() => setAviso(''), 4000)
  }

  const exportarCSV = () => {
    const filas = [['Empleado', 'Días', 'Horas totales', 'Media/día', 'Excesos']]
    for (const r of resumen) filas.push([
      r.camarero_nombre ?? 'Sin asignar', String(r.dias_trabajados),
      String(r.horas_totales), String(r.media_diaria), String(r.excesos.length),
    ])
    filas.push([]); filas.push(['Empleado', 'Fecha', 'Horas'])
    for (const r of resumen) for (const p of (detalle[r.camarero_id ?? '__sin__'] ?? [])) filas.push([r.camarero_nombre ?? 'Sin asignar', p.fecha, String(p.horas)])
    const csv = filas.map(f => f.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `jornada_${desde}_${hasta}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div style={{ padding: '16px 20px', maxWidth: 980, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, color: C.ink }}>Control horario</div>
        <div style={{ fontFamily: SM, fontSize: 11, color: C.ink4 }}>Registro de jornada · RD 8/2019 · 100% configurable</div>
      </div>

      {/* Controles */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={inp} />
        <span style={{ fontFamily: SN, fontSize: 12, color: C.ink4 }}>→</span>
        <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={inp} />
        <button onClick={cargar} style={btn}>{loading ? '…' : 'Ver'}</button>
        <button onClick={exportarCSV} style={btn} disabled={!resumen.length}>Exportar CSV</button>
        <button onClick={autocerrar} style={btn} title="Cierra turnos olvidados abiertos más del límite configurado">Autocerrar colgados</button>
        <button onClick={() => setVerConfig(v => !v)} style={{ ...btn, marginLeft: 'auto' }}>⚙️ Configuración</button>
      </div>
      {aviso && <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginBottom: 10 }}>{aviso}</div>}

      {verConfig && <ConfigHorario sh={sh} />}

      {/* Tabla de jornada por empleado */}
      {!resumen.length ? (
        <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3, padding: '20px 0' }}>
          Sin turnos fichados (cerrados) en el rango.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr .6fr .9fr .8fr 1fr 1.4fr', gap: 6, padding: '0 8px' }}>
            {['Empleado', 'Días', 'Horas', 'Media/día', 'Excesos', 'Tendencia'].map(t => (
              <div key={t} style={{ fontFamily: SM, fontSize: 9, color: C.ink4, textTransform: 'uppercase', letterSpacing: '.05em' }}>{t}</div>
            ))}
          </div>
          {resumen.map(r => {
            const serie = detalle[r.camarero_id ?? '__sin__'] ?? []
            const maxH = Math.max(1, ...serie.map(p => p.horas))
            return (
              <div key={r.camarero_id ?? 'sin'} style={{ display: 'grid', gridTemplateColumns: '1.4fr .6fr .9fr .8fr 1fr 1.4fr', gap: 6, alignItems: 'center', background: C.paper2, borderRadius: 8, padding: '8px' }}>
                <div style={{ fontFamily: SN, fontSize: 12, fontWeight: 700, color: C.ink }}>{r.camarero_nombre ?? 'Sin asignar'}</div>
                <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>{r.dias_trabajados}</div>
                <div style={{ fontFamily: SN, fontSize: 12, fontWeight: 700, color: C.ink }}>{h(r.horas_totales)}</div>
                <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>{h(r.media_diaria)}</div>
                <div style={{ fontFamily: SN, fontSize: 11, color: r.excesos.length ? C.amber : '#4ADE80' }}>
                  {r.excesos.length ? `${r.excesos.length} ⚠️` : 'OK ✓'}
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 26 }}>
                  {serie.slice(-30).map((p, i) => (
                    <div key={i} title={`${p.fecha}: ${h(p.horas)}`}
                      style={{ width: 4, height: `${Math.max(2, (p.horas / maxH) * 24)}px`, background: C.ink3, borderRadius: 1, opacity: .7 }} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Avisos de descanso */}
      {!!descansos.length && (
        <Bloque titulo={`Descansos insuficientes (${descansos.length})`} color={C.amber}>
          {descansos.map((d, i) => (
            <div key={i} style={linea}>
              {d.camarero_nombre ?? 'Sin asignar'} · {d.fecha} · {h(d.horas)} de descanso (mín. {h(d.minimo)})
            </div>
          ))}
        </Bloque>
      )}

      {/* Horas extra */}
      {!!extras.length && (
        <Bloque titulo="Horas extra" color={C.ink3}>
          {extras.map((e, i) => (
            <div key={i} style={{ ...linea, color: e.supera_tope ? C.amber : C.ink3 }}>
              {e.camarero_nombre ?? 'Sin asignar'} · {h(e.horas_extra)} {e.supera_tope ? `⚠️ supera el tope anual (${h(e.tope_anual)})` : ''}
            </div>
          ))}
        </Bloque>
      )}

      {/* Coste de personal (si está activado en config) */}
      {coste && (
        <Bloque titulo="Coste de personal" color={C.ink3}>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 10 }}>
            <Kpi label="Coste total" valor={eur(coste.coste_total)} />
            <Kpi label="Ventas" valor={eur(coste.ventas)} />
            <Kpi label="% sobre ventas" valor={coste.pct_sobre_ventas != null ? coste.pct_sobre_ventas.toFixed(1) + '%' : '—'} color={coste.pct_sobre_ventas != null && coste.pct_sobre_ventas > 35 ? C.amber : C.ink} />
            <Kpi label="Ventas / hora" valor={coste.ventas_por_hora != null ? eur(coste.ventas_por_hora) : '—'} />
          </div>
          {coste.lineas.map(l => (
            <div key={l.camarero_id ?? 'sin'} style={{ display: 'grid', gridTemplateColumns: '1.4fr .8fr 1fr 1fr', gap: 6, alignItems: 'center', padding: '4px 0' }}>
              <div style={{ fontFamily: SN, fontSize: 12, color: C.ink }}>{l.camarero_nombre ?? 'Sin asignar'}</div>
              <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4 }}>{h(l.horas)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {l.camarero_id ? (
                  <input type="number" inputMode="decimal" defaultValue={l.coste_hora || ''} placeholder="€/h"
                    onBlur={e => guardarCoste(l.camarero_id!, e.target.value)}
                    style={{ width: 60, fontFamily: SN, fontSize: 11, padding: '3px 5px', background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 6, color: C.ink, outline: 'none' }} />
                ) : <span style={{ fontFamily: SN, fontSize: 11, color: C.ink4 }}>—</span>}
                <span style={{ fontFamily: SN, fontSize: 10, color: C.ink4 }}>€/h</span>
              </div>
              <div style={{ fontFamily: SN, fontSize: 12, fontWeight: 700, color: C.ink, textAlign: 'right' }}>{eur(l.coste)}</div>
            </div>
          ))}
        </Bloque>
      )}
    </div>
  )
}

function Kpi({ label, valor, color }: { label: string; valor: string; color?: string }) {
  return (
    <div>
      <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 18, color: color ?? C.ink }}>{valor}</div>
    </div>
  )
}

function Bloque({ titulo, color, children }: { titulo: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16, background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontFamily: SM, fontSize: 10, color, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>{titulo}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</div>
    </div>
  )
}

// ── Panel de configuración (config_horario) ────────────────────────────────────
interface Cfg {
  jornada_max_diaria: number; jornada_max_semanal: number; descanso_min_entre_jornadas: number
  descanso_semanal_horas: number; tope_extra_anual: number; autocierre_horas: number
  firma_empleado: boolean; avisos_descanso: boolean; aviso_horas_extra: boolean; fichaje_qr: boolean
  validar_ip_local: boolean; autocierre_turnos: boolean; recordatorios_push: boolean
  coste_personal: boolean; festivos_activo: boolean
}
const LIMITES_UI: { k: keyof Cfg; label: string }[] = [
  { k: 'jornada_max_diaria', label: 'Jornada máx. diaria (h)' },
  { k: 'jornada_max_semanal', label: 'Jornada máx. semanal (h)' },
  { k: 'descanso_min_entre_jornadas', label: 'Descanso mín. entre jornadas (h)' },
  { k: 'descanso_semanal_horas', label: 'Descanso semanal (h)' },
  { k: 'tope_extra_anual', label: 'Tope horas extra/año' },
  { k: 'autocierre_horas', label: 'Autocierre de turno (h)' },
]
const FLAGS_UI: { k: keyof Cfg; label: string }[] = [
  { k: 'firma_empleado', label: 'Firma del empleado de su jornada' },
  { k: 'avisos_descanso', label: 'Avisos de descanso insuficiente' },
  { k: 'aviso_horas_extra', label: 'Aviso de horas extra / tope' },
  { k: 'fichaje_qr', label: 'Fichaje por QR del local' },
  { k: 'validar_ip_local', label: 'Validar IP del centro' },
  { k: 'autocierre_turnos', label: 'Autocierre de turnos colgados' },
  { k: 'recordatorios_push', label: 'Recordatorios push' },
  { k: 'coste_personal', label: 'Coste de personal' },
  { k: 'festivos_activo', label: 'Festivos en el cómputo' },
]

function ConfigHorario({ sh }: { sh: () => Record<string, string> }) {
  const [cfg, setCfg] = useState<Cfg | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    fetch('/api/owner/horario/config', { headers: sh() })
      .then(r => r.json()).then(d => { if (d.ok) setCfg(d.config) })
  }, [sh])

  const guardar = async () => {
    if (!cfg) return
    setGuardando(true); setOk(false)
    try {
      const r = await fetch('/api/owner/horario/config', {
        method: 'POST', headers: { ...sh(), 'Content-Type': 'application/json' }, body: JSON.stringify(cfg),
      })
      if ((await r.json()).ok) setOk(true)
    } finally { setGuardando(false) }
  }

  if (!cfg) return null
  return (
    <div style={{ marginBottom: 16, background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Configuración del control horario</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginBottom: 12 }}>
        {LIMITES_UI.map(({ k, label }) => (
          <label key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontFamily: SN, fontSize: 12, color: C.ink3 }}>
            {label}
            <input type="number" inputMode="decimal" value={cfg[k] as number}
              onChange={e => setCfg({ ...cfg, [k]: Number(e.target.value) })}
              style={{ ...inp, width: 70 }} />
          </label>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 6, marginBottom: 12 }}>
        {FLAGS_UI.map(({ k, label }) => (
          <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: SN, fontSize: 12, color: C.ink3, cursor: 'pointer' }}>
            <input type="checkbox" checked={cfg[k] as boolean} onChange={e => setCfg({ ...cfg, [k]: e.target.checked })} style={{ accentColor: C.ink }} />
            {label}
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={guardar} disabled={guardando} style={{ ...btn, opacity: guardando ? .6 : 1 }}>{guardando ? 'Guardando…' : 'Guardar configuración'}</button>
        {ok && <span style={{ fontFamily: SN, fontSize: 12, color: '#4ADE80' }}>✓ Guardado</span>}
      </div>
    </div>
  )
}

const inp: React.CSSProperties = { fontFamily: SN, fontSize: 13, padding: '6px 10px', background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 8, color: C.ink, outline: 'none' }
const btn: React.CSSProperties = { fontFamily: SN, fontSize: 12, padding: '7px 14px', background: C.ink, color: C.paper, border: 'none', borderRadius: 8, cursor: 'pointer' }
const linea: React.CSSProperties = { fontFamily: SN, fontSize: 12, color: C.ink3 }
