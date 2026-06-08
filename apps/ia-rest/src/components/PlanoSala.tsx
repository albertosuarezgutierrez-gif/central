'use client'
// ============================================================
// ia.rest · PlanoSala v2 — Vista de planta (solo lectura)
// Shared: /edge (camarero) · /jefe · minimap de todas las zonas
//
// Novedades v2:
//  - Pulso de tiempo progresivo: verde→ámbar→naranja→rojo por minutos
//  - Doble-tap/dblclick para marchar rápido (onMesaDoubleTap)
//  - Badge 🍞 si servicio running pendiente
//  - Minimap: prop minimap=true muestra todas las zonas en grid
// ============================================================

import { useRef, useEffect, useState, useCallback } from 'react'

const CANVAS_W  = 580
const CANVAS_H  = 320
const GRID      = 20
const MINIMAP_W = 160
const MINIMAP_H = 100

export type MesaEstado =
  'libre' | 'activa' | 'en_cocina' | 'lista' | 'marchar' | 'urgente' | 'aviso' | 'cuenta' | 'reservada'

export interface MesaPlano {
  id: string
  codigo: string
  capacidad: number
  zona: string
  pos_x: number | null
  pos_y: number | null
  forma: 'round' | 'square' | 'bar' | null
  estado: MesaEstado
  num_comensales?: number | null
  camarero_nombre?: string | null
  minutos_abierta?: number | null
  es_mia?: boolean
  servicio_pendiente?: boolean   // 🍞 running no ha llevado el cubierto aún
  nombre_cuenta?: string | null  // alias opcional de la comanda (ej: "Pepe")
  reserva_hora?: string | null   // hora de reserva si estado=reservada (ej: "21:00")
}

export interface ZonaInfo {
  id: string
  tipo: string
  nombre: string
}

interface Props {
  mesas: MesaPlano[]
  zonas: ZonaInfo[]
  onMesaTap?: (mesa: MesaPlano) => void
  onMesaDoubleTap?: (mesa: MesaPlano) => void  // doble-tap = marchar rápido
  resaltarMias?: boolean
  mostrarLibres?: boolean
  mesaSeleccionada?: string | null
  minimap?: boolean  // vista todas las zonas comprimida
}

// ── Color por tiempo transcurrido ────────────────────────────
// Verde 0-15m · Ámbar 15-30m · Naranja 30-45m · Rojo 45m+
function colorPorTiempo(min: number | null | undefined, estado: MesaEstado): {
  border: string; bg: string; fg: string; dot: string; urgente: boolean
} {
  if (estado === 'reservada') return {
    border: 'rgba(59,130,246,0.55)', bg: 'rgba(59,130,246,0.08)', fg: '#1D4ED8',
    dot: '#3B82F6', urgente: false,
  }
  if (!min || min < 1 || estado === 'libre') return {
    border: 'rgba(216,205,182,0.25)', bg: '#FBF8F1', fg: '#9A8D7C',
    dot: 'rgba(216,205,182,0.3)', urgente: false,
  }
  if (estado === 'cuenta') return {
    border: 'rgba(26,23,20,0.3)', bg: 'rgba(26,23,20,0.05)', fg: '#3A332C',
    dot: '#6B5F52', urgente: false,
  }
  if (min < 15) return {
    border: 'rgba(63,125,68,0.5)', bg: 'rgba(63,125,68,0.07)', fg: '#3F7D44',
    dot: '#3F7D44', urgente: false,
  }
  if (min < 30) return {
    border: 'rgba(232,163,59,0.55)', bg: 'rgba(232,163,59,0.07)', fg: '#C8901A',
    dot: '#E8A33B', urgente: false,
  }
  if (min < 45) return {
    border: 'rgba(210,100,20,0.7)', bg: 'rgba(210,100,20,0.09)', fg: '#B55510',
    dot: '#D26414', urgente: false,
  }
  return {
    border: 'rgba(217,68,43,0.7)', bg: 'rgba(217,68,43,0.09)', fg: '#D9442B',
    dot: '#D9442B', urgente: true,
  }
}

function mesaSize(forma: string | null, cap: number, scale = 1) {
  const base = forma === 'bar'    ? { w: 60, h: 30 }
             : forma === 'square' ? { w: cap >= 6 ? 64 : 54, h: cap >= 6 ? 64 : 54 }
             : { w: cap >= 6 ? 60 : 50, h: cap >= 6 ? 60 : 50 }
  return { w: base.w * scale, h: base.h * scale }
}

function autoPos(idx: number) {
  return { x: 28 + (idx % 6) * 84, y: 28 + Math.floor(idx / 6) * 88 }
}

function tiempoStr(min: number | null | undefined) {
  if (!min || min < 1) return null
  if (min < 60) return `${min}m`
  return `${Math.floor(min / 60)}h${min % 60 ? `${min % 60}m` : ''}`
}

// ── Componente mesa individual ────────────────────────────────
function MesaIcon({
  mesa, isSel, resaltarMias, scale = 1,
  onTap, onDoubleTap,
}: {
  mesa: MesaPlano; isSel: boolean; resaltarMias: boolean
  scale?: number
  onTap?: () => void; onDoubleTap?: () => void
}) {
  const lastTap = useRef(0)
  const sz  = mesaSize(mesa.forma, mesa.capacidad)
  const pal = colorPorTiempo(mesa.minutos_abierta, mesa.estado)
  const isRound  = (mesa.forma ?? 'round') === 'round'
  const isSquare = mesa.forma === 'square'
  const pax      = mesa.num_comensales
  const tiempo   = tiempoStr(mesa.minutos_abierta)
  const isMia    = resaltarMias && mesa.es_mia === true

  const handleTap = () => {
    const now = Date.now()
    if (now - lastTap.current < 350 && onDoubleTap) {
      onDoubleTap()
    } else {
      onTap?.()
    }
    lastTap.current = now
  }

  return (
    <div
      onClick={e => { e.stopPropagation(); handleTap() }}
      style={{
        position: 'absolute',
        width: sz.w, height: sz.h,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        animation: pal.urgente ? 'urgPulse 1.8s ease-in-out infinite' : undefined,
      }}
    >
      <div style={{
        width: '100%', height: '100%',
        borderRadius: isRound ? '50%' : isSquare ? 8 * scale : 4 * scale,
        background: isSel ? '#F4D8CF' : pal.bg,
        border: `${isMia ? 2 : 1.5}px solid ${isSel ? '#D9442B' : pal.border}`,
        boxShadow: isSel
          ? '0 0 0 3px rgba(217,68,43,0.18)'
          : isMia ? '0 0 0 1px rgba(217,68,43,0.1)' : '0 1px 2px rgba(26,23,20,.05)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 1, position: 'relative', transition: 'border-color .2s, background .2s',
      }}>
        {/* Número pax o capacidad */}
        {mesa.forma !== 'bar' && (
          <div style={{
            fontFamily: "'Newsreader',serif", fontStyle: 'italic',
            fontSize: sz.w > 54 ? 17 * scale : 14 * scale,
            fontWeight: 500, color: isSel ? '#D9442B' : pal.fg, lineHeight: 1,
          }}>
            {mesa.capacidad}
          </div>
        )}
        {/* Código o nombre cuenta */}
        <div style={{
          fontFamily: mesa.nombre_cuenta ? "'Newsreader',serif" : "'JetBrains Mono',monospace",
          fontStyle: mesa.nombre_cuenta ? 'italic' : 'normal',
          fontSize: 7 * scale, color: isSel ? '#D9442B' : pal.fg,
          lineHeight: 1, opacity: .85,
          maxWidth: sz.w - 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {mesa.nombre_cuenta ? `★${mesa.nombre_cuenta}` : mesa.codigo}
        </div>
        {/* Tiempo */}
        {tiempo && mesa.estado !== 'libre' && (
          <div style={{
            fontFamily: "'JetBrains Mono',monospace", fontSize: 7 * scale,
            color: pal.urgente ? '#D9442B' : '#9A8D7C', lineHeight: 1, marginTop: 1,
          }}>
            {tiempo}
          </div>
        )}
        {/* Badge reservada: candado + hora */}
        {mesa.estado === 'reservada' && (
          <div style={{
            position: 'absolute', inset: 0,
            borderRadius: 'inherit',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 1,
          }}>
            <div style={{ fontSize: 11 * scale, lineHeight: 1 }}>🔒</div>
            {mesa.reserva_hora && (
              <div style={{
                fontFamily: "'JetBrains Mono',monospace", fontSize: 7 * scale,
                color: '#1D4ED8', fontWeight: 700, lineHeight: 1,
              }}>{mesa.reserva_hora}</div>
            )}
          </div>
        )}

        {/* Dot estado */}
        <div style={{
          width: 5 * scale, height: 5 * scale, borderRadius: '50%',
          background: pal.dot,
          border: mesa.estado === 'libre' ? '1px solid rgba(216,205,182,0.4)' : 'none',
          marginTop: 2 * scale, flexShrink: 0,
        }} />

        {/* Badge pax */}
        {pax && pax > 0 && mesa.estado !== 'libre' && (
          <div style={{
            position: 'absolute', top: -6 * scale, left: '50%',
            transform: 'translateX(-50%)',
            background: '#3F7D44', color: '#fff',
            borderRadius: 6 * scale, fontSize: 7 * scale, fontWeight: 700,
            fontFamily: "'JetBrains Mono',monospace",
            padding: `${scale}px ${4 * scale}px`, lineHeight: 1.4,
            border: '1.5px solid #FBF8F1', whiteSpace: 'nowrap',
          }}>
            {pax}p
          </div>
        )}

        {/* Badge 🍞 servicio running pendiente */}
        {mesa.servicio_pendiente && (
          <div style={{
            position: 'absolute', bottom: -5 * scale, right: -5 * scale,
            background: '#E8A33B', color: '#412402',
            borderRadius: '50%', width: 14 * scale, height: 14 * scale,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8 * scale, border: '1.5px solid #FBF8F1',
            fontFamily: 'system-ui', lineHeight: 1,
          }}>
            🍞
          </div>
        )}

        {/* Punto teal = mesa de otro camarero */}
        {resaltarMias && mesa.es_mia === false && mesa.estado !== 'libre' && (
          <div style={{
            position: 'absolute', top: 3 * scale, right: 3 * scale,
            width: 5 * scale, height: 5 * scale, borderRadius: '50%',
            background: '#2B6A6E',
          }} />
        )}
      </div>
    </div>
  )
}

// ── Canvas de zona ────────────────────────────────────────────
function ZonaCanvas({
  mesas, nombreZona, scale = 1, canvasW = CANVAS_W, canvasH = CANVAS_H,
  resaltarMias, mesaSeleccionada, onMesaTap, onMesaDoubleTap, compact = false,
}: {
  mesas: MesaPlano[]
  nombreZona: string
  scale?: number
  canvasW?: number
  canvasH?: number
  resaltarMias: boolean
  mesaSeleccionada?: string | null
  onMesaTap?: (m: MesaPlano) => void
  onMesaDoubleTap?: (m: MesaPlano) => void
  compact?: boolean
}) {
  return (
    <div style={{
      position: 'relative', width: canvasW, height: canvasH,
      background: '#FBF8F1',
      borderRadius: compact ? 8 : 12,
      border: '1px solid #D8CDB6',
      backgroundImage: compact ? 'none'
        : `linear-gradient(rgba(216,205,182,0.18) 1px,transparent 1px),linear-gradient(90deg,rgba(216,205,182,0.18) 1px,transparent 1px)`,
      backgroundSize: `${GRID * 2}px ${GRID * 2}px`,
    }}>
      {/* Hint zona */}
      <div style={{
        position: 'absolute', top: compact ? 4 : 8, left: compact ? 6 : 12,
        fontFamily: "'JetBrains Mono',monospace", fontSize: compact ? 7 : 8,
        color: '#9A8D7C', letterSpacing: '.06em', textTransform: 'uppercase',
        pointerEvents: 'none', opacity: .5,
      }}>
        {nombreZona}
      </div>

      {mesas.length === 0 && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Newsreader',serif", fontStyle: 'italic',
          fontSize: 12, color: '#9A8D7C', opacity: .45,
        }}>
          vacía
        </div>
      )}

      {mesas.map((mesa, idx) => {
        const pos = mesa.pos_x !== null && mesa.pos_y !== null
          ? { x: mesa.pos_x * scale, y: mesa.pos_y * scale }
          : { x: autoPos(idx).x * scale, y: autoPos(idx).y * scale }
        const sz = mesaSize(mesa.forma, mesa.capacidad, scale)
        return (
          <div key={mesa.id} style={{ position: 'absolute', left: pos.x, top: pos.y, width: sz.w, height: sz.h }}>
            <MesaIcon
              mesa={mesa} isSel={mesaSeleccionada === mesa.id}
              resaltarMias={resaltarMias} scale={scale}
              onTap={() => onMesaTap?.(mesa)}
              onDoubleTap={() => onMesaDoubleTap?.(mesa)}
            />
          </div>
        )
      })}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────
export default function PlanoSala({
  mesas, zonas, onMesaTap, onMesaDoubleTap,
  resaltarMias = true, mostrarLibres = true,
  mesaSeleccionada = null, minimap = false,
}: Props) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [zonaActiva, setZonaActiva] = useState('')
  const [tick, setTick]   = useState(0)  // forzar re-render cada 30s para actualizar colores

  // Init zona activa
  useEffect(() => {
    if (!zonaActiva && zonas.length > 0) {
      const primera = zonas.find(z => mesas.some(m => m.zona === z.tipo)) ?? zonas[0]
      setZonaActiva(primera.tipo)
    }
  }, [zonas, mesas, zonaActiva])

  // Timer para pulso de tiempo (cada 30s)
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])
  void tick

  // ResizeObserver responsive
  const calcScale = useCallback(() => {
    if (!containerRef.current) return
    const w = containerRef.current.clientWidth
    setScale(Math.min(1, w / CANVAS_W))
  }, [])

  useEffect(() => {
    calcScale()
    const ro = new ResizeObserver(calcScale)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [calcScale])

  // Contadores por zona
  const cntZona = (tipo: string) => ({
    urgentes: mesas.filter(m => m.zona === tipo && (m.estado === 'urgente' || (m.minutos_abierta ?? 0) >= 45)).length,
    activas:  mesas.filter(m => m.zona === tipo && m.estado !== 'libre').length,
    total:    mesas.filter(m => m.zona === tipo).length,
  })

  // ── MINIMAP (todas las zonas) ─────────────────────────────
  if (minimap) {
    const minScale = MINIMAP_W / CANVAS_W
    const minH     = CANVAS_H * minScale
    return (
      <div ref={containerRef} style={{ width: '100%' }}>
        <style>{`@keyframes urgPulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {zonas.map(z => {
            const mesasZ = mesas.filter(m => m.zona === z.tipo && (mostrarLibres || m.estado !== 'libre'))
            const cnt    = cntZona(z.tipo)
            return (
              <div key={z.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* Label zona */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
                    color: '#6B5F52', letterSpacing: '.08em', textTransform: 'uppercase',
                  }}>
                    {z.nombre}
                  </div>
                  {cnt.urgentes > 0 && (
                    <span style={{
                      background: '#D9442B', color: '#fff', borderRadius: 6,
                      fontSize: 8, padding: '0 4px', fontFamily: "'JetBrains Mono',monospace",
                      fontWeight: 700, animation: 'urgPulse 1s infinite',
                    }}>
                      {cnt.urgentes}⚠
                    </span>
                  )}
                  {cnt.urgentes === 0 && cnt.activas > 0 && (
                    <span style={{
                      background: 'rgba(63,125,68,0.15)', color: '#3F7D44',
                      borderRadius: 6, fontSize: 8, padding: '0 4px',
                      fontFamily: "'JetBrains Mono',monospace",
                    }}>
                      {cnt.activas}
                    </span>
                  )}
                </div>
                {/* Mini canvas */}
                <div style={{ width: MINIMAP_W, height: minH, position: 'relative', overflow: 'hidden' }}>
                  <div style={{
                    position: 'absolute', top: 0, left: 0,
                    width: CANVAS_W, height: CANVAS_H,
                    transformOrigin: 'top left',
                    transform: `scale(${minScale})`,
                  }}>
                    <ZonaCanvas
                      mesas={mesasZ} nombreZona={z.nombre}
                      scale={1} canvasW={CANVAS_W} canvasH={CANVAS_H}
                      resaltarMias={resaltarMias}
                      mesaSeleccionada={mesaSeleccionada}
                      onMesaTap={onMesaTap}
                      onMesaDoubleTap={onMesaDoubleTap}
                      compact={true}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── VISTA NORMAL (una zona) ───────────────────────────────
  const mesasZona = mesas.filter(m =>
    m.zona === zonaActiva && (mostrarLibres || m.estado !== 'libre')
  )

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <style>{`
        @keyframes urgPulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes slideZona{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
        .mesa-tap{cursor:pointer}
        .mesa-tap:active{transform:scale(.93)!important}
      `}</style>

      {/* Tabs de zona */}
      <div style={{ display:'flex', gap:4, marginBottom:10, overflowX:'auto', scrollbarWidth:'none' }}>
        {zonas.map(z => {
          const cnt = cntZona(z.tipo)
          const on  = zonaActiva === z.tipo
          return (
            <button key={z.id} onClick={() => setZonaActiva(z.tipo)} style={{
              padding: '6px 14px', borderRadius: 9999, flexShrink: 0,
              border: 'none',
              boxShadow: on ? 'none' : 'rgba(184,169,139,0.45) 0px 0px 0px 1px',
              background: on ? '#D9442B' : 'transparent',
              color: on ? '#F6F1E7' : '#9A8D7C',
              fontSize: 11, fontFamily: "'Inter Tight',system-ui,sans-serif",
              fontWeight: on ? 600 : 400, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'all .15s',
            }}>
              {z.nombre}
              {cnt.urgentes > 0 && (
                <span style={{
                  background: '#D9442B', color: '#fff', borderRadius: 8,
                  fontSize: 9, padding: '0 5px',
                  fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
                  animation: 'urgPulse 1s ease-in-out infinite',
                }}>
                  {cnt.urgentes}⚠
                </span>
              )}
              {cnt.urgentes === 0 && cnt.activas > 0 && (
                <span style={{
                  background: 'rgba(63,125,68,0.15)', color: '#3F7D44',
                  borderRadius: 8, fontSize: 9, padding: '0 5px',
                  fontFamily: "'JetBrains Mono',monospace",
                }}>
                  {cnt.activas}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Canvas responsivo */}
      <div style={{ position:'relative', width:'100%', height: CANVAS_H * scale, overflow:'hidden' }}>
        <div style={{
          position: 'absolute', top: 0, left: 0,
          transformOrigin: 'top left',
          transform: `scale(${scale})`,
          animation: 'slideZona .15s ease',
        }}>
          <ZonaCanvas
            mesas={mesasZona}
            nombreZona={zonas.find(z => z.tipo === zonaActiva)?.nombre ?? zonaActiva}
            scale={1} canvasW={CANVAS_W} canvasH={CANVAS_H}
            resaltarMias={resaltarMias}
            mesaSeleccionada={mesaSeleccionada}
            onMesaTap={onMesaTap}
            onMesaDoubleTap={onMesaDoubleTap}
          />
        </div>
      </div>

      {/* Leyenda */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:8, padding:'0 2px' }}>
        {[
          { dot:'rgba(216,205,182,0.5)', label:'Libre' },
          { dot:'#3F7D44', label:'< 15 min' },
          { dot:'#E8A33B', label:'15-30 min' },
          { dot:'#D26414', label:'30-45 min' },
          { dot:'#D9442B', label:'> 45 min' },
        ].map(l => (
          <div key={l.label} style={{
            display:'flex', alignItems:'center', gap:4,
            fontSize:10, color:'#9A8D7C',
            fontFamily:"'Inter Tight',system-ui,sans-serif",
          }}>
            <div style={{ width:6,height:6,borderRadius:'50%',background:l.dot,flexShrink:0 }} />
            {l.label}
          </div>
        ))}
        {resaltarMias && (
          <>
            <div style={{display:'flex',alignItems:'center',gap:4,fontSize:10,color:'#9A8D7C',fontFamily:"'Inter Tight',system-ui,sans-serif"}}>
              <div style={{width:6,height:6,borderRadius:'50%',background:'#2B6A6E',flexShrink:0}}/>
              Otro camarero
            </div>
            <div style={{display:'flex',alignItems:'center',gap:4,fontSize:10,color:'#9A8D7C',fontFamily:"'Inter Tight',system-ui,sans-serif"}}>
              <span style={{fontSize:9}}>🍞</span> Cubierto pendiente
            </div>
          </>
        )}
        {onMesaDoubleTap && (
          <div style={{display:'flex',alignItems:'center',gap:4,fontSize:10,color:'#9A8D7C',fontFamily:"'Inter Tight',system-ui,sans-serif",marginLeft:'auto'}}>
            doble-tap → marchar
          </div>
        )}
      </div>
    </div>
  )
}
