'use client'
// ============================================================
// TiendaTab — configuración del módulo Tienda (vertical retail) para el propietario.
// Modo de catálogo + hardware adaptable (lector, báscula, táctil) + descuento de stock.
// Tabla config_tienda vía /api/tienda/config.
// ============================================================
import { C, SE, SN } from '@/lib/colors'
import { useCallback, useEffect, useState } from 'react'

interface Cfg {
  modo_catalogo: 'mismo' | 'separado'
  barcode_activo: boolean
  barcode_modo: 'usb' | 'camara' | 'ambos'
  bascula_activa: boolean
  solo_tactil: boolean
  descontar_stock: boolean
}

export default function TiendaTab({ sh }: { sh: () => Record<string, string> }) {
  const [cfg, setCfg] = useState<Cfg | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/tienda/config', { headers: sh() })
      .then(r => r.json())
      .then(d => setCfg(d.config as Cfg))
      .catch(() => {})
  }, [sh])

  const guardar = useCallback(async (patch: Partial<Cfg>) => {
    setCfg(prev => (prev ? { ...prev, ...patch } : prev))
    const base = { ...(cfg ?? {}), ...patch }
    try {
      const d = await fetch('/api/tienda/config', {
        method: 'PUT',
        headers: { ...sh(), 'Content-Type': 'application/json' },
        body: JSON.stringify(base),
      }).then(r => r.json())
      if (d.config) setCfg(d.config as Cfg)
      setMsg('✓ Guardado'); setTimeout(() => setMsg(null), 1500)
    } catch {
      setMsg('Error al guardar'); setTimeout(() => setMsg(null), 2000)
    }
  }, [cfg, sh])

  if (!cfg) return <div style={{ padding: 24, color: C.ink3, fontFamily: SN }}>Cargando configuración…</div>

  return (
    <div style={{ maxWidth: 640, padding: 4 }}>
      <h2 style={{ fontFamily: SE, fontSize: 24, color: C.ink, margin: '0 0 4px' }}>TPV Tienda</h2>
      <p style={{ fontFamily: SN, fontSize: 14, color: C.ink3, margin: '0 0 20px' }}>
        Configura el punto de venta de tienda (retail). Los dependientes acceden con el rol
        <strong> Tienda</strong> y verán la pantalla <code>/tienda</code>.
      </p>

      {/* Modo catálogo */}
      <Bloque titulo="Catálogo">
        <Opcion
          label="Mismo catálogo que el restaurante"
          desc="La tienda vende todos los productos activos del local."
          activo={cfg.modo_catalogo === 'mismo'}
          onClick={() => guardar({ modo_catalogo: 'mismo' })}
        />
        <Opcion
          label="Catálogo de tienda aparte"
          desc="Solo se venden los productos marcados como «de tienda» (campo es_tienda en la carta)."
          activo={cfg.modo_catalogo === 'separado'}
          onClick={() => guardar({ modo_catalogo: 'separado' })}
        />
      </Bloque>

      {/* Hardware */}
      <Bloque titulo="Hardware">
        <Toggle label="Lector de código de barras" desc="Escanea EAN para añadir al ticket."
          on={cfg.barcode_activo} onChange={v => guardar({ barcode_activo: v })} />
        {cfg.barcode_activo && (
          <div style={{ display: 'flex', gap: 8, margin: '4px 0 12px 4px' }}>
            {(['usb', 'camara', 'ambos'] as const).map(m => (
              <button key={m} onClick={() => guardar({ barcode_modo: m })}
                style={{
                  border: `1px solid ${cfg.barcode_modo === m ? C.green : C.rule}`,
                  background: cfg.barcode_modo === m ? C.greenS : C.bone,
                  color: C.ink, borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
                  fontFamily: SN, fontSize: 13, textTransform: 'capitalize',
                }}>{m === 'usb' ? 'USB' : m === 'camara' ? 'Cámara' : 'Ambos'}</button>
            ))}
          </div>
        )}
        <Toggle label="Báscula (venta por peso)" desc="Usa el módulo Peso para productos a granel."
          on={cfg.bascula_activa} onChange={v => guardar({ bascula_activa: v })} />
        <Toggle label="Solo táctil" desc="Sin periféricos: selección de productos en pantalla."
          on={cfg.solo_tactil} onChange={v => guardar({ solo_tactil: v })} />
      </Bloque>

      {/* Stock */}
      <Bloque titulo="Stock">
        <Toggle label="Descontar stock al vender" desc="Resta del stock del producto en cada venta de tienda."
          on={cfg.descontar_stock} onChange={v => guardar({ descontar_stock: v })} />
      </Bloque>

      {msg && <div style={{ marginTop: 12, fontFamily: SN, fontSize: 13, color: C.green }}>{msg}</div>}
    </div>
  )
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontFamily: SN, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: C.ink4, marginBottom: 10 }}>{titulo}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  )
}

function Opcion({ label, desc, activo, onClick }: { label: string; desc: string; activo: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      textAlign: 'left', border: `1px solid ${activo ? C.green : C.rule}`,
      background: activo ? C.greenS : C.bone, borderRadius: 10, padding: '12px 14px', cursor: 'pointer',
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <span style={{ fontFamily: SN, fontSize: 15, fontWeight: 600, color: C.ink }}>{activo ? '● ' : '○ '}{label}</span>
      <span style={{ fontFamily: SN, fontSize: 13, color: C.ink3 }}>{desc}</span>
    </button>
  )
}

function Toggle({ label, desc, on, onChange }: { label: string; desc: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 4px' }}>
      <button onClick={() => onChange(!on)} style={{
        width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', flexShrink: 0,
        background: on ? C.green : C.rule, position: 'relative', transition: 'background .15s',
      }}>
        <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: C.bone, transition: 'left .15s' }} />
      </button>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontFamily: SN, fontSize: 15, fontWeight: 600, color: C.ink }}>{label}</span>
        <span style={{ fontFamily: SN, fontSize: 13, color: C.ink3 }}>{desc}</span>
      </div>
    </div>
  )
}
