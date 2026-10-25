import { redirect } from 'next/navigation'

import { consentimientosDeSesion, type ConsentimientoListado } from '@/lib/avisos-preferencias'
import { oposicionSenalesVigente } from '@/lib/oposicion-senales'
import { getIdentidad } from '@/lib/session'

import { ActivarPush, PreferenciasAvisos } from '../../ActivarPush'
import { AjustesAvisos } from './AjustesAvisos'
import { OposicionSenalesPatrimonio } from './OposicionSenalesPatrimonio'

export const dynamic = 'force-dynamic'

/**
 * «Configuración» (13/10/2026, fase A): los avisos y lo que has consentido.
 *
 *  · Avisos: el interruptor de ESTE dispositivo (`ActivarPush`), qué novedades avisar
 *    (`PreferenciasAvisos`, antes en la campana), y antelación / «no molestar»
 *    (`AjustesAvisos`, `/api/configuracion/avisos`; el canal, oculto hasta la fase B). Las dos últimas valen para todos tus
 *    dispositivos; la primera solo para este, y la pantalla lo dice.
 *  · Privacidad: las filas de `portal_consentimiento` de esta identidad (append-only), con fecha y
 *    versión del texto. Solo lectura: cada casilla se cambia en su sitio, SALVO la oposición a la revisión de los
 *    seguros de los inmuebles (P15, interés legítimo), que se ejerce aquí (y en «Patrimonio»).
 *
 * La identidad sale de la cookie (`lib/session.ts`); aquí no entra ningún id por la URL.
 */
export default async function ConfiguracionPage() {
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')
  const consentimientos = await consentimientosDeSesion().catch(() => null)
  const oposicion = await oposicionSenalesVigente(identidad.id).catch(() => 'ilegible' as const)

  return (
    <>
      <h1>Configuración</h1>
      <p className="suave" style={{ marginTop: 0 }}>
        Cómo y cuándo te avisamos, y lo que nos has autorizado.
      </p>

      <section className="seccion config-avisos" id="avisos" aria-labelledby="config-avisos-titulo">
        <p className="antetitulo">Avisos</p>
        <h2 id="config-avisos-titulo">Avisos</h2>

        <h3 className="config-subtitulo">En este dispositivo</h3>
        <ActivarPush />
        <p className="suave config-nota">
          Las notificaciones se activan dispositivo a dispositivo. Si las tienes en otro móvil u ordenador, siguen
          llegando allí aunque las desactives aquí.
        </p>

        <h3 className="config-subtitulo">Qué te avisamos</h3>
        <PreferenciasAvisos />

        <AjustesAvisos />
      </section>

      <section className="seccion" id="privacidad" aria-labelledby="config-privacidad-titulo">
        <p className="antetitulo">Privacidad</p>
        <h2 id="config-privacidad-titulo">Lo que nos has autorizado</h2>
        <Consentimientos filas={consentimientos} />
        <h3 className="config-subtitulo" id="oposicion-senales">Revisión de los seguros de tus inmuebles</h3>
        {oposicion === 'ilegible' ? (
          <p className="suave">No hemos podido comprobar ahora si te has opuesto a esta revisión. Vuelve a intentarlo en un rato.</p>
        ) : (
          <OposicionSenalesPatrimonio inicial={oposicion} />
        )}
        <p className="suave config-nota">
          Las propuestas de la correduría se cambian en <a href="/boveda?vista=datos">Mis datos</a>; los avisos, aquí
          arriba. Más detalle en la <a href="/legal/privacidad">política de privacidad</a>.
        </p>
      </section>
    </>
  )
}

const NOMBRE_TIPO: Record<string, string> = {
  avisos: 'Notificaciones de avisos',
  comercial: 'Propuestas de la correduría',
  lds_art19: 'Información del mediador (art. 173 RDL 3/2020)',
  oposicion_senales_patrimonio: 'Oposición a la revisión de los seguros de tus inmuebles',
}

function fechaHora(d: Date): string {
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  })
}

/** `null` = no se han podido leer (se dice); `[]` = no consta ninguno (también se dice, distinto). */
function Consentimientos({ filas }: { filas: ConsentimientoListado[] | null }) {
  if (filas === null) return <p className="suave">No hemos podido leer tus autorizaciones. Vuelve a intentarlo en un rato.</p>
  if (filas.length === 0) return <p className="suave">No consta ninguna autorización registrada desde el portal.</p>
  return (
    <ul className="config-consentimientos">
      {filas.map((c, i) => (
        <li key={`${c.tipo}-${c.creadoEn.toISOString()}-${i}`}>
          <strong>{NOMBRE_TIPO[c.tipo] ?? c.tipo}</strong>
          <span>
            {c.tipo === 'lds_art19'
              ? 'Te la enseñamos'
              : c.tipo === 'oposicion_senales_patrimonio'
                ? c.otorgado ? 'Te opusiste' : 'Retiraste la oposición'
                : c.otorgado ? 'Aceptado' : 'Retirado'}{' '}
            el {fechaHora(c.creadoEn)}
          </span>
          <span className="config-version">Versión del texto: {c.versionTexto}</span>
        </li>
      ))}
    </ul>
  )
}
