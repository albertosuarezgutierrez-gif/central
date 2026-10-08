import type { SeguimientoParte } from '@central/module-seguros-portal'

/**
 * La línea «en qué punto está» de un parte: cuatro pasos y una frase. Presentacional
 * (sin estado ni hooks): sirve igual desde la lista de partes (componente de cliente)
 * y desde la ficha de la póliza (servidor). Todo lo que pinta sale de
 * `seguimientoDeParte`, que no tiene sitio para reserva, perito, tramitador ni notas.
 */
export function SeguimientoDeParte({ s }: { s: SeguimientoParte }) {
  return (
    <div className="parte-seguimiento">
      {s.pasos.length > 0 && (
        <ol className="parte-pasos" aria-label="Estado de tu parte">
          {s.pasos.map((p) => (
            <li
              key={p.clave}
              className={p.actual ? 'actual' : p.hecho ? 'hecho' : undefined}
              aria-current={p.actual ? 'step' : undefined}
            >
              {p.etiqueta}
            </li>
          ))}
        </ol>
      )}
      <p className={s.rechazado ? 'parte-seguimiento-texto ojo' : 'parte-seguimiento-texto'}>{s.texto}</p>
    </div>
  )
}
