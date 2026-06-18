'use client'
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import {
  generarParte, paxTotal,
  alergenosElaboracion, validarControles, objetivoControl, muestrasACaducar,
  ALERGENO_NOMBRE,
  type FichaCatalogo, type EventoInput, type ElaboracionTraza, type TipoControl,
} from '@central/module-trazabilidad'
import { asignarTrabajo, type Tarea, type Trabajador } from '@central/module-organizador-trabajo'

// ─── Marca ───────────────────────────────────────────────────
const C = {
  verde: '#02473B', oro: '#9E8152', papel: '#FBFAF6', tinta: '#1E2622',
  ink3: '#5C6660', linea: '#E6E2D6', rojo: '#9E2B25', ambar: '#9A6B12',
}
const SE = 'Newsreader, Georgia, serif'
const SN = 'Inter Tight, system-ui, sans-serif'
const PARTIDA_COLOR: Record<string, string> = { frio: '#2B6A6E', caliente: '#C0492B', corte: '#9E8152', montaje: '#3F7D44' }
const PARTIDA_NOMBRE: Record<string, string> = { frio: 'Frío', caliente: 'Caliente', corte: 'Corte', montaje: 'Montaje' }
const CTRL_ICONO: Record<TipoControl, string> = { termico: '🌡️', abatimiento: '🧊', congelacion: '❄️', refrigeracion: '🧊' }

const COCINEROS: Trabajador[] = [
  { id: 'c1', nombre: 'Carmen', rol: 'cocinero', disponible: true },
  { id: 'c2', nombre: 'Cocina 2', rol: 'cocinero', disponible: true },
  { id: 'c3', nombre: 'Cocina 3', rol: 'cocinero', disponible: true },
]

type Receta = FichaCatalogo
type Evento = { id: string; nombre: string; pax: number; fecha_evento: string | null; ubicacion: string | null; elaboraciones: string[] }

const sh = (): Record<string, string> => ({ 'x-ia-session': (typeof window !== 'undefined' && localStorage.getItem('ia_rest_session')) || '' })

function Chip({ children, bg, fg, br }: { children: React.ReactNode; bg: string; fg: string; br?: string }): ReactElement {
  return <span style={{ fontFamily: SN, fontSize: 11.5, fontWeight: 600, color: fg, background: bg, border: br ? `1px solid ${br}` : 'none', borderRadius: 20, padding: '2px 9px', whiteSpace: 'nowrap' }}>{children}</span>
}

function Ficha({ e, ubNombre }: { e: ElaboracionTraza; ubNombre: Record<string, string> }): ReactElement {
  const alergenos = alergenosElaboracion(e)
  const controles = validarControles(e)
  return (
    <div className="ficha" style={{ background: '#fff', border: `1px solid ${C.linea}`, borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: SN, fontWeight: 800, fontSize: 'clamp(14px,3.6vw,16px)', color: C.tinta }}>{e.nombre}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {e.ubicaciones.map(u => <Chip key={u} bg={C.papel} fg={C.ink3} br={C.linea}>{ubNombre[u] ?? u}</Chip>)}
        </div>
      </div>
      {alergenos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8, alignItems: 'center' }}>
          <span style={{ fontFamily: SN, fontSize: 10.5, fontWeight: 700, letterSpacing: .5, color: C.oro, textTransform: 'uppercase' }}>Alérgenos</span>
          {alergenos.map(a => <Chip key={a} bg="rgba(154,107,18,.10)" fg={C.ambar} br="rgba(154,107,18,.3)">{ALERGENO_NOMBRE[a]}</Chip>)}
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        {e.ingredientes.map((ing, i) => (
          <div key={i} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 10px', padding: '6px 0', borderBottom: `1px solid ${C.papel}` }}>
            <span style={{ fontFamily: SN, fontWeight: 700, fontSize: 13, color: C.tinta, flex: '1 1 auto', minWidth: 0 }}>{ing.nombre}</span>
            <span style={{ fontFamily: SN, fontWeight: 800, fontSize: 13, color: C.verde, whiteSpace: 'nowrap' }}>{ing.cantidad}</span>
            <div style={{ flex: '1 1 100%', display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 3 }}>
              <span style={{ fontFamily: SN, fontSize: 11, color: C.ink3, background: C.papel, border: `1px solid ${C.linea}`, borderRadius: 6, padding: '1px 7px' }}>Lote ⬚</span>
              <span style={{ fontFamily: SN, fontSize: 11, color: C.ink3, background: C.papel, border: `1px solid ${C.linea}`, borderRadius: 6, padding: '1px 7px' }}>Prov. ⬚</span>
              {ing.desinfeccion && <span style={{ fontFamily: SN, fontSize: 11, color: C.ink3, background: C.papel, border: `1px solid ${C.linea}`, borderRadius: 6, padding: '1px 7px' }}>🧪 Desinf.</span>}
              {ing.descongelacion && <span style={{ fontFamily: SN, fontSize: 11, color: C.ink3, background: C.papel, border: `1px solid ${C.linea}`, borderRadius: 6, padding: '1px 7px' }}>❄️ Descong.</span>}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        {controles.map((r, i) => (
          <span key={i} style={{ fontFamily: SN, fontSize: 11.5, color: C.tinta, background: C.papel, border: `1px solid ${C.linea}`, borderRadius: 8, padding: '3px 8px' }}>
            {CTRL_ICONO[r.tipo]} {objetivoControl(r.tipo)} <strong style={{ color: C.ink3 }}>⬚</strong>
          </span>
        ))}
        <span style={{ fontFamily: SN, fontSize: 11.5, color: C.ink3, padding: '3px 8px' }}>🧪 Muestra ⬚ · ✍️ Firma ⬚</span>
      </div>
    </div>
  )
}

const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', background: '#fff', border: `1px solid ${C.linea}`, borderRadius: 8, fontFamily: SN, fontSize: 15, color: C.tinta, outline: 'none', boxSizing: 'border-box' }
const lbl: React.CSSProperties = { display: 'block', fontFamily: SN, fontSize: 10, fontWeight: 700, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }

function EventoForm({ recetas, inicial, onGuardar, onCancelar, saving }: {
  recetas: Receta[]
  inicial?: Evento
  onGuardar: (v: { nombre: string; fecha_evento: string; pax: number; ubicacion: string; elaboraciones: string[] }) => void
  onCancelar: () => void
  saving: boolean
}): ReactElement {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [fecha, setFecha]   = useState(inicial?.fecha_evento ?? '')
  const [pax, setPax]       = useState(String(inicial?.pax ?? ''))
  const [ubicacion, setUbic] = useState(inicial?.ubicacion ?? '')
  const [elabs, setElabs]   = useState<string[]>(inicial?.elaboraciones ?? [])
  const toggle = (id: string) => setElabs(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  return (
    <div style={{ background: '#fff', border: `1px solid ${C.linea}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,160px),1fr))', gap: 10 }}>
        <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Nombre del evento *</label><input style={inp} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Boda Hacienda…" /></div>
        <div><label style={lbl}>Fecha</label><input style={inp} type="date" value={fecha ?? ''} onChange={e => setFecha(e.target.value)} /></div>
        <div><label style={lbl}>PAX</label><input style={inp} type="number" min="0" value={pax} onChange={e => setPax(e.target.value)} /></div>
        <div><label style={lbl}>Ubicación</label><input style={inp} value={ubicacion ?? ''} onChange={e => setUbic(e.target.value)} placeholder="(opcional)" /></div>
      </div>
      <div style={{ marginTop: 12 }}>
        <label style={lbl}>Elaboraciones que se sirven</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {recetas.map(r => (
            <button key={r.id} type="button" onClick={() => toggle(r.id)} style={{
              padding: '5px 10px', borderRadius: 20, cursor: 'pointer', fontFamily: SN, fontSize: 12,
              background: elabs.includes(r.id) ? C.verde : '#fff', color: elabs.includes(r.id) ? '#fff' : C.ink3,
              border: `1px solid ${elabs.includes(r.id) ? C.verde : C.linea}`,
            }}>{r.nombre}</button>
          ))}
          {recetas.length === 0 && <span style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>Aún no hay recetas en el catálogo.</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
        <button onClick={onCancelar} style={{ fontFamily: SN, fontSize: 14, color: C.ink3, background: 'transparent', border: `1px solid ${C.linea}`, borderRadius: 8, padding: '9px 14px', cursor: 'pointer' }}>Cancelar</button>
        <button disabled={saving || !nombre.trim()} onClick={() => onGuardar({ nombre: nombre.trim(), fecha_evento: fecha, pax: parseInt(pax) || 0, ubicacion: ubicacion.trim(), elaboraciones: elabs })}
          style={{ fontFamily: SN, fontSize: 14, fontWeight: 700, color: '#fff', background: saving || !nombre.trim() ? C.ink3 : C.verde, border: 'none', borderRadius: 8, padding: '9px 16px', cursor: saving ? 'default' : 'pointer' }}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

export default function ProduccionCocinaCentralPage(): ReactElement {
  const [nombreLocal, setNombreLocal] = useState('Cocina central')
  const [ready, setReady]   = useState(false)
  const [recetas, setRecetas] = useState<Receta[]>([])
  const [eventos, setEventos] = useState<Evento[]>([])
  const [saving, setSaving] = useState(false)
  const [editor, setEditor] = useState<{ modo: 'nuevo' | 'editar'; evento?: Evento } | null>(null)
  const [gestionAbierta, setGestion] = useState(false)

  const cargar = useCallback(async () => {
    const r = await fetch('/api/cocina/parte', { headers: sh() })
    const d = await r.json().catch(() => ({ recetas: [], eventos: [] }))
    setRecetas(d.recetas ?? [])
    setEventos(d.eventos ?? [])
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('ia_rest_session')
      if (!raw) { window.location.href = '/login'; return }
      const s = JSON.parse(raw)
      if (s?.restaurante_nombre) setNombreLocal(s.restaurante_nombre)
    } catch { window.location.href = '/login'; return }
    cargar().finally(() => setReady(true))
  }, [cargar])

  const ubNombre = useMemo(() => Object.fromEntries(eventos.map(e => [e.id, e.nombre])), [eventos])
  const minPorPax = useMemo(() => Object.fromEntries(recetas.map(r => [r.id, r.min_por_pax ?? 0.4])), [recetas])

  const parte = useMemo(() => {
    const ev: EventoInput[] = eventos.map(e => ({ id: e.id, nombre: e.nombre, pax: e.pax, fecha_evento: e.fecha_evento ?? '', elaboraciones: e.elaboraciones }))
    return generarParte(recetas, ev)
  }, [recetas, eventos])
  const total = paxTotal(parte)

  const plan = useMemo(() => {
    const tareas: Tarea[] = parte.elaboraciones.map(e => {
      const pax = e.ubicaciones.reduce((a, id) => a + (eventos.find(ev => ev.id === id)?.pax ?? 0), 0)
      return { id: e.id, nombre: e.nombre, tipo: 'elaboracion', partida: e.partida ?? undefined, duracion_estimada_min: Math.max(10, Math.round((minPorPax[e.id] ?? 0.4) * pax)), prioridad: e.partida === 'caliente' ? 'alta' : 'normal' }
    })
    return asignarTrabajo(tareas, COCINEROS)
  }, [parte, eventos, minPorPax])

  const porPartida = useMemo(() => {
    const orden = ['frio', 'caliente', 'corte', 'montaje']
    return orden.map(p => ({ partida: p, elabs: parte.elaboraciones.filter(e => e.partida === p) })).filter(g => g.elabs.length > 0)
  }, [parte])

  const muestras = muestrasACaducar(parte.elaboraciones, '2026-06-22T20:00:00Z', 2)

  const salir = () => {
    try { localStorage.removeItem('ia_rest_session'); localStorage.removeItem('ia_kds_token') } catch { /* noop */ }
    window.location.href = '/login'
  }

  const guardarEvento = async (v: { nombre: string; fecha_evento: string; pax: number; ubicacion: string; elaboraciones: string[] }) => {
    setSaving(true)
    try {
      if (editor?.modo === 'editar' && editor.evento) {
        await fetch(`/api/cocina/eventos/${editor.evento.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify(v) })
      } else {
        await fetch('/api/cocina/eventos', { method: 'POST', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify(v) })
      }
      await cargar()
      setEditor(null)
    } finally { setSaving(false) }
  }

  const borrarEvento = async (ev: Evento) => {
    if (!window.confirm(`¿Borrar el evento "${ev.nombre}"?`)) return
    await fetch(`/api/cocina/eventos/${ev.id}`, { method: 'DELETE', headers: sh() })
    await cargar()
  }

  if (!ready) return <div style={{ minHeight: '100dvh', background: C.papel }} />

  return (
    <div style={{ minHeight: '100dvh', background: C.papel, color: C.tinta, fontFamily: SN }}>
      <style>{`@media print { .noprint { display:none !important } body { background:#fff !important } }`}</style>

      {/* Header fino (sin voz, sin mesas) */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: `1px solid ${C.linea}`, padding: '10px clamp(14px,4vw,28px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: SN, letterSpacing: 2, fontSize: 10, color: C.oro, textTransform: 'uppercase', fontWeight: 700 }}>Cocina central</div>
          <div style={{ fontFamily: SE, fontSize: 'clamp(16px,4.6vw,22px)', fontWeight: 600, color: C.verde, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nombreLocal}</div>
        </div>
        <div className="noprint" style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={() => window.print()} title="Imprimir dossier APPCC" style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: '#fff', background: C.verde, border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>🖨️</button>
          <button onClick={salir} title="Salir" style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.ink3, background: 'transparent', border: `1px solid ${C.linea}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>Salir</button>
        </div>
      </div>

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(16px,4vw,32px) clamp(14px,4vw,28px) 64px' }}>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontFamily: SN, fontSize: 'clamp(13px,3.4vw,15px)', color: C.ink3 }}>
            Parte del día · {eventos.length} eventos · {total} PAX · {parte.elaboraciones.length} elaboraciones
          </div>
          <button className="noprint" onClick={() => setGestion(v => !v)} style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: gestionAbierta ? '#fff' : C.verde, background: gestionAbierta ? C.verde : 'transparent', border: `1px solid ${C.verde}`, borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>
            {gestionAbierta ? 'Cerrar gestión' : '✎ Gestionar eventos'}
          </button>
        </div>

        {/* Gestión de eventos (añadir / editar / borrar) */}
        {gestionAbierta && (
          <div className="noprint" style={{ background: 'rgba(2,71,59,.04)', border: `1px solid ${C.linea}`, borderRadius: 14, padding: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 18, color: C.verde }}>Eventos</div>
              {!editor && <button onClick={() => setEditor({ modo: 'nuevo' })} style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: '#fff', background: C.verde, border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>+ Nuevo evento</button>}
            </div>

            {editor && (
              <EventoForm recetas={recetas} inicial={editor.evento} saving={saving} onCancelar={() => setEditor(null)} onGuardar={guardarEvento} />
            )}

            {!editor && eventos.map(ev => (
              <div key={ev.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${C.linea}` }}>
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <div style={{ fontFamily: SN, fontWeight: 700, fontSize: 14, color: C.tinta }}>{ev.nombre}</div>
                  <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>{ev.fecha_evento ?? 'sin fecha'} · {ev.pax} PAX · {ev.elaboraciones.length} elaboraciones</div>
                </div>
                <button onClick={() => setEditor({ modo: 'editar', evento: ev })} style={{ fontFamily: SN, fontSize: 12.5, color: C.verde, background: 'transparent', border: `1px solid ${C.linea}`, borderRadius: 7, padding: '6px 12px', cursor: 'pointer' }}>Editar</button>
                <button onClick={() => borrarEvento(ev)} style={{ fontFamily: SN, fontSize: 12.5, color: C.rojo, background: 'transparent', border: `1px solid ${C.linea}`, borderRadius: 7, padding: '6px 12px', cursor: 'pointer' }}>Borrar</button>
              </div>
            ))}
            {!editor && eventos.length === 0 && <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3 }}>Aún no hay eventos. Pulsa "+ Nuevo evento".</div>}
          </div>
        )}

        {/* Reparto del motor */}
        <div className="noprint" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {COCINEROS.map(c => (
            <div key={c.id} style={{ background: '#fff', border: `1px solid ${C.linea}`, borderRadius: 10, padding: '7px 12px' }}>
              <div style={{ fontFamily: SN, fontWeight: 700, fontSize: 13.5, color: C.tinta }}>{c.nombre}</div>
              <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>{plan.minutos_por_trabajador[c.id] ?? 0} min</div>
            </div>
          ))}
        </div>

        {muestras.length > 0 && (
          <div className="noprint" style={{ background: 'rgba(154,107,18,.08)', border: `1px solid ${C.ambar}`, borderRadius: 12, padding: '10px 14px', marginBottom: 16, fontFamily: SN, fontSize: 13.5, color: C.ambar }}>
            🧪 {muestras.length} muestra(s) testigo podrán retirarse el 22/6.
          </div>
        )}

        {porPartida.map(g => (
          <div key={g.partida} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, background: PARTIDA_COLOR[g.partida], color: '#fff', marginBottom: 12 }}>
              <span style={{ fontFamily: SN, fontWeight: 800, fontSize: 15, letterSpacing: .5 }}>{(PARTIDA_NOMBRE[g.partida] ?? g.partida).toUpperCase()}</span>
              <span style={{ marginLeft: 'auto', fontFamily: SN, fontSize: 13, opacity: .9 }}>{g.elabs.length}</span>
            </div>
            {g.elabs.map(e => <Ficha key={e.id} e={e} ubNombre={ubNombre} />)}
          </div>
        ))}

        {parte.elaboraciones.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, fontFamily: SE, fontStyle: 'italic', color: C.ink3 }}>
            Sin elaboraciones todavía. Crea un evento y asígnale elaboraciones desde "Gestionar eventos".
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 20, fontFamily: SN, fontSize: 12, color: C.oro, letterSpacing: 1 }}>COCINA CENTRAL · ia.rest</div>
      </div>
    </div>
  )
}
