'use client'

// «Propuesta con varios escenarios» (07/10/2026): el corredor marca 2 o más presupuestos vigentes de ESTE riesgo
// y los junta en un documento (un bloque por escenario, etiqueta sacada de las figuras, «la más económica»).
// Preparar NO avisa a nadie (borrador). El aviso lo pulsa Alberto en dos pasos: «Enviar por correo…» enseña a
// quién va (un aviso por TOMADOR: el portal solo enseña un presupuesto a su tomador) y «Enviar ahora» lo manda.

import { useCallback, useEffect, useState } from 'react'
import { Badge, btnStyle, cardStyle } from '@/components/ui'
import { eur } from '@/lib/dinero'
import { estadoPresupuestoVariante, type Riesgo } from '@/lib/riesgo-asegura'
import {
  interpretarPropuestas, presupuestoSeleccionable, resumenAviso, type GrupoAvisoPantalla, type LecturaPropuestas, type Propuesta,
} from '@/lib/propuesta-escenarios-asegura'
import { fechaEs } from './piezas-riesgo'

const MAX = 6
const API = '/api/correduria/presupuesto/propuesta'

async function llamar(method: 'POST' | 'PATCH', body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown> | null }> {
  try {
    const res = await fetch(API, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { status: res.status, json: (await res.json().catch(() => null)) as Record<string, unknown> | null }
  } catch {
    return { status: 0, json: null }
  }
}

const detalleDe = (r: { status: number; json: Record<string, unknown> | null }) =>
  r.status === 0
    ? 'No se ha podido hablar con el servidor. No se sabe si se ha guardado: recarga antes de repetir.'
    : (typeof r.json?.detalle === 'string' && r.json.detalle) || (typeof r.json?.motivo === 'string' && r.json.motivo) || `HTTP ${r.status}`

export default function PropuestaEscenarios({ riesgo }: { riesgo: Riesgo }) {
  const op = riesgo.oportunidad
  const candidatas = riesgo.variantes.filter((v) => !v.simulado && presupuestoSeleccionable(v.presupuesto))
  const [marcados, setMarcados] = useState<string[]>([])
  const [lectura, setLectura] = useState<LecturaPropuestas | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  const leer = useCallback(async () => {
    try {
      const res = await fetch(`${API}?oportunidadId=${encodeURIComponent(op.id)}`, { cache: 'no-store' })
      setLectura(interpretarPropuestas(res.status, await res.json().catch(() => null)))
    } catch {
      setLectura({ estado: 'error', motivo: 'sin conexión' })
    }
  }, [op.id])
  useEffect(() => { void leer() }, [leer])

  // Solo cuentan las marcadas que siguen siendo candidatas (tras releer el riesgo, una puede haber dejado de serlo).
  const vigentes = marcados.filter((id) => candidatas.some((v) => v.presupuesto?.id === id))
  const marcar = (id: string) => setMarcados((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : xs.length >= MAX ? xs : [...xs, id]))

  async function preparar() {
    setOcupado(true)
    const r = await llamar('POST', { oportunidadId: op.id, presupuestoIds: vigentes })
    setOcupado(false)
    if (r.status !== 200 || r.json?.estado !== 'ok') { setAviso({ ok: false, texto: `No se ha preparado: ${detalleDe(r)}` }); return }
    setMarcados([])
    setAviso({ ok: true, texto: `Propuesta ${String(r.json.referencia)} preparada como borrador. No se ha avisado a nadie.` })
    await leer()
  }

  if (candidatas.length < 2 && (lectura?.estado !== 'ok' || lectura.propuestas.length === 0)) return null

  return (
    <section aria-labelledby="propuesta-escenarios-titulo" style={{ ...cardStyle, display: 'grid', gap: 10, minWidth: 0 }}>
      <div>
        <div id="propuesta-escenarios-titulo" style={{ fontSize: 14, fontWeight: 600 }}>Propuesta con varios escenarios</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
          Junta en un solo documento presupuestos de este riesgo con distintas personas (otro tomador, otro conductor…). Preparar no avisa a nadie.
        </div>
      </div>

      {aviso && (
        <div role="status" style={{ fontSize: 13, color: aviso.ok ? 'var(--text)' : 'var(--negative)', borderLeft: `3px solid ${aviso.ok ? 'var(--positive)' : 'var(--negative)'}`, paddingLeft: 8 }}>
          {aviso.texto}
        </div>
      )}

      {candidatas.length >= 2 && (
        <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {candidatas.map((v) => {
              const id = v.presupuesto!.id
              return (
                <li key={v.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '4px 10px', minWidth: 0 }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44, cursor: 'pointer', flexWrap: 'wrap', fontSize: 13 }}>
                    <input type="checkbox" checked={vigentes.includes(id)} onChange={() => marcar(id)} style={{ width: 20, height: 20 }}
                      disabled={!vigentes.includes(id) && vigentes.length >= MAX} />
                    <strong>{v.referencia}</strong>
                    <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>Tomador: {v.tomador.nombre ?? 'no consta'}</span>
                    <span style={{ color: 'var(--muted)' }}>· {v.mejor ? `desde ${eur(v.mejor.primaEur)}` : 'sin precio'}</span>
                    <Badge tono="info">{estadoPresupuestoVariante(v.presupuesto) ?? 'Sin preparar'}</Badge>
                  </label>
                </li>
              )
            })}
          </ul>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" onClick={() => void preparar()} disabled={ocupado || vigentes.length < 2}
              style={{ ...btnStyle('primario', 'md'), minHeight: 44, maxWidth: '100%', whiteSpace: 'normal', height: 'auto' }}>
              {ocupado ? 'Preparando…' : `Preparar propuesta${vigentes.length >= 2 ? ` (${vigentes.length})` : ''}`}
            </button>
            {vigentes.length < 2 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Marca al menos dos presupuestos.</span>}
          </div>
        </div>
      )}

      {lectura === null ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Leyendo propuestas…</p>
      ) : lectura.estado === 'sin_tabla' ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>{lectura.detalle}</p>
      ) : lectura.estado === 'error' ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--negative)' }}>No se han podido leer las propuestas ({lectura.motivo}). No es que no haya: no se han podido mirar.</p>
      ) : (
        lectura.propuestas.map((p) => <TarjetaPropuesta key={p.id} p={p} onCambio={() => void leer()} />)
      )}
    </section>
  )
}

function estadoAviso(p: Propuesta): { texto: string; tono: 'neutral' | 'info' | 'positivo' | 'negativo' } {
  if (p.retiradaAt) return { texto: 'Retirada', tono: 'negativo' }
  if (p.canalAviso === 'email') return { texto: `Avisada por correo · ${fechaEs(p.avisadoAt) ?? ''}`, tono: 'positivo' }
  if (p.canalAviso === 'whatsapp_enlace') return { texto: `WhatsApp abierto · ${fechaEs(p.avisadoAt) ?? ''} (confirma si salió)`, tono: 'info' }
  return { texto: 'Borrador · no se ha avisado a nadie', tono: 'neutral' }
}

/** A quién irá cada aviso: uno por TOMADOR (identidad = su ficha), con sus escenarios. */
/** `enlazado` = algún escenario suyo tiene el WhatsApp abierto y sin confirmar (su botón «Ya lo he mandado»). */
function destinatarios(p: Propuesta): Array<{ clienteId: string; nombre: string; numeros: number[]; enlazado: boolean }> {
  const out: Array<{ clienteId: string; nombre: string; numeros: number[]; enlazado: boolean }> = []
  for (const e of p.escenarios) {
    const g = out.find((x) => x.clienteId === e.tomador.clienteId)
    if (g) { g.numeros.push(e.numero); g.enlazado ||= e.estado === 'enlazado' }
    else out.push({ clienteId: e.tomador.clienteId, nombre: e.tomador.nombre ?? 'tomador sin nombre', numeros: [e.numero], enlazado: e.estado === 'enlazado' })
  }
  return out
}

function TarjetaPropuesta({ p, onCambio }: { p: Propuesta; onCambio: () => void }) {
  const [confirmando, setConfirmando] = useState<'email' | 'whatsapp_enlace' | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string; grupos: GrupoAvisoPantalla[] } | null>(null)
  const est = estadoAviso(p)
  const viva = !p.retiradaAt

  async function accion(body: Record<string, unknown>) {
    setOcupado(true)
    const r = await llamar('PATCH', { id: p.id, ...body })
    setOcupado(false)
    setConfirmando(null)
    if (body.accion === 'avisar') setResultado(resumenAviso(r.status, r.json))
    else setResultado({ ok: r.status === 200, texto: r.status === 200 ? 'Hecho.' : `No se ha podido: ${detalleDe(r)}`, grupos: [] })
    onCambio()
  }

  return (
    <article style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, display: 'grid', gap: 8, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <strong style={{ fontSize: 15 }}>{p.referencia}</strong>
        {p.creadoAt && <span style={{ color: 'var(--muted)', fontSize: 13 }}>{fechaEs(p.creadoAt)}</span>}
        <Badge tono={est.tono}>{est.texto}</Badge>
      </div>
      <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 13 }}>
        {p.escenarios.map((e) => (
          <li key={e.presupuestoId} style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span>{e.etiqueta}</span>
              <span style={{ color: 'var(--muted)' }}>· {e.primaMinima === null ? 'prima no consta' : `desde ${eur(e.primaMinima)}/año`}</span>
              {e.masEconomica && <Badge tono="positivo">La más económica</Badge>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {e.seguroAnterior} · {e.referencia ?? 'sin referencia'} · {e.estado}
            </div>
          </li>
        ))}
      </ol>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <a href={`/api/correduria/presupuesto/propuesta/pdf?id=${encodeURIComponent(p.id)}`} download
          style={{ ...btnStyle('secundario', 'sm'), minHeight: 44, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
          Descargar PDF
        </a>
        {viva && (
          <>
            <button type="button" disabled={ocupado} onClick={() => setConfirmando('email')} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Enviar por correo…</button>
            <button type="button" disabled={ocupado} onClick={() => setConfirmando('whatsapp_enlace')} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Preparar WhatsApp…</button>
            {/* Un botón por TOMADOR: confirmar el de Ana no puede marcar como enviado el de Rafael. */}
            {p.canalAviso === 'whatsapp_enlace' && destinatarios(p).filter((d) => d.enlazado).map((d) => (
              <button key={d.clienteId} type="button" disabled={ocupado}
                onClick={() => { if (window.confirm(`¿Le has mandado ya el WhatsApp a ${d.nombre} desde tu móvil?`)) void accion({ accion: 'confirmar_whatsapp', clienteId: d.clienteId }) }}
                style={{ ...btnStyle('secundario', 'sm'), minHeight: 44, maxWidth: '100%', whiteSpace: 'normal', height: 'auto' }}>
                Ya lo he mandado a {d.nombre}
              </button>
            ))}
            <button type="button" disabled={ocupado} onClick={() => void accion({ accion: 'retirar' })} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44, marginLeft: 'auto' }}>Retirar</button>
          </>
        )}
      </div>

      {confirmando && (
        <div role="alertdialog" aria-label="Confirmar envío" style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'grid', gap: 6, fontSize: 13 }}>
          <div>
            {confirmando === 'email'
              ? 'Saldrá UN correo a cada tomador, con sus escenarios (los precios se ven al entrar con su código):'
              : 'Se preparará UN WhatsApp por tomador con sus escenarios; lo mandas tú desde tu móvil:'}
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {destinatarios(p).map((d) => (
              <li key={d.clienteId}>{d.nombre}: escenario{d.numeros.length > 1 ? 's' : ''} {d.numeros.join(', ')}</li>
            ))}
          </ul>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" disabled={ocupado} onClick={() => void accion({ accion: 'avisar', canal: confirmando, confirmar: true })}
              style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }}>
              {ocupado ? 'Enviando…' : confirmando === 'email' ? 'Enviar ahora' : 'Generar WhatsApp'}
            </button>
            <button type="button" disabled={ocupado} onClick={() => setConfirmando(null)} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Cancelar</button>
          </div>
        </div>
      )}

      {resultado && (
        <div role="status" style={{ fontSize: 13, display: 'grid', gap: 4 }}>
          <span style={{ color: resultado.ok ? 'var(--text)' : 'var(--negative)' }}>{resultado.texto}</span>
          {resultado.grupos.map((g, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span>{g.nombre ?? 'Tomador'} (escenario{g.numeros.length > 1 ? 's' : ''} {g.numeros.join(', ')}):</span>
              <span style={{ color: g.estado === 'error' ? 'var(--negative)' : 'var(--muted)' }}>{g.detalle}</span>
              {g.whatsapp && (
                <a href={g.whatsapp} target="_blank" rel="noopener noreferrer"
                  style={{ ...btnStyle('primario', 'sm'), minHeight: 44, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
                  Abrir WhatsApp
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </article>
  )
}
