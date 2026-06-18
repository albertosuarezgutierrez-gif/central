'use client'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
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

// ── CATÁLOGO + EVENTOS (semilla; la persistencia en BD es el paso siguiente) ──
const CATALOGO: FichaCatalogo[] = [
  { id: 'antojito', nombre: 'Antojito de queso de cabra', partida: 'montaje', depende_de: ['MEDALLÓN caramelizado', 'QUESO DE CABRA', 'CEBOLLA CARAMELIZADA'], min_por_pax: 0.4, requiere_muestra: true, controles: ['refrigeracion'],
    ingredientes: [{ nombre: 'tortillas de trigo', por_pax: 1, unidad: 'u' }, { nombre: 'queso de cabra', por_pax: 15, unidad: 'g' }, { nombre: 'cebolla', por_pax: 10, unidad: 'g', desinfeccion: { dosificacion: '1 past./10 L', permanencia: '10 min', aclarado: 'agua abundante' } }] },
  { id: 'ajoblanco', nombre: 'Ajo blanco de coco con dados de mojama', partida: 'frio', depende_de: ['AJO BLANCO DE COCO', 'TAQUITOS DE MOJAMA'], min_por_pax: 0.3, requiere_muestra: true, controles: ['refrigeracion'],
    ingredientes: [{ nombre: 'ajo blanco de coco', por_pax: 40, unidad: 'ml' }, { nombre: 'mojama', por_pax: 5, unidad: 'g' }] },
  { id: 'ensaladilla', nombre: 'Ensaladilla de marisco y crujiente de camarón', partida: 'frio', depende_de: ['ENSALADILLA (base)', 'CAMARÓN COCIDO'], min_por_pax: 0.5, requiere_muestra: true, controles: ['refrigeracion', 'congelacion'],
    ingredientes: [{ nombre: 'ensaladilla base', por_pax: 30, unidad: 'g' }, { nombre: 'langostinos', por_pax: 10, unidad: 'g', descongelacion: true }, { nombre: 'camarón', por_pax: 8, unidad: 'g' }] },
  { id: 'pollo', nombre: 'Delicia de pollo con mostaza y miel', partida: 'caliente', depende_de: ['SALSA DE MOSTAZA Y MIEL'], min_por_pax: 0.5, requiere_muestra: true, controles: ['termico', 'refrigeracion'],
    ingredientes: [{ nombre: 'pechuga de pollo', por_pax: 120, unidad: 'g', descongelacion: true }, { nombre: 'mostaza', por_pax: 3, unidad: 'g' }, { nombre: 'mayonesa', por_pax: 4, unidad: 'g' }, { nombre: 'miel de flores', por_pax: 3, unidad: 'g' }] },
  { id: 'canelon', nombre: 'Mini canelón con salsa de chalota', partida: 'caliente', depende_de: ['salsa de chalota'], min_por_pax: 0.6, requiere_muestra: true, controles: ['termico'],
    ingredientes: [{ nombre: 'nata para cocinar', por_pax: 15, unidad: 'ml' }, { nombre: 'chalota', por_pax: 8, unidad: 'g' }, { nombre: 'mantequilla', por_pax: 2, unidad: 'g' }, { nombre: 'placas de canelón', por_pax: 2, unidad: 'u' }] },
  { id: 'samosa', nombre: 'Samosa de pollo y cremoso de cacahuete', partida: 'caliente', depende_de: ['ALIOLI DE CACAHUETES'], min_por_pax: 0.6, requiere_muestra: true, controles: ['termico'],
    ingredientes: [{ nombre: 'cacahuetes repelados', por_pax: 5, unidad: 'g' }, { nombre: 'mahonesa ybarra', por_pax: 4, unidad: 'g' }, { nombre: 'pasta brick', por_pax: 1, unidad: 'u' }] },
  { id: 'lomo', nombre: 'Caña de lomo ibérica', partida: 'corte', depende_de: ['CAÑA DE LOMO CORTADA'], min_por_pax: 0.2, requiere_muestra: true, controles: ['refrigeracion'],
    ingredientes: [{ nombre: 'caña de lomo ibérica', por_pax: 20, unidad: 'g' }] },
  { id: 'quesos', nombre: 'Rincón andaluz · 5 quesos', partida: 'corte', depende_de: ['5 TIPOS DE QUESOS CORTADOS'], min_por_pax: 0.3, requiere_muestra: true, controles: ['refrigeracion'],
    ingredientes: [{ nombre: 'queso de cabra a la pimienta', por_pax: 6, unidad: 'g' }, { nombre: 'queso mahón', por_pax: 6, unidad: 'g' }, { nombre: 'queso curado', por_pax: 6, unidad: 'g' }] },
]
const EVENTOS: EventoInput[] = [
  { id: 'alba', nombre: 'Hacienda El Alba', pax: 115, fecha_evento: '20-06-2026', elaboraciones: ['antojito', 'pollo', 'lomo', 'ajoblanco'] },
  { id: 'fresnos', nombre: 'Finca Los Fresnos', pax: 131, fecha_evento: '20-06-2026', elaboraciones: ['canelon', 'samosa'] },
  { id: 'trinidad', nombre: 'Hacienda Trinidad', pax: 136, fecha_evento: '20-06-2026', elaboraciones: ['canelon', 'samosa', 'quesos', 'ensaladilla', 'ajoblanco'] },
  { id: 'decanato', nombre: 'Decanato And. Occidental', pax: 20, fecha_evento: '18-06-2026', elaboraciones: ['antojito'] },
]
const UB_NOMBRE: Record<string, string> = Object.fromEntries(EVENTOS.map(e => [e.id, e.nombre]))
const MIN_POR_PAX: Record<string, number> = Object.fromEntries(CATALOGO.map(f => [f.id, f.min_por_pax ?? 0.4]))
const COCINEROS: Trabajador[] = [
  { id: 'c1', nombre: 'Carmen', rol: 'cocinero', disponible: true },
  { id: 'c2', nombre: 'Cocina 2', rol: 'cocinero', disponible: true },
  { id: 'c3', nombre: 'Cocina 3', rol: 'cocinero', disponible: true },
]

function Chip({ children, bg, fg, br }: { children: React.ReactNode; bg: string; fg: string; br?: string }): ReactElement {
  return <span style={{ fontFamily: SN, fontSize: 11.5, fontWeight: 600, color: fg, background: bg, border: br ? `1px solid ${br}` : 'none', borderRadius: 20, padding: '2px 9px', whiteSpace: 'nowrap' }}>{children}</span>
}

function Ficha({ e }: { e: ElaboracionTraza }): ReactElement {
  const alergenos = alergenosElaboracion(e)
  const controles = validarControles(e)
  return (
    <div className="ficha" style={{ background: '#fff', border: `1px solid ${C.linea}`, borderRadius: 12, padding: '14px 16px', marginBottom: 12, breakInside: 'avoid' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: SN, fontWeight: 800, fontSize: 'clamp(14px,3.6vw,16px)', color: C.tinta }}>{e.nombre}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {e.ubicaciones.map(u => <Chip key={u} bg={C.papel} fg={C.ink3} br={C.linea}>{UB_NOMBRE[u] ?? u}</Chip>)}
        </div>
      </div>
      {alergenos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8, alignItems: 'center' }}>
          <span style={{ fontFamily: SN, fontSize: 10.5, fontWeight: 700, letterSpacing: .5, color: C.oro, textTransform: 'uppercase' }}>Alérgenos</span>
          {alergenos.map(a => <Chip key={a} bg="rgba(154,107,18,.10)" fg={C.ambar} br="rgba(154,107,18,.3)">{ALERGENO_NOMBRE[a]}</Chip>)}
        </div>
      )}
      {/* Ingredientes — filas que envuelven (móvil) */}
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
      {/* Controles APPCC */}
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

export default function ProduccionCocinaCentralPage(): ReactElement {
  const [nombreLocal, setNombreLocal] = useState('Cocina central')
  const [ready, setReady] = useState(false)

  // Auth básica: requiere sesión; si no, al login
  useEffect(() => {
    try {
      const raw = localStorage.getItem('ia_rest_session')
      if (!raw) { window.location.href = '/login'; return }
      const s = JSON.parse(raw)
      if (s?.restaurante_nombre) setNombreLocal(s.restaurante_nombre)
      setReady(true)
    } catch { window.location.href = '/login' }
  }, [])

  const parte = useMemo(() => generarParte(CATALOGO, EVENTOS), [])
  const total = paxTotal(parte)

  const plan = useMemo(() => {
    const tareas: Tarea[] = parte.elaboraciones.map(e => {
      const pax = e.ubicaciones.reduce((a, id) => a + (EVENTOS.find(ev => ev.id === id)?.pax ?? 0), 0)
      return {
        id: e.id, nombre: e.nombre, tipo: 'elaboracion', partida: e.partida ?? undefined,
        duracion_estimada_min: Math.max(10, Math.round((MIN_POR_PAX[e.id] ?? 0.4) * pax)),
        prioridad: e.partida === 'caliente' ? 'alta' : 'normal',
      }
    })
    return asignarTrabajo(tareas, COCINEROS)
  }, [parte])

  const porPartida = useMemo(() => {
    const orden = ['frio', 'caliente', 'corte', 'montaje']
    return orden.map(p => ({ partida: p, elabs: parte.elaboraciones.filter(e => e.partida === p) })).filter(g => g.elabs.length > 0)
  }, [parte])

  const muestras = muestrasACaducar(parte.elaboraciones, '2026-06-22T20:00:00Z', 2)

  const salir = () => {
    try { localStorage.removeItem('ia_rest_session'); localStorage.removeItem('ia_kds_token') } catch { /* noop */ }
    window.location.href = '/login'
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

        {/* Resumen del parte */}
        <div style={{ fontFamily: SN, fontSize: 'clamp(13px,3.4vw,15px)', color: C.ink3, marginBottom: 14 }}>
          Parte del día · {EVENTOS.length} eventos · {total} PAX · {parte.elaboraciones.length} elaboraciones
        </div>

        {/* Reparto del motor */}
        <div className="noprint" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {COCINEROS.map(c => (
            <div key={c.id} style={{ background: '#fff', border: `1px solid ${C.linea}`, borderRadius: 10, padding: '7px 12px' }}>
              <div style={{ fontFamily: SN, fontWeight: 700, fontSize: 13.5, color: C.tinta }}>{c.nombre}</div>
              <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>{plan.minutos_por_trabajador[c.id] ?? 0} min</div>
            </div>
          ))}
        </div>

        {/* Aviso muestras testigo */}
        {muestras.length > 0 && (
          <div className="noprint" style={{ background: 'rgba(154,107,18,.08)', border: `1px solid ${C.ambar}`, borderRadius: 12, padding: '10px 14px', marginBottom: 16, fontFamily: SN, fontSize: 13.5, color: C.ambar }}>
            🧪 {muestras.length} muestra(s) testigo podrán retirarse el 22/6.
          </div>
        )}

        {/* Parte por partidas */}
        {porPartida.map(g => (
          <div key={g.partida} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, background: PARTIDA_COLOR[g.partida], color: '#fff', marginBottom: 12 }}>
              <span style={{ fontFamily: SN, fontWeight: 800, fontSize: 15, letterSpacing: .5 }}>{(PARTIDA_NOMBRE[g.partida] ?? g.partida).toUpperCase()}</span>
              <span style={{ marginLeft: 'auto', fontFamily: SN, fontSize: 13, opacity: .9 }}>{g.elabs.length}</span>
            </div>
            {g.elabs.map(e => <Ficha key={e.id} e={e} />)}
          </div>
        ))}

        <div style={{ textAlign: 'center', marginTop: 20, fontFamily: SN, fontSize: 12, color: C.oro, letterSpacing: 1 }}>COCINA CENTRAL · ia.rest</div>
      </div>
    </div>
  )
}
