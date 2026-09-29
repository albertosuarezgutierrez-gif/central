'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  MOTIVO_DOCUMENTO_REQUERIDO,
  documentosAcreditativos,
  etiquetaEstadoDocumento,
  etiquetaTipoDocumento,
  etiquetasIdentidad,
  ibanValido,
  provinciaPorCp,
  revisarEdicion,
  nombrePendiente,
  type DocumentoResumen,
  type EdicionCliente,
} from '@central/module-seguros'
import { AlertTriangle, CheckCircle2, Clock, CreditCard, HelpCircle, IdCard, Lock, Paperclip, X } from 'lucide-react'
import { btnStyle } from '@/components/ui'
import { Ico, FILA } from './iconos'
import {
  interpretarCuentaFicha,
  interpretarEscritura,
  interpretarPonerCuenta,
  textoMotivo,
  type CuentaFichaLeida,
  type ResultadoCuentaFicha,
  type IdentidadFicha,
  type ResultadoEscritura,
} from '@/lib/cliente-edicion-asegura'
import DireccionConfirmable from './DireccionConfirmable'
import CiudadPorCp from './CiudadPorCp'

/**
 * Editar la IDENTIDAD de un cliente de la correduría, desde la ficha de
 * plataforma: DNI, nombre, apellidos y fecha de nacimiento, y SOLO con un DNI
 * recibido en la ficha — «se pide documentado» (dictado de Alberto,
 * 02/09/2026). Sin él, el bloque está deshabilitado y ofrece «Pedir DNI».
 *
 * 🚨 Ni los teléfonos y correos ni la DIRECCIÓN están aquí: se corrigen en la
 * tarjeta de arriba, donde se leen. Los primeros salieron el 06/09/2026 y la
 * dirección el 08/09, por el mismo motivo y con el mismo aviso de Alberto
 * («sigo sin poder modificar dirección clientes»): la edición existía, en un
 * desplegable a pantalla y media del dato, y desde el móvil eso es no existir.
 * El formulario de la dirección lo sigue sirviendo este fichero
 * (`EditarDireccion`, exportado), así que sigue habiendo UN solo sitio donde se
 * escribe — lo que cambia es dónde se pinta.
 *
 * Y dos «no lo sé» que NO se pintan como «no tiene»: `identidad === null`
 * (versión anterior de asegura) y `documentos === null` (no se pudo consultar
 * la documentación). Cada uno se dice con su frase, no con una lista vacía.
 *
 * La BD vive en asegura: aquí se habla con `/api/correduria/cliente` y
 * `/api/correduria/cliente/contactos`, que reenvían al puerto con el secreto.
 */
export default function EditarCliente({
  clienteId,
  identidad,
  documentos,
}: {
  clienteId: string
  identidad: IdentidadFicha | null
  documentos: DocumentoResumen[] | null
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 18 }}>
      <BloqueIdentidad clienteId={clienteId} identidad={identidad} documentos={documentos} />
    </div>
  )
}

// ─── Dirección ───────────────────────────────────────────────────────────────

type Libre = { direccion: string; codigoPostal: string; ciudad: string; provincia: string }

export function EditarDireccion({ clienteId, contacto }: {
  clienteId: string
  contacto: { direccion: string | null; direccionIlegible: boolean; codigoPostal: string | null; ciudad: string | null; provincia: string | null }
}) {
  const router = useRouter()
  const base: Libre = {
    direccion: contacto.direccion ?? '',
    codigoPostal: contacto.codigoPostal ?? '',
    ciudad: contacto.ciudad ?? '',
    provincia: contacto.provincia ?? '',
  }
  const [inicial, setInicial] = useState<Libre>(base)
  const [f, setF] = useState<Libre>(base)
  const [ocupado, setOcupado] = useState(false)
  const [resultado, setResultado] = useState<ResultadoEscritura | null>(null)
  const [campoMal, setCampoMal] = useState<string | null>(null)

  function set<K extends keyof Libre>(k: K, v: string) {
    setF((prev) => {
      const next = { ...prev, [k]: v }
      // CP completo → su provincia, aunque hubiera otra: una provincia que contradice
      // al CP es el error que más se ha visto (386 fichas «Tarragona» con CP 41xxx).
      if (k === 'codigoPostal' && /^\d{5}$/.test(v.trim())) {
        const p = provinciaPorCp(v)
        if (p) next.provincia = p
      }
      return next
    })
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    const libre: NonNullable<EdicionCliente['libre']> = {}
    for (const k of ['direccion', 'codigoPostal', 'ciudad', 'provincia'] as const) {
      if (f[k] !== inicial[k]) libre[k] = f[k].trim() === '' ? null : f[k]
    }
    // Las notas ya no se escriben aquí (este campo SUSTITUÍA la nota entera sin enseñarla): van
    // como lista fechada en la tarjeta «Notas» del Resumen.
    const rev = revisarEdicion({ libre })
    if (!rev.ok) {
      setCampoMal(rev.campo ?? null)
      return setResultado({ estado: 'invalido', motivo: rev.motivo, campo: rev.campo ?? null })
    }
    setCampoMal(null)
    setOcupado(true)
    try {
      const res = await fetch('/api/correduria/cliente', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: clienteId, libre }),
      })
      const r = interpretarEscritura(res.status, await res.json().catch(() => null))
      setResultado(r)
      if (r.estado === 'invalido') setCampoMal(r.campo)
      if (r.estado === 'ok') {
        setInicial(f)
        router.refresh()
      }
    } catch {
      setResultado({ estado: 'error', motivo: 'red' })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <section style={{ display: 'grid', gap: 10 }}>
      {contacto.direccionIlegible && (
        <div style={pendienteBox}>
          <Ico i={Lock} /> La dirección está guardada pero cifrada con una clave que asegura no puede abrir: no se
          puede mostrar. Si escribes una aquí, sustituirá a la que hay.
        </div>
      )}
      <form onSubmit={guardar} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
        <Campo label="Dirección" mal={campoMal === 'direccion'}>
          <DireccionConfirmable
            value={f.direccion}
            onChange={(v) => set('direccion', v)}
            codigoPostal={f.codigoPostal}
            ciudad={f.ciudad}
            placeholder={contacto.direccionIlegible ? 'cifrada: no se puede leer' : 'Calle, número, piso'}
            style={campo}
          />
        </Campo>
        <div className="edicion-fila" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          <Campo label="Código postal" mal={campoMal === 'codigoPostal'}>
            <input value={f.codigoPostal} onChange={(e) => set('codigoPostal', e.target.value)} inputMode="numeric" maxLength={5} placeholder="41003" style={campo} />
          </Campo>
          <Campo label="Ciudad" mal={campoMal === 'ciudad'}>
            <CiudadPorCp cp={f.codigoPostal} ciudad={f.ciudad} onCiudad={(v) => set('ciudad', v)} style={campo} />
          </Campo>
          <Campo label="Provincia" mal={campoMal === 'provincia'}>
            <input value={f.provincia} onChange={(e) => set('provincia', e.target.value)} style={campo} />
          </Campo>
        </div>
        <div>
          <button type="submit" disabled={ocupado} style={btnStyle('primario')}>Guardar dirección</button>
        </div>
      </form>
      <Aviso r={resultado} ok="Guardado." ocupado={ocupado} />
    </section>
  )
}

// ─── Cuenta de cargo ─────────────────────────────────────────────────────────

/**
 * La cuenta de la FICHA (29/09/2026): la que leen la emisión y el bot de Telegram. Alberto la recibe
 * en foto o por WhatsApp y hasta hoy no tenía dónde ponerla. Solo se ve enmascarada («**** 0115») y el
 * IBAN tecleado no se queda en pantalla tras guardarlo.
 *
 * Un cliente puede pagar cada seguro de una cuenta distinta: eso vive en cada póliza
 * (`polizas.cuenta_bancaria`) y esto NO lo toca. La de la ficha es la cuenta por defecto para lo NUEVO.
 */
export function CuentaCargo({ clienteId }: { clienteId: string }) {
  const [leida, setLeida] = useState<CuentaFichaLeida | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [iban, setIban] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [resultado, setResultado] = useState<ResultadoCuentaFicha | null>(null)

  useEffect(() => {
    let vivo = true
    fetch(`/api/correduria/cliente/cuenta?id=${encodeURIComponent(clienteId)}`, { cache: 'no-store' })
      .then(async (res) => interpretarCuentaFicha(res.status, await res.json().catch(() => null)))
      .catch((): CuentaFichaLeida => ({ estado: 'error', motivo: 'red' }))
      .then((r) => { if (vivo) setLeida(r) })
    return () => { vivo = false }
  }, [clienteId])

  const tecleadoValido = ibanValido(iban)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!tecleadoValido) return setResultado({ estado: 'iban_invalido', motivo: 'Ese IBAN no es válido (revisa los dígitos de control).' })
    setOcupado(true)
    try {
      const res = await fetch('/api/correduria/cliente/cuenta', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: clienteId, iban }),
      })
      const r = interpretarPonerCuenta(res.status, await res.json().catch(() => null))
      setResultado(r)
      if (r.estado === 'ok') {
        setIban('')
        setAbierto(false)
        setLeida({ estado: 'ok', mascara: r.mascara, ilegible: false, invalida: false })
      }
    } catch {
      setResultado({ estado: 'error', motivo: 'red' })
    } finally {
      setOcupado(false)
    }
  }

  const tiene = leida?.estado === 'ok' && (leida.mascara !== null || leida.ilegible)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 13, color: 'var(--muted)', minWidth: 0 }}>
        <CreditCard size={14} strokeWidth={1.75} aria-hidden style={{ flex: '0 0 auto', marginTop: 2 }} />
        <span style={{ overflowWrap: 'anywhere' }}>
          {leida === null ? 'Cuenta para pólizas nuevas: consultando…'
            : leida.estado === 'error' ? `Cuenta para pólizas nuevas: no se ha podido consultar (${textoMotivo(leida.motivo)}). No la leas como «no tiene».`
              : leida.mascara && leida.invalida ? `Cuenta para pólizas nuevas: ${leida.mascara}, pero NO es un IBAN válido (cuenta antigua): la emisión no la usará. Pon la buena.`
              : leida.mascara ? `Cuenta para pólizas nuevas: ${leida.mascara}`
                : leida.ilegible ? 'Cuenta para pólizas nuevas guardada pero cifrada: no se puede leer. Si pones otra, la sustituye.'
                  : 'Sin cuenta para pólizas nuevas en la ficha (se ha mirado).'}
        </span>
      </div>
      {resultado?.estado === 'ok' && (
        <div style={{ ...FILA, fontSize: 13, color: 'var(--positive)' }}><Ico i={CheckCircle2} /> Guardada: {resultado.mascara}. Ya la pueden usar la emisión y el bot.</div>
      )}
      {resultado?.estado === 'sin_cambios' && (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Esa cuenta ya era la de la ficha: no se ha cambiado nada.</div>
      )}
      {leida?.estado !== 'error' && (
        <div>
          <button type="button" onClick={() => { setAbierto((v) => !v); setResultado(null) }} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>
            {abierto ? 'Cancelar' : tiene ? 'Cambiar cuenta' : 'Poner cuenta'}
          </button>
        </div>
      )}
      {abierto && (
        <form onSubmit={guardar} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
          <Campo label="IBAN" mal={resultado?.estado === 'iban_invalido'} ayuda="Es la que se usa al emitir una póliza nueva (también por Telegram). Cada póliza que ya tiene conserva su propia cuenta: esto no la cambia.">
            <input
              value={iban}
              onChange={(e) => { setIban(e.target.value); setResultado(null) }}
              autoComplete="off"
              spellCheck={false}
              placeholder="ES00 0000 0000 0000 0000 0000"
              style={campo}
            />
          </Campo>
          {iban.trim() !== '' && !tecleadoValido && (
            <div style={{ fontSize: 12, color: 'var(--negative)' }}>Todavía no es un IBAN válido (dígitos de control).</div>
          )}
          {resultado?.estado === 'iban_invalido' && (
            <div style={{ ...FILA, fontSize: 13, color: 'var(--negative)' }}><Ico i={AlertTriangle} /> {resultado.motivo}</div>
          )}
          {resultado?.estado === 'presupuesto_firmado' && (
            <div style={{ ...FILA, fontSize: 13, color: 'var(--negative)' }}><Ico i={AlertTriangle} /> No se ha cambiado: el cliente firmó la cuenta {resultado.mascara} en un presupuesto aceptado que aún no se ha emitido. Emítelo con esa cuenta o retíralo antes.</div>
          )}
          {resultado?.estado === 'error' && (
            <div style={{ ...FILA, fontSize: 13, color: 'var(--negative)' }}><Ico i={AlertTriangle} /> No se ha guardado: {textoMotivo(resultado.motivo)}</div>
          )}
          <div>
            <button type="submit" disabled={ocupado || !tecleadoValido} style={btnStyle('primario')}>{ocupado ? 'Guardando…' : 'Guardar cuenta'}</button>
          </div>
        </form>
      )}
    </div>
  )
}

// ─── Identidad ───────────────────────────────────────────────────────────────

type Ident = { nombre: string; apellidos: string; dni: string; fechaNacimiento: string }

function BloqueIdentidad({ clienteId, identidad, documentos }: {
  clienteId: string
  identidad: IdentidadFicha | null
  documentos: DocumentoResumen[] | null
}) {
  const router = useRouter()
  const acreditativos = documentosAcreditativos(documentos)
  const base: Ident = {
    nombre: identidad?.nombre ?? '',
    apellidos: identidad?.apellidos ?? '',
    dni: '',
    fechaNacimiento: identidad?.fechaNacimiento ?? '',
  }
  const [inicial, setInicial] = useState<Ident>(base)
  const [f, setF] = useState<Ident>(base)
  const [documentoId, setDocumentoId] = useState<string>(acreditativos[0]?.id ?? '')
  const [ocupado, setOcupado] = useState(false)
  const [resultado, setResultado] = useState<ResultadoEscritura | null>(null)
  const [campoMal, setCampoMal] = useState<string | null>(null)
  const [pedido, setPedido] = useState<string | null>(null)

  if (documentos === null) {
    return (
      <section style={{ display: 'grid', gap: 10 }}>
        <h3 style={h3}>Identidad</h3>
        <div style={pendienteBox}>
          <Ico i={HelpCircle} /> No se ha podido consultar la documentación de esta ficha, y sin saber si hay un DNI
          recibido no se puede ofrecer la edición de identidad. Vuelve a cargar la ficha o mira
          <Ico i={Paperclip} /> Documentos.
        </div>
      </section>
    )
  }

  if (identidad === null) {
    return (
      <section style={{ display: 'grid', gap: 10 }}>
        <h3 style={h3}>Identidad</h3>
        <div style={pendienteBox}>
          asegura no manda los datos de identidad a esta pantalla (versión anterior). No es que la
          ficha no los tenga: hay que desplegar asegura.
        </div>
      </section>
    )
  }

  const habilitado = acreditativos.length > 0

  async function pedirDni() {
    setOcupado(true)
    try {
      const res = await fetch('/api/correduria/documentos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pedir: true, tipo: 'dni', clienteId }),
      })
      const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
      if (!res.ok || !j || j.estado !== 'ok') return setPedido(`No se pudo anotar el pedido (${String(j?.error ?? j?.motivo ?? res.status)}).`)
      setPedido('Anotado como pedido: cuando llegue, súbelo en Documentos y este bloque se habilitará.')
      router.refresh()
    } catch (e) {
      setPedido(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    const ident: NonNullable<EdicionCliente['identidad']> = {}
    if (f.nombre !== inicial.nombre) ident.nombre = f.nombre
    if (f.apellidos !== inicial.apellidos) ident.apellidos = f.apellidos.trim() === '' ? null : f.apellidos
    if (f.dni.trim() !== '') ident.dni = f.dni
    if (f.fechaNacimiento !== inicial.fechaNacimiento) ident.fechaNacimiento = f.fechaNacimiento.trim() === '' ? null : f.fechaNacimiento
    const rev = revisarEdicion({ identidad: ident, documentoId: documentoId || null })
    if (!rev.ok) {
      setCampoMal(rev.campo ?? null)
      return setResultado({ estado: 'invalido', motivo: rev.motivo, campo: rev.campo ?? null })
    }
    setCampoMal(null)
    setOcupado(true)
    try {
      const res = await fetch('/api/correduria/cliente', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: clienteId, identidad: ident, documentoId }),
      })
      const r = interpretarEscritura(res.status, await res.json().catch(() => null))
      setResultado(r)
      if (r.estado === 'invalido') setCampoMal(r.campo)
      if (r.estado === 'ok') {
        setInicial({ ...f, dni: '' })
        setF((p) => ({ ...p, dni: '' }))
        router.refresh()
      }
    } catch {
      setResultado({ estado: 'error', motivo: 'red' })
    } finally {
      setOcupado(false)
    }
  }

  // Los rótulos cambian si es una sociedad: el campo es el mismo, pero pedirle
  // «DNI, apellidos y fecha de nacimiento» a una empresa hace dudar del dato.
  const rot = etiquetasIdentidad(identidad.tipoPersona === 'juridica' || identidad.tipoPersona === 'fisica' ? identidad.tipoPersona : null)
  const placeholderDni = identidad.dniEnmascarado
    ?? (identidad.dniIlegible ? 'cifrado: no se puede leer' : `sin ${rot.documento} en la ficha`)

  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <h3 style={h3}>
        Identidad
        {identidad.tipoPersona && <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400, marginLeft: 8 }}>persona {identidad.tipoPersona}</span>}
      </h3>

      {habilitado ? (
        <Campo label="Documento que acredita el cambio">
          <select value={documentoId} onChange={(e) => setDocumentoId(e.target.value)} style={campo}>
            {acreditativos.map((d) => (
              <option key={d.id} value={d.id}>
                {etiquetaTipoDocumento(d.tipo)} · {d.nombre ?? 'sin nombre'} · {etiquetaEstadoDocumento(d.estado)}
              </option>
            ))}
          </select>
        </Campo>
      ) : (
        <div style={{ ...pendienteBox, display: 'grid', gap: 8 }}>
          <div>
            Para cambiar {rot.documento}, {rot.nombre.toLowerCase()} o {rot.fecha.toLowerCase()} hace falta
            el {rot.pedir} en la ficha (regla: se pide documentado). Ahora mismo no hay ningún {rot.pedir} recibido
            en Documentos.
            {nombrePendiente(identidad.nombre) && ' Para PONER el nombre a esta ficha sin nombre no hace falta: usa «Poner nombre» bajo el título.'}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" disabled={ocupado} onClick={() => void pedirDni()} style={btnStyle('secundario')}>Pedir {rot.pedir}</button>
            {pedido && <span style={{ fontSize: 12 }}>{pedido}</span>}
          </div>
        </div>
      )}

      <form onSubmit={guardar} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
        <fieldset disabled={!habilitado || ocupado} style={{ border: 0, margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, opacity: habilitado ? 1 : 0.6 }}>
          <div className="edicion-fila" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
            <Campo label={rot.nombre} mal={campoMal === 'nombre'}>
              <input value={f.nombre} onChange={(e) => setF((p) => ({ ...p, nombre: e.target.value }))} style={campo} />
            </Campo>
            <Campo label={rot.apellidos} mal={campoMal === 'apellidos'}>
              <input value={f.apellidos} onChange={(e) => setF((p) => ({ ...p, apellidos: e.target.value }))} style={campo} />
            </Campo>
          </div>
          <div className="edicion-fila" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
            <Campo label={rot.documento} mal={campoMal === 'dni'} ayuda={identidad.dniEnmascarado ? 'El actual se muestra enmascarado; escribe el nuevo entero para cambiarlo.' : undefined}>
              <input value={f.dni} onChange={(e) => setF((p) => ({ ...p, dni: e.target.value }))} placeholder={placeholderDni} style={campo} autoComplete="off" />
            </Campo>
            <Campo label={rot.fecha} mal={campoMal === 'fechaNacimiento'} ayuda={identidad.fechaNacimientoIlegible ? 'La actual está cifrada y no se puede leer.' : undefined}>
              <input type="date" value={f.fechaNacimiento} onChange={(e) => setF((p) => ({ ...p, fechaNacimiento: e.target.value }))} style={campo} />
            </Campo>
          </div>
          <div>
            <button type="submit" style={btnStyle('primario')}>Guardar identidad</button>
          </div>
        </fieldset>
      </form>
      <Aviso r={resultado} ok="Guardado, con el documento anotado en el historial." ocupado={ocupado} />
    </section>
  )
}

// ─── Aviso común de las escrituras ───────────────────────────────────────────

function Aviso({ r, ok, ocupado, onForzar, textoForzar }: {
  r: ResultadoEscritura | null
  ok: string
  ocupado: boolean
  onForzar?: () => void
  textoForzar?: string
}) {
  if (r === null) return null
  const base: React.CSSProperties = { fontSize: 13, lineHeight: 1.5, borderRadius: 8, padding: '8px 10px' }
  if (r.estado === 'ok') return <div style={{ ...base, ...FILA, color: 'var(--positive)', background: 'var(--positive-bg)' }}><Ico i={CheckCircle2} /> {ok}</div>
  if (r.estado === 'conflicto') {
    return (
      <div style={{ ...base, color: 'var(--warning)', background: 'var(--warning-bg)' }}>
        <Ico i={AlertTriangle} /> Ya está en otra ficha:
        <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
          {r.coincidencias.map((c) => (
            <li key={`${c.por}-${c.id}`}>
              <Link href={`/correduria/cliente/${c.id}`} style={{ fontWeight: 600 }}>{c.nombre}</Link>
              {' '}<span style={{ color: 'var(--muted)' }}>(por {c.por} · {c.tipo})</span>
            </li>
          ))}
          {r.coincidencias.length === 0 && <li>asegura no dice con cuál.</li>}
        </ul>
        {r.forzable && onForzar ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>Puede ser legítimo (matrimonio, padre e hijo).</span>
            <button type="button" disabled={ocupado} onClick={onForzar} style={btnStyle('secundario')}>{textoForzar ?? 'Continuar igualmente'}</button>
          </div>
        ) : (
          <div>El principal no puede repetirse entre fichas: cambia o quita el principal en la otra ficha antes.</div>
        )}
      </div>
    )
  }
  if (r.estado === 'invalido') {
    const doc = r.motivo === MOTIVO_DOCUMENTO_REQUERIDO
    return <div style={{ ...base, ...FILA, color: 'var(--negative)', background: 'var(--negative-bg)' }}><Ico i={doc ? IdCard : X} /> {textoMotivo(r.motivo)}</div>
  }
  if (r.estado === 'no_encontrado') return <div style={{ ...base, color: 'var(--negative)', background: 'var(--negative-bg)' }}>Esa ficha ya no está en la cartera (se ha mirado).</div>
  if (r.estado === 'sin_configurar') {
    return <div style={{ ...base, ...FILA, color: 'var(--muted)', border: '1px dashed var(--border)' }}><Ico i={Clock} /> El puerto con asegura no está conectado (falta <code>ASEGURA_OPERADOR_SECRET</code>). No se ha guardado nada.</div>
  }
  return <div style={{ ...base, ...FILA, color: 'var(--negative)', background: 'var(--negative-bg)' }}><Ico i={AlertTriangle} /> No se ha podido guardar: {textoMotivo(r.motivo)} No lo leas como «ya está»: no se ha guardado.</div>
}

// ─── Piezas ──────────────────────────────────────────────────────────────────

function Campo({ label, mal, ayuda, children }: { label: string; mal?: boolean; ayuda?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: mal ? 'var(--negative)' : 'var(--muted)', fontWeight: 600 }}>{label}{mal ? ' ·  revisa este campo' : ''}</span>
      {children}
      {ayuda && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{ayuda}</span>}
    </label>
  )
}

const h3: React.CSSProperties = { margin: 0, fontSize: 13, fontWeight: 700 }
const campo: React.CSSProperties = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', minHeight: 44, padding: '10px 12px',
  borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14,
}
const pendienteBox: React.CSSProperties = {
  fontSize: 13, lineHeight: 1.5, color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: 8, padding: '8px 10px',
}
