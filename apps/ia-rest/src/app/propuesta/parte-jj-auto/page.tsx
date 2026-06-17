'use client'
import { useMemo, type ReactElement } from 'react'
import {
  generarParte,
  paxTotal,
  alergenosElaboracion,
  evaluarSalida,
  validarControles,
  objetivoControl,
  muestrasACaducar,
  ALERGENO_NOMBRE,
  type FichaCatalogo,
  type EventoInput,
  type ElaboracionTraza,
  type TipoControl,
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

// ── CATÁLOGO de elaboraciones (recetas reutilizables con escandallo por PAX) ──
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

// ── EVENTOS de la semana (PAX reales) y qué sirve cada uno ──
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
  const veredicto = evaluarSalida(e)
  const controles = validarControles(e)
  return (
    <div className="ficha" style={{ background: '#fff', border: `1px solid ${C.linea}`, borderRadius: 12, padding: '14px 16px', marginBottom: 12, breakInside: 'avoid' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: SN, fontWeight: 800, fontSize: 'clamp(14px,3.2vw,16px)', color: C.tinta }}>{e.nombre}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {e.ubicaciones.map(u => <Chip key={u} bg={C.papel} fg={C.ink3} br={C.linea}>{UB_NOMBRE[u] ?? u}</Chip>)}
        </div>
      </div>
      {alergenos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8, alignItems: 'center' }}>
          <span style={{ fontFamily: SN, fontSize: 10.5, fontWeight: 700, letterSpacing: .5, color: C.oro, textTransform: 'uppercase' }}>Alérgenos</span>
          {alergenos.map(a => <Chip key={a} bg="rgba(154,107,18,.10)" fg={C.ambar} br="rgba(154,107,18,.3)">{ALERGENO_NOMBRE[a]}</Chip>)}
        </div>
      )}
      <div style={{ marginTop: 10, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: SN, fontSize: 12, minWidth: 480 }}>
          <thead><tr style={{ color: C.ink3, textAlign: 'left' }}>
            {['Ingrediente', 'Cantidad', 'Nº Lote', 'Proveedor', 'Desinf.', 'Descong.'].map(h => <th key={h} style={{ borderBottom: `1px solid ${C.linea}`, padding: '3px 7px', fontWeight: 700 }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {e.ingredientes.map((ing, i) => (
              <tr key={i} style={{ color: C.tinta }}>
                <td style={{ padding: '3px 7px' }}>{ing.nombre}</td>
                <td style={{ padding: '3px 7px', fontWeight: 700 }}>{ing.cantidad}</td>
                <td style={{ padding: '3px 7px', color: C.ink3 }}>⬚</td>
                <td style={{ padding: '3px 7px', color: C.ink3 }}>⬚</td>
                <td style={{ padding: '3px 7px' }}>{ing.desinfeccion ? '✓' : '—'}</td>
                <td style={{ padding: '3px 7px' }}>{ing.descongelacion ? '✓' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        {controles.map((r, i) => (
          <span key={i} style={{ fontFamily: SN, fontSize: 11.5, color: C.tinta, background: C.papel, border: `1px solid ${C.linea}`, borderRadius: 8, padding: '3px 8px' }}>
            {CTRL_ICONO[r.tipo]} {objetivoControl(r.tipo)} <strong style={{ color: C.ink3 }}>⬚</strong>
          </span>
        ))}
        <span style={{ fontFamily: SN, fontSize: 11.5, color: C.ink3, padding: '3px 8px' }}>🧪 Muestra testigo ⬚ · ✍️ Firma ⬚</span>
      </div>
    </div>
  )
}

export default function ParteAutoPage(): ReactElement {
  const parte = useMemo(() => generarParte(CATALOGO, EVENTOS), [])
  const total = paxTotal(parte)

  // Reparto del motor: una tarea por elaboración (duración = min/pax × PAX servidos)
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

  // Agrupa elaboraciones por partida (orden fijo)
  const porPartida = useMemo(() => {
    const orden = ['frio', 'caliente', 'corte', 'montaje']
    return orden
      .map(p => ({ partida: p, elabs: parte.elaboraciones.filter(e => e.partida === p) }))
      .filter(g => g.elabs.length > 0)
  }, [parte])

  const muestras = muestrasACaducar(parte.elaboraciones, '2026-06-22T20:00:00Z', 2)

  return (
    <div style={{ minHeight: '100vh', background: C.papel, color: C.tinta, fontFamily: SN }}>
      <style>{`@media print {
        .noprint { display: none !important; }
        body { background: #fff !important; }
        .ficha { box-shadow: none !important; }
      }`}</style>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(20px,5vw,44px) clamp(16px,4vw,40px) 64px' }}>

        {/* Cabecera */}
        <div style={{ borderBottom: `3px solid ${C.verde}`, paddingBottom: 18, marginBottom: 18, display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontFamily: SN, letterSpacing: 3, fontSize: 13, color: C.oro, textTransform: 'uppercase', fontWeight: 700 }}>Catering Joaquín Jaén · Cocina</div>
            <h1 style={{ fontFamily: SE, fontWeight: 600, fontSize: 'clamp(24px,5vw,40px)', color: C.verde, margin: '6px 0 4px', lineHeight: 1.1 }}>
              El parte se genera <span style={{ color: C.oro }}>solo</span>
            </h1>
            <div style={{ fontFamily: SN, fontSize: 'clamp(14px,3.2vw,16px)', color: C.ink3 }}>
              {EVENTOS.length} eventos · {total} PAX · {parte.elaboraciones.length} elaboraciones · cantidades calculadas por comensales
            </div>
          </div>
          <button className="noprint" onClick={() => window.print()} style={{ fontFamily: SN, fontWeight: 700, fontSize: 13.5, color: '#fff', background: C.verde, border: 'none', borderRadius: 10, padding: '10px 16px', cursor: 'pointer' }}>
            🖨️ Imprimir dossier APPCC
          </button>
        </div>

        {/* Cómo lo hace (los automatismos) */}
        <div className="noprint" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,230px),1fr))', gap: 10, marginBottom: 18 }}>
          {[
            '🧮 Cantidades = escandallo × PAX, solo',
            '👥 El motor reparte por cocinero',
            '🏷️ Alérgenos detectados automáticamente',
            '🌡️ Controles APPCC asignados por plato',
          ].map(t => <div key={t} style={{ background: '#fff', border: `1px solid ${C.linea}`, borderRadius: 10, padding: '10px 12px', fontFamily: SN, fontSize: 12.5, color: C.tinta }}>{t}</div>)}
        </div>

        {/* Reparto del motor */}
        <div className="noprint" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
          {COCINEROS.map(c => (
            <div key={c.id} style={{ background: '#fff', border: `1px solid ${C.linea}`, borderRadius: 10, padding: '8px 14px' }}>
              <div style={{ fontFamily: SN, fontWeight: 700, fontSize: 14, color: C.tinta }}>{c.nombre}</div>
              <div style={{ fontFamily: SN, fontSize: 12.5, color: C.ink3 }}>{plan.minutos_por_trabajador[c.id] ?? 0} min asignados</div>
            </div>
          ))}
        </div>

        {/* Aviso de muestras testigo a retirar */}
        {muestras.length > 0 && (
          <div className="noprint" style={{ background: 'rgba(154,107,18,.08)', border: `1px solid ${C.ambar}`, borderRadius: 12, padding: '10px 14px', marginBottom: 20, fontFamily: SN, fontSize: 13.5, color: C.ambar }}>
            🧪 {muestras.length} muestra(s) testigo cumplirán plazo el 22/6 y podrán retirarse.
          </div>
        )}

        {/* Parte por partidas */}
        {porPartida.map(g => (
          <div key={g.partida} style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, background: PARTIDA_COLOR[g.partida], color: '#fff', marginBottom: 12 }}>
              <span style={{ fontFamily: SN, fontWeight: 800, fontSize: 15, letterSpacing: .5 }}>{(PARTIDA_NOMBRE[g.partida] ?? g.partida).toUpperCase()}</span>
              <span style={{ marginLeft: 'auto', fontFamily: SN, fontSize: 13, opacity: .9 }}>{g.elabs.length}</span>
            </div>
            {g.elabs.map(e => <Ficha key={e.id} e={e} />)}
          </div>
        ))}

        <p className="noprint" style={{ fontFamily: SN, fontSize: 15, color: C.ink3, textAlign: 'center', lineHeight: 1.5, marginTop: 24 }}>
          Tú eliges los eventos y los platos: el sistema <strong style={{ color: C.verde }}>calcula las cantidades, reparte el trabajo,
          detecta los alérgenos y prepara el dossier</strong>. Solo se rellenan lote, proveedor y los controles en cocina.
        </p>
        <div style={{ textAlign: 'center', marginTop: 10, fontFamily: SN, fontSize: 12.5, color: C.oro, letterSpacing: 1 }}>CATERING JOAQUÍN JAÉN · PARTE AUTOMÁTICO · ia.rest</div>
      </div>
    </div>
  )
}
