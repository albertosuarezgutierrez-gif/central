import { redirect } from 'next/navigation'

import { Entrada } from './Entrada'
import { getIdentidad } from '@/lib/session'

// Lee la cookie, así que no se puede prerenderizar. Explícito para que nadie
// lo convierta en estático más adelante: si esta página se cachea, todo el
// mundo comparte la respuesta de la primera persona que entró.
export const dynamic = 'force-dynamic'

/**
 * La puerta de la calle.
 *
 * 🚨 SU TRABAJO ES MIRAR SI YA HAY SESIÓN, y es lo que faltaba (05/09/2026).
 * Hasta hoy `/` era directamente el formulario —un componente de cliente— así
 * que a quien ya había entrado se le volvía a pedir el correo y el código
 * aunque su cookie de 30 días siguiera perfectamente viva. No fallaba nada: la
 * puerta simplemente no preguntaba quién eras. Alberto lo describió como «me
 * pide el código cada vez que entro», y tenía razón en el síntoma y nosotros
 * nos íbamos a equivocar en la causa: no era la sesión, era la puerta.
 *
 * Es además la respuesta buena a «que el enlace del correo entre de un clic»:
 * con esto, quien ya entró una vez **no ve ninguna pantalla de acceso** durante
 * 30 días — abre la dirección y está dentro. El código deja de ser «cada vez»
 * para ser «una vez al mes, o al cambiar de móvil».
 *
 * 📌 Y por eso NO se ha hecho que el enlace canjee solo al abrirse: ver
 * `lib/enlace-acceso.ts`. Los sandboxes de correo que renderizan la página con
 * un navegador de verdad SÍ ejecutarían ese JavaScript y se comerían el código,
 * y el usuario se encontraría un `ya_usado` que parece culpa suya. Arreglar la
 * puerta quita la fricción sin abrir esa puerta trasera.
 */
export default async function Raiz() {
  // La puerta única: la identidad sale de la cookie, nunca de la petición.
  const identidad = await getIdentidad()
  if (identidad) redirect('/boveda')
  return <Entrada />
}
