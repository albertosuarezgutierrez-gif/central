'use client'
// EtiquetasTab — Generador de etiquetas conforme Reglamento (UE) 1169/2011
// Línea 1 del módulo Etiquetado ia.rest (mayo 2026)

import React, { useState, useEffect, useRef } from 'react'
import { C, SE, SN, SM } from '@/lib/colors'

interface Producto {
  id: string
  nombre: string
  descripcion: string
  precio: number
  categoria: string
  alergenos: string[]
  familia?: string
  ean_codigo?: string | null
  stock_actual?: number | null
  unidad_stock?: string
}

interface EtiquetaConfig {
  nombre_operador: string
  nif_operador: string
  direccion_operador: string
  rgseaa_numero?: string
  pais_origen: string
  incluir_tabla_nutricional: boolean
}

interface NutriData {
  energia_kcal: string
  energia_kj: string
  grasas: string
  saturadas: string
  hidratos: string
  azucares: string
  proteinas: string
  sal: string
}

const NUTRI_EMPTY: NutriData = {
  energia_kcal: '', energia_kj: '', grasas: '', saturadas: '',
  hidratos: '', azucares: '', proteinas: '', sal: ''
}

// Iconos mínimos para los 14 alérgenos EU
const ALERG_ICONS: Record<string, string> = {
  'Gluten': '🌾', 'Crustáceos': '🦐', 'Huevo': '🥚', 'Pescado': '🐟',
  'Cacahuetes': '🥜', 'Soja': '🫘', 'Lácteos': '🥛', 'Frutos de cáscara': '🌰',
  'Apio': '🥬', 'Mostaza': '🌿', 'Sésamo': '⬜', 'Sulfitos': '🍷',
  'Altramuces': '🌼', 'Moluscos': '🦑',
}

function genLote(): string {
  const now = new Date()
  const yy  = String(now.getFullYear()).slice(2)
  const wk  = String(Math.ceil((now.getDate()) / 7)).padStart(2, '0')
  const hr  = String(now.getHours()).padStart(2, '0')
  return `L${yy}${wk}${hr}`
}

export default function EtiquetasTab({ sh }: { sh: () => Record<string, string> }) {
  const [productos, setProductos] = useState<Producto[]>([])
  const [config, setConfig]       = useState<EtiquetaConfig>({
    nombre_operador: '', nif_operador: '', direccion_operador: '',
    rgseaa_numero: '', pais_origen: 'España', incluir_tabla_nutricional: false,
  })
  const [loading, setLoading]     = useState(true)
  const [saving,  setSaving]      = useState(false)
  const [busqueda, setBusqueda]   = useState('')
  const [subTab,  setSubTab]      = useState<'productos' | 'config'>('productos')
  const [selected, setSelected]   = useState<Producto | null>(null)
  // Form de la etiqueta seleccionada
  const [loteVal,   setLoteVal]   = useState(genLote())
  const [fechaCad,  setFechaCad]  = useState('')
  const [cantNeta,  setCantNeta]  = useState('')
  const [condConserv, setCondConserv] = useState('Conservar en lugar fresco y seco')
  const [nutriData, setNutriData] = useState<NutriData>(NUTRI_EMPTY)
  const [eanEdit,   setEanEdit]   = useState('')
  const [savingEan, setSavingEan] = useState(false)
  const [configSaved, setConfigSaved] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    setLoading(true)
    const r = await fetch('/api/owner/etiquetas', { headers: sh() })
    const d = await r.json()
    setProductos(d.productos ?? [])
    if (d.config) setConfig(d.config)
    else if (d.restaurante) {
      setConfig(prev => ({
        ...prev,
        nombre_operador: d.restaurante.razon_social || d.restaurante.nombre || '',
        nif_operador:    d.restaurante.nif || '',
        direccion_operador: d.restaurante.direccion_fiscal || '',
      }))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openProducto = (p: Producto) => {
    setSelected(p)
    setLoteVal(genLote())
    setFechaCad('')
    setCantNeta('')
    setCondConserv('Conservar en lugar fresco y seco')
    setNutriData(NUTRI_EMPTY)
    setEanEdit(p.ean_codigo ?? '')
  }

  const saveConfig = async () => {
    setSaving(true)
    await fetch('/api/owner/etiquetas', {
      method: 'POST', headers: { ...sh(), 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    })
    setSaving(false)
    setConfigSaved(true)
    setTimeout(() => setConfigSaved(false), 2000)
  }

  const saveEan = async () => {
    if (!selected) return
    setSavingEan(true)
    await fetch('/api/owner/etiquetas', {
      method: 'PATCH', headers: { ...sh(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ producto_id: selected.id, ean_codigo: eanEdit })
    })
    setProductos(ps => ps.map(p => p.id === selected.id ? { ...p, ean_codigo: eanEdit } : p))
    setSelected(prev => prev ? { ...prev, ean_codigo: eanEdit } : null)
    setSavingEan(false)
  }

  const imprimir = () => {
    if (!printRef.current || !selected) return
    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) return
    const css = `
      body { font-family: 'Arial', sans-serif; margin: 0; padding: 20px; background: #fff; }
      .etiqueta { border: 2px solid #1A1714; padding: 14px 16px; max-width: 380px; margin: 0 auto; }
      .titulo { font-size: 16px; font-weight: 900; text-transform: uppercase; margin-bottom: 6px; letter-spacing: .02em; }
      .separador { border: none; border-top: 1px solid #1A1714; margin: 7px 0; }
      .campo { font-size: 10px; margin: 3px 0; line-height: 1.4; }
      .campo strong { font-weight: 800; }
      .alergenos { font-size: 10px; margin: 5px 0; }
      .alergenos strong { font-weight: 900; text-transform: uppercase; }
      .alerg-item { display: inline-block; font-weight: 700; text-decoration: underline; }
      .tabla-nutri { width: 100%; border-collapse: collapse; font-size: 9.5px; margin-top: 6px; }
      .tabla-nutri th { text-align: left; font-weight: 900; background: #1A1714; color: #fff; padding: 2px 5px; }
      .tabla-nutri td { padding: 2px 5px; border-bottom: 1px solid #e0e0e0; }
      .tabla-nutri tr:last-child td { border-bottom: none; }
      .lote-fecha { font-size: 9px; color: #333; margin-top: 6px; display: flex; justify-content: space-between; }
      .operador { font-size: 8.5px; color: #555; margin-top: 6px; }
      .ean { font-size: 8px; text-align: center; margin-top: 6px; letter-spacing: .1em; font-family: monospace; }
      @media print {
        body { padding: 0; }
        .btn-print { display: none !important; }
      }
    `
    const alergStr = selected.alergenos.length > 0
      ? selected.alergenos.map(a => `<span class="alerg-item">${a}</span>`).join(', ')
      : 'Ninguno declarado'
    const nutriTabla = config.incluir_tabla_nutricional ? `
      <table class="tabla-nutri">
        <tr><th colspan="2">Información nutricional — por 100g</th></tr>
        <tr><td>Valor energético</td><td>${nutriData.energia_kj || '—'} kJ / ${nutriData.energia_kcal || '—'} kcal</td></tr>
        <tr><td>Grasas</td><td>${nutriData.grasas || '—'} g</td></tr>
        <tr><td style="padding-left:12px">de las cuales saturadas</td><td>${nutriData.saturadas || '—'} g</td></tr>
        <tr><td>Hidratos de carbono</td><td>${nutriData.hidratos || '—'} g</td></tr>
        <tr><td style="padding-left:12px">de los cuales azúcares</td><td>${nutriData.azucares || '—'} g</td></tr>
        <tr><td>Proteínas</td><td>${nutriData.proteinas || '—'} g</td></tr>
        <tr><td>Sal</td><td>${nutriData.sal || '—'} g</td></tr>
      </table>` : ''
    const rgseaaStr = config.rgseaa_numero ? `<div class="campo">RGSEAA: <strong>${config.rgseaa_numero}</strong></div>` : ''
    const eanStr = selected.ean_codigo ? `<div class="ean">▊▊ ${selected.ean_codigo} ▊▊</div>` : ''

    win.document.write(`<!DOCTYPE html><html><head><title>Etiqueta — ${selected.nombre}</title>
      <style>${css}</style></head><body>
      <button class="btn-print" onclick="window.print()" style="margin-bottom:16px;padding:8px 18px;font-size:13px;cursor:pointer;background:#D9442B;color:#fff;border:none;border-radius:6px;">
        🖨 Imprimir etiqueta
      </button>
      <div class="etiqueta">
        <div class="titulo">${selected.nombre}</div>
        ${selected.descripcion ? `<div class="campo">${selected.descripcion}</div>` : ''}
        <hr class="separador">
        ${cantNeta ? `<div class="campo"><strong>Cantidad neta:</strong> ${cantNeta}</div>` : ''}
        ${config.pais_origen ? `<div class="campo"><strong>País de origen:</strong> ${config.pais_origen}</div>` : ''}
        <div class="campo"><strong>Temperatura de conservación:</strong> ${condConserv}</div>
        <hr class="separador">
        <div class="alergenos"><strong>Alérgenos:</strong> ${alergStr}</div>
        ${nutriTabla}
        <hr class="separador">
        <div class="lote-fecha">
          <span>Lote: <strong>${loteVal}</strong></span>
          ${fechaCad ? `<span>Consumir antes de: <strong>${fechaCad}</strong></span>` : ''}
        </div>
        ${rgseaaStr}
        <div class="operador">
          ${config.nombre_operador}${config.nif_operador ? ' — NIF ' + config.nif_operador : ''}<br>
          ${config.direccion_operador}
        </div>
        ${eanStr}
      </div>
    </body></html>`)
    win.document.close()
  }

  const filtrados = productos.filter(p =>
    !busqueda || p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.categoria?.toLowerCase().includes(busqueda.toLowerCase())
  )

  const sh2: React.CSSProperties = { fontFamily: SN, fontSize: 13, color: C.ink, background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '7px 11px', outline: 'none', width: '100%', boxSizing: 'border-box' }

  if (loading) return (
    <div style={{ padding: 32, textAlign: 'center', fontFamily: SE, fontStyle: 'italic', color: C.ink3 }}>
      Cargando datos…
    </div>
  )

  return (
    <div style={{ padding: '18px 20px', maxWidth: 860, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, color: C.ink, marginBottom: 3 }}>
          Generador de etiquetas
        </div>
        <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>
          Etiquetas conformes al Reglamento (UE) 1169/2011. Configura los datos del operador una vez y genera etiquetas imprimibles para cada elaboración propia.
        </div>
      </div>

      {/* SubTabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: `1px solid ${C.rule}`, paddingBottom: 0 }}>
        {(['productos', 'config'] as const).map(t => (
          <button key={t} onClick={() => setSubTab(t)} style={{
            fontFamily: SN, fontSize: 12, fontWeight: 600, padding: '7px 16px',
            background: 'none', border: 'none', cursor: 'pointer',
            color: subTab === t ? C.verm : C.ink3,
            borderBottom: subTab === t ? `2px solid ${C.verm}` : '2px solid transparent',
          }}>
            {t === 'productos' ? '📦 Productos' : '⚙️ Datos del operador'}
          </button>
        ))}
      </div>

      {/* ─── TAB: CONFIGURACIÓN ─── */}
      {subTab === 'config' && (
        <div style={{ maxWidth: 520 }}>
          <div style={{ background: '#FFF9E6', border: `1px solid ${C.amber}55`, borderRadius: 10, padding: '10px 14px', marginBottom: 18, fontFamily: SN, fontSize: 12, color: C.ink2 }}>
            <strong>¿Necesitas RGSEAA?</strong> Solo si distribuyes elaboraciones a terceros (otros locales, tiendas, e-commerce fuera de tu local). Para venta únicamente en tu restaurante no es obligatorio.
          </div>
          {[
            { key: 'nombre_operador', label: 'Nombre / Razón social del operador', placeholder: 'Grupo Ovejas Negras S.L.' },
            { key: 'nif_operador',    label: 'NIF / CIF', placeholder: 'B12345678' },
            { key: 'direccion_operador', label: 'Dirección completa', placeholder: 'C/ Sierpes 1, 41001 Sevilla' },
            { key: 'rgseaa_numero',   label: 'Nº RGSEAA (opcional)', placeholder: '21.00123/SE' },
            { key: 'pais_origen',     label: 'País de origen', placeholder: 'España' },
          ].map(({ key, label, placeholder }) => (
            <div key={key} style={{ marginBottom: 12 }}>
              <label style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4 }}>{label}</label>
              <input
                value={(config as unknown as Record<string, string>)[key] ?? ''}
                onChange={e => setConfig(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder={placeholder}
                style={sh2}
              />
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <input type="checkbox" id="nutri" checked={config.incluir_tabla_nutricional}
              onChange={e => setConfig(prev => ({ ...prev, incluir_tabla_nutricional: e.target.checked }))}
              style={{ accentColor: C.verm, width: 16, height: 16 }} />
            <label htmlFor="nutri" style={{ fontFamily: SN, fontSize: 13, color: C.ink, cursor: 'pointer' }}>
              Incluir tabla nutricional en las etiquetas
            </label>
          </div>
          <button onClick={saveConfig} disabled={saving} style={{
            fontFamily: SN, fontSize: 13, fontWeight: 700, padding: '10px 24px',
            background: saving ? C.rule : C.verm, color: '#fff',
            border: 'none', borderRadius: 8, cursor: saving ? 'default' : 'pointer',
          }}>
            {saving ? 'Guardando…' : configSaved ? '✅ Guardado' : 'Guardar configuración'}
          </button>
        </div>
      )}

      {/* ─── TAB: PRODUCTOS ─── */}
      {subTab === 'productos' && !selected && (
        <div>
          <input
            value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar producto o categoría…"
            style={{ ...sh2, marginBottom: 14, maxWidth: 360 }}
          />
          {filtrados.length === 0 && (
            <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3, padding: 24, textAlign: 'center' }}>
              No hay productos activos.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtrados.map(p => (
              <div key={p.id}
                onClick={() => openProducto(p)}
                style={{
                  padding: '11px 14px', border: `1px solid ${C.rule}`, borderRadius: 10,
                  background: C.bone, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                  transition: 'border-color .15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = C.verm + '88')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = C.rule)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.ink }}>{p.nombre}</div>
                  <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3 }}>
                    {p.categoria}
                    {p.ean_codigo && <span style={{ marginLeft: 8, color: C.ink4 }}>EAN: {p.ean_codigo}</span>}
                  </div>
                </div>
                {p.alergenos?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, maxWidth: 180 }}>
                    {p.alergenos.slice(0, 5).map(a => (
                      <span key={a} style={{
                        fontSize: 11, padding: '1px 6px', background: '#FFF3E0',
                        border: `1px solid ${C.amber}55`, borderRadius: 10, color: C.ink2,
                      }}>
                        {ALERG_ICONS[a] ?? ''} {a}
                      </span>
                    ))}
                    {p.alergenos.length > 5 && (
                      <span style={{ fontSize: 10, color: C.ink4 }}>+{p.alergenos.length - 5}</span>
                    )}
                  </div>
                )}
                <span style={{ fontFamily: SN, fontSize: 11, color: C.verm, fontWeight: 700, flexShrink: 0 }}>
                  Generar →
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── EDITOR DE ETIQUETA ─── */}
      {subTab === 'productos' && selected && (
        <div>
          <button onClick={() => setSelected(null)} style={{ fontFamily: SN, fontSize: 12, color: C.ink3, background: 'none', border: 'none', cursor: 'pointer', marginBottom: 14, padding: 0 }}>
            ← Volver a productos
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Columna izquierda — datos */}
            <div>
              <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 17, color: C.ink, marginBottom: 14 }}>
                {selected.nombre}
              </div>

              {/* Alérgenos */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>
                  Alérgenos declarados
                </div>
                {selected.alergenos.length === 0
                  ? <div style={{ fontFamily: SN, fontSize: 12, color: C.ink4, fontStyle: 'italic' }}>Ninguno declarado</div>
                  : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {selected.alergenos.map(a => (
                        <span key={a} style={{
                          fontSize: 12, padding: '3px 9px', background: '#FFF3E0',
                          border: `1px solid ${C.amber}77`, borderRadius: 20, color: C.ink2, fontWeight: 600,
                        }}>
                          {ALERG_ICONS[a] ?? ''} <strong>{a}</strong>
                        </span>
                      ))}
                    </div>
                  )
                }
                <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, marginTop: 5 }}>
                  Los alérgenos se gestionan desde Carta → Productos
                </div>
              </div>

              {/* Campos editables */}
              {[
                { label: 'Cantidad neta', value: cantNeta, onChange: setCantNeta, placeholder: 'Ej: 250 g, 500 ml, 6 ud' },
                { label: 'Condiciones de conservación', value: condConserv, onChange: setCondConserv, placeholder: 'Conservar en lugar fresco y seco' },
              ].map(({ label, value, onChange, placeholder }) => (
                <div key={label} style={{ marginBottom: 10 }}>
                  <label style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4 }}>{label}</label>
                  <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={sh2} />
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4 }}>Lote</label>
                  <input value={loteVal} onChange={e => setLoteVal(e.target.value)} style={sh2} />
                </div>
                <div>
                  <label style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4 }}>Consumir antes de</label>
                  <input type="date" value={fechaCad} onChange={e => setFechaCad(e.target.value)} style={sh2} />
                </div>
              </div>

              {/* EAN */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 4 }}>Código EAN (opcional)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={eanEdit} onChange={e => setEanEdit(e.target.value)} placeholder="8412345000019" style={{ ...sh2 }} />
                  <button onClick={saveEan} disabled={savingEan} style={{
                    fontFamily: SN, fontSize: 12, padding: '7px 12px', background: C.ink, color: '#fff',
                    border: 'none', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>
                    {savingEan ? '…' : 'Guardar'}
                  </button>
                </div>
              </div>

              {/* Tabla nutricional (si activada) */}
              {config.incluir_tabla_nutricional && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>
                    Tabla nutricional (por 100 g)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      { k: 'energia_kcal', label: 'Energía (kcal)' },
                      { k: 'energia_kj',   label: 'Energía (kJ)' },
                      { k: 'grasas',       label: 'Grasas (g)' },
                      { k: 'saturadas',    label: 'Saturadas (g)' },
                      { k: 'hidratos',     label: 'Hidratos (g)' },
                      { k: 'azucares',     label: 'Azúcares (g)' },
                      { k: 'proteinas',    label: 'Proteínas (g)' },
                      { k: 'sal',          label: 'Sal (g)' },
                    ].map(({ k, label }) => (
                      <div key={k}>
                        <label style={{ fontFamily: SM, fontSize: 9, color: C.ink4, display: 'block', marginBottom: 3 }}>{label}</label>
                        <input
                          type="number" min="0" step="0.1"
                          value={(nutriData as unknown as Record<string, string>)[k]}
                          onChange={e => setNutriData(prev => ({ ...prev, [k]: e.target.value }))}
                          style={{ ...sh2, padding: '5px 9px', fontSize: 12 }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!config.nombre_operador && (
                <div style={{ background: '#FEF3C7', border: `1px solid ${C.amber}55`, borderRadius: 8, padding: '8px 12px', fontFamily: SN, fontSize: 12, color: C.ink2, marginBottom: 14 }}>
                  ⚠️ Configura los datos del operador en la pestaña "Datos del operador" antes de imprimir.
                </div>
              )}

              <button onClick={imprimir} style={{
                width: '100%', padding: '12px', fontFamily: SN, fontSize: 14, fontWeight: 700,
                background: C.verm, color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer',
              }}>
                🖨 Vista previa e imprimir
              </button>
            </div>

            {/* Columna derecha — preview */}
            <div>
              <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>
                Preview etiqueta
              </div>
              <div style={{
                border: `2px solid ${C.ink}`, borderRadius: 4, padding: '14px 16px',
                background: '#fff', color: '#1A1714', fontFamily: 'Arial, sans-serif',
                maxWidth: 300,
              }}>
                <div style={{ fontSize: 14, fontWeight: 900, textTransform: 'uppercase', marginBottom: 5, letterSpacing: '.02em' }}>
                  {selected.nombre}
                </div>
                {selected.descripcion && (
                  <div style={{ fontSize: 9, color: '#555', marginBottom: 5 }}>{selected.descripcion}</div>
                )}
                <hr style={{ border: 'none', borderTop: '1px solid #1A1714', margin: '6px 0' }} />
                {cantNeta && <div style={{ fontSize: 9 }}><strong>Cantidad neta:</strong> {cantNeta}</div>}
                <div style={{ fontSize: 9 }}><strong>País de origen:</strong> {config.pais_origen || 'España'}</div>
                <div style={{ fontSize: 9 }}><strong>Conservación:</strong> {condConserv}</div>
                <hr style={{ border: 'none', borderTop: '1px solid #1A1714', margin: '6px 0' }} />
                <div style={{ fontSize: 9, marginBottom: 4 }}>
                  <strong style={{ textTransform: 'uppercase' }}>Alérgenos: </strong>
                  {selected.alergenos.length > 0
                    ? selected.alergenos.map(a => <span key={a} style={{ fontWeight: 800, textDecoration: 'underline', marginRight: 4 }}>{a}</span>)
                    : 'Ninguno declarado'
                  }
                </div>
                {config.incluir_tabla_nutricional && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 8, marginTop: 4 }}>
                    <thead>
                      <tr><th colSpan={2} style={{ background: '#1A1714', color: '#fff', padding: '2px 4px', textAlign: 'left' }}>Info. nutricional por 100g</th></tr>
                    </thead>
                    <tbody>
                      {[
                        ['Valor energético', `${nutriData.energia_kj||'—'} kJ / ${nutriData.energia_kcal||'—'} kcal`],
                        ['Grasas', `${nutriData.grasas||'—'} g`],
                        ['Hidratos', `${nutriData.hidratos||'—'} g`],
                        ['Proteínas', `${nutriData.proteinas||'—'} g`],
                        ['Sal', `${nutriData.sal||'—'} g`],
                      ].map(([k, v]) => (
                        <tr key={k}><td style={{ padding: '1px 4px', borderBottom: '1px solid #ddd' }}>{k}</td><td style={{ padding: '1px 4px', borderBottom: '1px solid #ddd' }}>{v}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <hr style={{ border: 'none', borderTop: '1px solid #1A1714', margin: '6px 0' }} />
                <div style={{ fontSize: 8, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Lote: <strong>{loteVal}</strong></span>
                  {fechaCad && <span>Cons. antes: <strong>{fechaCad}</strong></span>}
                </div>
                {config.rgseaa_numero && (
                  <div style={{ fontSize: 8 }}>RGSEAA: <strong>{config.rgseaa_numero}</strong></div>
                )}
                <div style={{ fontSize: 7.5, color: '#666', marginTop: 4 }}>
                  {config.nombre_operador}{config.nif_operador ? ' — NIF ' + config.nif_operador : ''}<br />
                  {config.direccion_operador}
                </div>
                {selected.ean_codigo && (
                  <div style={{ fontSize: 7.5, textAlign: 'center', marginTop: 4, letterSpacing: '.1em', fontFamily: 'monospace' }}>
                    ▊▊ {selected.ean_codigo} ▊▊
                  </div>
                )}
              </div>
              <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, marginTop: 8 }}>
                Preview aproximada · La versión impresa usa fuentes estándar del navegador
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Aviso legal al pie */}
      {subTab === 'productos' && !selected && (
        <div style={{ marginTop: 24, padding: '10px 14px', background: C.paper2, borderRadius: 8, fontFamily: SN, fontSize: 11, color: C.ink3 }}>
          ℹ️ Etiquetas conformes al <strong>Reglamento (UE) 1169/2011</strong>. Si distribuyes a terceros fuera de tu local, comprueba si necesitas inscripción en el RGSEAA (Real Decreto 191/2011). Sanciones por alérgeno no declarado: hasta 20.000 € (Ley 17/2011).
        </div>
      )}
    </div>
  )
}
