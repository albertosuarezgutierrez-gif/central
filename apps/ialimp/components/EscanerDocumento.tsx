// components/EscanerDocumento.tsx
'use client'
import { useState, useRef, useCallback } from 'react'

const C = {
  primary: 'var(--brand-primary)', brand: 'var(--brand-secondary)', light: 'var(--brand-light)',
  bg: '#f1f5f9', text: '#1e293b', muted: '#64748b', border: '#e2e8f0',
  ok: '#16a34a', okBg: '#f0fdf4', okBorder: '#bbf7d0',
  warn: '#d97706', warnBg: '#fffbeb',
  red: '#dc2626', redBg: '#fef2f2',
}

const TIPO_EMOJI: Record<string, string> = {
  factura: '🧾', albaran: '📦', ticket: '🏷️', otro: '📄'
}

interface Props {
  token: string
  propiedadId?: string
  onGuardado?: () => void
}

export default function EscanerDocumento({ token, propiedadId, onGuardado }: Props) {
  const [fase, setFase]       = useState<'inicio'|'preview'|'analizando'|'resultado'|'guardado'>('inicio')
  const [imgSrc, setImgSrc]   = useState<string | null>(null)
  const [imgFile, setImgFile] = useState<File | null>(null)
  const [resultado, setResultado] = useState<any>(null)
  const [error, setError]     = useState<string | null>(null)
  const camRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)

  const cargar = useCallback((file: File) => {
    setImgFile(file)
    const r = new FileReader()
    r.onload = (e) => { setImgSrc(e.target?.result as string); setFase('preview') }
    r.readAsDataURL(file)
  }, [])

  const analizar = async () => {
    if (!imgSrc || !imgFile) return
    setFase('analizando')
    setError(null)
    try {
      const base64    = imgSrc.split(',')[1]
      const mediaType = imgFile.type || 'image/jpeg'

      const res = await fetch(`/api/propietario/${token}/escanear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagen_base64: base64,
          media_type: mediaType,
          propiedad_id: propiedadId || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error en el servidor')

      setResultado(data)
      setFase('resultado')
    } catch (e: any) {
      setError(e.message)
      setFase('preview')
    }
  }

  const reiniciar = () => {
    setFase('inicio'); setImgSrc(null); setImgFile(null)
    setResultado(null); setError(null)
  }

  const confirmarGuardado = () => {
    setFase('guardado')
    onGuardado?.()
  }

  return (
    <div style={{ fontFamily: "'Nunito','Segoe UI',sans-serif", color: C.text }}>

      {/* ── INICIO ── */}
      {fase === 'inicio' && (
        <div style={s.col}>
          <div style={s.heroCard}>
            <div style={{ fontSize: 44, marginBottom: 8 }}>🤖</div>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Escanear documento</div>
            <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.55 }}>
              La IA detecta automáticamente si es factura, albarán, ticket u otro.
              Genera el apunte contable y actualiza el stock.
            </div>
          </div>

          <button style={s.btnCam} onClick={() => camRef.current?.click()}>
            <span style={{ fontSize: 32 }}>📷</span>
            <span style={{ fontWeight: 700, fontSize: 16 }}>Fotografiar documento</span>
            <span style={{ fontSize: 12, opacity: 0.8 }}>Abre la cámara del móvil</span>
          </button>

          <div style={s.orRow}>
            <span style={s.orLine} /><span style={{ color: C.muted, fontSize: 13, fontWeight: 600 }}>o</span><span style={s.orLine} />
          </div>

          <button style={s.btnSec} onClick={() => galRef.current?.click()}>
            🖼️&nbsp; Galería / archivo
          </button>

          <div style={s.tipBox}>
            💡 <b>Consejo:</b> buena iluminación y números legibles para mejores resultados.
          </div>

          <input ref={camRef} type="file" accept="image/*" capture="environment"
            style={{ display: 'none' }} onChange={e => e.target.files?.[0] && cargar(e.target.files[0])} />
          <input ref={galRef} type="file" accept="image/*"
            style={{ display: 'none' }} onChange={e => e.target.files?.[0] && cargar(e.target.files[0])} />
        </div>
      )}

      {/* ── PREVIEW ── */}
      {fase === 'preview' && (
        <div style={s.col}>
          <div style={s.imgWrap}>
            <img src={imgSrc!} alt="doc" style={s.imgPrev} />
          </div>
          {error && <div style={s.errBox}>{error}</div>}
          <button style={s.btnPri} onClick={analizar}>✨ Analizar con IA</button>
          <button style={s.btnLink} onClick={reiniciar}>Repetir foto</button>
        </div>
      )}

      {/* ── ANALIZANDO ── */}
      {fase === 'analizando' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 16px', gap: 20 }}>
          <div style={s.spinner} />
          <div style={{ fontWeight: 700, fontSize: 17 }}>Analizando documento…</div>
          <div style={{ width: '100%', maxWidth: 280 }}>
            {[
              { t: 'Leyendo imagen',                  ok: true  },
              { t: 'Identificando tipo de documento', act: true },
              { t: 'Extrayendo datos y líneas',       ok: false },
              { t: 'Generando apunte contable PGC',   ok: false },
            ].map((st, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 9 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700,
                  background: st.ok ? C.primary : st.act ? C.light : '#e5e7eb',
                  border: st.act ? `2px solid ${C.primary}` : '2px solid transparent',
                  color: st.ok ? '#fff' : st.act ? C.primary : '#9ca3af',
                }}>
                  {st.ok ? '✓' : st.act ? '●' : ''}
                </div>
                <span style={{ fontSize: 14, color: st.ok ? C.text : st.act ? C.primary : '#9ca3af', fontWeight: st.act ? 600 : 400 }}>
                  {st.t}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── RESULTADO ── */}
      {fase === 'resultado' && resultado && (
        <div style={s.col}>
          {/* Cabecera tipo detectado */}
          <div style={s.tipCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span style={{ fontSize: 34 }}>{TIPO_EMOJI[resultado.tipo_doc] || '📄'}</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: C.primary }}>
                  {(resultado.tipo_doc || 'documento').toUpperCase()} detectado
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                  {resultado.datos_ia?.descripcion_corta}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>
              {resultado.total != null ? `${Number(resultado.total).toFixed(2)} €` : '—'}
            </div>
          </div>

          {/* Datos extraídos */}
          <div style={s.card}>
            <div style={s.cardTit}>Datos extraídos por IA</div>
            <Row lbl="Proveedor"    val={resultado.proveedor} />
            <Row lbl="Fecha"        val={resultado.datos_ia?.fecha} />
            <Row lbl="Nº documento" val={resultado.datos_ia?.numero_doc} />
            <Row lbl="Base imponible" val={resultado.datos_ia?.base_imponible != null ? `${Number(resultado.datos_ia.base_imponible).toFixed(2)} €` : null} />
            <Row lbl={`IVA (${resultado.datos_ia?.porcentaje_iva ?? '?'}%)`} val={resultado.datos_ia?.cuota_iva != null ? `${Number(resultado.datos_ia.cuota_iva).toFixed(2)} €` : null} />
          </div>

          {/* Apunte PGC */}
          <div style={s.card}>
            <div style={s.cardTit}>Apunte contable · PGC</div>
            <div style={{ ...s.apRow, fontWeight: 700, fontSize: 11, color: '#9ca3af', textTransform: 'uppercase' }}>
              <span style={{ flex: 2 }}>Cuenta</span>
              <span style={{ flex: 3 }}>Descripción</span>
              <span style={{ flex: 1, textAlign: 'right' }}>Debe</span>
              <span style={{ flex: 1, textAlign: 'right' }}>Haber</span>
            </div>
            {resultado.apunte?.map((r: any, i: number) => (
              <div key={i} style={s.apRow}>
                <span style={{ flex: 2, color: C.primary, fontWeight: 700 }}>{r.cuenta}</span>
                <span style={{ flex: 3, fontSize: 12, color: '#374151' }}>{r.nombre}</span>
                <span style={{ flex: 1, textAlign: 'right', color: r.debe ? C.ok : '#d1d5db' }}>{r.debe || ''}</span>
                <span style={{ flex: 1, textAlign: 'right', color: r.haber ? C.red : '#d1d5db' }}>{r.haber || ''}</span>
              </div>
            ))}
          </div>

          {/* Stock */}
          {resultado.stock_actualizado > 0 && (
            <div style={{ background: C.okBg, border: `1px solid ${C.okBorder}`, borderRadius: 12, padding: '12px 16px', fontSize: 14, color: C.ok, fontWeight: 600 }}>
              📦 {resultado.stock_actualizado} artículo(s) de stock actualizados automáticamente
            </div>
          )}

          {resultado.datos_ia?.notas && (
            <div style={s.notaBox}>ℹ️ {resultado.datos_ia.notas}</div>
          )}

          <div style={{ background: C.light, borderRadius: 12, padding: '12px 16px', fontSize: 13, color: C.brand }}>
            ✅ Documento guardado en contabilidad con ID <b>{resultado.doc_id?.slice(0, 8)}…</b>
          </div>

          <button style={s.btnPri} onClick={confirmarGuardado}>
            ✓ Confirmar y volver
          </button>
          <button style={s.btnLink} onClick={reiniciar}>Escanear otro documento</button>
        </div>
      )}

      {/* ── GUARDADO ── */}
      {fase === 'guardado' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 16px', gap: 14 }}>
          <div style={{ fontSize: 54 }}>✅</div>
          <div style={{ fontWeight: 800, fontSize: 19 }}>¡Registrado!</div>
          <div style={s.card}>
            {[
              'Documento guardado en contabilidad',
              'Apunte PGC generado',
              ...(resultado?.stock_actualizado > 0 ? ['Stock actualizado'] : []),
            ].map((t, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${C.border}`, fontSize: 14, color: '#374151' }}>
                <span>{t}</span><span style={{ color: C.ok, fontWeight: 700 }}>✓</span>
              </div>
            ))}
          </div>
          <button style={s.btnPri} onClick={reiniciar}>📄 Escanear otro</button>
        </div>
      )}

      <style>{`
        @keyframes giro { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

function Row({ lbl, val }: { lbl: string; val: any }) {
  if (val == null || val === '') return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
      <span style={{ color: '#6b7280', fontWeight: 600, fontSize: 12 }}>{lbl}</span>
      <span style={{ color: '#1e1b4b', fontWeight: 600 }}>{val}</span>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  col:     { display: 'flex', flexDirection: 'column', gap: 14 },
  heroCard:{ background: '#fff', borderRadius: 14, padding: '24px 18px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,.06)' },
  btnCam:  { background: 'linear-gradient(135deg,var(--brand-primary),var(--brand-secondary))', color: '#fff', border: 'none', borderRadius: 14, padding: '20px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 18px rgba(79,70,229,.32)', width: '100%' },
  orRow:   { display: 'flex', alignItems: 'center', gap: 11 },
  orLine:  { flex: 1, height: 1, background: '#e2e8f0', display: 'block' },
  btnSec:  { background: '#fff', border: '2px solid var(--brand-primary)', color: 'var(--brand-primary)', padding: '12px 18px', borderRadius: 11, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', width: '100%' },
  tipBox:  { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 9, padding: '10px 13px', fontSize: 13, color: '#92400e' },
  imgWrap: { borderRadius: 13, overflow: 'hidden', boxShadow: '0 4px 14px rgba(0,0,0,.11)', background: '#fff', maxHeight: 360, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  imgPrev: { width: '100%', height: 'auto', maxHeight: 360, objectFit: 'contain', display: 'block' },
  errBox:  { background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 9, padding: '9px 13px', fontSize: 13 },
  btnPri:  { background: 'linear-gradient(135deg,var(--brand-primary),var(--brand-secondary))', color: '#fff', border: 'none', padding: '13px 24px', borderRadius: 11, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', width: '100%', boxShadow: '0 4px 12px rgba(79,70,229,.28)' },
  btnLink: { background: 'transparent', border: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', alignSelf: 'center' },
  spinner: { width: 52, height: 52, borderRadius: '50%', border: '4px solid var(--brand-light)', borderTop: '4px solid var(--brand-primary)', animation: 'giro .85s linear infinite' },
  tipCard: { background: '#fff', borderRadius: 13, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 4px rgba(0,0,0,.06)' },
  card:    { background: '#fff', borderRadius: 13, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 2, boxShadow: '0 1px 4px rgba(0,0,0,.06)' },
  cardTit: { fontWeight: 700, fontSize: 11, color: 'var(--brand-primary)', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--brand-light)', paddingBottom: 7, marginBottom: 6 },
  apRow:   { display: 'flex', padding: '6px 0', borderBottom: '1px solid #f8fafc', alignItems: 'center', fontSize: 13 },
  notaBox: { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 9, padding: '9px 13px', fontSize: 13, color: '#92400e' },
}
