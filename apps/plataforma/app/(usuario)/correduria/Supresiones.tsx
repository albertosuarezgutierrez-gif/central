'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ShieldOff } from 'lucide-react'
import { Badge, btnStyle } from '@/components/ui'
import { fechaEs } from '@/lib/ficha-asegura'
import Bloque from './Bloque'
import {
  interpretarEscrituraSupresion,
  interpretarSupresiones,
  pendientes,
  textoMotivoSupresion,
  vencidas,
  type AlcanceSupresion,
  type RespuestaEscrituraSupresion,
  type RespuestaSupresiones,
  type Supresion,
} from '@/lib/supresiones-asegura'

/**
 * Las solicitudes del derecho de SUPRESIÓN (art. 17 RGPD) que abre el CLIENTE
 * desde el portal (`apps/asegura-portal`).
 *
 * 🚨 Este bloque existe porque, sin él, **el plazo se incumplía solo.** El
 * portal registra la solicitud y arranca un reloj legal de UN MES (art. 12.3)
 * desde que la persona pulsa; hasta hoy eso no salía en ninguna pantalla que
 * Alberto abriera. Es la regla de la casa aplicada donde más caro sale: un
 * aviso en una pantalla que nadie abre es un aviso que no existe.
 *
 * ─── Lo que esta pantalla NO puede hacer ────────────────────────────────────
 * 1. **No es una cola de borrados.** El art. 17.3.b y el 17.3.e excluyen la
 *    supresión cuando hay deber legal de conservar o hace falta defender
 *    reclamaciones. Lo que se contesta es QUÉ se suprime y QUÉ se conserva; por
 *    eso el alcance que se le enseñó a la persona está aquí a la vista, para
 *    que la respuesta se escriba contra lo que se le prometió y no de memoria.
 * 2. **No se puede dar por contestada sin texto** (art. 12.4: la negativa
 *    parcial hay que motivarla, y la parcial es el caso NORMAL). El botón está
 *    deshabilitado hasta que haya respuesta escrita, asegura lo vuelve a exigir
 *    y la BD tiene un CHECK: tres capas porque solo la última protege a un
 *    `UPDATE` hecho por otro camino.
 * 3. **`vencido` no se redondea a «urgente».** Un plazo pasado es un
 *    incumplimiento y se pinta como tal, con los días que lleva fuera.
 * 4. **Que este bloque no aparezca significa «no hay solicitudes pendientes»**,
 *    y por eso un fallo de lectura NO se calla: un panel de avisos que
 *    desaparece en silencio se lee como buenas noticias.
 * 5. **El contador que sube a la cabecera es `null` cuando no se ha podido
 *    leer.** Un 0 ahí afirmaría «no hay nadie esperando».
 *
 * Rendimiento: el formulario de respuesta y el alcance se montan solo al abrir
 * su `<details>` (uno cerrado crearía igualmente todo su DOM).
 */
type Mensaje = { tono: 'ok' | 'error'; texto: string }

/** Cómo se contesta. `en_curso` no cierra el plazo: solo dice «la estoy mirando». */
const RESOLUCIONES = [
  { valor: 'resuelta_parcial', etiqueta: 'Resuelta en parte (se suprimió lo que se podía)' },
  { valor: 'resuelta_total', etiqueta: 'Resuelta del todo (se suprimió todo lo solicitado)' },
  { valor: 'denegada', etiqueta: 'Denegada (no procede suprimir nada)' },
] as const

function porqueNoSeLee(r: RespuestaSupresiones): string {
  if (r.estado === 'sin_configurar') return 'el puerto con asegura no está conectado en este proyecto'
  if (r.estado === 'no_encontrado') return 'la versión desplegada de asegura todavía no sirve esta ruta'
  return r.estado === 'error' ? textoMotivoSupresion(r.motivo) : ''
}

function EtiquetaPlazo({ s }: { s: Supresion }) {
  if (s.plazo === 'vencido') {
    const dias = Math.abs(s.diasRestantes)
    return <Badge tono="negativo">Fuera de plazo · {dias} {dias === 1 ? 'día' : 'días'}</Badge>
  }
  if (s.plazo === 'urgente') {
    return <Badge tono="aviso">Quedan {s.diasRestantes} {s.diasRestantes === 1 ? 'día' : 'días'}</Badge>
  }
  return <Badge tono="neutral">Quedan {s.diasRestantes} días</Badge>
}

export default function Supresiones({ onContador }: {
  /**
   * Cuántas solicitudes tienen el reloj corriendo (`pendientes + ilegibles`).
   * `null` = **no se ha podido saber**; nunca 0.
   */
  onContador?: (n: number | null) => void
}) {
  const router = useRouter()
  // `null` = primera lectura en curso. Después guarda SIEMPRE la última lectura
  // buena: si una recarga falla, se conserva lo que se vio y se avisa del fallo
  // en vez de vaciar la cola.
  const [lectura, setLectura] = useState<RespuestaSupresiones | null>(null)
  const [lista, setLista] = useState<Supresion[]>([])
  const [ilegibles, setIlegibles] = useState(0)
  const [alcance, setAlcance] = useState<AlcanceSupresion[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState<Mensaje | null>(null)

  const avisar = useRef(onContador)
  useEffect(() => { avisar.current = onContador }, [onContador])

  const contar = useCallback((r: RespuestaSupresiones) => {
    avisar.current?.(r.estado === 'ok' ? pendientes(r.solicitudes).length + r.ilegibles : null)
  }, [])

  const leer = useCallback(async (): Promise<RespuestaSupresiones> => {
    try {
      const res = await fetch('/api/correduria/supresiones')
      return interpretarSupresiones(res.status, await res.json().catch(() => null))
    } catch {
      return { estado: 'error', motivo: 'red' }
    }
  }, [])

  const adoptar = useCallback((r: RespuestaSupresiones) => {
    if (r.estado !== 'ok') return
    setLectura(r)
    setLista(pendientes(r.solicitudes))
    setIlegibles(r.ilegibles)
    setAlcance(r.alcance)
  }, [])

  useEffect(() => {
    let vivo = true
    leer().then((r) => {
      if (!vivo) return
      setLectura((prev) => (r.estado === 'ok' ? r : (prev ?? r)))
      if (r.estado === 'ok') {
        setLista(pendientes(r.solicitudes))
        setIlegibles(r.ilegibles)
        setAlcance(r.alcance)
      }
      contar(r)
    })
    return () => { vivo = false }
  }, [leer, contar])

  /**
   * Contestar o prorrogar. La fila NO se quita hasta que asegura confirma:
   * quitarla antes y que el puerto falle escondería un plazo que sigue vivo.
   */
  async function enviar(id: string, cambio: Record<string, unknown>, hecho: string) {
    setOcupado(true)
    setMensaje(null)
    let r: RespuestaEscrituraSupresion
    try {
      const res = await fetch('/api/correduria/supresiones', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, ...cambio }),
      })
      r = interpretarEscrituraSupresion(res.status, await res.json().catch(() => null))
    } catch {
      r = { estado: 'error', motivo: 'red' }
    }

    if (r.estado === 'ok') {
      setMensaje({ tono: 'ok', texto: hecho })
      router.refresh()
      const nueva = await leer()
      if (nueva.estado === 'ok') adoptar(nueva)
      else {
        setMensaje({
          tono: 'error',
          texto: `${hecho} Pero la cola no se ha podido refrescar (${porqueNoSeLee(nueva)}): lo de abajo es la última lectura buena.`,
        })
      }
      contar(nueva)
    } else if (r.estado === 'no_encontrado') {
      setMensaje({ tono: 'error', texto: 'Esa solicitud ya no está en asegura. Recarga la página para ver la cola de verdad.' })
    } else if (r.estado === 'sin_configurar') {
      setMensaje({ tono: 'error', texto: 'El puerto con asegura no está conectado: NO se ha guardado nada.' })
    } else {
      setMensaje({ tono: 'error', texto: `No se ha guardado: ${textoMotivoSupresion(r.motivo)}` })
    }
    setOcupado(false)
  }

  if (lectura === null) return null

  if (lectura.estado !== 'ok') {
    // 🚨 Nunca silencio: «no se ha podido mirar» y «no hay solicitudes» son la
    // misma imagen, y una de las dos deja un plazo legal corriendo.
    return (
      <Bloque
        tono="aviso"
        Icono={ShieldOff}
        titulo="Solicitudes de supresión (RGPD)"
        accion={<Badge tono="aviso">No se han podido leer</Badge>}
        sub={
          <>
            No se han podido leer ({porqueNoSeLee(lectura)}).{' '}
            <strong>No significa que no haya ninguna con el plazo corriendo.</strong>
          </>
        }
      >
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          Si esto sigue así, míralo en asegura: cada solicitud tiene un mes desde que se recibió
          (art. 12.3 RGPD) y ese plazo corre aunque esta pantalla no la vea.
        </p>
      </Bloque>
    )
  }

  // Cola vacía y bien leída: no se pinta nada. Es un bloque de alarma, y una
  // caja que dice «no hay nada» en una pantalla de trabajo es ruido.
  if (lista.length === 0 && ilegibles === 0) return null

  const nVencidas = vencidas(lista).length
  const seSuprime = alcance.filter((a) => a.trato === 'suprimible')
  const seConserva = alcance.filter((a) => a.trato === 'conservado')

  return (
    <Bloque
      destacado
      tono={nVencidas > 0 ? 'malo' : 'aviso'}
      Icono={ShieldOff}
      titulo="Solicitudes de supresión (RGPD)"
      accion={
        nVencidas > 0
          ? <Badge tono="negativo">{nVencidas} fuera de plazo</Badge>
          : <Badge tono="aviso">{lista.length} pendiente{lista.length === 1 ? '' : 's'}</Badge>
      }
      sub={
        <>
          Hay <strong>un mes para contestar</strong> desde que se recibió cada una (art. 12.3 RGPD),
          diciendo qué se suprime y qué se conserva y por qué (art. 12.4). Van ordenadas por el
          plazo, no por orden de llegada.
        </>
      }
    >
      {mensaje && (
        <p style={{
          fontSize: 13, fontWeight: 600, margin: '0 0 10px',
          color: mensaje.tono === 'ok' ? 'var(--positive)' : 'var(--negative)',
        }}>{mensaje.texto}</p>
      )}

      {ilegibles > 0 && (
        <p style={{ fontSize: 12, color: 'var(--warning)', margin: '0 0 10px' }}>
          ⚠️ {ilegibles} solicitud{ilegibles === 1 ? '' : 'es'} llegó con una forma que esta pantalla no
          entiende y no se puede pintar. <strong>Está ahí</strong>: míralas en asegura.
        </p>
      )}

      {/* El alcance que se le enseñó a la persona al pedirlo. Va aquí para que
          la respuesta se escriba contra lo que se le prometió, no de memoria. */}
      {alcance.length > 0 && (
        <details style={{ marginBottom: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            Qué se le dijo que se borra y qué no
          </summary>
          <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
            <div>
              <h4 style={{ fontSize: 12, margin: '0 0 4px' }}>Se suprime</h4>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {seSuprime.map((a) => (
                  <li key={a.que} style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                    <strong style={{ color: 'var(--text)' }}>{a.que}.</strong> {a.motivo}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 style={{ fontSize: 12, margin: '0 0 4px' }}>Se conserva</h4>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {seConserva.map((a) => (
                  <li key={a.que} style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                    <strong style={{ color: 'var(--text)' }}>{a.que}.</strong> {a.motivo}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </details>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, opacity: ocupado ? 0.6 : 1 }}>
        {lista.map((s) => (
          <li key={s.id} style={{ borderTop: '1px solid var(--border)', padding: '10px 0' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <EtiquetaPlazo s={s} />
              <span style={{ fontSize: 13 }}>
                Recibida el <strong>{fechaEs(s.recibidaEn)}</strong> · contestar antes del{' '}
                <strong>{fechaEs(s.fechaLimite)}</strong>
              </span>
              {s.prorrogadaEn && <Badge tono="info">Prorrogada</Badge>}
            </div>

            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0' }}>
              {s.clienteId
                ? <>Ficha: <Link href={`/correduria/cliente/${s.clienteId}`}>ver cliente</Link></>
                // 🚨 NO es «no es cliente»: es «su acceso no está enlazado con
                // ninguna ficha». Un lead también ejerce el derecho.
                : <>Su acceso no está enlazado con ninguna ficha de la cartera.</>}
              {' · '}textos {s.versionTextos || '—'}
            </p>

            {s.motivo && (
              <p style={{ fontSize: 13, margin: '6px 0 0' }}>
                <em>«{s.motivo}»</em>
              </p>
            )}

            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Contestar</summary>
              <FormularioRespuesta s={s} ocupado={ocupado} onEnviar={enviar} />
            </details>
          </li>
        ))}
      </ul>
    </Bloque>
  )
}

function FormularioRespuesta({ s, ocupado, onEnviar }: {
  s: Supresion
  ocupado: boolean
  onEnviar: (id: string, cambio: Record<string, unknown>, hecho: string) => Promise<void>
}) {
  const [estado, setEstado] = useState<string>(RESOLUCIONES[0].valor)
  const [respuesta, setRespuesta] = useState('')
  const [prorroga, setProrroga] = useState('')

  // 🚨 El botón se deshabilita sin texto, pero esa NO es la guarda: asegura lo
  // exige y la BD tiene un CHECK. Aquí solo se explica el porqué, para que no
  // parezca un capricho del formulario.
  const puedeContestar = respuesta.trim().length > 0 && !ocupado

  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
      <label style={{ fontSize: 12, fontWeight: 600 }}>
        Qué se le contesta
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          style={{ display: 'block', width: '100%', marginTop: 4, minHeight: 44 }}
        >
          {RESOLUCIONES.map((r) => <option key={r.valor} value={r.valor}>{r.etiqueta}</option>)}
        </select>
      </label>

      <label style={{ fontSize: 12, fontWeight: 600 }}>
        La respuesta, con sus palabras <span style={{ color: 'var(--negative)' }}>(obligatoria)</span>
        <textarea
          value={respuesta}
          onChange={(e) => setRespuesta(e.target.value)}
          rows={4}
          placeholder="Se ha suprimido tu acceso al portal y lo que declaraste. Se conservan las pólizas contratadas y su documentación por la obligación legal de conservación de la mediación (art. 17.3.b RGPD)…"
          style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 4 }}
        />
      </label>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
        Esto es lo que acredita el art. 12.4 el día que alguien pregunte por qué no se borró todo.
        Una negativa parcial sin motivo escrito es lo que ese artículo prohíbe.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          style={{ ...btnStyle('primario', 'sm'), opacity: puedeContestar ? 1 : 0.5 }}
          disabled={!puedeContestar}
          onClick={() => onEnviar(s.id, { estado, respuesta: respuesta.trim() }, 'Contestada.')}
        >
          Contestar y cerrar el plazo
        </button>
      </div>

      {/* La prórroga del art. 12.3: dos meses más, y hay que AVISAR dentro del
          primer mes explicando por qué. Prorrogar en silencio incumple igual
          que no contestar, así que el motivo es obligatorio. */}
      {!s.prorrogadaEn && (
        <details style={{ marginTop: 4 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--muted)' }}>
            Necesito dos meses más (prórroga del art. 12.3)
          </summary>
          <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
            <input
              value={prorroga}
              onChange={(e) => setProrroga(e.target.value)}
              placeholder="Por qué hace falta la prórroga (se le tiene que decir a la persona)"
              style={{ width: '100%', boxSizing: 'border-box', minHeight: 44 }}
            />
            <button
              type="button"
              style={{ ...btnStyle('secundario', 'sm'), opacity: prorroga.trim() && !ocupado ? 1 : 0.5 }}
              disabled={!prorroga.trim() || ocupado}
              onClick={() => onEnviar(
                s.id,
                { estado: 'en_curso', prorrogaMotivo: prorroga.trim() },
                'Prorrogada. Avísale del motivo: la prórroga hay que comunicarla dentro del primer mes.',
              )}
            >
              Prorrogar
            </button>
          </div>
        </details>
      )}
    </div>
  )
}
