'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ETIQUETAS_EMAIL,
  ETIQUETAS_TELEFONO,
  MOTIVO_DOCUMENTO_REQUERIDO,
  documentosAcreditativos,
  etiquetaEstadoDocumento,
  etiquetaTipoDocumento,
  etiquetasIdentidad,
  normalizarEmail,
  normalizarTelefono,
  provinciaPorCp,
  revisarEdicion,
  type ContactoCliente,
  type DocumentoResumen,
  type EdicionCliente,
  type TipoContacto,
} from '@central/module-seguros'
import { Phone, Mail, Star, Plus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { btnStyle, btnIcono } from '@/components/ui'
import BotonWhatsapp from './BotonWhatsapp'
import {
  interpretarEscritura,
  textoMotivo,
  type ContactosCliente,
  type IdentidadFicha,
  type ResultadoEscritura,
} from '@/lib/cliente-edicion-asegura'

/**
 * Editar los datos de un cliente de la correduría, desde la ficha de plataforma.
 *
 * Tres bloques con tres reglas distintas (dictado de Alberto, 02/09/2026):
 *   · Teléfonos y emails: varios, con etiqueta y principal; se cambian libremente.
 *   · Dirección / CP / ciudad / provincia / notas: libres.
 *   · Identidad (DNI, nombre, apellidos, fecha de nacimiento): SOLO con un DNI
 *     recibido en la ficha — «se pide documentado». Sin él, el bloque está
 *     deshabilitado y ofrece «Pedir DNI».
 *
 * Y tres «no lo sé» que NO se pintan como «no tiene»: `contactos === null`
 * (asegura no manda el bloque o no pudo leerlo), `identidad === null` (versión
 * anterior de asegura) y `documentos === null` (no se pudo consultar la
 * documentación). Cada uno se dice con su frase, no con una lista vacía.
 *
 * La BD vive en asegura: aquí se habla con `/api/correduria/cliente` y
 * `/api/correduria/cliente/contactos`, que reenvían al puerto con el secreto.
 */
export default function EditarCliente({
  clienteId,
  contactos,
  identidad,
  contacto,
  documentos,
}: {
  clienteId: string
  contactos: ContactosCliente | null
  identidad: IdentidadFicha | null
  contacto: {
    direccion: string | null
    direccionIlegible: boolean
    codigoPostal: string | null
    ciudad: string | null
    provincia: string | null
  }
  documentos: DocumentoResumen[] | null
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 18 }}>
      <BloqueContactos clienteId={clienteId} inicial={contactos} />
      <BloqueDireccion clienteId={clienteId} contacto={contacto} />
      <BloqueIdentidad clienteId={clienteId} identidad={identidad} documentos={documentos} />
    </div>
  )
}

// ─── Contactos ───────────────────────────────────────────────────────────────

type Pendiente = { body: Record<string, unknown>; r: Extract<ResultadoEscritura, { estado: 'conflicto' }> } | null

function BloqueContactos({ clienteId, inicial }: { clienteId: string; inicial: ContactosCliente | null }) {
  const router = useRouter()
  const [lista, setLista] = useState<ContactosCliente | null>(inicial)
  const [ocupado, setOcupado] = useState(false)
  const [resultado, setResultado] = useState<ResultadoEscritura | null>(null)
  const [pendiente, setPendiente] = useState<Pendiente>(null)
  const [tipo, setTipo] = useState<TipoContacto>('telefono')
  const [valor, setValor] = useState('')
  const [etiqueta, setEtiqueta] = useState<string>(ETIQUETAS_TELEFONO[0])
  const [principal, setPrincipal] = useState(false)
  const [valorMal, setValorMal] = useState<string | null>(null)

  async function llamar(method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown>): Promise<ResultadoEscritura> {
    try {
      const res = await fetch('/api/correduria/cliente/contactos', {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clienteId, ...body }),
      })
      return interpretarEscritura(res.status, await res.json().catch(() => null))
    } catch {
      return { estado: 'error', motivo: 'red' }
    }
  }

  function aplicar(r: ResultadoEscritura) {
    setResultado(r)
    if (r.estado === 'ok') {
      if (r.contactos) setLista(r.contactos)
      router.refresh()
    }
  }

  async function anadir(forzar = false, cuerpo?: Record<string, unknown>) {
    let body = cuerpo
    if (!body) {
      const n = tipo === 'telefono' ? normalizarTelefono(valor) : normalizarEmail(valor)
      if (!n.ok) return setValorMal(n.motivo)
      setValorMal(null)
      body = { tipo, valor: n.valor, etiqueta: etiqueta || null, principal }
    }
    setOcupado(true)
    setPendiente(null)
    try {
      const r = await llamar('POST', { ...body, forzar })
      if (r.estado === 'conflicto' && r.forzable) setPendiente({ body, r })
      aplicar(r)
      if (r.estado === 'ok') {
        setValor('')
        setPrincipal(false)
      }
    } finally {
      setOcupado(false)
    }
  }

  async function hacerPrincipal(id: string) {
    setOcupado(true)
    try {
      aplicar(await llamar('PATCH', { id, principal: true }))
    } finally {
      setOcupado(false)
    }
  }

  async function borrar(c: ContactoCliente) {
    if (!confirm(`¿Borrar ${c.valor ?? 'este contacto'} de la ficha? No se puede deshacer.`)) return
    setOcupado(true)
    try {
      aplicar(await llamar('DELETE', { id: c.id }))
    } finally {
      setOcupado(false)
    }
  }

  const etiquetas: readonly string[] = tipo === 'telefono' ? ETIQUETAS_TELEFONO : ETIQUETAS_EMAIL

  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <h3 style={h3}>Teléfonos y emails</h3>

      {lista === null ? (
        <div style={pendienteBox}>
          ❔ No se han podido leer los teléfonos y emails de esta ficha (asegura no manda el bloque
          o su consulta falló). <strong>No significa que no tenga.</strong> Puedes añadir uno igualmente.
        </div>
      ) : (
        <>
          <ListaContactos titulo="Teléfonos" icono={Phone} items={lista.telefonos} ocupado={ocupado} onPrincipal={hacerPrincipal} onBorrar={borrar} />
          <ListaContactos titulo="Emails" icono={Mail} items={lista.emails} ocupado={ocupado} onPrincipal={hacerPrincipal} onBorrar={borrar} />
        </>
      )}

      {/* 🚨 PLEGADO por defecto, y es lo que más alto ahorra de toda la tarjeta:
          desplegado mide ~246px (dos filas de `campo` porque el 3er `<select>`
          no cabe, + el checkbox de 44 + el botón de 44 + gaps) sobre ~706px de
          pantalla útil en el móvil de Alberto — el 35% para teclear nueve
          dígitos. Y esta ficha se abre para LEER un teléfono y llamar, no para
          añadir uno: el formulario permanente cobraba a las trescientas
          consultas el precio de la vez que se da de alta un contacto.
          `<details>` nativo y no `useState`, como el resto del repo. */}
      <details style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
        <summary style={{ ...btnStyle('secundario'), listStyle: 'none', userSelect: 'none' }}>
          <Plus size={15} strokeWidth={1.75} aria-hidden /> Añadir teléfono o email
        </summary>
      <form
        onSubmit={(e) => { e.preventDefault(); void anadir() }}
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, paddingTop: 10 }}
      >
        <div className="edicion-fila" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select
            value={tipo}
            onChange={(e) => { const t = e.target.value as TipoContacto; setTipo(t); setEtiqueta((t === 'telefono' ? ETIQUETAS_TELEFONO : ETIQUETAS_EMAIL)[0]) }}
            style={{ ...campo, flex: '0 0 auto', width: 'auto' }}
            aria-label="Tipo de contacto"
          >
            <option value="telefono">Teléfono</option>
            <option value="email">Email</option>
          </select>
          <input
            type={tipo === 'telefono' ? 'tel' : 'email'}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder={tipo === 'telefono' ? '600 000 000' : 'nombre@dominio.es'}
            aria-label={tipo === 'telefono' ? 'Teléfono' : 'Email'}
            style={{ ...campo, flex: '1 1 180px', borderColor: valorMal ? 'var(--negative)' : undefined }}
          />
          <select value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} style={{ ...campo, flex: '0 0 auto', width: 'auto' }} aria-label="Etiqueta">
            {etiquetas.map((et) => <option key={et} value={et}>{et}</option>)}
          </select>
        </div>
        {valorMal && <div style={{ fontSize: 12, color: 'var(--negative)' }}>{valorMal}</div>}
        <label style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'center', minHeight: 44 }}>
          <input type="checkbox" checked={principal} onChange={(e) => setPrincipal(e.target.checked)} style={{ width: 18, height: 18 }} />
          Hacerlo el principal (el que sale en la cabecera y en los avisos)
        </label>
        <div>
          <button type="submit" disabled={ocupado || valor.trim() === ''} style={btnStyle('primario')}>
            Añadir {tipo === 'telefono' ? 'teléfono' : 'email'}
          </button>
        </div>
      </form>
      </details>

      <Aviso
        r={resultado}
        ok="Guardado."
        ocupado={ocupado}
        onForzar={pendiente ? () => void anadir(true, pendiente.body) : undefined}
        textoForzar="Añadir igualmente"
      />
    </section>
  )
}

function ListaContactos({ titulo, icono: Icono, items, ocupado, onPrincipal, onBorrar }: {
  titulo: string
  icono: LucideIcon
  items: ContactoCliente[]
  ocupado: boolean
  onPrincipal: (id: string) => void
  onBorrar: (c: ContactoCliente) => void
}) {
  return (
    <div>
      {/* Icono lucide y no emoji: un 📞 a 13px pesa mucho más que el trazo del
          mismo tamaño, y es parte de lo que Alberto leyó como «iconos muy
          grandes» en su captura. Misma decisión que el rediseño del PR #2216. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 2 }}>
        <Icono size={13} strokeWidth={1.75} aria-hidden /> {titulo}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Ninguno en la ficha (se ha mirado).</div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {items.map((c, i) => (
            /* Una LÍNEA con separador fino, no una caja: borde, fondo y radio se
               gastan POR FUNCIÓN (regla de `components/ui.tsx`) y «soy un
               teléfono» no es una función. Y sin `flexWrap`: envolver es lo que
               daba dos alturas a la misma clase de dato (~58px la fila sin
               «Hacer principal», ~84px la que lo llevaba). */
            <li
              key={c.id}
              style={{
                display: 'flex', gap: 8, alignItems: 'center', minHeight: 44,
                borderTop: i === 0 ? undefined : '1px solid var(--border)',
              }}
            >
              <span style={{ flex: '1 1 auto', minWidth: 0, fontSize: 14, overflowWrap: 'anywhere' }}>
                {c.principal && (
                  <Star size={13} strokeWidth={2} fill="currentColor" aria-label="Principal" style={{ marginRight: 4, verticalAlign: -1 }} />
                )}
                <ValorContacto c={c} />
                {c.etiqueta && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>{c.etiqueta}</span>}
              </span>
              {/* Abrir WhatsApp con ese número. Solo aparece en los móviles: un
                  fijo (o un dato cifrado que no se puede leer) no pinta nada. */}
              {c.tipo === 'telefono' && c.valor !== null && <BotonWhatsapp telefono={c.valor} />}
              {!c.principal && (
                <button
                  type="button"
                  disabled={ocupado || c.ilegible}
                  onClick={() => onPrincipal(c.id)}
                  style={btnIcono('sutil')}
                  aria-label={`Hacer principal: ${c.valor ?? 'este contacto'}`}
                  title={c.ilegible ? 'No se puede hacer principal un dato que no se puede leer' : 'Hacer principal'}
                >
                  <Star size={16} strokeWidth={1.75} aria-hidden />
                </button>
              )}
              {/* El destructivo CONSERVA su rótulo a propósito — ver `btnIcono`. */}
              <button type="button" disabled={ocupado} onClick={() => onBorrar(c)} style={{ ...btnStyle('sutil'), color: 'var(--negative)' }}>
                Borrar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ValorContacto({ c }: { c: ContactoCliente }) {
  if (c.valor === null) {
    return (
      <span
        style={{ color: 'var(--muted)', fontStyle: 'italic' }}
        title={c.ilegible
          ? 'Está guardado pero cifrado con una clave que asegura no puede abrir (PII_ENCRYPTION_KEY). No se ha borrado: sigue en la ficha.'
          : 'Sin valor'}
      >
        🔒 {c.ilegible ? 'cifrado' : 'sin valor'}
      </span>
    )
  }
  return c.tipo === 'telefono'
    ? <a href={`tel:${c.valor.replace(/\s/g, '')}`}>{c.valor}</a>
    : <a href={`mailto:${c.valor}`}>{c.valor}</a>
}

// ─── Dirección y notas ───────────────────────────────────────────────────────

type Libre = { direccion: string; codigoPostal: string; ciudad: string; provincia: string; notas: string }

function BloqueDireccion({ clienteId, contacto }: {
  clienteId: string
  contacto: { direccion: string | null; direccionIlegible: boolean; codigoPostal: string | null; ciudad: string | null; provincia: string | null }
}) {
  const router = useRouter()
  const base: Libre = {
    direccion: contacto.direccion ?? '',
    codigoPostal: contacto.codigoPostal ?? '',
    ciudad: contacto.ciudad ?? '',
    provincia: contacto.provincia ?? '',
    notas: '',
  }
  const [inicial, setInicial] = useState<Libre>(base)
  const [f, setF] = useState<Libre>(base)
  const [ocupado, setOcupado] = useState(false)
  const [resultado, setResultado] = useState<ResultadoEscritura | null>(null)
  const [campoMal, setCampoMal] = useState<string | null>(null)

  function set<K extends keyof Libre>(k: K, v: string) {
    setF((prev) => {
      const next = { ...prev, [k]: v }
      // Al teclear el CP se rellena la provincia si está vacía: es la que se
      // corrigió a mano en 32 fichas el 02/09/2026.
      if (k === 'codigoPostal' && prev.provincia.trim() === '') {
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
    // Las notas actuales no llegan a esta pantalla: solo se mandan si se escribe algo.
    if (f.notas.trim() !== '') libre.notas = f.notas
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
        setInicial({ ...f, notas: '' })
        setF((p) => ({ ...p, notas: '' }))
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
      <h3 style={h3}>Dirección y notas</h3>
      {contacto.direccionIlegible && (
        <div style={pendienteBox}>
          🔒 La dirección está guardada pero cifrada con una clave que asegura no puede abrir: no se
          puede mostrar. Si escribes una aquí, sustituirá a la que hay.
        </div>
      )}
      <form onSubmit={guardar} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
        <Campo label="Dirección" mal={campoMal === 'direccion'}>
          <input value={f.direccion} onChange={(e) => set('direccion', e.target.value)} placeholder={contacto.direccionIlegible ? 'cifrada: no se puede leer' : 'Calle, número, piso'} style={campo} />
        </Campo>
        <div className="edicion-fila" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
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
        <Campo label="Notas" mal={campoMal === 'notas'} ayuda="Las notas actuales no se muestran aquí (asegura no las manda a esta pantalla); lo que escribas las sustituye.">
          <textarea value={f.notas} onChange={(e) => set('notas', e.target.value)} rows={3} style={{ ...campo, minHeight: 72, resize: 'vertical' }} />
        </Campo>
        <div>
          <button type="submit" disabled={ocupado} style={btnStyle('primario')}>Guardar dirección y notas</button>
        </div>
      </form>
      <Aviso r={resultado} ok="Guardado." ocupado={ocupado} />
    </section>
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
          ❔ No se ha podido consultar la documentación de esta ficha, y sin saber si hay un DNI
          recibido no se puede ofrecer la edición de identidad. Vuelve a cargar la ficha o mira
          📎 Documentos.
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
      setPedido('Anotado como pedido: cuando llegue, súbelo en 📎 Documentos y este bloque se habilitará.')
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
            en 📎 Documentos.
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
  if (r.estado === 'ok') return <div style={{ ...base, color: 'var(--positive)', background: 'var(--positive-bg)' }}>✅ {ok}</div>
  if (r.estado === 'conflicto') {
    return (
      <div style={{ ...base, color: 'var(--warning)', background: 'var(--warning-bg)' }}>
        ⚠️ Ya está en otra ficha:
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
    return <div style={{ ...base, color: 'var(--negative)', background: 'var(--negative-bg)' }}>{doc ? '🪪' : '✖'} {textoMotivo(r.motivo)}</div>
  }
  if (r.estado === 'no_encontrado') return <div style={{ ...base, color: 'var(--negative)', background: 'var(--negative-bg)' }}>Esa ficha ya no está en la cartera (se ha mirado).</div>
  if (r.estado === 'sin_configurar') {
    return <div style={{ ...base, color: 'var(--muted)', border: '1px dashed var(--border)' }}>⏳ El puerto con asegura no está conectado (falta <code>ASEGURA_OPERADOR_SECRET</code>). No se ha guardado nada.</div>
  }
  return <div style={{ ...base, color: 'var(--negative)', background: 'var(--negative-bg)' }}>⚠️ No se ha podido guardar: {textoMotivo(r.motivo)} No lo leas como «ya está»: no se ha guardado.</div>
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
