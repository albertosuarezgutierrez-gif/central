// lib/sivra/acceso.ts — fuente ÚNICA de las instrucciones de acceso por piso.
//
// Decisión de Alberto (31/08/2026): la fuente primaria de lo que se le cuenta al huésped vive en
// NUESTRO repo/BD y Smoobu queda como copia de respaldo (su guest app sigue existiendo y se enlaza
// como complemento). Este módulo es la parte ESTABLE y versionada — dirección, dónde están las
// llaves, pasos, fotos, mapas, vídeo—, importada de la guía real de la guest app de los 4 pisos
// (leída por api-guest el 31/08/2026). Los CÓDIGOS no están aquí a propósito: son rotables y viven
// en la tabla `sivra_codigos_acceso` (BD, semilla por MCP — nunca en el repo); las plantillas los
// reciben como parámetro y este módulo solo deja los huecos {PORTAL}/{CAJA}.
//
// Regla de diseño (de los hilos reales: el caso Samy, perdido en Plaza Villasís con el enlace
// enviado 4 veces): TEXTO PLANO PRIMERO — la dirección y los pasos van escritos en el mensaje, de
// forma que el operador del portal de reserva pueda leérselos por teléfono y sirvan sin internet;
// los enlaces (mapa, fotos, vídeo) son refuerzo, nunca el único soporte del dato.
//
// Las fotos viven hoy en el CDN público de Smoobu (probado sin token: 200 image/jpeg). Si algún
// día se deja Smoobu, hay que copiarlas antes a Supabase Storage — dependencia anotada en el plan.

export type AccesoPiso = {
  nombre: string
  /** Dirección postal del PISO, en texto plano. */
  direccion: string
  /** Enlace Google Maps del piso. */
  mapaPiso: string
  /** true = las llaves se recogen en OTRA dirección (Dúplex). */
  llavesFuera: boolean
  /** Dónde se recogen las llaves, en texto plano. */
  llavesDireccion: string
  /** Enlace Google Maps del punto de llaves. */
  llavesMapa: string
  /** Pasos numerados. Marcadores {PORTAL} y {CAJA} que rellenan los códigos de BD. */
  pasos: string[]
  /** Fotos de la caja/portal (URLs públicas). */
  fotos: string[]
  /** Vídeo explicativo de la caja de llaves. */
  video?: string
  /** Avisos importantes (p.ej. zona de tráfico restringido). */
  avisos: string[]
  /** Dónde tirar la basura (texto + enlace si lo hay). */
  basura: string
}

const SMOOBU_IMG = 'https://login.smoobu.com/upload/images'
const VIDEO_CAJA = 'https://www.youtube.com/watch?v=kQl1TzYzqsY'

function maps(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

const BASURA_BUSTO =
  `Los contenedores de basura están en la calle María Coronel (a un par de minutos andando): ${maps('Calle María Coronel, 41003 Sevilla')}`

export const ACCESO: Record<string, AccesoPiso> = {
  prop_duplex_center: {
    nombre: 'Duplex Center',
    direccion: 'Pasaje Villasís 1 (el mismo edificio tiene otro acceso por Pasaje Francisco Molina 4), 41003 Sevilla — junto a La Campana',
    mapaPiso: maps('Pasaje Villasís 1, 41003 Sevilla'),
    llavesFuera: true,
    llavesDireccion: 'Calle Javier Lasso de la Vega 7, Sevilla (a unos minutos andando del apartamento)',
    llavesMapa: maps('Calle Javier Lasso de la Vega 7, Sevilla'),
    // Las fotos van DENTRO de cada paso (no amontonadas al final): en el Dúplex la recogida de
    // llaves y el apartamento son dos sitios distintos, y una foto sin su paso confunde más que
    // ayuda. Detalle dictado por Alberto (31/08/2026): la caja está sujeta con una cadena junto a
    // la entrada del aparcamiento del nº 7 — es lo que la hace reconocible en la calle.
    // Contenido de cada foto VERIFICADO mirándolas (31/08/2026): 6132016… = entrada del
    // aparcamiento con flecha; 61320280… = la caja negra encadenada a la valla; 61122cdc… = el
    // llavero con cada llave rotulada (APARTMENT/BUILDING/LIFT) → va con el paso de coger las
    // llaves, no con el del edificio; 65a41aeb… = Street View del pasaje anotado (flecha al
    // pasaje + puerta «ENTRADA EN CASO DE ESTAR CERRADA» + marca «LLAVES»); 65b60ae3… = el
    // portal de cristal con el «4». El texto de cada paso explica las anotaciones de su foto —
    // una foto con rótulos sin explicar confunde más que ayuda.
    pasos: [
      'Ve PRIMERO a recoger las llaves a la calle Javier Lasso de la Vega 7 (NO al apartamento). La caja de llaves es negra y está sujeta con una cadena a la valla, junto a la entrada del aparcamiento del nº 7 — la reconocerás por estas fotos:\n' +
        `${SMOOBU_IMG}/summernote_image_103685_6132016390d8c.jpg\n` +
        `${SMOOBU_IMG}/summernote_image_103685_61320280e95de.jpg`,
      'Abre la caja con la clave {CAJA} y coge el llavero. Lleva TRES llaves, y en esta foto están señaladas: la del APARTAMENTO, la del PORTAL del edificio y la del ASCENSOR:\n' +
        `${SMOOBU_IMG}/summernote_image_103685_61122cdc1c4c4.jpg\n` +
        `Aquí tienes un vídeo de cómo se abre la caja: ${VIDEO_CAJA}`,
      'Deja la caja CERRADA y mueve los números para que no quede puesta la clave; comprueba que ha quedado bloqueada.',
      'Con las llaves, ve al apartamento: Pasaje Francisco Molina 4 (= Pasaje Villasís 1), primera planta, letra C. En esta foto, la flecha señala la entrada del pasaje; si el pasaje estuviera cerrado, usa la puerta marcada como «ENTRADA EN CASO DE ESTAR CERRADA» (la marca «LLAVES» es el punto donde las recogiste, para que te orientes):\n' +
        `${SMOOBU_IMG}/summernote/1/f/5/b/7/5/a/c/summernote_image_103685_65a41aeb0d355.jpeg`,
      'Dentro del pasaje, el portal es el de las puertas de cristal con el número 4 encima — se ve en esta foto:\n' +
        `${SMOOBU_IMG}/summernote/e/c/f/0/e/8/d/3/summernote_image_103685_65b60ae3c6d72.jpeg`,
      'Al hacer el CHECK-OUT, deja las llaves DENTRO del apartamento, encima de la mesa alta de la cocina, y cierra la puerta al salir.',
    ],
    fotos: [],
    avisos: [
      'La zona es de tráfico restringido: no intentes llegar en coche hasta la puerta ni sigas el GPS del coche (a pie no hay problema).',
      'La azotea es de uso libre: las llaves de la azotea están señalizadas dentro del apartamento; se sube a la planta 8, saliendo a la izquierda por la puerta de emergencia y subiendo las escaleras. Déjalas siempre en su sitio.',
    ],
    basura: 'Los contenedores de basura están en la calle Martín Villa, a la vuelta del portal.',
  },

  prop_house_sevillana: {
    nombre: 'House Sevillana',
    direccion: 'Calle Socorro 24, 41003 Sevilla (barrio de San Julián, entre la Plaza de San Román y la de San Marcos)',
    mapaPiso: 'https://goo.gl/maps/ytcvp3QkLHynXHCQ7',
    llavesFuera: false,
    llavesDireccion: 'En el propio portal de Calle Socorro 24',
    llavesMapa: 'https://goo.gl/maps/ytcvp3QkLHynXHCQ7',
    // Corregido el 31/08/2026 mirando las 3 fotos + dictado de Alberto. Lo que estaba mal: se
    // presentaba el CÓDIGO como la forma de entrar. No lo es — el código es para el PRIMER acceso
    // (o una urgencia); a partir de ahí el huésped usa su propia pastilla de proximidad. Y el
    // teclado no está «en la puerta»: está en la PARED, a la izquierda.
    pasos: [
      'Llegas a Calle Socorro 24. La puerta es oscura, de dos hojas, con el número 24 encima:\n' +
        `${SMOOBU_IMG}/summernote/a/d/b/7/1/2/1/1/summernote_image_103685_68c2dea24b179.jpeg`,
      'Para entrar la PRIMERA vez, usa el teclado que hay en la pared, a la izquierda de la puerta (es plateado, con los números en azul). Marca la clave {PORTAL} — el # del final es la tecla de confirmar del propio teclado. Así se ve:\n' +
        `${SMOOBU_IMG}/summernote/1/2/3/1/5/b/e/a/summernote_image_103685_68c2dead05a06.jpeg`,
      'Ya dentro, sobre la mesita de madera que hay junto a la cancela de hierro (la de la planta) están vuestros DOS juegos: una PASTILLA de proximidad y una LLAVE. La pastilla es lo que usaréis de aquí en adelante para abrir la puerta de la calle —acercándola al lector, sin marcar ningún código— y la llave es la de la cancela de hierro. Están aquí:\n' +
        `${SMOOBU_IMG}/summernote/4/8/4/c/9/f/c/f/summernote_image_103685_68c2e00ff0c7e.jpeg`,
      'Guardad la clave del teclado por si acaso: sirve para entrar si os quedáis sin la pastilla a mano.',
      'La entrada de la casa es zona común (hay otros apartamentos y nuestra central de limpieza); vuestra zona de uso exclusivo empieza a partir de la cancela de hierro. En la zona común hay una cámara grabando.',
      'Al hacer el CHECK-OUT, deja los dos juegos (pastilla y llave) en el mismo sitio donde los recogiste.',
    ],
    fotos: [],
    avisos: [],
    basura: BASURA_BUSTO,
  },

  prop_luxury_busto: {
    nombre: 'Luxury Busto',
    direccion: 'Calle Bustos Tavera 22, 41003 Sevilla',
    mapaPiso: 'https://goo.gl/maps/8SueLyvtefrBJBw67',
    llavesFuera: false,
    llavesDireccion: 'En el portal de Bustos Tavera 22',
    llavesMapa: 'https://goo.gl/maps/8SueLyvtefrBJBw67',
    // 🚨 Corregido el 31/08/2026 mirando las fotos: junto a los buzones hay DOS cajas de llaves
    // GRIFEMA IDÉNTICAS, una encima de otra — la de Luxury es la de ABAJO y la de Reform la de
    // ARRIBA (lo señala el círculo rojo de la foto de cada piso). El texto anterior decía «la caja
    // de llaves» a secas: ante dos cajas iguales, el huésped prueba en la que no es, no abre y
    // llama por teléfono. Si algún día se mueven de sitio, esta frase hay que cambiarla.
    pasos: [
      'Entra al edificio de Bustos Tavera 22. El teclado está en la pared, a la izquierda del portero automático: marca la clave {PORTAL} (el # del final es la tecla de confirmar del teclado). Así se ve:\n' +
        `${SMOOBU_IMG}/summernote/9/a/c/8/a/0/7/7/summernote_image_103685_68e03386dc3a5.jpeg`,
      'Ya dentro, junto a los buzones hay DOS cajas de llaves grises iguales, una encima de otra. La vuestra es la de ABAJO (es la señalada en rojo en esta foto). Ábrela con la clave {CAJA}:\n' +
        `${SMOOBU_IMG}/summernote/4/4/0/c/e/b/8/d/summernote_image_103685_68e035e115aa9.jpeg`,
      'IMPORTANTE: deja la caja cerrada y mueve los números para que no quede puesta la clave; comprueba que ha quedado bloqueada.',
      'El apartamento es la puerta del FONDO A LA DERECHA, pasando la escalera (la señalada en rojo), no la que tienes de frente al entrar:\n' +
        `${SMOOBU_IMG}/summernote_image_103685_5e446accd05c1.jpg`,
      'Al hacer el CHECK-OUT, devuelve las llaves a la MISMA caja donde las recogiste (la de abajo).',
    ],
    fotos: [],
    video: VIDEO_CAJA,
    avisos: [],
    basura: BASURA_BUSTO,
  },

  prop_busto_reform: {
    nombre: 'Busto Reform',
    direccion: 'Calle Bustos Tavera 22, 41003 Sevilla',
    mapaPiso: 'https://goo.gl/maps/8SueLyvtefrBJBw67',
    llavesFuera: false,
    llavesDireccion: 'En el portal de Bustos Tavera 22',
    llavesMapa: 'https://goo.gl/maps/8SueLyvtefrBJBw67',
    // 🚨 Ver la nota de Luxury Busto: son las MISMAS dos cajas idénticas. La de Busto Reform es la
    // de ARRIBA (la de Luxury, la de abajo). Verificado sobre las fotos el 31/08/2026.
    pasos: [
      'Entra al edificio de Bustos Tavera 22. El teclado está en la pared, a la izquierda del portero automático: marca la clave {PORTAL} (el # del final es la tecla de confirmar del teclado). Así se ve:\n' +
        `${SMOOBU_IMG}/summernote/9/a/c/8/a/0/7/7/summernote_image_103685_68e03386dc3a5.jpeg`,
      'Ya dentro, junto a los buzones hay DOS cajas de llaves grises iguales, una encima de otra. La vuestra es la de ARRIBA (es la señalada en rojo en esta foto). Ábrela con la clave {CAJA}:\n' +
        `${SMOOBU_IMG}/summernote/7/b/d/2/c/3/c/7/summernote_image_103685_68e036f18a97c.jpeg`,
      'IMPORTANTE: deja la caja cerrada y mueve los números para que no quede puesta la clave; comprueba que ha quedado bloqueada.',
      'Entrando al edificio, el apartamento es la PRIMERA puerta a la IZQUIERDA.',
      'Al hacer el CHECK-OUT, devuelve las llaves a la MISMA caja donde las recogiste (la de arriba).',
    ],
    fotos: [],
    video: VIDEO_CAJA,
    avisos: [],
    basura: BASURA_BUSTO,
  },
}

export type CodigosAcceso = {
  portal?: string | null
  caja?: string | null
  wifiSsid?: string | null
  wifiPass?: string | null
}

// ¿Qué códigos necesita este piso (por sus pasos) que NO vienen en `codigos`? El orquestador usa
// esto para avisar a Telegram si falta un código en BD — el hueco se declara, nunca se inventa.
export function codigosQueFaltan(propertyId: string, codigos: CodigosAcceso): string[] {
  const piso = ACCESO[propertyId]
  if (!piso) return []
  const texto = piso.pasos.join('\n')
  const faltan: string[] = []
  if (texto.includes('{PORTAL}') && !codigos.portal) faltan.push('código del portal')
  if (texto.includes('{CAJA}') && !codigos.caja) faltan.push('código de la caja de llaves')
  return faltan
}

// Bloque de acceso en texto plano para las plantillas (y, más adelante, para la ficha del agente).
// `conCodigos:false` = versión de los 7 días: el PROCESO completo sin los códigos («el código te
// llega la víspera») — política de dos tiempos decidida con Alberto el 31/08/2026 para reducir la
// ventana de exposición de un código ante una cancelación tardía.
// `conCodigos:true` = versión de la víspera, con los códigos reales de BD. Un código NULL en BD se
// declara («te lo confirmamos hoy mismo»), jamás se rellena con un valor inventado.
export function bloqueAcceso(
  propertyId: string,
  codigos: CodigosAcceso,
  opts: { conCodigos: boolean },
): string {
  const piso = ACCESO[propertyId]
  if (!piso) return ''
  const hueco = opts.conCodigos ? '(te lo confirmamos hoy mismo)' : '(el código te llegará la víspera de tu llegada)'
  const rellenar = (s: string) =>
    s
      .replaceAll('{PORTAL}', opts.conCodigos && codigos.portal ? codigos.portal : hueco)
      .replaceAll('{CAJA}', opts.conCodigos && codigos.caja ? codigos.caja : hueco)

  const lineas: string[] = []
  lineas.push(`DIRECCIÓN: ${piso.direccion}`)
  lineas.push(`Mapa: ${piso.mapaPiso}`)
  if (piso.llavesFuera) {
    lineas.push('')
    lineas.push(`⚠️ MUY IMPORTANTE: las llaves NO están en el apartamento. Se recogen en ${piso.llavesDireccion}.`)
    lineas.push(`Mapa del punto de llaves: ${piso.llavesMapa}`)
  }
  lineas.push('')
  lineas.push('CÓMO ENTRAR:')
  piso.pasos.forEach((p, i) => lineas.push(`${i + 1}. ${rellenar(p)}`))
  for (const a of piso.avisos) lineas.push(`⚠️ ${a}`)
  if (opts.conCodigos && codigos.wifiSsid) {
    lineas.push('')
    lineas.push(`WIFI: red «${codigos.wifiSsid}»${codigos.wifiPass ? ` · contraseña: ${codigos.wifiPass}` : ''}`)
  }
  if (piso.fotos.length) {
    lineas.push('')
    lineas.push('Fotos de la entrada y la caja de llaves:')
    piso.fotos.forEach(f => lineas.push(f))
  }
  if (piso.video) lineas.push(`Vídeo de cómo abrir la caja de llaves: ${piso.video}`)
  return lineas.join('\n')
}
