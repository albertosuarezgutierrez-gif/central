// apps/plataforma/lib/sivra/cors-publico.ts
//
// Cabeceras CORS del endpoint público de disponibilidad (el que alimenta el calendario
// de la landing de House Sevillana).
//
// 🚨 LA REGLA, aprendida a base de romperla dos veces el mismo día (20/08/2026):
//    **una respuesta que se cachea NO puede depender del `Origin` de quien pregunta.**
//
// Primer intento (PR #1500): se devolvía el origen literal si estaba en una lista blanca. Como la
// respuesta lleva `s-maxage=600`, el CDN guardó UNA copia y **la primera petición decidió las
// cabeceras de todas durante 10 minutos**. La primera fue un `curl` de comprobación SIN `Origin`
// → copia sin `Access-Control-Allow-Origin` → el navegador de housesevillana.es la rechazó y la
// landing enseñó su aviso de error. Roto en el navegador, impecable por curl.
//
// Segundo intento (PR #1519): se añadió `Vary: Origin` a TODAS las respuestas, que es lo que dice
// el estándar HTTP. **No funcionó: el CDN de Vercel no cachea por `Origin`** — sirve una sola copia
// y de hecho ELIMINA la cabecera `vary: Origin` de lo que entrega. Medido en producción: 12 de 12
// peticiones desde housesevillana.es recibieron la copia que había dejado un curl con
// `Origin: https://competencia.com`, sin `Access-Control-Allow-Origin` y sin `vary`. El calendario
// siguió roto exactamente igual.
//
// Arreglo definitivo: `Access-Control-Allow-Origin: *`, fijo. La respuesta pasa a ser idéntica para
// todo el mundo, así que da igual qué copia guarde el CDN. Es seguro porque este endpoint es
// **público a propósito**: no lee cookies ni cabeceras de sesión (con `*` el navegador ni siquiera
// permite mandarlas), y lo que publica —qué noches están cogidas de una lista blanca de 4 pisos— ya
// se lo enseña el motor de reservas de Smoobu a cualquiera que entre en él.
//
// La lista blanca de orígenes que había aquí no protegía nada (no hay credenciales que robar) y era
// justo lo que hacía la respuesta dependiente del `Origin`. Por eso se retira en vez de arreglarse.
//
// ⚠️ Si algún día este endpoint pasara a leer sesión o a devolver algo por cliente, `*` deja de valer
// — y entonces lo que hay que quitar es la CACHÉ (`Cache-Control: no-store`), no volver a la lista
// blanca: seguiría siendo una respuesta variable servida desde una caché que no varía.

/**
 * Cabeceras CORS del endpoint público. No reciben nada de la petición **a propósito**: son
 * constantes para que la copia que guarde el CDN sirva igual a cualquier navegador.
 */
export function cabecerasCors(): Record<string, string> {
  return { 'Access-Control-Allow-Origin': '*' }
}
