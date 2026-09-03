'use server'

// Las dos acciones de servidor de la pantalla de retarificación: el único punto
// de `apps/plataforma` desde el que se llama al puerto de `apps/asegura` para
// cotizar.
//
// ─── Por qué acciones de servidor y no dos rutas `/api/*` ────────────────────
//
// 1. **El Bearer no puede bajar al navegador.** `ASEGURA_OPERADOR_SECRET` es el
//    permiso del puerto entero: quien lo tenga puede leer la cartera y —desde el
//    03/09/2026— gastar 0,50€ por llamada. Tiene que quedarse en el servidor.
//
// 2. **Una acción de servidor es POST por construcción.** El puerto de asegura
//    protege el gasto de un prefetch NO exportando `GET` en su ruta; aquí ese
//    riesgo directamente no existe, porque no hay ningún verbo de lectura que
//    exponer. Es la misma salvaguarda, obtenida por la forma de la pieza.
//
// 3. 🚨 **A la sesión la obliga el MIDDLEWARE, no el layout.** Es una corrección
//    de algo que este comentario afirmaba antes y era falso: un layout es un
//    componente de React, se ejecuta al PINTAR una página y no intercepta nada
//    — una acción de servidor es un POST a la ruta, no un render, así que un
//    layout no la ve pasar. Lo que la protege es `apps/plataforma/middleware.ts`,
//    cuyo matcher es global (`'/((?!_next/static|_next/image|favicon\\.ico).*)'`)
//    y solo deja pasar sin sesión lo que está en su lista `PUBLIC`; `/correduria`
//    no está ahí.
//
//    Importa porque esta acción **gasta 0,50€ por llamada**: el día que alguien
//    metiera `/correduria` (o un prefijo suyo) en `PUBLIC` para desbloquear otra
//    cosa, esto quedaría abierto a cualquiera con la URL, y el cargo lo paga
//    Alberto. Creerse que «el layout ya protege» es lo que haría que ese cambio
//    pareciera inocuo.
//
// ⏱️ **`maxDuration` vive en `page.tsx`**, no aquí: una acción de servidor corre
// dentro del segmento de ruta de su página, así que es la página la que declara
// cuánto puede tardar. Si se mueve este fichero, ese `maxDuration` se va con él.

import {
  catalogoAsegura,
  retarificarAsegura,
  type RespuestaCatalogo,
  type RespuestaRetarificar,
} from '@/lib/retarificar-asegura'

/** Un catálogo del vendor (marcas, modelos, motores, versiones…). **Gratis.** */
export async function pedirCatalogo(params: Record<string, string>): Promise<RespuestaCatalogo> {
  return catalogoAsegura(params)
}

/**
 * 🚨 **CUESTA 0,50€ REALES.**
 *
 * `confirmado: true` lo pone `retarificarAsegura()`, en el servidor y en un solo
 * sitio. No se acepta desde el cliente a propósito: si viajara en el cuerpo,
 * dejaría de ser una afirmación de que alguien ha decidido pagar y pasaría a ser
 * un campo más que se puede perder en un refactor sin que nada falle —el botón
 * dejaría de funcionar con un 400 críptico— o, peor, llegar puesto desde donde no
 * debe. Lo vigila `test/regression-retarificar-plataforma.test.ts`.
 *
 * 🚫 **No reintenta.** `POST /insurances` no es idempotente: repetir crea otro
 * proyecto y otro cargo. Si falla por red, la respuesta dice que NO se sabe si se
 * ha gastado y la decisión de repetir es de una persona que antes ha mirado el
 * consumo.
 */
export async function pedirCotizacion(entrada: {
  polizaId: string
  resueltos?: Record<string, unknown>
  correcciones?: Record<string, unknown>
  catastro?: Record<string, unknown> | null
}): Promise<RespuestaRetarificar> {
  return retarificarAsegura({
    polizaId: entrada.polizaId,
    // Va al libro de consumo de asegura: quién responde de este cargo.
    solicitadoPor: 'plataforma/correduria',
    resueltos: entrada.resueltos,
    correcciones: entrada.correcciones,
    catastro: entrada.catastro ?? null,
  })
}
