'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { coincidenciaBloquea, provinciaPorCp, revisarAlta } from '@central/module-seguros'
import { btnStyle } from '@/components/ui'
import { campoDesdeTermino, interpretarEscritura, textoMotivo, type ResultadoEscritura } from '@/lib/cliente-edicion-asegura'

/**
 * Alta de un cliente de la correduría desde plataforma.
 *
 * Reglas del módulo (`revisarAlta`): nombre obligatorio y AL MENOS un dato por
 * el que se pueda volver a encontrar (DNI, teléfono o email) — una ficha con
 * solo un nombre es la que mañana se duplica. Se valida aquí para señalar la
 * casilla; el puerto vuelve a validar.
 *
 * Un DNI que ya está en otra ficha NUNCA se fuerza (es la misma persona: se
 * enlaza). Teléfono o email repetidos sí pueden ser dos personas y se ofrece
 * «Crear igualmente».
 */
type Form = {
  nombre: string; apellidos: string; dni: string; fechaNacimiento: string
  telefono: string; email: string; direccion: string; codigoPostal: string; ciudad: string; provincia: string; notas: string
}

const VACIO: Form = { nombre: '', apellidos: '', dni: '', fechaNacimiento: '', telefono: '', email: '', direccion: '', codigoPostal: '', ciudad: '', provincia: '', notas: '' }

export default function NuevoCliente({ q }: { q?: string }) {
  const router = useRouter()
  const [f, setF] = useState<Form>(() => {
    const termino = (q ?? '').trim()
    if (termino === '') return VACIO
    return { ...VACIO, [campoDesdeTermino(termino)]: termino }
  })
  const [ocupado, setOcupado] = useState(false)
  const [resultado, setResultado] = useState<ResultadoEscritura | null>(null)
  const [campoMal, setCampoMal] = useState<string | null>(null)

  function set<K extends keyof Form>(k: K, v: string) {
    setF((prev) => {
      const next = { ...prev, [k]: v }
      if (k === 'codigoPostal' && prev.provincia.trim() === '') {
        const p = provinciaPorCp(v)
        if (p) next.provincia = p
      }
      return next
    })
  }

  async function enviar(forzar = false) {
    const rev = revisarAlta(f)
    if (!rev.ok) {
      setCampoMal(rev.campo ?? null)
      return setResultado({ estado: 'invalido', motivo: rev.motivo, campo: rev.campo ?? null })
    }
    setCampoMal(null)
    setOcupado(true)
    try {
      const { tipoPersona: _tp, ...alta } = rev.alta
      void _tp
      const res = await fetch('/api/correduria/cliente', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...alta, forzar }),
      })
      const r = interpretarEscritura(res.status, await res.json().catch(() => null))
      setResultado(r)
      if (r.estado === 'invalido') setCampoMal(r.campo)
      if (r.estado === 'ok') {
        if (r.id) router.push(`/correduria/cliente/${r.id}`)
        else setResultado({ estado: 'error', motivo: 'asegura dice que se creó pero no manda el id: búscalo por nombre.' })
      }
    } catch {
      setResultado({ estado: 'error', motivo: 'red' })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void enviar() }} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
      <Grupo titulo="Quién es">
        <Fila>
          <Campo label="Nombre *" mal={campoMal === 'nombre'}>
            <input value={f.nombre} onChange={(e) => set('nombre', e.target.value)} style={campo} autoFocus />
          </Campo>
          <Campo label="Apellidos" mal={campoMal === 'apellidos'}>
            <input value={f.apellidos} onChange={(e) => set('apellidos', e.target.value)} style={campo} />
          </Campo>
        </Fila>
        <Fila>
          <Campo label="DNI / NIE / CIF" mal={campoMal === 'dni'}>
            <input value={f.dni} onChange={(e) => set('dni', e.target.value)} placeholder="12345678Z" style={campo} autoComplete="off" />
          </Campo>
          <Campo label="Fecha de nacimiento" mal={campoMal === 'fechaNacimiento'}>
            <input type="date" value={f.fechaNacimiento} onChange={(e) => set('fechaNacimiento', e.target.value)} style={campo} />
          </Campo>
        </Fila>
      </Grupo>

      <Grupo titulo="Cómo localizarlo" nota="Hace falta DNI, teléfono o email: sin ninguno, la ficha no se podrá volver a encontrar.">
        <Fila>
          <Campo label="Teléfono" mal={campoMal === 'telefono'}>
            <input type="tel" value={f.telefono} onChange={(e) => set('telefono', e.target.value)} placeholder="600 000 000" style={campo} />
          </Campo>
          <Campo label="Email" mal={campoMal === 'email'}>
            <input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="nombre@dominio.es" style={campo} />
          </Campo>
        </Fila>
      </Grupo>

      <Grupo titulo="Dónde vive">
        <Campo label="Dirección" mal={campoMal === 'direccion'}>
          <input value={f.direccion} onChange={(e) => set('direccion', e.target.value)} placeholder="Calle, número, piso" style={campo} />
        </Campo>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          <Campo label="Código postal" mal={campoMal === 'codigoPostal'}>
            <input value={f.codigoPostal} onChange={(e) => set('codigoPostal', e.target.value)} inputMode="numeric" maxLength={5} placeholder="41003" style={campo} />
          </Campo>
          <Campo label="Ciudad" mal={campoMal === 'ciudad'}>
            <input value={f.ciudad} onChange={(e) => set('ciudad', e.target.value)} style={campo} />
          </Campo>
          <Campo label="Provincia" mal={campoMal === 'provincia'}>
            <input value={f.provincia} onChange={(e) => set('provincia', e.target.value)} style={campo} />
          </Campo>
        </div>
        <Campo label="Notas" mal={campoMal === 'notas'}>
          <textarea value={f.notas} onChange={(e) => set('notas', e.target.value)} rows={3} style={{ ...campo, minHeight: 72, resize: 'vertical' }} />
        </Campo>
      </Grupo>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="submit" disabled={ocupado} style={btnStyle('primario')}>Dar de alta</button>
        <Link href="/correduria" style={{ fontSize: 13, color: 'var(--muted)' }}>Cancelar</Link>
      </div>

      <Resultado r={resultado} ocupado={ocupado} onForzar={() => void enviar(true)} />
    </form>
  )
}

function Resultado({ r, ocupado, onForzar }: { r: ResultadoEscritura | null; ocupado: boolean; onForzar: () => void }) {
  if (r === null) return null
  const base: React.CSSProperties = { fontSize: 13, lineHeight: 1.5, borderRadius: 8, padding: '8px 10px' }
  if (r.estado === 'ok') return <div style={{ ...base, color: 'var(--positive)', background: 'var(--positive-bg)' }}>✅ Creado. Abriendo la ficha…</div>
  if (r.estado === 'conflicto') {
    const bloquea = coincidenciaBloquea(r.coincidencias) || !r.forzable
    return (
      <div style={{ ...base, color: 'var(--warning)', background: 'var(--warning-bg)' }}>
        ⚠️ <strong>Ya existe:</strong>
        <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
          {r.coincidencias.map((c) => (
            <li key={`${c.por}-${c.id}`}>
              <Link href={`/correduria/cliente/${c.id}`} style={{ fontWeight: 600 }}>{c.nombre}</Link>
              {' '}<span style={{ color: 'var(--muted)' }}>(mismo {c.por} · {c.tipo})</span>
            </li>
          ))}
          {r.coincidencias.length === 0 && <li>asegura no dice con cuál.</li>}
        </ul>
        {bloquea ? (
          <div>Con el mismo DNI es la misma persona: no se crea otra ficha, se trabaja en la que ya hay.</div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>Puede ser otra persona que comparte teléfono o email (matrimonio, padre e hijo).</span>
            <button type="button" disabled={ocupado} onClick={onForzar} style={btnStyle('secundario')}>Crear igualmente (comparten teléfono/email)</button>
          </div>
        )}
      </div>
    )
  }
  if (r.estado === 'invalido') return <div style={{ ...base, color: 'var(--negative)', background: 'var(--negative-bg)' }}>✖ {textoMotivo(r.motivo)}</div>
  if (r.estado === 'sin_configurar') {
    return <div style={{ ...base, color: 'var(--muted)', border: '1px dashed var(--border)' }}>⏳ El puerto con asegura no está conectado (falta <code>ASEGURA_OPERADOR_SECRET</code>). No se ha creado nada.</div>
  }
  if (r.estado === 'no_encontrado') return <div style={{ ...base, color: 'var(--negative)', background: 'var(--negative-bg)' }}>asegura respondió «no encontrado» a un alta: revisa el puerto.</div>
  return <div style={{ ...base, color: 'var(--negative)', background: 'var(--negative-bg)' }}>⚠️ No se ha podido crear: {textoMotivo(r.motivo)}</div>
}

function Grupo({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>{titulo}</div>
      {nota && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{nota}</div>}
      {children}
    </section>
  )
}

function Fila({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>{children}</div>
}

function Campo({ label, mal, children }: { label: string; mal?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: mal ? 'var(--negative)' : 'var(--muted)', fontWeight: 600 }}>{label}{mal ? ' · revisa este campo' : ''}</span>
      {children}
    </label>
  )
}

const campo: React.CSSProperties = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', minHeight: 44, padding: '10px 12px',
  borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14,
}
