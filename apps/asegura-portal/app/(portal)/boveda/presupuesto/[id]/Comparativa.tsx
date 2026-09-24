import { MEDIADOR, NO_EXCLUSIVIDAD } from '@central/module-seguros'

import { eur } from '@/lib/dinero'
import { NombrarCorredor } from './NombrarCorredor'
import type { ActualCliente, OpcionCliente } from '@/lib/presupuesto'
import {
  AVISO_NO_ES_CONTRATACION,
  ETIQUETA_FIRMEZA,
  TEXTO_COMPARACION,
  TEXTO_FIRMEZA,
  TEXTO_SIN_EQUIVALENTE,
  compararGarantias,
  etiquetaPapeles,
  textoCompaniasConsultadas,
  textoFranquicia,
  type EstadoGarantia,
  type SinEquivalente,
} from '@/lib/presupuesto-vista'

/**
 * Las piezas de la comparativa. Componentes de SERVIDOR: aquí no hay estado ni
 * interacción, solo lo que se afirma — y lo que se afirma lo decide
 * `lib/presupuesto-vista.ts`, no este fichero.
 *
 * 🚨 Ni un hex, ni un formato de dinero a mano: los colores salen de los tokens
 * de `MARCA_ASEGURA` (que `app/layout.tsx` inyecta) y el importe de `eur()`,
 * que es la convención española de la casa (`2.162,49€`).
 */

// ─── Qué tienes hoy ──────────────────────────────────────────────────────────

/**
 * 🚨 El bien se describe; el **número de póliza NO se pinta**. Regla permanente
 * del portal: nadie se sabe su número de póliza, y dos hogares de la misma
 * compañía se distinguen por la casa, no por trece dígitos.
 *
 * 🚨 Y sin póliza actual **no se inventa este bloque ni se calcula ahorro
 * alguno**: `poliza_id IS NULL` es VENTA NUEVA, no «no tiene seguro».
 */
export function Actual({ actual }: { actual: ActualCliente | null }) {
  if (actual === null) {
    return (
      <section className="seccion">
        <p className="antetitulo">Lo que tienes hoy</p>
        <p className="pendiente">No tengo tu seguro actual</p>
        <p className="suave" style={{ marginTop: 8 }}>
          {TEXTO_COMPARACION.sin_poliza}
        </p>
      </section>
    )
  }
  return (
    <section className="seccion">
      <p className="antetitulo">Lo que tienes hoy</p>
      <h2 style={{ margin: '2px 0 10px' }}>{actual.compania}</h2>
      <dl className="ficha-datos">
        {actual.bien !== null && (
          <>
            <dt>Qué está asegurado</dt>
            <dd>{actual.bien}</dd>
          </>
        )}
        {actual.ubicacion !== null && (
          <>
            <dt>Dónde</dt>
            <dd>{actual.ubicacion}</dd>
          </>
        )}
        <dt>Vence</dt>
        <dd>
          {actual.fechaVencimiento === null ? (
            <span className="pendiente">tu compañía no ha informado el vencimiento</span>
          ) : (
            fecha(actual.fechaVencimiento)
          )}
        </dd>
        <dt>Prima anual</dt>
        <dd>
          {/* `eur(null)` da «—», nunca «0,00€»: un hueco no es un importe. */}
          {actual.primaAnual === null ? <span className="pendiente">no informada</span> : eur(actual.primaAnual)}
        </dd>
      </dl>
    </section>
  )
}

// ─── Una opción ──────────────────────────────────────────────────────────────

/**
 * 🚨 Tres cosas que esta tarjeta no puede dejar de hacer:
 *
 *  1. **El distintivo de firmeza va POR TARJETA**, no en una nota al pie que se
 *     lee una vez. Hoy el 100 % de los precios son `estimado`, así que decir
 *     «tu precio es 412,30€» sería una oferta que ninguna compañía ha cerrado.
 *  2. **La franquicia va pegada al precio**, no escondida en el detalle: un
 *     todo riesgo con 1.500€ de franquicia callados es la versión cara de leer
 *     mal un dato que sí está. Y `null` es «el producto no la declara», nunca
 *     «sin franquicia».
 *  3. **Los avisos de la compañía se enseñan siempre.** Vienen con el precio y
 *     son lo que lo condiciona.
 */
export function Tarjeta({ o, caducado }: { o: OpcionCliente; caducado: boolean }) {
  const papel = etiquetaPapeles(o.papeles, o.coberturaDistinta)
  return (
    <article className="presu-tarjeta" data-caducado={caducado ? 'si' : undefined}>
      {papel !== null && <p className="presu-papel">{papel}</p>}
      <h3 className="presu-compania">{o.compania}</h3>
      <p className="presu-producto">
        {o.producto}
        {o.modalidad !== null && o.modalidad.trim() !== '' ? ` · ${o.modalidad}` : ''}
      </p>

      <p className="presu-importe">
        {o.primaEur === null ? <span className="pendiente">sin precio</span> : eur(o.primaEur)}
        <span className="presu-firmeza" data-firmeza={o.firmeza}>
          {ETIQUETA_FIRMEZA[o.firmeza]}
        </span>
      </p>
      <p className="presu-firmeza-texto">{TEXTO_FIRMEZA[o.firmeza]}</p>

      <p className="presu-franquicia">{textoFranquicia(o.franquiciaEur, eur)}</p>
      {o.entradaEur !== null && <p className="presu-entrada">Primer pago: {eur(o.entradaEur)}</p>}

      {o.grupoCobertura === null ? (
        <p className="pendiente">no he sabido clasificar su nivel de cobertura</p>
      ) : (
        <p className="presu-nivel">Cobertura: {o.grupoCobertura}</p>
      )}

      {o.avisos.length > 0 && (
        <ul className="presu-avisos">
          {o.avisos.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
    </article>
  )
}

// ─── La tabla de garantías: FILAS ETIQUETADAS, no una tabla con scroll ───────

const MARCA_ESTADO: Record<EstadoGarantia, string> = {
  igual: '=',
  mejor: '▲',
  peor: '▼',
  no_consta: '?',
}

const TEXTO_ESTADO: Record<EstadoGarantia, string> = {
  igual: 'igual que ahora',
  mejor: 'no la tienes hoy',
  peor: 'la tienes hoy y esta opción no la trae',
  no_consta: 'no lo sé',
}

/**
 * 🚨 CUATRO estados por línea, no dos, y `no_consta` **nunca** se pinta como
 * `igual`: una garantía que no se sabe si está es lo contrario de una que se
 * sabe que está, y pintarlas igual convierte un hueco en una frase
 * tranquilizadora — justo sobre la que alguien decide cambiar de seguro.
 *
 * 🚨 Y `peor` **se pinta siempre, aunque estropee la venta**, y va arriba
 * (`compararGarantias` lo ordena así): lo que puede dejar a alguien peor
 * cubierto no se entierra en la línea catorce.
 *
 * 📱 Se pinta como FILAS ETIQUETADAS y no como una tabla con scroll
 * horizontal: una comparación que hay que arrastrar no se compara.
 */
export function Garantias({ o, actual }: { o: OpcionCliente; actual: ActualCliente | null }) {
  const c = compararGarantias(actual?.coberturas ?? null, o.coberturas, { hayPolizaActual: actual !== null })

  return (
    <section className="presu-garantias">
      <h4 className="presu-garantias-titulo">
        {actual === null ? `Garantías de ${o.compania}` : `Garantías de ${o.compania}, frente a las tuyas`}
        {c.peores > 0 && <span className="chip peligro"> {c.peores} que hoy sí tienes</span>}
      </h4>

      {c.estado !== 'comparada' && <p className="pendiente">{TEXTO_COMPARACION[c.estado]}</p>}

      {c.lineas.length > 0 && (
        <ul className="presu-lineas">
          {c.lineas.map((l, i) => (
            <li key={i} data-estado={l.estado}>
              <span className="presu-marca" aria-hidden>
                {MARCA_ESTADO[l.estado]}
              </span>
              <span className="presu-garantia">{l.etiqueta}</span>
              <span className="presu-estado">{TEXTO_ESTADO[l.estado]}</span>
            </li>
          ))}
        </ul>
      )}

      {/* La comparación es de NOMBRES de garantía, no de capitales: el snapshot
          congela las coberturas como textos sueltos. Decirlo es la diferencia
          entre una comparativa y una promesa. */}
      <p className="suave presu-nota">
        Comparo los nombres de las garantías, no sus capitales ni sus límites. Lo que manda es el
        condicionado de cada compañía, y te lo paso entero antes de contratar.
      </p>
    </section>
  )
}

// ─── Por qué no hay equivalente ──────────────────────────────────────────────

/** Los DOS motivos NO se colapsan: llevan a decisiones distintas. */
export function SinEquivalenteAviso({ motivo }: { motivo: SinEquivalente | null }) {
  if (motivo === null) return null
  return <p className="pendiente presu-sin-equivalente">{TEXTO_SIN_EQUIVALENTE[motivo]}</p>
}

// ─── El bloque del mediador: VISIBLE y sin plegar ───────────────────────────

/**
 * Art. 19 de la Ley 16/2018 y el «asesoramiento sobre la base de un análisis
 * objetivo» del RDL 3/2020. Todo sale de `MEDIADOR` de `@central/module-seguros`:
 * 🚨 **ni el nombre ni la clave DGSFP se teclean aquí**. Dos copias de un
 * número de registro es una copia de más.
 *
 * ⚠️ Lo que NO se puede decir, y hay que saber por qué: «consulté 8 compañías y
 * me dieron precio 3». Ese recuento **no está en el snapshot** — el preparador
 * congela solo las opciones de portada y su `preciosTotales` no se escribe en
 * ninguna columna. Estimarlo desde las compañías de la portada diría «consulté
 * 2» sobre una tarificación de ocho, y ese número es justo el que sostiene la
 * afirmación legal. Se dice lo que se puede probar.
 */
export function Mediador({ companiasEnPortada }: { companiasEnPortada: number }) {
  const { nombre, figura, claveDgsfp, email, telefono } = MEDIADOR.identidad
  return (
    <section className="seccion presu-mediador">
      <h2 style={{ marginTop: 0 }}>Quién te lo prepara</h2>
      <p style={{ margin: '0 0 8px' }}>
        <strong>{nombre}</strong> — {figura}, inscrito en el Registro de la DGSFP con la clave{' '}
        <strong>{claveDgsfp}</strong>, bajo el nombre comercial {MEDIADOR.marca}.
      </p>
      <p style={{ margin: '0 0 8px' }}>
        El asesoramiento se presta <strong>sobre la base de un análisis objetivo</strong>:{' '}
        {textoCompaniasConsultadas(companiasEnPortada)}
      </p>
      <p className="suave" style={{ margin: '0 0 8px' }}>
        {NO_EXCLUSIVIDAD}
      </p>
      <p className="suave" style={{ margin: '0 0 8px' }}>
        {MEDIADOR.remuneracion.resumen}
      </p>
      <p style={{ margin: 0 }}>
        Dudas o reclamaciones: <a href={`mailto:${email}`}>{email}</a> ·{' '}
        <a href={`tel:${telefono}`}>{telefono}</a>. Si no lo resolvemos, puedes acudir al Servicio de
        Reclamaciones de la DGSFP.
      </p>
    </section>
  )
}

// ─── Las dos salidas ─────────────────────────────────────────────────────────

/**
 * 🚨 DOS salidas con el MISMO peso visual, y esa simetría es el punto: si solo
 * se ofrece «me cambio», el que dice que no se va con las manos vacías; con la
 * carta de mediador, el «no» de hoy es el cliente de la renovación siguiente.
 *
 * ⚠️ Las dos son **visuales** en este PR, y a propósito: elegir y firmar es el
 * PR 4, y la carta de nombramiento el PR 6. Lo que NO se hace es pintar un
 * botón apagado sin explicación — el camino que SÍ funciona hoy (escribirle o
 * llamarle) se ofrece de verdad, porque un CTA que no lleva a ninguna parte es
 * peor que no tenerlo.
 *
 * 🚨 **La salida B («llévamelo yo») exige un seguro actual que llevarse.** Con
 * `poliza_id IS NULL` (venta nueva, §2.2) no hay una póliza que seguir teniendo
 * ni un corretaje que traspasar — ofrecerla ahí prometería «no cambia ni tu
 * precio ni tus garantías» sobre un seguro que no existe, justo lo que el
 * bloque `Actual` de arriba ya dice que no tiene. Se hace visible con
 * `hayPolizaActual`.
 */
export function Salidas({ caducado, hayPolizaActual, presupuestoId, puedeNombrar, corredor }: {
  caducado: boolean; hayPolizaActual: boolean
  /** Se puede firmar la carta de nombramiento (no retirado ni emitido ni aceptado). */
  presupuestoId: string; puedeNombrar: boolean; corredor: boolean
}) {
  const { email, telefono } = MEDIADOR.identidad
  return (
    <section className="seccion">
      <h2 style={{ marginTop: 0 }}>Y ahora, ¿qué?</h2>
      <p className="suave" style={{ marginTop: 0 }}>
        {AVISO_NO_ES_CONTRATACION}
      </p>
      <div className="presu-salidas">
        <article className="presu-salida">
          <h3>Me cambio de compañía</h3>
          <p>
            Dime cuál de las opciones te encaja y la tramito: confirmo el precio con la compañía y te
            digo lo que haga falta para emitirla.
          </p>
          <a className="boton" href={`mailto:${email}?subject=${encodeURIComponent('Mi presupuesto')}`}>
            Decirle cuál quiero
          </a>
        </article>
        {hayPolizaActual && (
          <article className="presu-salida">
            <h3>Quédate con tu seguro, pero llévamelo yo</h3>
            <p>
              Si prefieres no cambiar de compañía, puedo pasar a ser tu corredor en la póliza que ya
              tienes. No cambia ni tu precio ni tus garantías: cambia a quién llamas cuando pasa algo.
            </p>
            {puedeNombrar && <NombrarCorredor presupuestoId={presupuestoId} corredor={corredor} />}
            <a className="boton-tenue" href={`tel:${telefono}`}>
              Hablarlo por teléfono
            </a>
          </article>
        )}
      </div>
      {caducado && (
        <p className="pendiente" style={{ marginTop: 12 }}>
          Como los precios han caducado, lo primero que haré es volver a pedirlos. Dímelo y los
          actualizo.
        </p>
      )}
    </section>
  )
}

export function fecha(d: Date): string {
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}
