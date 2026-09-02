'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { GRUPOS_RELACION, explicarAutorizacion, type TipoRelacion } from '@central/module-seguros'
import { btnStyle } from '@/components/ui'
import {
  interpretarRelaciones,
  textoMotivoRelaciones,
  type RelacionCartera,
  type RespuestaRelaciones,
} from '@/lib/relaciones-asegura'
import type { RespuestaBusqueda } from '@/lib/ficha-asegura'

/**
 * Relaciones de un cliente de la correduría (cónyuge, hijos, empresa…) y la
 * AUTORIZACIÓN para ver los seguros del otro, desde la ficha de plataforma.
 *
 * Semántica (fijada en `@central/module-seguros/relaciones.ts`):
 *   · Un vínculo se lee DESDE la ficha: «María Antonia · Cónyuge/Pareja de
 *     Hecho» = María Antonia es cónyuge de la ficha.
 *   · `autorizaVer` = LA FICHA autoriza al relacionado a ver los seguros de la
 *     ficha. `puedeVer` = la ficha puede ver los del relacionado — y eso se
 *     decidió desde la OTRA ficha. Por eso aquí solo hay botón para lo primero:
 *     una autorización es un consentimiento del titular y se anota desde la
 *     ficha de quien lo da.
 *
 * Dos «no lo sé» que NO se pintan como «no tiene»: `inicial === null` (asegura
 * no manda el bloque o no pudo leerlo) y `polizasVivas === null` (sin contar).
 *
 * La BD vive en asegura: aquí se habla con `/api/correduria/cliente/relaciones`,
 * que reenvía al puerto con el secreto y pone el `actor` desde la sesión.
 */
export default function Relaciones({
  clienteId,
  nombreFicha,
  inicial,
}: {
  clienteId: string
  nombreFicha: string
  inicial: RelacionCartera[] | null
}) {
  const router = useRouter()
  const [lista, setLista] = useState<RelacionCartera[] | null>(inicial)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [resultado, setResultado] = useState<RespuestaRelaciones | null>(null)

  async function llamar(method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown>): Promise<RespuestaRelaciones> {
    try {
      const res = await fetch('/api/correduria/cliente/relaciones', {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clienteId, ...body }),
      })
      return interpretarRelaciones(res.status, await res.json().catch(() => null))
    } catch {
      return { estado: 'error', motivo: 'red' }
    }
  }

  async function ejecutar(clave: string, method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown>): Promise<RespuestaRelaciones> {
    setOcupado(clave)
    setResultado(null)
    try {
      const r = await llamar(method, body)
      setResultado(r)
      if (r.estado === 'ok') {
        setLista(r.relaciones)
        router.refresh()
      }
      return r
    } finally {
      setOcupado(null)
    }
  }

  function autorizar(r: RelacionCartera, autoriza: boolean) {
    if (!autoriza && !confirm(`¿Revocar la autorización? ${r.nombre} dejará de poder ver los seguros de ${nombreFicha}.`)) return
    void ejecutar(`aut-${r.relacionadoId}`, 'PATCH', { relacionadoId: r.relacionadoId, autoriza })
  }

  function quitar(r: RelacionCartera) {
    if (!confirm(`¿Quitar la relación con ${r.nombre}? Se borra en los dos sentidos (también la autorización, si la había).`)) return
    void ejecutar(`del-${r.relacionadoId}`, 'DELETE', { relacionadoId: r.relacionadoId })
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14 }}>
      {lista === null ? (
        <div style={pendienteBox}>
          ⚠️ No se han podido leer las relaciones de esta ficha (asegura no manda el bloque o no pudo
          consultarlo). No significa que no tenga: significa que desde aquí no se ve. Se puede añadir
          igualmente.
        </div>
      ) : lista.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          Sin relaciones anotadas: se ha mirado y no hay ninguna.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
          {lista.map((r) => (
            <Vinculo
              key={r.relacionadoId}
              r={r}
              nombreFicha={nombreFicha}
              ocupado={ocupado}
              onAutorizar={autorizar}
              onQuitar={quitar}
            />
          ))}
        </ul>
      )}

      {resultado && resultado.estado !== 'ok' && <Aviso r={resultado} />}

      <Anadir
        clienteId={clienteId}
        nombreFicha={nombreFicha}
        yaRelacionados={lista ? lista.map((r) => r.relacionadoId) : []}
        ocupado={ocupado === 'add'}
        onCrear={(body) => ejecutar('add', 'POST', body)}
      />

      <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>
        La autorización es un consentimiento del titular: anótala solo si te lo ha dado (queda registrado quién y cuándo).
      </p>
    </div>
  )
}

// ─── Un vínculo ──────────────────────────────────────────────────────────────

function Vinculo({ r, nombreFicha, ocupado, onAutorizar, onQuitar }: {
  r: RelacionCartera
  nombreFicha: string
  ocupado: string | null
  onAutorizar: (r: RelacionCartera, autoriza: boolean) => void
  onQuitar: (r: RelacionCartera) => void
}) {
  const ficha = `/correduria/cliente/${r.relacionadoId}`
  const enCurso = ocupado === `aut-${r.relacionadoId}` || ocupado === `del-${r.relacionadoId}`
  return (
    <li style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline', minWidth: 0 }}>
        <Link href={ficha} style={{ fontWeight: 700, fontSize: 14, overflowWrap: 'anywhere' }}>{r.nombre}</Link>
        <span style={{ fontSize: 13 }}>· {r.tipo}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {/* null = asegura no las contó: no es «0 pólizas». */}
          {r.polizasVivas === null ? 'pólizas sin contar' : `${r.polizasVivas} póliza${r.polizasVivas === 1 ? '' : 's'} viva${r.polizasVivas === 1 ? '' : 's'}`}
        </span>
      </div>

      <div style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <span aria-hidden>{r.autorizaVer ? '🔓' : '🔒'}</span>
        <span>
          {r.autorizaVer
            ? <><strong>{r.nombre}</strong> puede ver los seguros de {nombreFicha}</>
            : <><strong>{r.nombre}</strong> no ve los seguros de {nombreFicha}</>}
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)' }} title={explicarAutorizacion(r, nombreFicha, r.nombre)}>
        ¿{nombreFicha} ve los de {r.nombre}? <strong>{r.puedeVer ? 'sí' : 'no'}</strong> · se decide desde{' '}
        <Link href={ficha}>la ficha de {r.nombre}</Link>
      </div>

      {r.observaciones && (
        <div style={{ fontSize: 12, color: 'var(--muted)', overflowWrap: 'anywhere' }}>📝 {r.observaciones}</div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {r.autorizaVer ? (
          <button type="button" disabled={enCurso} onClick={() => onAutorizar(r, false)} style={{ ...btnStyle('secundario'), whiteSpace: 'normal', textAlign: 'left' }}>
            🔒 Revocar la autorización
          </button>
        ) : (
          <button type="button" disabled={enCurso} onClick={() => onAutorizar(r, true)} style={{ ...btnStyle('primario'), whiteSpace: 'normal', textAlign: 'left' }}>
            🔓 Autorizar a {r.nombre} a ver los seguros de {nombreFicha}
          </button>
        )}
        <button type="button" disabled={enCurso} onClick={() => onQuitar(r)} style={{ ...btnStyle('sutil'), whiteSpace: 'normal' }}>
          Quitar relación
        </button>
      </div>
    </li>
  )
}

// ─── Añadir ──────────────────────────────────────────────────────────────────

type Candidato = { id: string; nombre: string; tipo: string; polizas: number }

function Anadir({ clienteId, nombreFicha, yaRelacionados, ocupado, onCrear }: {
  clienteId: string
  nombreFicha: string
  yaRelacionados: string[]
  ocupado: boolean
  onCrear: (body: Record<string, unknown>) => Promise<RespuestaRelaciones>
}) {
  const [abierto, setAbierto] = useState(false)
  const [q, setQ] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [busqueda, setBusqueda] = useState<RespuestaBusqueda | null>(null)
  const [elegido, setElegido] = useState<Candidato | null>(null)
  const [tipo, setTipo] = useState<TipoRelacion>('Cónyuge/Pareja de Hecho')
  const [observaciones, setObservaciones] = useState('')

  async function buscar() {
    const termino = q.trim()
    if (termino === '') return
    setBuscando(true)
    setElegido(null)
    try {
      const res = await fetch(`/api/correduria/clientes?q=${encodeURIComponent(termino)}`, { cache: 'no-store' })
      // El endpoint ya devuelve la búsqueda interpretada por el servidor.
      const json = (await res.json().catch(() => null)) as RespuestaBusqueda | null
      setBusqueda(json && typeof json === 'object' && 'estado' in json ? json : { estado: 'error', motivo: 'respuesta_ilegible' })
    } catch {
      setBusqueda({ estado: 'error', motivo: 'red' })
    } finally {
      setBuscando(false)
    }
  }

  async function crear() {
    if (!elegido) return
    const r = await onCrear({ relacionadoId: elegido.id, tipo, observaciones: observaciones.trim() || undefined })
    if (r.estado === 'ok') {
      setAbierto(false)
      setQ('')
      setBusqueda(null)
      setElegido(null)
      setObservaciones('')
    }
  }

  if (!abierto) {
    return (
      <div>
        <button type="button" onClick={() => setAbierto(true)} style={btnStyle('secundario')}>➕ Añadir relación</button>
      </div>
    )
  }

  const candidatos = busqueda?.estado === 'ok'
    ? busqueda.clientes.filter((c) => c.id !== clienteId && !yaRelacionados.includes(c.id))
    : []

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Añadir relación a {nombreFicha}</div>

      <form
        onSubmit={(e) => { e.preventDefault(); void buscar() }}
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'end' }}
      >
        <Campo label="Buscar la otra ficha por nombre, DNI, teléfono o email">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="María Antonia…" style={campo} autoComplete="off" />
        </Campo>
        <button type="submit" disabled={buscando || q.trim() === ''} style={btnStyle('secundario')}>
          {buscando ? '…' : 'Buscar'}
        </button>
      </form>

      {busqueda && busqueda.estado !== 'ok' && (
        <div style={pendienteBox}>
          {busqueda.estado === 'sin_configurar'
            ? 'El puerto con asegura no está conectado (falta ASEGURA_OPERADOR_SECRET).'
            : `No se ha podido buscar: ${textoMotivoRelaciones(busqueda.motivo)}`}
        </div>
      )}
      {busqueda?.estado === 'ok' && !busqueda.buscado && (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Término demasiado corto: escribe algo más.</div>
      )}
      {busqueda?.estado === 'ok' && busqueda.buscado && candidatos.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          Nadie en la cartera con «{busqueda.termino}» que no esté ya relacionado. Si es alguien nuevo, dale de alta primero desde /correduria.
        </div>
      )}
      {candidatos.length > 0 && !elegido && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
          {candidatos.slice(0, 20).map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setElegido(c)}
                style={{ ...btnStyle('secundario'), width: '100%', justifyContent: 'space-between', whiteSpace: 'normal', textAlign: 'left' }}
              >
                <span style={{ overflowWrap: 'anywhere' }}>{c.nombre}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{c.tipo} · {c.polizas} pól.</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {elegido && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
          <div style={{ fontSize: 13, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>Ficha elegida: <strong style={{ overflowWrap: 'anywhere' }}>{elegido.nombre}</strong></span>
            <button type="button" onClick={() => setElegido(null)} style={btnStyle('sutil', 'sm')}>cambiar</button>
          </div>
          <Campo label={`¿Qué es ${elegido.nombre} para ${nombreFicha}?`} ayuda="Se lee desde esta ficha: «Cónyuge» = la persona elegida es cónyuge de la ficha. El sentido inverso se anota solo.">
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoRelacion)} style={campo}>
              {GRUPOS_RELACION.map((g) => (
                <optgroup key={g.categoria} label={g.categoria}>
                  {g.tipos.map((t) => <option key={t} value={t}>{t}</option>)}
                </optgroup>
              ))}
            </select>
          </Campo>
          <Campo label="Observaciones (opcional)">
            <input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} style={campo} maxLength={500} />
          </Campo>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" disabled={ocupado} onClick={() => void crear()} style={btnStyle('primario')}>
              {ocupado ? 'Guardando…' : 'Guardar relación'}
            </button>
            <button type="button" disabled={ocupado} onClick={() => setAbierto(false)} style={btnStyle('sutil')}>Cancelar</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            Guardar la relación NO autoriza a nadie a ver nada: la autorización se da después, con su botón.
          </div>
        </div>
      )}

      {!elegido && (
        <div>
          <button type="button" onClick={() => setAbierto(false)} style={btnStyle('sutil')}>Cancelar</button>
        </div>
      )}
    </div>
  )
}

// ─── Avisos ──────────────────────────────────────────────────────────────────

function Aviso({ r }: { r: Exclude<RespuestaRelaciones, { estado: 'ok' }> }) {
  const texto =
    r.estado === 'conflicto' ? `Ya están relacionados: ${r.motivo}` :
    r.estado === 'invalido' ? `No se ha guardado: ${r.motivo}` :
    r.estado === 'no_encontrado' ? `No se encuentra la ficha${r.motivo ? `: ${r.motivo}` : ''}.` :
    r.estado === 'sin_configurar' ? 'El puerto con asegura no está conectado (falta ASEGURA_OPERADOR_SECRET).' :
    `No se ha podido hacer: ${textoMotivoRelaciones(r.motivo)}`
  const grave = r.estado === 'error' || r.estado === 'sin_configurar'
  return (
    <div role="alert" style={{ ...pendienteBox, color: grave ? 'var(--negative)' : 'var(--text)', borderColor: grave ? 'var(--negative)' : 'var(--border)' }}>
      {texto}
    </div>
  )
}

// ─── Piezas ──────────────────────────────────────────────────────────────────

function Campo({ label, ayuda, children }: { label: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{label}</span>
      {children}
      {ayuda && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{ayuda}</span>}
    </label>
  )
}

const campo: React.CSSProperties = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', minHeight: 44, padding: '10px 12px',
  borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14,
}
const pendienteBox: React.CSSProperties = {
  fontSize: 13, lineHeight: 1.5, color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: 8, padding: '8px 10px',
}
