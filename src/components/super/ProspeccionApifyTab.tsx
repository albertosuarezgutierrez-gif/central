'use client'

import { useCallback, useEffect, useState } from 'react'
import { C, SE, SN, SM } from '@/lib/colors'

type Run = {
  id: string
  vertical: string
  query: string
  status: string
  items_total: number | null
  items_ingestados: number | null
  started_at: string | null
  finished_at: string | null
}

type Data = {
  configurado: boolean
  runs: Run[]
  leads_apify: number
  leads_apify_con_email: number
}

const COLOR_ESTADO: Record<string, string> = {
  pending: C.amber,
  ingested: C.green,
  failed: C.red,
}

export default function ProspeccionApifyTab({ session }: { session: unknown }) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [lanzando, setLanzando] = useState(false)
  const [enviandoMail, setEnviandoMail] = useState(false)
  const [msg, setMsg] = useState<string>('')

  const headers = useCallback(
    () => ({ 'Content-Type': 'application/json', 'x-ia-session': JSON.stringify(session) }),
    [session]
  )

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/super/prospeccion-apify', { headers: headers() })
      if (r.ok) setData(await r.json())
    } catch { /* noop */ } finally {
      setLoading(false)
    }
  }, [headers])

  useEffect(() => { cargar() }, [cargar])

  const lanzar = async () => {
    setLanzando(true); setMsg('')
    try {
      const r = await fetch('/api/super/prospeccion-apify', { method: 'POST', headers: headers() })
      const j = await r.json()
      setMsg(j.skipped ? `Saltado: ${j.skipped}` : j.error ? `Error: ${j.error}` : `Fase ${j.fase || '—'}: ${j.lanzado || (j.insertados != null ? `${j.insertados} leads de ${j.total}` : j.status || 'ok')}`)
      await cargar()
    } catch (e) {
      setMsg(`Error: ${e instanceof Error ? e.message : 'desconocido'}`)
    } finally {
      setLanzando(false)
    }
  }

  const enviarMails = async () => {
    setEnviandoMail(true); setMsg('')
    try {
      const r = await fetch('/api/super/lead-hunter-sevilla', { method: 'POST', headers: headers() })
      const j = await r.json()
      setMsg(j.error ? `Error: ${j.error}` : `📧 Emails enviados: ${j.enviados ?? 0}${j.motivo ? ` (${j.motivo})` : ''}`)
      await cargar()
    } catch (e) {
      setMsg(`Error: ${e instanceof Error ? e.message : 'desconocido'}`)
    } finally {
      setEnviandoMail(false)
    }
  }

  return (
    <div style={{ padding: '24px 0', maxWidth: 920 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <h1 style={{ fontFamily: SE, fontSize: 34, fontWeight: 500, margin: 0, color: C.ink }}>Apify Sevilla</h1>
        <span style={{
          fontFamily: SM, fontSize: 11, padding: '3px 10px', borderRadius: 20,
          background: data?.configurado ? `${C.green}20` : `${C.red}20`,
          color: data?.configurado ? C.green : C.red,
        }}>
          {data ? (data.configurado ? 'APIFY_TOKEN OK' : 'falta APIFY_TOKEN') : '…'}
        </span>
      </div>
      <p style={{ fontFamily: SN, fontSize: 14, color: C.ink3, margin: '0 0 20px' }}>
        Sourcing de catering, haciendas y restaurantes en Sevilla (Google Places). Lanza una vuelta del agente o revisa las últimas ejecuciones.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        {[
          ['Leads de Apify', data?.leads_apify ?? '—'],
          ['Con email', data?.leads_apify_con_email ?? '—'],
        ].map(([l, v]) => (
          <div key={String(l)} style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '14px 22px' }}>
            <div style={{ fontFamily: SE, fontSize: 26, color: C.ink }}>{v}</div>
            <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <button onClick={lanzar} disabled={lanzando}
          style={{ background: lanzando ? C.bg3 : C.red, color: '#fff', border: 'none', borderRadius: 8, padding: '11px 22px', fontFamily: SN, fontWeight: 700, fontSize: 14, cursor: lanzando ? 'default' : 'pointer' }}>
          {lanzando ? 'Lanzando…' : '🔍 Lanzar una vuelta'}
        </button>
        <button onClick={enviarMails} disabled={enviandoMail}
          style={{ background: enviandoMail ? C.bg3 : C.green, color: '#fff', border: 'none', borderRadius: 8, padding: '11px 22px', fontFamily: SN, fontWeight: 700, fontSize: 14, cursor: enviandoMail ? 'default' : 'pointer' }}>
          {enviandoMail ? 'Enviando…' : '📧 Enviar emails de venta'}
        </button>
        <button onClick={cargar} disabled={loading}
          style={{ background: 'transparent', color: C.ink3, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '11px 18px', fontFamily: SN, fontSize: 13, cursor: 'pointer' }}>
          {loading ? '…' : '↻ Refrescar'}
        </button>
        {msg && <span style={{ fontFamily: SN, fontSize: 13, color: C.ink2 }}>{msg}</span>}
      </div>

      <div style={{ border: `1px solid ${C.rule}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 90px 70px 150px', gap: 0, background: C.bg2, padding: '10px 14px', fontFamily: SM, fontSize: 11, color: C.ink3, letterSpacing: '.05em' }}>
          <div>VERTICAL</div><div>QUERY</div><div>ESTADO</div><div>LEADS</div><div>INICIO</div>
        </div>
        {(data?.runs ?? []).map((r) => (
          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 90px 70px 150px', gap: 0, padding: '10px 14px', borderTop: `1px solid ${C.rule}`, fontFamily: SN, fontSize: 13, color: C.ink2, alignItems: 'center' }}>
            <div>{r.vertical}</div>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>{r.query}</div>
            <div style={{ color: COLOR_ESTADO[r.status] || C.ink3, fontWeight: 600 }}>{r.status}</div>
            <div>{r.items_ingestados ?? '—'}{r.items_total != null ? `/${r.items_total}` : ''}</div>
            <div style={{ color: C.ink3, fontSize: 12 }}>{r.started_at ? new Date(r.started_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</div>
          </div>
        ))}
        {(!data || data.runs.length === 0) && (
          <div style={{ padding: '16px 14px', fontFamily: SN, fontSize: 13, color: C.ink3, borderTop: `1px solid ${C.rule}` }}>
            Sin ejecuciones todavía.
          </div>
        )}
      </div>
    </div>
  )
}
