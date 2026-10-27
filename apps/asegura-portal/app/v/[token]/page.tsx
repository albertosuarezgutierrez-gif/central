import Link from 'next/link'
import { notFound } from 'next/navigation'

import { TEXTO_SEMAFORO, TEXTO_TIPO_RECORDATORIO, type Semaforo, type TelefonoPublico, type VistaPublicaVehiculo } from '@central/module-seguros-portal'
import { MEDIADOR } from '@central/module-seguros'

import { MarcaAsegura } from '@/app/MarcaAsegura'
import { vistaPublicaPorToken } from '@/lib/vehiculo-publico'
import { sellarUsoVehiculo } from '@/lib/vehiculo-token'

export const dynamic = 'force-dynamic'

/**
 * 🚨 `noindex` explícito, y en `next.config.ts` además `Referrer-Policy: no-referrer` y `Cache-Control: no-store`
 * para `/v/*`: la URL lleva el token dentro y solo debe viajar en la pegatina.
 */
export const metadata = {
  title: 'Vehículo asegurado — Grupo ASegura',
  robots: { index: false, follow: false },
}

/**
 * La página del QR de un VEHÍCULO (27/10/2026, F1). Spec `docs/superpowers/specs/2026-10-27-qr-vehiculo-flota.md`.
 *
 * PÚBLICA a propósito —fuera del grupo `(portal)`, sin sesión y sin tocar cookies—: la abre quien escanea la
 * pegatina de la guantera, en el arcén, con prisa. El token dice QUÉ vehículo es, no quién eres.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🚨 Esta página SOLO recibe un `VistaPublicaVehiculo`: el objeto que arma la allow-list PURA
 * (`vistaPublicaVehiculo()` de `@central/module-seguros-portal`). No importa la cartera, ni la flota, ni Prisma: lo
 * que no está en la vista no puede pintarse aquí aunque alguien lo añada mañana a la lectura. El nombre del titular
 * de un particular, la prima, el NIF, la dirección o una fecha exacta no existen en ese tipo.
 *
 * Anulado, inexistente, mal formado o de una empresa que ya no existe → el MISMO 404 (`notFound()`): la página no
 * distingue los casos, ni por el cuerpo ni por la consulta (una sola, por el hash del token).
 * ─────────────────────────────────────────────────────────────────────────────
 */
export default async function VehiculoPublico({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const r = await vistaPublicaPorToken(token)
  if (r === null) notFound()
  const { vista } = r

  // Se sella DESPUÉS de decidir qué se enseña, sin dejar que un fallo tumbe la página.
  await sellarUsoVehiculo(r.qrId)

  return (
    <main className="vehiculo-publico">
      <header className="vp-cabecera">
        <MarcaAsegura alto={32} className="vp-monograma" />
        <span className="vp-identidad">
          <span className="vp-wordmark">{MEDIADOR.marca}</span>
          <span className="vp-dgsfp">Correduría de seguros · DGSFP {MEDIADOR.identidad.claveDgsfp}</span>
        </span>
      </header>

      <h1 className="vp-titulo">{vista.carretera?.matricula ?? 'Vehículo asegurado'}</h1>

      {vista.carretera && <DatosCarretera c={vista.carretera} />}

      <section className="vp-seccion" aria-labelledby="vp-accidente">
        <h2 id="vp-accidente">Qué hacer en un accidente</h2>
        <ol className="vp-pasos">
          <li>
            Si hay heridos, llama al <a className="vp-tel-112" href="tel:112">112</a>.
          </li>
          <li>Ponte el chaleco y señaliza el vehículo (luz V-16 o triángulos).</li>
          <li>Si hay otro vehículo, rellenad juntos la declaración amistosa y haced fotos.</li>
          <li>Llama a la asistencia de la compañía para la grúa o la ayuda en carretera.</li>
        </ol>
      </section>

      {vista.estado && <EstadoAlDia e={vista.estado} />}

      {vista.recordatorios && vista.recordatorios.length > 0 && (
        <section className="vp-seccion" aria-labelledby="vp-recordatorios">
          <h2 id="vp-recordatorios">Recordatorios</h2>
          <ul className="vp-lista">
            {vista.recordatorios.map((x, i) => (
              <li key={i}>
                {TEXTO_TIPO_RECORDATORIO[x.tipo]}{' '}
                <span className={x.estado === 'vencido' ? 'chip aviso' : 'chip'}>{x.estado === 'vencido' ? 'Vencido' : 'Pendiente'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="vp-entrar">
        {/* F1: la vista identificada (con fechas, notas y quién puede escribir) llega en F2. */}
        ¿Es tu vehículo? <Link href="/">Entra en tu portal</Link> para ver más.
      </p>

      <p className="vp-pie">
        {MEDIADOR.marca} · <a href={`mailto:${MEDIADOR.identidad.email}`}>{MEDIADOR.identidad.email}</a>
      </p>
    </main>
  )
}

function DatosCarretera({ c }: { c: NonNullable<VistaPublicaVehiculo['carretera']> }) {
  return (
    <section className="vp-seccion" aria-labelledby="vp-carretera">
      <h2 id="vp-carretera">Datos para carretera</h2>
      {c.compania === null ? (
        // 🚨 No encontrar la póliza NO es «sin seguro»: puede estar asegurado en otra parte.
        <p className="vp-nota">
          No tenemos a mano los datos de su seguro. Puede estar asegurado en otra compañía o correduría: pregunta a quien lo conduce.
        </p>
      ) : (
        <dl className="vp-datos">
          {c.titular && (
            <>
              <dt>Titular</dt>
              <dd>{c.titular}</dd>
            </>
          )}
          <dt>Compañía</dt>
          <dd>{c.compania}</dd>
          {c.numeroPoliza && (
            <>
              <dt>Póliza</dt>
              <dd>{c.numeroPoliza}</dd>
            </>
          )}
        </dl>
      )}
      {c.compania !== null && <Telefonos t={c.telefonos} />}
    </section>
  )
}

/** `null` = no lo tenemos VERIFICADO: se dice «pídenoslo», nunca un número de relleno. */
function Telefonos({ t }: { t: TelefonoPublico[] | null }) {
  if (t === null) {
    return (
      <p className="vp-nota">
        No tenemos verificado el teléfono de asistencia de esta compañía. Pídenoslo en{' '}
        <a href={`mailto:${MEDIADOR.identidad.email}`}>{MEDIADOR.identidad.email}</a>.
      </p>
    )
  }
  return (
    <ul className="vp-telefonos">
      {t.map((v, i) => (
        <li key={i}>
          {v.tipo === 'whatsapp' ? (
            // `tel:` sobre un WhatsApp marcaría la línea de voz, que es justo lo que NO se promete.
            <a className="vp-tel" href={v.enlace} rel="noreferrer">
              <span className="vp-tel-uso">WhatsApp</span>
              <span className="vp-tel-numero">{v.numero}</span>
            </a>
          ) : (
            <a className="vp-tel" href={`tel:${v.numero.replace(/\s/g, '')}`}>
              <span className="vp-tel-uso">
                {v.uso === 'asistencia' ? (v.para !== null ? `Asistencia · ${v.para}` : 'Asistencia en carretera') : 'Dar parte'}
              </span>
              <span className="vp-tel-numero">{v.numero}</span>
            </a>
          )}
          {/* El horario va con SU vía: uno sin horario se lee como «siempre». */}
          {v.horario && <span className="vp-tel-horario">{v.horario}</span>}
        </li>
      ))}
    </ul>
  )
}

const CLASE_SEMAFORO: Record<Semaforo, string> = {
  al_dia: 'chip ok',
  vence_pronto: 'chip aviso',
  vencido: 'chip peligro',
  // «No lo sabemos» NUNCA en verde.
  no_sabemos: 'chip aviso',
}

function EstadoAlDia({ e }: { e: NonNullable<VistaPublicaVehiculo['estado']> }) {
  return (
    <section className="vp-seccion" aria-labelledby="vp-estado">
      <h2 id="vp-estado">Estado</h2>
      {/* El semáforo lleva TEXTO, no solo color, y ninguna fecha exacta. */}
      <ul className="vp-lista">
        <li>
          ITV <span className={CLASE_SEMAFORO[e.itv]}>{TEXTO_SEMAFORO[e.itv]}</span>
        </li>
        <li>
          Seguro <span className={CLASE_SEMAFORO[e.seguro]}>{TEXTO_SEMAFORO[e.seguro]}</span>
        </li>
      </ul>
      {(e.itv === 'no_sabemos' || e.seguro === 'no_sabemos') && (
        <p className="vp-nota">«No lo sabemos» quiere decir eso: no tenemos el dato confirmado, no que esté mal.</p>
      )}
    </section>
  )
}
