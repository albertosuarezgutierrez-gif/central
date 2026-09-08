import Link from 'next/link'
import { Wrench } from 'lucide-react'
import { planBackfillDni, planBackfillContacto, type PlanBackfillDni, type PlanBackfillContacto, type CuentaBackfillContacto } from '@/lib/correduria-puerto'
import { PageHeader } from '@/components/ui'
import EscribirIndiceDni from './EscribirIndiceDni'

export const dynamic = 'force-dynamic'

/**
 * Mantenimiento de la cartera. Hoy tiene una sola cosa: el estado del blind
 * index de DNI, que es lo que bloquea 552 de los 556 grupos de fichas
 * duplicadas (medido el 03/09/2026).
 *
 * Está aparte de `/correduria` a propósito: no es trabajo del día a día, es una
 * pasada que se hace cuando toca. Meterlo en la pantalla que Alberto abre todas
 * las mañanas sería ruido permanente por una tarea de una tarde.
 *
 * ⚠️ **Corregido el 05/09/2026.** Aquí ponía que la página no escribe nada y que
 * no hay botón mientras queden choques, «porque uno que promete escribir y
 * revienta a la mitad es peor que no tenerlo». La escritura no revienta: el
 * puerto clasifica cada ficha antes de tocar nada y sólo escribe las que no
 * chocan. La consecuencia de aquella frase fue que «hacer el backfill» exigía un
 * `curl` con el secreto de operador a mano — o sea, no lo podía hacer nadie.
 * Ahora el botón está aquí, y los choques dejan de ser un bloqueo para ser lo
 * que son: cobertura que falta hasta que se fusionen.
 */
export default async function MantenimientoPage() {
  const [plan, contacto] = await Promise.all([planBackfillDni(), planBackfillContacto()])
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <Link href="/correduria" style={{ fontSize: 13, color: 'var(--muted)' }}>← Correduría</Link>
        <PageHeader
          titulo="Mantenimiento de la cartera"
          icono={<Wrench size={20} strokeWidth={1.75} />}
          sub={<>
            Las fichas duplicadas no se fusionan porque el criterio fuerte —mismo NIF— está ciego:
            hay miles de fichas con el DNI guardado y sin su índice de búsqueda. Aquí se ve cuántas,
            y cuántas de ellas resultan ser la misma persona dos veces.
          </>}
        />
      </div>
      <BlindIndexDni plan={plan} />
      <BlindIndexContacto plan={contacto} />
    </div>
  )
}

const tarjeta: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: 14,
  background: 'var(--surface)',
  display: 'grid',
  gap: 10,
}

function BlindIndexDni({ plan }: { plan: PlanBackfillDni }) {
  if (plan.estado === 'sin_configurar') {
    return (
      <div style={tarjeta}>
        <h2 style={{ margin: 0, fontSize: 15 }}>Índice de búsqueda por DNI</h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          El puerto de asegura no está configurado aquí (falta <code>ASEGURA_OPERADOR_SECRET</code>).
          Esto <strong>no</strong> quiere decir que no haya nada que arreglar: es que no se ha podido mirar.
        </p>
      </div>
    )
  }
  if (plan.estado === 'error') {
    return (
      <div style={tarjeta}>
        <h2 style={{ margin: 0, fontSize: 15 }}>Índice de búsqueda por DNI</h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          No se ha podido consultar: <strong>{plan.motivo}</strong>. Otra vez: no se ha mirado, no es que esté todo bien.
        </p>
      </div>
    )
  }

  const listo = plan.enChoque === 0 && plan.rellenables === 0
  return (
    <div style={tarjeta}>
      <h2 style={{ margin: 0, fontSize: 15 }}>Índice de búsqueda por DNI</h2>

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Cifra n={plan.rellenables} rotulo="se pueden rellenar" nota="tienen DNI, les falta el índice y no chocan con nadie" />
        <Cifra n={plan.enChoque} rotulo="son un DNI repetido" nota="la misma persona dos veces: se fusionan por lote SQL, y hasta entonces no se indexan" alerta={plan.enChoque > 0} />
        <Cifra n={plan.grupos} rotulo="grupos a fusionar" nota="cada grupo son las fichas que comparten un mismo DNI" />
        <Cifra n={plan.compartidas} rotulo="con un DNI centinela" nota="un mismo documento escrito en fichas de personas distintas: no se fusiona, se corrige" alerta={plan.compartidas > 0} />
        <Cifra n={plan.ilegibles} rotulo="con el DNI ilegible" nota="no descifra o no parece un documento — NO es «sin DNI»" />
      </div>

      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
        Sobre {plan.total.toLocaleString('es-ES')} fichas: {plan.yaTiene.toLocaleString('es-ES')} ya tienen su
        índice y {plan.sinDni.toLocaleString('es-ES')} no tienen DNI que indexar. Cada visita a esta página
        deja guardados en la base los grupos de mismo DNI (solo los identificadores de las fichas, sin
        el documento): de ahí sale el lote de fusión.
      </p>

      {listo ? (
        <p style={{ margin: 0, fontSize: 13 }}>
          ✅ No queda nada por hacer: todas las fichas con DNI tienen su índice.
        </p>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 13 }}>
            Se escriben los <strong>{plan.rellenables.toLocaleString('es-ES')}</strong> que no chocan con
            nadie. Los {plan.enChoque.toLocaleString('es-ES')} de un DNI repetido se quedan como están: no
            bloquean la escritura, pero tampoco se indexan hasta que se fusionen sus {plan.grupos} grupos
            por lote de SQL — dos fichas con el mismo DNI son la misma persona, y el reparto de sus pólizas
            no lo decide un botón.
          </p>
          {plan.compartidas > 0 && (
            <p style={{ margin: 0, fontSize: 13 }}>
              🚨 Y {plan.compartidas.toLocaleString('es-ES')} fichas llevan un <strong>DNI centinela</strong>
              {' '}({plan.gruposCompartidos} documento{plan.gruposCompartidos === 1 ? '' : 's'} escrito
              {plan.gruposCompartidos === 1 ? '' : 's'} en fichas de personas distintas). Ésas no se
              indexan nunca: el documento está mal en alguna de ellas, y escribirlo haría que una búsqueda
              por ese DNI devolviera a varias personas.
            </p>
          )}
          <EscribirIndiceDni pendientes={plan.rellenables} />
        </>
      )}
    </div>
  )
}

/**
 * El índice de búsqueda por email y teléfono (ficha + tablas hijas). Añadido el
 * 08/09/2026: Alberto buscó un correo en `/correduria` y preguntó si el buscador
 * miraba el email. Lo mira — pero sólo por hash, y había 250 fichas con email y
 * 91 con teléfono sin él: para ésas el correo correcto decía «nadie coincide».
 */
function BlindIndexContacto({ plan }: { plan: PlanBackfillContacto }) {
  if (plan.estado === 'sin_configurar') {
    return (
      <div style={tarjeta}>
        <h2 style={{ margin: 0, fontSize: 15 }}>Índice de búsqueda por email y teléfono</h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          El puerto de asegura no está configurado aquí (falta <code>ASEGURA_OPERADOR_SECRET</code>). No se ha podido mirar.
        </p>
      </div>
    )
  }
  if (plan.estado === 'error') {
    return (
      <div style={tarjeta}>
        <h2 style={{ margin: 0, fontSize: 15 }}>Índice de búsqueda por email y teléfono</h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          No se ha podido consultar: <strong>{plan.motivo}</strong>. No se ha mirado, no es que esté todo bien.
        </p>
      </div>
    )
  }
  const listo = plan.rellenables === 0
  return (
    <div style={tarjeta}>
      <h2 style={{ margin: 0, fontSize: 15 }}>Índice de búsqueda por email y teléfono</h2>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
        El buscador encuentra un correo o un móvil sólo por su índice: el valor va cifrado. Una ficha con
        el dato guardado y sin índice es invisible aunque se teclee el correo exacto.
      </p>
      <CuentaContacto titulo="Email" c={plan.email} />
      <CuentaContacto titulo="Teléfono" c={plan.telefono} />
      {plan.email.enChoque > 0 && (
        <p style={{ margin: 0, fontSize: 13 }}>
          {plan.email.enChoque.toLocaleString('es-ES')} fichas comparten correo con otra ({plan.grupos} grupo
          {plan.grupos === 1 ? '' : 's'}). El índice de email de ficha es único, así que no se escriben: son la
          misma persona dos veces o un buzón familiar, y eso lo decide una persona.
        </p>
      )}
      {listo ? (
        <p style={{ margin: 0, fontSize: 13 }}>✅ No queda nada por escribir.</p>
      ) : (
        <EscribirIndiceDni
          pendientes={plan.rellenables}
          endpoint="/api/correduria/backfill-contacto"
          queSeDescifra="el email y el teléfono de las 32.000 fichas"
        />
      )}
    </div>
  )
}

function CuentaContacto({ titulo, c }: { titulo: string; c: CuentaBackfillContacto }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{titulo}</div>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Cifra n={c.rellenables} rotulo="se pueden rellenar" nota="tienen el dato y les falta el índice" alerta={c.rellenables > 0} />
        <Cifra n={c.yaTiene} rotulo="ya indexados" nota="ficha + secundarios" />
        <Cifra n={c.ilegibles} rotulo="ilegibles" nota="hay valor guardado y no descifra — NO es «sin dato»" alerta={c.ilegibles > 0} />
        <Cifra n={c.noHasheables} rotulo="sin forma de indexar" nota="descifra pero no produce índice (p. ej. un teléfono sin dígitos)" />
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
        Sobre {c.total.toLocaleString('es-ES')} filas (ficha + secundarios); {c.sinDato.toLocaleString('es-ES')} no tienen {titulo.toLowerCase()}.
      </div>
    </div>
  )
}

function Cifra({ n, rotulo, nota, alerta }: { n: number; rotulo: string; nota: string; alerta?: boolean }) {
  return (
    <div title={nota}>
      <div style={{ fontSize: 22, fontWeight: 700, color: alerta ? 'var(--warning)' : undefined }}>
        {n.toLocaleString('es-ES')}
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{rotulo}</div>
    </div>
  )
}
