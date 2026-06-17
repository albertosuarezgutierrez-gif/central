'use client'
import { useMemo, useState, type ReactElement } from 'react'
import {
  agruparPorPartida,
  asignarTrabajo,
  avisosAlCompletar,
  type Tarea,
  type Trabajador,
  type Aviso,
} from '@central/module-organizador-trabajo'

// ─── Identidad de marca (logo verde) ─────────────────────────
const C = {
  verde: '#02473B', verdeClaro: '#0B6B57',
  oro: '#9E8152', oroClaro: '#C2A973',
  papel: '#FBFAF6', tinta: '#1E2622', ink3: '#5C6660', linea: '#E6E2D6',
}
const SE = 'Newsreader, Georgia, serif'
const SN = 'Inter Tight, system-ui, sans-serif'

const PARTIDA_INFO: Record<string, { nombre: string; color: string; icono: string }> = {
  frio:     { nombre: 'Frío',     color: '#2B6A6E', icono: '❄️' },
  caliente: { nombre: 'Caliente', color: '#C0492B', icono: '🔥' },
  corte:    { nombre: 'Corte',    color: '#9E8152', icono: '🔪' },
  montaje:  { nombre: 'Montaje',  color: '#3F7D44', icono: '🧩' },
}

// Equipo de cocina (Carmen reparte por partidas; el motor equilibra dentro)
const COCINEROS: Trabajador[] = [
  { id: 'c1', nombre: 'Carmen', rol: 'cocinero', disponible: true },
  { id: 'c2', nombre: 'Cocina 2', rol: 'cocinero', disponible: true },
  { id: 'c3', nombre: 'Cocina 3', rol: 'cocinero', disponible: true },
]

// ── Datos REALES del parte del 20/6/2026 modelados como tareas del motor ──
// Las sub-elaboraciones (MAYÚSCULAS del parte) son tareas propias; los platos
// finales declaran `depende_de` con sus ids → el motor encadena los avisos.
const TAREAS_BASE: Tarea[] = [
  // FRÍO — sub-elaboraciones
  { id: 'fr-ensaladilla', nombre: 'ENSALADILLA (base)', tipo: 'subelaboracion', partida: 'frio', prioridad: 'alta', duracion_estimada_min: 40 },
  { id: 'fr-camaron', nombre: 'CAMARÓN COCIDO', tipo: 'subelaboracion', partida: 'frio', prioridad: 'normal', duracion_estimada_min: 20 },
  { id: 'fr-ajoblanco', nombre: 'AJO BLANCO DE COCO', tipo: 'subelaboracion', partida: 'frio', prioridad: 'alta', duracion_estimada_min: 35 },
  { id: 'fr-mojama', nombre: 'TAQUITOS DE MOJAMA', tipo: 'subelaboracion', partida: 'frio', prioridad: 'baja', duracion_estimada_min: 10 },
  { id: 'fr-atunlomo', nombre: 'ATÚN LOMO ELABORADO', tipo: 'subelaboracion', partida: 'frio', prioridad: 'alta', duracion_estimada_min: 30 },
  // FRÍO — platos finales
  { id: 'fr-p-ensaladilla', nombre: 'Ensaladilla de marisco y crujiente de camarón', tipo: 'elaboracion', partida: 'frio', prioridad: 'normal', duracion_estimada_min: 25, depende_de: ['fr-ensaladilla', 'fr-camaron'] },
  { id: 'fr-p-salmorejo', nombre: 'Salmorejo cordobés', tipo: 'elaboracion', partida: 'frio', prioridad: 'normal', duracion_estimada_min: 20 },
  { id: 'fr-p-ajoblanco', nombre: 'Ajo blanco de coco con dados de mojama', tipo: 'elaboracion', partida: 'frio', prioridad: 'normal', duracion_estimada_min: 15, depende_de: ['fr-ajoblanco', 'fr-mojama'] },
  { id: 'fr-p-tartar', nombre: 'Atún rojo en tartar al provenzal', tipo: 'elaboracion', partida: 'frio', prioridad: 'alta', duracion_estimada_min: 20, depende_de: ['fr-atunlomo'] },

  // CALIENTE — sub-elaboraciones
  { id: 'ca-fondoarroz', nombre: 'FONDO DE ARROZ CON PATO', tipo: 'subelaboracion', partida: 'caliente', prioridad: 'urgente', duracion_estimada_min: 60 },
  { id: 'ca-pato', nombre: 'PATO CONFITADO DESMIGADO', tipo: 'subelaboracion', partida: 'caliente', prioridad: 'alta', duracion_estimada_min: 45 },
  { id: 'ca-mostaza', nombre: 'SALSA DE MOSTAZA Y MIEL', tipo: 'subelaboracion', partida: 'caliente', prioridad: 'normal', duracion_estimada_min: 20 },
  { id: 'ca-chimichurri', nombre: 'CHIMICHURRI', tipo: 'subelaboracion', partida: 'caliente', prioridad: 'baja', duracion_estimada_min: 15 },
  // CALIENTE — platos finales
  { id: 'ca-p-arroz', nombre: 'Arroz meloso con pato confitado', tipo: 'elaboracion', partida: 'caliente', prioridad: 'alta', duracion_estimada_min: 35, depende_de: ['ca-fondoarroz', 'ca-pato'] },
  { id: 'ca-p-pollo', nombre: 'Delicia de pollo con mostaza y miel', tipo: 'elaboracion', partida: 'caliente', prioridad: 'normal', duracion_estimada_min: 30, depende_de: ['ca-mostaza'] },
  { id: 'ca-p-brocheta', nombre: 'Brocheta criolla con chimichurri', tipo: 'elaboracion', partida: 'caliente', prioridad: 'normal', duracion_estimada_min: 25, depende_de: ['ca-chimichurri'] },

  // CORTE
  { id: 'co-quesos', nombre: '5 TIPOS DE QUESOS CORTADOS', tipo: 'subelaboracion', partida: 'corte', prioridad: 'baja', duracion_estimada_min: 20 },
  { id: 'co-p-rincon', nombre: 'Rincón andaluz · 5 tipos de quesos', tipo: 'elaboracion', partida: 'corte', prioridad: 'baja', duracion_estimada_min: 15, depende_de: ['co-quesos'] },
  { id: 'co-lomo', nombre: 'CAÑA DE LOMO CORTADA', tipo: 'subelaboracion', partida: 'corte', prioridad: 'baja', duracion_estimada_min: 15 },
  { id: 'co-p-lomo', nombre: 'Caña de lomo ibérica', tipo: 'elaboracion', partida: 'corte', prioridad: 'baja', duracion_estimada_min: 10, depende_de: ['co-lomo'] },

  // MONTAJE
  { id: 'mo-cabra', nombre: 'QUESO DE CABRA + CEBOLLA CARAMELIZADA', tipo: 'subelaboracion', partida: 'montaje', prioridad: 'normal', duracion_estimada_min: 30 },
  { id: 'mo-p-antojito', nombre: 'Antojito de queso de cabra', tipo: 'elaboracion', partida: 'montaje', prioridad: 'normal', duracion_estimada_min: 20, depende_de: ['mo-cabra'] },
  { id: 'mo-hamburguesa', nombre: 'HAMBURGUESA MONTADA', tipo: 'subelaboracion', partida: 'montaje', prioridad: 'normal', duracion_estimada_min: 25 },
  { id: 'mo-p-hamburguesa', nombre: 'Hamburguesa neoyorkina de ternera', tipo: 'elaboracion', partida: 'montaje', prioridad: 'normal', duracion_estimada_min: 15, depende_de: ['mo-hamburguesa'] },
]

const NOMBRE_TRAB: Record<string, string> = Object.fromEntries(COCINEROS.map(c => [c.id, c.nombre]))

export default function ParteVivoPage(): ReactElement {
  // Estado: ids de tareas marcadas como hechas (interacción del demo)
  const [hechas, setHechas] = useState<Set<string>>(new Set())
  const [avisos, setAvisos] = useState<Aviso[]>([])

  // Tareas con su estado actual derivado de `hechas`
  const tareas = useMemo<Tarea[]>(
    () => TAREAS_BASE.map(t => ({ ...t, estado: hechas.has(t.id) ? 'hecha' : 'pendiente' })),
    [hechas],
  )

  // El motor reparte el trabajo pendiente entre los cocineros (equidad por minutos)
  const plan = useMemo(() => asignarTrabajo(tareas, COCINEROS), [tareas])
  const asignadoA = useMemo(() => {
    const m: Record<string, string> = {}
    for (const a of plan.asignaciones) m[a.tarea_id] = a.trabajador_id
    return m
  }, [plan])

  const partidas = useMemo(() => agruparPorPartida(tareas), [tareas])

  // Marcar una tarea hecha → el motor calcula qué queda LISTO PARA EMPEZAR
  function completar(id: string) {
    const nuevos = avisosAlCompletar(id, tareas)
    setHechas(prev => new Set(prev).add(id))
    if (nuevos.length > 0) setAvisos(nuevos)
  }

  const totalPendientes = tareas.filter(t => t.estado !== 'hecha').length

  return (
    <div style={{ minHeight: '100vh', background: C.papel, color: C.tinta, fontFamily: SN }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(20px,5vw,44px) clamp(16px,4vw,40px) 64px' }}>

        {/* Cabecera */}
        <div style={{ borderBottom: `3px solid ${C.verde}`, paddingBottom: 18, marginBottom: 20 }}>
          <div style={{ fontFamily: SN, letterSpacing: 3, fontSize: 13, color: C.oro, textTransform: 'uppercase', fontWeight: 700 }}>Catering Joaquín Jaén · Cocina</div>
          <h1 style={{ fontFamily: SE, fontWeight: 600, fontSize: 'clamp(26px,5.5vw,44px)', color: C.verde, margin: '6px 0 4px', lineHeight: 1.1 }}>
            El parte, <span style={{ color: C.oro }}>vivo</span>: el sistema reparte y encadena
          </h1>
          <div style={{ fontFamily: SN, fontSize: 'clamp(14px,3.2vw,17px)', color: C.ink3 }}>
            Datos reales del 20/6. Pulsa <strong>Hecho</strong> en una base (salsa/fondo) y mira cómo salta la tarea que dependía de ella.
          </div>
        </div>

        {/* Aviso encadenado (frío→caliente, base→plato) */}
        {avisos.length > 0 && (
          <div style={{ background: 'rgba(2,71,59,.06)', border: `1px solid ${C.verde}`, borderRadius: 12, padding: '12px 16px', marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <span style={{ fontFamily: SN, fontWeight: 800, color: C.verde }}>🔔 Lista para empezar:</span>
            {avisos.map(a => (
              <span key={a.tarea_id} style={{ fontFamily: SN, fontSize: 14, color: C.tinta, background: '#fff', border: `1px solid ${C.linea}`, borderRadius: 20, padding: '3px 12px' }}>{a.nombre}</span>
            ))}
            <button onClick={() => setAvisos([])} style={{ marginLeft: 'auto', fontFamily: SN, fontSize: 12, color: C.ink3, background: 'transparent', border: 'none', cursor: 'pointer' }}>cerrar</button>
          </div>
        )}

        {/* Reparto del motor (minutos por cocinero) */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
          {COCINEROS.map(c => (
            <div key={c.id} style={{ background: '#fff', border: `1px solid ${C.linea}`, borderRadius: 10, padding: '8px 14px' }}>
              <div style={{ fontFamily: SN, fontWeight: 700, fontSize: 14, color: C.tinta }}>{c.nombre}</div>
              <div style={{ fontFamily: SN, fontSize: 12.5, color: C.ink3 }}>{plan.minutos_por_trabajador[c.id] ?? 0} min asignados</div>
            </div>
          ))}
          <div style={{ marginLeft: 'auto', alignSelf: 'center', fontFamily: SN, fontSize: 13, color: C.ink3 }}>
            {totalPendientes} tareas pendientes
          </div>
        </div>

        {/* Partidas con tareas (motor: agruparPorPartida) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))', gap: 18 }}>
          {partidas.map(p => {
            const info = PARTIDA_INFO[p.partida] ?? { nombre: p.partida, color: C.ink3, icono: '•' }
            return (
              <div key={p.partida}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: info.color, color: '#fff', marginBottom: 12 }}>
                  <span style={{ fontSize: 18 }}>{info.icono}</span>
                  <span style={{ fontFamily: SN, fontWeight: 800, fontSize: 16, letterSpacing: .5 }}>{info.nombre.toUpperCase()}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: SN, fontSize: 13, opacity: .9 }}>{p.minutos_estimados} min</span>
                </div>
                {p.tareas.map(t => {
                  const done = t.estado === 'hecha'
                  const esBase = t.tipo === 'subelaboracion'
                  return (
                    <div key={t.id} style={{ background: '#fff', border: `1px solid ${done ? C.verde : C.linea}`, borderRadius: 12, padding: '12px 14px', marginBottom: 10, opacity: done ? 0.6 : 1 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontFamily: SN, fontWeight: esBase ? 800 : 700, fontSize: esBase ? 12.5 : 14.5, letterSpacing: esBase ? .3 : 0, color: esBase ? C.oro : C.tinta, textTransform: esBase ? 'uppercase' : 'none', lineHeight: 1.25, textDecoration: done ? 'line-through' : 'none' }}>
                            {t.nombre}
                          </div>
                          <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginTop: 3 }}>
                            {t.duracion_estimada_min} min · {asignadoA[t.id] ? `→ ${NOMBRE_TRAB[asignadoA[t.id]]}` : (done ? 'hecha' : 'en cola')}
                          </div>
                          {t.depende_de && t.depende_de.length > 0 && (
                            <div style={{ fontFamily: SN, fontSize: 11.5, color: C.verde, marginTop: 4 }}>
                              ↳ depende de {t.depende_de.length} base{t.depende_de.length > 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                        {!done && (
                          <button onClick={() => completar(t.id)} style={{ flexShrink: 0, fontFamily: SN, fontWeight: 700, fontSize: 12.5, color: '#fff', background: C.verde, border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                            Hecho
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Pie */}
        <p style={{ fontFamily: SN, fontSize: 15, color: C.ink3, textAlign: 'center', lineHeight: 1.5, marginTop: 30 }}>
          Esto no es una maqueta: el reparto por cocinero, el orden por prioridad y los avisos encadenados los
          calcula <strong style={{ color: C.verde }}>el mismo motor</strong> que irá dentro de ia.rest. Tú solo marcas “hecho”.
        </p>
        <div style={{ textAlign: 'center', marginTop: 10, fontFamily: SN, fontSize: 12.5, color: C.oro, letterSpacing: 1 }}>CATERING JOAQUÍN JAÉN · COCINA · ia.rest</div>
      </div>
    </div>
  )
}
