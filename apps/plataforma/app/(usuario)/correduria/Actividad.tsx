'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, AlertTriangle, ExternalLink } from 'lucide-react'

import {
  etiquetaActividad,
  mayorCaidaEmbudo,
  nuevosDesde,
  PASOS_EMBUDO,
  riesgoActividad,
  VENTANAS_ACTIVIDAD,
  type EmbudoPortal,
  type QuienActividad,
} from '@central/module-seguros'

import { btnStyle } from '@/components/ui'
import {
  interpretarActividad,
  MOTIVOS_PUERTO,
  type ResultadoActividad,
} from '@/lib/actividad-asegura'
import Bloque from './Bloque'

/**
 * El muro de actividad de TODA la cartera: qué han hecho los clientes, incluidas
 * sus entradas en la intranet.
 *
 * ─── Por qué existe ──────────────────────────────────────────────────────────
 * El historial ya estaba, pero por ficha: para saber qué había hecho alguien
 * había que entrar en su ficha, y para saber qué había hecho *alguien* había que
 * entrar en las ochenta. O sea, no se veía.
 *
 * ─── Las dos mitades, y por qué el embudo va ARRIBA ──────────────────────────
 * 🚨 La cronología es lo llamativo y NO es lo importante. Con 80 clientes vivos
 * —26 de ellos sin correo ni teléfono— un muro de eventos enseña sobre todo
 * SILENCIO, y el silencio no dice qué hacer. Lo que dice qué hacer es el embudo:
 * cuántos de esos 80 tienen la intranet puesta y cuántos ni saben que existe.
 * Por eso va primero y por eso señala el escalón donde más gente se cae.
 *
 * ─── Lo que esta pantalla NO enseña ──────────────────────────────────────────
 * Ni un dato de contacto. El puerto no los manda: el muro dice QUÉ pasó y de
 * QUIÉN es la ficha, y el dato se mira en la ficha. Una lista cronológica es lo
 * último donde conviene tener domicilios, porque se mira con gente delante.
 */
export default function Actividad() {
  const [quien, setQuien] = useState<QuienActividad>('todo')
  const [dias, setDias] = useState<number>(30)
  const [pagina, setPagina] = useState(1)
  const [r, setR] = useState<ResultadoActividad | null>(null)
  const [cargando, setCargando] = useState(true)
  const [visitaPrevia, setVisitaPrevia] = useState<string | null>(null)

  // La marca de «hasta aquí ya lo había visto». Vive en el navegador a
  // propósito: no hay tabla de leídos todavía, y una marca por navegador es
  // infinitamente mejor que ninguna. Se lee UNA vez, antes del primer fetch,
  // para que la visita de hoy no borre la referencia de la anterior.
  useEffect(() => {
    try {
      setVisitaPrevia(window.localStorage.getItem(CLAVE_VISITA))
      window.localStorage.setItem(CLAVE_VISITA, new Date().toISOString())
    } catch {
      // Navegación privada o almacenamiento bloqueado: se vive sin la marca.
      setVisitaPrevia(null)
    }
  }, [])

  const abort = useRef<AbortController | null>(null)

  const cargar = useCallback(() => {
    abort.current?.abort()
    const ctl = new AbortController()
    abort.current = ctl
    setCargando(true)
    const q = new URLSearchParams({ quien, dias: String(dias), pagina: String(pagina) })
    fetch(`/api/correduria/actividad?${q}`, { signal: ctl.signal })
      .then((res) => res.json().catch(() => null))
      .then((j) => {
        if (ctl.signal.aborted) return
        setR(interpretarActividad(j))
        setCargando(false)
      })
      .catch(() => {
        if (ctl.signal.aborted) return
        setR({ ok: false, motivo: 'red', causa: null })
        setCargando(false)
      })
  }, [quien, dias, pagina])

  useEffect(() => {
    cargar()
    return () => abort.current?.abort()
  }, [cargar])

  const eventos = r?.ok ? r.eventos : []
  const nuevos = useMemo(() => nuevosDesde(eventos, visitaPrevia), [eventos, visitaPrevia])

  return (
    <>
      <Bloque
        titulo="La intranet de tus clientes"
        sub="De los clientes de la casa, cuántos llegan a cada escalón."
        Icono={Activity}
      >
        {r?.ok ? <Embudo e={r.embudo} /> : <Aviso r={r} cargando={cargando} />}
      </Bloque>

      <Bloque
        titulo="Qué han hecho"
        sub={
          nuevos === null
            ? 'Lo más reciente arriba.'
            : nuevos > 0
              ? `${nuevos} desde la última vez que abriste esta pantalla en este navegador.`
              : 'Nada nuevo desde la última vez que la abriste en este navegador.'
        }
        Icono={Activity}
      >
        <Filtros
          quien={quien}
          dias={dias}
          onQuien={(v) => {
            setQuien(v)
            setPagina(1)
          }}
          onDias={(v) => {
            setDias(v)
            setPagina(1)
          }}
        />

        {r?.ok && r.descartados.length > 0 && (
          <p style={sutil}>
            No se han entendido estos filtros y NO se han aplicado: {r.descartados.join(', ')}.
          </p>
        )}

        {!r?.ok ? (
          <Aviso r={r} cargando={cargando} />
        ) : eventos.length === 0 ? (
          <p style={sutil}>
            {cargando ? 'Buscando…' : 'No consta ninguna actividad en este periodo.'}
          </p>
        ) : (
          <>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, opacity: cargando ? 0.6 : 1 }}>
              {eventos.map((e) => (
                <Fila key={e.id} e={e} nuevo={esPosterior(e.fecha, visitaPrevia)} />
              ))}
            </ul>
            {r.ilegibles > 0 && (
              <p style={sutil}>
                Y {r.ilegibles} {r.ilegibles === 1 ? 'línea que no se ha podido leer' : 'líneas que no se han podido leer'}.
              </p>
            )}
            <Paginador
              pagina={pagina}
              total={r.total}
              mostrados={eventos.length}
              onPagina={setPagina}
              cargando={cargando}
            />
          </>
        )}
      </Bloque>
    </>
  )
}

const CLAVE_VISITA = 'correduria:actividad:visto'

const sutil: React.CSSProperties = { margin: '8px 0 0', fontSize: 13, color: 'var(--muted)' }

/** `true` solo cuando las dos fechas son legibles: ante la duda, no se marca nada como nuevo. */
function esPosterior(fecha: string, desde: string | null): boolean {
  if (desde == null) return false
  const a = Date.parse(fecha)
  const b = Date.parse(desde)
  return !Number.isNaN(a) && !Number.isNaN(b) && a > b
}

// ─── El embudo ───────────────────────────────────────────────────────────────

function Embudo({ e }: { e: EmbudoPortal }) {
  const peor = mayorCaidaEmbudo(e)
  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: 8,
        }}
      >
        {PASOS_EMBUDO.map((p) => {
          const n = e[p.clave]
          const cuelloAqui = peor?.hasta.clave === p.clave
          return (
            <div
              key={p.clave}
              title={p.ayuda}
              style={{
                border: '1px solid var(--border)',
                borderColor: cuelloAqui ? 'var(--warning)' : 'var(--border)',
                borderRadius: 10,
                padding: 10,
                minWidth: 0,
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.label}</div>
              <div style={{ fontSize: 22, fontWeight: 600 }}>
                {/* 🚨 «—» y no «0»: una cuenta que no se pudo hacer pintada como
                    cero diría que nadie ha entrado, que es justo la frase sobre
                    la que se decidiría ponerse a invitar a gente que ya está. */}
                {n == null ? <span style={{ color: 'var(--muted)' }}>—</span> : n}
              </div>
            </div>
          )
        })}
      </div>

      {peor ? (
        <p style={sutil}>
          Donde más gente se queda: <strong>{peor.desde.label} → {peor.hasta.label}</strong>, se
          pierden {peor.pierde}. {peor.hasta.ayuda}
        </p>
      ) : (
        <p style={sutil}>
          No se puede señalar dónde está el cuello: faltan cuentas por hacer (las que salen como «—»).
        </p>
      )}
      <p style={sutil}>
        Para invitar a alguien, entra en su ficha → pestaña Contactos → «Portal del cliente». Ahí se
        comprueba antes si su correo resuelve a una sola ficha.
      </p>
    </>
  )
}

// ─── Filtros ─────────────────────────────────────────────────────────────────

function Filtros({
  quien,
  dias,
  onQuien,
  onDias,
}: {
  quien: QuienActividad
  dias: number
  onQuien: (v: QuienActividad) => void
  onDias: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
      {(
        [
          { v: 'todo' as const, label: 'Todo' },
          { v: 'cliente' as const, label: 'Solo el cliente' },
        ]
      ).map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onQuien(o.v)}
          aria-pressed={quien === o.v}
          style={{ ...btnStyle(quien === o.v ? 'primario' : 'secundario', 'sm'), minHeight: 44 }}
        >
          {o.label}
        </button>
      ))}
      <span style={{ width: 12 }} />
      {VENTANAS_ACTIVIDAD.map((v) => (
        <button
          key={v.v}
          type="button"
          onClick={() => onDias(v.v)}
          aria-pressed={dias === v.v}
          style={{ ...btnStyle(dias === v.v ? 'primario' : 'secundario', 'sm'), minHeight: 44 }}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}

// ─── Una línea del muro ──────────────────────────────────────────────────────

function Fila({
  e,
  nuevo,
}: {
  e: { id: string; tipo: string; fecha: string; clienteId: string | null; cliente: string | null; texto: string | null }
  nuevo: boolean
}) {
  const riesgo = riesgoActividad(e.tipo)
  return (
    <li
      style={{
        borderTop: '1px solid var(--border)',
        padding: '10px 0',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ minWidth: 0, flex: '1 1 240px' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {nuevo && (
            <span
              aria-label="nuevo"
              title="Posterior a tu última visita"
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'var(--primary)',
                flexShrink: 0,
              }}
            />
          )}
          <strong style={{ fontSize: 14 }}>{etiquetaActividad(e.tipo)}</strong>
          {/* 🚨 Sin ficha NO se rellena con «Cliente desconocido»: identificar a
              esa persona es trabajo, y un rótulo tranquilizador lo esconde. */}
          {e.clienteId != null && e.cliente != null ? (
            <a
              href={`/correduria/cliente/${e.clienteId}`}
              style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'none' }}
            >
              {e.cliente} <ExternalLink size={11} strokeWidth={1.75} aria-hidden />
            </a>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>sin ficha casada</span>
          )}
        </div>

        {e.texto != null && (
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
            {e.texto}
          </p>
        )}

        {riesgo != null && (
          <p
            style={{
              margin: '6px 0 0',
              fontSize: 12.5,
              color: 'var(--warning)',
              display: 'flex',
              gap: 5,
              alignItems: 'flex-start',
            }}
          >
            <AlertTriangle size={13} strokeWidth={1.75} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
            {riesgo}
          </p>
        )}
      </div>

      <time
        dateTime={e.fecha}
        style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', flexShrink: 0 }}
      >
        {fechaCorta(e.fecha)}
      </time>
    </li>
  )
}

/** Una fecha que no parsea se enseña tal cual: preferible a «Invalid Date». */
function fechaCorta(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// ─── Paginador ───────────────────────────────────────────────────────────────

function Paginador({
  pagina,
  total,
  mostrados,
  onPagina,
  cargando,
}: {
  pagina: number
  total: number
  mostrados: number
  onPagina: (n: number) => void
  cargando: boolean
}) {
  const desde = (pagina - 1) * 50
  const hayMas = desde + mostrados < total
  if (pagina === 1 && !hayMas) return null
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
      <button
        type="button"
        disabled={pagina <= 1 || cargando}
        onClick={() => onPagina(pagina - 1)}
        style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}
      >
        Anterior
      </button>
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>
        {desde + 1}–{desde + mostrados} de {total}
      </span>
      <button
        type="button"
        disabled={!hayMas || cargando}
        onClick={() => onPagina(pagina + 1)}
        style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}
      >
        Siguiente
      </button>
    </div>
  )
}

// ─── Cuando no se ha podido leer ─────────────────────────────────────────────

/**
 * 🚨 Nunca se pinta un muro vacío por un fallo. «No se ha podido leer» y «no ha
 * pasado nada» se verían igual, y solo uno de los dos autoriza a concluir que
 * los clientes no están usando la intranet.
 */
function Aviso({ r, cargando }: { r: ResultadoActividad | null; cargando: boolean }) {
  if (r == null) return <p style={sutil}>{cargando ? 'Cargando…' : 'Sin datos.'}</p>
  if (r.ok) return null
  const texto =
    r.motivo === 'sin_configurar'
      ? 'Falta ASEGURA_OPERADOR_SECRET en este proyecto: no se puede preguntar a la cartera.'
      : (MOTIVOS_PUERTO[r.motivo as keyof typeof MOTIVOS_PUERTO] ?? 'No se ha podido leer la actividad.')
  return (
    <p style={{ ...sutil, color: 'var(--warning)' }}>
      {texto}
      {r.causa != null && ` ${r.causa}`}
    </p>
  )
}
