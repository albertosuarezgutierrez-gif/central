/**
 * Las compañías del muro y su logo.
 *
 * 🚨 SON DOS LISTAS A PROPÓSITO, y estaban en `app/page.tsx` hasta que el muro
 * pasó a pintar imágenes: se traen aquí para que un test pueda comprobar que
 * cada logo declarado EXISTE de verdad en `public/logos/`. Un `<img>` cuyo
 * fichero no está no lanza ningún error: pinta el icono de imagen rota, y eso
 * solo lo ve quien abre la página.
 *
 * `COMPANIAS_EN_CARTERA` alimenta la CIFRA de la banda de estadísticas
 * («Compañías con pólizas en cartera»), así que NO se toca para que el muro
 * luzca más: cuando eran una sola lista, ampliarla habría subido en silencio
 * ese número de 4 a 7 — un número falso, y de los que nadie mira dos veces
 * porque sale de una constante.
 *
 * Procedencia de cada nombre, que es lo que hace publicable esta lista:
 *   · Mapfre, Allianz, Occident, Reale — pólizas vivas medidas en la BD (05/09/2026).
 *   · Generali — adherida a CIMA (`seguros.companias_dgs`, C0072), sin pólizas aún.
 *   · Fidelidade (E0118) y Asisa — acuerdo confirmado por Alberto el 05/09/2026.
 *
 * ⚠️ Asisa NO está todavía en `seguros.companias_dgs`: para emitir una póliza
 * suya hará falta dar de alta su código DGS. Aparecer en el muro no la crea en
 * la cartera.
 *
 * Una compañía NO entra aquí por estar en el catálogo de Codeoscopic: que su
 * código DGS sea válido y tarificable no acredita ningún acuerdo, y un muro que
 * afirma trabajar con quien no ha firmado nada es una afirmación falsa sobre un
 * tercero, de las caras.
 */

export type Compania = {
  nombre: string
  /**
   * Ruta del fichero bajo `public/`, o `null` cuando NO tenemos su logo.
   *
   * SVG siempre que se pueda; PNG cuando es lo único que hay. Un PNG tiene dos
   * modos de fallo que un vectorial no tiene, y los dos son silenciosos: sale
   * borroso si no trae píxeles de sobra para la pantalla retina, y pinta una
   * CAJA BLANCA sobre el fondo de la banda si no tiene canal alfa. Los vigila
   * `companias.test.ts` leyendo el fichero.
   *
   * `null` no es un hueco que haya que tapar con un logo parecido ni con uno
   * redibujado a mano: el nombre se pinta como wordmark y ya. Un logo
   * aproximado de una aseguradora en la web de su corredor es peor que no
   * ponerlo.
   */
  logo: string | null
  /**
   * Corrección ÓPTICA de la altura, sobre la caja común del muro.
   *
   * Los cinco SVG tienen relaciones de aspecto que van de 1,23 (Generali, que
   * es un escudo con la palabra debajo) a 5,42 (Occident, que es casi todo
   * palabra). A la MISMA altura, Occident sale más de cuatro veces más ancho
   * que Generali y el muro parece descuadrado. El ajuste es por altura y va
   * aquí, junto al logo, y no repartido por el CSS.
   */
  escala?: number
}

/**
 * Compañías con pólizas VIVAS en la cartera. Medido en la BD el 05/09/2026, no
 * puesto de memoria: Mapfre 64, Allianz 26, Occident 19 y Reale 1 — las 110
 * pólizas vivas.
 */
export const COMPANIAS_EN_CARTERA = ['Mapfre', 'Allianz', 'Occident', 'Reale'] as const

/**
 * Compañías del muro: con las que la correduría TRABAJA, que es un conjunto más
 * amplio que el anterior (se puede tener acuerdo y no haber colocado todavía
 * ninguna póliza).
 *
 * Los cinco SVG vienen del propio repo `asegura` de Alberto
 * (`public/logos/insurers/`), o sea de un sitio suyo: no se han descargado de
 * la web de cada compañía. Se sirven como `<img src>` y NO en línea a
 * propósito: cada uno trae su `<style>` con clases `.st0`/`.st1`/`.cls-2`, y
 * metidos en el mismo documento esas clases chocarían entre sí y un logo
 * repintaría a otro.
 */
export const COMPANIAS: readonly Compania[] = [
  { nombre: 'Mapfre', logo: '/logos/mapfre.svg', escala: 1.2 },
  { nombre: 'Allianz', logo: '/logos/allianz.svg' },
  { nombre: 'Occident', logo: '/logos/occident.svg' },
  { nombre: 'Reale', logo: '/logos/reale.svg' },
  { nombre: 'Generali', logo: '/logos/generali.svg', escala: 1.6 },
  // 🚨 PNG, y de una imagen que venía en JPEG. Alberto subió tres a Drive; las
  // dos primeras eran JPEG —formato SIN canal alfa, así que habrían pintado una
  // caja blanca sobre el fondo de la banda— y la tercera, pese a llamarse
  // `.jpg`, era un PNG de paleta (`mimeType: image/png`, 3.310 bytes). O sea
  // que la extensión del nombre no decía la verdad y el formato sí: se miró el
  // `mimeType` y la firma del fichero, no el nombre.
  //
  // El alfa NO se sacó recortando el blanco (eso deja un halo claro alrededor
  // de las letras en cuanto el fondo no es blanco). La marca es un solo color
  // sobre blanco, así que cada píxel es `a·rojo + (1-a)·blanco` y el alfa se
  // DESPEJA de ahí por el canal azul, que es el que más separa los dos colores
  // (236 de 255). Comprobado componiendo sobre claro y sobre oscuro.
  //
  // `escala` 0,7 y no 1: con 8,54 de relación de aspecto es la más ancha del
  // muro (Occident, la siguiente, va por 5,42). A altura completa se pasaría
  // del `max-width: 11rem` del CSS y el navegador la encogería igual — el
  // número diría una cosa y la pantalla otra.
  { nombre: 'Fidelidade', logo: '/logos/fidelidade.png', escala: 0.7 },
  // 🚨 PNG, no SVG: es el fichero que hay (lo subió Alberto a Drive). Venía en
  // un lienzo de 640×400 con el dibujo ocupando solo 558×107 —el 74 % era
  // aire—, así que a la altura del muro habría salido de ~7 px. Se recortó a la
  // caja del contenido MEDIDA con `Image.getbbox()`, no a ojo. Queda en 5,21 de
  // relación de aspecto, casi la de Occident (5,42), y por eso no lleva
  // `escala`: a la misma altura ya casan.
  { nombre: 'Asisa', logo: '/logos/asisa.png' },
] as const
