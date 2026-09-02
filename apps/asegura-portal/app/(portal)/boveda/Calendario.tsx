import { etiquetaProcedencia } from '@central/module-seguros-portal'

import { fechaEs } from '@/lib/fechas'
import type { ObligacionVista } from '@/lib/obligaciones'

/**
 * Pinta la fecha ACCIONABLE además de la del evento. Decirle a alguien «vence
 * el 15 de marzo» le deja creer que tiene hasta el 15; el plazo para oponerse
 * a la prórroga (art. 22 LCS) se le pasó el 13 de febrero.
 *
 * Y pinta la procedencia SIEMPRE: un dato `calculado` o `declarado` no puede
 * tener el mismo aspecto que uno que confirmó la compañía.
 */
export default function Calendario({
  obligaciones,
  sinFecha,
}: {
  obligaciones: ObligacionVista[]
  /** Pólizas en vigor cuya fecha de vencimiento la compañía no ha informado. */
  sinFecha: number
}) {
  return (
    <section className="seccion" aria-labelledby="calendario-titulo">
      <h2 id="calendario-titulo">Tu calendario</h2>

      {obligaciones.length === 0 ? (
        // Tres estados, no dos: esto es «revisado, no hay ninguno anotado»,
        // que NO es «no tienes vencimientos». Por eso se dice de dónde
        // saldrían en cuanto los haya.
        <p className="suave" style={{ margin: 0 }}>
          No hay ningún vencimiento anotado todavía. Aquí aparecerán los de las pólizas que gestiona tu
          correduría en cuanto tengan fecha de vencimiento.
        </p>
      ) : (
        <ul className="cartera">
          {obligaciones.map((o) => (
            <Fila key={o.id} o={o} />
          ))}
        </ul>
      )}

      {sinFecha > 0 && (
        // El tercer estado, dicho en voz alta: estas pólizas NO es que no
        // venzan, es que no sabemos cuándo. Callarlas y enseñar el resto
        // convertiría el calendario en una lista incompleta con aspecto de
        // completa — y el cliente decidiría sobre ella.
        <p className="suave" style={{ marginBottom: 0 }}>
          {sinFecha === 1
            ? 'Hay 1 póliza en vigor de la que todavía no tenemos fecha de vencimiento, así que no aparece aquí.'
            : `Hay ${sinFecha} pólizas en vigor de las que todavía no tenemos fecha de vencimiento, así que no aparecen aquí.`}{' '}
          Están más abajo, con el resto de tus seguros; escríbenos y lo comprobamos con la compañía.
        </p>
      )}
    </section>
  )
}

function Fila({ o }: { o: ObligacionVista }) {
  // `fechaEs` admite null porque casi todas las fechas del portal lo son; las
  // de una obligación NO (la columna es NOT NULL), pero no se rellena el hueco
  // con un «—» por si acaso: si algún día llegara vacía, se dice.
  const evento = fechaEs(o.fechaEvento) ?? 'fecha no disponible'
  const accionable = fechaEs(o.fechaAccionable) ?? 'fecha no disponible'

  return (
    <li className="cartera-card">
      <h3>{o.titulo}</h3>
      <div className="linea">
        <strong>Tienes hasta el {accionable}</strong> para decidir si la renuevas, la cambias o la anulas.
      </div>
      <div className="linea">Vence el {evento}.</div>
      <div className="chips">
        <span className="chip">{etiquetaProcedencia(o.procedencia)}</span>
        {/* `avisada: false` es «todavía no te hemos avisado», no «no hace falta»
            — y tampoco «te avisaremos»: el cron de avisos vive en el panel del
            corredor y solo manda con `ASEGURA_AVISOS_ACTIVOS=1`. Un chip que
            prometiera el aviso estaría afirmando algo que esta app no puede
            comprobar desde aquí. Se dice el hecho, no la promesa. */}
        <span className={o.avisada ? 'chip ok' : 'chip'}>
          {o.avisada ? 'Ya te hemos avisado' : 'Todavía no te hemos avisado'}
        </span>
      </div>
    </li>
  )
}
