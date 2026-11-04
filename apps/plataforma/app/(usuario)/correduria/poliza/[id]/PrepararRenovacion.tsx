'use client'
import { useState } from 'react'

import { btnStyle } from '@/components/ui'
import { eur } from '@/lib/dinero'

/**
 * «Preparar renovación con alternativas» (04/11/2026, Alberto). Gratis: abre/reutiliza la oportunidad de la póliza,
 * completa la vivienda con el Catastro (hogar; solo lo vacío y nunca un dato confirmado), pone la renovación actual con la
 * prima de los RECIBOS y las alternativas (bots + Avant2 ya guardados) y deja un BORRADOR. Te llega el Telegram con
 * ✅ / 👁 / ✏️; aquí tienes lo mismo.
 *
 * 🚨 Nada sale al cliente sin pulsar «Enviar al cliente por la app» (o el ✅ del Telegram). Si el tomador no usa la app,
 * no se ofrece (503 `canal_no_disponible`): se dice y se manda por correo/WhatsApp desde la ficha.
 * 🚨 Elegir en la app NO emite nada: te avisa y tú confirmas con la compañía.
 */
type Opcion = { id: string; compania: string; producto: string; primaEur: number; franquiciaEur: number | null; nivel: string | null; diferenciaEur: number | null; sentido: 'mas_barata' | 'mas_cara' | 'igual' | null }
type Preparada = {
  estado: 'creado' | 'ya_existe'
  presupuestoId: string
  referencia: string | null
  actual: { compania: string | null; prima: number | null; deRecibo: boolean; vence: string | null }
  opciones: Opcion[]
  niveles: string[]
  catastro: { estado: string; anadidos?: string[]; distintos?: string[] }
  destinatarios: { publicable: boolean; lineas: string[] }
  sinRevisar: number
  telegram: boolean
}
type Fase =
  | { f: 'reposo' } | { f: 'preparando' } | { f: 'lista'; d: Preparada } | { f: 'publicando'; d: Preparada }
  | { f: 'publicada'; d: Preparada; ya: boolean } | { f: 'error'; texto: string; d?: Preparada }

const ETIQUETA_CAMPO: Record<string, string> = { referenciaCatastral: 'referencia catastral', cp: 'código postal', metrosCuadrados: 'superficie', anioConstruccion: 'año de construcción' }

function textoCatastro(c: Preparada['catastro']): string | null {
  switch (c.estado) {
    case 'no_aplica': return null
    case 'completada': {
      const a = (c.anadidos ?? []).map((k) => ETIQUETA_CAMPO[k] ?? k)
      const d = (c.distintos ?? []).map((k) => ETIQUETA_CAMPO[k] ?? k)
      return `${a.length ? `Del Catastro (sin confirmar): ${a.join(', ')}.` : 'Catastro consultado: no faltaba nada.'}${d.length ? ` El Catastro dice otra cosa en: ${d.join(', ')} (no se ha tocado).` : ''}`
    }
    case 'confirmada': return 'La vivienda ya está confirmada: el Catastro no la toca.'
    case 'otra_referencia': return 'La vivienda tiene otra referencia catastral guardada: el Catastro no la toca (revísalo).'
    case 'sin_datos_para_buscar': return 'Catastro sin consultar: falta la referencia o la calle con número, municipio y provincia.'
    case 'varios': return 'Catastro: varios inmuebles en esa dirección; elígelo en el riesgo.'
    case 'ninguno': case 'no_encontrado': return 'Catastro: no encuentra esa vivienda (no significa que no exista).'
    default: return 'Catastro: no ha respondido. No significa que no haya datos.'
  }
}

function diferencia(o: Opcion): string | null {
  if (o.diferenciaEur === null || o.sentido === null) return null
  if (o.sentido === 'igual') return 'igual que la renovación'
  return `${eur(Math.abs(o.diferenciaEur))} ${o.sentido === 'mas_barata' ? 'menos' : 'más'}`
}

export default function PrepararRenovacion({ polizaId }: { polizaId: string }) {
  const [fase, setFase] = useState<Fase>({ f: 'reposo' })

  async function preparar() {
    setFase({ f: 'preparando' })
    try {
      const r = await fetch('/api/correduria/renovacion/preparar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ polizaId }) })
      const j = (await r.json().catch(() => null)) as (Preparada & { motivo?: string }) | null
      if (r.ok && j && (j.estado === 'creado' || j.estado === 'ya_existe')) setFase({ f: 'lista', d: j })
      else setFase({ f: 'error', texto: j?.motivo ?? `No se ha podido preparar (HTTP ${r.status}). No se ha enviado nada.` })
    } catch {
      setFase({ f: 'error', texto: 'No se ha podido preparar (red). No se ha enviado nada.' })
    }
  }

  async function verComoCliente(presupuestoId: string) {
    // El enlace es de un solo uso: se abre la pestaña ANTES del fetch (si no, el navegador lo bloquea).
    const ventana = window.open('', '_blank')
    try {
      const r = await fetch('/api/correduria/presupuesto/vista-cliente', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ presupuestoId }) })
      const j = (await r.json().catch(() => null)) as { estado?: string; url?: string; motivo?: string } | null
      if (j?.estado === 'ok' && typeof j.url === 'string' && ventana) ventana.location.href = j.url
      else { ventana?.close(); alert(j?.motivo ?? 'No se ha podido abrir la vista previa.') }
    } catch {
      ventana?.close()
    }
  }

  async function publicar(d: Preparada) {
    if (!confirm('Se publica en la app del cliente y le llega el aviso. Das por revisados los precios y coberturas. ¿Seguro?')) return
    setFase({ f: 'publicando', d })
    try {
      const r = await fetch('/api/correduria/renovacion/publicar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ presupuestoId: d.presupuestoId }) })
      const j = (await r.json().catch(() => null)) as { estado?: string; motivo?: string } | null
      if (r.ok && (j?.estado === 'publicado' || j?.estado === 'ya_publicado')) setFase({ f: 'publicada', d, ya: j.estado === 'ya_publicado' })
      else if (r.status === 503 && j?.estado === 'canal_no_disponible') setFase({ f: 'error', d, texto: j.motivo ?? 'El tomador no usa la app: no se ha publicado.' })
      else setFase({ f: 'error', d, texto: j?.motivo ?? 'No sé si se ha publicado (fallo). Recarga y mira los presupuestos antes de repetir.' })
    } catch {
      setFase({ f: 'error', d, texto: 'No sé si se ha publicado (red). Recarga y mira los presupuestos antes de repetir.' })
    }
  }

  const d = fase.f === 'lista' || fase.f === 'publicando' || fase.f === 'publicada' ? fase.d : fase.f === 'error' ? fase.d : undefined
  const cat = d ? textoCatastro(d.catastro) : null

  return (
    <section id="renovacion" style={{ margin: '16px 0', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      <h3 style={{ margin: 0 }}>Renovación con alternativas</h3>
      {!d && (
        <div>
          <button type="button" style={btnStyle('primario')} disabled={fase.f === 'preparando'} onClick={() => void preparar()}>
            {fase.f === 'preparando' ? 'Preparando… (Catastro y precios)' : 'Preparar renovación con alternativas'}
          </button>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted)' }}>Gratis: no pide precio ni usa IA. Deja un borrador y te llega por Telegram para revisarlo. No sale nada al cliente.</p>
        </div>
      )}
      {d && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
          <p style={{ margin: 0 }}>
            <strong>Tu renovación actual</strong>{d.actual.compania ? ` (${d.actual.compania})` : ''}: {d.actual.prima === null ? <em>prima no consta</em> : eur(d.actual.prima)}
            {d.actual.prima !== null && d.actual.deRecibo ? ' (del recibo)' : ''}{d.referencia ? ` · ${d.referencia}` : ''}
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 300 }}>
              <thead><tr><th style={{ textAlign: 'left', padding: 6 }}>Alternativa</th><th style={{ textAlign: 'right', padding: 6 }}>Prima</th><th style={{ textAlign: 'right', padding: 6 }}>Vs. renovación</th></tr></thead>
              <tbody>
                {d.opciones.map((o) => (
                  <tr key={o.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 6 }}>{o.compania} — {o.producto}{o.nivel ? <span style={{ color: 'var(--muted)' }}> · {o.nivel}</span> : null}{o.franquiciaEur !== null ? <span style={{ color: 'var(--muted)' }}> · franquicia {eur(o.franquiciaEur)}</span> : null}</td>
                    <td style={{ padding: 6, textAlign: 'right', whiteSpace: 'nowrap' }}>{eur(o.primaEur)}</td>
                    <td style={{ padding: 6, textAlign: 'right', whiteSpace: 'nowrap', color: o.sentido === 'mas_barata' ? 'var(--positive)' : undefined }}>{diferencia(o) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {d.niveles.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{d.niveles.map((n) => <li key={n}>{n}</li>)}</ul>}
          {cat && <p style={{ margin: 0, fontSize: 13 }}>🏠 {cat}</p>}
          {d.destinatarios.lineas.map((l) => <p key={l} style={{ margin: 0, fontSize: 13, color: d.destinatarios.publicable ? undefined : 'var(--warning)' }}>{l}</p>)}
          {d.sinRevisar > 0 && <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Al enviar das por revisadas {d.sinRevisar === 1 ? 'la oferta' : `las ${d.sinRevisar} ofertas`} (precio y coberturas). Elegir en la app no emite nada.</p>}
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>{d.telegram ? 'Te ha llegado también por Telegram (✅ / 👁 / ✏️).' : 'El Telegram de revisión no ha salido: usa estos botones.'}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" style={btnStyle('secundario')} onClick={() => void verComoCliente(d.presupuestoId)}>👁 Ver como el cliente</button>
            {fase.f !== 'publicada' && d.destinatarios.publicable && (
              <button type="button" style={btnStyle('primario')} disabled={fase.f === 'publicando'} onClick={() => void publicar(d)}>
                {fase.f === 'publicando' ? 'Publicando…' : 'Enviar al cliente por la app'}
              </button>
            )}
            {fase.f !== 'publicando' && fase.f !== 'publicada' && <button type="button" style={btnStyle('sutil')} onClick={() => void preparar()}>Rehacer</button>}
          </div>
          {fase.f === 'publicada' && <p style={{ margin: 0, color: 'var(--positive)' }}>{fase.ya ? 'Ya estaba publicado.' : 'Publicado en su app: le llega el aviso.'}</p>}
        </div>
      )}
      {fase.f === 'error' && <p style={{ margin: 0, color: 'var(--negative)' }}>{fase.texto}</p>}
    </section>
  )
}
