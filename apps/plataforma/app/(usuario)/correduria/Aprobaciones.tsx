'use client'

// «Esperan tu OK» → correos a clientes que el sistema propone (Fase 2 de ASegura OS, pieza 2-c).
// Hoy: el aviso de recibo devuelto. Nada sale sin pulsar «Enviar», y antes se confirma: es un
// correo a un cliente real. El texto se puede retocar; lo que se envía es lo que se ve.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { btnStyle } from '@/components/ui'
import { textoDesenlace, type Aprobacion, type CuerpoDecision, type Desenlace, type LecturaAprobaciones } from '@/lib/aprobaciones-asegura'

const ORIGEN: Record<string, string> = { recibo_devuelto: 'Recibo devuelto', anulacion: 'Anulación firmada', carta_mediador: 'Nombramiento de mediador firmado' }

export default function Aprobaciones({ onContador }: { onContador?: (n: number | null) => void }) {
  const [d, setD] = useState<LecturaAprobaciones | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [edit, setEdit] = useState<Record<string, { asunto: string; texto: string }>>({})
  const [buzon, setBuzon] = useState<Record<string, string>>({})
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  const cargar = useCallback(() => {
    fetch('/api/correduria/aprobaciones')
      .then(r => (r.ok ? r.json() : { estado: 'sin_datos', causa: `HTTP ${r.status}` }))
      // Lo que está a medias también espera a Alberto: cuenta, para que «Nada esperando tu OK» no mienta.
      .then((x: LecturaAprobaciones) => { setD(x); onContador?.(x.estado === 'ok' ? x.pendientes.length + x.inciertos.length : null) })
      .catch(() => { setD({ estado: 'sin_datos', causa: 'red' }); onContador?.(null) })
  }, [onContador])
  useEffect(() => { cargar() }, [cargar])

  async function decidir(a: Aprobacion, decision: 'aprobar' | 'rechazar') {
    const e = edit[a.id] ?? { asunto: a.asunto, texto: a.texto }
    const elegido = a.para === 'compania' ? a.buzones.find(b => b.id === (buzon[a.id] ?? a.buzonSugerido)) : undefined
    if (decision === 'aprobar' && a.para === 'compania' && !elegido) return
    const quien = elegido
      ? `${a.destinatario ?? 'la compañía'} — ${elegido.nombre} <${elegido.email}> (con la carta firmada de ${a.cliente ?? 'el cliente'} adjunta)`
      : (a.cliente ?? 'este cliente')
    if (decision === 'aprobar' && !window.confirm(`Se va a enviar un correo a ${quien}:\n\n«${e.asunto}»\n\n¿Enviar?`)) return
    await mandar(decision === 'aprobar' ? { id: a.id, decision, ...e, ...(elegido ? { contactoId: elegido.id } : {}) } : { id: a.id, decision })
  }

  async function mandar(cuerpo: CuerpoDecision) {
    setOcupado(cuerpo.id); setAviso(null)
    try {
      const r = await fetch('/api/correduria/aprobaciones', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      })
      const j = (await r.json().catch(() => null)) as { desenlace?: Desenlace; motivo?: string | null } | null
      const des = j?.desenlace ?? 'error'
      setAviso({ ok: des === 'ejecutada' || des === 'rechazada' || des === 'cerrada', texto: textoDesenlace(des, j?.motivo) })
    } catch {
      setAviso({ ok: false, texto: textoDesenlace('error') })
    } finally {
      setOcupado(null)
      cargar()
    }
  }

  if (d === null) return null
  if (d.estado === 'sin_datos') {
    return <p style={{ ...NOTA, color: 'var(--negative)' }}>No se han podido leer los correos pendientes de OK ({d.causa}). No significa que no haya.</p>
  }
  if (d.pendientes.length === 0 && d.inciertos.length === 0 && !aviso) return null

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {d.inciertos.map(x => (
        <div key={x.id} style={{ display: 'grid', gap: 6, padding: '8px 12px', borderRadius: 12, border: '1px solid var(--warning)', background: 'var(--surface)' }}>
          <span style={{ fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>⚠️ Correo a medias · {x.cliente ?? '(ficha sin nombre)'}</span>
          <span style={{ ...NOTA, overflowWrap: 'anywhere' }}>
            «{x.asunto}» — no se sabe si salió. No se reintenta solo: míralo en Resend y dilo aquí.
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <button type="button" disabled={ocupado !== null} onClick={() => void mandar({ id: x.id, decision: 'cerrar_incierto', salio: true })} style={btnStyle('sutil')}>Sí salió</button>
            <button type="button" disabled={ocupado !== null} onClick={() => void mandar({ id: x.id, decision: 'cerrar_incierto', salio: false })} style={btnStyle('sutil')}>No salió</button>
            <Link href={`/correduria/cliente/${x.clienteId}`} style={ENLACE}>Ver ficha</Link>
          </div>
        </div>
      ))}
      {d.pendientes.map(a => {
        const e = edit[a.id] ?? { asunto: a.asunto, texto: a.texto }
        const abiertaEsta = abierta === a.id
        return (
          <div key={a.id} style={{ display: 'grid', gap: 6, padding: '8px 12px', borderRadius: 12, border: `1px solid ${a.urgente ? 'var(--negative)' : 'var(--border)'}`, background: 'var(--surface)' }}>
            <button type="button" onClick={() => setAbierta(abiertaEsta ? null : a.id)} aria-expanded={abiertaEsta}
              style={{ display: 'grid', gap: 2, minHeight: 44, padding: 0, border: 0, background: 'none', color: 'var(--text)', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}>
              <span style={{ fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>
                Correo{a.para === 'compania' ? ` a ${a.destinatario ?? 'la compañía'}` : ''} · {ORIGEN[a.origen] ?? a.origen} · {a.cliente ?? '(ficha sin nombre)'}
              </span>
              <span style={{ fontSize: 12, color: a.urgente ? 'var(--negative)' : 'var(--muted)', overflowWrap: 'anywhere' }}>
                {a.urgente ? (a.para === 'compania' ? 'Efecto cercano · ' : 'Cobertura en suspenso · ') : ''}{e.asunto}
              </span>
            </button>
            {abiertaEsta && (
              <>
                <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                  Asunto
                  <input value={e.asunto} onChange={ev => setEdit(m => ({ ...m, [a.id]: { ...e, asunto: ev.target.value } }))}
                    style={{ minHeight: 44, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', font: 'inherit', fontSize: 14 }} />
                </label>
                <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                  Texto
                  <textarea value={e.texto} rows={9} onChange={ev => setEdit(m => ({ ...m, [a.id]: { ...e, texto: ev.target.value } }))}
                    style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', font: 'inherit', fontSize: 14, resize: 'vertical', width: '100%', boxSizing: 'border-box' }} />
                </label>
                {a.para === 'compania' && (
                  a.buzones.length === 0
                    ? <span style={{ fontSize: 13, color: 'var(--negative)' }}>
                        {a.destinatario ?? 'Esta compañía'} no tiene ningún contacto activo con correo en Compañías: añádelo allí o mándala a mano y márcala «Comunicada» en la póliza.
                      </span>
                    : <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                        Para
                        <select value={buzon[a.id] ?? a.buzonSugerido ?? ''} onChange={ev => setBuzon(m => ({ ...m, [a.id]: ev.target.value }))}
                          style={{ minHeight: 44, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', font: 'inherit', fontSize: 14, maxWidth: '100%' }}>
                          <option value="" disabled>Elige a qué buzón de {a.destinatario ?? 'la compañía'} va</option>
                          {a.buzones.map(b => (
                            <option key={b.id} value={b.id}>{b.nombre}{b.cargo ? ` · ${b.cargo}` : ''} — {b.email}</option>
                          ))}
                        </select>
                      </label>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <button type="button" disabled={ocupado !== null || (a.para === 'compania' && !a.buzones.some(b => b.id === (buzon[a.id] ?? a.buzonSugerido)))} onClick={() => void decidir(a, 'aprobar')} style={btnStyle('primario')}>Enviar</button>
                  <button type="button" disabled={ocupado !== null} onClick={() => void decidir(a, 'rechazar')} style={btnStyle('sutil')}>Descartar</button>
                  <Link href={`/correduria/cliente/${a.clienteId}`} style={ENLACE}>Ver ficha</Link>
                </div>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {a.para === 'compania'
                    ? a.origen === 'carta_mediador'
                      ? 'Se envía al buzón que elijas (la próxima carta de nombramiento de esta compañía lo traerá ya elegido), con la carta que firmó el cliente adjunta: esa no se puede editar. Al salir, la carta pasa a «enviada»; la póliza no es nuestra hasta que la compañía la acepte.'
                      : 'Se envía al buzón que elijas (la próxima anulación de esta compañía lo traerá ya elegido), con la carta que firmó el cliente adjunta: esa no se puede editar. Al salir, la anulación pasa a «comunicada».'
                    : 'Se envía al correo de la ficha.'} Caduca el {new Date(a.caduca).toLocaleDateString('es-ES')} si nadie lo decide.
                </span>
              </>
            )}
          </div>
        )
      })}
      {aviso && <p role="status" style={{ ...NOTA, color: aviso.ok ? 'var(--positive)' : 'var(--negative)' }}>{aviso.texto}</p>}
    </div>
  )
}

const NOTA: React.CSSProperties = { margin: 0, fontSize: 13, color: 'var(--muted)' }
const ENLACE: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 8px', fontSize: 13 }
