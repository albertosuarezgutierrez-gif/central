import Link from 'next/link'
import { requireSession } from '@/lib/session'
import SubirPoliza from './subir-poliza'

export const dynamic = 'force-dynamic'

/**
 * Subir una póliza para que el agente la lea.
 *
 * Es la vía rápida de la fase 1 (presupuesto): un PDF de póliza trae el
 * vehículo completo, las coberturas y la prima — justo los huecos que hoy
 * obligan a preguntar, y rellenados de una vez en lugar de una por cotización.
 */
export default async function SubirPage() {
  await requireSession()

  return (
    <div className="grid">
      <div>
        <p className="muted">
          <Link href="/cartera">← Cartera</Link>
        </p>
        <h1>Subir una póliza</h1>
        <p className="muted">
          El agente la lee y te enseña lo que ha encontrado. <strong>No cuesta nada</strong>: leer
          un documento es gratis, el precio se pide aparte.
        </p>
      </div>

      <SubirPoliza />

      <div className="card">
        <h2>Qué pasa con el documento</h2>
        <ul className="muted">
          <li>
            <strong>No se guarda el fichero.</strong> Se lee, se te enseña lo leído y se descarta.
            Falta decidir dónde y cuánto tiempo conservar documentos que llevan DNI y matrícula
            dentro, y guardarlos antes de decidir eso sería peor que no guardarlos.
          </li>
          <li>
            <strong>No se modifica la ficha del cliente.</strong> La cartera se lee, no se escribe,
            mientras el traspaso no esté cerrado.
          </li>
          <li>
            Lo leído queda marcado como <strong>«leído de un documento»</strong>: vale más que lo
            que se teclea a mano, y menos que lo que manda la compañía por CIMA — así que nunca lo
            pisa.
          </li>
        </ul>
      </div>
    </div>
  )
}
