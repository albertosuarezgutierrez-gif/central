import Link from 'next/link'

import { fechaEs } from '@/lib/fechas'

import { EliminarPoliza } from './EliminarPoliza'
import { IconoRamo, RAMO } from './PolizaVista'

/**
 * Una póliza que ha añadido el CLIENTE, en la misma lista que su cartera.
 *
 * 🚨 Por qué está aquí y no en su propia pestaña (05/09/2026). Alberto, mirando
 * su portal: *«mis seguros y mis pólizas es lo mismo… que venga de CIMA, que ya
 * tenemos datos, o que alguna no la tengamos y el cliente la añada para
 * controlar»*. Para quien mira, sí: es la lista de lo que tiene asegurado.
 * Tenerlas en dos pestañas con dos nombres que en castellano son sinónimos era
 * pedirle que adivinara.
 *
 * 🚨 **Pero el cartel «Añadida por ti» no es decoración, y no se quita.** Para
 * el cliente las dos son «un seguro»; para la correduría no: esta NO la
 * gestiona nadie de la casa. Si esa persona llama por un siniestro de esta
 * póliza, no hay datos, no hay relación con esa compañía y no hay nadie que la
 * haya revisado. Que las dos filas se vean idénticas sería la misma familia de
 * fallo que la etiqueta «De {titular}» de `FilaPoliza`: no falla nada, solo que
 * alguien cuenta con una cobertura que nadie le ha confirmado.
 *
 * Y va en la FILA, no en la ficha: un cartel que solo se ve tras un clic no
 * existe para quien está repasando la lista.
 */
export function FilaDeclarada({
  p,
  avisoPartes,
}: {
  p: {
    id: string
    compania: string | null
    ramo: string | null
    fechaVencimiento: Date | null
    /** El nombre del PDF que subió, si vino de ahí. Solo dice de dónde salió. */
    deDocumento: boolean
  }
  /**
   * El aviso de que sus partes de siniestro se conservan al quitarla, o `null`
   * si no tiene ninguno. Lo calcula el padre con `avisoPartesConservados()`.
   */
  avisoPartes: string | null
}) {
  const vence = fechaEs(p.fechaVencimiento)
  const ramo = p.ramo ? (RAMO[p.ramo] ?? p.ramo) : null
  // El titular de la fila es lo que la persona reconoce. En una añadida a mano
  // eso es la compañía; si ni eso hay, se dice que falta EN el título en vez de
  // dejar la fila sin nombre — una fila muda no se puede ni buscar ni contar.
  const titulo = p.compania ?? 'Póliza sin compañía identificada'
  const meta = [ramo, vence ? `Vence el ${vence}` : 'Sin fecha de vencimiento'].filter(Boolean).join(' · ')

  return (
    <li
      className="poliza-fila"
      // Sin vencimiento conocido va en `aviso`: es lo único de una póliza
      // aportada que le puede pasar por encima sin enterarse, y nadie de la
      // correduría se lo va a avisar porque no la gestionamos.
      data-estado={p.fechaVencimiento === null ? 'aviso' : undefined}
    >
      <Link href={`/boveda/anadida/${p.id}`} className="poliza-enlace">
        <IconoRamo ramo={p.ramo} />
        <span className="poliza-cuerpo">
          <span className="poliza-titulo">{titulo}</span>
          <span className="poliza-meta">{meta}</span>
          <span className="chips">
            <span className="chip acento">Añadida por ti</span>
            {/* De dónde salió el dato: leído de un PDF por una IA, o tecleado.
                Importa porque lo leído de un PDF puede estar mal y esta pantalla
                es donde se corrige. */}
            {p.deDocumento && <span className="chip">Leída de tu PDF</span>}
          </span>
        </span>
        <span className="poliza-flecha" aria-hidden>
          ›
        </span>
      </Link>
      {/* 🚨 Quitarla se ofrece AQUÍ, en la lista, y no solo al final de su ficha.
          Alberto (08/09/2026): «no puedo eliminar “Póliza sin compañía
          identificada”… el cliente se puede equivocar, puede crear y quitar las
          pólizas que quiera, esto es una herramienta de gestión». El botón ya
          existía en la ficha —debajo del formulario de corregir— y desde la lista
          no se veía: una acción que hay que ir a buscar es una acción que no
          existe. Solo las APORTADAS lo llevan: `FilaPoliza` (cartera) no tiene
          esto, porque lo que entra por CIMA no lo borra el cliente. */}
      <div className="poliza-acciones">
        <EliminarPoliza id={p.id} titulo={titulo} avisoPartes={avisoPartes} />
      </div>
    </li>
  )
}
