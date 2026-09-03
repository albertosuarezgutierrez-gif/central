'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { PhoneOff } from 'lucide-react'
import { eur } from '@/lib/dinero'
import { MOTIVOS_PUERTO, type ClienteCanal, type EstadoCanal, type SinCanal } from '@/lib/correduria-puerto'
import { Badge, Pendiente, type Tono } from '@/components/ui'
import Bloque from './Bloque'

/**
 * 📵 Clientes con los que NO hay forma de comunicarse.
 *
 * ─── Por qué esto es un problema y no una curiosidad ───────────────────────
 * Medido el 02/09/2026: la cartera viva son ~79 clientes (los que entran por
 * CIMA) y **26 no tienen ni email ni teléfono**. A esos no les llega el aviso
 * de vencimiento, no pueden entrar al portal del cliente —que identifica por
 * email— y, lo que hace que nadie se entere, **desde el código se ven igual
 * que un cliente al que sí se avisó**: el envío no falla, es que no hay a
 * dónde enviarlo.
 *
 * El trabajo que resuelve esta pantalla no se hace desde aquí: la próxima vez
 * que Alberto hable con uno de ellos por teléfono o en el despacho, le pide el
 * correo, lo apunta en su ficha y deja de salir en la lista.
 *
 * ─── Lo que esta pantalla NO dice ──────────────────────────────────────────
 * · Solo mira si **hay algo** en la columna, no si el dato sirve: un correo
 *   viejo cuenta como «tiene canal» aunque rebote.
 * · Los ~32.520 del volcado histórico NO están aquí. No son clientes de hoy:
 *   son leads con vencimientos de 2013-2018.
 * · Un `no_comprobado` NO es un «no tiene». Es que asegura no lo informó.
 *
 * ─── Por qué ya no pinta su propia caja (03/09/2026) ───────────────────────
 * El envoltorio es `Bloque`: línea fina, título y contenido. La caja tintada
 * (`destacado`) se reserva para cuando hay alguien de verdad ilocalizable —con
 * `0` o con «no comprobado» no se destaca nada, porque un recuento que no se
 * ha podido medir no es una alarma, es un hueco.
 */

// El estado va en píldora, no en emoji: 🚨 y ⁉️ se pintan distinto en cada
// sistema y a 12px no se distinguen, que es justo donde está la diferencia
// entre «no tiene canal» y «no se ha podido comprobar».
const ESTILO: Record<EstadoCanal, { label: string; tono: Tono; color: string; que: string }> = {
  sin_ninguno: {
    label: 'Ilocalizable',
    tono: 'negativo',
    color: 'var(--negative)',
    que: 'Ni email ni teléfono: no le llega el aviso de vencimiento y no puede entrar al portal.',
  },
  solo_telefono: {
    label: 'Solo teléfono',
    tono: 'aviso',
    color: 'var(--warning)',
    que: 'Hay que llamarle: sin email no le llega el aviso de vencimiento ni puede entrar al portal.',
  },
  solo_email: {
    label: 'Solo email',
    tono: 'neutral',
    color: 'var(--border)',
    que: 'Le llega el aviso, pero si el correo rebota no queda por dónde localizarle.',
  },
  con_ambos: { label: 'Localizable', tono: 'neutral', color: 'var(--border)', que: '' },
  no_comprobado: {
    label: 'No comprobado',
    tono: 'aviso',
    color: 'var(--warning)',
    que: 'asegura no ha informado sus canales. NO significa que no los tenga: significa que no se ha podido mirar.',
  },
}

const POR_PAGINA = 30

// La letra pequeña que CALIFICA el recuento. No se borra por minimalismo: sin
// ella, «26 ilocalizables» no dice de qué cartera habla ni qué se ha medido.
const SUB = (
  <>
    Esto mira si <strong>hay algo</strong> en el email o el teléfono de la ficha, no si el dato
    sirve: un correo antiguo cuenta como canal aunque rebote. Los contactos no se muestran aquí
    —van cifrados y esta lista no los necesita—; están en la ficha de cada cliente. Y solo entran
    los clientes que llegan por CIMA: las ~32.500 fichas del volcado histórico son leads, no
    clientes de hoy.
  </>
)

export default function SinCanal({
  onContador,
  primero,
}: {
  /**
   * Cuántos clientes de la cartera viva no tienen NINGÚN canal. `null` = no se
   * sabe, y nunca 0: «0 ilocalizables» es la frase tranquilizadora que aquí
   * nadie ha medido. Va en `null` también con la lista TRUNCADA — un recuento
   * recortado saldría más bajo que la realidad, o sea un contador falso.
   */
  onContador?: (n: number | null) => void
  primero?: boolean
}) {
  const [datos, setDatos] = useState<SinCanal | null>(null)
  const [ver, setVer] = useState(POR_PAGINA)

  // Por REF: una lambda nueva del padre en cada render relanzaría el fetch si
  // esto viviera en las dependencias del efecto.
  const avisar = useRef(onContador)
  avisar.current = onContador

  useEffect(() => {
    fetch('/api/correduria/sin-canal')
      .then((r) => r.json())
      .then((d: SinCanal) => {
        setDatos(d)
        // Una sola vez por carga, dentro del `.then` (en el render sería bucle).
        avisar.current?.(d.estado === 'ok' && !d.truncado ? d.resumen.sinNinguno : null)
      })
      .catch(() => {
        setDatos({ estado: 'error', motivo: 'red' })
        avisar.current?.(null)
      })
  }, [])

  if (datos === null) {
    return (
      <Bloque titulo="Clientes sin canal de contacto" Icono={PhoneOff} primero={primero}>
        <span style={pMuted}>Cargando…</span>
      </Bloque>
    )
  }

  if (datos.estado === 'sin_configurar') {
    return (
      <Bloque titulo="Clientes sin canal de contacto" sub={SUB} Icono={PhoneOff} primero={primero}>
        <p style={pMuted}>
          ⏳ El puerto con asegura no está conectado. <strong>No lo leas como «se puede avisar a
          todo el mundo»</strong>: es que desde aquí no se ha podido mirar.
        </p>
      </Bloque>
    )
  }

  if (datos.estado === 'error') {
    return (
      <Bloque titulo="Clientes sin canal de contacto" sub={SUB} Icono={PhoneOff} tono="malo" primero={primero}>
        <p style={{ ...pMuted, color: 'var(--negative)' }}>
          ⚠️ No se ha podido leer: {MOTIVOS_PUERTO[datos.motivo]} <strong>No significa que todos
          los clientes sean localizables.</strong>
        </p>
      </Bloque>
    )
  }

  const { filas, resumen } = datos
  const visibles = filas.slice(0, ver)
  // `null` = no comprobado. Nunca se sustituye por 0: «0 ilocalizables» es la
  // frase tranquilizadora que aquí no se ha medido.
  const sinNinguno = resumen.sinNinguno
  const medido = resumen.vivos !== null
  // La alarma solo se enciende con gente medida al otro lado. Con `null` (no
  // comprobado) o con la lista truncada, el hueco se dice, no se destaca.
  const hayAlarma = !datos.truncado && sinNinguno !== null && sinNinguno > 0

  return (
    <Bloque
      titulo={
        sinNinguno === null
          ? 'Clientes sin canal · sin comprobar'
          : sinNinguno === 0
            ? 'Todos los clientes vivos tienen algún canal'
            : `${sinNinguno} cliente(s) con los que NO se puede contactar`
      }
      sub={SUB}
      Icono={PhoneOff}
      tono={hayAlarma ? 'malo' : sinNinguno === null ? 'aviso' : 'neutral'}
      destacado={hayAlarma}
      primero={primero}
      accion={
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {medido ? `de ${resumen.vivos} clientes de la cartera viva (CIMA)` : 'cartera viva (CIMA)'}
        </span>
      }
    >
      {datos.truncado && (
        <p style={{ ...pMuted, color: 'var(--warning)', marginBottom: 10 }}>
          ⚠️ La lista viene recortada, así que los recuentos de arriba <strong>no se han podido
          comprobar</strong> y saldrían más bajos que la realidad. Lo que se ve abajo es una parte.
        </p>
      )}

      {sinNinguno !== null && sinNinguno > 0 && (
        <div style={{ border: '1px solid var(--negative)', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 13, lineHeight: 1.5 }}>
          <Badge tono="negativo">Ilocalizables</Badge>{' '}
          <strong>A estos {sinNinguno} no les llega NADA</strong> —ni el aviso de vencimiento ni
          la invitación al portal— y desde el sistema se ven igual que uno al que sí se avisó. La
          próxima vez que hables con alguno, pídele el correo y apúntalo en su ficha.
        </div>
      )}

      <Recuento resumen={resumen} />

      {filas.length === 0 ? (
        <p style={{ ...pMuted, marginTop: 10 }}>
          {medido
            ? 'Todos los clientes de la cartera viva tienen email y teléfono. Ojo: eso dice que hay algo guardado, no que el correo funcione.'
            : 'No se ha recibido ninguna ficha. Con el recuento sin comprobar, esto NO se puede leer como «están todos localizables».'}
        </p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, marginTop: 12 }}>
            {visibles.map((f) => (
              <Fila key={f.clienteId} f={f} />
            ))}
          </div>
          {ver < filas.length && (
            <button
              onClick={() => setVer((v) => v + POR_PAGINA)}
              style={{
                marginTop: 10, minHeight: 44, padding: '0 16px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text)', cursor: 'pointer', fontWeight: 600,
              }}
            >
              Ver {Math.min(POR_PAGINA, filas.length - ver)} más
            </button>
          )}
        </>
      )}
    </Bloque>
  )
}

/**
 * Los cuatro recuentos. Cada uno puede ser «no comprobado» por separado: un
 * hueco se dice, no se rellena con un cero que parecería una medición.
 */
function Recuento({ resumen }: { resumen: Extract<SinCanal, { estado: 'ok' }>['resumen'] }) {
  const celdas: { label: string; valor: number | null }[] = [
    { label: 'Con email', valor: resumen.conEmail },
    { label: 'Con teléfono', valor: resumen.conTelefono },
    { label: 'Con alguno', valor: resumen.conAlguno },
    { label: 'Sin ninguno', valor: resumen.sinNinguno },
  ]
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {celdas.map((c) => (
        <div
          key={c.label}
          style={{
            border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px',
            fontSize: 12, color: 'var(--muted)', flex: '1 1 120px', minWidth: 0,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
            {c.valor === null ? (
              <Pendiente texto="no comprobado" donde="la ficha de cada cliente (asegura no ha informado este recuento: no es 0)" />
            ) : (
              c.valor
            )}
          </div>
          {c.label}
        </div>
      ))}
    </div>
  )
}

function Fila({ f }: { f: ClienteCanal }) {
  const e = ESTILO[f.estado]
  return (
    <div style={{ border: '1px solid var(--border)', borderLeft: `4px solid ${e.color}`, borderRadius: 8, padding: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <Link href={`/correduria/cliente/${f.clienteId}`} style={{ fontWeight: 700, fontSize: 15 }}>
          {f.nombre}
        </Link>
        <Badge tono={e.tono}>{e.label}</Badge>
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
        <Canal tiene={f.tieneEmail} si="con email" no="sin email" cual="email" /> ·{' '}
        <Canal tiene={f.tieneTelefono} si="con teléfono" no="sin teléfono" cual="teléfono" />
        {f.polizasCima !== null && ` · ${f.polizasCima} póliza(s) por CIMA`}
        {/* Una prima que nadie informa se queda sin pintar: 0,00€ diría que no
            paga nada, y lo que pasa es que la compañía no manda el importe. */}
        {f.prima !== null && ` · ${eur(f.prima)}`}
        {f.polizasSinPrima !== null && f.polizasSinPrima > 0 && ` · ${f.polizasSinPrima} sin prima informada`}
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
        {f.proximoVencimiento !== null ? (
          <>Renueva el {fmtFecha(f.proximoVencimiento)}</>
        ) : f.polizasSinFecha !== null && f.polizasSinFecha > 0 ? (
          <span title="Sus pólizas no traen fecha de vencimiento en la base">
            Sin fecha de renovación: no se sabe cuándo vence
          </span>
        ) : (
          <span title="No hay ninguna renovación de hoy en adelante">
            Sin renovación próxima registrada
          </span>
        )}
      </div>

      {e.que && <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.45 }}>{e.que}</div>}
    </div>
  )
}

/** Tres estados en un renglón: sí, no, y «no se ha podido comprobar». */
function Canal({ tiene, si, no, cual }: { tiene: boolean | null; si: string; no: string; cual: string }) {
  if (tiene === null) {
    return (
      <span title="asegura no ha informado este canal: no es que no lo tenga, es que no se ha comprobado">
        {cual} sin comprobar
      </span>
    )
  }
  return <span>{tiene ? si : no}</span>
}

// Fecha siempre en formato español: "2026-11-03" → "03/11/2026".
function fmtFecha(iso: string): string {
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}

const pMuted: React.CSSProperties = { fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, margin: 0 }
