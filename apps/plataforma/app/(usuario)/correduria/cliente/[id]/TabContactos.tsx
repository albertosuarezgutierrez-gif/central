'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IdCard, KeyRound, Mail, MapPin, Phone, Star, Users } from 'lucide-react'
import { etiquetaRol, type ContactoCliente, type PersonaDePolizas, type PersonaFicha } from '@central/module-seguros'
import Bloque from '../../Bloque'
import BotonWhatsapp from '../../BotonWhatsapp'
import EditarCliente from '../../EditarCliente'
import Relaciones from '../../Relaciones'
import { Badge, btnStyle } from '@/components/ui'
import {
  explicarPortal,
  interpretarInvitacion,
  interpretarPortal,
  textoIdentidades,
  textoInvitacion,
  textoMotivoPortal,
  type RespuestaPortal,
} from '@/lib/portal-cliente-asegura'
import type { ContactosCliente } from '@/lib/cliente-edicion-asegura'
import type { ContactoFicha, Ficha, IntervinienteFicha } from '@/lib/ficha-asegura'
import type { RelacionCartera } from '@/lib/relaciones-asegura'
import {
  interpretarQuitarInterviniente,
  textoMotivoInterviniente,
  type RespuestaQuitarInterviniente,
} from '@/lib/intervinientes-asegura'
import { etiquetaPoliza } from './piezas'

/**
 * Con quién se habla de esta ficha: **una sola lista de personas** y los datos
 * de la propia ficha.
 *
 * 🚨 Hasta el 05/09/2026 eran DOS tarjetas —👤 quién sale en sus pólizas (lo que
 * dice CIMA) y 👪 los vínculos declarados (lo nuestro)— y la misma persona salía
 * en las dos sin que nada lo dijera: el conductor habitual arriba, el
 * administrador autorizado abajo, y cruzarlas era cosa del que miraba. La
 * pregunta que traen es una sola: «¿a quién llamo y con qué derecho?».
 *
 * La fusión la hace `unificarPersonas` (módulo puro, testeado) **por FICHA y
 * nunca por nombre**, y cada fila conserva sus dos caras por separado: fundir la
 * procedencia sería borrar de dónde sale cada dato, y solo el vínculo abre las
 * pólizas en el portal del cliente.
 *
 * El reparto de responsabilidades: `Relaciones` es el dueño de la lista y de
 * todo lo que se escribe en `cliente_relaciones`; lo que se puede hacer con los
 * PAPELES de una persona en las pólizas (quitarla de una) se le pasa como
 * `renderPapeles`, porque es otra API —`/api/correduria/intervinientes`— y su
 * estado vive aquí.
 *
 * ── Densidad (05/09/2026) ────────────────────────────────────────────────────
 * Alberto: «la pantalla de contactos está muy mal aprovechada, ocupa todo
 * mucho». Medido sobre los estilos declarados, a 390px de ancho:
 *
 *   · Las dos tarjetas costaban **130px** de puro marco (borde + radio 12 +
 *     padding 14 + rótulo 14/700 + su margen, ×2, más el `gap:16` de la página)
 *     ANTES de un solo dato — y dentro pintaban más cajas (`bloqueVinculo` de
 *     `Relaciones`, la de «Añadir», tres `pendienteBox` de `EditarCliente`):
 *     caja dentro de caja dentro de caja. Ahora son bloques de línea fina +
 *     título (`Bloque.tsx`): borde, fondo y sombra se gastan POR FUNCIÓN, y
 *     «soy una sección» no es una función.
 *   · «✏️ Datos del cliente» son **~1.115px de FORMULARIO permanente** (226 la
 *     lista + alta de contactos, 436 dirección y notas, 361 identidad, 36 de
 *     separación entre los tres y 57 de marco) — más de una pantalla de móvil
 *     (706px útiles) de campos vacíos en la pestaña que se abre para
 *     LEER un teléfono y llamar. Y es coste FIJO: no crece con los datos. Se
 *     pliega, con montaje perezoso (un `<details>` cerrado igualmente monta
 *     todo su DOM) y **declarando en el rótulo lo que no se ha podido leer**,
 *     que es la única parte de ahí dentro que reclama una acción.
 *   · Lo que ese formulario ENSEÑA —los teléfonos y correos de la ficha— sube
 *     arriba como tira de chips: en la cartera viva hay de media 0,85 teléfonos
 *     y 0,73 correos por ficha (máximo 2 y 2, medido el 05/09/2026), o sea que
 *     la lista editable gastaba ~226px de dos cabeceras y filas de 44px para
 *     enseñar 1,58 datos. Los chips envuelven, así que en un móvil ocupan una o
 *     dos filas y en un escritorio una sola: es la parte del ancho que estaba
 *     sin usar.
 *
 * Es un client component porque desde aquí se QUITA a una persona de una póliza
 * (03/09/2026). Todo lo que recibe son datos planos del puerto; la página que lo
 * monta sigue siendo server.
 */
export default function TabContactos({ ficha, personas }: {
  ficha: Ficha
  /** `null` = asegura no pudo leer quién interviene; NO es «no hay nadie». */
  personas: PersonaDePolizas[] | null
}) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [resultado, setResultado] = useState<RespuestaQuitarInterviniente | null>(null)

  const filas = ficha.intervinientes ?? []
  const idsPorEtiqueta = etiquetasDePolizas(ficha)

  async function quitar(fila: IntervinienteFicha, quien: string, dondePoliza: string) {
    if (fila.id === null) return
    if (!confirm(
      `¿Quitar a ${quien} de la póliza ${dondePoliza}? Deja de figurar ahí como ${etiquetaRol(fila.rol)}. ` +
      'El resto de sus pólizas no se tocan.',
    )) return
    setOcupado(fila.id)
    setResultado(null)
    try {
      const res = await fetch('/api/correduria/intervinientes', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ intervinienteId: fila.id }),
      })
      const r = interpretarQuitarInterviniente(res.status, await res.json().catch(() => null))
      setResultado(r)
      // La lista la calcula la página con la ficha entera: se recarga en vez de
      // recomponerla aquí, que es lo que ya hacen las otras escrituras de la ficha.
      if (r.estado === 'ok') router.refresh()
    } catch {
      setResultado({ estado: 'error', motivo: 'red' })
    } finally {
      setOcupado(null)
    }
  }

  /** Lo que dice CIMA de una persona: un papel por póliza, con lo que se puede
   *  hacer con él. Va como render-prop dentro de la fila que pinta `Relaciones`. */
  function renderPapeles(p: PersonaFicha<RelacionCartera>) {
    const quien = p.nombre ?? 'esta persona'
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4, fontSize: 13 }}>
        {papelesDe(p).map((papel, n) => (
          <Papel
            key={`${papel.rol}-${papel.etiqueta ?? ''}-${n}`}
            papel={papel}
            quien={quien}
            linea={lineaDe(p, papel.rol, papel.etiqueta, filas, idsPorEtiqueta)}
            ocupado={ocupado}
            onQuitar={quitar}
          />
        ))}
      </div>
    )
  }

  return (
    // `minmax(0, 1fr)` para que la pista implícita no se dimensione con el hijo
    // más ancho y arrastre la página entera en un móvil (regla del CLAUDE.md raíz).
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)' }}>
      {/* A quién se llama, en una línea. Es lo primero porque es a lo que se
          entra: leer un teléfono y marcarlo. */}
      <Bloque primero titulo="Teléfonos, correos y dirección" Icono={Phone}>
        <Contacto contactos={ficha.contactos} contacto={ficha.contacto} />
      </Bloque>

      {/* Si entra —o puede entrar— a ver sus seguros por su cuenta. Va aquí y no
          en otra pestaña porque la respuesta depende de lo de arriba: sin correo
          no hay invitación que mandar. */}
      <Bloque titulo="Portal del cliente" Icono={KeyRound}>
        <Portal clienteId={ficha.id} nombre={ficha.nombre} />
      </Bloque>

      {/* UNA lista: quién sale en sus pólizas y quién tiene vínculo declarado. */}
      <Bloque titulo="Personas" Icono={Users}>
        <Relaciones
          clienteId={ficha.id}
          nombreFicha={ficha.nombre}
          inicial={ficha.relaciones}
          personas={personas}
          renderPapeles={renderPapeles}
          tipoPersona={tipoPersonaDe(ficha)}
        />
        {resultado && resultado.estado !== 'ok' && <Aviso r={resultado} />}
      </Bloque>

      {/* Editar: contactos (libres), dirección (libre) e identidad (solo con DNI recibido). */}
      <Editor ficha={ficha} />
    </div>
  )
}

// ─── Teléfonos, correos y dirección de la PROPIA ficha ───────────────────────

/**
 * La tira de contacto: lo que se LEE de la ficha, sin el formulario que lo
 * edita (ese vive plegado abajo, en `EditarCliente`, que sigue siendo el dueño
 * de la escritura). Aquí no se toca nada: son enlaces `tel:`/`mailto:` y el
 * botón de WhatsApp, cada uno con su área táctil de 44px.
 *
 * Los tres estados de `contactos` NO se colapsan:
 *   `null` → asegura no manda el bloque o su consulta falló. Se dice, y se
 *            pinta lo único que sí ha llegado: el principal espejado en la
 *            ficha (`clientes.telefono/email`).
 *   `[]`   → se ha mirado y no hay ninguno.
 *   lista  → los que hay, con ⭐ el principal.
 * Y un contacto GUARDADO pero cifrado («la clave PII no lo abre») no es un
 * contacto que falte: se pinta en hueco, porque se arregla en otro sitio.
 */
function Contacto({ contactos, contacto }: {
  contactos: ContactosCliente | null
  contacto: ContactoFicha
}) {
  const lista = contactos === null ? [] : [...contactos.telefonos, ...contactos.emails]
  // Con la lista ilegible, el espejo de la ficha es lo único que hay. Cuando SÍ
  // llega la lista no se mezcla: el principal ya está dentro, y pintarlo aparte
  // lo duplicaría.
  const espejo = contactos === null
    ? [
        contacto.telefono && { tipo: 'telefono' as const, valor: contacto.telefono },
        contacto.email && { tipo: 'email' as const, valor: contacto.email },
      ].filter((x): x is { tipo: 'telefono' | 'email'; valor: string } => Boolean(x))
    : []
  const cifradoEnEspejo = contacto.telefonoIlegible || contacto.emailIlegible

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
      {contactos === null && (
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--muted)' }}>
          No se han podido leer los teléfonos y correos de esta ficha (asegura no manda el bloque o su
          consulta falló). <strong>No significa que no tenga.</strong>
          {espejo.length > 0 && ' Lo de abajo es el principal espejado en la ficha, no la lista entera.'}
          {' '}Se puede añadir uno igualmente abajo, en «Editar datos del cliente».
        </p>
      )}

      {lista.length + espejo.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', minWidth: 0 }}>
          {lista.map(c => <Chip key={c.id} c={c} />)}
          {espejo.map(e => (
            <Chip
              key={`espejo-${e.tipo}`}
              c={{ id: `espejo-${e.tipo}`, tipo: e.tipo, valor: e.valor, ilegible: false, etiqueta: null, principal: true, creado: '' }}
            />
          ))}
        </div>
      ) : contactos !== null && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          Ninguno en la ficha (se ha mirado).
          {cifradoEnEspejo && ' Hay uno guardado cifrado que asegura no puede abrir con la clave que tiene.'}
        </p>
      )}

      <Direccion c={contacto} />
    </div>
  )
}

/** Un teléfono o un correo, con lo que se hace con él: marcar, WhatsApp o escribir. */
function Chip({ c }: { c: ContactoCliente }) {
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
        {c.principal && (
          <Star size={12} strokeWidth={2} fill="currentColor" aria-label="Principal" style={{ flex: '0 0 auto' }} />
        )}
        <Icono size={14} strokeWidth={1.75} aria-hidden style={{ flex: '0 0 auto' }} />
        <span style={{ overflowWrap: 'anywhere', minWidth: 0 }}>{c.valor}</span>
        {c.etiqueta && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{c.etiqueta}</span>}
      </a>
      {/* Solo si el número es un móvil: lo decide `urlWhatsapp`, no esta pantalla.
          SIN `compacto`: los 32px son para cuando va incrustado en un renglón de
          texto denso (la cabecera). Aquí es una acción por derecho propio al lado
          de un chip que ya mide 44, así que no hay renglón que partir y se queda
          el área táctil completa. */}
      {esTel && <BotonWhatsapp telefono={c.valor} />}
    </span>
  )
}

/** Dónde vive. La calle va cifrada en la BD: «no se puede leer» ≠ «no consta». */
function Direccion({ c }: { c: ContactoFicha }) {
  const sitio = [[c.codigoPostal, c.ciudad].filter(Boolean).join(' '), c.provincia].filter(Boolean).join(', ')
  const texto = [c.direccion, sitio].filter(Boolean).join(' · ')
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 13, color: 'var(--muted)', minWidth: 0 }}>
      <MapPin size={14} strokeWidth={1.75} aria-hidden style={{ flex: '0 0 auto', marginTop: 2 }} />
      {c.direccionIlegible ? (
        <span title="Está guardada pero cifrada con una clave que asegura no puede abrir. No se ha borrado.">
          La calle está guardada y no se puede leer (cifrada){sitio ? ` · ${sitio}` : ''}
        </span>
      ) : texto ? (
        <span style={{ overflowWrap: 'anywhere' }}>{texto}</span>
      ) : (
        <span>No consta dirección en la ficha (se ha mirado).</span>
      )}
    </div>
  )
}

// ─── El portal del cliente ───────────────────────────────────────────────────

/**
 * ¿Este cliente entra al portal (`apps/asegura-portal`) a ver sus seguros? Y si
 * no, ¿se le puede invitar?
 *
 * 🚨 Por qué esto PREGUNTA antes de ofrecer el botón. El portal vincula a una
 * persona con su ficha por el índice ciego de su email, y solo si no es
 * ambiguo. Así que hay un modo de fallo PEOR que no invitar: invitar a alguien
 * cuyo correo no resuelve a esta ficha. Recibe el correo, entra, teclea su
 * código… y ve una bóveda VACÍA, sin ningún error, como si no tuviera pólizas.
 * Le habríamos dicho «aquí están tus seguros» y dentro no hay nada.
 *
 * Los siete estados no se colapsan en «no se puede invitar» porque cada uno se
 * arregla en un sitio distinto: pedirle el correo al cliente · resolver un
 * duplicado · mirar una variable de Vercel · volver a intentarlo. La frase de
 * cada uno sale de `explicarPortal` (puro y con test), no de este JSX.
 *
 * ⏳ Y **cargando NO es un fallo**: mientras se pregunta se dice que se está
 * preguntando, sin alarma ni botón. Pintar «no se ha podido comprobar» durante
 * la carga sería inventar una avería una vez por visita.
 */
function Portal({ clienteId, nombre }: { clienteId: string; nombre: string }) {
  const [datos, setDatos] = useState<RespuestaPortal | null>(null)
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<{ texto: string; ok: boolean } | null>(null)

  const consultar = useCallback(async () => {
    setCargando(true)
    try {
      const res = await fetch(`/api/correduria/cliente/portal?clienteId=${encodeURIComponent(clienteId)}`, {
        cache: 'no-store',
      })
      setDatos(interpretarPortal(res.status, await res.json().catch(() => null)))
    } catch {
      setDatos({ estado: 'error', motivo: 'red' })
    } finally {
      setCargando(false)
    }
  }, [clienteId])

  // El GET es gratis (no manda nada a nadie), así que se pregunta al abrir la
  // pestaña. El POST, que escribe a una persona real, solo lo dispara un clic.
  useEffect(() => { void consultar() }, [consultar])

  async function invitar() {
    setEnviando(true)
    setAviso(null)
    try {
      const res = await fetch('/api/correduria/cliente/portal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clienteId }),
      })
      const r = interpretarInvitacion(res.status, await res.json().catch(() => null))
      setAviso({ texto: textoInvitacion(r, nombre), ok: r.estado === 'ok' })
      // Tras un envío con éxito se vuelve a PREGUNTAR en vez de suponer el
      // estado nuevo: si ya entraba pasará a decir su último acceso, y si era
      // una invitación seguirá diciendo que no entra nadie — porque el acceso
      // lo abre el cliente con su código, no este botón.
      if (r.estado === 'ok') await consultar()
    } catch {
      setAviso({ texto: textoInvitacion({ estado: 'error', motivo: 'red' }, nombre), ok: false })
    } finally {
      setEnviando(false)
    }
  }

  const marco: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, minWidth: 0 }
  const sutil: React.CSSProperties = { margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--muted)' }

  if (datos === null) {
    return (
      <div style={marco}>
        <p style={sutil}>Comprobando si {nombre} entra al portal…</p>
      </div>
    )
  }

  if (datos.estado !== 'ok') {
    // Ninguno de estos es «no tiene acceso»: son «no se ha podido mirar» (o el
    // id ya no existe), y por eso llevan el botón de volver a preguntar en vez
    // de un cartel rojo que invita a llamar al cliente.
    const texto =
      datos.estado === 'no_encontrado'
        ? 'asegura dice que esta ficha ya no está en la correduría, así que no se puede mirar su acceso al portal.'
        : datos.estado === 'sin_configurar'
          ? 'El puerto con asegura no está conectado (falta ASEGURA_OPERADOR_SECRET). No significa que este cliente no entre al portal: es que no se ha podido preguntar.'
          : datos.estado === 'invalido'
            ? `No se ha podido consultar: ${datos.motivo}`
            : `No se ha podido comprobar si entra al portal: ${textoMotivoPortal(datos.motivo)} No significa que no pueda entrar.`
    return (
      <div style={marco}>
        <p style={sutil}>{texto}</p>
        <div>
          <button type="button" disabled={cargando} onClick={() => void consultar()} style={{ ...btnStyle('sutil'), minHeight: 44 }}>
            {cargando ? 'comprobando…' : 'Volver a comprobar'}
          </button>
        </div>
      </div>
    )
  }

  const frase = explicarPortal(datos.portal)
  return (
    <div style={marco}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline', minWidth: 0 }}>
        {/* El titular NO va en un `Badge`: ese lleva `whiteSpace: 'nowrap'` y el
            de `ya_entra` arrastra la fecha dentro («Ya entra al portal · última
            vez el 3 de septiembre de 2026»), que a 320px se sale de la pantalla
            entera. Aquí el color lo dice todo y el texto puede partirse. */}
        <span style={{ fontSize: 13, fontWeight: 600, color: COLOR_PORTAL[frase.tono], overflowWrap: 'anywhere', minWidth: 0 }}>
          {frase.titulo}
        </span>
        {/* `null` = no se pudo contar, y lo dice con esas palabras: 0 sería una
            afirmación («no entra nadie») sobre algo que no se ha mirado. */}
        <span style={{ fontSize: 12, color: 'var(--muted)', overflowWrap: 'anywhere', minWidth: 0 }}>
          {textoIdentidades(datos.portal.identidades)}
        </span>
      </div>

      <p style={{ ...sutil, maxWidth: '72ch' }}>{frase.queHacer}</p>

      {frase.accion !== 'ninguna' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={enviando || cargando}
            onClick={() => void invitar()}
            // `whiteSpace: 'normal'` + 44px: el rótulo lleva el nombre del
            // cliente dentro y a 320px tiene que poder partirse sin desbordar.
            style={{
              ...btnStyle(frase.accion === 'invitar' ? 'primario' : 'secundario'),
              whiteSpace: 'normal', textAlign: 'left', minHeight: 44,
            }}
          >
            {enviando
              ? 'enviando…'
              : frase.accion === 'invitar'
                ? `✉️ Invitar a ${nombre} al portal`
                : `✉️ Reenviarle el enlace a ${nombre}`}
          </button>
        </div>
      )}

      {/* El desenlace, pegado al botón que lo produjo. El texto sale de
          `textoInvitacion` (puro y con test): un «enviado» no puede salir de un
          desenlace que no envió nada. */}
      {aviso && (
        <div role="status" style={{ fontSize: 12, color: aviso.ok ? 'var(--positive)' : 'var(--warning)', overflowWrap: 'anywhere' }}>
          {aviso.texto}
        </div>
      )}
    </div>
  )
}

/** El tono del estado → su token. Nada de hex: en oscuro un verde fijo deja de leerse. */
const COLOR_PORTAL: Record<'neutral' | 'positivo' | 'negativo' | 'aviso', string> = {
  neutral: 'var(--text)',
  positivo: 'var(--positive)',
  negativo: 'var(--negative)',
  aviso: 'var(--warning)',
}

// ─── El formulario, plegado ──────────────────────────────────────────────────

/**
 * `EditarCliente` son ~1.115px de campos permanentes que no dependen de los
 * datos del cliente, en una pestaña que se abre para leer un teléfono. Se
 * pliega — pero plegar NO puede esconder trabajo: lo que ahí dentro es un «no
 * se ha podido leer» (y por tanto lo único que reclama una acción) sube al
 * rótulo. `<details>` nativo, como el resto del repo, con montaje perezoso:
 * uno cerrado igualmente crea todo su DOM, y aquí eso son tres formularios.
 */
function Editor({ ficha }: { ficha: Ficha }) {
  const [abierto, setAbierto] = useState(false)
  // Una vez montado se queda: cerrar el desplegable no puede tirar lo que el
  // usuario llevara escrito en el formulario.
  const [montado, setMontado] = useState(false)

  const huecos: string[] = []
  if (ficha.contactos === null) huecos.push('teléfonos y correos')
  if (ficha.identidad === null) huecos.push('identidad')
  if (ficha.documentos === null) huecos.push('documentación')
  if (ficha.contacto.direccionIlegible) huecos.push('dirección (cifrada)')

  return (
    <details
      onToggle={(e) => { const o = e.currentTarget.open; setAbierto(o); if (o) setMontado(true) }}
      style={{ borderTop: '1px solid var(--border)', marginTop: 20, paddingTop: 20 }}
    >
      <summary
        style={{
          cursor: 'pointer', listStyle: 'none', userSelect: 'none', minHeight: 44,
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}
      >
        <IdCard size={15} strokeWidth={1.75} aria-hidden />
        <span style={{ fontSize: 14, fontWeight: 700 }}>Editar datos del cliente</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>teléfonos y correos · dirección · identidad</span>
        {huecos.length > 0 && (
          <Badge tono="aviso" title={`No se ha podido leer: ${huecos.join(' · ')}. No es que la ficha no lo tenga.`}>
            {huecos.length === 1 ? `sin leer: ${huecos[0]}` : `${huecos.length} datos sin leer`}
          </Badge>
        )}
        <span style={{ ...btnStyle('sutil', 'sm'), marginLeft: 'auto' }}>{abierto ? 'Cerrar' : 'Abrir'}</span>
      </summary>
      {montado && (
        <div style={{ marginTop: 14 }}>
          <EditarCliente
            clienteId={ficha.id}
            contactos={ficha.contactos}
            identidad={ficha.identidad}
            contacto={ficha.contacto}
            documentos={ficha.documentos}
          />
        </div>
      )}
    </details>
  )
}

/** Qué es la ficha, para ofrecer primero los vínculos de empresa en una sociedad.
 *  Solo se afirma con lo que asegura manda: `null` es «no se sabe», y adivinarlo
 *  por el nombre es justo lo que la regla de identidad prohíbe. */
function tipoPersonaDe(ficha: Ficha): 'fisica' | 'juridica' | null {
  const t = ficha.identidad?.tipoPersona
  return t === 'fisica' || t === 'juridica' ? t : null
}

/** Lo que `lineaDe` necesita saber de una persona: su identidad, nada más. */
type PersonaMinima = { fichaId: string | null; nombre: string | null }

/** Un papel («conductor ocasional del 1234ABC») con lo que se puede hacer con él. */
function Papel({ papel, quien, linea, ocupado, onQuitar }: {
  papel: { rol: string; etiqueta: string | null }
  quien: string
  linea: Coincidencia
  ocupado: string | null
  onQuitar: (fila: IntervinienteFicha, quien: string, dondePoliza: string) => void
}) {
  const texto = `${etiquetaRol(papel.rol)}${papel.etiqueta ? ` del ${papel.etiqueta}` : ''}`
  // En un `const`, el estrechamiento del union sobrevive dentro del `onClick`.
  const fila = linea.estado === 'unica' ? linea.fila : null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <span style={{ color: 'var(--muted)', overflowWrap: 'anywhere' }}>{texto}</span>

      {/* Una línea de CIMA no se ofrece para quitar: el puerto la rechaza con un
          409 porque el siguiente pull la recrearía. Se dice, en vez de pintar un
          botón que va a fallar. Medido el 05/09/2026: las 96 filas de la cartera
          viva son de CIMA, así que hoy este es el caso NORMAL y no la excepción
          — de ahí que sea texto de 11px y no una caja. */}
      {fila?.origen === 'cima' && (
        <span
          style={{ fontSize: 11, color: 'var(--muted)' }}
          title="Esta línea la manda CIMA. Borrarla aquí no serviría: el siguiente pull la vuelve a crear. Para quitarla hay que corregirlo en la compañía."
        >
          · la manda CIMA
        </span>
      )}

      {fila !== null && fila.origen !== 'cima' && fila.id !== null && (
        <button
          type="button"
          disabled={ocupado !== null}
          onClick={() => onQuitar(fila, quien, papel.etiqueta ?? 'esta póliza')}
          // Área táctil completa: es un borrado, y encogerla para ganar 10px
          // es justo donde NO se recorta (ver `btnIcono` en components/ui.tsx).
          style={{ ...btnStyle('sutil'), fontSize: 12 }}
        >
          {ocupado === fila.id ? 'quitando…' : 'quitar'}
        </button>
      )}

      {/* Sin id no hay nada que mandar al puerto: se declara el hueco en vez de
          callarlo (asegura de una versión anterior). */}
      {fila !== null && fila.origen !== 'cima' && fila.id === null && (
        <span
          style={{ fontSize: 11, color: 'var(--muted)' }}
          title="La versión desplegada de asegura no manda el id de la línea, y sin él no se puede decir cuál quitar."
        >
          · no se puede quitar desde aquí
        </span>
      )}

      {linea.estado === 'ambigua' && (
        <span
          style={{ fontSize: 11, color: 'var(--muted)' }}
          title="Hay más de una línea que encaja con esta persona en esa póliza y no se puede distinguir cuál es. Quitar la que no es sería peor que no quitar ninguna."
        >
          · no se distingue cuál quitar
        </span>
      )}
    </div>
  )
}

function Aviso({ r }: { r: Exclude<RespuestaQuitarInterviniente, { estado: 'ok' }> }) {
  // El motivo del puerto se pinta TAL CUAL: el 409 de CIMA ya explica por qué no
  // se puede, y reescribirlo aquí sería inventar una razón distinta de la real.
  const texto =
    r.estado === 'invalido' ? `No se ha quitado: ${r.motivo}` :
    r.estado === 'no_encontrado' ? `Esa línea ya no está${r.motivo ? `: ${r.motivo}` : ''}.` :
    r.estado === 'sin_configurar' ? 'El puerto con asegura no está conectado (falta ASEGURA_OPERADOR_SECRET).' :
    `No se ha podido quitar: ${textoMotivoInterviniente(r.motivo)}`
  const grave = r.estado === 'error' || r.estado === 'sin_configurar'
  return (
    <div
      role="alert"
      style={{
        marginTop: 10,
        border: `1px solid ${grave ? 'var(--negative)' : 'var(--border)'}`,
        color: grave ? 'var(--negative)' : 'var(--text)',
        borderRadius: 10, padding: '10px 12px', fontSize: 13,
      }}
    >
      {texto}
    </div>
  )
}

/**
 * Qué línea de `poliza_intervinientes` es un papel de la lista.
 *
 * `ninguna` NO es «no existe»: es «no se puede afirmar cuál es», y entonces no
 * se ofrece ningún botón. Es deliberadamente conservador — `personasDePolizas`
 * agrupa por NIF y aquí solo se ve la ficha y el nombre, así que ante la duda no
 * se ofrece quitar nada: borrar la línea equivocada mezcla los papeles de dos
 * personas distintas y no se ve (regla «agrupar por IDENTIDAD, nunca por la
 * etiqueta» del CLAUDE.md raíz).
 */
type Coincidencia =
  | { estado: 'unica'; fila: IntervinienteFicha }
  | { estado: 'ambigua' }
  | { estado: 'ninguna' }

function lineaDe(
  persona: PersonaMinima,
  rol: string,
  etiqueta: string | null,
  filas: IntervinienteFicha[],
  idsPorEtiqueta: Map<string, string[]>,
): Coincidencia {
  // Sin etiqueta no se sabe de qué póliza sale el papel; y una etiqueta que
  // apunta a dos pólizas (dos sin matrícula ni número, del mismo ramo y
  // compañía) tampoco distingue.
  if (etiqueta === null) return { estado: 'ninguna' }
  const ids = idsPorEtiqueta.get(etiqueta) ?? []
  if (ids.length === 0) return { estado: 'ninguna' }
  if (ids.length > 1) return { estado: 'ambigua' }
  const candidatas = filas.filter(f => !f.esTomador && f.polizaId === ids[0] && f.rol === rol && esLaMisma(f, persona))
  if (candidatas.length === 1) return { estado: 'unica', fila: candidatas[0] }
  return { estado: candidatas.length === 0 ? 'ninguna' : 'ambigua' }
}

/**
 * ¿Esta fila es de esta persona? Identificador primero (la ficha enlazada) y
 * solo se cae al nombre cuando NINGUNA de las dos lo tiene. Dos fichas distintas
 * no se funden jamás, coincida lo que coincida el nombre.
 */
function esLaMisma(fila: IntervinienteFicha, persona: PersonaMinima): boolean {
  if (fila.fichaId !== null || persona.fichaId !== null) return fila.fichaId !== null && fila.fichaId === persona.fichaId
  const a = normalizar(fila.nombre)
  const b = normalizar(persona.nombre)
  return a !== null && a === b
}

function normalizar(n: string | null): string | null {
  const s = n?.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().replace(/\s+/g, ' ').toLowerCase()
  return s === undefined || s === '' ? null : s
}

/** Los papeles de una persona, uno por póliza (que es la unidad que se quita). */
function papelesDe(p: { papeles: { rol: string; polizas: string[] }[] }): { rol: string; etiqueta: string | null }[] {
  const out: { rol: string; etiqueta: string | null }[] = []
  for (const x of p.papeles) {
    // Sin etiqueta de póliza el papel se pinta igual («propietario»), pero no se
    // puede decir de cuál se quitaría: por eso viaja con `etiqueta: null`.
    if (x.polizas.length === 0) out.push({ rol: x.rol, etiqueta: null })
    else for (const et of x.polizas) out.push({ rol: x.rol, etiqueta: et })
  }
  return out
}

/** Etiqueta de póliza → sus ids. Es una lista porque dos pólizas pueden rotularse igual. */
function etiquetasDePolizas(ficha: Ficha): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const p of ficha.polizas) {
    const et = etiquetaPoliza(p)
    const ya = m.get(et)
    if (ya) ya.push(p.id)
    else m.set(et, [p.id])
  }
  return m
}
