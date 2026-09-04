'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Search, TriangleAlert, Lock, Plus, Hourglass } from 'lucide-react'
import { cardStyle, btnStyle, Badge, type Tono } from '@/components/ui'
import { MOTIVOS_PUERTO, type Busqueda, type BloqueResultados, type Hallazgo } from '@/lib/correduria-puerto'

/**
 * Un solo cuadro para encontrar a cualquiera: nombre, matrícula, nº de póliza,
 * DNI, teléfono, email, ciudad o código postal.
 *
 * ─── Por qué NO lleva caja ni contador ──────────────────────────────────────
 * Es la barra de mando de la pantalla, no un bloque más de la lista: lo primero
 * que se ve y lo que más se usa. Cuando llevaba su propio borde de 1px se leía
 * como una sección apilada entre otras seis, y el objeto que importa —el campo
 * donde se escribe— pesaba lo mismo que su marco. Ahora el input ES el objeto:
 * ancho completo, alto táctil y la lupa dentro. La caja se reserva para lo que
 * de verdad aparece: los resultados.
 *
 * 🚨 Vive FUERA del bloque de cartera a propósito. Estaba anidado dentro, y ese
 * bloque hace `return` temprano cuando el puerto falla — o sea, el día que
 * asegura no responde desaparecía también el buscador, que es justo cuando más
 * falta hace saber a quién se está buscando.
 *
 * ─── Lo que este buscador NO puede prometer ────────────────────────────────
 * El DNI, el teléfono y el email van CIFRADOS: solo se encuentran por índice
 * ciego y EXACTO, y únicamente el 12-16% de las fichas lo tienen calculado. Un
 * «no aparece» ahí es casi siempre «esa ficha no tiene hash», no «no está en la
 * cartera» — y si la clave se desincronizara, la búsqueda no daría error:
 * devolvería vacío. Por eso cada bloque enseña sobre cuántas fichas ha podido
 * mirar de verdad. La calle del riesgo va cifrada y asegura la descifra en
 * memoria para buscar (son ~170); sin clave lo dice, no devuelve vacío.
 */
const ETIQUETAS: Record<string, string> = {
  nombre: 'Por nombre',
  matricula: 'Por matrícula',
  poliza: 'Por nº de póliza',
  dni: 'Por DNI',
  telefono: 'Por teléfono',
  email: 'Por email',
  codigo_postal: 'Por código postal (del cliente)',
  ciudad: 'Por ciudad (del cliente)',
  riesgo: 'Por localidad o CP del riesgo',
  direccion: 'Por calle del riesgo',
}

type Estado =
  | { fase: 'quieto' }
  | { fase: 'buscando' }
  | { fase: 'hecho'; r: Busqueda }

export default function BuscadorCartera() {
  const [q, setQ] = useState('')
  const [estado, setEstado] = useState<Estado>({ fase: 'quieto' })
  // Cada búsqueda lleva número: si vuelven dos respuestas desordenadas (la
  // lenta después de la rápida), solo pinta la última que se pidió.
  const turno = useRef(0)

  const lanzar = useCallback(async (termino: string) => {
    const mio = ++turno.current
    setEstado({ fase: 'buscando' })
    try {
      const res = await fetch(`/api/correduria/buscar?q=${encodeURIComponent(termino)}`)
      const r = await res.json()
      if (turno.current === mio) setEstado({ fase: 'hecho', r })
    } catch {
      if (turno.current === mio) setEstado({ fase: 'hecho', r: { estado: 'error', motivo: 'red' } })
    }
  }, [])

  /* ── LA BÚSQUEDA VIVE EN LA URL (`?q=`), no solo en el estado de React ──────
     🚨 Por qué (Alberto, 04/09/2026): «hay pantallas, por ejemplo de cliente,
     que al ir atrás no guardan los datos de la búsqueda». Cierto y estructural:
     buscar «Global», entrar en la ficha y volver con el botón del navegador
     REMONTA esta pantalla, y con ella se iba un `useState('')` — o sea, había
     que volver a teclear y a pulsar Buscar para seguir donde estabas.

     Con el término en la URL, la vuelta atrás lo trae de serie: el navegador
     restaura `/correduria?q=Global&s=…` y aquí se relee y se relanza. Es el
     mismo mecanismo que ya usa la SECCIÓN (`?s=`) unas líneas más abajo, y por
     eso se escribe igual: `history.replaceState` y no `router.push`, porque
     navegar remontaría la pantalla entera y volvería a pedirle todo al puerto
     de asegura en cada búsqueda.

     Se lee de `window.location.search` y no de `useSearchParams()` a propósito:
     `replaceState` a pelo no pasa por el router de Next, así que su hook puede
     ir un paso por detrás de lo que de verdad hay en la barra de direcciones. */
  useEffect(() => {
    const inicial = (new URLSearchParams(window.location.search).get('q') ?? '').trim()
    if (inicial.length < 3) return
    setQ(inicial)
    void lanzar(inicial)
  }, [lanzar])

  function recordarEnUrl(termino: string) {
    const url = new URL(window.location.href)
    if (termino === '') url.searchParams.delete('q')
    else url.searchParams.set('q', termino)
    window.history.replaceState(null, '', url)
  }

  async function buscar(e: React.FormEvent) {
    e.preventDefault()
    const termino = q.trim()
    if (termino.length < 3) return
    recordarEnUrl(termino)
    await lanzar(termino)
  }

  function limpiar() {
    setQ('')
    setEstado({ fase: 'quieto' })
    recordarEnUrl('')
  }

  return (
    <div>
      <form onSubmit={buscar} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {/* El campo manda: ocupa el ancho y la lupa va DENTRO, posicionada — no
            como carácter, que se desalinea con la fuente del sistema. */}
        {/* `1 1 180px` y no 260: con gap 8 y el botón «Buscar» (~88px), 260 sumaba
            358px y en un móvil de 360 el ancho útil son 332 (`.pagina` quita 14+14),
            así que el botón caía a una segunda fila y costaba 45px de alto. Con 180
            entran los dos en una línea y el campo crece con el `flex-grow`. */}
        <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 0, display: 'flex' }}>
          <Search
            size={18}
            strokeWidth={1.75}
            aria-hidden
            style={{
              position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--muted)', pointerEvents: 'none',
            }}
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre, NIF, matrícula, póliza…"
            aria-label="Buscar en la cartera"
            /* SIN `autoFocus`: en móvil abría el teclado al entrar en la pantalla y
               tapaba media pantalla antes de que a Alberto le diera tiempo a mirar
               lo que hay que hacer hoy, que es para lo que abre esta página. El
               placeholder se acorta por lo mismo: la explicación entera vive en el
               desplegable «¿Qué puedo buscar?», a un toque. */
            style={{
              width: '100%', minWidth: 0, padding: '12px 14px 12px 40px', minHeight: 44,
              borderRadius: 10, border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text)', fontSize: 16,
            }}
          />
        </div>
        <button type="submit" style={btnStyle('primario')}>Buscar</button>
        {/* Aparece solo con una búsqueda hecha: es lo que quita el término de la
            URL. Sin él, `?q=` se quedaría pegado a la pantalla y volver desde
            una ficha reabriría para siempre la última búsqueda. */}
        {estado.fase !== 'quieto' && (
          <button type="button" onClick={limpiar} style={btnStyle('secundario')}>Limpiar</button>
        )}
      </form>

      <Resultado estado={estado} termino={q.trim()} />
    </div>
  )
}

function Resultado({ estado, termino }: { estado: Estado; termino: string }) {
  if (estado.fase === 'quieto') {
    return (
      <details style={{ marginTop: 8 }}>
        {/* Plegado a propósito: el texto entero son 6 líneas (~89px) en móvil, y es
            útil la PRIMERA vez que se abre la pantalla, no las trescientas
            siguientes. No se borra —explica que la búsqueda mira también el
            riesgo, que no es evidente— pero deja de comerse la primera pantalla. */}
        <summary
          style={{
            fontSize: 12, color: 'var(--muted)', cursor: 'pointer',
            listStyle: 'none', userSelect: 'none',
            display: 'inline-flex', alignItems: 'center', minHeight: 32,
          }}
        >
          ¿Qué puedo buscar?
        </summary>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, lineHeight: 1.5 }}>
          Se busca a la vez por todo lo que el término pueda ser: nombre, matrícula, póliza, DNI,
          teléfono, email, ciudad/CP del cliente y también localidad, CP o calle del RIESGO (la casa
          de la playa sale buscando «rota» o «san vicente 40»).
        </div>
      </details>
    )
  }
  if (estado.fase === 'buscando') {
    return <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 10 }}>Buscando…</div>
  }

  const r = estado.r

  // ── Los tres caminos de fallo ──────────────────────────────────────────────
  // Se pintan explícitamente y con su texto: ninguno de los tres puede
  // confundirse con «ese cliente no existe».
  if (r.estado === 'sin_configurar') {
    return (
      <Superficie>
        <Nota icono={<Hourglass size={14} strokeWidth={1.75} aria-hidden />}>
          El puerto con asegura no está conectado en este proyecto (falta{' '}
          <code>ASEGURA_OPERADOR_SECRET</code>). No significa que ese cliente no exista: significa que
          desde aquí no se puede mirar.
        </Nota>
      </Superficie>
    )
  }
  if (r.estado === 'error') {
    return (
      <Superficie>
        <Nota
          color="var(--negative)"
          icono={<TriangleAlert size={14} strokeWidth={1.75} aria-hidden />}
        >
          No se ha podido buscar: {MOTIVOS_PUERTO[r.motivo]} <strong>No lo leas como «ese cliente
          no existe».</strong>
        </Nota>
      </Superficie>
    )
  }
  if (!r.buscable) {
    return (
      <Superficie>
        <Nota>
          Escribe al menos 3 letras o números. Esto <strong>no</strong> es «no hay resultados»: es que
          todavía no se ha buscado.
        </Nota>
      </Superficie>
    )
  }

  const conHallazgos = r.bloques.filter((b) => b.hallazgos.length > 0)
  const vacios = r.bloques.filter((b) => b.hallazgos.length === 0)

  return (
    <Superficie>
      <div style={{ fontSize: 13, marginBottom: 8 }}>
        {r.distintos === 0 ? (
          <span style={{ color: 'var(--muted)' }}>
            Nadie coincide con <strong>{termino}</strong>.{' '}
            {/* Ojo: por DNI/teléfono/email el vacío solo alcanza al 12-16% de las fichas
                (se explica abajo). El alta comprueba duplicados otra vez antes de crear. */}
            <Link
              href={`/correduria/cliente/nuevo?q=${encodeURIComponent(termino)}`}
              style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <Plus size={14} strokeWidth={2} aria-hidden /> ¿No está? Darlo de alta
            </Link>
          </span>
        ) : (
          <>
            <strong>{r.distintos}</strong> ficha(s) para <strong>{termino}</strong>
          </>
        )}
      </div>

      {conHallazgos.map((b) => (
        <Bloque key={`${b.tipo}-${b.valor}`} b={b} />
      ))}

      {/* Los criterios sin resultado se dicen, y con su ALCANCE: un vacío por
          DNI que solo alcanza al 12% de las fichas no es una ausencia. */}
      {vacios.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--muted)', minHeight: 32 }}>
            Sin resultados por {vacios.length} criterio(s) — mira sobre cuánto se ha buscado
          </summary>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--muted)' }}>
            {vacios.map((b) => (
              <li key={`${b.tipo}-${b.valor}`} style={{ marginBottom: 4 }}>
                <strong>{ETIQUETAS[b.tipo] ?? b.tipo}</strong>: {b.explicacion}
              </li>
            ))}
          </ul>
        </details>
      )}

      {r.avisos.map((a) => (
        <Nota key={a.tema} icono={<Lock size={14} strokeWidth={1.75} aria-hidden />}>
          {a.texto}
        </Nota>
      ))}
    </Superficie>
  )
}

/**
 * Los resultados SÍ son un objeto que aparece: aquí la tarjeta está justificada
 * (a diferencia del campo de búsqueda, que no necesita marco).
 */
function Superficie({ children }: { children: React.ReactNode }) {
  return <div style={{ ...cardStyle, padding: 16, marginTop: 12 }}>{children}</div>
}

function Bloque({ b }: { b: BloqueResultados }) {
  const parcial = b.cobertura !== null && b.cobertura.alcanzables < b.cobertura.total
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
        {ETIQUETAS[b.tipo] ?? b.tipo}
        {parcial && b.cobertura && (
          <span
            style={{ fontWeight: 400, marginLeft: 6 }}
            title={b.explicacion}
          >
            · alcanza a {b.cobertura.alcanzables.toLocaleString('es-ES')} de{' '}
            {b.cobertura.total.toLocaleString('es-ES')} fichas
          </span>
        )}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {b.hallazgos.map((h) => (
          <li
            key={`${b.tipo}-${h.clienteId}`}
            style={{ borderTop: '1px solid var(--border)', padding: '10px 0' }}
          >
            <Link href={`/correduria/cliente/${h.clienteId}`} style={{ fontWeight: 600 }}>
              {h.nombre}
            </Link>
            <div style={{
              fontSize: 11, color: 'var(--muted)', marginTop: 3,
              display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
            }}>
              <Vitalidad h={h} />
              <span>· {h.polizas} póliza(s) · {h.porque}</span>
            </div>
            {h.aviso && (
              <div
                style={{
                  fontSize: 11,
                  marginTop: 6,
                  padding: '6px 8px',
                  borderRadius: 6,
                  background: h.aviso.clase === 'duplicado' ? 'var(--warning-bg)' : 'transparent',
                  color: h.aviso.clase === 'duplicado' ? 'var(--warning)' : 'var(--muted)',
                  lineHeight: 1.5,
                }}
              >
                {h.aviso.clase === 'duplicado' && (
                  <TriangleAlert
                    size={13}
                    strokeWidth={1.75}
                    aria-hidden
                    style={{ verticalAlign: '-2px', marginRight: 4 }}
                  />
                )}
                {h.aviso.texto}{' '}
                {h.aviso.preferida && (
                  <Link href={`/correduria/cliente/${h.aviso.preferida.clienteId}`} style={{ fontWeight: 600 }}>
                    Abrir la ficha viva →
                  </Link>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * 🚨 Lo que NO se pinta aquí: `h.tipo`, el enum de la BD. Decía «cliente» en
 * las DOS fichas de Jose Suarez Salas — la viva y el volcado de 2016— porque la
 * carga de junio las marcó todas igual. El rótulo sale ahora de `vitalidad`,
 * que se deriva de si sus pólizas entran por CIMA y de cuándo vencen.
 *
 * Cuatro estados, no dos: «sin comprobar» y «sin vencimiento» son distintos de
 * «volcado histórico», y ninguno de los dos entierra la ficha.
 */
function Vitalidad({ h }: { h: Hallazgo }) {
  const cima = h.polizasCima
  const detalle =
    h.vitalidad === 'viva' && cima !== null && cima > 0
      ? `${cima} póliza(s) entran por CIMA`
      : h.ultimoVencimiento !== null
        ? `último vencimiento ${h.ultimoVencimiento}`
        : 'ninguna póliza informa vencimiento'
  const pinta: Record<Hallazgo['vitalidad'], { texto: string; tono: Tono }> = {
    viva: { texto: 'cartera viva', tono: 'positivo' },
    historica: { texto: 'volcado histórico', tono: 'neutral' },
    sin_fecha: { texto: 'sin vencimiento informado', tono: 'neutral' },
    desconocida: { texto: 'sin comprobar', tono: 'neutral' },
  }
  const p = pinta[h.vitalidad]
  return <Badge tono={p.tono} title={detalle}>{p.texto}</Badge>
}

function Nota({ color, icono, children }: {
  color?: string
  icono?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div style={{
      display: 'flex', gap: 6, alignItems: 'flex-start',
      fontSize: 12, color: color ?? 'var(--muted)', marginTop: 10, lineHeight: 1.5,
    }}>
      {icono && <span style={{ flexShrink: 0, marginTop: 2, display: 'inline-flex' }}>{icono}</span>}
      <span>{children}</span>
    </div>
  )
}
