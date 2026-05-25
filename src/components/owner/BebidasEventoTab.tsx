'use client'
// BebidasEventoTab.tsx — Submódulo bebidas para menús de eventos
import { useState, useEffect, useCallback } from 'react'
import { C, SN, SE } from '@/lib/colors'
import type { BebidaEvento, BebidaBotella, TipoBebida } from '@/lib/bebidas-evento'

const TIPOS: { value: TipoBebida; label: string; desc: string }[] = [
  { value: 'barra_libre_horas',  label: '🍸 Barra libre por horas',     desc: 'Precio/persona con horas pactadas' },
  { value: 'por_botellas',       label: '🍾 Por botellas de marca',      desc: 'Lista de marcas y cantidades' },
  { value: 'por_copas',          label: '🥂 Por copas con tope',         desc: 'Nº de copas incluidas + precio extra' },
  { value: 'incluido_persona',   label: '✅ Incluido en precio/persona', desc: 'Sin desglose, precio fijo' },
  { value: 'descorche',          label: '🍷 Botellero del cliente',       desc: 'Cliente trae sus botellas, cobras descorche' },
]

interface Props {
  menuId: string
  restauranteId: string
  sh: () => Record<string, string>
  precioInfantil?: number
  menuNinoDescripcion?: string
  edadMaximaNino?: number
  onNinosChange: (data: {
    precio_infantil: number
    menu_nino_descripcion: string
    edad_maxima_nino: number
  }) => void
}

export default function BebidasEventoTab({
  menuId, sh, precioInfantil = 0,
  menuNinoDescripcion = '', edadMaximaNino = 12,
  onNinosChange,
}: Props) {
  const [bebidas, setBebidas] = useState<(BebidaEvento & { id: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<BebidaEvento>>({})
  const [ninoData, setNinoData] = useState({
    precio_infantil:       precioInfantil,
    menu_nino_descripcion: menuNinoDescripcion,
    edad_maxima_nino:      edadMaximaNino,
  })
  const [saving, setSaving] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/owner/eventos/menus/bebidas?menu_id=${menuId}`, { headers: sh() })
      const d = await r.json()
      setBebidas(d.bebidas ?? [])
    } finally {
      setLoading(false)
    }
  }, [menuId, sh])

  useEffect(() => { cargar() }, [cargar])

  function abrirNuevo() {
    setForm({
      tipo:               'barra_libre_horas',
      nombre:             '',
      exceso_contrato:    'pactado',
      devolucion_botellas:'pactado',
      aplica_a:           'adultos',
      botellas:           [],
    })
    setEditando('nuevo')
  }

  function abrirEditar(b: BebidaEvento & { id: string }) {
    setForm({ ...b })
    setEditando(b.id)
  }

  async function guardar() {
    if (!form.nombre?.trim()) return
    setSaving(true)
    try {
      await fetch('/api/owner/eventos/menus/bebidas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sh() },
        body: JSON.stringify({ ...form, menu_id: menuId }),
      })
      setEditando(null)
      setForm({})
      await cargar()
    } finally {
      setSaving(false)
    }
  }

  async function eliminar(bebidaId: string) {
    if (!confirm('¿Eliminar este bloque de bebidas?')) return
    await fetch(`/api/owner/eventos/menus/bebidas?bebida_id=${bebidaId}`, {
      method: 'DELETE', headers: sh(),
    })
    await cargar()
  }

  function addBotella() {
    setForm(f => ({
      ...f,
      botellas: [...(f.botellas ?? []),
        { nombre: '', marca: '', cantidad: 1, precio_unitario: 0, es_del_cliente: false }],
    }))
  }

  function updateBotella(i: number, campo: keyof BebidaBotella, valor: string | number | boolean) {
    setForm(f => {
      const bs = [...(f.botellas ?? [])]
      bs[i] = { ...bs[i], [campo]: valor }
      return { ...f, botellas: bs }
    })
  }

  function removeBotella(i: number) {
    setForm(f => ({ ...f, botellas: f.botellas?.filter((_, j) => j !== i) }))
  }

  const necesitaBotellas = form.tipo === 'por_botellas' || form.tipo === 'descorche'

  const inp = {
    background: C.paper, border: `1px solid ${C.rule}`, borderRadius: '6px',
    padding: '7px 9px', color: C.ink, fontFamily: SN, fontSize: '13px',
    width: '100%', boxSizing: 'border-box' as const,
  }
  const label = {
    color: C.ink3, fontFamily: SN, fontSize: '11px',
    textTransform: 'uppercase' as const, letterSpacing: '.07em',
    marginBottom: '4px', display: 'block',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* ── MENÚ NIÑOS ─────────────────────────────────────── */}
      <section style={{ background: C.bone, borderRadius: '10px', padding: '16px', border: `1px solid ${C.rule}` }}>
        <h3 style={{ color: C.ink, fontFamily: SE, fontSize: '15px', fontWeight: 700, margin: '0 0 12px', fontStyle: 'italic' }}>
          🧒 Menú infantil
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
          <div>
            <label style={label}>Precio menú niño (€)</label>
            <input type="number" step="0.5" style={inp}
              value={ninoData.precio_infantil || ''}
              onChange={e => {
                const v = { ...ninoData, precio_infantil: parseFloat(e.target.value) || 0 }
                setNinoData(v); onNinosChange(v)
              }} />
          </div>
          <div>
            <label style={label}>Edad máxima (años)</label>
            <input type="number" style={inp}
              value={ninoData.edad_maxima_nino}
              onChange={e => {
                const v = { ...ninoData, edad_maxima_nino: parseInt(e.target.value) || 12 }
                setNinoData(v); onNinosChange(v)
              }} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={label}>Descripción menú infantil</label>
            <input type="text" style={inp} placeholder="ej: Macarrones + nuggets + postre + refresco"
              value={ninoData.menu_nino_descripcion}
              onChange={e => {
                const v = { ...ninoData, menu_nino_descripcion: e.target.value }
                setNinoData(v); onNinosChange(v)
              }} />
          </div>
        </div>
      </section>

      {/* ── BLOQUES DE BEBIDAS ─────────────────────────────── */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ color: C.ink, fontFamily: SE, fontSize: '15px', fontWeight: 700, margin: 0, fontStyle: 'italic' }}>
            🍾 Bebidas del evento
          </h3>
          {editando === null && (
            <button onClick={abrirNuevo} style={{
              padding: '6px 14px', borderRadius: '6px', border: 'none',
              background: C.red, color: '#fff', fontFamily: SN, fontSize: '13px',
              fontWeight: 600, cursor: 'pointer',
            }}>+ Añadir bloque</button>
          )}
        </div>

        {loading && (
          <p style={{ color: C.ink3, fontFamily: SN, fontSize: '13px' }}>Cargando...</p>
        )}

        {!loading && bebidas.length === 0 && editando !== 'nuevo' && (
          <div style={{ background: C.bone, borderRadius: '10px', padding: '24px', textAlign: 'center', border: `1px solid ${C.rule}` }}>
            <p style={{ color: C.ink3, fontFamily: SN, fontSize: '14px', margin: 0 }}>
              Sin bloques de bebidas. El presupuesto solo incluirá comida y servicio.
            </p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {bebidas.map(b => (
            editando === b.id ? (
              <FormBebida key={b.id}
                form={form} setForm={setForm} onGuardar={guardar}
                onCancelar={() => { setEditando(null); setForm({}) }}
                saving={saving} necesitaBotellas={necesitaBotellas}
                addBotella={addBotella} updateBotella={updateBotella} removeBotella={removeBotella}
              />
            ) : (
              <div key={b.id} style={{
                background: C.paper, borderRadius: '10px', padding: '12px 16px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                border: `1px solid ${C.rule}`,
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <span style={{ color: C.ink, fontFamily: SN, fontSize: '14px', fontWeight: 600 }}>
                      {b.nombre}
                    </span>
                    <span style={{
                      background: C.ink + '11', color: C.ink3, fontFamily: SN, fontSize: '11px',
                      padding: '2px 8px', borderRadius: '99px',
                    }}>
                      {TIPOS.find(t => t.value === b.tipo)?.label}
                    </span>
                  </div>
                  <span style={{ color: C.ink3, fontFamily: SN, fontSize: '11px' }}>
                    Exceso: {b.exceso_contrato} · Devolución: {b.devolucion_botellas} · Para: {b.aplica_a}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => abrirEditar(b)} style={{
                    padding: '5px 10px', borderRadius: '5px', border: `1px solid ${C.rule}`,
                    background: 'transparent', fontFamily: SN, fontSize: '12px', color: C.ink3, cursor: 'pointer',
                  }}>Editar</button>
                  <button onClick={() => eliminar(b.id)} style={{
                    padding: '5px 10px', borderRadius: '5px', border: `1px solid ${C.rule}`,
                    background: 'transparent', fontFamily: SN, fontSize: '12px', color: C.red, cursor: 'pointer',
                  }}>Quitar</button>
                </div>
              </div>
            )
          ))}

          {editando === 'nuevo' && (
            <FormBebida
              form={form} setForm={setForm} onGuardar={guardar}
              onCancelar={() => { setEditando(null); setForm({}) }}
              saving={saving} necesitaBotellas={necesitaBotellas}
              addBotella={addBotella} updateBotella={updateBotella} removeBotella={removeBotella}
            />
          )}
        </div>
      </section>
    </div>
  )
}

// ── Formulario de bloque ───────────────────────────────────────────────────────
function FormBebida({ form, setForm, onGuardar, onCancelar, saving, necesitaBotellas,
  addBotella, updateBotella, removeBotella }: {
  form: Partial<BebidaEvento>
  setForm: React.Dispatch<React.SetStateAction<Partial<BebidaEvento>>>
  onGuardar: () => void
  onCancelar: () => void
  saving: boolean
  necesitaBotellas: boolean
  addBotella: () => void
  updateBotella: (i: number, campo: keyof BebidaBotella, valor: string | number | boolean) => void
  removeBotella: (i: number) => void
}) {
  const set = (campo: string, valor: unknown) => setForm(f => ({ ...f, [campo]: valor }))
  const inp = {
    background: '#fff', border: `1px solid ${C.rule}`, borderRadius: '6px',
    padding: '7px 9px', color: C.ink, fontFamily: SN, fontSize: '13px',
    width: '100%', boxSizing: 'border-box' as const,
  }
  const label = {
    color: C.ink3, fontFamily: SN, fontSize: '11px',
    textTransform: 'uppercase' as const, letterSpacing: '.07em',
    marginBottom: '4px', display: 'block',
  }

  return (
    <div style={{
      background: C.bone, border: `1px solid ${C.rule}`, borderRadius: '10px', padding: '18px',
    }}>
      {/* Selector de tipo */}
      <div style={{ marginBottom: '14px' }}>
        <label style={label}>Tipo de bebida</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {TIPOS.map(t => (
            <button key={t.value} onClick={() => set('tipo', t.value)} style={{
              padding: '6px 12px', borderRadius: '20px', border: 'none', cursor: 'pointer',
              fontFamily: SN, fontSize: '12px',
              background: form.tipo === t.value ? C.ink : '#fff',
              color: form.tipo === t.value ? C.paper : C.ink3,
              border: `1px solid ${C.rule}`,
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '12px' }}>
        {/* Nombre */}
        <div>
          <label style={label}>Nombre del bloque *</label>
          <input type="text" style={inp} placeholder="ej: Barra libre recepción"
            value={form.nombre ?? ''} onChange={e => set('nombre', e.target.value)} />
        </div>

        {/* Campos por tipo */}
        {(form.tipo === 'incluido_persona' || form.tipo === 'barra_libre_horas') && (
          <div>
            <label style={label}>€ por persona</label>
            <input type="number" step="0.5" style={inp}
              value={form.precio_por_persona ?? ''} onChange={e => set('precio_por_persona', parseFloat(e.target.value) || 0)} />
          </div>
        )}

        {form.tipo === 'barra_libre_horas' && (<>
          <div>
            <label style={label}>Horas incluidas</label>
            <input type="number" style={inp}
              value={form.horas_incluidas ?? ''} onChange={e => set('horas_incluidas', parseInt(e.target.value) || 0)} />
          </div>
          <div>
            <label style={label}>€ hora extra / pers.</label>
            <input type="number" step="0.5" style={inp}
              value={form.precio_hora_extra ?? ''} onChange={e => set('precio_hora_extra', parseFloat(e.target.value) || 0)} />
          </div>
        </>)}

        {form.tipo === 'por_copas' && (<>
          <div>
            <label style={label}>Copas incluidas</label>
            <input type="number" style={inp}
              value={form.copas_incluidas ?? ''} onChange={e => set('copas_incluidas', parseInt(e.target.value) || 0)} />
          </div>
          <div>
            <label style={label}>€ copa extra</label>
            <input type="number" step="0.1" style={inp}
              value={form.precio_copa_extra ?? ''} onChange={e => set('precio_copa_extra', parseFloat(e.target.value) || 0)} />
          </div>
        </>)}

        {form.tipo === 'descorche' && (
          <div>
            <label style={label}>€ descorche por botella</label>
            <input type="number" step="0.5" style={inp}
              value={form.precio_descorche ?? ''} onChange={e => set('precio_descorche', parseFloat(e.target.value) || 0)} />
          </div>
        )}

        {/* Aplica a */}
        <div>
          <label style={label}>Aplica a</label>
          <select style={{ ...inp, cursor: 'pointer' }}
            value={form.aplica_a ?? 'adultos'} onChange={e => set('aplica_a', e.target.value)}>
            <option value="adultos">Solo adultos</option>
            <option value="todos">Adultos y niños</option>
          </select>
        </div>

        {/* Exceso */}
        <div>
          <label style={label}>Si se pasa del tope</label>
          <select style={{ ...inp, cursor: 'pointer' }}
            value={form.exceso_contrato ?? 'pactado'} onChange={e => set('exceso_contrato', e.target.value)}>
            <option value="pactado">A pactar (figura en contrato)</option>
            <option value="facturar_auto">Facturar automáticamente</option>
            <option value="parar_servicio">Parar el servicio</option>
          </select>
        </div>

        {necesitaBotellas && (
          <div>
            <label style={label}>Botellas no abiertas</label>
            <select style={{ ...inp, cursor: 'pointer' }}
              value={form.devolucion_botellas ?? 'pactado'} onChange={e => set('devolucion_botellas', e.target.value)}>
              <option value="pactado">A pactar (figura en contrato)</option>
              <option value="si">Se devuelven al cliente</option>
              <option value="no">Precio cerrado, no se devuelven</option>
            </select>
          </div>
        )}

        {/* Notas */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={label}>Notas para el contrato</label>
          <input type="text" style={inp} placeholder="ej: Incluye agua, refrescos y vinos de la carta"
            value={form.notas ?? ''} onChange={e => set('notas', e.target.value)} />
        </div>
      </div>

      {/* Tabla de botellas */}
      {necesitaBotellas && (
        <div style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={{ ...label, margin: 0 }}>
              {form.tipo === 'descorche' ? 'Botellas del cliente' : 'Botellas pactadas'}
            </label>
            <button onClick={addBotella} style={{
              padding: '4px 10px', borderRadius: '5px', border: `1px solid ${C.rule}`,
              background: 'transparent', fontFamily: SN, fontSize: '12px', color: C.ink3, cursor: 'pointer',
            }}>+ Añadir</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {(form.botellas ?? []).length === 0 && (
              <p style={{ color: C.ink3, fontFamily: SN, fontSize: '12px', margin: '4px 0' }}>
                Sin botellas añadidas
              </p>
            )}
            {(form.botellas ?? []).map((bt, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 70px 90px 28px', gap: '6px', alignItems: 'center' }}>
                <input type="text" style={inp} placeholder="Nombre (ej: Rioja Reserva)"
                  value={bt.nombre} onChange={e => updateBotella(i, 'nombre', e.target.value)} />
                <input type="text" style={inp} placeholder="Marca"
                  value={bt.marca ?? ''} onChange={e => updateBotella(i, 'marca', e.target.value)} />
                <input type="number" style={inp} placeholder="Uds"
                  value={bt.cantidad} onChange={e => updateBotella(i, 'cantidad', parseInt(e.target.value) || 1)} />
                <input type="number" step="0.5" style={inp} placeholder="€/bot"
                  value={bt.precio_unitario} onChange={e => updateBotella(i, 'precio_unitario', parseFloat(e.target.value) || 0)} />
                <button onClick={() => removeBotella(i)} style={{
                  background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: '14px', padding: 0,
                }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button onClick={onCancelar} style={{
          padding: '7px 16px', borderRadius: '6px', border: `1px solid ${C.rule}`,
          background: 'transparent', fontFamily: SN, fontSize: '13px', color: C.ink3, cursor: 'pointer',
        }}>Cancelar</button>
        <button onClick={onGuardar} disabled={saving || !form.nombre?.trim()} style={{
          padding: '7px 18px', borderRadius: '6px', border: 'none',
          background: C.red, color: '#fff', fontFamily: SN, fontSize: '13px',
          fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
          opacity: saving || !form.nombre?.trim() ? 0.6 : 1,
        }}>
          {saving ? 'Guardando...' : 'Guardar bloque'}
        </button>
      </div>
    </div>
  )
}
