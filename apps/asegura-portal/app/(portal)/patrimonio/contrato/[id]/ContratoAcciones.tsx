'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

const ERRORES: Record<string, string> = {
  no_encontrado: 'No tienes permiso para hacer esto en este contrato.',
  sin_sesion: 'Tu sesión ha caducado. Vuelve a entrar.',
  demasiadas_peticiones: 'Demasiados intentos seguidos. Prueba más tarde.',
  sin_puente: 'Ahora mismo no podemos guardar los datos del inquilino (servicio sin configurar). No se ha guardado nada.',
  sin_clave: 'Ahora mismo no podemos proteger (cifrar) los datos del inquilino, así que no se ha guardado nada.',
  puente_fallido: 'No hemos podido guardarlo. No se ha guardado nada: inténtalo de nuevo.',
  propuesta_cambiada: 'La propuesta ha cambiado (por ejemplo, se ha publicado un índice nuevo). Recarga la página y revísala.',
  indice_distinto: 'El índice no es el que pacta el contrato: no se aplica.',
  sin_clausula: 'El contrato no pacta actualización de la renta.',
  sin_indice: 'Todavía no tenemos el índice de referencia.',
  ya_aplicada: 'Esa actualización ya estaba aplicada.',
  ya_en_contrato: 'Esa persona ya figura en este contrato.',
}
const mensaje = (e: string | undefined) => ERRORES[e ?? ''] ?? 'No hemos podido hacerlo. Inténtalo de nuevo.'
const etiqueta: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 13, fontWeight: 600, minWidth: 0 }
const fila: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 }

/** Aplica la propuesta tal cual se ve. El servidor la recalcula y, si no coincide, no escribe nada. */
export function AplicarRenta(props: { contratoId: string; desde: string; rentaNuevaCent: number; indice: string; periodo: string }) {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function aplicar() {
    if (!window.confirm('¿Aplicar la nueva renta? Queda anotada y no se puede deshacer desde aquí.')) return
    setEnviando(true)
    setError(null)
    try {
      const res = await fetch(`/api/patrimonio/contratos/${props.contratoId}/renta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desde: props.desde, rentaNuevaCent: props.rentaNuevaCent, indice: props.indice, periodo: props.periodo }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (res.ok) {
        router.refresh()
        return
      }
      setError(mensaje(j.error))
    } catch {
      setError('No hemos podido conectar. Vuelve a intentarlo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {error && <p className="error-linea" role="alert" style={{ margin: 0 }}>{error}</p>}
      <div style={fila}>
        <button type="button" className="boton" style={{ minHeight: 44 }} disabled={enviando} onClick={aplicar}>
          {enviando ? 'Aplicando…' : 'Aplicar actualización'}
        </button>
      </div>
    </div>
  )
}

/** Alta de inquilino. El NIF, correo y teléfono viajan al servidor de Grupo ASegura cifrados en reposo; aquí no se guardan. */
export function AltaInquilino({ contratoId }: { contratoId: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [tipo, setTipo] = useState<'persona' | 'sociedad'>('persona')
  const [papel, setPapel] = useState<'titular' | 'avalista'>('titular')
  const [nombre, setNombre] = useState('')
  const [nif, setNif] = useState('')
  const [email, setEmail] = useState('')
  const [telefono, setTelefono] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Ya hay alguien con ese documento: se propone reutilizarlo (nunca se duplica en silencio).
  const [duplicado, setDuplicado] = useState<{ id: string; nombre: string } | null>(null)

  if (!abierto) {
    return (
      <div style={{ ...fila, marginTop: 12 }}>
        <button type="button" className="boton" style={{ minHeight: 44 }} onClick={() => setAbierto(true)}>Añadir inquilino</button>
      </div>
    )
  }

  async function enviar(e: React.FormEvent | null, reutilizarId: string | null = null) {
    e?.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      const res = await fetch(`/api/patrimonio/contratos/${contratoId}/inquilinos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, papel, nombre, nif, email, telefono, reutilizarId }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string; campo?: string; motivo?: string; id?: string; nombre?: string }
      if (res.ok) {
        // Se vacía el formulario: la PII no se queda en la memoria de la página.
        setNif('')
        setEmail('')
        setTelefono('')
        setNombre('')
        setDuplicado(null)
        setAbierto(false)
        router.refresh()
        return
      }
      if (res.status === 409 && j.error === 'inquilino_duplicado' && typeof j.id === 'string') {
        setDuplicado({ id: j.id, nombre: j.nombre ?? '' })
        return
      }
      setDuplicado(null)
      setError(j.error === 'datos_invalidos' ? (j.motivo ?? `Revisa el campo «${j.campo ?? ''}».`) : mensaje(j.error))
    } catch {
      setError('No hemos podido conectar. Vuelve a intentarlo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)', marginTop: 16 }}>
      <h3 style={{ margin: 0, fontSize: 15 }}>Añadir inquilino</h3>
      <label style={etiqueta}>Es
        <select className="campo" value={tipo} disabled={enviando} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
          <option value="persona">Una persona</option>
          <option value="sociedad">Una sociedad</option>
        </select>
      </label>
      <label style={etiqueta}>Papel en el contrato
        <select className="campo" value={papel} disabled={enviando} onChange={(e) => setPapel(e.target.value as typeof papel)}>
          <option value="titular">Inquilino</option>
          <option value="avalista">Avalista</option>
        </select>
      </label>
      <label style={etiqueta}>{tipo === 'sociedad' ? 'Razón social' : 'Nombre y apellidos'}
        <input className="campo" value={nombre} maxLength={200} required disabled={enviando} onChange={(e) => setNombre(e.target.value)} />
      </label>
      <label style={etiqueta}>{tipo === 'sociedad' ? 'CIF' : 'DNI o NIE'} (opcional)
        <input className="campo" value={nif} maxLength={20} autoComplete="off" disabled={enviando} onChange={(e) => setNif(e.target.value.toUpperCase())} />
      </label>
      <label style={etiqueta}>Correo (opcional; sin él no se le podrá enviar el enlace)
        <input className="campo" type="email" value={email} maxLength={254} autoComplete="off" disabled={enviando} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label style={etiqueta}>Teléfono (opcional)
        <input className="campo" type="tel" value={telefono} maxLength={25} autoComplete="off" disabled={enviando} onChange={(e) => setTelefono(e.target.value)} />
      </label>
      <p className="suave" style={{ fontSize: 13, margin: 0 }}>
        Los datos del inquilino son tuyos: Grupo ASegura los guarda cifrados por encargo tuyo y no los usa para nada más. No le
        enviamos nada hasta que tú lo pidas.
      </p>
      {error && <p className="error-linea" role="alert" style={{ margin: 0 }}>{error}</p>}
      {duplicado && (
        <div role="alert" style={{ display: 'grid', gap: 8 }}>
          <p style={{ margin: 0 }}>
            Ya tienes a {duplicado.nombre ? <strong>{duplicado.nombre}</strong> : 'una persona'} con ese mismo documento. ¿Es la misma? Reutilízala
            y no se duplica.
          </p>
          <div style={fila}>
            <button type="button" className="boton" style={{ minHeight: 44 }} disabled={enviando} onClick={() => void enviar(null, duplicado.id)}>
              Usar la que ya tengo
            </button>
            <button type="button" className="boton boton-secundario" style={{ minHeight: 44 }} disabled={enviando} onClick={() => setDuplicado(null)}>
              Corregir el documento
            </button>
          </div>
        </div>
      )}
      <div style={fila}>
        <button type="submit" className="boton" style={{ minHeight: 44 }} disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar inquilino'}</button>
        <button type="button" className="boton boton-secundario" style={{ minHeight: 44 }} disabled={enviando} onClick={() => setAbierto(false)}>Cancelar</button>
      </div>
    </form>
  )
}

type Pii = { nif: string | null; email: string | null; telefono: string | null; ilegibles: string[] }

/** NIF, correo y teléfono bajo demanda (solo nivel Total). `null` = no lo diste; ilegible = lo hay pero no se puede leer. */
export function VerDatosInquilino({ inquilinoId }: { inquilinoId: string }) {
  const [datos, setDatos] = useState<Pii | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function ver() {
    setCargando(true)
    setError(null)
    try {
      const res = await fetch(`/api/patrimonio/inquilinos/${inquilinoId}`, { cache: 'no-store' })
      const j = (await res.json().catch(() => ({}))) as Pii & { error?: string }
      if (res.ok) setDatos({ nif: j.nif, email: j.email, telefono: j.telefono, ilegibles: Array.isArray(j.ilegibles) ? j.ilegibles : [] })
      else setError(mensaje(j.error))
    } catch {
      setError('No hemos podido conectar. Vuelve a intentarlo.')
    } finally {
      setCargando(false)
    }
  }

  if (datos) {
    const valor = (campo: keyof Omit<Pii, 'ilegibles'>) =>
      datos.ilegibles.includes(campo) ? 'No hemos podido leerlo' : (datos[campo] ?? 'No lo anotaste')
    return (
      <dl style={{ margin: '8px 0 0', display: 'grid', gap: 4, fontSize: 14, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <div><dt className="suave" style={{ display: 'inline' }}>NIF: </dt><dd style={{ display: 'inline', margin: 0, overflowWrap: 'anywhere' }}>{valor('nif')}</dd></div>
        <div><dt className="suave" style={{ display: 'inline' }}>Correo: </dt><dd style={{ display: 'inline', margin: 0, overflowWrap: 'anywhere' }}>{valor('email')}</dd></div>
        <div><dt className="suave" style={{ display: 'inline' }}>Teléfono: </dt><dd style={{ display: 'inline', margin: 0, overflowWrap: 'anywhere' }}>{valor('telefono')}</dd></div>
        <div><button type="button" className="boton boton-secundario" style={{ minHeight: 44, marginTop: 4 }} onClick={() => setDatos(null)}>Ocultar</button></div>
      </dl>
    )
  }
  return (
    <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
      <div style={fila}>
        <button type="button" className="boton boton-secundario" style={{ minHeight: 44 }} disabled={cargando} onClick={ver}>
          {cargando ? 'Cargando…' : 'Ver datos'}
        </button>
      </div>
      {error && <p className="error-linea" role="alert" style={{ margin: 0 }}>{error}</p>}
    </div>
  )
}
