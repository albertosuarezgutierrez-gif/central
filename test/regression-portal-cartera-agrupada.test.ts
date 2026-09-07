// Cepo: la bóveda separa las pólizas POR TITULAR, y agrupa por identidad.
//
// ─── Qué protege ────────────────────────────────────────────────────────────
// Alberto, 07/09/2026: «llegará un momento en que un cliente tenga acceso a
// varios clientes a su vez, sobre todo empresa… yo tengo empresa, y mis padres,
// por lo que se tiene que diferenciar bien cuáles son pólizas mías personales,
// cuáles de la empresa y a su vez de cada autorizado».
//
// Hasta ese día `cartera.propias` —que es un ARRAY: una identidad puede estar
// vinculada a varias fichas— se pintaba en una lista plana y SIN etiqueta
// ninguna. Las pólizas personales de alguien y las de su sociedad salían
// mezcladas y sin nada que las separase.
//
// ─── Y el fallo que este cepo persigue de verdad ────────────────────────────
// No es que falte el título: es que se agrupe por el NOMBRE. Dos fichas con el
// mismo nombre —un padre y un hijo, una persona y su sociedad unipersonal— se
// fundirían en un bloque de aspecto perfectamente normal, con sus pólizas
// mezcladas. Duplicar se ve; mezclar no. Es la regla global del monorepo
// («agrupar personas: por IDENTIDAD, nunca por la etiqueta»).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const RAIZ = new URL('..', import.meta.url).pathname

/**
 * 🚨 Sin comentarios antes de mirar. Este fichero busca texto plano y las
 * cabeceras de lo que vigila contienen literalmente las palabras prohibidas
 * para explicar por qué lo son. Ya ha mordido a tres cepos de esta app.
 */
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const AGRUPAR = sinComentarios(
  readFileSync(`${RAIZ}packages/module-seguros-portal/src/agrupar-cartera.ts`, 'utf8'),
)
const PAGINA = sinComentarios(
  readFileSync(`${RAIZ}apps/asegura-portal/app/(portal)/boveda/page.tsx`, 'utf8'),
)
const LAYOUT = sinComentarios(readFileSync(`${RAIZ}apps/asegura-portal/app/layout.tsx`, 'utf8'))
const CALENDARIO = sinComentarios(
  readFileSync(`${RAIZ}apps/asegura-portal/app/(portal)/boveda/Calendario.tsx`, 'utf8'),
)
const RESUMEN = sinComentarios(
  readFileSync(`${RAIZ}apps/asegura-portal/app/(portal)/boveda/ResumenTitular.tsx`, 'utf8'),
)
const CSS = readFileSync(`${RAIZ}apps/asegura-portal/app/globals.css`, 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)

test('🚨 agrupar por el NOMBRE es IRREPRESENTABLE: el tipo no lo lleva', () => {
  // Este es el cepo estructural, y es más fuerte que comprobar que hoy no se
  // usa: `TitularAgrupable` no declara `nombre`, así que no hay nada que
  // comparar aunque alguien quiera. Si mañana se añade el campo, este cepo cae
  // y obliga a razonar por qué.
  const i = AGRUPAR.indexOf('export type TitularAgrupable')
  assert.notEqual(i, -1, 'TitularAgrupable tiene que seguir siendo el contrato de entrada')
  const cuerpo = AGRUPAR.slice(i, AGRUPAR.indexOf('\n}', i))
  assert.doesNotMatch(
    cuerpo,
    /\bnombre\b/,
    'el nombre no entra en la decisión de agrupar: dos fichas homónimas son dos titulares',
  )
  assert.match(cuerpo, /\bclienteId\b/, 'la clave de agrupación es la identidad de la ficha')
})

test('🚨 y el modulo entero no mira ningun nombre', () => {
  assert.doesNotMatch(
    AGRUPAR,
    /\.nombre\b|\bnombre\s*[:=]/,
    'agrupar por etiqueta funde a dos personas distintas sin que nada falle',
  )
})

test('🚨 la pagina DELEGA el reparto: no compara tipoPersona a mano', () => {
  // Con la comparación repartida por el JSX, la regla («la empresa de otro no
  // es tu empresa») viviría en dos sitios y se separarían sin fallar.
  assert.match(PAGINA, /agruparCartera\(/, 'la bóveda reparte con el módulo puro, que tiene su cepo')
  assert.doesNotMatch(
    PAGINA,
    /tipoPersona\s*===|tipoPersona\s*!==/,
    'la decisión de cajón vive en `agruparCartera`, no en la pantalla',
  )
})

test('🚨 cada bloque se lleva su titular por clienteId, nunca por nombre', () => {
  assert.match(
    PAGINA,
    /key=\{t\.clienteId\}/,
    'la lista de titulares se indexa por la identidad de la ficha',
  )
  assert.doesNotMatch(
    PAGINA,
    /key=\{t\.nombre\}/,
    'dos titulares homónimos compartirían clave de React y uno desaparecería',
  )
})

test('🚨 el chip de la fila marca lo que NO es tuyo, y eso no depende de la cabecera', () => {
  // Son dos marcas con dos significados: la cabecera dice de quién es el tramo;
  // el chip dice que esa póliza es AJENA, que es lo caro de equivocar y viaja
  // con la fila. Atarlo a `conNombre` lo pondría también en las propias («de»
  // sobre algo que sí es tuyo) y lo quitaría de una ajena en cuanto el bloque
  // decidiera no llevar nombre.
  assert.match(
    PAGINA,
    /className="titular-cabecera"/,
    'el bloque de un titular necesita su cabecera',
  )
  assert.match(
    PAGINA,
    /deOtro=\{grupo === 'autorizadas' \? titular\.nombre : null\}/,
    'el chip sale de que la póliza sea ajena, no de si el bloque lleva nombre',
  )
})

test('🚨 la cabecera del titular es PEGAJOSA', () => {
  // Si deja de serlo, se pierde justo lo que la hace útil y no falla nada:
  // sigue viéndose al abrir la pantalla.
  const i = CSS.indexOf('.titular-cabecera {')
  assert.notEqual(i, -1, 'la clase de la cabecera tiene que existir en el CSS del portal')
  const regla = CSS.slice(i, CSS.indexOf('}', i))
  assert.match(regla, /position:\s*sticky/, 'una cabecera que se va con el scroll no agrupa nada')
  assert.match(regla, /background:\s*var\(--surface\)/, 'sin fondo, las tarjetas se leen por debajo')
})

test('🚨 las pestañas del carril se REPARTEN el ancho en todo el rango móvil', () => {
  // Medido el 07/09/2026 al volver a cuatro pestañas: con `flex: 0 0 auto` el
  // carril desbordaba 48 px a 390 y 26 px a 412 —los anchos de móvil más
  // comunes— y «Quién me ve» se salía de la pantalla. No falla nada: el carril
  // tiene `overflow-x` y la barra está oculta, así que la pestaña simplemente
  // no existe para quien no arrastre por casualidad. Es el «Qu…» cortado que
  // en su día obligó a bajar de cuatro pestañas a tres.
  //
  // El umbral tiene que cubrir TODO el rango en el que el carril es horizontal
  // (hasta el lateral de escritorio, 1024). Un `max-width: 380px` deja fuera
  // justo los móviles donde se rompía.
  const i = CSS.indexOf('@media (max-width: 1023px)')
  assert.notEqual(i, -1, 'el reparto tiene que llegar hasta el lateral de escritorio, no hasta 380px')
  const bloque = CSS.slice(i, i + 400)
  assert.match(bloque, /\.portal-nav-item\s*\{[^}]*flex:\s*1 1 0/, 'las pestañas reparten el ancho del carril')
})

test('🚨 y por debajo de 400px la etiqueta puede partirse en dos lineas', () => {
  // Con cuatro pestañas a ~77 px, «Quién me ve» en una sola línea se corta a
  // media palabra: `nowrap` no la parte, la esconde. Dos renglones centrados
  // dentro de los 44 px táctiles se leen; media palabra no.
  const i = CSS.indexOf('@media (max-width: 400px)')
  assert.notEqual(i, -1, 'falta la regla que permite el segundo renglón en móvil estrecho')
  const bloque = CSS.slice(i, i + 300)
  assert.match(bloque, /white-space:\s*normal/, 'sin esto la etiqueta larga se corta en vez de partirse')
})

test('🚨 el titular del portal va en la MISMA serif que la web publica', () => {
  // Alberto, 07/09/2026: «el diseño no es muy parecido a la web». La paleta ya
  // era la misma (las dos apps inyectan MARCA_ASEGURA); lo que no lo era es el
  // titular. Si alguien quita Fraunces, el portal vuelve a no parecerse a
  // `grupoasegura.es` y nada falla.
  assert.match(LAYOUT, /Fraunces/, 'la serif de titulares se pide en el layout de la app')
  assert.match(LAYOUT, /--display:/, 'y se expone como token, no cableada en el CSS')
  const i = CSS.indexOf('h1 {')
  assert.notEqual(i, -1)
  const regla = CSS.slice(i, CSS.indexOf('}', i))
  assert.match(regla, /font-family:\s*var\(--display/, 'el h1 usa --display, no --serif (que aquí es Inter)')
})

test('🚨 el titular sube a 32px: a 24 una serif no se distingue', () => {
  // Cargar la fuente sin subir el tamaño sería pagar un webfont para no
  // notarlo — que es justo el argumento por el que Fraunces estaba fuera.
  const i = CSS.indexOf('h1 {')
  const regla = CSS.slice(i, CSS.indexOf('}', i))
  assert.match(regla, /font-size:\s*32px/, 'el titular de página va a 32px')
  // Un peso que no se descarga lo SINTETIZA el navegador, y una serif
  // sintetizada se ve emborronada. Solo se pide el 500.
  assert.match(regla, /font-weight:\s*500/, 'solo se pide el corte 500, así que solo se usa el 500')
})

test('🚨 las baldosas NO se pintan sobre las pólizas de otro', () => {
  // «Al año» sobre la cartera de quien te dio acceso pinta su gasto como si
  // fuera tuyo, y las tres baldosas juntas se leen como un resumen de LO TUYO.
  // Duplicar se ve; atribuir no.
  assert.match(
    PAGINA,
    /grupo !== 'autorizadas' && <ResumenTitular/,
    'el resumen es del titular propio; en autorizadas no va',
  )
})

test('🚨 y van por TITULAR, no una suma global de la bóveda', () => {
  // Una sola fila de baldosas arriba sumaría lo personal y lo de la sociedad
  // justo en la cifra que más se mira, deshaciendo la separación por titular de
  // este mismo fichero — y sin que nada fallara.
  assert.match(
    PAGINA,
    /<ResumenTitular polizas=\{titular\.polizas\}/,
    'el resumen se calcula sobre las pólizas de UN titular',
  )
})

test('🚨 el total parcial no puede pintarse a secas: lleva su nota', () => {
  // Medido el 07/09/2026: 26 de 111 pólizas vivas no tienen prima. Un total que
  // sume las otras 85 y se enseñe sin decirlo es más bajo que la realidad y no
  // lo parece. Quitar la nota es una línea y no rompe nada.
  assert.match(RESUMEN, /r\.sinPrima > 0/, 'la baldosa del dinero tiene que mirar cuántas faltan')
  assert.match(RESUMEN, /resumen-nota/, 'y decirlo en la propia baldosa')
})

test('🚨 «no lo sé» se pinta como raya, jamás como 0,00€', () => {
  // `gastoAnual === null` es «no consta ninguna prima». Colapsarlo con un
  // `?? 0` lo convertiría en «no pagas nada», que es una afirmación.
  assert.match(
    RESUMEN,
    /r\.gastoAnual === null \? '—'/,
    'sin ninguna prima conocida la baldosa no da una cifra',
  )
  assert.doesNotMatch(RESUMEN, /gastoAnual \?\? 0|gastoAnual \|\| 0/, 'un cero aquí es una mentira')
})

test('🚨 «Próximo» sale de proximoVencimiento, no del primer elemento', () => {
  // Es el fallo que tenía el panel de ejemplo de la web (`activas[0]`), y aquí
  // sería peor: con datos reales enseñaría como próximo vencimiento una póliza
  // cualquiera, y hay vivas ya vencidas cuya fecha ya pasó.
  assert.match(RESUMEN, /r\.proximoVencimiento === null \? '—'/, 'sin próxima no se inventa una fecha')
  assert.doesNotMatch(RESUMEN, /polizas\s*\[\s*0\s*\]/, 'la primera de la lista no es la próxima')
})

test('🚨 la rejilla de tarjetas usa auto-FIT: auto-fill deja la fila a medias', () => {
  // Alberto, 07/09/2026, con la captura de su bóveda: «el diseño no es acorde».
  // `auto-fill` CREA las pistas aunque no haya tarjetas que ponerlas, así que
  // con un solo aviso en el calendario la tarjeta se quedaba en la primera y el
  // resto de la fila salía en blanco. Medido con Playwright a 1440: ocupaba el
  // 24 % del ancho (335 de 1374 px); a 768, el 49 %. Con `auto-fit` es el 100 %
  // en los cuatro anchos, y con dos o más tarjetas el reparto no cambia.
  //
  // Es un fallo MUDO: no desborda, no falla ningún test, no hay error. Solo
  // queda hueco, y de eso solo se entera quien abre la pantalla en un monitor.
  const i = CSS.indexOf('.cartera {')
  assert.notEqual(i, -1, 'la rejilla de tarjetas tiene que existir')
  const regla = CSS.slice(i, CSS.indexOf('}', i))
  assert.match(regla, /repeat\(auto-fit,/, 'con auto-fill una sola tarjeta deja el resto de la fila vacío')
  assert.doesNotMatch(regla, /auto-fill/, 'auto-fill crea pistas que nadie va a llenar')
})

test('🚨 el h2 de sección va en Fraunces, no en la fuente de cuerpo', () => {
  // Alberto, 07/09/2026: «el diseño no es acorde a las páginas de los seguros»,
  // comparando con `grupoasegura.es`. Medido: la paleta y las tres sombras son
  // IDÉNTICAS en las dos apps —las dos inyectan `MARCA_ASEGURA`—, así que la
  // distancia no era el color. Era la escala: la web pone el h2 en Fraunces a
  // 32-48px y el portal lo tenía en Inter a 18px, o sea MÁS PEQUEÑO que el
  // cuerpo de la web (16px).
  //
  // 🚨 Y `--serif` no vale: en esta marca resuelve a Inter, así que volver a él
  // deshace el cambio sin que nada falle. Es la misma trampa del h1.
  const i = CSS.indexOf('.seccion h2 {')
  assert.notEqual(i, -1, 'el titular de sección tiene que existir')
  const regla = CSS.slice(i, CSS.indexOf('}', i))
  assert.match(regla, /font-family:\s*var\(--display/, 'el h2 usa --display; --serif aquí es Inter')
  assert.match(regla, /font-size:\s*24px/, 'a 18px el titular no se distingue del cuerpo')
})

test('🚨 el rótulo de sección existe y NO se pinta a mano', () => {
  // `.antetitulo` es el gesto más reconocible de la web. Si alguien lo escribe
  // con estilos en línea en una pantalla, las demás se quedan sin él y la
  // diferencia solo se ve abriendo las dos.
  const i = CSS.indexOf('.antetitulo {')
  assert.notEqual(i, -1, 'falta la clase del rótulo de sección')
  const regla = CSS.slice(i, CSS.indexOf('}', i))
  assert.match(regla, /text-transform:\s*uppercase/, 'el rótulo va en versalitas')
  assert.match(regla, /letter-spacing:\s*0\.14em/, 'el espaciado ancho es lo que lo hace reconocible')
  assert.match(PAGINA, /className="antetitulo"/, 'la bóveda tiene que usarlo')
})

test('🚨 la fila no se levanta si se ha pedido menos movimiento', () => {
  // El hover con `scale` viene de la web. Quien pide movimiento reducido no
  // espera que una fila se despegue, y sin la excepción se despega igual: la
  // regla de `prefers-reduced-motion` que ya había solo tocaba la cabecera.
  const i = CSS.indexOf('@media (prefers-reduced-motion: reduce)')
  assert.notEqual(i, -1)
  const bloque = CSS.slice(i, i + 600)
  assert.match(bloque, /\.poliza-enlace:hover\s*\{[^}]*transform:\s*none/, 'la fila sigue escalando con movimiento reducido')
})

test('🚨 el padding de escritorio de la sección va DESPUÉS de la regla base', () => {
  // Fallo mudo medido el 07/09/2026: la media query de ≥1024px se escribió en
  // el bloque de escritorio que hay ARRIBA del fichero, y `.seccion` se define
  // más abajo. Misma especificidad, gana la última: a 1440px seguía dando 24px
  // y la regla no hacía absolutamente nada. El CSS es válido, no falla ningún
  // test y solo se ve midiendo con el navegador.
  const base = CSS.indexOf('.seccion {')
  assert.notEqual(base, -1)
  const escritorio = CSS.indexOf('padding: 32px;', base)
  assert.notEqual(escritorio, -1, 'falta el padding de sección en escritorio')
  assert.ok(
    escritorio > base,
    'la media query de escritorio está antes que la regla base: queda pisada sin fallar',
  )
})

test('🚨 el color de marca decora en SUAVE; el saturado se reserva al estado', () => {
  // Alberto, 07/09/2026: «igual la web… debería parecer como la expansión de la
  // web. Todo corporativo». Se acepta, con una condición técnica: en la bóveda
  // el color saturado ya SIGNIFICA algo («vencida», «al cobro»), y una banda de
  // marca a todo color competiría con el semáforo justo en la pantalla donde
  // hay que leerlo. Por eso la atmósfera va al 7 % y 2 %, y la franja usa
  // `--brand-soft`, que es el azul claro de la marca, no el pleno.
  //
  // Si alguien sube esos porcentajes o cambia `--brand-soft` por `--brand`, la
  // pantalla sigue funcionando y el aviso deja de destacar. Nada falla.
  const i = CSS.indexOf('.portal-contenido::before')
  assert.notEqual(i, -1, 'falta la atmósfera de marca del encabezado')
  const regla = CSS.slice(i, CSS.indexOf('}', i))
  assert.match(regla, /var\(--brand\) 7%/, 'la atmósfera arranca al 7 %, como en la web')
  assert.doesNotMatch(regla, /var\(--brand\) (?:[2-9]\d|1\d\d)%/, 'un tinte fuerte compite con el semáforo')

  const j = CSS.indexOf('.seccion.acento {')
  assert.notEqual(j, -1, 'falta la franja de acento')
  const acento = CSS.slice(j, CSS.indexOf('}', j))
  assert.match(acento, /background:\s*var\(--brand-soft\)/, 'la franja va en el azul claro, no en el pleno')
})

test('🚨 la franja de acento es UNA, no varias', () => {
  // El propio CSS de la web lo deja escrito: «el contraste vale porque es el
  // único». Con dos secciones tintadas deja de ser un acento y pasa a ser el
  // fondo de la pantalla.
  const usos = [PAGINA, CALENDARIO].join('\n').match(/className="seccion acento"/g) ?? []
  assert.equal(usos.length, 1, `la clase «acento» se usa ${usos.length} veces; tiene que ser 1`)
})
