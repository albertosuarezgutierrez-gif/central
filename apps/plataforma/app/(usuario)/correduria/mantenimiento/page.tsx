import Link from 'next/link'
import { Wrench } from 'lucide-react'
import { planBackfillDni, type PlanBackfillDni } from '@/lib/correduria-puerto'
import { PageHeader } from '@/components/ui'

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
 * 🚨 Esta página **no escribe nada**. El GET del puerto calcula el plan en seco;
 * escribir los hashes es el PASO 3 y solo puede ir después de fusionar los
 * choques, que se hacen por lote SQL con los nombres delante. Por eso aquí no
 * hay botón de escribir mientras `enChoque > 0`.
 */
export default async function MantenimientoPage() {
  const plan = await planBackfillDni()
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
        <Cifra n={plan.enChoque} rotulo="son un DNI repetido" nota="la misma persona dos veces: hay que fusionarlas ANTES de escribir" alerta={plan.enChoque > 0} />
        <Cifra n={plan.grupos} rotulo="grupos a fusionar" nota="cada grupo son las fichas que comparten un mismo DNI" />
        <Cifra n={plan.ilegibles} rotulo="con el DNI ilegible" nota="no descifra o no parece un documento — NO es «sin DNI»" />
      </div>

      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
        Sobre {plan.total.toLocaleString('es-ES')} fichas: {plan.yaTiene.toLocaleString('es-ES')} ya tienen su
        índice y {plan.sinDni.toLocaleString('es-ES')} no tienen DNI que indexar.
      </p>

      {listo ? (
        <p style={{ margin: 0, fontSize: 13 }}>
          ✅ No queda nada por hacer: todas las fichas con DNI tienen su índice.
        </p>
      ) : plan.enChoque > 0 ? (
        <p style={{ margin: 0, fontSize: 13 }}>
          🚨 <strong>Primero se fusionan los {plan.grupos} grupos</strong>, y solo después se escriben los índices.
          Al revés no se puede: la columna tiene un índice único y la segunda ficha de cada DNI repetido
          haría fallar la escritura a la mitad. La fusión se prepara como un lote de SQL, con los nombres
          delante, porque dos fichas con el mismo DNI son la misma persona pero el reparto de sus pólizas
          no lo decide un botón.
        </p>
      ) : (
        <p style={{ margin: 0, fontSize: 13 }}>
          Sin choques: los {plan.rellenables.toLocaleString('es-ES')} índices que faltan se pueden escribir
          ya de una pasada. Se lanza desde asegura y deja el recuento de lo escrito.
        </p>
      )}
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
