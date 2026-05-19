'use client'
import React, { useState, useRef, useCallback } from 'react'
import { C, SE, SN, SM, SC } from '@/lib/colors'

// ── Tipos ────────────────────────────────────────────────────────────────────

interface VinoBottella {
  nombre: string | null
  bodega: string | null
  tipo: string | null
  denominacion_origen: string | null
  varietal: string | null
  anada: string | null
  graduacion: string | null
  volumen: string | null
  confianza: number
}

interface VinoAlbaran {
  nombre: string | null
  bodega: string | null
  tipo: string
  anada: string | null
  formato: string | null
  cantidad: number
  precio_unitario: number | null
  producto_id: string | null
  producto_nombre_actual: string | null
  en_carta: boolean
  seleccionado: boolean
  precio_venta: string // editable
}

interface AlbaranResult {
  proveedor: string | null
  fecha: string | null
  referencia: string | null
  total_eur: number | null
  vinos: VinoAlbaran[]
}

type Modo = 'botella' | 'albaran'
type Fase = 'selector' | 'captura' | 'procesando' | 'botella_ficha' | 'albaran_lista' | 'guardando' | 'ok'

interface Props {
  onClose: () => void
  sh: () => Record<string, string>
  onGuardado?: () => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const TIPO_LABEL: Record<string, string> = {
  tinto: '🔴 Tinto', blanco: '⚪ Blanco', rosado: '🌸 Rosado',
  espumoso: '🥂 Espumoso', cava: '🥂 Cava', champagne: '🥂 Champagne',
  generoso: '🟡 Generoso', vermut: '🍸 Vermut', otro: '🍾 Vino',
}
const TIPO_FAMILIA: Record<string, string> = {
  tinto: 'vino_tinto', blanco: 'vino_blanco', rosado: 'vino_rosado',
  espumoso: 'cava', cava: 'cava', champagne: 'champagne',
  generoso: 'jerez', vermut: 'vermut', otro: 'vino',
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.1em',
        color: C.ink3, textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>
        {label}
      </label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px',
          background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 8,
          fontFamily: SN, fontSize: 14, color: C.ink, outline: 'none' }}
      />
    </div>
  )
}

function ConfianzaBadge({ v }: { v: number }) {
  const pct = Math.round(v * 100)
  const color = v >= 0.75 ? C.gr : v >= 0.5 ? C.amb : C.verm
  const label = v >= 0.75 ? 'Alta' : v >= 0.5 ? 'Media' : 'Baja'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <div style={{ flex: 1, height: 4, background: C.rule, borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width .5s' }} />
      </div>
      <span style={{ fontFamily: SM, fontSize: 10, color, minWidth: 60 }}>
        {pct}% · {label}
      </span>
    </div>
  )
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function WineScannerModal({ onClose, sh, onGuardado }: Props) {
  const [modo, setModo] = useState<Modo>('botella')
  const [fase, setFase] = useState<Fase>('selector')
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Estado botella
  const [botella, setBotella] = useState<VinoBottella | null>(null)
  const [botellaForm, setBotellaForm] = useState({
    nombre: '', bodega: '', tipo: '', denominacion_origen: '',
    varietal: '', anada: '', precio: '',
  })
  const [enriching, setEnriching] = useState(false)

  // Estado albarán
  const [albaranResult, setAlbaranResult] = useState<AlbaranResult | null>(null)

  // ── Procesar imagen ────────────────────────────────────────────────────────

  const procesarImagen = useCallback(async (file: File) => {
    if (file.size > 4_000_000) { setError('Imagen demasiado grande (máx 4MB).'); return }
    setError(null); setFase('procesando')

    const reader = new FileReader()
    reader.onload = e => setPreview(e.target?.result as string)
    reader.readAsDataURL(file)

    const b64 = await new Promise<string>((res, rej) => {
      const r = new FileReader()
      r.onload = ev => res((ev.target?.result as string).split(',')[1])
      r.onerror = () => rej(new Error('Error leyendo imagen'))
      r.readAsDataURL(file)
    })

    try {
      const resp = await fetch('/api/vinos/reconocer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sh() },
        body: JSON.stringify({ imagen: b64, mediaType: file.type || 'image/jpeg', modo }),
      })
      const data = await resp.json()
      if (!resp.ok) { setError(data.error ?? 'Error al analizar'); setFase('captura'); return }

      if (modo === 'botella') {
        setBotella(data)
        setBotellaForm({
          nombre:             data.nombre ?? '',
          bodega:             data.bodega ?? '',
          tipo:               data.tipo ?? '',
          denominacion_origen: data.denominacion_origen ?? '',
          varietal:           data.varietal ?? '',
          anada:              data.anada ?? '',
          precio:             '',
        })
        setFase('botella_ficha')
      } else {
        const vinos = (data.vinos ?? []).map((v: Omit<VinoAlbaran, 'seleccionado' | 'precio_venta'>) => ({
          ...v,
          seleccionado: true,
          precio_venta: '',
        }))
        setAlbaranResult({ ...data, vinos })
        setFase('albaran_lista')
      }
    } catch {
      setError('Error de red. Inténtalo de nuevo.')
      setFase('captura')
    }
  }, [modo, sh])

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) procesarImagen(file)
  }, [procesarImagen])

  // ── Guardar botella ────────────────────────────────────────────────────────

  const guardarBotella = useCallback(async () => {
    if (!botellaForm.nombre.trim()) { setError('El nombre es obligatorio'); return }
    setFase('guardando')

    const familia = TIPO_FAMILIA[botellaForm.tipo] ?? 'vino'
    const metadata: Record<string, string | undefined> = {
      tipo:                'vino',
      bodega:              botellaForm.bodega.trim() || undefined,
      varietal:            botellaForm.varietal.trim() || undefined,
      do:                  botellaForm.denominacion_origen.trim() || undefined,
      añada:               botellaForm.anada.trim() || undefined,
      origen_escaneo:      'scan_botella',
    }
    Object.keys(metadata).forEach(k => metadata[k] === undefined && delete metadata[k])

    const resp = await fetch('/api/owner/carta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({
        nombre:   botellaForm.nombre.trim(),
        familia,
        precio:   botellaForm.precio ? parseFloat(botellaForm.precio) : 0,
        metadata,
      }),
    })

    if (!resp.ok) {
      const d = await resp.json()
      setError(d.error ?? 'Error al guardar')
      setFase('botella_ficha')
      return
    }

    // Enriquecer con sommelier en background (no bloqueante)
    if (botellaForm.nombre) {
      setEnriching(true)
      fetch('/api/owner/wine-enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sh() },
        body: JSON.stringify({
          nombre: botellaForm.nombre.trim(),
          bodega: botellaForm.bodega.trim() || undefined,
          tipo: botellaForm.tipo || undefined,
          do: botellaForm.denominacion_origen.trim() || undefined,
          varietal: botellaForm.varietal.trim() || undefined,
          añada: botellaForm.anada.trim() || undefined,
        }),
      }).finally(() => setEnriching(false))
    }

    setFase('ok')
    onGuardado?.()
  }, [botellaForm, sh, onGuardado])

  // ── Guardar albarán ────────────────────────────────────────────────────────

  const guardarAlbaran = useCallback(async () => {
    if (!albaranResult) return
    const seleccionadas = albaranResult.vinos.filter(v => v.seleccionado)
    if (seleccionadas.length === 0) { setError('Selecciona al menos un vino'); return }
    setFase('guardando')

    let errores = 0
    const notaBase = [
      albaranResult.proveedor ? `Proveedor: ${albaranResult.proveedor}` : null,
      albaranResult.fecha ? `Albarán: ${albaranResult.fecha}` : null,
      albaranResult.referencia ? `Ref: ${albaranResult.referencia}` : null,
    ].filter(Boolean).join(' · ')

    for (const v of seleccionadas) {
      if (v.en_carta && v.producto_id) {
        // Vino ya en carta — registrar entrada en stock si tiene stock_articulos vinculado
        // (por ahora solo guardamos la info en el log via nota)
        // En una iteración futura: conectar con stock_articulos por producto_id
        continue
      }

      // Vino nuevo → crear en carta
      if (!v.nombre) continue
      const familia = TIPO_FAMILIA[v.tipo] ?? 'vino'
      const metadata: Record<string, string | undefined> = {
        tipo:           'vino',
        bodega:         v.bodega ?? undefined,
        añada:          v.anada ?? undefined,
        origen_escaneo: 'scan_albaran',
      }
      Object.keys(metadata).forEach(k => metadata[k] === undefined && delete metadata[k])

      const r = await fetch('/api/owner/carta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sh() },
        body: JSON.stringify({
          nombre:   v.nombre.trim(),
          familia,
          precio:   v.precio_venta ? parseFloat(v.precio_venta) : 0,
          metadata,
        }),
      })
      if (!r.ok) errores++
    }

    if (errores > 0) setError(`${errores} vino(s) no se pudieron guardar`)
    setFase('ok')
    onGuardado?.()
  }, [albaranResult, sh, onGuardado])

  // ── Reset ─────────────────────────────────────────────────────────────────

  const reiniciar = useCallback(() => {
    setFase('captura')
    setPreview(null); setBotella(null); setAlbaranResult(null)
    setError(null); setBotellaForm({ nombre:'',bodega:'',tipo:'',denominacion_origen:'',varietal:'',anada:'',precio:'' })
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(20,17,14,0.75)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>

      <div style={{
        width: '100%', maxWidth: 480, background: C.bg1,
        borderRadius: '16px 16px 0 0', padding: '24px 20px 32px',
        boxShadow: '0 -8px 40px rgba(0,0,0,.3)',
        maxHeight: '92vh', overflowY: 'auto',
      }}>
        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: C.rule, margin: '0 auto 20px' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, letterSpacing: '.12em', textTransform: 'uppercase' }}>
              Escáner IA · Vinos
            </div>
            <div style={{ fontFamily: SE, fontSize: 22, fontWeight: 500, color: C.ink, marginTop: 2 }}>
              {fase === 'selector'      ? '🍷 Escanear vino'           : ''}
              {fase === 'captura'       ? (modo === 'botella' ? '📷 Fotografía la botella' : '📷 Fotografía el albarán') : ''}
              {fase === 'procesando'    ? 'Reconociendo…'              : ''}
              {fase === 'botella_ficha' ? '🍷 Ficha del vino'          : ''}
              {fase === 'albaran_lista' ? '📋 Vinos en el albarán'     : ''}
              {fase === 'guardando'     ? 'Guardando…'                 : ''}
              {fase === 'ok'            ? '✓ Guardado'                 : ''}
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink3, padding: 4 }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* ── SELECTOR DE MODO ─────────────────────────────────────────── */}
        {fase === 'selector' && (
          <div>
            <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3, marginBottom: 16, lineHeight: 1.5 }}>
              ¿Qué quieres escanear?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {/* Botella */}
              <button onClick={() => { setModo('botella'); setFase('captura') }} style={{
                padding: '16px', borderRadius: 12, border: `1px solid ${C.rule}`,
                background: C.bone, cursor: 'pointer', textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: 14,
                transition: 'border-color .15s',
              }}>
                <span style={{ fontSize: 32 }}>🍾</span>
                <div>
                  <div style={{ fontFamily: SN, fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 2 }}>
                    Botella de vino
                  </div>
                  <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>
                    La IA lee la etiqueta y rellena la ficha completa
                  </div>
                </div>
              </button>
              {/* Albarán */}
              <button onClick={() => { setModo('albaran'); setFase('captura') }} style={{
                padding: '16px', borderRadius: 12, border: `1px solid ${C.rule}`,
                background: C.bone, cursor: 'pointer', textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: 14,
                transition: 'border-color .15s',
              }}>
                <span style={{ fontSize: 32 }}>📋</span>
                <div>
                  <div style={{ fontFamily: SN, fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 2 }}>
                    Albarán de proveedor
                  </div>
                  <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>
                    Detecta todos los vinos del pedido y los añade a la carta
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ── CAPTURA ─────────────────────────────────────────────────────── */}
        {fase === 'captura' && (
          <div>
            {error && (
              <div style={{ padding: '10px 14px', background: `${C.verm}18`, border: `1px solid ${C.verm}44`,
                borderRadius: 8, fontFamily: SN, fontSize: 13, color: C.verm, marginBottom: 12 }}>
                {error}
              </div>
            )}
            <label style={{ cursor: 'pointer' }}>
              <input ref={inputRef} type="file" accept="image/*" capture="environment"
                onChange={handleFile} style={{ display: 'none' }} />
              <div style={{
                border: `2px dashed ${C.verm}66`, borderRadius: 14, padding: '32px 20px',
                textAlign: 'center', background: C.bg2, cursor: 'pointer',
              }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>
                  {modo === 'botella' ? '🍾' : '📋'}
                </div>
                <div style={{ fontFamily: SN, fontSize: 16, fontWeight: 700, color: C.ink, marginBottom: 4 }}>
                  Hacer foto
                </div>
                <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3 }}>
                  {modo === 'botella'
                    ? 'Apunta a la etiqueta frontal o contraetiqueta'
                    : 'Fotografía el albarán completo'}
                </div>
              </div>
            </label>
            <label style={{ cursor: 'pointer', display: 'block', marginTop: 10 }}>
              <input type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
              <div style={{ textAlign: 'center', padding: '10px', border: `1px solid ${C.rule}`,
                borderRadius: 8, fontFamily: SN, fontSize: 13, color: C.ink3, cursor: 'pointer' }}>
                📁 Elegir de la galería
              </div>
            </label>
            <button onClick={() => setFase('selector')} style={{
              width: '100%', marginTop: 10, padding: '9px', background: 'none',
              border: 'none', cursor: 'pointer', fontFamily: SN, fontSize: 12, color: C.ink4,
            }}>
              ← Cambiar modo
            </button>
          </div>
        )}

        {/* ── PROCESANDO ──────────────────────────────────────────────────── */}
        {fase === 'procesando' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            {preview && (
              <img src={preview} alt="preview" style={{
                width: '100%', maxHeight: 180, objectFit: 'cover',
                borderRadius: 10, marginBottom: 20, opacity: 0.7,
              }} />
            )}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '12px 20px', background: C.bg2, borderRadius: 99,
              fontFamily: SN, fontSize: 14, color: C.ink2,
            }}>
              <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block', fontSize: 16 }}>⟳</span>
              {modo === 'botella' ? 'Leyendo etiqueta…' : 'Analizando albarán…'}
            </div>
            <div style={{ marginTop: 12, fontFamily: SM, fontSize: 11, color: C.ink4 }}>
              NIM Vision · llama-3.2-11b
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        {/* ── FICHA BOTELLA ────────────────────────────────────────────────── */}
        {fase === 'botella_ficha' && botella && (
          <div>
            {preview && (
              <img src={preview} alt="botella" style={{
                width: 80, height: 80, objectFit: 'cover', borderRadius: 10,
                float: 'right', marginLeft: 12, marginBottom: 8,
              }} />
            )}
            <ConfianzaBadge v={botella.confianza} />

            {error && (
              <div style={{ padding: '9px 12px', background: `${C.verm}18`, borderRadius: 8,
                fontFamily: SN, fontSize: 13, color: C.verm, marginBottom: 10 }}>
                {error}
              </div>
            )}

            {/* Tipo selector */}
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.1em',
                color: C.ink3, textTransform: 'uppercase' as const, display: 'block', marginBottom: 6 }}>
                Tipo
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(['tinto','blanco','rosado','espumoso','cava','generoso','vermut'] as const).map(t => (
                  <button key={t} onClick={() => setBotellaForm(f => ({ ...f, tipo: t }))} style={{
                    padding: '5px 10px', borderRadius: 8, fontFamily: SN, fontSize: 12, cursor: 'pointer',
                    background: botellaForm.tipo === t ? C.verm : C.bg2,
                    color: botellaForm.tipo === t ? C.paper : C.ink2,
                    border: `1px solid ${botellaForm.tipo === t ? C.redD : C.rule}`,
                    transition: 'all .12s',
                  }}>
                    {TIPO_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>

            <Field label="Nombre *" value={botellaForm.nombre}
              onChange={v => setBotellaForm(f => ({ ...f, nombre: v }))}
              placeholder="Ej: Único Ribera del Duero 2019" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Bodega" value={botellaForm.bodega}
                onChange={v => setBotellaForm(f => ({ ...f, bodega: v }))}
                placeholder="Vega Sicilia" />
              <Field label="D.O." value={botellaForm.denominacion_origen}
                onChange={v => setBotellaForm(f => ({ ...f, denominacion_origen: v }))}
                placeholder="Ribera del Duero" />
              <Field label="Varietal" value={botellaForm.varietal}
                onChange={v => setBotellaForm(f => ({ ...f, varietal: v }))}
                placeholder="Tempranillo" />
              <Field label="Añada" value={botellaForm.anada}
                onChange={v => setBotellaForm(f => ({ ...f, anada: v }))}
                placeholder="2019" />
            </div>
            <Field label="Precio carta (€)" value={botellaForm.precio}
              onChange={v => setBotellaForm(f => ({ ...f, precio: v }))}
              placeholder="28.00" />

            {botella.graduacion && (
              <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginBottom: 10 }}>
                🧪 {botella.graduacion}{botella.volumen ? ` · ${botella.volumen}` : ''}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button onClick={guardarBotella}
                disabled={!botellaForm.nombre.trim()}
                style={{
                  flex: 1, padding: '13px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: botellaForm.nombre.trim() ? C.verm : C.bg3,
                  color: botellaForm.nombre.trim() ? C.paper : C.ink3,
                  fontFamily: SN, fontSize: 15, fontWeight: 700,
                  transition: 'all .15s',
                }}>
                Añadir a la carta
              </button>
              <button onClick={reiniciar} style={{
                padding: '13px 14px', borderRadius: 10, border: `1px solid ${C.rule}`,
                background: 'none', cursor: 'pointer', fontFamily: SN, fontSize: 13, color: C.ink3,
              }}>📷</button>
            </div>
          </div>
        )}

        {/* ── LISTA ALBARÁN ────────────────────────────────────────────────── */}
        {fase === 'albaran_lista' && albaranResult && (
          <div>
            {/* Info albarán */}
            {(albaranResult.proveedor || albaranResult.fecha) && (
              <div style={{ padding: '10px 14px', background: C.bg2, borderRadius: 8, marginBottom: 14,
                fontFamily: SN, fontSize: 12, color: C.ink2 }}>
                {albaranResult.proveedor && <span style={{ fontWeight: 700, color: C.ink }}>{albaranResult.proveedor}</span>}
                {albaranResult.proveedor && albaranResult.fecha && <span style={{ color: C.ink4 }}> · </span>}
                {albaranResult.fecha && <span>{albaranResult.fecha}</span>}
                {albaranResult.referencia && <span style={{ color: C.ink4 }}> · Ref {albaranResult.referencia}</span>}
              </div>
            )}

            {error && (
              <div style={{ padding: '9px 12px', background: `${C.verm}18`, borderRadius: 8,
                fontFamily: SN, fontSize: 13, color: C.verm, marginBottom: 10 }}>
                {error}
              </div>
            )}

            {/* Lista de vinos */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {albaranResult.vinos.map((v, i) => (
                <div key={i} style={{
                  padding: '12px 14px', borderRadius: 10,
                  border: `1px solid ${v.seleccionado ? C.rule : C.bg3}`,
                  background: v.seleccionado ? C.bone : C.bg2,
                  opacity: v.seleccionado ? 1 : 0.5,
                  transition: 'all .15s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <input type="checkbox" checked={v.seleccionado}
                      onChange={e => {
                        const vinos = [...albaranResult.vinos]
                        vinos[i] = { ...vinos[i], seleccionado: e.target.checked }
                        setAlbaranResult(r => r ? { ...r, vinos } : r)
                      }}
                      style={{ marginTop: 3, accentColor: C.verm, width: 16, height: 16, flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: SN, fontSize: 14, fontWeight: 700, color: C.ink }}>
                          {v.nombre ?? '—'}
                        </span>
                        {v.anada && (
                          <span style={{ fontFamily: SM, fontSize: 10, color: C.ink3 }}>{v.anada}</span>
                        )}
                        {/* Badge en carta / nuevo */}
                        <span style={{
                          padding: '2px 7px', borderRadius: 99, fontSize: 10, fontFamily: SM, fontWeight: 700,
                          background: v.en_carta ? `${C.gr}22` : `${C.verm}22`,
                          color: v.en_carta ? C.gr : C.verm,
                          border: `1px solid ${v.en_carta ? C.gr : C.verm}44`,
                        }}>
                          {v.en_carta ? '✓ En carta' : '+ Nuevo'}
                        </span>
                      </div>
                      <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>
                        {TIPO_LABEL[v.tipo] ?? ''}
                        {v.bodega ? ` · ${v.bodega}` : ''}
                        {v.cantidad ? ` · ${v.cantidad} ud.` : ''}
                        {v.precio_unitario ? ` · ${v.precio_unitario}€/u` : ''}
                      </div>
                      {/* Precio venta (solo para nuevos) */}
                      {!v.en_carta && v.seleccionado && (
                        <input
                          value={v.precio_venta}
                          onChange={e => {
                            const vinos = [...albaranResult.vinos]
                            vinos[i] = { ...vinos[i], precio_venta: e.target.value }
                            setAlbaranResult(r => r ? { ...r, vinos } : r)
                          }}
                          placeholder="Precio carta (€)"
                          style={{ marginTop: 6, width: '100%', boxSizing: 'border-box',
                            padding: '6px 10px', background: C.bg1, border: `1px solid ${C.rule}`,
                            borderRadius: 6, fontFamily: SN, fontSize: 13, color: C.ink, outline: 'none' }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ fontFamily: SC, fontSize: 12, color: C.ink4, marginBottom: 14, textAlign: 'center' }}>
              {albaranResult.vinos.filter(v => v.seleccionado && !v.en_carta).length} nuevos ·{' '}
              {albaranResult.vinos.filter(v => v.seleccionado && v.en_carta).length} ya en carta
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={guardarAlbaran}
                disabled={albaranResult.vinos.filter(v => v.seleccionado).length === 0}
                style={{
                  flex: 1, padding: '13px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: albaranResult.vinos.some(v => v.seleccionado) ? C.verm : C.bg3,
                  color: albaranResult.vinos.some(v => v.seleccionado) ? C.paper : C.ink3,
                  fontFamily: SN, fontSize: 15, fontWeight: 700,
                }}>
                Guardar seleccionados
              </button>
              <button onClick={reiniciar} style={{
                padding: '13px 14px', borderRadius: 10, border: `1px solid ${C.rule}`,
                background: 'none', cursor: 'pointer', fontFamily: SN, fontSize: 13, color: C.ink3,
              }}>📷</button>
            </div>
          </div>
        )}

        {/* ── GUARDANDO ─────────────────────────────────────────────────────── */}
        {fase === 'guardando' && (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
            <div style={{ fontFamily: SN, fontSize: 16, color: C.ink }}>Guardando…</div>
          </div>
        )}

        {/* ── OK ────────────────────────────────────────────────────────────── */}
        {fase === 'ok' && (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🍷</div>
            <div style={{ fontFamily: SE, fontSize: 22, fontWeight: 500, color: C.ink, marginBottom: 6 }}>
              {error ? 'Guardado parcialmente' : 'Añadido a la carta'}
            </div>
            {enriching && (
              <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginBottom: 6 }}>
                ✦ Sommelier IA enriqueciendo ficha…
              </div>
            )}
            {error && (
              <div style={{ fontFamily: SN, fontSize: 13, color: C.amb, marginBottom: 10 }}>{error}</div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
              <button onClick={() => { setFase('selector'); setPreview(null); setBotella(null);
                setAlbaranResult(null); setError(null) }} style={{
                padding: '10px 20px', borderRadius: 8, border: `1px solid ${C.rule}`,
                background: 'none', cursor: 'pointer', fontFamily: SN, fontSize: 13, color: C.ink2,
              }}>
                Escanear otro
              </button>
              <button onClick={onClose} style={{
                padding: '10px 20px', borderRadius: 8, border: 'none',
                background: C.verm, cursor: 'pointer', fontFamily: SN, fontSize: 13,
                color: C.paper, fontWeight: 700,
              }}>
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
