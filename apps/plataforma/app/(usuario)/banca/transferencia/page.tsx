'use client'

import { useMemo, useState } from 'react'
import { eur } from '@/lib/dinero'

// Formulario de transferencia SEPA "libre". El dueño teclea destinatario/IBAN/importe (la IA NO
// interviene), CONFIRMA un resumen con las cifras exactas, y solo entonces se ordena. Con PIS
// activo el banco devuelve un enlace para firmar (SCA); sin PIS, un SEPA XML para importar a mano.

type Resultado =
  | { modo: 'pis'; auth_url: string; payment_id: string }
  | { modo: 'sepa_xml'; xml: string }

const box: React.CSSProperties = {
  maxWidth: 520,
  margin: '0 auto',
  padding: 16,
}
const label: React.CSSProperties = { display: 'block', fontSize: 13, color: 'var(--muted, #667)', marginBottom: 4, marginTop: 12 }
const input: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 44,
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: 16,
}
const btn: React.CSSProperties = {
  width: '100%',
  minHeight: 44,
  borderRadius: 10,
  border: 'none',
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
  marginTop: 16,
}

export default function TransferenciaPage() {
  const [nombre, setNombre] = useState('')
  const [iban, setIban] = useState('')
  const [importe, setImporte] = useState('')
  const [concepto, setConcepto] = useState('')
  const [fase, setFase] = useState<'form' | 'confirmar'>('form')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)

  const importeNum = useMemo(() => Number(importe.replace(',', '.')), [importe])
  const formOk = nombre.trim() && iban.replace(/\s/g, '').length >= 15 && Number.isFinite(importeNum) && importeNum > 0

  async function enviar() {
    setCargando(true)
    setError(null)
    try {
      const res = await fetch('/api/banca/transferencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creditorName: nombre, creditorIban: iban, importe, concepto }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data?.error ?? 'No se pudo ordenar la transferencia.'); setFase('form'); return }
      setResultado(data as Resultado)
    } catch {
      setError('Error de red. Reinténtalo.')
      setFase('form')
    } finally {
      setCargando(false)
    }
  }

  function descargarXml(xml: string) {
    const blob = new Blob([xml], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transferencia-${new Date().toISOString().slice(0, 10)}.xml`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Resultado ────────────────────────────────────────────────────────────
  if (resultado) {
    return (
      <div style={box}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Transferencia ordenada</h1>
        <p style={{ color: 'var(--muted, #667)' }}>
          {eur(Math.round(importeNum * 100) / 100)} → <b>{nombre}</b>
        </p>
        {resultado.modo === 'pis' ? (
          <>
            <p style={{ marginTop: 16 }}>Falta el último paso: <b>fírmala en tu banco</b>.</p>
            <a href={resultado.auth_url} target="_blank" rel="noreferrer"
               style={{ ...btn, display: 'block', textAlign: 'center', lineHeight: '44px', background: 'var(--primary)', color: '#fff', textDecoration: 'none' }}>
              🔐 Firmar en el banco
            </a>
          </>
        ) : (
          <>
            <p style={{ marginTop: 16 }}>
              El pago automático (PIS) no está activo, así que te he generado el <b>fichero SEPA XML</b>
              {' '}para importarlo en la web de tu banco.
            </p>
            <button onClick={() => descargarXml(resultado.xml)}
                    style={{ ...btn, background: 'var(--primary)', color: '#fff' }}>
              ⬇️ Descargar SEPA XML
            </button>
          </>
        )}
        <button onClick={() => { setResultado(null); setFase('form'); setNombre(''); setIban(''); setImporte(''); setConcepto('') }}
                style={{ ...btn, background: 'transparent', color: 'var(--primary)', border: '1px solid var(--border)' }}>
          Nueva transferencia
        </button>
      </div>
    )
  }

  // ── Confirmación ─────────────────────────────────────────────────────────
  if (fase === 'confirmar') {
    return (
      <div style={box}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>¿Confirmas la transferencia?</h1>
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: 'var(--surface)', marginTop: 12 }}>
          <Fila k="Destinatario" v={nombre} />
          <Fila k="IBAN" v={iban.replace(/\s/g, '').toUpperCase()} />
          <Fila k="Importe" v={eur(Math.round(importeNum * 100) / 100)} destacado />
          <Fila k="Concepto" v={concepto.trim() || `Transferencia a ${nombre}`} />
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted, #667)', marginTop: 12 }}>
          Revisa bien el IBAN y el importe. Nada sale de tu cuenta hasta que lo firmes en el banco.
        </p>
        <button disabled={cargando} onClick={enviar}
                style={{ ...btn, background: 'var(--primary)', color: '#fff', opacity: cargando ? 0.6 : 1 }}>
          {cargando ? 'Ordenando…' : '✅ Sí, ordenar'}
        </button>
        <button disabled={cargando} onClick={() => setFase('form')}
                style={{ ...btn, background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', marginTop: 8 }}>
          Volver
        </button>
      </div>
    )
  }

  // ── Formulario ───────────────────────────────────────────────────────────
  return (
    <div style={box}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Nueva transferencia</h1>
      <p style={{ fontSize: 13, color: 'var(--muted, #667)' }}>
        Transferencia SEPA a cualquier destinatario. Confirmas antes de enviar y la firmas en tu banco.
      </p>

      <label style={label}>Destinatario</label>
      <input style={input} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre de quien cobra" />

      <label style={label}>IBAN del destinatario</label>
      <input style={input} value={iban} onChange={e => setIban(e.target.value)} placeholder="ES00 0000 0000 0000 0000 0000" autoCapitalize="characters" />

      <label style={label}>Importe (€)</label>
      <input style={input} value={importe} onChange={e => setImporte(e.target.value)} inputMode="decimal" placeholder="0,00" />

      <label style={label}>Concepto (opcional)</label>
      <input style={input} value={concepto} onChange={e => setConcepto(e.target.value)} placeholder="Motivo de la transferencia" maxLength={140} />

      {error && <p style={{ color: 'var(--negative)', marginTop: 12, fontSize: 14 }}>⚠️ {error}</p>}

      <button disabled={!formOk} onClick={() => { setError(null); setFase('confirmar') }}
              style={{ ...btn, background: formOk ? 'var(--primary)' : 'var(--border)', color: '#fff', cursor: formOk ? 'pointer' : 'not-allowed' }}>
        Continuar
      </button>
    </div>
  )
}

function Fila({ k, v, destacado }: { k: string; v: string; destacado?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border, #eee)' }}>
      <span style={{ color: 'var(--muted, #667)', fontSize: 14 }}>{k}</span>
      <span style={{ textAlign: 'right', fontWeight: destacado ? 700 : 500, fontSize: destacado ? 18 : 14, wordBreak: 'break-all' }}>{v}</span>
    </div>
  )
}
