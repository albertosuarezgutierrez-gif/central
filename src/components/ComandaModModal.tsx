'use client'

// ============================================================
// ComandaModModal — Modal de modificación/eliminación de ítems
// Usado en /edge > tab Pedidos para modificar comandas enviadas
// Registra audit trail completo en comanda_modificaciones
// ============================================================

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

const C = {
  bg:   '#F6F1E7', bg1: '#FBF8F1', bg2: '#EFE7D6',
  ink:  '#1A1714', ink2: '#3A332C', ink3: '#6B5F52', ink4: '#9A8D7C',
  rule: '#D8CDB6',
  verm: '#D9442B', vermD: '#A8311E', vermS: '#F4D8CF',
  amb:  '#E8A33B', ambS: '#F7E3B6',
  gr:   '#3F7D44', grS: '#D4E4D2',
  teal: '#2B6A6E',
}
const SN = "'Inter Tight',system-ui,sans-serif"
const SE = "'Newsreader',Georgia,serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"

type TipoAccion   = 'eliminar_item' | 'modificar_cantidad'
type MotivoCat    = 'error_pedido' | 'cliente_cambio' | 'producto_no_disponible' | 'orden_supervisor' | 'otro'

export interface ItemMod {
  id: string
  nombre: string
  cantidad: number
  cantidad_original?: number
  estado: string       // estado en KDS: pendiente | en_proceso | listo
}

interface Props {
  item: ItemMod
  comandaId: string
  restauranteId: string
  camareroId: string
  mesaLabel: string
  onSuccess: (itemId: string, accion: TipoAccion, nuevaCantidad?: number) => void
  onClose: () => void
}

const MOTIVOS: { value: MotivoCat; label: string }[] = [
  { value: 'error_pedido',            label: 'Me equivoqué al pedir'         },
  { value: 'cliente_cambio',          label: 'El cliente cambió de opinión'  },
  { value: 'producto_no_disponible',  label: 'Producto no disponible (86)'   },
  { value: 'orden_supervisor',        label: 'Orden del supervisor'          },
  { value: 'otro',                    label: 'Otro motivo'                   },
]

export default function ComandaModModal({
  item, comandaId, restauranteId, camareroId, mesaLabel, onSuccess, onClose,
}: Props) {
  const [paso, setPaso]                   = useState<1 | 2 | 3>(1)
  const [accion, setAccion]               = useState<TipoAccion | null>(null)
  const [nuevaCantidad, setNuevaCantidad] = useState(item.cantidad)
  const [motivoCat, setMotivoCat]         = useState<MotivoCat | null>(null)
  const [motivoTexto, setMotivoTexto]     = useState('')
  const [pinSupervisor, setPinSupervisor] = useState('')
  const [cargando, setCargando]           = useState(false)
  const [error, setError]                 = useState('')

  const yaEnCocina = ['en_proceso', 'listo'].includes(item.estado)

  async function handleConfirmar() {
    if (!motivoCat) return
    setError('')
    if (yaEnCocina && paso === 2) { setPaso(3); return }
    await ejecutar(null)
  }

  async function handleConfirmarConPin() {
    if (pinSupervisor.length !== 4) { setError('PIN de 4 dígitos'); return }
    setCargando(true)
    setError('')
    // Validar PIN supervisor
    const { data: val } = await supabase.rpc('validate_pin_with_rate_limit', {
      p_restaurante_id: restauranteId, p_pin: pinSupervisor,
    })
    if (!val?.ok) { setError('PIN incorrecto'); setCargando(false); return }
    if (!['owner', 'admin', 'jefe_sala', 'super_admin'].includes(val.rol)) {
      setError('Ese PIN no tiene permisos de supervisor'); setCargando(false); return
    }
    await ejecutar(val.camarero_id, false)
  }

  async function ejecutar(supervisorId: string | null, setLoading = true) {
    if (setLoading) setCargando(true)
    setError('')
    try {
      const motivo = motivoTexto.trim() || MOTIVOS.find(m => m.value === motivoCat)?.label || ''
      const { data, error: rpcErr } = await supabase.rpc('rpc_modificar_comanda_item', {
        p_restaurante_id:   restauranteId,
        p_comanda_id:       comandaId,
        p_comanda_item_id:  item.id,
        p_tipo_accion:      accion!,
        p_motivo_categoria: motivoCat!,
        p_motivo_declarado: motivo,
        p_camarero_id:      camareroId,
        p_nueva_cantidad:   accion === 'modificar_cantidad' ? nuevaCantidad : null,
        p_supervisor_id:    supervisorId,
      })
      if (rpcErr) throw rpcErr
      if (!data?.ok) {
        if (data?.requiere_autorizacion) { setPaso(3); return }
        throw new Error(data?.error || 'Error desconocido')
      }
      onSuccess(item.id, accion!, accion === 'modificar_cantidad' ? nuevaCantidad : undefined)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al procesar')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,23,20,.55)', zIndex: 200,
               display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>

      <div style={{ width: '100%', maxWidth: 520, background: C.bg1,
                    borderTop: `1px solid ${C.rule}`, borderRadius: '20px 20px 0 0',
                    animation: 'slideUp .25s ease', overflow: 'hidden' }}>

        {/* Handle */}
        <div style={{ width: 36, height: 3, background: C.rule, borderRadius: 2, margin: '10px auto 0' }}/>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 20px', borderBottom: `1px solid ${C.rule}` }}>
          <div>
            <div style={{ fontFamily: SM, fontSize: 9, color: C.ink3, textTransform: 'uppercase',
                          letterSpacing: '.1em', marginBottom: 3 }}>
              {mesaLabel}
            </div>
            <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 18, color: C.ink }}>
              {item.nombre}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer',
                                             fontSize: 18, color: C.ink4, padding: 4 }}>✕</button>
        </div>

        {/* Aviso si ya en cocina */}
        {yaEnCocina && (
          <div style={{ margin: '12px 20px 0', padding: '10px 14px', background: C.ambS,
                        border: `1px solid ${C.amb}44`, borderRadius: 8 }}>
            <span style={{ fontFamily: SM, fontSize: 10, color: '#7A5A1A' }}>
              ⚠ Ítem ya en cocina — necesitarás PIN de supervisor
            </span>
          </div>
        )}

        {/* ── PASO 1: Acción ── */}
        {paso === 1 && (
          <div style={{ padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Eliminar */}
            <button onClick={() => { setAccion('eliminar_item'); setPaso(2) }}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                       background: C.vermS, border: `1px solid ${C.verm}33`, borderRadius: 12,
                       cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: C.verm,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 16, flexShrink: 0 }}>🗑️</div>
              <div>
                <div style={{ fontFamily: SN, fontWeight: 600, fontSize: 14, color: C.ink }}>
                  Eliminar ítem
                </div>
                <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginTop: 2 }}>
                  Quitar de la comanda — queda registrado
                </div>
              </div>
            </button>
            {/* Cambiar cantidad */}
            <button onClick={() => { setAccion('modificar_cantidad'); setPaso(2) }}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                       background: C.ambS, border: `1px solid ${C.amb}33`, borderRadius: 12,
                       cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: C.amb,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 16, flexShrink: 0 }}>✏️</div>
              <div>
                <div style={{ fontFamily: SN, fontWeight: 600, fontSize: 14, color: C.ink }}>
                  Cambiar cantidad
                </div>
                <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginTop: 2 }}>
                  Ahora: {item.cantidad} ud.
                  {item.cantidad_original && item.cantidad_original !== item.cantidad &&
                    <span style={{ color: C.amb, marginLeft: 4 }}>(original: {item.cantidad_original})</span>}
                </div>
              </div>
            </button>
          </div>
        )}

        {/* ── PASO 2: Motivo ── */}
        {paso === 2 && (
          <div style={{ padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Selector cantidad */}
            {accion === 'modificar_cantidad' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20,
                            padding: '12px 0', borderBottom: `1px solid ${C.rule}` }}>
                <button onClick={() => setNuevaCantidad(Math.max(1, nuevaCantidad - 1))}
                  style={{ width: 40, height: 40, borderRadius: '50%', background: C.bg2,
                           border: `1px solid ${C.rule}`, fontFamily: SN, fontSize: 22,
                           cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  −
                </button>
                <span style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 44, color: C.verm,
                               minWidth: 60, textAlign: 'center', lineHeight: 1 }}>
                  {nuevaCantidad}
                </span>
                <button onClick={() => setNuevaCantidad(nuevaCantidad + 1)}
                  style={{ width: 40, height: 40, borderRadius: '50%', background: C.bg2,
                           border: `1px solid ${C.rule}`, fontFamily: SN, fontSize: 22,
                           cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  +
                </button>
              </div>
            )}

            <div style={{ fontFamily: SN, fontSize: 13, color: C.ink2, fontWeight: 500 }}>
              ¿Por qué modificas esta comanda?
            </div>

            {MOTIVOS.map(m => (
              <button key={m.value} onClick={() => setMotivoCat(m.value)}
                style={{ padding: '12px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                         fontFamily: SN, fontSize: 13, fontWeight: motivoCat === m.value ? 600 : 400,
                         background: motivoCat === m.value ? C.vermS : C.bg2,
                         border: `1px solid ${motivoCat === m.value ? C.verm + '55' : C.rule}`,
                         color: motivoCat === m.value ? C.verm : C.ink2,
                         display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {m.label}
                {motivoCat === m.value && (
                  <span style={{ fontFamily: SM, fontSize: 10, color: C.verm }}>✓</span>
                )}
              </button>
            ))}

            {motivoCat === 'otro' && (
              <textarea
                placeholder="Explica brevemente…"
                value={motivoTexto}
                onChange={e => setMotivoTexto(e.target.value)}
                rows={2}
                style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 10,
                         padding: '10px 14px', fontFamily: SN, fontSize: 13, color: C.ink,
                         resize: 'none', outline: 'none', width: '100%', boxSizing: 'border-box' }}
              />
            )}

            {error && <div style={{ fontFamily: SM, fontSize: 11, color: C.verm }}>{error}</div>}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button onClick={() => { setPaso(1); setMotivoCat(null); setError('') }}
                style={{ flex: 1, padding: '12px 0', background: 'transparent', border: `1px solid ${C.rule}`,
                         borderRadius: 10, fontFamily: SN, fontSize: 13, color: C.ink3, cursor: 'pointer' }}>
                Atrás
              </button>
              <button onClick={handleConfirmar} disabled={!motivoCat || cargando}
                style={{ flex: 2, padding: '12px 0', background: motivoCat ? C.verm : C.rule,
                         border: 'none', borderRadius: 10, fontFamily: SN, fontSize: 13,
                         fontWeight: 600, color: motivoCat ? '#fff' : C.ink4,
                         cursor: motivoCat ? 'pointer' : 'default', transition: 'all .15s' }}>
                {cargando ? 'Procesando…' : yaEnCocina ? 'Continuar →' : 'Confirmar cambio'}
              </button>
            </div>
          </div>
        )}

        {/* ── PASO 3: PIN supervisor ── */}
        {paso === 3 && (
          <div style={{ padding: '24px 20px 32px', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 36 }}>🔐</div>
            <div style={{ fontFamily: SN, fontWeight: 600, fontSize: 16, color: C.ink, textAlign: 'center' }}>
              Autorización de supervisor
            </div>
            <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, textAlign: 'center', lineHeight: 1.5 }}>
              El ítem está en cocina. Pide a tu jefe de sala o al owner que introduzca su PIN.
            </div>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pinSupervisor}
              onChange={e => setPinSupervisor(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="• • • •"
              autoFocus
              style={{ width: 140, textAlign: 'center', background: C.bg2,
                       border: `2px solid ${error ? C.verm : C.rule}`, borderRadius: 12,
                       padding: '14px 0', fontSize: 24, letterSpacing: '0.5em',
                       fontFamily: SM, color: C.ink, outline: 'none' }}
            />
            {error && <div style={{ fontFamily: SM, fontSize: 11, color: C.verm }}>{error}</div>}
            <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              <button onClick={() => { setPaso(2); setPinSupervisor(''); setError('') }}
                style={{ flex: 1, padding: '13px 0', background: 'transparent', border: `1px solid ${C.rule}`,
                         borderRadius: 10, fontFamily: SN, fontSize: 13, color: C.ink3, cursor: 'pointer' }}>
                Atrás
              </button>
              <button onClick={handleConfirmarConPin} disabled={pinSupervisor.length !== 4 || cargando}
                style={{ flex: 2, padding: '13px 0', background: pinSupervisor.length === 4 ? C.verm : C.rule,
                         border: 'none', borderRadius: 10, fontFamily: SN, fontSize: 13, fontWeight: 600,
                         color: pinSupervisor.length === 4 ? '#fff' : C.ink4,
                         cursor: pinSupervisor.length === 4 ? 'pointer' : 'default' }}>
                {cargando ? 'Verificando…' : 'Autorizar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
