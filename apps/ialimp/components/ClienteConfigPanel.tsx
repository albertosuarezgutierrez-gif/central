
'use client'
import { useState } from 'react'

const C = {
  primary: 'var(--brand-primary)', brand: 'var(--brand-secondary)', light: 'var(--brand-light)',
  text: '#1e293b', muted: '#64748b', border: '#e2e8f0', bg: '#f8fafc',
}

interface Config {
  default_visible_limpiadora: boolean
  limpiadora_puede_responder: boolean
  ver_checklist:              boolean
  ver_fotos:                  boolean
}

interface Props {
  clienteId:     string
  clienteNombre: string
  configInicial: Config
}

const OPCIONES = [
  {
    key: 'ver_checklist',
    icon: '✅',
    label: 'Ver checklist',
    desc: 'El propietario puede ver las tareas completadas por la limpiadora',
  },
  {
    key: 'ver_fotos',
    icon: '📸',
    label: 'Ver fotos de limpieza',
    desc: 'El propietario puede ver las fotos tomadas durante la limpieza',
  },
  {
    key: 'default_visible_limpiadora',
    icon: '👁',
    label: 'Chat visible a limpiadora',
    desc: 'Los mensajes del propietario se muestran a la limpiadora por defecto',
  },
  {
    key: 'limpiadora_puede_responder',
    icon: '💬',
    label: 'Limpiadora puede responder',
    desc: 'La limpiadora puede enviar mensajes al propietario',
  },
]

export default function ClienteConfigPanel({ clienteId, clienteNombre, configInicial }: Props) {
  const [config,  setConfig]  = useState<Config>(configInicial)
  const [saving,  setSaving]  = useState<string|null>(null)
  const [saved,   setSaved]   = useState<string|null>(null)

  async function toggle(key: keyof Config) {
    const nuevoVal = !config[key]
    setSaving(key)
    const r = await fetch(`/api/admin/clientes/${clienteId}/config`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: nuevoVal })
    })
    if (r.ok) {
      setConfig(prev => ({ ...prev, [key]: nuevoVal }))
      setSaved(key)
      setTimeout(() => setSaved(null), 2000)
    }
    setSaving(null)
  }

  return (
    <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', background: C.light, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: C.primary }}>⚙️ Permisos del propietario</div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{clienteNombre}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {OPCIONES.map((op, i) => {
          const val = config[op.key as keyof Config]
          const isSaving = saving === op.key
          const isSaved  = saved  === op.key
          return (
            <div key={op.key}
              style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12,
                borderBottom: i < OPCIONES.length-1 ? `1px solid ${C.border}` : 'none' }}>
              <span style={{ fontSize: 20, width: 28, textAlign: 'center', flexShrink: 0 }}>{op.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{op.label}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 1, lineHeight: 1.4 }}>{op.desc}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {isSaved && <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>✓</span>}
                <button onClick={() => toggle(op.key as keyof Config)} disabled={isSaving}
                  style={{
                    width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                    background: val ? C.primary : '#cbd5e1',
                    position: 'relative', transition: 'background 0.2s', opacity: isSaving ? 0.6 : 1
                  }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%', background: 'white',
                    position: 'absolute', top: 3,
                    left: val ? 23 : 3, transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                  }} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
