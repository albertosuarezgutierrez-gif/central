'use client'
import { C, SE, SN, SM, SC } from '@/lib/colors'
import React, { useState, useRef, useCallback } from 'react'

/* ── Paleta crema (light, igual que /edge) ── */

type TipoDoc = 'cv' | 'albaran' | 'factura_proveedor' | 'carta' | 'etiqueta_producto' | 'otro'

interface ScanResult {
  scan_id: string | null
  tipo: TipoDoc
  confianza: number
  confianza_pct?: number
  nivel_confianza?: 'alta' | 'media' | 'baja'
  campos_a_revisar?: string[]
  requiere_revision?: boolean
  datos: Record<string, unknown>
  nim_error?: string | null
  productos_con_caducidad?: { nombre: string; fecha_caducidad: string; codigo_barras: string | null }[]
}

const TIPO_INFO: Record<TipoDoc, { emoji: string; label: string; color: string; accion: string }> = {
  cv:               { emoji: '👤', label: 'Currículum',       color: C.teal, accion: 'Añadir a bolsa de personal' },
  albaran:          { emoji: '📦', label: 'Albarán',           color: C.gr,   accion: 'Archivar en Almacén' },
  factura_proveedor:{ emoji: '🧾', label: 'Factura proveedor', color: C.amb,  accion: 'Archivar en Gastos' },
  carta:            { emoji: '📋', label: 'Carta en papel',    color: C.verm, accion: 'Importar a la Carta' },
  etiqueta_producto:{ emoji: '🏷️', label: 'Etiqueta producto', color: C.gr,   accion: 'Usar en Recepción' },
  otro:             { emoji: '📄', label: 'Otro documento',    color: C.ink3, accion: 'Guardar en Documentos' },
}

// Semáforo de confianza
const SEMAFORO = {
  alta:  { color: '#22C55E', label: 'Confianza alta',   icon: '🟢' },
  media: { color: '#F59E0B', label: 'Confianza media',  icon: '🟡' },
  baja:  { color: '#EF4444', label: 'Confianza baja',   icon: '🔴' },
}

const CAMPO_LABELS_ETIQUETA: Record<string, string> = {
  nombre_producto: 'Producto', codigo_barras: 'Código barras', cantidad: 'Cantidad',
  unidad: 'Unidad', lote: 'Lote', fecha_caducidad: 'Caducidad', fecha_fabricacion: 'Fabricación',
  proveedor: 'Proveedor', temperatura_conservacion: 'Temperatura', alergenos: 'Alérgenos',
}

function Campo({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined || value === '') return null
  if (Array.isArray(value)) {
    if (value.length === 0) return null
    return (
      <div style={{ marginBottom: 6 }}>
        <span style={{ fontFamily: SM, fontSize: 10, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</span>
        <div style={{ marginTop: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {value.slice(0, 5).map((v, i) => (
            <span key={i} style={{ fontFamily: SN, fontSize: 12, color: C.ink2, paddingLeft: 8, borderLeft: `2px solid ${C.rule}` }}>
              {typeof v === 'object' ? Object.values(v as Record<string,string>).join(' · ') : String(v)}
            </span>
          ))}
          {value.length > 5 && <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>+{value.length-5} más</span>}
        </div>
      </div>
    )
  }
  return (
    <div style={{ marginBottom: 6 }}>
      <span style={{ fontFamily: SM, fontSize: 10, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</span>
      <div style={{ fontFamily: SN, fontSize: 14, color: C.ink, marginTop: 2 }}>{String(value)}</div>
    </div>
  )
}

const CAMPO_LABELS: Record<string, string> = {
  nombre: 'Nombre', puesto: 'Puesto', email: 'Email', telefono: 'Teléfono',
  experiencia_resumen: 'Experiencia',
  proveedor: 'Proveedor', fecha: 'Fecha', referencia: 'Referencia',
  total_eur: 'Total (€)', num_lineas: 'Líneas', productos: 'Productos',
  numero_factura: 'Nº Factura', base_imponible: 'Base imponible', iva_eur: 'IVA',
  num_productos_detectados: 'Productos detectados', tiene_precios: 'Tiene precios',
  secciones: 'Secciones', muestra_productos: 'Muestra',
  descripcion_breve: 'Descripción',
}

interface Props {
  onClose: () => void
  sessionNombre: string
  sessionRol: string
}

export default function SmartScanModal({ onClose, sessionNombre, sessionRol }: Props) {
  const [fase, setFase] = useState<'captura' | 'analizando' | 'resultado' | 'archivando'>('captura')
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [archivandoOk, setArchivandoOk] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 4_000_000) {
      setError('Imagen demasiado grande (máx 4MB). Prueba con otra foto.')
      return
    }

    setError(null)
    setFase('analizando')

    // Preview
    const reader = new FileReader()
    reader.onload = ev => setPreview(ev.target?.result as string)
    reader.readAsDataURL(file)

    // Base64 para NIM
    const b64 = await new Promise<string>((res, rej) => {
      const r = new FileReader()
      r.onload  = ev => res((ev.target?.result as string).split(',')[1])
      r.onerror = () => rej(new Error('Error leyendo imagen'))
      r.readAsDataURL(file)
    })

    try {
      const ses = typeof window !== 'undefined' ? localStorage.getItem('ia_rest_session') ?? '' : ''
      const resp = await fetch('/api/scanner/clasificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ia-session': ses },
        body: JSON.stringify({ imagenBase64: b64, mediaType: file.type }),
      })
      const data = await resp.json()

      if (!resp.ok) {
        setError(data.error ?? 'Error al clasificar')
        setFase('captura')
        return
      }

      setResult(data)
      setFase('resultado')
    } catch (err) {
      setError('Error de red. Inténtalo de nuevo.')
      setFase('captura')
    }
  }, [])

  const archivar = useCallback(async () => {
    if (!result?.scan_id) return
    setFase('archivando')
    const ses = typeof window !== 'undefined' ? localStorage.getItem('ia_rest_session') ?? '' : ''

    // Marcar como archivado en BD
    await fetch('/api/owner/scanner', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': ses },
      body: JSON.stringify({ id: result.scan_id, estado: 'archivado' }),
    })

    setArchivandoOk(true)
    setTimeout(() => {
      // Redirigir al módulo según tipo
      if (result.tipo === 'cv')                window.location.href = '/owner?tab=personal'
      if (result.tipo === 'albaran')           window.location.href = '/owner?tab=almacen'
      if (result.tipo === 'factura_proveedor') window.location.href = '/owner?tab=gastos'
      if (result.tipo === 'carta')             window.location.href = '/owner?tab=carta'
      if (result.tipo === 'etiqueta_producto') window.location.href = '/owner?tab=almacen&recepcion=1'
      if (result.tipo === 'otro')              onClose()
    }, 800)
  }, [result, onClose])

  const descartar = useCallback(async () => {
    if (result?.scan_id) {
      const ses = typeof window !== 'undefined' ? localStorage.getItem('ia_rest_session') ?? '' : ''
      await fetch('/api/owner/scanner', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-ia-session': ses },
        body: JSON.stringify({ id: result.scan_id, estado: 'descartado' }),
      })
    }
    onClose()
  }, [result, onClose])

  const reintentar = useCallback(() => {
    setFase('captura')
    setPreview(null)
    setResult(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  const info = result ? TIPO_INFO[result.tipo] : null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(26,23,20,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>

      <div style={{
        width: '100%', maxWidth: 480, background: C.bg1,
        borderRadius: '16px 16px 0 0', padding: '24px 20px 32px',
        boxShadow: '0 -8px 40px rgba(0,0,0,.25)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: C.rule, margin: '0 auto 20px' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, letterSpacing: '.12em', textTransform: 'uppercase' }}>
              Escáner IA
            </div>
            <div style={{ fontFamily: SE, fontSize: 22, fontWeight: 500, color: C.ink, marginTop: 2 }}>
              {fase === 'captura'    ? 'Fotografía el documento'   : ''}
              {fase === 'analizando' ? 'Analizando…'               : ''}
              {fase === 'resultado'  ? `${info?.emoji} ${info?.label}` : ''}
              {fase === 'archivando' ? (archivandoOk ? '✓ Archivado' : 'Archivando…') : ''}
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.ink3, padding: 4 }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Quién escanea */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
          background: C.bg2, borderRadius: 8, marginBottom: 16,
          fontFamily: SN, fontSize: 12, color: C.ink3,
        }}>
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
          </svg>
          <span><b style={{ color: C.ink }}>{sessionNombre}</b> · {sessionRol}</span>
        </div>

        {/* ── FASE: CAPTURA ─────────────────────────────────── */}
        {fase === 'captura' && (
          <div>
            {error && (
              <div style={{ padding: '10px 14px', background: C.vermS, border: `1px solid ${C.verm}33`, borderRadius: 8, fontFamily: SN, fontSize: 13, color: C.verm, marginBottom: 14 }}>
                {error}
              </div>
            )}

            {/* Botón principal cámara */}
            <label style={{ cursor: 'pointer' }}>
              <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={handleFile}
                style={{ display: 'none' }} />
              <div style={{
                border: `2px dashed ${C.verm}66`, borderRadius: 14, padding: '32px 20px',
                textAlign: 'center', background: C.bg2, cursor: 'pointer',
                transition: 'all .15s',
              }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>📷</div>
                <div style={{ fontFamily: SN, fontSize: 16, fontWeight: 700, color: C.ink, marginBottom: 4 }}>
                  Hacer foto
                </div>
                <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3 }}>
                  Apunta a: CV · Albarán · Factura · Carta
                </div>
              </div>
            </label>

            {/* Subir desde galería */}
            <label style={{ cursor: 'pointer', display: 'block', marginTop: 10 }}>
              <input type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
              <div style={{
                textAlign: 'center', padding: '10px', border: `1px solid ${C.rule}`,
                borderRadius: 8, fontFamily: SN, fontSize: 13, color: C.ink3, cursor: 'pointer',
              }}>
                📁 Elegir de la galería
              </div>
            </label>

            <div style={{ marginTop: 16, fontFamily: SC, fontSize: 14, color: C.ink4, textAlign: 'center' }}>
              La IA clasifica y extrae los datos automáticamente
            </div>
          </div>
        )}

        {/* ── FASE: ANALIZANDO ──────────────────────────────── */}
        {fase === 'analizando' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            {preview && (
              <img src={preview} alt="preview" style={{
                width: '100%', maxHeight: 200, objectFit: 'cover',
                borderRadius: 10, marginBottom: 20, opacity: 0.7,
              }} />
            )}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '12px 20px', background: C.bg2, borderRadius: 99,
              fontFamily: SN, fontSize: 14, color: C.ink2,
            }}>
              <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block', fontSize: 16 }}>⟳</span>
              NIM analizando documento…
            </div>
            <div style={{ marginTop: 12, fontFamily: SM, fontSize: 11, color: C.ink4 }}>
              llama-3.2-11b-vision · ~2s
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        {/* ── FASE: RESULTADO ───────────────────────────────── */}
        {fase === 'resultado' && result && info && (
          <div>
            {/* Preview + tipo */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-start' }}>
              {preview && (
                <img src={preview} alt="doc" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                  background: `${info.color}22`, border: `1px solid ${info.color}44`,
                  borderRadius: 99, marginBottom: 6,
                }}>
                  <span style={{ fontSize: 14 }}>{info.emoji}</span>
                  <span style={{ fontFamily: SM, fontSize: 11, fontWeight: 700, color: info.color }}>
                    {info.label.toUpperCase()}
                  </span>
                </div>
              {/* Barra de confianza + semáforo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, height: 4, background: C.bg3, borderRadius: 2 }}>
                    <div style={{
                      width: `${result.confianza * 100}%`, height: '100%',
                      background: result.nivel_confianza === 'alta' ? '#22C55E' : result.nivel_confianza === 'media' ? '#F59E0B' : '#EF4444',
                      borderRadius: 2, transition: 'width .5s'
                    }} />
                  </div>
                  <span style={{ fontFamily: SM, fontSize: 10, color: C.ink3 }}>
                    {result.nivel_confianza ? SEMAFORO[result.nivel_confianza].icon : ''} {Math.round(result.confianza * 100)}%
                  </span>
                </div>
                {/* Aviso campos a revisar */}
                {result.campos_a_revisar && result.campos_a_revisar.length > 0 && (
                  <div style={{ marginTop: 6, padding: '6px 10px', background: '#FEF3C7', borderRadius: 6, border: '1px solid #FCD34D' }}>
                    <span style={{ fontFamily: SM, fontSize: 10, color: '#92400E', fontWeight: 700 }}>
                      ⚠️ Revisar: {result.campos_a_revisar.join(', ')}
                    </span>
                  </div>
                )}
                {result.nim_error && (
                  <div style={{ fontFamily: SM, fontSize: 10, color: C.amb, marginTop: 4 }}>
                    ⚠ Análisis parcial
                  </div>
                )}
              </div>
            </div>

            {/* Datos extraídos — con vista lado a lado si requiere revisión */}
            {result.requiere_revision && preview ? (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: SM, fontSize: 10, color: '#92400E', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
                  ⚠️ Confianza {result.nivel_confianza} — compara los datos extraídos con la imagen original
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {/* Imagen original */}
                  <div>
                    <div style={{ fontFamily: SM, fontSize: 9, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Imagen original</div>
                    <img src={preview} alt="original" style={{ width: '100%', borderRadius: 8, border: `1px solid ${C.rule}`, objectFit: 'contain', maxHeight: 220 }} />
                  </div>
                  {/* Datos extraídos */}
                  <div>
                    <div style={{ fontFamily: SM, fontSize: 9, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Datos extraídos</div>
                    <div style={{ background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '10px 12px' }}>
                      {Object.entries(result.datos).map(([k, v]) => (
                        <div key={k}><Campo label={(result.tipo === 'etiqueta_producto' ? CAMPO_LABELS_ETIQUETA[k] : CAMPO_LABELS[k]) ?? k} value={v} /></div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
            <div style={{ background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 10 }}>
                Datos extraídos
              </div>
              {Object.entries(result.datos).map(([k, v]) => (
                <div key={k}><Campo label={(result.tipo === 'etiqueta_producto' ? CAMPO_LABELS_ETIQUETA[k] : CAMPO_LABELS[k]) ?? k} value={v} /></div>
              ))}
            </div>
            )}

            {/* Botones de acción */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={archivar} style={{
                padding: '13px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: info.color, color: '#fff',
                fontFamily: SN, fontSize: 15, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                <span>→</span> {info.accion}
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={reintentar} style={{
                  flex: 1, padding: '11px', borderRadius: 8, border: `1px solid ${C.rule}`,
                  background: 'none', cursor: 'pointer', fontFamily: SN, fontSize: 13, color: C.ink3,
                }}>
                  📷 Nueva foto
                </button>
                <button onClick={descartar} style={{
                  flex: 1, padding: '11px', borderRadius: 8, border: `1px solid ${C.rule}`,
                  background: 'none', cursor: 'pointer', fontFamily: SN, fontSize: 13, color: C.ink3,
                }}>
                  🗑 Descartar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── FASE: ARCHIVANDO ──────────────────────────────── */}
        {fase === 'archivando' && (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>
              {archivandoOk ? '✅' : '⏳'}
            </div>
            <div style={{ fontFamily: SN, fontSize: 16, fontWeight: 600, color: C.ink }}>
              {archivandoOk ? 'Archivado correctamente' : 'Archivando…'}
            </div>
            {archivandoOk && (
              <div style={{ fontFamily: SN, fontSize: 13, color: C.ink3, marginTop: 6 }}>
                Redirigiendo al módulo…
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
