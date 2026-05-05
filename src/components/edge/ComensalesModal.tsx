'use client'
// ============================================================
// ia.rest · ComensalesModal
// Pregunta cuántos comensales al abrir primera comanda en mesa.
// Muestra preview del servicio/cubierto si está activo.
// También permite editar comensales de comanda ya abierta.
// ============================================================

import { useState, useEffect } from 'react'

const C = {
  bg:   '#F6F1E7',
  bg1:  '#FBF8F1',
  bg2:  '#EFE7D6',
  ink:  '#1A1714',
  ink2: '#3A332C',
  ink3: '#6B5F52',
  rule: '#D8CDB6',
  verm: '#D9442B',
  vermD:'#A8311E',
  vermS:'#F4D8CF',
  amb:  '#E8A33B',
  ambS: '#FDF3DC',
  gr:   '#3F7D44',
  grS:  '#D4E4D2',
}
const SN = "'Inter Tight',system-ui,sans-serif"
const SE = "'Newsreader',Georgia,serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"
const SC = "'Caveat',cursive"

interface ServicioConfig {
  activo: boolean
  precio: number
  nombre: string
  skip: boolean
}

interface Props {
  mesaCodigo: string
  capacidad?: number
  servicio: ServicioConfig
  // Si se pasa comandaId es edición, si no es creación
  comandaId?: string
  initialPax?: number
  onConfirmar: (pax: number, incluirServicio: boolean) => void
  onSaltarse?: () => void
  onClose: () => void
}

const PAX_OPCIONES = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20]

export default function ComensalesModal({
  mesaCodigo, capacidad, servicio,
  comandaId, initialPax = 0,
  onConfirmar, onSaltarse, onClose
}: Props) {
  const [pax, setPax]                 = useState(initialPax || 2)
  const [incluirServicio, setIncluir] = useState(servicio.activo)
  const [custom, setCustom]           = useState(false)
  const [customVal, setCustomVal]     = useState('')

  const esEdicion = !!comandaId

  const totalServicio = servicio.activo && incluirServicio
    ? pax * servicio.precio
    : 0

  // Si pax > 20 mostramos input manual
  useEffect(() => {
    if (initialPax > 20) { setCustom(true); setCustomVal(String(initialPax)) }
  }, [initialPax])

  const selPax = (n: number) => { setPax(n); setCustom(false) }

  const handleCustom = (v: string) => {
    setCustomVal(v)
    const n = parseInt(v)
    if (!isNaN(n) && n > 0) setPax(n)
  }

  const confirmar = () => {
    if (pax < 1) return
    onConfirmar(pax, incluirServicio && servicio.activo)
  }

  return (
    <>
      <style>{`
        @keyframes modalUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
        .pax-btn:hover{background:${C.verm}22!important;border-color:${C.verm}!important;color:${C.verm}!important}
        .skip-link:hover{color:${C.verm}!important}
        .close-x:hover{background:${C.bg2}!important}
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position:'fixed',inset:0,zIndex:200,
          background:'rgba(26,23,20,0.45)',
          display:'flex',alignItems:'flex-end',
        }}
      >
        {/* Panel */}
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width:'100%',maxWidth:480,margin:'0 auto',
            background:C.bg,
            borderRadius:'20px 20px 0 0',
            border:`1px solid ${C.rule}`,
            borderBottom:'none',
            padding:'0 0 env(safe-area-inset-bottom)',
            animation:'modalUp .22s ease',
            fontFamily:SN,
          }}
        >
          {/* Handle + header */}
          <div style={{padding:'12px 20px 0',textAlign:'center'}}>
            <div style={{width:36,height:4,background:C.rule,borderRadius:2,margin:'0 auto 16px'}} />
          </div>

          <div style={{padding:'0 20px',display:'flex',alignItems:'flex-start',gap:12,marginBottom:16}}>
            <div style={{flex:1}}>
              <div style={{fontFamily:SE,fontStyle:'italic',fontSize:22,color:C.ink,marginBottom:2}}>
                {esEdicion ? 'Editar comensales' : '¿Cuántos comensales?'}
              </div>
              <div style={{fontSize:13,color:C.ink3}}>
                Mesa <strong style={{color:C.ink}}>{mesaCodigo}</strong>
                {capacidad ? ` · capacidad ${capacidad} pax` : ''}
              </div>
            </div>
            <button
              className="close-x"
              onClick={onClose}
              style={{
                width:32,height:32,borderRadius:8,border:`1px solid ${C.rule}`,
                background:C.bg1,color:C.ink3,fontSize:16,cursor:'pointer',
                display:'flex',alignItems:'center',justifyContent:'center',
                flexShrink:0,
              }}
            >×</button>
          </div>

          {/* Grid de opciones */}
          <div style={{padding:'0 20px',marginBottom:14}}>
            <div style={{
              display:'grid',
              gridTemplateColumns:'repeat(6,1fr)',
              gap:6,
            }}>
              {PAX_OPCIONES.map(n => (
                <button
                  key={n}
                  className="pax-btn"
                  onClick={() => selPax(n)}
                  style={{
                    padding:'10px 4px',
                    borderRadius:8,
                    border:`1.5px solid ${pax===n && !custom ? C.verm : C.rule}`,
                    background:pax===n && !custom ? C.vermS : C.bg1,
                    color:pax===n && !custom ? C.verm : C.ink2,
                    fontSize:15,fontWeight:500,cursor:'pointer',
                    fontFamily:SM,transition:'all .1s',
                  }}
                >{n}</button>
              ))}

              {/* Input manual */}
              <input
                type="number"
                min={1}
                max={99}
                placeholder="+20"
                value={custom ? customVal : ''}
                onFocus={() => setCustom(true)}
                onChange={e => handleCustom(e.target.value)}
                style={{
                  padding:'10px 4px',
                  borderRadius:8,
                  border:`1.5px solid ${custom ? C.verm : C.rule}`,
                  background:custom ? C.vermS : C.bg1,
                  color:custom ? C.verm : C.ink3,
                  fontSize:13,textAlign:'center',
                  fontFamily:SM,outline:'none',
                  gridColumn:'span 1',
                }}
              />
            </div>

            {/* Pax seleccionados */}
            <div style={{
              textAlign:'center',
              marginTop:10,
              fontFamily:SE,fontStyle:'italic',fontSize:18,color:C.ink,
            }}>
              {pax} {pax === 1 ? 'comensal' : 'comensales'}
            </div>
          </div>

          {/* Servicio/cubierto */}
          {servicio.activo && (
            <div style={{
              margin:'0 20px 14px',
              background:incluirServicio ? C.ambS : C.bg1,
              border:`1.5px solid ${incluirServicio ? C.amb+'88' : C.rule}`,
              borderRadius:10,
              padding:'11px 14px',
              display:'flex',alignItems:'center',gap:10,
              cursor:'pointer',transition:'all .15s',
            }}
            onClick={() => setIncluir(v => !v)}
            >
              {/* Toggle */}
              <div style={{
                width:36,height:20,borderRadius:10,flexShrink:0,
                background:incluirServicio ? C.amb : C.rule,
                position:'relative',transition:'background .15s',
              }}>
                <div style={{
                  position:'absolute',
                  top:3,left:incluirServicio?18:3,
                  width:14,height:14,borderRadius:7,
                  background:'#fff',transition:'left .15s',
                }} />
              </div>

              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:500,color:C.ink}}>
                  {servicio.nombre}
                  <span style={{fontFamily:SM,fontSize:11,color:C.ink3,marginLeft:8}}>
                    {servicio.precio.toFixed(2).replace('.',',')} €/pax
                  </span>
                </div>
                {incluirServicio && (
                  <div style={{fontFamily:SC,fontSize:13,color:C.amb,marginTop:1}}>
                    {pax} pax × {servicio.precio.toFixed(2).replace('.',',')} € = {totalServicio.toFixed(2).replace('.',',')} €
                  </div>
                )}
                {!incluirServicio && (
                  <div style={{fontSize:11,color:C.ink3,marginTop:1}}>
                    Toca para incluir en esta mesa
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Acciones */}
          <div style={{padding:'0 20px 20px',display:'flex',flexDirection:'column',gap:8}}>
            <button
              onClick={confirmar}
              disabled={pax < 1}
              style={{
                width:'100%',padding:'14px',
                borderRadius:10,border:'none',
                background:C.verm,color:C.bg,
                fontSize:15,fontWeight:500,cursor:'pointer',
                fontFamily:SN,transition:'background .1s',
                opacity:pax<1?0.5:1,
              }}
            >
              {esEdicion ? 'Actualizar' : 'Abrir mesa'}
              {incluirServicio && servicio.activo && pax > 0
                ? ` · +${totalServicio.toFixed(2).replace('.',',')} € cubierto`
                : ''}
            </button>

            {!esEdicion && servicio.skip && onSaltarse && (
              <button
                className="skip-link"
                onClick={onSaltarse}
                style={{
                  background:'none',border:'none',
                  color:C.ink3,fontSize:12,cursor:'pointer',
                  fontFamily:SN,padding:'4px',
                  transition:'color .1s',
                }}
              >
                Sin servicio esta vez
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
