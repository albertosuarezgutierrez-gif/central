'use client'
import { useState } from 'react'

interface Props {
  form: any
  onChange: (k: string, v: any) => void
}

const EXTRAS = [
  { key: 'tiene_piscina',         label: 'Piscina',         icon: '🏊' },
  { key: 'tiene_terraza',         label: 'Terraza',         icon: '🌿' },
  { key: 'tiene_barbacoa',        label: 'Barbacoa',        icon: '🍖' },
  { key: 'tiene_jacuzzi',         label: 'Jacuzzi',         icon: '🛁' },
  { key: 'tiene_lavadora',        label: 'Lavadora',        icon: '👕' },
  { key: 'tiene_secadora',        label: 'Secadora',        icon: '♨️' },
  { key: 'tiene_cocina_completa', label: 'Cocina completa', icon: '🍳' },
  { key: 'tiene_lavavajillas',    label: 'Lavavajillas',    icon: '🍽️' },
  { key: 'tiene_parking',         label: 'Parking',         icon: '🚗' },
  { key: 'kit_bienvenida',        label: 'Kit bienvenida',  icon: '🎁' },
]

export default function CaracteristicasApartamento({ form, onChange }: Props) {
  const f = (k: string, v: any) => onChange(k, v)
  const [editandoMaterial, setEditandoMaterial] = useState(false)

  // Cálculo de material estimado en tiempo real
  const huesps = Number(form.num_huespedes_max || 2)
  const dobles = Number(form.num_camas_dobles || 0)
  const indiv  = Number(form.num_camas_individuales || 0) + Number(form.num_camas_literas || 0) * 2
  const sofas  = Number(form.num_camas_sofas || 0)
  const banos  = Number(form.num_banos || 1)

  const materialAuto: Record<string, number> = {
    '🛏️ Sábanas dobles':        dobles,
    '🛏️ Sábanas individuales':  indiv,
    '🛋️ Fundas sofá':           sofas,
    '🛁 Toallas baño':          huesps,
    '🤝 Toallas mano':          huesps,
    '🦶 Toallas pie ducha':     huesps,
    ...(form.tiene_piscina ? { '🏊 Toallas piscina': huesps } : {}),
    '🧴 Gel/champú (x baño)':  banos,
    '🧻 Papel higiénico':       banos * 2,
    '🧼 Jabón manos':           banos + Number(form.num_aseos || 0),
    ...(form.tiene_cocina_completa ? {
      '🧽 Esponja + bayeta': 1,
      '🗑️ Bolsas basura':    3,
      ...(form.tiene_lavavajillas ? { '🍽️ Pastillas lavavajillas': 2 } : {}),
    } : {}),
    ...(form.kit_bienvenida ? { '🎁 Kit bienvenida': 1 } : {}),
  }

  // Material editable: usa override si existe, si no el automático
  const materialOverride: Record<string, number> = form.material_override || {}
  const materialFinal = Object.fromEntries(
    Object.entries(materialAuto).map(([k, v]) => [k, materialOverride[k] ?? v])
  )

  function resetMaterial() {
    f('material_override', {})
    setEditandoMaterial(false)
  }

  return (
    <div className="bg-amber-50 rounded-2xl p-4 space-y-4">
      <div className="text-sm font-semibold text-amber-700">🏠 Características del apartamento</div>

      {/* Camas */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-2">Camas</label>
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: 'num_camas_dobles',       label: '🛏️ Dobles'      },
            { key: 'num_camas_individuales', label: '🛏️ Individuales' },
            { key: 'num_camas_sofas',        label: '🛋️ Sofá-cama'   },
            { key: 'num_camas_literas',      label: '🪜 Literas'      },
          ].map(c => (
            <div key={c.key}>
              <label className="block text-xs text-gray-500 mb-1">{c.label}</label>
              <input type="number" min="0" max="20"
                value={(form as any)[c.key] || 0}
                onChange={e => f(c.key, Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
          ))}
        </div>
      </div>

      {/* Baños + huéspedes */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { key: 'num_banos',          label: '🚿 Baños'     },
          { key: 'num_aseos',          label: '🚽 Aseos'     },
          { key: 'num_huespedes_max',  label: '👥 Huésp. max'},
        ].map(c => (
          <div key={c.key}>
            <label className="block text-xs text-gray-500 mb-1">{c.label}</label>
            <input type="number" min="0" max="20"
              value={(form as any)[c.key] || 0}
              onChange={e => f(c.key, Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
        ))}
      </div>

      {/* Extras */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-2">Instalaciones y extras</label>
        <div className="grid grid-cols-2 gap-2">
          {EXTRAS.map(e => (
            <label key={e.key} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-amber-100 transition">
              <input type="checkbox"
                checked={Boolean((form as any)[e.key])}
                onChange={ev => f(e.key, ev.target.checked)}
                className="w-4 h-4 text-amber-500 rounded" />
              <span className="text-sm">{e.icon} {e.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Gestión lencería — ahora con 4 opciones */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-2">Gestión de lencería</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: 'propietario', label: 'Propietario', icon: '👤', desc: 'Tiene la suya' },
            { id: 'empresa',     label: 'Empresa',     icon: '🏢', desc: 'Nosotros la llevamos' },
            { id: 'lavanderia',  label: 'Lavandería',  icon: '🧺', desc: 'Proveedor externo' },
            { id: 'mixto',       label: 'Mixto',       icon: '🔀', desc: 'Compartida' },
          ].map(opt => (
            <button key={opt.id} type="button"
              onClick={() => f('gestion_lenceria', opt.id)}
              className="p-2 rounded-xl border-2 text-center transition"
              style={{
                borderColor: form.gestion_lenceria === opt.id ? '#f59e0b' : '#e5e7eb',
                background:  form.gestion_lenceria === opt.id ? '#fef3c7' : 'white'
              }}>
              <div className="text-base">{opt.icon}</div>
              <div className="text-xs font-semibold" style={{ color: form.gestion_lenceria === opt.id ? '#92400e' : '#374151' }}>{opt.label}</div>
              <div className="text-xs text-gray-400 leading-tight">{opt.desc}</div>
            </button>
          ))}
        </div>
        {/* Si lavandería: campo para nombre del proveedor */}
        {form.gestion_lenceria === 'lavanderia' && (
          <input
            value={form.lavanderia_proveedor || ''}
            onChange={e => f('lavanderia_proveedor', e.target.value)}
            placeholder="Nombre de la lavandería…"
            className="mt-2 w-full border border-amber-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
          />
        )}
      </div>

      {/* Notas material */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">
          Notas de material
          <span className="font-normal text-gray-400 ml-1">— jabones especiales, marca papel, etc.</span>
        </label>
        <textarea value={form.notas_material || ''}
          onChange={e => f('notas_material', e.target.value)}
          placeholder="Ej: Jabón La Toja, papel higiénico triple capa, toallas blancas 600g…"
          rows={2}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
      </div>

      {/* Material estimado — editable */}
      {(dobles + indiv + sofas + banos) > 0 && (
        <div className="bg-white rounded-xl p-3 border border-amber-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-amber-700">📦 Material estimado por limpieza</p>
            <div className="flex gap-2">
              {editandoMaterial && (
                <button type="button" onClick={resetMaterial}
                  className="text-xs text-gray-400 underline">
                  Restablecer
                </button>
              )}
              <button type="button"
                onClick={() => setEditandoMaterial(v => !v)}
                className="text-xs font-semibold px-2 py-0.5 rounded-lg transition"
                style={{ background: editandoMaterial ? '#fef3c7' : '#f1f5f9', color: editandoMaterial ? '#92400e' : '#64748b' }}>
                {editandoMaterial ? '✓ Listo' : '✏️ Editar'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1">
            {Object.entries(materialFinal).filter(([, v]) => Number(v) > 0 || editandoMaterial).map(([k, v]) => (
              <div key={k} className="flex justify-between items-center text-xs gap-1">
                <span className="text-gray-600 truncate">{k}</span>
                {editandoMaterial ? (
                  <input
                    type="number" min="0" max="99"
                    value={materialOverride[k] ?? v}
                    onChange={e => f('material_override', { ...materialOverride, [k]: Number(e.target.value) })}
                    className="w-12 border border-amber-300 rounded px-1 py-0.5 text-center text-xs font-bold text-amber-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                ) : (
                  <span className="font-bold text-amber-700 flex-shrink-0">{String(v)}</span>
                )}
              </div>
            ))}
          </div>

          {Object.keys(materialOverride).length > 0 && !editandoMaterial && (
            <p className="text-xs text-amber-600 mt-2">✏️ Cantidades personalizadas</p>
          )}
        </div>
      )}
    </div>
  )
}
