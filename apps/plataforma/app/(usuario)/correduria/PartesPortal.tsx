'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Siren } from 'lucide-react'
import { Badge, Pendiente, btnStyle } from '@/components/ui'
import { fechaEs, fechaHoraEs } from '@/lib/ficha-asegura'
import Bloque from './Bloque'
import {
  interpretarEscrituraParte,
  interpretarPartes,
  ordenarPorEspera,
  partesSinAtender,
  textoMotivoParte,
  type ParteSiniestro,
  type RespuestaEscrituraParte,
  type RespuestaPartes,
} from '@/lib/partes-asegura'

/**
 * Los partes de siniestro que ha abierto el CLIENTE desde el portal
 * (`apps/asegura-portal`), sin atender.
 *
 * Va arriba del todo de `/correduria` porque **es lo más urgente que hay en esa
 * página: una persona esperando.** El cliente pulsó «enviar», dio por hecho que
 * ya estaba comunicado y no va a volver a llamar; hasta hoy estos partes no los
 * veía nadie. Es el único bloque de la pantalla que se pinta `destacado`: el
 * fondo tintado no es decoración, es lo que hace que se lea antes que el resto.
 *
 * ─── Lo que esta pantalla NO puede decir ────────────────────────────────────
 * 1. **`comunicado` es la única fuente de «la compañía ya lo sabe».** Nunca se
 *    deduce de que el parte haya dejado de estar en su estado inicial:
 *    `recibido` significa «lo hemos leído NOSOTROS», que es justo lo que se
 *    confunde. Hay un guardián en la raíz que caza ese atajo.
 * 2. **`hayHeridos` / `hayTerceros` son TRI-ESTADO** y los tres se pintan
 *    distinto. `null` = «no lo ha contestado» → hueco declarado, jamás «sin
 *    heridos» ni omitido: es lo que hay que preguntar al llamar, y decide si
 *    esto se tramita hoy o el lunes.
 * 3. **`fueraDePlazo` no es pérdida de cobertura** (art. 16 LCS: solo permite a
 *    la compañía reclamar el daño del retraso). Ningún texto lo insinúa.
 * 4. **Que este bloque no aparezca significa «no hay partes sin atender»**, y
 *    por eso un fallo de lectura NO se calla: un panel de avisos que desaparece
 *    en silencio se lee como buenas noticias.
 * 5. **El contador que sube a la cabecera es `null` cuando no se ha podido
 *    leer.** Un 0 ahí afirmaría «no hay nadie esperando», que es la mentira que
 *    el resto de este fichero existe para evitar.
 *
 * Rendimiento: el texto completo del parte se monta solo al abrir su
 * `<details>` (uno cerrado crearía igualmente todo su DOM).
 */
type Mensaje = { tono: 'ok' | 'error'; texto: string }

const POR_PAGINA = 20

export default function PartesPortal({ onContador }: {
  /**
   * Cuántas personas están esperando (`partes sin atender + ilegibles`), para
   * la cabecera de la pantalla. `null` = **no se ha podido saber**; nunca 0.
   */
  onContador?: (n: number | null) => void
}) {
  const router = useRouter()
  // `null` = primera lectura en curso. Después guarda SIEMPRE la última lectura
  // buena: si una recarga falla, se conserva lo que se vio y se avisa del fallo
  // en vez de vaciar la bandeja.
  const [lectura, setLectura] = useState<RespuestaPartes | null>(null)
  const [partes, setPartes] = useState<ParteSiniestro[]>([])
  const [ilegibles, setIlegibles] = useState(0)
  /** Hay una escritura o una recarga en curso: la lista se ATENÚA, no se desmonta. */
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState<Mensaje | null>(null)
  const [ver, setVer] = useState(POR_PAGINA)

  // El aviso al padre va por ref para que un handler inline no reinicie la
  // lectura en cada render (y para no llamarlo NUNCA desde el cuerpo del
  // render: eso sería un bucle infinito de re-renders).
  const avisar = useRef(onContador)
  useEffect(() => { avisar.current = onContador }, [onContador])

  /**
   * Una lectura → un contador. Cualquier «no se ha podido» (puerto caído, ruta
   * que asegura no sirve, secreto sin configurar) sube como `null`.
   */
  const contar = useCallback((r: RespuestaPartes) => {
    avisar.current?.(r.estado === 'ok' ? partesSinAtender(r.partes).length + r.ilegibles : null)
  }, [])

  const leer = useCallback(async (): Promise<RespuestaPartes> => {
    try {
      const res = await fetch('/api/correduria/partes?estado=enviado&limite=200')
      return interpretarPartes(res.status, await res.json().catch(() => null))
    } catch {
      return { estado: 'error', motivo: 'red' }
    }
  }, [])

  const adoptar = useCallback((r: RespuestaPartes) => {
    if (r.estado !== 'ok') return
    setLectura(r)
    setPartes(partesSinAtender(r.partes))
    setIlegibles(r.ilegibles)
  }, [])

  useEffect(() => {
    let vivo = true
    leer().then((r) => {
      if (!vivo) return
      setLectura((prev) => (r.estado === 'ok' ? r : (prev ?? r)))
      if (r.estado === 'ok') { setPartes(partesSinAtender(r.partes)); setIlegibles(r.ilegibles) }
      contar(r)
    })
    return () => { vivo = false }
  }, [leer, contar])

  /**
   * Un cambio de estado. La fila NO se quita hasta que asegura confirma: quitarla
   * antes y que el puerto falle escondería a una persona que sigue esperando.
   * Mientras tanto la lista sigue en pantalla, atenuada.
   */
  async function cambiar(id: string, cambio: Record<string, unknown>, hecho: string): Promise<RespuestaEscrituraParte> {
    setOcupado(true)
    setMensaje(null)
    let r: RespuestaEscrituraParte
    try {
      const res = await fetch('/api/correduria/partes', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, ...cambio }),
      })
      r = interpretarEscrituraParte(res.status, await res.json().catch(() => null))
    } catch {
      r = { estado: 'error', motivo: 'red' }
    }

    if (r.estado === 'ok') {
      setPartes((l) => l.filter((p) => p.id !== id))
      setMensaje({ tono: 'ok', texto: hecho })
      // El servidor manda: se recarga la bandeja (y el resto de la página, que
      // tiene bloques servidos desde el servidor).
      router.refresh()
      const nueva = await leer()
      if (nueva.estado === 'ok') adoptar(nueva)
      else setMensaje({ tono: 'error', texto: `${hecho} Pero la bandeja no se ha podido refrescar (${porqueNoSeLee(nueva)}): lo de abajo es la última lectura buena.` })
      // También aquí, y con la recarga fallida incluida: si no se ha podido
      // releer, lo que hay en pantalla es una foto vieja y el contador de la
      // cabecera tiene que decir «no lo sé», no un número que ya no consta.
      contar(nueva)
    } else if (r.estado === 'no_encontrado') {
      setMensaje({ tono: 'error', texto: 'Ese parte ya no está en asegura. Recarga la página para ver la bandeja de verdad.' })
    } else if (r.estado === 'sin_configurar') {
      setMensaje({ tono: 'error', texto: 'El puerto con asegura no está conectado: el cambio NO se ha guardado.' })
    } else {
      setMensaje({ tono: 'error', texto: `No se ha guardado: ${textoMotivoParte(r.motivo)}` })
    }
    setOcupado(false)
    return r
  }

  if (lectura === null) return null

  if (lectura.estado !== 'ok') {
    // 🚨 Nunca silencio: aquí «no se ha podido mirar» y «no hay partes» son la
    // misma imagen, y una de las dos deja a alguien esperando. No va
    // `destacado` a propósito — el fondo tintado se reserva para cuando SÍ
    // consta que hay alguien esperando; esto es un hueco, y se dice como hueco.
    return (
      <Bloque
        tono="aviso"
        Icono={Siren}
        titulo="Partes del portal"
        accion={<Badge tono="aviso">No se han podido leer</Badge>}
        sub={
          <>
            No se han podido leer ({porqueNoSeLee(lectura)}).{' '}
            <strong>No significa que no haya ninguno esperando.</strong>
          </>
        }
      >
        <p style={pMuted}>
          Míralos en asegura hasta que el puerto vuelva.
        </p>
      </Bloque>
    )
  }

  if (partes.length === 0 && ilegibles === 0) return null

  const visibles = ordenarPorEspera(partes).slice(0, ver)

  return (
    <Bloque
      destacado
      tono="malo"
      Icono={Siren}
      titulo={`${partes.length} parte(s) de siniestro sin atender`}
      sub={
        <>
          Los ha abierto el cliente desde el portal: hay alguien esperando. Un parte enviado{' '}
          <strong>no es un siniestro comunicado a la compañía</strong> — el cliente ya cree que está
          hecho, y mientras siga aquí la entidad no sabe nada.
        </>
      }
    >
      {ilegibles > 0 && (
        <p style={{ ...pMuted, marginTop: 0 }}>
          Además, {ilegibles} parte(s) llegaron con una forma que no se ha podido leer: no están en
          esta lista y hay que mirarlos en asegura.
        </p>
      )}

      {mensaje && (
        <div
          role="status"
          style={{
            border: `1px solid ${mensaje.tono === 'ok' ? 'var(--positive)' : 'var(--negative)'}`,
            color: mensaje.tono === 'ok' ? 'var(--positive)' : 'var(--negative)',
            borderRadius: 8, padding: '8px 10px', fontSize: 13, margin: '10px 0',
          }}
        >
          {mensaje.texto}
        </div>
      )}

      {/* Atenuada durante la escritura/recarga: la lista NO se desmonta. */}
      <div
        style={{
          // Una sola columna DECLARADA: un grid sin `gridTemplateColumns`
          // dimensiona su pista con el contenido más ancho y arrastra la página
          // entera a 320px (regla de responsive del CLAUDE.md raíz).
          display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10,
          opacity: ocupado ? 0.55 : 1,
          pointerEvents: ocupado ? 'none' : undefined,
          transition: 'opacity .15s ease',
        }}
        aria-busy={ocupado}
      >
        {visibles.map((p) => (
          <Parte key={p.id} p={p} cambiar={cambiar} />
        ))}
      </div>

      {ver < partes.length && (
        <button type="button" onClick={() => setVer((v) => v + POR_PAGINA)} style={{ ...btnStyle('secundario'), marginTop: 10 }}>
          Ver {Math.min(POR_PAGINA, partes.length - ver)} más
        </button>
      )}
    </Bloque>
  )
}

/** Por qué no se ha podido leer la bandeja, en una frase. Los tres «no» del
 *  puerto mandan a sitios distintos, así que no se colapsan en «error». */
function porqueNoSeLee(r: Exclude<RespuestaPartes, { estado: 'ok' }>): string {
  if (r.estado === 'sin_configurar') return 'falta ASEGURA_OPERADOR_SECRET en este proyecto'
  if (r.estado === 'no_encontrado') return 'la versión desplegada de asegura todavía no sirve esta ruta'
  return textoMotivoParte(r.motivo)
}

// ─── Una ficha de parte ──────────────────────────────────────────────────────

type Formulario = null | 'abrir' | 'descartar'

function Parte({
  p,
  cambiar,
}: {
  p: ParteSiniestro
  cambiar: (id: string, cambio: Record<string, unknown>, hecho: string) => Promise<RespuestaEscrituraParte>
}) {
  const [form, setForm] = useState<Formulario>(null)
  const [siniestroId, setSiniestroId] = useState('')
  const [motivo, setMotivo] = useState('')
  const [textoAbierto, setTextoAbierto] = useState(false)

  // El borde de la izquierda cuenta la urgencia REAL: heridos confirmados manda
  // sobre todo lo demás; un «no lo ha contestado» no se pinta como calma.
  const color = p.hayHeridos === true ? 'var(--negative)' : 'var(--warning)'

  return (
    <div style={{ border: '1px solid var(--border)', borderLeft: `4px solid ${color}`, borderRadius: 8, padding: 12, background: 'var(--surface)', minWidth: 0 }}>
      {/* Quién */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
        {p.cliente ? (
          <Link href={`/correduria/cliente/${p.cliente.id}`} style={{ fontWeight: 700, fontSize: 15, overflowWrap: 'anywhere' }}>
            {p.cliente.nombre}
          </Link>
        ) : (
          // 🚨 En voz alta: no es «cliente desconocido», es trabajo pendiente.
          <Badge tono="negativo" title="Hay que identificar a esta persona antes de poder abrir nada en la compañía.">
            Sin vincular a ninguna ficha
          </Badge>
        )}
        {p.plazo ? (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            esperando desde hace {p.plazo.diasTranscurridos} día(s)
          </span>
        ) : (
          <Pendiente texto="días de espera sin calcular" donde="la ficha del parte en asegura" />
        )}
        {p.plazo?.fueraDePlazo && (
          <Badge
            tono="aviso"
            title="Art. 16 LCS: pasados 7 días la compañía solo puede reclamar el daño que le cause el retraso. NO es pérdida de cobertura, y comunicar tarde sigue siendo mucho mejor que no comunicar."
          >
            Más de 7 días desde el hecho
          </Badge>
        )}
      </div>

      {!p.cliente && (
        <p style={{ ...pMuted, marginTop: 4 }}>
          Hay que identificar a esta persona antes de poder abrir nada en la compañía.
        </p>
      )}

      {/* A quién hay que llamar cuando el tomador es otro */}
      {p.titularDistinto && (
        <p style={{ fontSize: 13, marginTop: 6, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
          El tomador de la póliza es{' '}
          <Link href={`/correduria/cliente/${p.titularDistinto.id}`} style={{ fontWeight: 600 }}>
            {p.titularDistinto.nombre}
          </Link>
          <span style={{ color: 'var(--muted)' }}>
            {' '}— el parte lo dio alguien con autorización para ver esa póliza. Es a quien hay que
            llamar y quien figura en el contrato.
          </span>
        </p>
      )}

      {/* Cuándo y dónde */}
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, overflowWrap: 'anywhere' }}>
        {p.fechaHecho ? fechaEs(p.fechaHecho) : <Pendiente texto="sin fecha del hecho" />}
        {' · '}
        {p.horaAproximada ? `${p.horaAproximada} h` : <Pendiente texto="sin hora" donde="pregúntasela al llamar" />}
        {' · '}
        {p.lugar ? p.lugar : <Pendiente texto="sin lugar" donde="pregúntaselo al llamar" />}
        {p.creadoEn && ` · parte enviado el ${fechaHoraEs(p.creadoEn)}`}
      </div>

      {/* 🚨 Los dos tri-estados. Ver `Triestado`: los tres valores se pintan distinto. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <Triestado
          valor={p.hayHeridos}
          pregunta="Heridos"
          si={{ texto: 'Con heridos', tono: 'negativo' }}
          no="Sin heridos"
        />
        <Triestado
          valor={p.hayTerceros}
          pregunta="Terceros"
          si={{ texto: 'Con terceros implicados', tono: 'aviso' }}
          no="Sin terceros"
        />
        {/* La ÚNICA fuente de «la compañía ya lo sabe» es este campo. */}
        {p.comunicado ? (
          <Badge tono="positivo" title="Existe siniestro abierto en la entidad.">La compañía ya lo sabe</Badge>
        ) : (
          <Badge tono="negativo" title="Contárnoslo a nosotros no es comunicárselo a la entidad: hasta que se abra allí, la compañía no sabe nada.">
            La compañía todavía NO lo sabe
          </Badge>
        )}
      </div>

      {/* El texto del parte, entero y con montaje perezoso. */}
      {p.descripcion === null ? (
        <div style={{ marginTop: 8 }}>
          <Pendiente texto="la descripción no ha llegado legible" donde="la ficha del parte en asegura" />
        </div>
      ) : (
        <details
          onToggle={(e) => setTextoAbierto((e.currentTarget as HTMLDetailsElement).open)}
          style={{ marginTop: 8 }}
        >
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, minHeight: 44, display: 'flex', alignItems: 'center' }}>
            Lo que cuenta el cliente
          </summary>
          {textoAbierto && (
            <p style={{ fontSize: 13, lineHeight: 1.5, margin: '6px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {p.descripcion}
            </p>
          )}
        </details>
      )}

      {/* Acciones */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <button
          type="button"
          style={btnStyle('secundario')}
          onClick={() => { void cambiar(p.id, { estado: 'recibido' }, 'Parte marcado como recibido. Ojo: la compañía sigue sin saberlo.') }}
        >
          Marcar recibido
        </button>
        <button type="button" style={btnStyle(form === 'abrir' ? 'secundario' : 'primario')} onClick={() => setForm((f) => (f === 'abrir' ? null : 'abrir'))}>
          Abrir en la compañía
        </button>
        <button type="button" style={btnStyle('sutil')} onClick={() => setForm((f) => (f === 'descartar' ? null : 'descartar'))}>
          Descartar
        </button>
      </div>

      {/* El nº de siniestro NO es opcional: sin él el puerto devuelve 400 y la BD
          tiene además un CHECK. Se pide aquí en vez de dejar que falle. */}
      {form === 'abrir' && (
        <Caja>
          <label style={etiqueta} htmlFor={`sin-${p.id}`}>Nº de siniestro que ha dado la compañía</label>
          <input
            id={`sin-${p.id}`}
            value={siniestroId}
            onChange={(e) => setSiniestroId(e.target.value)}
            placeholder="p. ej. 2026/0012345"
            style={campo}
          />
          <p style={pMuted}>
            Este es el único cambio que significa que la entidad ya lo sabe. Sin el número no se puede
            guardar.
          </p>
          <button
            type="button"
            disabled={siniestroId.trim() === ''}
            style={{ ...btnStyle('primario'), opacity: siniestroId.trim() === '' ? 0.5 : 1 }}
            onClick={async () => {
              const r = await cambiar(p.id, { estado: 'abierto_en_compania', siniestroId: siniestroId.trim() }, 'Abierto en la compañía.')
              if (r.estado === 'ok') { setForm(null); setSiniestroId('') }
            }}
          >
            Guardar apertura
          </button>
        </Caja>
      )}

      {form === 'descartar' && (
        <Caja>
          <label style={etiqueta} htmlFor={`mot-${p.id}`}>Por qué no procede</label>
          <textarea
            id={`mot-${p.id}`}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Sin cobertura para eso, era una consulta, duplicado del parte anterior…"
            style={{ ...campo, resize: 'vertical' }}
          />
          <p style={pMuted}>
            Obligatorio: un descarte sin motivo es una decisión que después no puede revisar nadie —
            ni tú dentro de seis meses.
          </p>
          <button
            type="button"
            disabled={motivo.trim() === ''}
            style={{ ...btnStyle('secundario'), opacity: motivo.trim() === '' ? 0.5 : 1 }}
            onClick={async () => {
              const r = await cambiar(p.id, { estado: 'descartado', motivoDescarte: motivo.trim() }, 'Parte descartado con su motivo.')
              if (r.estado === 'ok') { setForm(null); setMotivo('') }
            }}
          >
            Descartar el parte
          </button>
        </Caja>
      )}
    </div>
  )
}

/**
 * 🚨 Un tri-estado, con sus TRES pintados.
 *
 * `true` y `false` son respuestas del cliente y se pintan como tales; `null` es
 * un hueco y se pinta como hueco (borde discontinuo), con la pregunta dentro
 * para que se sepa QUÉ hay que preguntar. Lo que no puede pasar es que un «no
 * contestado» se vea como un «no» — es la regla del NULL del CLAUDE.md raíz en
 * el peor sitio posible.
 */
function Triestado({
  valor,
  pregunta,
  si,
  no,
}: {
  valor: boolean | null
  pregunta: string
  si: { texto: string; tono: 'negativo' | 'aviso' }
  no: string
}) {
  if (valor === true) return <Badge tono={si.tono}>{si.texto}</Badge>
  if (valor === false) return <Badge tono="neutral">{no}</Badge>
  return <Pendiente texto={`${pregunta}: no lo ha contestado`} donde="pregúntaselo cuando le llames" />
}

// ─── Piel ────────────────────────────────────────────────────────────────────

const pMuted: React.CSSProperties = { fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, margin: '6px 0' }

const etiqueta: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }

const campo: React.CSSProperties = {
  width: '100%', maxWidth: '100%', boxSizing: 'border-box', minHeight: 44,
  padding: '10px 12px', borderRadius: 8, fontSize: 14,
  border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
}

function Caja({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 10, padding: 10, borderRadius: 8, border: '1px dashed var(--border)' }}>
      {children}
    </div>
  )
}
