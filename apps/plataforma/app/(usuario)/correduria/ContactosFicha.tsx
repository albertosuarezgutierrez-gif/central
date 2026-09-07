'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Pencil, Phone, Plus, Star } from 'lucide-react'
import {
  ETIQUETAS_EMAIL,
  ETIQUETAS_TELEFONO,
  normalizarEmail,
  normalizarTelefono,
  type ContactoCliente,
  type TipoContacto,
} from '@central/module-seguros'
import Bloque from './Bloque'
import BotonWhatsapp from './BotonWhatsapp'
import { btnStyle } from '@/components/ui'
import {
  interpretarEscritura,
  textoMotivo,
  type ContactosCliente,
  type ResultadoEscritura,
} from '@/lib/cliente-edicion-asegura'

/**
 * Los teléfonos y correos de la ficha: leerlos, llamar… y CORREGIRLOS aquí.
 *
 * ─── Por qué la edición vive en la tira y no en el formulario de abajo ───────
 * Hasta el 06/09/2026 esta pestaña pintaba los contactos DOS VECES: la tira de
 * chips arriba (solo lectura) y, dentro del desplegable «Editar datos del
 * cliente», la misma lista otra vez con sus botones. Corregir un dígito era:
 * abrir el desplegable (que monta ~1.115px de formularios de dirección e
 * identidad que no venías a tocar), encontrar la segunda lista y pulsar ahí.
 * Alberto: «el diseño es muy malo… hasta creas otra cosa, ocupa más pantalla».
 * Tenía razón las dos veces: era otra cosa —una segunda lista de lo mismo— y
 * costaba una pantalla entera llegar a ella.
 *
 * Ahora se edita donde está el dato, y el desplegable de abajo se queda con lo
 * que de verdad es un formulario (dirección e identidad).
 *
 * ─── Y por qué un MODO y no un lápiz por chip ───────────────────────────────
 * Un lápiz por chip habría metido ~36px en CADA uno — en 320px eso es justo el
 * ancho que necesita el número para no partirse, y esta pantalla se abre
 * trescientas veces para LEER un teléfono y llamar, y una para corregirlo. Con
 * un interruptor, en modo lectura los chips son los de siempre y el único coste
 * es un botón que cae en el hueco de la última fila de la tira.
 *
 * Los tres estados de `contactos` NO se colapsan: `null` = no se ha podido
 * leer (y entonces no se ofrece corregir lo que no se ve, solo añadir), `[]` =
 * se ha mirado y no hay, lista = los que hay.
 */
export default function ContactosFicha({ clienteId, inicial, espejo, cifradoEnEspejo, children }: {
  clienteId: string
  inicial: ContactosCliente | null
  /** El principal espejado en `clientes`, lo ÚNICO que hay si la lista no se pudo leer. */
  espejo: { tipo: TipoContacto; valor: string }[]
  cifradoEnEspejo: boolean
  /** La dirección, que vive en la misma tarjeta pero la escribe otro formulario. */
  children: React.ReactNode
}) {
  const router = useRouter()
  const [lista, setLista] = useState<ContactosCliente | null>(inicial)
  const [corrigiendo, setCorrigiendo] = useState(false)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [anadiendo, setAnadiendo] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [resultado, setResultado] = useState<ResultadoEscritura | null>(null)
  const [pendiente, setPendiente] = useState<{ method: 'POST' | 'PATCH'; body: Record<string, unknown> } | null>(null)

  const items = lista === null ? [] : [...lista.telefonos, ...lista.emails]

  /**
   * Una sola puerta para las tres escrituras: así el 409 «ese dato ya está en
   * otra ficha» se ofrece igual venga de un alta o de una corrección, y no hay
   * dos caminos que puedan divergir en cuál se puede forzar.
   */
  async function enviar(method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown>, forzar = false): Promise<ResultadoEscritura> {
    setOcupado(true)
    setPendiente(null)
    try {
      let r: ResultadoEscritura
      try {
        const res = await fetch('/api/correduria/cliente/contactos', {
          method,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ clienteId, ...body, ...(forzar ? { forzar: true } : {}) }),
        })
        r = interpretarEscritura(res.status, await res.json().catch(() => null))
      } catch {
        r = { estado: 'error', motivo: 'red' }
      }
      setResultado(r)
      if (r.estado === 'conflicto' && r.forzable && method !== 'DELETE') setPendiente({ method, body })
      if (r.estado === 'ok') {
        if (r.contactos) setLista(r.contactos)
        setAbierto(null)
        setAnadiendo(false)
        router.refresh()
      }
      return r
    } finally {
      setOcupado(false)
    }
  }

  const puedeCorregir = lista !== null && items.length > 0

  return (
    <Bloque
      primero
      titulo="Teléfonos, correos y dirección"
      Icono={Phone}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
        {lista === null && (
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--muted)' }}>
            No se han podido leer los teléfonos y correos de esta ficha (asegura no manda el bloque o su
            consulta falló). <strong>No significa que no tenga.</strong>
            {espejo.length > 0 && ' Lo de abajo es el principal espejado en la ficha, no la lista entera.'}
            {' '}Se puede añadir uno igualmente.
          </p>
        )}

        {items.length + espejo.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', minWidth: 0 }}>
            {items.map(c => (
              <Chip
                key={c.id}
                c={c}
                corrigiendo={corrigiendo}
                onAbrir={() => { setAbierto(c.id); setResultado(null) }}
              />
            ))}
            {espejo.map(e => (
              <Chip
                key={`espejo-${e.tipo}`}
                c={{ id: `espejo-${e.tipo}`, tipo: e.tipo, valor: e.valor, ilegible: false, etiqueta: null, principal: true, creado: '' }}
                corrigiendo={false}
                onAbrir={() => {}}
              />
            ))}
            {/* 🚨 Va DENTRO de la tira, no en la cabecera del bloque: medido a
                390px, «Teléfonos, correos y dirección» + este botón no caben en
                la misma línea y la cabecera pasaba de 20px a 64px. Aquí cae en
                el hueco que deja el último chip y en la mayoría de fichas no
                cuesta ni un píxel. */}
            {puedeCorregir && (
              <button
                type="button"
                onClick={() => { setCorrigiendo(v => !v); setAbierto(null); setResultado(null) }}
                style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}
              >
                {corrigiendo ? 'Listo' : <><Pencil size={14} strokeWidth={1.75} aria-hidden /> Corregir</>}
              </button>
            )}
          </div>
        ) : lista !== null && (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
            Ninguno en la ficha (se ha mirado).
            {cifradoEnEspejo && ' Hay uno guardado cifrado que asegura no puede abrir con la clave que tiene.'}
          </p>
        )}

        {/* El editor de UNO, debajo de la tira: así el chip que se está
            corrigiendo no cambia de sitio ni parte la fila de los demás. */}
        {abierto !== null && (() => {
          const c = items.find(x => x.id === abierto)
          return c ? (
            <EditarUno
              c={c}
              ocupado={ocupado}
              onGuardar={(cambios) => void enviar('PATCH', { id: c.id, ...cambios })}
              onPrincipal={() => void enviar('PATCH', { id: c.id, principal: true })}
              onBorrar={() => {
                if (confirm(`¿Borrar ${c.valor ?? 'este contacto'} de la ficha? No se puede deshacer.`)) void enviar('DELETE', { id: c.id })
              }}
              onCerrar={() => setAbierto(null)}
            />
          ) : null
        })()}

        {corrigiendo && abierto === null && !anadiendo && (
          <div>
            <button type="button" onClick={() => { setAnadiendo(true); setResultado(null) }} style={btnStyle('secundario', 'sm')}>
              <Plus size={14} strokeWidth={1.75} aria-hidden /> Añadir teléfono o email
            </button>
          </div>
        )}
        {anadiendo && (
          <Anadir
            ocupado={ocupado}
            onAnadir={(body) => void enviar('POST', body)}
            onCerrar={() => setAnadiendo(false)}
          />
        )}

        {/* Cuando la lista no se pudo leer no hay nada que corregir, pero sí se
            puede dar de alta: el interruptor de la cabecera no aparece, así que
            la puerta de «añadir» tiene que estar aquí. */}
        {lista === null && !anadiendo && (
          <div>
            <button type="button" onClick={() => setAnadiendo(true)} style={btnStyle('secundario', 'sm')}>
              <Plus size={14} strokeWidth={1.75} aria-hidden /> Añadir teléfono o email
            </button>
          </div>
        )}

        <Aviso
          r={resultado}
          ocupado={ocupado}
          onForzar={pendiente ? () => void enviar(pendiente.method, pendiente.body, true) : undefined}
        />

        {children}
      </div>
    </Bloque>
  )
}

/**
 * Un teléfono o un correo. En lectura es lo que se hace con él —marcar,
 * WhatsApp, escribir—; en modo corrección, el mismo chip abre su editor.
 */
function Chip({ c, corrigiendo, onAbrir }: {
  c: ContactoCliente
  corrigiendo: boolean
  onAbrir: () => void
}) {
  const esTel = c.tipo === 'telefono'
  const Icono = esTel ? Phone : Mail
  // `sm` por el padding (7×12 en vez de 11×16: es lo que permite que dos o tres
  // quepan en una fila de móvil), pero con los 44px táctiles de la regla
  // responsive — el rótulo es el dato, así que `btnIcono` no sirve aquí.
  const base: React.CSSProperties = {
    ...btnStyle('secundario', 'sm'),
    minHeight: 44, maxWidth: '100%', minWidth: 0,
    whiteSpace: 'normal', textAlign: 'left', fontWeight: 500,
  }

  const dentro = (
    <>
      {c.principal && (
        <Star size={12} strokeWidth={2} fill="currentColor" aria-label="Principal" style={{ flex: '0 0 auto' }} />
      )}
      <Icono size={14} strokeWidth={1.75} aria-hidden style={{ flex: '0 0 auto' }} />
      <span style={{ overflowWrap: 'anywhere', minWidth: 0 }}>{c.valor ?? (c.ilegible ? 'cifrado' : 'sin valor')}</span>
      {c.etiqueta && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{c.etiqueta}</span>}
    </>
  )

  if (corrigiendo) {
    return (
      <button type="button" onClick={onAbrir} style={{ ...base, cursor: 'pointer' }} title="Corregir este dato">
        {dentro}
        <Pencil size={13} strokeWidth={1.75} aria-hidden style={{ flex: '0 0 auto', opacity: 0.7 }} />
      </button>
    )
  }

  if (c.valor === null) {
    return (
      <span
        style={{ ...base, borderStyle: 'dashed', borderColor: 'var(--muted)', color: 'var(--muted)', cursor: 'help' }}
        title={c.ilegible
          ? 'Está guardado pero cifrado con una clave que asegura no puede abrir (PII_ENCRYPTION_KEY). No se ha borrado: sigue en la ficha.'
          : 'La ficha tiene la fila pero sin valor.'}
      >
        <Icono size={14} strokeWidth={1.75} aria-hidden />
        {c.ilegible ? 'cifrado' : 'sin valor'}
      </span>
    )
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, maxWidth: '100%', minWidth: 0 }}>
      <a
        href={esTel ? `tel:${c.valor.replace(/\s/g, '')}` : `mailto:${c.valor}`}
        style={{ ...base, textDecoration: 'none' }}
        title={esTel ? `Llamar al ${c.valor}` : `Escribir a ${c.valor}`}
      >
        {dentro}
      </a>
      {/* Solo si el número es un móvil: lo decide `urlWhatsapp`, no esta pantalla. */}
      {esTel && <BotonWhatsapp telefono={c.valor} />}
    </span>
  )
}

/**
 * Corregir UNO. Sale a lo ancho y solo mientras dura: el valor, su etiqueta y
 * las dos cosas que se hacen con él (hacerlo principal, borrarlo).
 *
 * 🚨 La etiqueta solo viaja si se toca. Las que trae CIMA no siempre están en
 * la lista cerrada del repo, y el back convierte a `null` lo que no reconoce:
 * mandarla sin querer la borraría por corregir un dígito.
 */
function EditarUno({ c, ocupado, onGuardar, onPrincipal, onBorrar, onCerrar }: {
  c: ContactoCliente
  ocupado: boolean
  onGuardar: (cambios: Record<string, unknown>) => void
  onPrincipal: () => void
  onBorrar: () => void
  onCerrar: () => void
}) {
  const esTel = c.tipo === 'telefono'
  const [valor, setValor] = useState(c.valor ?? '')
  const [etiqueta, setEtiqueta] = useState<string>(c.etiqueta ?? '')
  const [tocada, setTocada] = useState(false)
  const [mal, setMal] = useState<string | null>(null)
  const etiquetas: readonly string[] = esTel ? ETIQUETAS_TELEFONO : ETIQUETAS_EMAIL

  function guardar() {
    const n = esTel ? normalizarTelefono(valor) : normalizarEmail(valor)
    if (!n.ok) return setMal(n.motivo)
    setMal(null)
    onGuardar({ valor: n.valor, ...(tocada ? { etiqueta: etiqueta || null } : {}) })
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
      {c.ilegible && (
        <div style={pendienteBox}>
          🔒 Este dato está guardado <strong>cifrado con una clave que asegura no puede abrir</strong>, así que
          no se puede enseñar. Lo que escribas aquí lo sustituye.
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          type={esTel ? 'tel' : 'email'}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder={esTel ? '600 000 000' : 'nombre@dominio.es'}
          aria-label={esTel ? 'Teléfono' : 'Email'}
          autoFocus
          style={{ ...campo, flex: '1 1 180px', borderColor: mal ? 'var(--negative)' : undefined }}
        />
        <select
          value={etiqueta}
          onChange={(e) => { setEtiqueta(e.target.value); setTocada(true) }}
          style={{ ...campo, flex: '0 0 auto', width: 'auto' }}
          aria-label="Etiqueta"
        >
          <option value="">sin etiqueta</option>
          {/* La que trae CIMA puede no estar en la lista: se conserva como opción
              para no forzar a cambiarla al abrir el desplegable. */}
          {c.etiqueta && !etiquetas.includes(c.etiqueta) && <option value={c.etiqueta}>{c.etiqueta}</option>}
          {etiquetas.map((et) => <option key={et} value={et}>{et}</option>)}
        </select>
      </div>
      {mal && <div style={{ fontSize: 12, color: 'var(--negative)' }}>{mal}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" disabled={ocupado || valor.trim() === ''} onClick={guardar} style={btnStyle('primario', 'sm')}>
          Guardar
        </button>
        <button type="button" disabled={ocupado} onClick={onCerrar} style={btnStyle('secundario', 'sm')}>
          Cancelar
        </button>
        {!c.principal && (
          <button
            type="button"
            disabled={ocupado || c.ilegible}
            onClick={onPrincipal}
            style={btnStyle('sutil', 'sm')}
            title={c.ilegible ? 'No se puede hacer principal un dato que no se puede leer' : 'El que sale en la cabecera y en los avisos'}
          >
            <Star size={14} strokeWidth={1.75} aria-hidden /> Principal
          </button>
        )}
        {/* El destructivo CONSERVA su rótulo a propósito — ver `btnIcono`. */}
        <button type="button" disabled={ocupado} onClick={onBorrar} style={{ ...btnStyle('sutil', 'sm'), color: 'var(--negative)', marginLeft: 'auto' }}>
          Borrar
        </button>
      </div>
    </div>
  )
}

/** Dar de alta uno. Plegado hasta que se pide: es la vez de cada trescientas. */
function Anadir({ ocupado, onAnadir, onCerrar }: {
  ocupado: boolean
  onAnadir: (body: Record<string, unknown>) => void
  onCerrar: () => void
}) {
  const [tipo, setTipo] = useState<TipoContacto>('telefono')
  const [valor, setValor] = useState('')
  const [etiqueta, setEtiqueta] = useState<string>(ETIQUETAS_TELEFONO[0])
  const [principal, setPrincipal] = useState(false)
  const [mal, setMal] = useState<string | null>(null)
  const etiquetas: readonly string[] = tipo === 'telefono' ? ETIQUETAS_TELEFONO : ETIQUETAS_EMAIL

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const n = tipo === 'telefono' ? normalizarTelefono(valor) : normalizarEmail(valor)
        if (!n.ok) return setMal(n.motivo)
        setMal(null)
        onAnadir({ tipo, valor: n.valor, etiqueta: etiqueta || null, principal })
      }}
      style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 10 }}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
          autoFocus
          style={{ ...campo, flex: '1 1 180px', borderColor: mal ? 'var(--negative)' : undefined }}
        />
        <select value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} style={{ ...campo, flex: '0 0 auto', width: 'auto' }} aria-label="Etiqueta">
          {etiquetas.map((et) => <option key={et} value={et}>{et}</option>)}
        </select>
      </div>
      {mal && <div style={{ fontSize: 12, color: 'var(--negative)' }}>{mal}</div>}
      <label style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'center', minHeight: 44 }}>
        <input type="checkbox" checked={principal} onChange={(e) => setPrincipal(e.target.checked)} style={{ width: 18, height: 18 }} />
        Hacerlo el principal (el que sale en la cabecera y en los avisos)
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="submit" disabled={ocupado || valor.trim() === ''} style={btnStyle('primario', 'sm')}>
          Añadir {tipo === 'telefono' ? 'teléfono' : 'email'}
        </button>
        <button type="button" disabled={ocupado} onClick={onCerrar} style={btnStyle('secundario', 'sm')}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

/**
 * Cómo fue. Un `ok` se calla —el dato ya se ve cambiado en la tira, que es la
 * confirmación de verdad—; lo que no se puede callar es el fallo, y el 409
 * trae con quién choca y si se puede forzar.
 */
function Aviso({ r, ocupado, onForzar }: {
  r: ResultadoEscritura | null
  ocupado: boolean
  onForzar?: () => void
}) {
  if (r === null || r.estado === 'ok') return null

  const texto =
    r.estado === 'conflicto'
      ? `Ese dato ya está en ${r.coincidencias.length === 1 ? 'otra ficha' : `otras ${r.coincidencias.length} fichas`}${r.coincidencias.length > 0 ? `: ${r.coincidencias.map(x => x.nombre).join(' · ')}` : ''}.${r.forzable ? ' Puede ser un matrimonio: se admite a sabiendas.' : ' Como principal no cabe: esa columna es única.'}`
      : r.estado === 'invalido'
        ? r.motivo
        : r.estado === 'no_encontrado'
          ? 'Esa ficha o ese contacto ya no está.'
          : r.estado === 'sin_configurar'
            ? 'asegura no tiene configurada la conexión con la cartera.'
            : `No se pudo guardar: ${textoMotivo(r.motivo)}`

  return (
    <div style={{ ...pendienteBox, borderColor: 'var(--negative)', color: 'var(--negative)' }}>
      {texto}
      {onForzar && (
        <div style={{ marginTop: 8 }}>
          <button type="button" disabled={ocupado} onClick={onForzar} style={btnStyle('secundario', 'sm')}>
            Guardarlo igualmente
          </button>
        </div>
      )}
    </div>
  )
}

const campo: React.CSSProperties = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', minHeight: 44, padding: '10px 12px',
  borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14,
}

const pendienteBox: React.CSSProperties = {
  fontSize: 13, lineHeight: 1.5, color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: 8, padding: '8px 10px',
}
