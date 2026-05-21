'use client'
// AsnClientApp v3 — Portal del proveedor para pre-notificar envío (ASN)
// NUEVO v3: escaneo por ítem (📷 etiqueta → IA extrae lote+caducidad+EAN)
//           + GS1-128 nativo (BarcodeDetector API) para cajas con código

import { useState, useEffect, useRef } from 'react'

const C = {
  bg: '#14110E', bg2: '#1E1A15', bg3: '#2A221A',
  red: '#D9442B', cream: '#F6F1E7', creamMid: '#D8CDB6',
  creamDim: '#8C7B69', green: '#3F7D44', rule: '#2E2720', amber: '#E8A33B',
}

type PedidoASN = {
  id: string; articulo: string; cantidad: number; unidad: string
  restaurante: string; proveedor: string; ya_subido: boolean
}
type AsnItem = {
  articulo: string; cantidad: string; unidad: string
  precio: string; lote: string; caducidad: string; ean: string
  scan_estado?: 'ok_codigo' | 'ok_ia' | 'revisar' | null
}

// Parseador GS1-128 / GS1 DataMatrix
function parseGS1(raw: string): { gtin?: string; lote?: string; caducidad?: string } {
  const result: { gtin?: string; lote?: string; caducidad?: string } = {}
  const str = '\x1D' + raw.replace(/\((\d{2,4})\)/g, '\x1D$1')
  const gtin = str.match(/\x1D01(\d{14})/)
  if (gtin) result.gtin = gtin[1]
  const exp = str.match(/\x1D17(\d{6})/)
  if (exp) {
    const d = exp[1]
    result.caducidad = `20${d.slice(0,2)}-${d.slice(2,4)}-${d.slice(4,6) === '00' ? '01' : d.slice(4,6)}`
  }
  if (!result.caducidad) {
    const bb = str.match(/\x1D15(\d{6})/)
    if (bb) {
      const d = bb[1]
      result.caducidad = `20${d.slice(0,2)}-${d.slice(2,4)}-${d.slice(4,6) === '00' ? '01' : d.slice(4,6)}`
    }
  }
  const lot = str.match(/\x1D10([A-Za-z0-9\-\/\.]{1,20})/)
  if (lot) result.lote = lot[1]
  return result
}

async function detectBarcode(imageFile: File): Promise<{ raw: string; format: string } | null> {
  if (!('BarcodeDetector' in window)) return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const BD = (window as any).BarcodeDetector
    const detector = new BD({ formats: ['code_128', 'data_matrix', 'qr_code', 'ean_13', 'ean_8'] })
    const img = await createImageBitmap(imageFile)
    const codes = await detector.detect(img)
    if (codes.length > 0) {
      const gs1 = codes.find((c: { format: string }) => ['code_128', 'data_matrix'].includes(c.format))
      const best = gs1 ?? codes[0]
      return { raw: best.rawValue, format: best.format }
    }
  } catch { /* silent */ }
  return null
}

export default function AsnClientApp({ token }: { token: string }) {
  const [screen, setScreen]       = useState<'loading'|'error'|'form'|'ok'>('loading')
  const [pedido, setPedido]       = useState<PedidoASN | null>(null)
  const [error,  setError]        = useState('')
  const [items,  setItems]        = useState<AsnItem[]>([])
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [albaran, setAlbaran]     = useState('')
  const [notas,   setNotas]       = useState('')
  const [sending, setSending]     = useState(false)
  const [toast,   setToast]       = useState('')
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrPreview, setOcrPreview] = useState<string | null>(null)
  const [ocrMsg, setOcrMsg]       = useState('')
  const fileRefAlbaran            = useRef<HTMLInputElement>(null)
  const fileRefsItem              = useRef<(HTMLInputElement | null)[]>([])
  const [itemScanLoading, setItemScanLoading] = useState<number | null>(null)

  useEffect(() => {
    fetch(`/api/asn?token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (!d.ok) { setError(d.error ?? 'Link inválido'); setScreen('error'); return }
        setPedido(d.pedido)
        setItems([{ articulo: d.pedido.articulo, cantidad: String(d.pedido.cantidad), unidad: d.pedido.unidad, precio: '', lote: '', caducidad: '', ean: '', scan_estado: null }])
        if (d.pedido.ya_subido) setScreen('ok')
        else setScreen('form')
      })
      .catch(() => { setError('Error de conexión'); setScreen('error') })
  }, [token])

  const escanearEtiqueta = async (idx: number, file: File) => {
    setItemScanLoading(idx)
    try {
      const code = await detectBarcode(file)
      if (code && ['code_128', 'data_matrix'].includes(code.format)) {
        const gs1 = parseGS1(code.raw)
        if (gs1.lote || gs1.caducidad) {
          setItems(ls => ls.map((x, j) => j === idx ? {
            ...x,
            ...(gs1.lote      ? { lote:     gs1.lote }      : {}),
            ...(gs1.caducidad ? { caducidad: gs1.caducidad } : {}),
            ...(gs1.gtin      ? { ean:      gs1.gtin.slice(1) } : {}),
            scan_estado: 'ok_codigo',
          } : x))
          setItemScanLoading(null)
          return
        }
      }
      if (code?.format === 'ean_13') {
        setItems(ls => ls.map((x, j) => j === idx ? { ...x, ean: code.raw } : x))
      }
      const b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload = () => res((r.result as string).split(',')[1])
        r.onerror = rej
        r.readAsDataURL(file)
      })
      const resp = await fetch('/api/asn/ocr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, image: { data: b64, mediaType: file.type || 'image/jpeg' }, modo: 'etiqueta' }),
      })
      const d = await resp.json()
      if (!d.ok) { setItems(ls => ls.map((x, j) => j === idx ? { ...x, scan_estado: 'revisar' } : x)); return }
      setItems(ls => ls.map((x, j) => j === idx ? {
        ...x,
        ...(d.lote           ? { lote:     d.lote }           : {}),
        ...(d.fecha_caducidad ? { caducidad: d.fecha_caducidad } : {}),
        ...(d.ean            ? { ean:      d.ean }             : {}),
        scan_estado: d.confianza === 'alta' ? 'ok_ia' : 'revisar',
      } : x))
    } catch { setItems(ls => ls.map((x, j) => j === idx ? { ...x, scan_estado: 'revisar' } : x))
    } finally { setItemScanLoading(null) }
  }

  const handleFotoAlbaran = async (file: File) => {
    setOcrLoading(true); setOcrMsg('')
    setOcrPreview(URL.createObjectURL(file))
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload = () => res((r.result as string).split(',')[1])
        r.onerror = rej
        r.readAsDataURL(file)
      })
      const resp = await fetch('/api/asn/ocr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, image: { data: b64, mediaType: file.type || 'image/jpeg' }, modo: 'albaran' }),
      })
      const d = await resp.json()
      if (!d.ok || !d.articulos?.length) { setOcrMsg(d.error ?? 'No se pudo leer. Rellena manualmente.'); return }
      setItems(d.articulos.map((a: { nombre: string; cantidad: number; unidad: string; precio_unitario?: number | null; lote?: string | null; fecha_caducidad?: string | null }) => ({
        articulo: a.nombre, cantidad: String(a.cantidad ?? ''), unidad: a.unidad ?? 'unidad',
        precio: a.precio_unitario != null ? String(a.precio_unitario) : '',
        lote: a.lote ?? '', caducidad: a.fecha_caducidad ?? '', ean: '', scan_estado: null,
      })))
      if (d.albaran) setAlbaran(d.albaran)
      setOcrMsg(`✅ IA extrajo ${d.articulos.length} artículo${d.articulos.length > 1 ? 's' : ''}. Revisa y confirma.`)
    } catch { setOcrMsg('Error al analizar. Rellena manualmente.')
    } finally { setOcrLoading(false) }
  }

  const enviar = async () => {
    if (!items.some(it => it.articulo.trim())) return
    setSending(true)
    try {
      const resp = await fetch('/api/asn', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          items: items.filter(it => it.articulo.trim()).map(it => ({
            articulo: it.articulo, cantidad: parseFloat(it.cantidad) || 0, unidad: it.unidad,
            precio: parseFloat(it.precio) || null, lote: it.lote || null,
            caducidad: it.caducidad || null, ean: it.ean || null,
          })),
          albaran, fechaEntrega, notas,
        }),
      })
      const d = await resp.json()
      if (!d.ok) { setToast(d.error ?? 'Error al enviar'); return }
      setScreen('ok')
    } catch { setToast('Error de conexión')
    } finally { setSending(false) }
  }

  const inp = (val: string, onChange: (v: string) => void, placeholder = '', type = 'text') => (
    <input type={type} value={val} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width:'100%', padding:'8px 10px', background:C.bg3, border:`1px solid ${C.rule}`,
        borderRadius:8, color:C.cream, fontFamily:'system-ui,sans-serif', fontSize:13,
        outline:'none', boxSizing:'border-box' as const }} />
  )

  const scanBadge = (estado: AsnItem['scan_estado']) => {
    if (!estado) return null
    const cfg = { ok_codigo: { bg:'#0A2E14', col:'#4ADE80', txt:'✅ GS1' }, ok_ia: { bg:'#0A1F2E', col:'#60A5FA', txt:'✅ IA' }, revisar: { bg:'#2E1A0A', col:'#FB923C', txt:'⚠️ Revisar' } }[estado]
    if (!cfg) return null
    return <span style={{ fontSize:10, padding:'2px 7px', borderRadius:10, background:cfg.bg, color:cfg.col, marginLeft:6 }}>{cfg.txt}</span>
  }

  if (screen === 'loading') return <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center' }}><div style={{ fontFamily:'Georgia,serif', fontStyle:'italic', color:C.creamDim }}>Cargando…</div></div>

  if (screen === 'error') return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:C.bg2, borderRadius:14, padding:32, maxWidth:340, textAlign:'center' }}>
        <div style={{ fontSize:32, marginBottom:12 }}>⚠️</div>
        <div style={{ fontFamily:'Georgia,serif', fontStyle:'italic', fontSize:18, color:C.cream, marginBottom:8 }}>Link no válido</div>
        <div style={{ fontFamily:'system-ui,sans-serif', fontSize:13, color:C.creamDim }}>{error || 'Este enlace ha caducado. Solicita un nuevo enlace al restaurante.'}</div>
      </div>
    </div>
  )

  if (screen === 'ok') return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:C.bg2, borderRadius:14, padding:32, maxWidth:340, textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>✅</div>
        <div style={{ fontFamily:'Georgia,serif', fontStyle:'italic', fontSize:20, color:C.cream, marginBottom:8 }}>Notificación recibida</div>
        <div style={{ fontFamily:'system-ui,sans-serif', fontSize:13, color:C.creamDim, lineHeight:1.6 }}>El restaurante ya tiene los datos de tu envío. La recepción se pre-cargará automáticamente.</div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:C.bg, color:C.cream }}>
      <div style={{ maxWidth:480, margin:'0 auto', padding:'24px 16px 48px' }}>

        <div style={{ marginBottom:24 }}>
          <div style={{ fontFamily:'Georgia,serif', fontStyle:'italic', fontSize:22, color:C.red, marginBottom:4 }}>ia.rest</div>
          <div style={{ fontFamily:'Georgia,serif', fontStyle:'italic', fontSize:17, color:C.cream }}>Notificar envío</div>
          {pedido && <div style={{ fontFamily:'system-ui,sans-serif', fontSize:12, color:C.creamDim, marginTop:4 }}>Pedido de <strong style={{ color:C.creamMid }}>{pedido.restaurante}</strong></div>}
        </div>

        {/* OCR albarán completo */}
        <div style={{ background:C.bg2, borderRadius:12, padding:'14px 16px', marginBottom:16, border:`1px solid ${C.rule}` }}>
          <div style={{ fontFamily:'system-ui,sans-serif', fontSize:11, color:C.creamDim, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:8 }}>📄 Foto del albarán completo (opcional)</div>
          {ocrPreview && <img src={ocrPreview} alt="albaran" style={{ width:'100%', maxHeight:100, objectFit:'cover', borderRadius:8, marginBottom:8 }} />}
          {ocrMsg && <div style={{ fontFamily:'system-ui,sans-serif', fontSize:12, marginBottom:8, padding:'6px 10px', background: ocrMsg.startsWith('✅') ? '#0A2E14' : '#2E1010', borderRadius:6, color: ocrMsg.startsWith('✅') ? '#4ADE80' : '#F87171' }}>{ocrMsg}</div>}
          <button onClick={() => fileRefAlbaran.current?.click()} disabled={ocrLoading}
            style={{ width:'100%', padding:'9px', background:'none', border:`1px dashed ${C.rule}`, borderRadius:8, color:C.creamDim, fontFamily:'system-ui,sans-serif', fontSize:12, cursor:'pointer' }}>
            {ocrLoading ? '⏳ Analizando…' : '📷 Hacer foto del albarán → IA extrae artículos'}
          </button>
          <input ref={fileRefAlbaran} type="file" accept="image/*" capture="environment" style={{ display:'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFotoAlbaran(f) }} />
        </div>

        {/* Artículos con escaneo por ítem */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontFamily:'system-ui,sans-serif', fontSize:11, color:C.creamDim, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:12 }}>
            Artículos que envías
          </div>

          {items.map((it, i) => (
            <div key={i} style={{ background:C.bg2, borderRadius:10, padding:'12px 14px', marginBottom:10, border:`1px solid ${C.rule}` }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                <div style={{ fontFamily:'system-ui,sans-serif', fontSize:10, color:C.creamDim }}>
                  ARTÍCULO {i + 1}{scanBadge(it.scan_estado ?? null)}
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={() => fileRefsItem.current[i]?.click()} disabled={itemScanLoading === i}
                    style={{ padding:'4px 10px', background: itemScanLoading === i ? C.bg3 : '#0A2214', border:`1px solid ${C.green}44`, borderRadius:6, color: itemScanLoading === i ? C.creamDim : '#4ADE80', fontFamily:'system-ui,sans-serif', fontSize:11, cursor:'pointer' }}>
                    {itemScanLoading === i ? '⏳' : '📷 Escanear etiqueta'}
                  </button>
                  <input ref={el => { fileRefsItem.current[i] = el }} type="file" accept="image/*" capture="environment" style={{ display:'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) escanearEtiqueta(i, f) }} />
                  {items.length > 1 && <button onClick={() => setItems(ls => ls.filter((_,j) => j !== i))} style={{ background:'none', border:'none', color:C.creamDim, cursor:'pointer' }}>✕</button>}
                </div>
              </div>

              <div style={{ marginBottom:8 }}>{inp(it.articulo, v => setItems(ls => ls.map((x,j) => j===i ? {...x, articulo:v} : x)), 'Nombre del artículo')}</div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginBottom:8 }}>
                <div>
                  <div style={{ fontFamily:'system-ui,sans-serif', fontSize:9, color:C.creamDim, marginBottom:3 }}>CANTIDAD</div>
                  {inp(it.cantidad, v => setItems(ls => ls.map((x,j) => j===i ? {...x, cantidad:v} : x)), '0', 'number')}
                </div>
                <div>
                  <div style={{ fontFamily:'system-ui,sans-serif', fontSize:9, color:C.creamDim, marginBottom:3 }}>UNIDAD</div>
                  {inp(it.unidad, v => setItems(ls => ls.map((x,j) => j===i ? {...x, unidad:v} : x)), 'kg')}
                </div>
                <div>
                  <div style={{ fontFamily:'system-ui,sans-serif', fontSize:9, color:C.creamDim, marginBottom:3 }}>€/UNIDAD</div>
                  {inp(it.precio, v => setItems(ls => ls.map((x,j) => j===i ? {...x, precio:v} : x)), '0.00', 'number')}
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                <div>
                  <div style={{ fontFamily:'system-ui,sans-serif', fontSize:9, color: it.lote ? '#4ADE80' : C.creamDim, marginBottom:3 }}>LOTE {it.lote ? '✓' : ''}</div>
                  {inp(it.lote, v => setItems(ls => ls.map((x,j) => j===i ? {...x, lote:v} : x)), 'L2601A')}
                </div>
                <div>
                  <div style={{ fontFamily:'system-ui,sans-serif', fontSize:9, color: it.caducidad ? '#4ADE80' : C.creamDim, marginBottom:3 }}>CADUCA {it.caducidad ? '✓' : ''}</div>
                  {inp(it.caducidad, v => setItems(ls => ls.map((x,j) => j===i ? {...x, caducidad:v} : x)), '', 'date')}
                </div>
              </div>
              {it.ean && <div style={{ marginTop:6, fontFamily:'monospace', fontSize:10, color:C.creamDim }}>EAN: {it.ean}</div>}

              {!it.lote && !it.caducidad && (
                <div style={{ marginTop:8, fontFamily:'system-ui,sans-serif', fontSize:11, color:C.creamDim, background:C.bg3, borderRadius:6, padding:'6px 10px', lineHeight:1.4 }}>
                  Pulsa "Escanear etiqueta" para leer lote y caducidad automáticamente.<br/>
                  Si la caja tiene código GS1-128 → 1 segundo. Si no → IA lo extrae del texto.
                </div>
              )}
            </div>
          ))}

          <button onClick={() => setItems(ls => [...ls, { articulo:'', cantidad:'', unidad:'unidad', precio:'', lote:'', caducidad:'', ean:'', scan_estado: null }])}
            style={{ width:'100%', padding:'8px', background:'none', border:`1px dashed ${C.rule}`, borderRadius:8, color:C.creamDim, fontFamily:'system-ui,sans-serif', fontSize:12, cursor:'pointer' }}>
            + Añadir otro artículo
          </button>
        </div>

        {/* Datos del envío */}
        <div style={{ background:C.bg2, borderRadius:12, padding:'14px 16px', marginBottom:20, border:`1px solid ${C.rule}` }}>
          <div style={{ fontFamily:'system-ui,sans-serif', fontSize:11, color:C.creamDim, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:10 }}>Datos del envío (opcionales)</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
            <div>
              <div style={{ fontFamily:'system-ui,sans-serif', fontSize:9, color:C.creamDim, marginBottom:3 }}>Nº ALBARÁN</div>
              {inp(albaran, setAlbaran, 'ALB-2026-001')}
            </div>
            <div>
              <div style={{ fontFamily:'system-ui,sans-serif', fontSize:9, color:C.creamDim, marginBottom:3 }}>FECHA ENTREGA</div>
              {inp(fechaEntrega, setFechaEntrega, '', 'date')}
            </div>
          </div>
          <div style={{ fontFamily:'system-ui,sans-serif', fontSize:9, color:C.creamDim, marginBottom:3 }}>NOTAS</div>
          <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Alguna aclaración…" rows={2}
            style={{ width:'100%', padding:'8px 10px', background:C.bg3, border:`1px solid ${C.rule}`, borderRadius:8, color:C.cream, fontFamily:'system-ui,sans-serif', fontSize:13, outline:'none', resize:'vertical', boxSizing:'border-box' as const }} />
        </div>

        {toast && <div style={{ background:'#2E1010', borderRadius:8, padding:'10px 14px', fontFamily:'system-ui,sans-serif', fontSize:12, color:'#F87171', marginBottom:12 }}>{toast}</div>}

        <button onClick={enviar} disabled={sending} style={{ width:'100%', padding:'14px', background: sending ? C.bg3 : C.red, border:'none', borderRadius:12, color:C.cream, fontFamily:'system-ui,sans-serif', fontSize:14, fontWeight:700, cursor: sending ? 'default' : 'pointer' }}>
          {sending ? 'Enviando…' : '✓ Confirmar notificación de envío'}
        </button>

        <div style={{ marginTop:12, fontFamily:'system-ui,sans-serif', fontSize:11, color:C.creamDim, textAlign:'center', lineHeight:1.5 }}>
          Portal gestionado por <strong style={{ color:C.creamMid }}>ia.rest</strong> · Tus datos solo se usan para gestionar este pedido
        </div>
      </div>
    </div>
  )
}
