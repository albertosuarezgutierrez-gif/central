'use client'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import {
  generarParte, paxTotal,
  alergenosElaboracion, validarControles, objetivoControl, muestrasACaducar,
  avisosDietas, ALERGENO_NOMBRE,
  type FichaCatalogo, type EventoInput, type ElaboracionTraza, type TipoControl,
} from '@central/module-trazabilidad'
import { asignarTrabajo, type Tarea, type Trabajador } from '@central/module-organizador-trabajo'
import { Wordmark } from '@/components/Wordmark'

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

const TODAS_PARTIDAS = ['frio', 'caliente', 'corte', 'montaje']
// Semilla de ejemplo (fallback hasta que el responsable dé de alta a su equipo real). Cubren todas las partidas.
const COCINEROS: Trabajador[] = [
  { id: 'c1', nombre: 'Cocina 1', rol: 'cocinero', disponible: true, roles: TODAS_PARTIDAS },
  { id: 'c2', nombre: 'Cocina 2', rol: 'cocinero', disponible: true, roles: TODAS_PARTIDAS },
  { id: 'c3', nombre: 'Cocina 3', rol: 'cocinero', disponible: true, roles: TODAS_PARTIDAS },
]

type Receta = FichaCatalogo
type DietaUI = { receta_id: string; dieta: string; comensales: number }
type Evento = { id: string; nombre: string; pax: number; fecha_evento: string | null; ubicacion: string | null; evento_id?: string | null; elaboraciones: string[]; dietas: DietaUI[] }
// Dietas frecuentes en catering (etiquetas sugeridas; el selector permite escribir otra)
const DIETAS_COMUNES = ['sin gluten', 'vegano', 'vegetariano', 'sin lactosa', 'sin frutos secos', 'sin marisco']
type Registro = { receta_id: string; hecho: boolean; controles: Array<{ tipo: string; valor: number | null; hora: string; por?: string }>; muestra_testigo_at: string | null; firma: string | null; hecho_por?: string | null; hecho_at?: string | null }
const horaCorta = (iso?: string | null) => { if (!iso) return ''; try { return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) } catch { return '' } }
type Recepcion = { id: string; producto: string; proveedor: string | null; lote: string | null; temperatura: number | null; caducidad: string | null; conforme: boolean; observaciones: string | null }
type RecPendiente = { producto: string; proveedor: string; lote: string; temperatura: string; caducidad: string; conforme: boolean; codigo_barras?: string; evidencia_url?: string }
type Miembro = { id: string; nombre: string; pin: string; cocina_rol: string; partidas: string[]; activo: boolean }
const COCINA_ROL_LABEL: Record<string, string> = { responsable: 'Responsable', cocinero: 'Cocinero', preparacion: 'Preparación' }
const PARTIDAS = ['frio', 'caliente', 'corte', 'montaje']
// Material del evento (mesas/sillas/menaje) — comparte la "boda" con la cocina
type MatLinea = { id: string; material_id: string; cantidad: number; cantidad_devuelta: number; estado: string }
type MatCat = { id: string; nombre: string; categoria: string | null; cantidad_disponible: number; coste_reposicion: number | null }
type MatKit = { id: string; nombre: string }
const eur = (n: number) => n.toLocaleString('es', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

const sh = (): Record<string, string> => ({ 'x-ia-session': (typeof window !== 'undefined' && localStorage.getItem('ia_rest_session')) || '' })

function Chip({ children, bg, fg, br }: { children: React.ReactNode; bg: string; fg: string; br?: string }): ReactElement {
  return <span style={{ fontFamily: SN, fontSize: 11.5, fontWeight: 600, color: fg, background: bg, border: br ? `1px solid ${br}` : 'none', borderRadius: 20, padding: '2px 9px', whiteSpace: 'nowrap' }}>{children}</span>
}

function Ficha({ e, recetaId, ubNombre, registro, requiereMuestra, onAccion, matchRecep, asignadoId, nombreTrab, cocinerosPartida, onAsignar, puedeAsignar }: {
  e: ElaboracionTraza
  recetaId: string
  ubNombre: Record<string, string>
  registro?: Registro
  requiereMuestra: boolean
  onAccion: (recetaId: string, payload: Record<string, unknown>) => void
  matchRecep: (nombre: string) => Recepcion | undefined
  asignadoId?: string | null
  nombreTrab: Record<string, string>
  cocinerosPartida: Array<{ id: string; nombre: string }>
  onAsignar: (recetaId: string, trabajadorId: string | null) => void
  puedeAsignar: boolean
}): ReactElement {
  const alergenos = alergenosElaboracion(e)
  const controles = validarControles(e)
  const ctrlReg = (tipo: string) => (registro?.controles ?? []).find(c => c.tipo === tipo)
  const ctrlsOk = controles.every(c => !!ctrlReg(c.tipo))
  const muestraOk = !requiereMuestra || !!registro?.muestra_testigo_at
  const lista = !!registro?.hecho && ctrlsOk && muestraOk && !!registro?.firma
  return (
    <div className="ficha" style={{ background: '#fff', border: `1px solid ${lista ? '#3F7D44' : C.linea}`, borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <button className="noprint" onClick={() => onAccion(recetaId, { action: 'hecho' })} title="Marcar hecho"
            style={{ width: 24, height: 24, flexShrink: 0, borderRadius: 6, cursor: 'pointer', border: `2px solid ${registro?.hecho ? '#3F7D44' : C.linea}`, background: registro?.hecho ? '#3F7D44' : '#fff', color: '#fff', fontSize: 13, lineHeight: 1 }}>
            {registro?.hecho ? '✓' : ''}
          </button>
          <div style={{ fontFamily: SN, fontWeight: 800, fontSize: 'clamp(14px,3.6vw,16px)', color: C.tinta }}>{e.nombre}</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {asignadoId && !puedeAsignar && <Chip bg={C.papel} fg={C.verde} br={C.linea}>👤 {nombreTrab[asignadoId] ?? '—'}</Chip>}
          {puedeAsignar && (
            <select className="noprint" value={asignadoId ?? ''} onChange={ev => onAsignar(e.id, ev.target.value || null)} title="Asignar a"
              style={{ fontFamily: SN, fontSize: 12, color: asignadoId ? C.verde : C.ink3, background: C.papel, border: `1px solid ${C.linea}`, borderRadius: 8, padding: '3px 6px', cursor: 'pointer' }}>
              <option value="">👤 sin asignar</option>
              {cocinerosPartida.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          )}
          {e.ubicaciones.map(u => <Chip key={u} bg={C.papel} fg={C.ink3} br={C.linea}>{ubNombre[u] ?? u}</Chip>)}
          {e.dieta && <Chip bg="rgba(63,125,68,.12)" fg="#2f6b34" br="#3F7D44">🟢 {e.dieta} · {e.comensales} ración{e.comensales === 1 ? '' : 'es'}</Chip>}
          <Chip bg={lista ? 'rgba(63,125,68,.12)' : 'rgba(158,43,37,.07)'} fg={lista ? '#2f6b34' : C.rojo} br={lista ? '#3F7D44' : 'rgba(158,43,37,.3)'}>{lista ? '✓ Lista' : '⛔ Pendiente'}</Chip>
        </div>
      </div>
      {alergenos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8, alignItems: 'center' }}>
          <span style={{ fontFamily: SN, fontSize: 10.5, fontWeight: 700, letterSpacing: .5, color: C.oro, textTransform: 'uppercase' }}>Alérgenos</span>
          {alergenos.map(a => <Chip key={a} bg="rgba(154,107,18,.10)" fg={C.ambar} br="rgba(154,107,18,.3)">{ALERGENO_NOMBRE[a]}</Chip>)}
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        {e.ingredientes.map((ing, i) => {
          const rec = matchRecep(ing.nombre)
          const okBox: React.CSSProperties = { fontFamily: SN, fontSize: 11, borderRadius: 6, padding: '1px 7px', border: `1px solid ${rec ? '#3F7D44' : C.linea}`, background: rec ? 'rgba(63,125,68,.10)' : C.papel, color: rec ? '#2f6b34' : C.ink3 }
          return (
            <div key={i} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 10px', padding: '6px 0', borderBottom: `1px solid ${C.papel}` }}>
              <span style={{ fontFamily: SN, fontWeight: 700, fontSize: 13, color: C.tinta, flex: '1 1 auto', minWidth: 0 }}>{ing.nombre}</span>
              <span style={{ fontFamily: SN, fontWeight: 800, fontSize: 13, color: C.verde, whiteSpace: 'nowrap' }}>{ing.cantidad}</span>
              <div style={{ flex: '1 1 100%', display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 3 }}>
                <span style={okBox}>Lote {rec?.lote || '⬚'}</span>
                <span style={okBox}>Prov. {rec?.proveedor || '⬚'}</span>
                {rec?.temperatura != null && <span style={okBox}>{rec.temperatura}° entrada</span>}
                {ing.desinfeccion && <span style={{ fontFamily: SN, fontSize: 11, color: C.ink3, background: C.papel, border: `1px solid ${C.linea}`, borderRadius: 6, padding: '1px 7px' }}>🧪 Desinf.</span>}
                {ing.descongelacion && <span style={{ fontFamily: SN, fontSize: 11, color: C.ink3, background: C.papel, border: `1px solid ${C.linea}`, borderRadius: 6, padding: '1px 7px' }}>❄️ Descong.</span>}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        {controles.map((r, i) => {
          const reg = ctrlReg(r.tipo)
          return (
            <button key={i} className="noprint" onClick={() => { const v = window.prompt(`${objetivoControl(r.tipo)}\nValor (°C):`, reg?.valor != null ? String(reg.valor) : ''); if (v !== null) onAccion(recetaId, { action: 'control', tipo: r.tipo, valor: v }) }}
              style={{ fontFamily: SN, fontSize: 11.5, cursor: 'pointer', color: reg ? '#2f6b34' : C.tinta, background: reg ? 'rgba(63,125,68,.10)' : C.papel, border: `1px solid ${reg ? '#3F7D44' : C.linea}`, borderRadius: 8, padding: '3px 8px' }}>
              {CTRL_ICONO[r.tipo]} {objetivoControl(r.tipo)} <strong>{reg ? `✓ ${reg.valor ?? ''}${reg.valor != null ? '°' : ''}` : '⬚'}</strong>{reg?.por ? <span style={{ opacity: .75 }}> · {reg.por}</span> : null}
            </button>
          )
        })}
        {requiereMuestra && (
          <button className="noprint" onClick={() => onAccion(recetaId, { action: 'muestra' })}
            style={{ fontFamily: SN, fontSize: 11.5, cursor: 'pointer', color: registro?.muestra_testigo_at ? '#2f6b34' : C.ink3, background: registro?.muestra_testigo_at ? 'rgba(63,125,68,.10)' : C.papel, border: `1px solid ${registro?.muestra_testigo_at ? '#3F7D44' : C.linea}`, borderRadius: 8, padding: '3px 8px' }}>🧪 Muestra {registro?.muestra_testigo_at ? '✓' : '⬚'}</button>
        )}
        <button className="noprint" onClick={() => { const f = window.prompt('Firma del responsable:', registro?.firma ?? ''); if (f !== null) onAccion(recetaId, { action: 'firma', firma: f }) }}
          style={{ fontFamily: SN, fontSize: 11.5, cursor: 'pointer', color: registro?.firma ? '#2f6b34' : C.ink3, background: registro?.firma ? 'rgba(63,125,68,.10)' : C.papel, border: `1px solid ${registro?.firma ? '#3F7D44' : C.linea}`, borderRadius: 8, padding: '3px 8px' }}>✍️ {registro?.firma ? registro.firma : 'Firmar ⬚'}</button>
        {/* Versión impresa de los controles */}
        <span className="solo-print" style={{ display: 'none', fontFamily: SN, fontSize: 11.5, color: C.ink3 }}>
          {controles.map(r => { const reg = ctrlReg(r.tipo); return `${objetivoControl(r.tipo)}: ${reg ? `${reg.valor ?? '✓'}${reg.por ? ` (${reg.por})` : ''}` : '⬚'}` }).join(' · ')} · Firma: {registro?.firma ?? '⬚'}{registro?.hecho_por ? ` · Hecho por ${registro.hecho_por} ${horaCorta(registro.hecho_at)}` : ''}
        </span>
      </div>
      {/* Atribución (quién/cuándo lo marcó hecho) */}
      {registro?.hecho && registro?.hecho_por && (
        <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginTop: 6 }}>✓ Hecho por <strong>{registro.hecho_por}</strong>{registro.hecho_at ? ` · ${horaCorta(registro.hecho_at)}` : ''}</div>
      )}
    </div>
  )
}

const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', background: '#fff', border: `1px solid ${C.linea}`, borderRadius: 8, fontFamily: SN, fontSize: 15, color: C.tinta, outline: 'none', boxSizing: 'border-box' }
const lbl: React.CSSProperties = { display: 'block', fontFamily: SN, fontSize: 10, fontWeight: 700, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }

function EventoForm({ recetas, inicial, onGuardar, onCancelar, saving }: {
  recetas: Receta[]
  inicial?: Evento
  onGuardar: (v: { nombre: string; fecha_evento: string; pax: number; ubicacion: string; elaboraciones: string[]; dietas: DietaUI[] }) => void
  onCancelar: () => void
  saving: boolean
}): ReactElement {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [fecha, setFecha]   = useState(inicial?.fecha_evento ?? '')
  const [pax, setPax]       = useState(String(inicial?.pax ?? ''))
  const [ubicacion, setUbic] = useState(inicial?.ubicacion ?? '')
  const [elabs, setElabs]   = useState<string[]>(inicial?.elaboraciones ?? [])
  const [dietas, setDietas] = useState<DietaUI[]>(inicial?.dietas ?? [])
  const toggle = (id: string) => setElabs(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  const addDieta = () => setDietas(p => [...p, { dieta: DIETAS_COMUNES[0], comensales: 1, receta_id: recetas[0]?.id ?? '' }])
  const setDieta = (i: number, patch: Partial<DietaUI>) => setDietas(p => p.map((d, j) => j === i ? { ...d, ...patch } : d))
  const delDieta = (i: number) => setDietas(p => p.filter((_, j) => j !== i))
  const dietasValidas = dietas.filter(d => d.dieta.trim() && d.receta_id && d.comensales > 0)

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

      {/* Comensales con dieta especial (comensales puntuales) — NO cambian el menú principal */}
      <div style={{ marginTop: 14, borderTop: `1px solid ${C.linea}`, paddingTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <label style={{ ...lbl, marginBottom: 0 }}>🟢 Comensales con dieta especial</label>
          <button type="button" onClick={addDieta} disabled={recetas.length === 0} style={{ fontFamily: SN, fontSize: 12, color: C.verde, background: 'transparent', border: `1px dashed ${C.verde}`, borderRadius: 8, padding: '4px 10px', cursor: recetas.length === 0 ? 'default' : 'pointer', opacity: recetas.length === 0 ? .5 : 1 }}>+ grupo</button>
        </div>
        <div style={{ fontFamily: SN, fontSize: 11.5, color: C.ink3, marginBottom: 8 }}>Para los pocos comensales con una dieta concreta (p. ej. 5 sin gluten): se cocina su <strong>plato adaptado</strong> aparte, sin tocar el menú de todos.</div>
        {dietas.map((d, i) => (
          <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <input list="dietas-comunes" style={{ ...inp, flex: '1 1 130px', fontSize: 13, padding: '7px 9px' }} placeholder="dieta" value={d.dieta} onChange={e => setDieta(i, { dieta: e.target.value })} />
            <input style={{ ...inp, flex: '0 1 70px', fontSize: 13, padding: '7px 9px' }} type="number" min="1" placeholder="nº" value={d.comensales || ''} onChange={e => setDieta(i, { comensales: parseInt(e.target.value) || 0 })} />
            <select style={{ ...inp, flex: '2 1 160px', fontSize: 13, padding: '7px 9px' }} value={d.receta_id} onChange={e => setDieta(i, { receta_id: e.target.value })}>
              <option value="">— plato adaptado —</option>
              {recetas.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
            <button type="button" onClick={() => delDieta(i)} style={{ fontFamily: SN, fontSize: 13, color: C.rojo, background: 'transparent', border: `1px solid ${C.linea}`, borderRadius: 7, padding: '6px 9px', cursor: 'pointer' }}>✕</button>
          </div>
        ))}
        <datalist id="dietas-comunes">{DIETAS_COMUNES.map(x => <option key={x} value={x} />)}</datalist>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
        <button onClick={onCancelar} style={{ fontFamily: SN, fontSize: 14, color: C.ink3, background: 'transparent', border: `1px solid ${C.linea}`, borderRadius: 8, padding: '9px 14px', cursor: 'pointer' }}>Cancelar</button>
        <button disabled={saving || !nombre.trim()} onClick={() => onGuardar({ nombre: nombre.trim(), fecha_evento: fecha, pax: parseInt(pax) || 0, ubicacion: ubicacion.trim(), elaboraciones: elabs, dietas: dietasValidas })}
          style={{ fontFamily: SN, fontSize: 14, fontWeight: 700, color: '#fff', background: saving || !nombre.trim() ? C.ink3 : C.verde, border: 'none', borderRadius: 8, padding: '9px 16px', cursor: saving ? 'default' : 'pointer' }}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

type IngForm = { nombre: string; por_pax: string; unidad: string; desinfeccion: boolean; descongelacion: boolean }
const CONTROLES_OPC: Array<{ id: TipoControl; label: string }> = [
  { id: 'termico', label: '🌡️ Térmico' }, { id: 'refrigeracion', label: '🧊 Refrigeración' },
  { id: 'congelacion', label: '❄️ Congelación' }, { id: 'abatimiento', label: '🧊 Abatimiento' },
]
const UNIDADES = ['g', 'kg', 'ml', 'l', 'u']
const DESINF_DEFAULT = { dosificacion: '1 past./10 L', permanencia: '10 min', aclarado: 'agua abundante' }

function RecetaForm({ inicial, onGuardar, onCancelar, saving }: {
  inicial?: Receta
  onGuardar: (v: Record<string, unknown>) => void
  onCancelar: () => void
  saving: boolean
}): ReactElement {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [partida, setPartida] = useState(inicial?.partida ?? 'caliente')
  const [minPax, setMinPax] = useState(String(inicial?.min_por_pax ?? 0.4))
  const [muestra, setMuestra] = useState(inicial?.requiere_muestra ?? true)
  const [controles, setControles] = useState<string[]>(inicial?.controles ?? [])
  const [dependeDe, setDependeDe] = useState((inicial?.depende_de ?? []).join('\n'))
  const [ings, setIngs] = useState<IngForm[]>(
    (inicial?.ingredientes ?? []).map(i => ({
      nombre: i.nombre, por_pax: String((i as { por_pax?: number }).por_pax ?? ''), unidad: i.unidad ?? 'g',
      desinfeccion: !!i.desinfeccion, descongelacion: !!i.descongelacion,
    })),
  )
  const toggleCtrl = (id: string) => setControles(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  const setIng = (i: number, patch: Partial<IngForm>) => setIngs(p => p.map((x, j) => j === i ? { ...x, ...patch } : x))
  const addIng = () => setIngs(p => [...p, { nombre: '', por_pax: '', unidad: 'g', desinfeccion: false, descongelacion: false }])
  const delIng = (i: number) => setIngs(p => p.filter((_, j) => j !== i))

  const guardar = () => onGuardar({
    nombre: nombre.trim(), partida, min_por_pax: parseFloat(minPax) || 0.4, requiere_muestra: muestra, controles,
    depende_de: dependeDe.split('\n').map(s => s.trim()).filter(Boolean),
    ingredientes: ings.filter(i => i.nombre.trim()).map(i => ({
      nombre: i.nombre.trim(), por_pax: parseFloat(i.por_pax) || 0, unidad: i.unidad,
      desinfeccion: i.desinfeccion ? DESINF_DEFAULT : null, descongelacion: i.descongelacion,
    })),
  })

  return (
    <div style={{ background: '#fff', border: `1px solid ${C.linea}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,150px),1fr))', gap: 10 }}>
        <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Nombre de la elaboración *</label><input style={inp} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Delicia de pollo…" /></div>
        <div><label style={lbl}>Partida</label>
          <select style={inp} value={partida ?? 'caliente'} onChange={e => setPartida(e.target.value)}>
            {['frio', 'caliente', 'corte', 'montaje'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div><label style={lbl}>Min/PAX</label><input style={inp} type="number" step="0.1" min="0" value={minPax} onChange={e => setMinPax(e.target.value)} /></div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: SN, fontSize: 13, color: C.tinta, alignSelf: 'end', paddingBottom: 9 }}>
          <input type="checkbox" checked={muestra} onChange={e => setMuestra(e.target.checked)} /> Muestra testigo
        </label>
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={lbl}>Controles APPCC</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {CONTROLES_OPC.map(c => (
            <button key={c.id} type="button" onClick={() => toggleCtrl(c.id)} style={{ padding: '5px 10px', borderRadius: 20, cursor: 'pointer', fontFamily: SN, fontSize: 12, background: controles.includes(c.id) ? C.verde : '#fff', color: controles.includes(c.id) ? '#fff' : C.ink3, border: `1px solid ${controles.includes(c.id) ? C.verde : C.linea}` }}>{c.label}</button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={lbl}>Ingredientes (cantidad por PAX)</label>
        {ings.map((ing, i) => (
          <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <input style={{ ...inp, flex: '2 1 140px', fontSize: 13, padding: '7px 9px' }} placeholder="ingrediente" value={ing.nombre} onChange={e => setIng(i, { nombre: e.target.value })} />
            <input style={{ ...inp, flex: '0 1 70px', fontSize: 13, padding: '7px 9px' }} type="number" step="0.1" placeholder="cant." value={ing.por_pax} onChange={e => setIng(i, { por_pax: e.target.value })} />
            <select style={{ ...inp, flex: '0 1 70px', fontSize: 13, padding: '7px 9px' }} value={ing.unidad} onChange={e => setIng(i, { unidad: e.target.value })}>{UNIDADES.map(u => <option key={u}>{u}</option>)}</select>
            <label style={{ fontFamily: SN, fontSize: 11, color: C.ink3, display: 'flex', alignItems: 'center', gap: 3 }}><input type="checkbox" checked={ing.desinfeccion} onChange={e => setIng(i, { desinfeccion: e.target.checked })} />🧪</label>
            <label style={{ fontFamily: SN, fontSize: 11, color: C.ink3, display: 'flex', alignItems: 'center', gap: 3 }}><input type="checkbox" checked={ing.descongelacion} onChange={e => setIng(i, { descongelacion: e.target.checked })} />❄️</label>
            <button type="button" onClick={() => delIng(i)} style={{ fontFamily: SN, fontSize: 13, color: C.rojo, background: 'transparent', border: `1px solid ${C.linea}`, borderRadius: 7, padding: '6px 9px', cursor: 'pointer' }}>✕</button>
          </div>
        ))}
        <button type="button" onClick={addIng} style={{ fontFamily: SN, fontSize: 12.5, color: C.verde, background: 'transparent', border: `1px dashed ${C.verde}`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>+ ingrediente</button>
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={lbl}>Sub-elaboraciones / "depende de" (una por línea)</label>
        <textarea style={{ ...inp, minHeight: 56, fontSize: 13 }} value={dependeDe} onChange={e => setDependeDe(e.target.value)} placeholder={'SALSA DE MOSTAZA Y MIEL\nPOLLO MARINADO'} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
        <button onClick={onCancelar} style={{ fontFamily: SN, fontSize: 14, color: C.ink3, background: 'transparent', border: `1px solid ${C.linea}`, borderRadius: 8, padding: '9px 14px', cursor: 'pointer' }}>Cancelar</button>
        <button disabled={saving || !nombre.trim()} onClick={guardar} style={{ fontFamily: SN, fontSize: 14, fontWeight: 700, color: '#fff', background: saving || !nombre.trim() ? C.ink3 : C.verde, border: 'none', borderRadius: 8, padding: '9px 16px', cursor: saving ? 'default' : 'pointer' }}>{saving ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </div>
  )
}

function MiembroForm({ inicial, onGuardar, onCancelar, saving }: {
  inicial?: Miembro
  onGuardar: (v: Record<string, unknown>) => void
  onCancelar: () => void
  saving: boolean
}): ReactElement {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [pin, setPin] = useState(inicial?.pin ?? '')
  const [rol, setRol] = useState(inicial?.cocina_rol ?? 'cocinero')
  const [partidas, setPartidas] = useState<string[]>(inicial?.partidas ?? [])
  const togglePartida = (p: string) => setPartidas(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  const valido = nombre.trim() && /^\d{4}$/.test(pin)

  return (
    <div style={{ background: '#fff', border: `1px solid ${C.linea}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,160px),1fr))', gap: 10 }}>
        <div><label style={lbl}>Nombre *</label><input style={inp} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Marta" /></div>
        <div><label style={lbl}>PIN (4 dígitos) *</label><input style={inp} inputMode="numeric" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="4321" /></div>
        <div><label style={lbl}>Rol</label>
          <select style={inp} value={rol} onChange={e => setRol(e.target.value)}>
            <option value="cocinero">Cocinero</option>
            <option value="preparacion">Preparación</option>
            <option value="responsable">Co-responsable</option>
          </select>
        </div>
      </div>
      {rol === 'cocinero' && (
        <div style={{ marginTop: 12 }}>
          <label style={lbl}>Partidas que cubre</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {PARTIDAS.map(p => (
              <button key={p} type="button" onClick={() => togglePartida(p)} style={{ padding: '5px 12px', borderRadius: 20, cursor: 'pointer', fontFamily: SN, fontSize: 12, background: partidas.includes(p) ? C.verde : '#fff', color: partidas.includes(p) ? '#fff' : C.ink3, border: `1px solid ${partidas.includes(p) ? C.verde : C.linea}` }}>{PARTIDA_NOMBRE[p] ?? p}</button>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
        <button onClick={onCancelar} style={{ fontFamily: SN, fontSize: 14, color: C.ink3, background: 'transparent', border: `1px solid ${C.linea}`, borderRadius: 8, padding: '9px 14px', cursor: 'pointer' }}>Cancelar</button>
        <button disabled={saving || !valido} onClick={() => onGuardar({ nombre: nombre.trim(), pin, cocina_rol: rol, partidas })}
          style={{ fontFamily: SN, fontSize: 14, fontWeight: 700, color: '#fff', background: saving || !valido ? C.ink3 : C.verde, border: 'none', borderRadius: 8, padding: '9px 16px', cursor: saving ? 'default' : 'pointer' }}>{saving ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </div>
  )
}

export default function ProduccionCocinaCentralPage(): ReactElement {
  const [nombreLocal, setNombreLocal] = useState('Cocina central')
  const [ready, setReady]   = useState(false)
  const [recetas, setRecetas] = useState<Receta[]>([])
  const [eventos, setEventos] = useState<Evento[]>([])
  const [registros, setRegistros] = useState<Registro[]>([])
  const [saving, setSaving] = useState(false)
  const [editor, setEditor] = useState<{ modo: 'nuevo' | 'editar'; evento?: Evento } | null>(null)
  const [gestionAbierta, setGestion] = useState(false)
  const [editorReceta, setEditorReceta] = useState<{ modo: 'nuevo' | 'editar'; receta?: Receta } | null>(null)
  const [gestionRecetas, setGestionRecetas] = useState(false)
  const [recepciones, setRecepciones] = useState<Recepcion[]>([])
  const [gestionRecep, setGestionRecep] = useState(false)
  const [recPendientes, setRecPendientes] = useState<RecPendiente[]>([])
  const [recLeyendo, setRecLeyendo] = useState(false)
  const [recPlantilla, setRecPlantilla] = useState<string | null>(null)
  const [scanAbierto, setScanAbierto] = useState(false)
  const [fefo, setFefo] = useState<{ caducados: Array<{ producto: string; caducidad: string }>; porCaducar: Array<{ producto: string; caducidad: string }>; total: number } | null>(null)
  const [yo, setYo] = useState<{ cocina_rol: string; partidas: string[]; nombre: string; access_token: string | null }>({ cocina_rol: 'responsable', partidas: [], nombre: '', access_token: null })
  const [equipo, setEquipo] = useState<Miembro[]>([])
  const [gestionEquipo, setGestionEquipo] = useState(false)
  const [editorMiembro, setEditorMiembro] = useState<{ modo: 'nuevo' | 'editar'; miembro?: Miembro } | null>(null)
  const [asignaciones, setAsignaciones] = useState<Array<{ receta_id: string; trabajador_id: string | null; origen: string }>>([])
  const [sugForm, setSugForm] = useState<{ open: boolean; descripcion: string; pax: string; dietas: Array<{ dieta: string; comensales: number }> }>({ open: false, descripcion: '', pax: '', dietas: [] })
  const [sugiriendo, setSugiriendo] = useState(false)
  const [sugNotas, setSugNotas] = useState('')
  // Material del evento (panel desplegable bajo cada evento)
  const [matPanel, setMatPanel] = useState<{ evento: Evento; material: MatLinea[]; catalogo: MatCat[]; kits: MatKit[] } | null>(null)
  const [matAdd, setMatAdd] = useState({ kit_id: '', kit_cantidad: '1', material_id: '', cantidad: '1' })
  const [matBusy, setMatBusy] = useState(false)

  const cargar = useCallback(async () => {
    const [pr, rr, cr, yr, ar] = await Promise.all([
      fetch('/api/cocina/parte', { headers: sh() }),
      fetch('/api/cocina/registros', { headers: sh() }),
      fetch('/api/cocina/recepciones', { headers: sh() }),
      fetch('/api/cocina/yo', { headers: sh() }),
      fetch('/api/cocina/asignaciones', { headers: sh() }),
    ])
    const d = await pr.json().catch(() => ({ recetas: [], eventos: [] }))
    const reg = await rr.json().catch(() => ({ registros: [] }))
    const rec = await cr.json().catch(() => ({ recepciones: [] }))
    const me = await yr.json().catch(() => ({ cocina_rol: 'responsable', partidas: [], nombre: '', access_token: null }))
    const asg = await ar.json().catch(() => ({ asignaciones: [] }))
    setRecetas(d.recetas ?? [])
    setEventos(d.eventos ?? [])
    setRegistros(reg.registros ?? [])
    setRecepciones(rec.recepciones ?? [])
    setAsignaciones(asg.asignaciones ?? [])
    setYo({ cocina_rol: me.cocina_rol ?? 'responsable', partidas: me.partidas ?? [], nombre: me.nombre ?? '', access_token: me.access_token ?? null })
    if ((me.cocina_rol ?? 'responsable') === 'responsable') {
      const eq = await fetch('/api/cocina/personal', { headers: sh() }).then(r => r.json()).catch(() => ({ equipo: [] }))
      setEquipo(eq.equipo ?? [])
    }
  }, [])

  const asignar = async (receta_id: string, trabajador_id: string | null) => {
    await fetch('/api/cocina/asignaciones', { method: 'POST', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({ action: 'set', receta_id, trabajador_id }) })
    await cargar()
  }

  // ✨ La IA propone el menú principal (todos los PAX) y, por dieta, los platos adaptados del catálogo.
  // Abre el editor de evento prerrellenado (menú + grupos de dieta) para que Carmen lo revise.
  const sugerirMenu = async () => {
    if (!sugForm.descripcion.trim()) return
    setSugiriendo(true); setSugNotas('')
    try {
      const dietasIn = sugForm.dietas.filter(d => d.dieta.trim())
      const r = await fetch('/api/cocina/menu-sugerido', { method: 'POST', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({ descripcion: sugForm.descripcion, pax: sugForm.pax, dietas: dietasIn }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.ok) { window.alert(d.error ?? 'No se pudo sugerir el menú'); return }
      const ids: string[] = (d.menu ?? []).map((m: { receta_id: string }) => m.receta_id)
      if (ids.length === 0) { window.alert('La IA no encontró platos del catálogo para este evento. ' + (d.notas ?? '')); return }
      // Aplana las alternativas por dieta → un grupo de dieta por cada plato adaptado propuesto.
      const dietas: DietaUI[] = []
      for (const alt of (d.alternativas ?? []) as Array<{ dieta?: string; comensales?: number; platos?: Array<{ receta_id?: string }> }>) {
        const dieta = String(alt?.dieta ?? '').trim()
        const comensales = Number(alt?.comensales) || (dietasIn.find(x => x.dieta.toLowerCase() === dieta.toLowerCase())?.comensales ?? 0)
        for (const p of (alt?.platos ?? [])) {
          if (p?.receta_id) dietas.push({ receta_id: p.receta_id, dieta, comensales })
        }
      }
      setSugNotas(d.notas ?? '')
      setEditor({ modo: 'nuevo', evento: { id: '', nombre: sugForm.descripcion, pax: Number(sugForm.pax) || 0, fecha_evento: null, ubicacion: null, elaboraciones: ids, dietas } })
      setSugForm({ open: false, descripcion: '', pax: '', dietas: [] })
    } finally { setSugiriendo(false) }
  }

  const guardarMiembro = async (v: Record<string, unknown>) => {
    setSaving(true)
    try {
      if (editorMiembro?.modo === 'editar' && editorMiembro.miembro) {
        await fetch('/api/cocina/personal', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({ id: editorMiembro.miembro.id, ...v }) })
      } else {
        await fetch('/api/cocina/personal', { method: 'POST', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify(v) })
      }
      await cargar()
      setEditorMiembro(null)
    } finally { setSaving(false) }
  }
  const bajaMiembro = async (m: Miembro) => {
    await fetch('/api/cocina/personal', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({ id: m.id, activo: !m.activo }) })
    await cargar()
  }
  const borrarMiembro = async (m: Miembro) => {
    if (!window.confirm(`¿Borrar a ${m.nombre}?`)) return
    const r = await fetch('/api/cocina/personal', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({ id: m.id }) })
    if (!r.ok) { const e = await r.json().catch(() => ({})); window.alert(e.error ?? 'No se pudo borrar') }
    await cargar()
  }

  const accion = useCallback(async (receta_id: string, payload: Record<string, unknown>) => {
    await fetch('/api/cocina/registros', { method: 'POST', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({ receta_id, ...payload }) })
    const rr = await fetch('/api/cocina/registros', { headers: sh() })
    const reg = await rr.json().catch(() => ({ registros: [] }))
    setRegistros(reg.registros ?? [])
  }, [])

  // Carga el estado FEFO (caducados / por caducar) para el banner de Carmen.
  const cargarFefo = useCallback(async () => {
    try {
      const r = await fetch('/api/cocina/recepciones/caducidades?dias=3', { headers: sh() })
      const d = await r.json().catch(() => ({}))
      setFefo(d.ok && d.total > 0 ? { caducados: d.caducados ?? [], porCaducar: d.porCaducar ?? [], total: d.total } : null)
    } catch { /* silencioso */ }
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('ia_rest_session')
      if (!raw) { window.location.href = '/login'; return }
      const s = JSON.parse(raw)
      if (s?.restaurante_nombre) setNombreLocal(s.restaurante_nombre)
    } catch { window.location.href = '/login'; return }
    cargar().finally(() => setReady(true))
    cargarFefo()
  }, [cargar, cargarFefo])

  const ubNombre = useMemo(() => Object.fromEntries(eventos.map(e => [e.id, e.nombre])), [eventos])
  const minPorPax = useMemo(() => Object.fromEntries(recetas.map(r => [r.id, r.min_por_pax ?? 0.4])), [recetas])
  const registroPorReceta = useMemo(() => Object.fromEntries(registros.map(r => [r.receta_id, r])) as Record<string, Registro>, [registros])
  const recetaMuestra = useMemo(() => Object.fromEntries(recetas.map(r => [r.id, r.requiere_muestra ?? false])) as Record<string, boolean>, [recetas])

  const matchRecep = useCallback((nombre: string): Recepcion | undefined => {
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
    const limpia = norm(nombre)
    return recepciones.find(r => { const p = norm(r.producto); return !!p && (limpia.includes(p) || p.includes(limpia)) })
  }, [recepciones])

  const registrarTodos = async () => {
    const validos = recPendientes.filter(p => p.producto.trim())
    if (!validos.length) return
    setSaving(true)
    try {
      await Promise.allSettled(
        validos.map(p => fetch('/api/cocina/recepciones', { method: 'POST', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify(p) }))
      )
      setRecPendientes([])
      setRecPlantilla(null)
      await cargar()
    } finally { setSaving(false) }
  }
  const borrarRecepcion = async (id: string) => {
    await fetch(`/api/cocina/recepciones/${id}`, { method: 'DELETE', headers: sh() })
    await cargar()
  }

  // Reduce y recomprime la foto en el navegador. El motor de visión ahora es Gemini
  // (callAIVision: Gemini→NIM), que admite imágenes grandes, así que apuntamos a una
  // calidad alta (~1.8 MB) para que la letra pequeña (lote/caducidad) sea legible.
  // El endpoint admite hasta 4 MB; NIM (último recurso) la rechazaría, pero Gemini no.
  const fotoAJpegPequeno = async (file: File): Promise<{ base64: string; mediaType: string }> => {
    const LIMITE = 1_800_000 // bytes — alta calidad para OCR; bajo el tope de 4 MB del endpoint
    const crudo = async (): Promise<{ base64: string; mediaType: string }> => {
      const dataUrl: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file) })
      return { base64: dataUrl.split(',')[1] ?? '', mediaType: (dataUrl.match(/^data:([^;]+);/)?.[1]) || 'image/jpeg' }
    }
    if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') return crudo()
    let bmp: ImageBitmap
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions) }
    catch { return crudo() }
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) { bmp.close?.(); return crudo() }
    let mejor = ''
    for (let maxDim = 2200; maxDim >= 900; maxDim = Math.round(maxDim * 0.8)) {
      const escala = Math.min(1, maxDim / Math.max(bmp.width, bmp.height))
      canvas.width = Math.max(1, Math.round(bmp.width * escala))
      canvas.height = Math.max(1, Math.round(bmp.height * escala))
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
      for (let q = 0.82; q >= 0.4; q -= 0.12) {
        mejor = canvas.toDataURL('image/jpeg', q).split(',')[1] ?? ''
        if (Math.floor(mejor.length * 3 / 4) <= LIMITE) { bmp.close?.(); return { base64: mejor, mediaType: 'image/jpeg' } }
      }
    }
    bmp.close?.()
    return { base64: mejor, mediaType: 'image/jpeg' } // lo más pequeño que se pudo
  }

  // 📷 Batch: cada foto acumula productos en recPendientes; si el proveedor es conocido usa su plantilla
  const añadirFotoACola = async (file: File) => {
    setRecLeyendo(true)
    try {
      const { base64, mediaType } = await fotoAJpegPequeno(file)
      if (!base64) { window.alert('No se pudo procesar la imagen. Inténtalo de nuevo.'); return }
      // Foto-evidencia APPCC: subir la ORIGINAL al bucket privado (best-effort, no bloquea la lectura).
      let evidenciaUrl = ''
      try {
        const fd = new FormData(); fd.append('file', file)
        const er = await fetch('/api/cocina/recepciones/evidencia', { method: 'POST', headers: sh(), body: fd })
        const ed = await er.json().catch(() => ({}))
        if (ed.ok && ed.url) evidenciaUrl = String(ed.url)
      } catch { /* la evidencia es opcional */ }
      const r = await fetch('/api/cocina/recepciones/reconocer', { method: 'POST', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({ imagen: base64, mediaType }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.ok) { window.alert(d.error ?? 'No se pudo leer la imagen'); return }
      const proveedor: string = String(d.proveedor ?? '')
      // Si hay proveedor, intentar cargar su plantilla (pedido habitual)
      if (proveedor) {
        const pr = await fetch(`/api/cocina/recepciones/plantilla?proveedor=${encodeURIComponent(proveedor)}`, { headers: sh() })
        const pd = await pr.json().catch(() => ({}))
        if (pd.ok && pd.productos?.length > 0) {
          setRecPendientes(prev => [...prev, ...(pd.productos as Array<Record<string, unknown>>).map(p => ({
            producto: String(p.producto ?? ''), proveedor: String(p.proveedor ?? proveedor),
            lote: String(p.lote ?? ''), temperatura: p.temperatura != null ? String(p.temperatura) : '',
            caducidad: String(p.caducidad ?? ''), conforme: p.conforme !== false,
            evidencia_url: evidenciaUrl || undefined,
          }))])
          setRecPlantilla(proveedor)
          return
        }
      }
      // Sin plantilla → acumular lo que leyó la IA
      const prods: Array<Record<string, unknown>> = d.productos ?? []
      if (prods.length === 0) { window.alert('No se reconoció ningún producto. Añádelo con + Manual.'); return }
      setRecPendientes(prev => [...prev, ...prods.map(p => ({
        producto: String(p.producto ?? ''), proveedor: String(p.proveedor ?? proveedor),
        lote: String(p.lote ?? ''), temperatura: p.temperatura != null ? String(p.temperatura) : '',
        caducidad: String(p.caducidad ?? ''), conforme: p.conforme !== false,
        codigo_barras: typeof p.codigo_barras === 'string' && p.codigo_barras ? String(p.codigo_barras) : undefined,
        evidencia_url: evidenciaUrl || undefined,
      }))])
    } catch {
      window.alert('No se pudo leer la imagen. Comprueba la conexión e inténtalo de nuevo.')
    } finally { setRecLeyendo(false) }
  }

  // Resuelve un EAN escaneado (catálogo propio → Open Food Facts) y acumula una fila.
  const añadirEanACola = async (code: string) => {
    const limpio = code.replace(/\D/g, '')
    if (!/^\d{8,14}$/.test(limpio)) return
    if (recPendientes.some(p => p.codigo_barras === limpio)) return // dedupe en la cola
    try {
      const r = await fetch(`/api/cocina/recepciones/ean?code=${limpio}`, { headers: sh() })
      const d = await r.json().catch(() => ({}))
      const producto = d.ok && d.producto ? String(d.producto) : `Código ${limpio}`
      setRecPendientes(prev => [...prev, { producto, proveedor: d.proveedor ? String(d.proveedor) : '', lote: '', temperatura: '', caducidad: '', conforme: true, codigo_barras: limpio }])
    } catch {
      setRecPendientes(prev => [...prev, { producto: `Código ${limpio}`, proveedor: '', lote: '', temperatura: '', caducidad: '', conforme: true, codigo_barras: limpio }])
    }
  }

  // Lee la temperatura de una foto de la sonda y la vuelca en la fila i.
  const leerTemperaturaFila = async (i: number, file: File) => {
    try {
      const { base64, mediaType } = await fotoAJpegPequeno(file)
      if (!base64) return
      const r = await fetch('/api/cocina/recepciones/temperatura', { method: 'POST', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({ imagen: base64, mediaType }) })
      const d = await r.json().catch(() => ({}))
      if (d.ok && d.temperatura != null) setRecPendientes(prev => prev.map((r2, j) => j === i ? { ...r2, temperatura: String(d.temperatura) } : r2))
      else window.alert('No se pudo leer la temperatura. Tecléala a mano.')
    } catch { window.alert('No se pudo leer la temperatura.') }
  }

  const parte = useMemo(() => {
    const ev: EventoInput[] = eventos.map(e => ({ id: e.id, nombre: e.nombre, pax: e.pax, fecha_evento: e.fecha_evento ?? '', elaboraciones: e.elaboraciones, dietas: e.dietas }))
    return generarParte(recetas, ev)
  }, [recetas, eventos])
  const total = paxTotal(parte)

  // Equipo real de cocineros (con sus partidas como capacidades); fallback a la semilla si aún no hay equipo
  const cocineros = useMemo<Trabajador[]>(() => {
    const reales = equipo.filter(m => m.cocina_rol === 'cocinero' && m.activo)
      .map(m => ({ id: m.id, nombre: m.nombre, rol: 'cocinero', roles: m.partidas, disponible: true }))
    return reales.length > 0 ? reales : COCINEROS
  }, [equipo])

  const duracionTarea = useCallback((e: ElaboracionTraza) => {
    // Las líneas de dieta producen solo sus raciones (comensales); el resto, el PAX del evento.
    const pax = e.comensales ?? e.ubicaciones.reduce((a, id) => a + (eventos.find(ev => ev.id === id)?.pax ?? 0), 0)
    return Math.max(10, Math.round((minPorPax[e.receta_base ?? e.id] ?? 0.4) * pax))
  }, [eventos, minPorPax])

  const asignMap = useMemo(() => Object.fromEntries(asignaciones.map(a => [a.receta_id, a.trabajador_id])) as Record<string, string | null>, [asignaciones])
  const nombreTrab = useMemo(() => Object.fromEntries(cocineros.map(c => [c.id, c.nombre])) as Record<string, string>, [cocineros])
  const cocinerosDePartida = useCallback((p: string | null | undefined) => cocineros.filter(c => !p || (c.roles ?? []).includes(p)), [cocineros])
  const cargaPorCocinero = useMemo(() => {
    const m: Record<string, number> = {}
    parte.elaboraciones.forEach(e => { const t = asignMap[e.id]; if (t) m[t] = (m[t] ?? 0) + duracionTarea(e) })
    return m
  }, [parte, asignMap, duracionTarea])

  // La IA propone el reparto (por partida, balanceando carga); Carmen luego ajusta a mano.
  const reasignarIA = async () => {
    // El reparto se hace sobre las recetas reales (no las líneas de dieta, que comparten receta base).
    const tareas: Tarea[] = parte.elaboraciones.filter(e => !e.dieta).map(e => ({ id: e.id, nombre: e.nombre, tipo: 'elaboracion', partida: e.partida ?? undefined, requiere_rol: e.partida ?? undefined, duracion_estimada_min: duracionTarea(e), prioridad: e.partida === 'caliente' ? 'alta' : 'normal' }))
    const plan = asignarTrabajo(tareas, cocineros)
    const items = plan.asignaciones.map(a => ({ receta_id: a.tarea_id, trabajador_id: a.trabajador_id }))
    await fetch('/api/cocina/asignaciones', { method: 'POST', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({ action: 'bulk', origen: 'ia', asignaciones: items }) })
    await cargar()
  }

  const esResponsable = yo.cocina_rol === 'responsable'
  const esCocinero    = yo.cocina_rol === 'cocinero'
  const esPreparacion = yo.cocina_rol === 'preparacion'

  const porPartida = useMemo(() => {
    const orden = ['frio', 'caliente', 'corte', 'montaje']
    let grupos = orden.map(p => ({ partida: p, elabs: parte.elaboraciones.filter(e => e.partida === p) })).filter(g => g.elabs.length > 0)
    // El cocinero solo ve su(s) partida(s); responsable y preparación ven todo.
    if (esCocinero && yo.partidas.length > 0) grupos = grupos.filter(g => yo.partidas.includes(g.partida))
    return grupos
  }, [parte, esCocinero, yo.partidas])

  // Bases a preparar (sub-elaboraciones 'depende de') — vista de preparación
  const basesPreparacion = useMemo(() => {
    const set = new Set<string>()
    parte.elaboraciones.forEach(e => (e.depende_de ?? []).forEach(b => set.add(b)))
    return Array.from(set)
  }, [parte])

  const muestras = muestrasACaducar(parte.elaboraciones, '2026-06-22T20:00:00Z', 2)

  // Avisos de seguridad de dietas (#3): plato con alérgeno incompatible / comensales > PAX.
  const avisos = useMemo(() => {
    const ev: EventoInput[] = eventos.map(e => ({ id: e.id, nombre: e.nombre, pax: e.pax, fecha_evento: e.fecha_evento ?? '', elaboraciones: e.elaboraciones, dietas: e.dietas }))
    return avisosDietas(ev, recetas)
  }, [eventos, recetas])

  // Resumen de dietas por evento (#4 — para sala): "5 sin gluten · 3 veganos".
  const resumenDietas = useMemo(() => eventos.map(e => {
    const m = new Map<string, number>()
    for (const d of e.dietas) m.set(d.dieta, (m.get(d.dieta) ?? 0) + d.comensales)
    return { evento: e, grupos: [...m.entries()].map(([dieta, comensales]) => ({ dieta, comensales })) }
  }).filter(x => x.grupos.length > 0), [eventos])

  // Hoja de alérgenos del evento (#1 — imprimible): cada elaboración con sus alérgenos.
  const hojaAlergenos = useMemo(() => parte.elaboraciones.map(e => ({
    id: e.id, nombre: e.nombre, dieta: e.dieta ?? null, comensales: e.comensales ?? null,
    alergenos: alergenosElaboracion(e),
  })), [parte])

  const salir = () => {
    try { localStorage.removeItem('ia_rest_session'); localStorage.removeItem('ia_kds_token') } catch { /* noop */ }
    window.location.href = '/login'
  }

  const guardarEvento = async (v: { nombre: string; fecha_evento: string; pax: number; ubicacion: string; elaboraciones: string[]; dietas: DietaUI[] }) => {
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

  // Crea/enlaza la ficha de evento del CRM (presupuesto/espacio/fechas) para esta boda.
  // El material del evento queda anclado a esa ficha (misma boda en cocina + material + CRM).
  const vincularCRM = async (ev: Evento) => {
    if (!window.confirm(`Crear la ficha de evento (CRM) de "${ev.nombre}"?\nUnifica cocina + material + presupuesto en la misma boda.`)) return
    setSaving(true)
    try {
      const r = await fetch(`/api/cocina/eventos/${ev.id}/crm`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({}) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { window.alert(d.error ?? 'No se pudo crear la ficha CRM'); return }
      await cargar()
      if (matPanel?.evento.id === ev.id) await refrescarMaterial()
    } finally { setSaving(false) }
  }

  // ── Material del evento ───────────────────────────────────────
  const cargarMaterial = async (evId: string) => {
    const r = await fetch(`/api/cocina/eventos/${evId}/material`, { headers: sh() })
    const d = await r.json().catch(() => ({}))
    return { material: (d.material ?? []) as MatLinea[], catalogo: (d.catalogo ?? []) as MatCat[], kits: (d.kits ?? []) as MatKit[] }
  }
  const abrirMaterial = async (ev: Evento) => {
    if (matPanel?.evento.id === ev.id) { setMatPanel(null); return }
    setMatBusy(true)
    try {
      const d = await cargarMaterial(ev.id)
      setMatPanel({ evento: ev, ...d })
      setMatAdd({ kit_id: '', kit_cantidad: '1', material_id: '', cantidad: '1' })
    } finally { setMatBusy(false) }
  }
  const refrescarMaterial = async () => {
    if (!matPanel) return
    const d = await cargarMaterial(matPanel.evento.id)
    setMatPanel(p => p ? { ...p, ...d } : p)
  }
  const agregarMaterial = async (payload: Record<string, unknown>) => {
    if (!matPanel) return
    setMatBusy(true)
    try {
      const r = await fetch(`/api/cocina/eventos/${matPanel.evento.id}/material`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify(payload) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { window.alert(d.error ?? 'No se pudo añadir el material'); return }
      await refrescarMaterial()
      setMatAdd(a => ({ ...a, kit_id: '', material_id: '', cantidad: '1', kit_cantidad: '1' }))
    } finally { setMatBusy(false) }
  }
  const quitarMaterial = async (asignacion_id: string) => {
    if (!matPanel) return
    setMatBusy(true)
    try {
      const r = await fetch(`/api/cocina/eventos/${matPanel.evento.id}/material`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify({ asignacion_id }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { window.alert(d.error ?? 'No se pudo quitar'); return }
      await refrescarMaterial()
    } finally { setMatBusy(false) }
  }

  const guardarReceta = async (v: Record<string, unknown>) => {
    setSaving(true)
    try {
      if (editorReceta?.modo === 'editar' && editorReceta.receta) {
        await fetch(`/api/cocina/recetas/${editorReceta.receta.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify(v) })
      } else {
        await fetch('/api/cocina/recetas', { method: 'POST', headers: { 'Content-Type': 'application/json', ...sh() }, body: JSON.stringify(v) })
      }
      await cargar()
      setEditorReceta(null)
    } finally { setSaving(false) }
  }

  const borrarReceta = async (r: Receta) => {
    if (!window.confirm(`¿Borrar la elaboración "${r.nombre}"? Se quitará de los eventos que la usen.`)) return
    await fetch(`/api/cocina/recetas/${r.id}`, { method: 'DELETE', headers: sh() })
    await cargar()
  }

  if (!ready) return <div style={{ minHeight: '100dvh', background: C.papel }} />

  return (
    <div style={{ minHeight: '100dvh', background: C.papel, color: C.tinta, fontFamily: SN }}>
      <style>{`@media print { .noprint { display:none !important } .solo-print { display:inline !important } .solo-print-block { display:block !important } body { background:#fff !important } }`}</style>

      {/* Header fino (sin voz, sin mesas) */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: `1px solid ${C.linea}`, padding: '10px clamp(14px,4vw,28px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <Wordmark nombre={nombreLocal} sub="Cocina central" />
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
          <div className="noprint" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {esResponsable && (
              <button onClick={() => { setGestion(v => !v); setGestionRecetas(false) }} style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: gestionAbierta ? '#fff' : C.verde, background: gestionAbierta ? C.verde : 'transparent', border: `1px solid ${C.verde}`, borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>
                {gestionAbierta ? 'Cerrar' : '✎ Eventos'}
              </button>
            )}
            {esResponsable && (
              <button onClick={() => { setGestionRecetas(v => !v); setGestion(false); setGestionRecep(false) }} style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: gestionRecetas ? '#fff' : C.oro, background: gestionRecetas ? C.oro : 'transparent', border: `1px solid ${C.oro}`, borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>
                {gestionRecetas ? 'Cerrar' : '✎ Recetas'}
              </button>
            )}
            {(esResponsable || esPreparacion) && (
              <button onClick={() => { setGestionRecep(v => !v); setGestion(false); setGestionRecetas(false); setGestionEquipo(false) }} style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: gestionRecep ? '#fff' : C.ambar, background: gestionRecep ? C.ambar : 'transparent', border: `1px solid ${C.ambar}`, borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>
                {gestionRecep ? 'Cerrar' : '📦 Recepción'}
              </button>
            )}
            {esResponsable && (
              <button onClick={() => { setGestionEquipo(v => !v); setGestion(false); setGestionRecetas(false); setGestionRecep(false) }} style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: gestionEquipo ? '#fff' : C.tinta, background: gestionEquipo ? C.tinta : 'transparent', border: `1px solid ${C.tinta}`, borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>
                {gestionEquipo ? 'Cerrar' : '👥 Equipo'}
              </button>
            )}
          </div>
        </div>

        {/* Gestión de equipo (solo responsable) */}
        {gestionEquipo && esResponsable && (
          <div className="noprint" style={{ background: 'rgba(30,38,34,.04)', border: `1px solid ${C.linea}`, borderRadius: 14, padding: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 18, color: C.tinta }}>Equipo de cocina</div>
              {!editorMiembro && <button onClick={() => setEditorMiembro({ modo: 'nuevo' })} style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: '#fff', background: C.verde, border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>+ Nuevo miembro</button>}
            </div>
            <div style={{ fontFamily: SN, fontSize: 12.5, color: C.ink3, marginBottom: 12 }}>
              Cada persona entra con el <strong>enlace del local + su PIN</strong>{yo.access_token ? <> · enlace: <code style={{ fontSize: 11 }}>iarest.es/login?t={yo.access_token}</code></> : null}
            </div>

            {editorMiembro && (
              <MiembroForm inicial={editorMiembro.miembro} saving={saving} onCancelar={() => setEditorMiembro(null)} onGuardar={guardarMiembro} />
            )}

            {!editorMiembro && equipo.map(m => (
              <div key={m.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${C.linea}`, opacity: m.activo ? 1 : .5 }}>
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <div style={{ fontFamily: SN, fontWeight: 700, fontSize: 14, color: C.tinta }}>
                    {m.nombre} <span style={{ fontFamily: SN, fontSize: 11, fontWeight: 700, color: C.oro, marginLeft: 4 }}>{COCINA_ROL_LABEL[m.cocina_rol] ?? m.cocina_rol}</span>{!m.activo && <span style={{ fontSize: 11, color: C.ink3 }}> · baja</span>}
                  </div>
                  <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>
                    PIN <strong>{m.pin}</strong>{m.cocina_rol === 'cocinero' && m.partidas.length > 0 ? ` · ${m.partidas.map(p => PARTIDA_NOMBRE[p] ?? p).join(', ')}` : ''}
                  </div>
                </div>
                <button onClick={() => setEditorMiembro({ modo: 'editar', miembro: m })} style={{ fontFamily: SN, fontSize: 12.5, color: C.verde, background: 'transparent', border: `1px solid ${C.linea}`, borderRadius: 7, padding: '6px 12px', cursor: 'pointer' }}>Editar</button>
                <button onClick={() => bajaMiembro(m)} style={{ fontFamily: SN, fontSize: 12.5, color: C.ink3, background: 'transparent', border: `1px solid ${C.linea}`, borderRadius: 7, padding: '6px 12px', cursor: 'pointer' }}>{m.activo ? 'Baja' : 'Alta'}</button>
                <button onClick={() => borrarMiembro(m)} style={{ fontFamily: SN, fontSize: 12.5, color: C.rojo, background: 'transparent', border: `1px solid ${C.linea}`, borderRadius: 7, padding: '6px 12px', cursor: 'pointer' }}>Borrar</button>
              </div>
            ))}
            {!editorMiembro && equipo.length === 0 && <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3 }}>Aún no hay equipo. Pulsa "+ Nuevo miembro" para dar de alta a tus cocineros y preparación.</div>}
          </div>
        )}

        {/* Banner de rol (cocinero / preparación) */}
        {!esResponsable && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, background: esPreparacion ? 'rgba(154,107,18,.08)' : 'rgba(2,71,59,.06)', border: `1px solid ${esPreparacion ? C.ambar : C.verde}`, borderRadius: 12, padding: '8px 14px', marginBottom: 16 }}>
            <span style={{ fontFamily: SN, fontWeight: 800, fontSize: 13, color: esPreparacion ? C.ambar : C.verde }}>{esPreparacion ? '🔪 Preparación' : '👨‍🍳 Cocinero'}{yo.nombre ? ` · ${yo.nombre}` : ''}</span>
            {esCocinero && (
              <span style={{ fontFamily: SN, fontSize: 12.5, color: C.ink3 }}>
                {yo.partidas.length > 0 ? `Tu partida: ${yo.partidas.map(p => PARTIDA_NOMBRE[p] ?? p).join(', ')}` : 'Sin partida asignada — habla con el responsable'}
              </span>
            )}
            {esPreparacion && <span style={{ fontFamily: SN, fontSize: 12.5, color: C.ink3 }}>Recepción de mercancía + bases (mise en place)</span>}
          </div>
        )}

        {/* Bases a preparar (mise en place) — vista de preparación */}
        {esPreparacion && basesPreparacion.length > 0 && (
          <div style={{ background: '#fff', border: `1px solid ${C.linea}`, borderRadius: 14, padding: 16, marginBottom: 20 }}>
            <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 18, color: C.tinta, marginBottom: 10 }}>Bases a preparar</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {basesPreparacion.map(b => (
                <span key={b} style={{ fontFamily: SN, fontSize: 12.5, color: C.tinta, background: C.papel, border: `1px solid ${C.linea}`, borderRadius: 8, padding: '5px 10px' }}>{b}</span>
              ))}
            </div>
          </div>
        )}

        {/* Recepción de mercancía (albaranes) — batch: N fotos → tabla de revisión → registrar todo */}
        {gestionRecep && (
          <div className="noprint" style={{ background: 'rgba(154,107,18,.05)', border: `1px solid ${C.linea}`, borderRadius: 14, padding: 16, marginBottom: 20 }}>
            {/* Header */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
              <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 18, color: C.ambar }}>Recepción de mercancía</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <label style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: recLeyendo ? C.ink3 : '#fff', background: recLeyendo ? C.ink3 : C.ambar, border: 'none', borderRadius: 8, padding: '8px 14px', cursor: recLeyendo ? 'default' : 'pointer' }}>
                  {recLeyendo ? 'Leyendo…' : '📷 Añadir foto'}
                  <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} disabled={recLeyendo} onChange={e => { const f = e.target.files?.[0]; if (f) añadirFotoACola(f); e.currentTarget.value = '' }} />
                </label>
                <button onClick={() => setScanAbierto(true)} style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: '#fff', background: C.verde, border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>🔢 Escanear</button>
                <button onClick={() => setRecPendientes(p => [...p, { producto: '', proveedor: '', lote: '', temperatura: '', caducidad: '', conforme: true }])} style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.ambar, background: 'transparent', border: `1px solid ${C.ambar}`, borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>+ Manual</button>
              </div>
            </div>
            <div style={{ fontFamily: SN, fontSize: 12.5, color: C.ink3, marginBottom: 12 }}>Escanea el código de barras, haz fotos del albarán/etiqueta o añade a mano — todo se acumula en la tabla para revisar antes de registrar.</div>

            {/* Banner FEFO — caducidades (solo en pantalla, para la responsable) */}
            {fefo && (
              <div style={{ background: 'rgba(217,68,43,.08)', border: `1px solid ${C.rojo}`, borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
                <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: C.rojo, marginBottom: 4 }}>⚠️ Revisa caducidades ({fefo.total})</div>
                {fefo.caducados.map((c, i) => (<div key={'cad' + i} style={{ fontFamily: SN, fontSize: 12.5, color: C.rojo }}>🔴 <b>{c.producto}</b> caducó el {c.caducidad}</div>))}
                {fefo.porCaducar.map((c, i) => (<div key={'pc' + i} style={{ fontFamily: SN, fontSize: 12.5, color: C.ambar }}>🟠 <b>{c.producto}</b> caduca el {c.caducidad}</div>))}
              </div>
            )}

            {/* Banner pedido habitual detectado */}
            {recPlantilla && (
              <div style={{ background: 'rgba(2,71,59,.08)', border: `1px solid rgba(2,71,59,.3)`, borderRadius: 10, padding: '8px 12px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontFamily: SN, fontSize: 13, color: C.verde }}>✓ Pedido habitual de <b>{recPlantilla}</b> detectado — revisa y confirma</span>
                <button onClick={() => setRecPlantilla(null)} style={{ background: 'transparent', border: 'none', color: C.ink3, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
              </div>
            )}

            {/* Tabla de pendientes */}
            {recPendientes.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: SN, fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.linea}` }}>
                        {['Producto *', 'Proveedor', 'Lote', 'Tª', 'Caducidad', '✓', ''].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '4px 6px', color: C.ink3, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recPendientes.map((p, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${C.linea}` }}>
                          <td style={{ padding: '4px 4px' }}><input style={{ ...inp, minWidth: 120, fontSize: 13, padding: '6px 8px' }} value={p.producto} placeholder="producto *" onChange={e => setRecPendientes(prev => prev.map((r, j) => j === i ? { ...r, producto: e.target.value } : r))} /></td>
                          <td style={{ padding: '4px 4px' }}><input style={{ ...inp, minWidth: 90, fontSize: 13, padding: '6px 8px' }} value={p.proveedor} onChange={e => setRecPendientes(prev => prev.map((r, j) => j === i ? { ...r, proveedor: e.target.value } : r))} /></td>
                          <td style={{ padding: '4px 4px' }}><input style={{ ...inp, minWidth: 70, fontSize: 13, padding: '6px 8px' }} value={p.lote} onChange={e => setRecPendientes(prev => prev.map((r, j) => j === i ? { ...r, lote: e.target.value } : r))} /></td>
                          <td style={{ padding: '4px 4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <input style={{ ...inp, minWidth: 55, fontSize: 13, padding: '6px 8px' }} type="number" step="0.1" value={p.temperatura} onChange={e => setRecPendientes(prev => prev.map((r, j) => j === i ? { ...r, temperatura: e.target.value } : r))} />
                              <label title="Foto de la sonda" style={{ cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>🌡️
                                <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) leerTemperaturaFila(i, f); e.currentTarget.value = '' }} />
                              </label>
                            </div>
                          </td>
                          <td style={{ padding: '4px 4px' }}><input style={{ ...inp, minWidth: 110, fontSize: 13, padding: '6px 8px' }} type="date" value={p.caducidad} onChange={e => setRecPendientes(prev => prev.map((r, j) => j === i ? { ...r, caducidad: e.target.value } : r))} /></td>
                          <td style={{ padding: '4px 8px', textAlign: 'center' }}><input type="checkbox" checked={p.conforme} onChange={e => setRecPendientes(prev => prev.map((r, j) => j === i ? { ...r, conforme: e.target.checked } : r))} /></td>
                          <td style={{ padding: '4px 4px' }}><button onClick={() => setRecPendientes(prev => prev.filter((_, j) => j !== i))} style={{ background: 'transparent', border: 'none', color: C.rojo, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>×</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                  <button disabled={saving || recPendientes.every(p => !p.producto.trim())} onClick={registrarTodos} style={{ fontFamily: SN, fontSize: 14, fontWeight: 700, color: '#fff', background: saving || recPendientes.every(p => !p.producto.trim()) ? C.ink3 : C.ambar, border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer' }}>
                    Registrar todo ({recPendientes.filter(p => p.producto.trim()).length})
                  </button>
                </div>
              </div>
            )}

            {/* Lista de recepciones ya registradas hoy */}
            <div style={{ marginTop: recPendientes.length > 0 ? 8 : 0 }}>
              {recepciones.length > 0 && <div style={{ fontFamily: SN, fontSize: 11, fontWeight: 600, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Registradas hoy</div>}
              {recepciones.map(r => (
                <div key={r.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `1px solid ${C.linea}` }}>
                  <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <div style={{ fontFamily: SN, fontWeight: 700, fontSize: 14, color: C.tinta }}>{r.producto} {!r.conforme && <span style={{ color: C.rojo, fontSize: 12 }}>· no conforme</span>}</div>
                    <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>Lote {r.lote || '—'} · {r.proveedor || 'sin proveedor'}{r.temperatura != null ? ` · ${r.temperatura}°` : ''}{r.caducidad ? ` · cad. ${r.caducidad}` : ''}</div>
                  </div>
                  <button onClick={() => borrarRecepcion(r.id)} style={{ fontFamily: SN, fontSize: 12.5, color: C.rojo, background: 'transparent', border: `1px solid ${C.linea}`, borderRadius: 7, padding: '6px 12px', cursor: 'pointer' }}>Borrar</button>
                </div>
              ))}
              {recepciones.length === 0 && recPendientes.length === 0 && <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3 }}>Aún no hay recepciones registradas hoy.</div>}
            </div>

            {scanAbierto && (
              <ScannerEan onCode={añadirEanACola} onClose={() => setScanAbierto(false)} />
            )}
          </div>
        )}

        {/* Gestión de recetas (catálogo de elaboraciones) */}
        {gestionRecetas && (
          <div className="noprint" style={{ background: 'rgba(158,129,82,.05)', border: `1px solid ${C.linea}`, borderRadius: 14, padding: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 18, color: C.oro }}>Catálogo de elaboraciones</div>
              {!editorReceta && <button onClick={() => setEditorReceta({ modo: 'nuevo' })} style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: '#fff', background: C.oro, border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>+ Nueva receta</button>}
            </div>

            {editorReceta && (
              <RecetaForm inicial={editorReceta.receta} saving={saving} onCancelar={() => setEditorReceta(null)} onGuardar={guardarReceta} />
            )}

            {!editorReceta && recetas.map(r => (
              <div key={r.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${C.linea}` }}>
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <div style={{ fontFamily: SN, fontWeight: 700, fontSize: 14, color: C.tinta }}>{r.nombre}</div>
                  <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>{r.partida ?? 'sin partida'} · {r.ingredientes.length} ingredientes</div>
                </div>
                <button onClick={() => setEditorReceta({ modo: 'editar', receta: r })} style={{ fontFamily: SN, fontSize: 12.5, color: C.oro, background: 'transparent', border: `1px solid ${C.linea}`, borderRadius: 7, padding: '6px 12px', cursor: 'pointer' }}>Editar</button>
                <button onClick={() => borrarReceta(r)} style={{ fontFamily: SN, fontSize: 12.5, color: C.rojo, background: 'transparent', border: `1px solid ${C.linea}`, borderRadius: 7, padding: '6px 12px', cursor: 'pointer' }}>Borrar</button>
              </div>
            ))}
            {!editorReceta && recetas.length === 0 && <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3 }}>Aún no hay recetas. Pulsa "+ Nueva receta".</div>}
          </div>
        )}

        {/* Gestión de eventos (añadir / editar / borrar) */}
        {gestionAbierta && (
          <div className="noprint" style={{ background: 'rgba(2,71,59,.04)', border: `1px solid ${C.linea}`, borderRadius: 14, padding: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 18, color: C.verde }}>Eventos</div>
              {!editor && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setSugForm(f => ({ ...f, open: !f.open }))} style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: sugForm.open ? '#fff' : C.oro, background: sugForm.open ? C.oro : 'transparent', border: `1px solid ${C.oro}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>✨ Sugerir menú</button>
                  <button onClick={() => setEditor({ modo: 'nuevo' })} style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: '#fff', background: C.verde, border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>+ Nuevo evento</button>
                </div>
              )}
            </div>

            {!editor && sugForm.open && (
              <div style={{ background: 'rgba(158,129,82,.06)', border: `1px solid ${C.linea}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
                <div style={{ fontFamily: SN, fontSize: 12.5, color: C.ink3, marginBottom: 10 }}>Describe el evento y la IA propone el <strong>menú principal</strong> (para todos). Si hay comensales con dieta, añádelos abajo y la IA propondrá su <strong>plato adaptado</strong> del catálogo — sin cambiar el menú de todos.</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,150px),1fr))', gap: 8 }}>
                  <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Evento *</label><input style={inp} value={sugForm.descripcion} onChange={e => setSugForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Ej: boda 150 pax, menú mediterráneo" /></div>
                  <div><label style={lbl}>PAX</label><input style={inp} type="number" value={sugForm.pax} onChange={e => setSugForm(f => ({ ...f, pax: e.target.value }))} /></div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                    <label style={{ ...lbl, marginBottom: 0 }}>🟢 Comensales con dieta (opcional)</label>
                    <button type="button" onClick={() => setSugForm(f => ({ ...f, dietas: [...f.dietas, { dieta: DIETAS_COMUNES[0], comensales: 1 }] }))} style={{ fontFamily: SN, fontSize: 12, color: C.oro, background: 'transparent', border: `1px dashed ${C.oro}`, borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}>+ dieta</button>
                  </div>
                  {sugForm.dietas.map((d, i) => (
                    <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                      <input list="dietas-comunes" style={{ ...inp, flex: '1 1 130px', fontSize: 13, padding: '7px 9px' }} placeholder="dieta" value={d.dieta} onChange={e => setSugForm(f => ({ ...f, dietas: f.dietas.map((x, j) => j === i ? { ...x, dieta: e.target.value } : x) }))} />
                      <input style={{ ...inp, flex: '0 1 70px', fontSize: 13, padding: '7px 9px' }} type="number" min="1" placeholder="nº" value={d.comensales || ''} onChange={e => setSugForm(f => ({ ...f, dietas: f.dietas.map((x, j) => j === i ? { ...x, comensales: parseInt(e.target.value) || 0 } : x) }))} />
                      <button type="button" onClick={() => setSugForm(f => ({ ...f, dietas: f.dietas.filter((_, j) => j !== i) }))} style={{ fontFamily: SN, fontSize: 13, color: C.rojo, background: 'transparent', border: `1px solid ${C.linea}`, borderRadius: 7, padding: '6px 9px', cursor: 'pointer' }}>✕</button>
                    </div>
                  ))}
                  <datalist id="dietas-comunes">{DIETAS_COMUNES.map(x => <option key={x} value={x} />)}</datalist>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                  <button disabled={sugiriendo || !sugForm.descripcion.trim()} onClick={sugerirMenu} style={{ fontFamily: SN, fontSize: 14, fontWeight: 700, color: '#fff', background: sugiriendo || !sugForm.descripcion.trim() ? C.ink3 : C.oro, border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer' }}>{sugiriendo ? 'Pensando…' : '✨ Proponer menú'}</button>
                </div>
              </div>
            )}

            {editor && (
              <>
                {sugNotas && <div style={{ fontFamily: SN, fontSize: 12.5, color: C.oro, marginBottom: 8 }}>✨ {sugNotas}</div>}
                <EventoForm recetas={recetas} inicial={editor.evento} saving={saving} onCancelar={() => { setEditor(null); setSugNotas('') }} onGuardar={guardarEvento} />
              </>
            )}

            {!editor && eventos.map(ev => (
              <div key={ev.id} style={{ borderBottom: `1px solid ${C.linea}` }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '10px 0' }}>
                  <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <div style={{ fontFamily: SN, fontWeight: 700, fontSize: 14, color: C.tinta }}>{ev.nombre}</div>
                    <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>{ev.fecha_evento ?? 'sin fecha'} · {ev.pax} PAX · {ev.elaboraciones.length} elaboraciones</div>
                  </div>
                  {ev.evento_id
                    ? <Chip bg="rgba(2,71,59,.08)" fg={C.verde} br={C.verde}>🔗 Ficha CRM</Chip>
                    : <button onClick={() => vincularCRM(ev)} style={{ fontFamily: SN, fontSize: 12.5, fontWeight: 700, color: C.verde, background: 'transparent', border: `1px dashed ${C.verde}`, borderRadius: 7, padding: '6px 12px', cursor: 'pointer' }}>🔗 Ficha CRM</button>}
                  <button onClick={() => abrirMaterial(ev)} style={{ fontFamily: SN, fontSize: 12.5, fontWeight: 700, color: matPanel?.evento.id === ev.id ? '#fff' : C.oro, background: matPanel?.evento.id === ev.id ? C.oro : 'transparent', border: `1px solid ${C.oro}`, borderRadius: 7, padding: '6px 12px', cursor: 'pointer' }}>📦 Material</button>
                  <button onClick={() => setEditor({ modo: 'editar', evento: ev })} style={{ fontFamily: SN, fontSize: 12.5, color: C.verde, background: 'transparent', border: `1px solid ${C.linea}`, borderRadius: 7, padding: '6px 12px', cursor: 'pointer' }}>Editar</button>
                  <button onClick={() => borrarEvento(ev)} style={{ fontFamily: SN, fontSize: 12.5, color: C.rojo, background: 'transparent', border: `1px solid ${C.linea}`, borderRadius: 7, padding: '6px 12px', cursor: 'pointer' }}>Borrar</button>
                </div>
                {matPanel && matPanel.evento.id === ev.id && (() => {
                  const mp = matPanel
                  const totalUds = mp.material.reduce((s, l) => s + l.cantidad, 0)
                  const totalCoste = mp.material.reduce((s, l) => s + (mp.catalogo.find(c => c.id === l.material_id)?.coste_reposicion ?? 0) * l.cantidad, 0)
                  return (
                    <div className="noprint" style={{ background: 'rgba(158,129,82,.05)', border: `1px solid ${C.linea}`, borderRadius: 12, padding: 14, margin: '2px 0 12px' }}>
                      <div style={{ fontFamily: SN, fontWeight: 800, fontSize: 13, color: C.oro, marginBottom: 8 }}>📦 Material del evento{mp.evento.evento_id ? ' · 🔗 unido a la ficha CRM' : ''}{matBusy ? ' · …' : ''}</div>
                      {mp.material.length === 0 && <div style={{ fontFamily: SN, fontSize: 12.5, color: C.ink3 }}>Sin material asignado todavía. Añade un kit o material suelto abajo.</div>}
                      {mp.material.map(ln => {
                        const cat = mp.catalogo.find(c => c.id === ln.material_id)
                        const coste = (cat?.coste_reposicion ?? 0) * ln.cantidad
                        return (
                          <div key={ln.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: `1px solid ${C.papel}` }}>
                            <div style={{ flex: '1 1 auto', minWidth: 0, fontFamily: SN, fontSize: 13, color: C.tinta }}><strong>{ln.cantidad}×</strong> {cat?.nombre ?? '—'}</div>
                            <Chip bg={C.papel} fg={C.ink3} br={C.linea}>{ln.estado}</Chip>
                            {coste > 0 && <span style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>{eur(coste)}</span>}
                            {ln.estado === 'reservado' && <button onClick={() => quitarMaterial(ln.id)} style={{ fontFamily: SN, fontSize: 12, color: C.rojo, background: 'transparent', border: `1px solid ${C.linea}`, borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>Quitar</button>}
                          </div>
                        )
                      })}
                      {mp.material.length > 0 && <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginTop: 8 }}>{totalUds} uds · valor en riesgo {eur(totalCoste)}</div>}

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'end', marginTop: 12 }}>
                        <div style={{ flex: '2 1 150px' }}><label style={lbl}>Kit</label>
                          <select style={inp} value={matAdd.kit_id} onChange={e => setMatAdd(a => ({ ...a, kit_id: e.target.value }))}>
                            <option value="">— elegir kit —</option>
                            {mp.kits.map(k => <option key={k.id} value={k.id}>{k.nombre}</option>)}
                          </select>
                        </div>
                        <div style={{ flex: '0 1 64px' }}><label style={lbl}>×</label><input style={inp} type="number" min="1" value={matAdd.kit_cantidad} onChange={e => setMatAdd(a => ({ ...a, kit_cantidad: e.target.value }))} /></div>
                        <button disabled={matBusy || !matAdd.kit_id} onClick={() => agregarMaterial({ kit_id: matAdd.kit_id, kit_cantidad: Number(matAdd.kit_cantidad) || 1 })} style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: '#fff', background: matBusy || !matAdd.kit_id ? C.ink3 : C.oro, border: 'none', borderRadius: 8, padding: '9px 14px', cursor: 'pointer' }}>+ Kit</button>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'end', marginTop: 8 }}>
                        <div style={{ flex: '2 1 150px' }}><label style={lbl}>Material suelto</label>
                          <select style={inp} value={matAdd.material_id} onChange={e => setMatAdd(a => ({ ...a, material_id: e.target.value }))}>
                            <option value="">— elegir material —</option>
                            {mp.catalogo.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.cantidad_disponible} disp.)</option>)}
                          </select>
                        </div>
                        <div style={{ flex: '0 1 64px' }}><label style={lbl}>Cant.</label><input style={inp} type="number" min="1" value={matAdd.cantidad} onChange={e => setMatAdd(a => ({ ...a, cantidad: e.target.value }))} /></div>
                        <button disabled={matBusy || !matAdd.material_id} onClick={() => agregarMaterial({ material_id: matAdd.material_id, cantidad: Number(matAdd.cantidad) || 0 })} style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: '#fff', background: matBusy || !matAdd.material_id ? C.ink3 : C.verde, border: 'none', borderRadius: 8, padding: '9px 14px', cursor: 'pointer' }}>+ Añadir</button>
                      </div>
                      {mp.catalogo.length === 0 && <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginTop: 8 }}>No hay material en el catálogo. Dalo de alta en <strong>/owner → Materiales</strong>.</div>}
                    </div>
                  )
                })()}
              </div>
            ))}
            {!editor && eventos.length === 0 && <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3 }}>Aún no hay eventos. Pulsa "+ Nuevo evento".</div>}
          </div>
        )}

        {/* Reparto por persona (solo responsable): la IA propone, Carmen ajusta */}
        {esResponsable && (
          <div className="noprint" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontFamily: SN, fontSize: 12, fontWeight: 700, color: C.ink3, textTransform: 'uppercase', letterSpacing: .5 }}>Reparto</span>
              <button onClick={reasignarIA} style={{ fontFamily: SN, fontSize: 12.5, fontWeight: 700, color: '#fff', background: C.verde, border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>✨ Repartir con IA</button>
              {equipo.filter(m => m.cocina_rol === 'cocinero' && m.activo).length === 0 && <span style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>(equipo de ejemplo — da de alta a los tuyos en 👥 Equipo)</span>}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {cocineros.map(c => (
                <div key={c.id} style={{ background: '#fff', border: `1px solid ${C.linea}`, borderRadius: 10, padding: '7px 12px' }}>
                  <div style={{ fontFamily: SN, fontWeight: 700, fontSize: 13.5, color: C.tinta }}>{c.nombre}</div>
                  <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>{cargaPorCocinero[c.id] ?? 0} min</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {muestras.length > 0 && (
          <div className="noprint" style={{ background: 'rgba(154,107,18,.08)', border: `1px solid ${C.ambar}`, borderRadius: 12, padding: '10px 14px', marginBottom: 16, fontFamily: SN, fontSize: 13.5, color: C.ambar }}>
            🧪 {muestras.length} muestra(s) testigo podrán retirarse el 22/6.
          </div>
        )}

        {/* ⚠️ Avisos de seguridad de dietas (#3) */}
        {avisos.length > 0 && (
          <div className="noprint" style={{ background: 'rgba(158,43,37,.06)', border: `1px solid ${C.rojo}`, borderRadius: 12, padding: '10px 14px', marginBottom: 16 }}>
            <div style={{ fontFamily: SN, fontWeight: 800, fontSize: 13, color: C.rojo, marginBottom: 4 }}>⚠️ Revisa estas dietas</div>
            {avisos.map((a, i) => (
              <div key={i} style={{ fontFamily: SN, fontSize: 13, color: C.tinta, padding: '2px 0' }}>
                {a.tipo === 'alergeno_incompatible' ? '🔴' : '🟠'} {a.mensaje}
              </div>
            ))}
          </div>
        )}

        {/* 🟢 Resumen de dietas para sala (#4) */}
        {resumenDietas.length > 0 && (
          <div style={{ background: '#fff', border: `1px solid ${C.linea}`, borderRadius: 12, padding: '10px 14px', marginBottom: 16 }}>
            <div style={{ fontFamily: SN, fontWeight: 800, fontSize: 12.5, color: C.verde, letterSpacing: .3, marginBottom: 6 }}>🟢 DIETAS PARA SALA</div>
            {resumenDietas.map(({ evento, grupos }) => (
              <div key={evento.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: '3px 0' }}>
                <span style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: C.tinta }}>{evento.nombre}:</span>
                {grupos.map(g => <Chip key={g.dieta} bg="rgba(63,125,68,.10)" fg="#2f6b34" br="#3F7D44">{g.comensales} {g.dieta}</Chip>)}
              </div>
            ))}
          </div>
        )}

        {porPartida.map(g => (
          <div key={g.partida} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, background: PARTIDA_COLOR[g.partida], color: '#fff', marginBottom: 12 }}>
              <span style={{ fontFamily: SN, fontWeight: 800, fontSize: 15, letterSpacing: .5 }}>{(PARTIDA_NOMBRE[g.partida] ?? g.partida).toUpperCase()}</span>
              <span style={{ marginLeft: 'auto', fontFamily: SN, fontSize: 13, opacity: .9 }}>{g.elabs.length}</span>
            </div>
            {g.elabs.map(e => { const rid = e.receta_base ?? e.id; return <Ficha key={e.id} e={e} recetaId={rid} ubNombre={ubNombre} registro={registroPorReceta[rid]} requiereMuestra={recetaMuestra[rid] ?? false} onAccion={accion} matchRecep={matchRecep} asignadoId={e.dieta ? null : asignMap[e.id]} nombreTrab={nombreTrab} cocinerosPartida={cocinerosDePartida(e.partida)} onAsignar={asignar} puedeAsignar={esResponsable && !e.dieta} /> })}
          </div>
        ))}

        {parte.elaboraciones.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, fontFamily: SE, fontStyle: 'italic', color: C.ink3 }}>
            Sin elaboraciones todavía. Crea un evento y asígnale elaboraciones desde "Gestionar eventos".
          </div>
        )}

        {/* 📄 Hoja de alérgenos del evento (#1) — solo al imprimir el dossier */}
        {hojaAlergenos.length > 0 && (
          <div className="solo-print-block" style={{ display: 'none', marginTop: 24, breakInside: 'avoid' }}>
            <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 18, color: C.tinta, borderBottom: `2px solid ${C.oro}`, paddingBottom: 4, marginBottom: 10 }}>Hoja de alérgenos del evento</div>
            {resumenDietas.length > 0 && (
              <div style={{ fontFamily: SN, fontSize: 12.5, color: C.tinta, marginBottom: 10 }}>
                {resumenDietas.map(({ evento, grupos }) => (
                  <div key={evento.id}><strong>{evento.nombre}:</strong> {grupos.map(g => `${g.comensales} ${g.dieta}`).join(' · ')}</div>
                ))}
              </div>
            )}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: SN, fontSize: 12 }}>
              <thead><tr><th style={{ textAlign: 'left', borderBottom: `1px solid ${C.linea}`, padding: '4px 6px' }}>Elaboración</th><th style={{ textAlign: 'left', borderBottom: `1px solid ${C.linea}`, padding: '4px 6px' }}>Alérgenos</th></tr></thead>
              <tbody>
                {hojaAlergenos.map(h => (
                  <tr key={h.id}>
                    <td style={{ padding: '4px 6px', borderBottom: `1px solid ${C.papel}` }}>{h.nombre}{h.dieta ? ` · ${h.comensales} ración(es)` : ''}</td>
                    <td style={{ padding: '4px 6px', borderBottom: `1px solid ${C.papel}` }}>{h.alergenos.length ? h.alergenos.map(a => ALERGENO_NOMBRE[a]).join(', ') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 20, fontFamily: SN, fontSize: 12, color: C.oro, letterSpacing: 1 }}>COCINA CENTRAL · ia.rest</div>
      </div>
    </div>
  )
}

// Visor de escáner EAN: usa BarcodeDetector nativo (Chrome/Android) si existe; si no,
// ZXing. Escaneo CONTINUO con dedupe — cada código nuevo se acumula sin cerrar el visor.
function ScannerEan({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }): ReactElement {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [leidos, setLeidos] = useState<string[]>([])
  const leidosRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let zxControls: { stop: () => void } | null = null
    let cancelado = false

    const emitir = (code: string) => {
      const limpio = code.replace(/\D/g, '')
      if (!/^\d{8,14}$/.test(limpio) || leidosRef.current.has(limpio)) return
      leidosRef.current.add(limpio)
      setLeidos(prev => [...prev, limpio])
      onCode(limpio)
      try { navigator.vibrate?.(60) } catch { /* sin vibración */ }
    }

    const start = async () => {
      try {
        const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (s: CanvasImageSource) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector
        if (BD) {
          const detector = new BD({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
          if (cancelado) return
          if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
          const tick = async () => {
            if (cancelado || !videoRef.current) return
            try { for (const b of await detector.detect(videoRef.current)) emitir(String(b.rawValue)) } catch { /* frame sin código */ }
            raf = requestAnimationFrame(tick)
          }
          raf = requestAnimationFrame(tick)
        } else {
          const reader = new BrowserMultiFormatReader()
          zxControls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => { if (result) emitir(result.getText()) })
        }
      } catch {
        window.alert('No se pudo abrir la cámara. Usa 📷 Añadir foto o + Manual.')
        onClose()
      }
    }
    start()
    return () => {
      cancelado = true
      if (raf) cancelAnimationFrame(raf)
      try { zxControls?.stop() } catch { /* noop */ }
      if (stream) stream.getTracks().forEach(t => t.stop())
    }
  }, [onCode, onClose])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <video ref={videoRef} playsInline muted style={{ width: '100%', maxWidth: 460, borderRadius: 12, background: '#000' }} />
      <div style={{ fontFamily: SN, fontSize: 13, color: '#fff', marginTop: 12 }}>{leidos.length} código(s) leído(s) — apunta al siguiente</div>
      <button onClick={onClose} style={{ marginTop: 16, fontFamily: SN, fontSize: 15, fontWeight: 700, color: '#000', background: '#fff', border: 'none', borderRadius: 10, padding: '12px 28px', cursor: 'pointer' }}>Hecho</button>
    </div>
  )
}
