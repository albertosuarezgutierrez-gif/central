'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { GraduationCap } from 'lucide-react'
import { Badge, btnStyle } from '@/components/ui'
import { fechaEs } from '@/lib/ficha-asegura'
import Bloque from './Bloque'
import {
  TEXTO_ESTADO,
  contadorFormacion,
  interpretarFormacion,
  type EstadoFormacion,
  type LecturaFormacion,
} from '@/lib/formacion-asegura'

/**
 * Formación continua IDD: horas por persona y año contra el mínimo (15 h, art. 10.2 de la directiva).
 * Se anota cada curso terminado; el resumen dice quién va atrasado. Un fallo de lectura no se calla y
 * el contador sube `null`, no 0.
 */
const input = { width: '100%', minHeight: 44, fontSize: 14, padding: '8px 10px', boxSizing: 'border-box' as const }
const TONO: Record<EstadoFormacion, 'positivo' | 'aviso' | 'negativo' | 'neutral'> = {
  cumplido: 'positivo', en_curso: 'neutral', atrasado: 'aviso', incumplido: 'negativo', baja: 'neutral',
}

function hoy(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

export default function Formacion({ onContador }: { onContador?: (n: number | null) => void }) {
  const añoHoy = Number(hoy().slice(0, 4))
  const [año, setAño] = useState(añoHoy)
  const [lectura, setLectura] = useState<LecturaFormacion | null>(null)
  const [form, setForm] = useState({ persona: '', curso: '', entidad: '', fecha: hoy(), horas: '' })
  const [mensaje, setMensaje] = useState<{ tono: 'ok' | 'error'; texto: string } | null>(null)
  const [enviando, setEnviando] = useState(false)
  const contador = useRef(onContador)
  contador.current = onContador
  const pedido = useRef(año)

  const cargar = useCallback(async (a: number) => {
    pedido.current = a
    const res = await fetch(`/api/correduria/formacion?a%C3%B1o=${a}`).catch(() => null)
    const l = res ? interpretarFormacion(res.status, await res.json().catch(() => null)) : { estado: 'error' as const, motivo: 'red' }
    // Si se cambió de año mientras llegaba, esta respuesta ya no es la que se pinta.
    if (a !== pedido.current) return
    setLectura(l)
    if (a === añoHoy) contador.current?.(contadorFormacion(l))
  }, [añoHoy])

  useEffect(() => { void cargar(año) }, [año, cargar])

  async function guardar() {
    setEnviando(true)
    setMensaje(null)
    const res = await fetch('/api/correduria/formacion', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    }).catch(() => null)
    const j = (res ? await res.json().catch(() => null) : null) as { estado?: string; motivos?: string[] } | null
    if (res?.status === 201) {
      setMensaje({ tono: 'ok', texto: 'Curso anotado.' })
      setForm({ persona: form.persona, curso: '', entidad: '', fecha: hoy(), horas: '' })
      await cargar(año)
    } else {
      setMensaje({ tono: 'error', texto: j?.motivos?.join(' ') ?? 'No se ha guardado: no se pudo hablar con asegura.' })
    }
    setEnviando(false)
  }

  async function baja(persona: string, desde: string | null) {
    setMensaje(null)
    const res = desde
      ? await fetch('/api/correduria/formacion/baja', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ persona, desde }),
        }).catch(() => null)
      : await fetch(`/api/correduria/formacion/baja?persona=${encodeURIComponent(persona)}`, { method: 'DELETE' }).catch(() => null)
    const j = (res ? await res.json().catch(() => null) : null) as { motivos?: string[] } | null
    if (res?.ok) await cargar(año)
    else setMensaje({ tono: 'error', texto: j?.motivos?.join(' ') ?? 'No se ha guardado: no se pudo hablar con asegura.' })
  }

  async function borrar(id: string) {
    if (!confirm('¿Borrar este curso? Se usa para corregir un error de anotación.')) return
    const res = await fetch(`/api/correduria/formacion?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null)
    if (res?.ok) await cargar(año)
    else setMensaje({ tono: 'error', texto: 'No se ha borrado.' })
  }

  const r = lectura?.estado === 'ok' ? lectura.resumen : null
  return (
    <Bloque Icono={GraduationCap} titulo="Formación continua (IDD)"
      sub={`Mínimo ${r?.minimo ?? 15} h al año por persona que distribuye seguros. Cada persona se reconoce por su nombre: escríbelo siempre igual (dos personas con el mismo nombre se sumarían).`}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <label style={{ fontSize: 13 }}>
          Año{' '}
          <select value={año} onChange={(e) => setAño(Number(e.target.value))} style={{ minHeight: 44, fontSize: 14 }}>
            {[añoHoy, añoHoy - 1, añoHoy - 2, añoHoy - 3].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
      </div>

      {lectura === null && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Cargando…</p>}
      {lectura && lectura.estado !== 'ok' && (
        <p style={{ fontSize: 13, color: 'var(--warning)' }}>
          No se ha podido leer la formación ({lectura.estado === 'error' ? lectura.motivo : lectura.estado}). No significa que no haya.
        </p>
      )}
      {lectura?.estado === 'ok' && (
        <>
          {lectura.resumen.personas.length === 0
            ? <p style={{ fontSize: 13, color: 'var(--muted)' }}>No hay ningún curso anotado entre {año - 3} y {año}. Anota el primero abajo.</p>
            : (
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', display: 'grid', gap: 6 }}>
                {lectura.resumen.personas.map((p) => (
                  <li key={p.persona} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 14 }}>
                    <strong>{p.persona}</strong>
                    <span>{p.horas.toLocaleString('es-ES')} h{p.faltan > 0 && ` · faltan ${p.faltan.toLocaleString('es-ES')} h`}</span>
                    <Badge tono={TONO[p.estado]}>{TEXTO_ESTADO[p.estado]}</Badge>
                    {p.bajaDesde
                      ? (
                        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                          Dejó de distribuir el {fechaEs(p.bajaDesde)}{' '}
                          <button type="button" onClick={() => void baja(p.persona, null)} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Vuelve a distribuir</button>
                        </span>
                      )
                      : <BajaPersona onGuardar={(d) => void baja(p.persona, d)} />}
                  </li>
                ))}
              </ul>
            )}
          {lectura.cursos.length > 0 && (
            <details style={{ marginBottom: 12 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13, minHeight: 44, display: 'flex', alignItems: 'center' }}>
                Cursos de {año} ({lectura.cursos.length})
              </summary>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                {lectura.cursos.map((c) => (
                  <li key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, borderBottom: '1px solid var(--border)', padding: '6px 0' }}>
                    <span style={{ flex: '1 1 220px' }}>
                      {fechaEs(c.fecha)} · <strong>{c.persona}</strong> · {c.curso}{c.entidad ? ` (${c.entidad})` : ''} · {c.horas.toLocaleString('es-ES')} h
                    </span>
                    <button type="button" onClick={() => void borrar(c.id)} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Borrar</button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      <details>
        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, minHeight: 44, display: 'flex', alignItems: 'center' }}>Anotar un curso terminado</summary>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginTop: 8 }}>
          <input style={input} placeholder="Persona" value={form.persona} onChange={(e) => setForm({ ...form, persona: e.target.value })} />
          <input style={input} placeholder="Curso" value={form.curso} onChange={(e) => setForm({ ...form, curso: e.target.value })} />
          <input style={input} placeholder="Entidad formadora (opcional)" value={form.entidad} onChange={(e) => setForm({ ...form, entidad: e.target.value })} />
          <input style={input} type="date" max={hoy()} value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} aria-label="Fecha de finalización" />
          <input style={input} inputMode="decimal" placeholder="Horas" value={form.horas} onChange={(e) => setForm({ ...form, horas: e.target.value })} />
        </div>
        <button type="button" disabled={enviando || !form.persona.trim() || !form.curso.trim() || !form.horas.trim()}
          onClick={() => void guardar()} style={{ ...btnStyle('primario', 'md'), minHeight: 44, marginTop: 8 }}>
          {enviando ? 'Guardando…' : 'Anotar curso'}
        </button>
      </details>
      {mensaje && <p style={{ fontSize: 13, color: mensaje.tono === 'ok' ? 'var(--positive)' : 'var(--negative)', margin: '8px 0 0' }}>{mensaje.texto}</p>}
    </Bloque>
  )
}

/** «Dejó de distribuir» plegado: una fecha y un botón, para no llenar cada fila de controles. */
function BajaPersona({ onGuardar }: { onGuardar: (desde: string) => void }) {
  const [desde, setDesde] = useState(hoy())
  return (
    <details>
      <summary style={{ cursor: 'pointer', fontSize: 13, minHeight: 44, display: 'flex', alignItems: 'center', color: 'var(--muted)' }}>Dejó de distribuir</summary>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="date" max={hoy()} value={desde} onChange={(e) => setDesde(e.target.value)} aria-label="Desde cuándo" style={{ minHeight: 44, fontSize: 14 }} />
        <button type="button" disabled={!desde} onClick={() => onGuardar(desde)} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Guardar</button>
      </div>
    </details>
  )
}
