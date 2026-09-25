'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CampoFusion, GrupoFusion, IdentidadFusion } from '@central/module-seguros'
import { btnStyle } from '@/components/ui'

/**
 * Otra ficha con el MISMO DNI = la misma persona dos veces. Se avisa arriba de
 * la ficha y se ofrece fusionarlas eligiendo, campo a campo, con qué valor se
 * queda (Alberto, 25/09/2026). Solo propone por DNI: por nombre fundiría a un
 * padre y un hijo (Antonio Cruz, 24/09/2026).
 *
 * `null` al consultar = no se ha podido mirar: se dice, no se calla.
 */
type Ficha = { id: string; nombre: string; tipo: string; dniEnmascarado: string | null; polizas: number; polizasVivas: number; telefonos: number; emails: number }
type Comparacion = { superviviente: Ficha; absorbida: Ficha; identidad: IdentidadFusion; campos: CampoFusion[] }

export default function FichasDuplicadas({ clienteId }: { clienteId: string }) {
  const [candidatas, setCandidatas] = useState<Ficha[] | null | undefined>(undefined)
  const [abierta, setAbierta] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    fetch(`/api/correduria/cliente/fusion?id=${encodeURIComponent(clienteId)}`, { cache: 'no-store' })
      .then(r => r.json().catch(() => null))
      .then(j => { if (vivo) setCandidatas(j?.estado === 'ok' && Array.isArray(j.candidatas) ? j.candidatas : null) })
      .catch(() => { if (vivo) setCandidatas(null) })
    return () => { vivo = false }
  }, [clienteId])

  if (candidatas === undefined || (candidatas !== null && candidatas.length === 0)) return null
  if (candidatas === null) {
    return <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>No se ha podido comprobar si esta ficha tiene duplicadas.</p>
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      {candidatas.map(c => (
        <div key={c.id} style={{ border: '1px solid var(--warning)', background: 'var(--warning-bg)', borderRadius: 12, padding: 12, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
          <div style={{ fontSize: 13 }}>
            ⚠️ Hay <strong>otra ficha con el mismo DNI</strong>: {c.nombre} ({c.tipo} · {c.polizas} póliza{c.polizas === 1 ? '' : 's'}). Es la misma persona dos veces.
          </div>
          {abierta === c.id
            ? (
              <Comparar
                clienteId={clienteId}
                otra={c}
                onCerrar={() => setAbierta(null)}
                // Fusionada: esa tarjeta ya no existe (su ficha es una lápida).
                onFusionada={() => { setAbierta(null); setCandidatas(prev => (prev ?? []).filter(x => x.id !== c.id)) }}
              />
            )
            : (
              <div>
                <button type="button" onClick={() => setAbierta(c.id)} style={{ ...btnStyle('secundario'), minHeight: 44 }}>
                  Comparar y fusionar
                </button>
              </div>
            )}
        </div>
      ))}
    </div>
  )
}

function Comparar({ clienteId, otra, onCerrar, onFusionada }: { clienteId: string; otra: Ficha; onCerrar: () => void; onFusionada: () => void }) {
  const router = useRouter()
  // Por defecto se queda la ficha con más pólizas vivas: es la que CIMA conoce.
  const [seQueda, setSeQueda] = useState<string>(clienteId)
  const [cmp, setCmp] = useState<Comparacion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deOtra, setDeOtra] = useState<Set<GrupoFusion>>(new Set())
  const [confirmo, setConfirmo] = useState(false)
  const [enCurso, setEnCurso] = useState(false)
  const [elegidaPorDefecto, setElegidaPorDefecto] = useState(false)
  // Lo que no se pudo pasar a la ficha que queda (se queda colgando de la otra): se enseña, no se calla.
  const [sinMover, setSinMover] = useState<Record<string, number> | null>(null)

  const absorbidaId = seQueda === clienteId ? otra.id : clienteId

  useEffect(() => {
    let vivo = true
    setCmp(null); setError(null); setDeOtra(new Set())
    fetch(`/api/correduria/cliente/fusion?id=${encodeURIComponent(seQueda)}&con=${encodeURIComponent(absorbidaId)}`, { cache: 'no-store' })
      .then(r => r.json().catch(() => null))
      .then(j => {
        if (!vivo) return
        if (j?.estado === 'ok') {
          const c = j.comparacion as Comparacion
          if (!elegidaPorDefecto) {
            setElegidaPorDefecto(true)
            if (c.absorbida.polizasVivas > c.superviviente.polizasVivas) { setSeQueda(c.absorbida.id); return }
          }
          setCmp(c)
        } else setError(typeof j?.motivo === 'string' ? j.motivo : 'No se han podido leer las dos fichas.')
      })
      .catch(() => { if (vivo) setError('No se han podido leer las dos fichas.') })
    return () => { vivo = false }
  }, [seQueda, absorbidaId, elegidaPorDefecto])

  async function fusionar() {
    if (!cmp) return
    if (!confirm(`¿Fusionar «${cmp.absorbida.nombre}» en «${cmp.superviviente.nombre}»? Sus pólizas, contactos y lo demás pasan a la ficha que se queda; si algo no se puede mover, te lo diré. Queda registrado con la foto de las dos fichas.`)) return
    setEnCurso(true); setError(null)
    try {
      const res = await fetch('/api/correduria/cliente/fusion', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: cmp.superviviente.id, con: cmp.absorbida.id, deAbsorbida: [...deOtra], confirmarSinDni: confirmo }),
      })
      const j = await res.json().catch(() => null)
      if (j?.estado === 'ok') {
        const quedan = j.sinMover && typeof j.sinMover === 'object' ? (j.sinMover as Record<string, number>) : {}
        if (Object.keys(quedan).length > 0) {
          // Fusionada, pero algo se quedó en la otra ficha: se dice antes de irse.
          setSinMover(quedan)
          return
        }
        terminar()
        return
      }
      // Un corte de red o una respuesta sin JSON NO es «no se ha fusionado»: puede haber terminado.
      if (!j || j.motivo === 'red' || res.status >= 500) {
        setError('No se sabe si se ha fusionado (se cortó la comunicación). Recarga la ficha antes de volver a intentarlo.')
        return
      }
      setError(typeof j.motivo === 'string' ? j.motivo : `No se ha fusionado (HTTP ${res.status}).`)
    } catch {
      setError('No se sabe si se ha fusionado (se cortó la comunicación). Recarga la ficha antes de volver a intentarlo.')
    } finally {
      setEnCurso(false)
    }
  }

  function terminar() {
    if (!cmp) return
    onFusionada()
    if (cmp.superviviente.id !== clienteId) router.push(`/correduria/cliente/${cmp.superviviente.id}`)
    else router.refresh()
  }

  if (sinMover) {
    return (
      <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
        <div>✅ Fusionadas. Pero esto <strong>no se ha podido pasar</strong> a la ficha que se queda y sigue colgando de la otra (no se ha perdido):</div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {Object.entries(sinMover).map(([k, n]) => <li key={k}>{k.replace(/^seguros\./, '')}: {n}</li>)}
        </ul>
        <div><button type="button" onClick={terminar} style={{ ...btnStyle('secundario'), minHeight: 44 }}>Entendido</button></div>
      </div>
    )
  }

  if (error && !cmp) return <div style={{ fontSize: 12, color: 'var(--negative)' }}>{error} <button type="button" onClick={onCerrar} style={btnStyle('sutil', 'sm')}>Cerrar</button></div>
  if (!cmp) return <div style={{ fontSize: 12, color: 'var(--muted)' }}>Leyendo las dos fichas…</div>

  const distintos = cmp.campos.filter(c => c.estado === 'distinto')
  const heredados = cmp.campos.filter(c => c.estado === 'solo_absorbida')
  const ilegibles = cmp.campos.filter(c => c.estado === 'ilegible')
  const iguales = cmp.campos.filter(c => c.estado === 'igual' || c.estado === 'solo_superviviente').length
  const bloqueada = cmp.identidad === 'dni_distinto' || cmp.identidad === 'dni_sin_indice' || (cmp.identidad === 'sin_comprobar' && !confirmo)
  const nombreDe = (id: string) => (id === cmp.superviviente.id ? cmp.superviviente : cmp.absorbida)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10, background: 'var(--surface)', borderRadius: 10, padding: 12 }}>
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>¿Qué ficha se queda?</div>
        {[clienteId, otra.id].map(id => {
          const f = nombreDe(id)
          return (
            <label key={id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, minHeight: 44 }}>
              <input type="radio" name={`quedar-${otra.id}`} checked={seQueda === id} onChange={() => { setElegidaPorDefecto(true); setSeQueda(id) }} />
              <span style={{ overflowWrap: 'anywhere' }}>
                {f.nombre} {id === clienteId ? '(esta)' : ''} — {f.tipo} · {f.polizasVivas} viva{f.polizasVivas === 1 ? '' : 's'} de {f.polizas} · DNI {f.dniEnmascarado ?? 'sin DNI'}
              </span>
            </label>
          )
        })}
      </div>

      {cmp.identidad === 'dni_distinto' && (
        <div style={{ fontSize: 13, color: 'var(--negative)' }}>Los DNI son distintos: son dos personas. No se pueden fusionar.</div>
      )}
      {cmp.identidad === 'dni_sin_indice' && (
        <div style={{ fontSize: 13, color: 'var(--negative)' }}>
          Las dos tienen DNI pero a alguna le falta el índice: no se puede comprobar que sea el mismo. Escribe el índice del DNI en Correduría → Mantenimiento y vuelve aquí.
        </div>
      )}
      {cmp.identidad === 'sin_comprobar' && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, minHeight: 44 }}>
          <input type="checkbox" checked={confirmo} onChange={e => setConfirmo(e.target.checked)} />
          Una de las dos no tiene DNI, así que no se puede comprobar. Confirmo que son la misma persona.
        </label>
      )}

      <div style={{ fontSize: 13, fontWeight: 700 }}>
        {distintos.length === 0 ? 'No hay datos que se contradigan.' : `Datos diferentes (${distintos.length}): elige con cuál te quedas`}
      </div>
      {distintos.map(c => (
        <div key={c.grupo} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>{c.etiqueta}</div>
          {([['sup', c.superviviente.valor, cmp.superviviente.nombre], ['abs', c.absorbida.valor, cmp.absorbida.nombre]] as const).map(([lado, valor, de]) => {
            const marcado = lado === 'abs' ? deOtra.has(c.grupo) : !deOtra.has(c.grupo)
            return (
              <label key={lado} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, minHeight: 44 }}>
                <input
                  type="radio"
                  name={`${otra.id}-${c.grupo}`}
                  checked={marcado}
                  onChange={() => setDeOtra(prev => {
                    const n = new Set(prev)
                    if (lado === 'abs') n.add(c.grupo); else n.delete(c.grupo)
                    return n
                  })}
                  style={{ marginTop: 3 }}
                />
                <span style={{ overflowWrap: 'anywhere' }}>
                  {valor} <span style={{ color: 'var(--muted)', fontSize: 11 }}>· de {de}</span>
                </span>
              </label>
            )
          })}
        </div>
      ))}

      {heredados.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          Se rellenan solos (la ficha que se queda no los tiene): {heredados.map(c => `${c.etiqueta} «${c.absorbida.valor}»`).join(' · ')}.
        </div>
      )}
      {ilegibles.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--warning)' }}>
          Cifrados y no se pueden comparar: {ilegibles.map(c => c.etiqueta).join(', ')}. Se queda el de la ficha que se conserva.
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
        {iguales} dato(s) coinciden o solo están en la que se queda. Teléfonos ({cmp.superviviente.telefonos} + {cmp.absorbida.telefonos}) y correos ({cmp.superviviente.emails} + {cmp.absorbida.emails}): se conservan todos. Pólizas, documentos y relaciones pasan a la que se queda (si algo no puede, te lo diré).
      </div>

      {error && <div style={{ fontSize: 12, color: 'var(--negative)' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" disabled={bloqueada || enCurso} onClick={() => void fusionar()} style={{ ...btnStyle('primario'), minHeight: 44 }}>
          {enCurso ? 'Fusionando…' : 'Fusionar'}
        </button>
        <button type="button" disabled={enCurso} onClick={onCerrar} style={{ ...btnStyle('sutil'), minHeight: 44 }}>Cancelar</button>
      </div>
    </div>
  )
}
