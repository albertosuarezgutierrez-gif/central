'use client'
// src/components/central/ConfigCentral.tsx
// Configuración del grupo — cómo trabajan los locales entre sí y con central

import { useState, useEffect, useCallback } from 'react'

const C = {
  bg:'#14110E', bg2:'#1C1814', bg3:'#221E1A',
  red:'#D9442B', paper:'#F6F1E7',
  ink:'#F6F1E7', ink2:'#D8CDB6', ink3:'#9C8E7E', ink4:'#6B5F52',
  rule:'#2E2A26', green:'#3F7D44', amber:'#E8A33B',
}
const SN = 'Inter Tight, system-ui, sans-serif'
const SM = 'Inter Tight, system-ui, sans-serif'

type Config = {
  modelo_stock: string
  flujos: {
    central_a_local: { quien_solicita: string; quien_aprueba: string; quien_confirma: string }
    local_a_local: { quien_inicia: string; necesita_ok_cedente: boolean; necesita_ok_gestor: boolean; quien_confirma_envio: string; quien_confirma_recibo: string }
    proveedor_a_local: { quien_pide: string; necesita_aprobacion: boolean; limite_sin_aprobacion: number; quien_confirma: string }
  }
  permisos_owner: {
    editar_carta: string
    editar_stock: string
    comprar_proveedor: string
    ver_otros_locales: boolean
    ver_stock_central: boolean
  }
}

const DEFAULT_CONFIG: Config = {
  modelo_stock: 'independiente',
  flujos: {
    central_a_local: { quien_solicita: 'ambos', quien_aprueba: 'gestor', quien_confirma: 'ambos' },
    local_a_local:   { quien_inicia: 'ambos', necesita_ok_cedente: true, necesita_ok_gestor: false, quien_confirma_envio: 'ambos', quien_confirma_recibo: 'ambos' },
    proveedor_a_local: { quien_pide: 'ambos', necesita_aprobacion: false, limite_sin_aprobacion: 500, quien_confirma: 'ambos' },
  },
  permisos_owner: {
    editar_carta: 'completo', editar_stock: 'completo',
    comprar_proveedor: 'libre', ver_otros_locales: false, ver_stock_central: true,
  },
}

interface Props { sh: () => Record<string, string> }

type SelectProps = { label: string; value: string; options: {v:string;l:string}[]; onChange: (v:string)=>void }
function Sel({ label, value, options, onChange }: SelectProps) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: C.ink3, marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
        {options.map(o => (
          <button key={o.v} onClick={() => onChange(o.v)} style={{
            padding: '5px 12px', borderRadius: 20, border: `1px solid ${value===o.v ? C.red : C.rule}`,
            background: value===o.v ? C.red : 'transparent', color: value===o.v ? '#fff' : C.ink3,
            fontFamily: SN, fontSize: 12, cursor: 'pointer',
          }}>{o.l}</button>
        ))}
      </div>
    </div>
  )
}

type ToggleProps = { label: string; desc: string; value: boolean; onChange: (v:boolean)=>void }
function Toggle({ label, desc, value, onChange }: ToggleProps) {
  return (
    <div onClick={() => onChange(!value)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.rule}`, cursor: 'pointer' }}>
      <div>
        <div style={{ fontSize: 13, color: C.ink }}>{label}</div>
        <div style={{ fontSize: 11, color: C.ink4, marginTop: 2 }}>{desc}</div>
      </div>
      <div style={{ width: 36, height: 20, borderRadius: 10, background: value ? C.green : C.rule, position: 'relative', flexShrink: 0, marginLeft: 16 }}>
        <div style={{ position: 'absolute', top: 3, left: value ? 18 : 3, width: 14, height: 14, borderRadius: 7, background: '#fff', transition: 'left .15s' }} />
      </div>
    </div>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.bg3, borderRadius: 12, padding: '16px 18px', marginBottom: 14 }}>
      <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, color: C.ink4, letterSpacing: '.1em', textTransform: 'uppercase' as const, marginBottom: 14 }}>{titulo}</div>
      {children}
    </div>
  )
}

export default function ConfigCentral({ sh }: Props) {
  const [cfg, setCfg] = useState<Config>(DEFAULT_CONFIG)
  const [guardando, setGuardando] = useState(false)
  const [ok, setOk] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/central/config', { headers: sh() })
      const d = await r.json()
      if (d.configuracion) setCfg({ ...DEFAULT_CONFIG, ...d.configuracion })
    } catch { /* usa default */ }
  }, [sh])

  useEffect(() => { cargar() }, [cargar])

  const set = (path: string, value: unknown) => {
    setCfg(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const keys = path.split('.')
      let obj: Record<string, unknown> = next
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]] as Record<string, unknown>
      obj[keys[keys.length - 1]] = value
      setOk(false)
      return next
    })
  }

  const guardar = async () => {
    setGuardando(true)
    try {
      await fetch('/api/central/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...sh() },
        body: JSON.stringify({ configuracion: cfg }),
      })
      setOk(true)
    } finally { setGuardando(false) }
  }

  const QUIEN = [{ v:'gestor', l:'Solo gestor' }, { v:'owner', l:'Solo owner' }, { v:'ambos', l:'Ambos' }, { v:'automatico', l:'Automático' }]
  const QUIEN_BASICO = [{ v:'gestor', l:'Solo gestor' }, { v:'owner', l:'Solo owner' }, { v:'ambos', l:'Ambos' }]

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 0 }}>

      <Seccion titulo="Modelo de stock del grupo">
        <Sel label="¿Cómo gestiona el stock el grupo?"
          value={cfg.modelo_stock}
          options={[
            { v:'independiente', l:'Cada local gestiona el suyo' },
            { v:'centralizado',  l:'Almacén central → reparte' },
            { v:'cd',            l:'CD — Centro de distribución' },
            { v:'consignacion',  l:'Consignación con proveedor' },
          ]}
          onChange={v => set('modelo_stock', v)}
        />
      </Seccion>

      <Seccion titulo="Flujo: Central → Local">
        <Sel label="¿Quién puede solicitar stock del almacén central?" value={cfg.flujos.central_a_local.quien_solicita} options={QUIEN} onChange={v => set('flujos.central_a_local.quien_solicita', v)} />
        <Sel label="¿Quién aprueba la salida del almacén?" value={cfg.flujos.central_a_local.quien_aprueba} options={QUIEN} onChange={v => set('flujos.central_a_local.quien_aprueba', v)} />
        <Sel label="¿Quién confirma que ha llegado al local?" value={cfg.flujos.central_a_local.quien_confirma} options={QUIEN} onChange={v => set('flujos.central_a_local.quien_confirma', v)} />
      </Seccion>

      <Seccion titulo="Flujo: Local → Local (entre bares del grupo)">
        <Sel label="¿Quién puede iniciar la transferencia?" value={cfg.flujos.local_a_local.quien_inicia} options={QUIEN_BASICO} onChange={v => set('flujos.local_a_local.quien_inicia', v)} />
        <Toggle label="¿El bar que cede tiene que confirmar?" desc="El owner del local que envía la mercancía aprueba antes de salir" value={cfg.flujos.local_a_local.necesita_ok_cedente} onChange={v => set('flujos.local_a_local.necesita_ok_cedente', v)} />
        <Toggle label="¿El gestor tiene que aprobar?" desc="Añade un paso de aprobación del gestor central" value={cfg.flujos.local_a_local.necesita_ok_gestor} onChange={v => set('flujos.local_a_local.necesita_ok_gestor', v)} />
        <div style={{ height: 12 }} />
        <Sel label="¿Quién confirma el envío?" value={cfg.flujos.local_a_local.quien_confirma_envio} options={QUIEN_BASICO} onChange={v => set('flujos.local_a_local.quien_confirma_envio', v)} />
        <Sel label="¿Quién confirma la recepción?" value={cfg.flujos.local_a_local.quien_confirma_recibo} options={QUIEN_BASICO} onChange={v => set('flujos.local_a_local.quien_confirma_recibo', v)} />
      </Seccion>

      <Seccion titulo="Flujo: Compra directa a proveedor (por local)">
        <Sel label="¿Quién puede hacer pedidos al proveedor?" value={cfg.flujos.proveedor_a_local.quien_pide} options={QUIEN_BASICO} onChange={v => set('flujos.proveedor_a_local.quien_pide', v)} />
        <Toggle label="¿Requiere aprobación del gestor?" desc="Si está activo, el owner necesita OK antes de hacer el pedido" value={cfg.flujos.proveedor_a_local.necesita_aprobacion} onChange={v => set('flujos.proveedor_a_local.necesita_aprobacion', v)} />
        {!cfg.flujos.proveedor_a_local.necesita_aprobacion && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.ink3, marginBottom: 6 }}>Límite sin aprobación (€) — por encima de este importe sí requiere OK</div>
            <input type="number" value={cfg.flujos.proveedor_a_local.limite_sin_aprobacion}
              onChange={e => set('flujos.proveedor_a_local.limite_sin_aprobacion', Number(e.target.value))}
              style={{ width: 120, padding: '7px 10px', background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 8, color: C.ink, fontFamily: SN, fontSize: 14 }}
            />
          </div>
        )}
        <Sel label="¿Quién confirma la recepción en el local?" value={cfg.flujos.proveedor_a_local.quien_confirma} options={QUIEN_BASICO} onChange={v => set('flujos.proveedor_a_local.quien_confirma', v)} />
      </Seccion>

      <Seccion titulo="Permisos del owner de cada local">
        <Sel label="¿Puede editar la carta?" value={cfg.permisos_owner.editar_carta}
          options={[{ v:'completo', l:'Completo' }, { v:'solo_precios', l:'Solo precios' }, { v:'no', l:'No puede' }]}
          onChange={v => set('permisos_owner.editar_carta', v)}
        />
        <Sel label="¿Puede editar su stock?" value={cfg.permisos_owner.editar_stock}
          options={[{ v:'completo', l:'Completo' }, { v:'solo_consulta', l:'Solo consulta' }, { v:'no', l:'No puede' }]}
          onChange={v => set('permisos_owner.editar_stock', v)}
        />
        <Sel label="¿Puede comprar directamente al proveedor?" value={cfg.permisos_owner.comprar_proveedor}
          options={[{ v:'libre', l:'Libre' }, { v:'con_aprobacion', l:'Con aprobación' }, { v:'no', l:'No puede' }]}
          onChange={v => set('permisos_owner.comprar_proveedor', v)}
        />
        <Toggle label="¿Puede ver ventas de otros locales del grupo?" desc="El owner ve el ranking comparativo del grupo" value={cfg.permisos_owner.ver_otros_locales} onChange={v => set('permisos_owner.ver_otros_locales', v)} />
        <Toggle label="¿Puede ver el stock del almacén central?" desc="El owner ve qué hay disponible en el almacén del grupo" value={cfg.permisos_owner.ver_stock_central} onChange={v => set('permisos_owner.ver_stock_central', v)} />
      </Seccion>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 4 }}>
        <button onClick={guardar} disabled={guardando} style={{
          padding: '11px 24px', background: guardando ? C.rule : C.red, border: 'none', borderRadius: 8,
          fontFamily: SN, fontSize: 14, fontWeight: 700, color: '#fff', cursor: guardando ? 'not-allowed' : 'pointer',
        }}>
          {guardando ? 'Guardando...' : 'Guardar configuración'}
        </button>
        {ok && <span style={{ fontSize: 12, color: C.green }}>✓ Guardado</span>}
      </div>
    </div>
  )
}
