// Cepos de la INVITACIÓN por correo.
//
// ─── Qué protege, y por qué se escribió ──────────────────────────────────────
// La invitación es la única puerta del portal que manda un correo a alguien que
// **todavía no es nadie**: no está en la cartera, no ha entrado nunca y no ha
// consentido nada. Dos cosas la sostienen, y las dos se rompen sin que falle
// absolutamente nada:
//
//   1. **El correo no puede decir nada de las pólizas.** Quien lo recibe puede
//      no ser quien José tenía en la cabeza (una letra mal escrita, un buzón
//      compartido). Si el cuerpo creciera «un dato más» para que se entienda
//      mejor, estaríamos contándole la cartera de un tercero a un desconocido.
//   2. **La aceptación se ata al CORREO, no al token.** El token dice QUÉ
//      invitación es; quién eres lo dice el código de un solo uso que llega a
//      ese mismo buzón. Sin esa comprobación, un enlace reenviado abre los
//      seguros de otro y el registro dice «aceptado por el que tenía el enlace».
//
// El cepo mira las tres capas donde eso se puede romper, porque romper una sola
// basta: el CUERPO del correo (ejecutándolo de verdad), la CAPA DE BD y las
// RUTAS.
//
// ⚠️ Del cuerpo se ejecuta la función; de lo demás se leen las FUENTES.
// `lib/invitaciones.ts` abre Prisma en el import, y un test que necesita BD
// para comprobar una decisión de diseño es un test que nadie corre. Mismo
// camino que `lib/peticiones.test.ts`.
//
// ⚠️ Y los comentarios se quitan ANTES de mirar el código: si no, el cepo se
// muerde a sí mismo — el fichero que protege EXPLICA en prosa lo que no se
// puede hacer, y esas palabras no son código.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  BYTES_TOKEN_INVITACION,
  CAMPOS_PROHIBIDOS_EN_INVITACION,
  DIAS_VIGENCIA_INVITACION,
  MAX_INVITACIONES_DIA,
  RESULTADOS_INVITACION,
  invitacionEscrita,
} from '@central/module-seguros-portal'

import { cuerpoInvitacion, enlaceDeInvitacion } from './correo-invitacion.ts'

const APP = join(import.meta.dirname, '..')

/** Quita comentarios de línea y de bloque. Lo que queda es código. */
function soloCodigo(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function fuente(rel: string): string {
  return readFileSync(join(APP, rel), 'utf8')
}

const LIB = fuente('lib/invitaciones.ts')
const LIB_CODIGO = soloCodigo(LIB)
const CORREO_CODIGO = soloCodigo(fuente('lib/correo-invitacion.ts'))
const RUTA_CREAR = fuente('app/api/invitaciones/route.ts')
const RUTA_ID = fuente('app/api/invitaciones/[id]/route.ts')
const RUTA_RESPONDER = fuente('app/api/invitaciones/responder/route.ts')

// ─── 1. El CORREO: lo que no puede decir ─────────────────────────────────────

/**
 * Baja a minúsculas y quita tildes y eñes. Sin esto, «compañía» no casaría con
 * `compania` y el campo más obvio de todos se colaría por una tilde.
 */
function aplanar(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/** Un correo con todo lo que un correo puede llevar: nombre, mensaje y enlace. */
function correoCompleto() {
  return cuerpoInvitacion({
    invitante: 'José Pérez Muñoz',
    mensaje: 'Hola Ana, te dejo ver mis seguros por si te hace falta algo.',
    enlace: 'https://portal.example.com/invitacion/' + 'a'.repeat(64),
  })
}

test('el correo de invitacion no nombra NINGUN campo de la poliza', () => {
  const c = correoCompleto()
  const todo = aplanar([c.asunto, c.texto, c.html].join('\n'))

  const colados = CAMPOS_PROHIBIDOS_EN_INVITACION.filter((campo) => todo.includes(aplanar(campo)))
  assert.deepEqual(
    colados,
    [],
    'El correo de invitación lo recibe alguien que todavía es un desconocido: José pudo ' +
      'equivocarse de dirección, o el buzón puede ser compartido. Estos campos son de un ' +
      `tercero que aún no ha consentido nada y no pueden salir de aquí:\n  - ${colados.join('\n  - ')}`,
  )
})

test('el cepo del correo SÍ muerde: no está mirando un texto vacío', () => {
  // Un guardián que pasa porque no encuentra nada que mirar es el mismo «no lo
  // he comprobado» disfrazado de verde que este fichero persigue.
  const c = correoCompleto()
  assert.ok(c.texto.length > 200 && c.html.length > 200, 'el cuerpo tiene que tener texto que recorrer')
  // Mutación: con un campo prohibido dentro, el test de arriba tiene que fallar.
  const envenenado = aplanar(c.texto + '\nSu compañía es X y la matrícula 1234ABC')
  const colados = CAMPOS_PROHIBIDOS_EN_INVITACION.filter((campo) => envenenado.includes(aplanar(campo)))
  assert.ok(colados.length >= 2, 'el filtro tiene que cazar los campos cuando de verdad están')
})

test('el correo dice QUIEN invita, cuanto dura y que hacer si no conoces a esa persona', () => {
  const c = correoCompleto()
  const todo = aplanar(c.asunto + '\n' + c.texto)
  // Quién invita: es lo ÚNICO que el correo tiene que contar, y sin ello quien
  // lo recibe no puede decidir nada.
  assert.ok(todo.includes('jose perez munoz'), 'el correo tiene que nombrar a quien invita')
  // El plazo sale del módulo puro, no de un número escrito a mano aquí.
  assert.ok(todo.includes(String(DIAS_VIGENCIA_INVITACION)), 'el correo dice en cuántos días caduca')
  assert.ok(
    /no conoces/.test(todo),
    'el correo tiene que decirle qué hacer si no conoce a esa persona: es la salida de quien ' +
      'recibe una invitación que no esperaba',
  )
})

test('el correo dice que el enlace NO abre sesion por si mismo', () => {
  // Es la frase que evita que alguien reenvíe el correo creyendo que está
  // «pasando el acceso»: no lo está, y conviene que lo sepa antes de hacerlo.
  const todo = aplanar(correoCompleto().texto)
  assert.ok(todo.includes('no abre sesion'), 'el correo explica que el enlace no abre sesión por sí mismo')
})

test('el mensaje de quien invita se ESCAPA en el HTML', () => {
  const c = cuerpoInvitacion({
    invitante: 'José <script>alert(1)</script>',
    mensaje: '<img src=x onerror="alert(1)">',
    enlace: 'https://portal.example.com/invitacion/' + 'b'.repeat(64),
  })
  assert.ok(!c.html.includes('<script>'), 'el nombre va escapado')
  assert.ok(!c.html.includes('<img src=x'), 'el mensaje lo escribe una persona: va escapado')
  assert.ok(c.html.includes('&lt;'), 'el escapado tiene que haber hecho algo')
})

test('el asunto no admite un salto de linea: una cabecera es una cabecera', () => {
  // Un `\r\n` dentro del asunto parte el mensaje y deja añadir un `Bcc:`.
  const c = cuerpoInvitacion({
    invitante: 'José\r\nBcc: alguien@example.com',
    mensaje: null,
    enlace: 'https://portal.example.com/invitacion/' + 'c'.repeat(64),
  })
  assert.ok(!/[\r\n]/.test(c.asunto), 'el asunto va en una sola línea')
})

test('sin nombre no se inventa uno, y sin mensaje no aparece un bloque vacio', () => {
  const c = cuerpoInvitacion({
    invitante: null,
    mensaje: null,
    enlace: 'https://portal.example.com/invitacion/' + 'd'.repeat(64),
  })
  assert.ok(!c.texto.includes('null') && !c.html.includes('null'), 'un `null` pintado es un hueco, no un dato')
  assert.ok(!c.texto.includes('Te escribe esto'), 'sin mensaje no se pinta el bloque del mensaje')
  assert.ok(c.asunto.length > 10, 'el asunto sigue diciendo algo')
})

// ─── 2. El ENLACE: sin dominio no hay invitación ─────────────────────────────

test('sin PORTAL_PUBLIC_URL, o sin https, no hay enlace — y no se inventa un dominio', () => {
  const previo = process.env.PORTAL_PUBLIC_URL
  try {
    delete process.env.PORTAL_PUBLIC_URL
    assert.equal(enlaceDeInvitacion('e'.repeat(64)), null, 'sin dominio no hay enlace')

    process.env.PORTAL_PUBLIC_URL = 'http://portal.example.com'
    assert.equal(
      enlaceDeInvitacion('e'.repeat(64)),
      null,
      'por http el token viaja en claro por la red: no se manda enlace',
    )

    process.env.PORTAL_PUBLIC_URL = 'no-es-una-url'
    assert.equal(enlaceDeInvitacion('e'.repeat(64)), null, 'una URL ilegible no se adivina')

    process.env.PORTAL_PUBLIC_URL = 'https://portal.example.com'
    const enlace = enlaceDeInvitacion('e'.repeat(64))
    assert.equal(enlace, `https://portal.example.com/invitacion/${'e'.repeat(64)}`)
  } finally {
    if (previo === undefined) delete process.env.PORTAL_PUBLIC_URL
    else process.env.PORTAL_PUBLIC_URL = previo
  }
})

test('sin_enlace NO escribe la fila; envio_fallido SI', () => {
  // La distinción vive en el módulo puro para que no se cuente dos veces.
  assert.equal(invitacionEscrita('sin_enlace'), false)
  assert.equal(invitacionEscrita('envio_fallido'), true)
  assert.equal(invitacionEscrita('enviada'), true)

  // Y la capa de BD tiene que decidir el enlace ANTES de tocar la BD: si el
  // `return` del `sin_enlace` quedara por debajo del `create`, la fila se
  // escribiría igual y ocuparía el sitio del índice único para siempre.
  const posEnlace = LIB_CODIGO.indexOf("'sin_enlace'")
  const posCreate = LIB_CODIGO.indexOf('portalInvitacion.create')
  assert.ok(posEnlace > 0 && posCreate > 0, 'el cepo no está viendo el fichero que cree')
  assert.ok(
    posEnlace < posCreate,
    'el `sin_enlace` tiene que resolverse ANTES del INSERT: una invitación cuyo correo no ' +
      'puede salir ocupa el sitio del índice único y nadie podrá aceptarla nunca',
  )
})

// ─── 3. El TOKEN ─────────────────────────────────────────────────────────────

test('el token se genera con randomBytes, nunca con Math.random', () => {
  assert.ok(
    /randomBytes\(BYTES_TOKEN_INVITACION\)/.test(LIB_CODIGO),
    'el token sale de `randomBytes(BYTES_TOKEN_INVITACION)` de node:crypto',
  )
  assert.ok(
    !/Math\.random/.test(LIB_CODIGO) && !/Math\.random/.test(CORREO_CODIGO),
    'Math.random es predecible, y aquí adivinar el token es entrar en la invitación de otro',
  )
  // 256 bits. Si alguien lo bajara, el módulo puro es quien lo dice.
  assert.equal(BYTES_TOKEN_INVITACION, 32)
})

test('el token se guarda HASHEADO y no se loguea nunca', () => {
  assert.ok(/tokenHash:\s*hashToken\(token\)/.test(LIB_CODIGO), 'a la columna va el hash, no el token')
  assert.ok(
    !/console\.(log|error|warn)\([^)]*\btoken\b/.test(LIB_CODIGO),
    'un log es donde una llave sobrevive más tiempo: el token en claro no entra en ninguno',
  )
  assert.ok(
    !/console\.(log|error|warn)\([^)]*\btoken\b/.test(CORREO_CODIGO),
    'ni siquiera al fallar el envío: el enlace lleva el token dentro',
  )
})

test('el token NO vuelve en la respuesta de crear', () => {
  // Devolvérselo a quien invita convertiría el enlace en algo que se copia y se
  // pega por WhatsApp, y la invitación dejaría de estar atada al buzón invitado.
  const codigo = soloCodigo(RUTA_CREAR)
  assert.ok(!/\btoken\b/.test(codigo), 'la ruta de crear no menciona el token en ninguna parte')
})

test('el hash del token usa la pimienta que ya existe, sin inventarse una env', () => {
  assert.ok(/hashCanal\(token\)/.test(LIB_CODIGO), '`hashToken` delega en `hashCanal`, que ya lleva pimienta')
  assert.ok(
    !/process\.env\.[A-Z_]*TOKEN[A-Z_]*/.test(LIB_CODIGO),
    'una pimienta más es una env más que se puede olvidar en Vercel, y su fallo es silencioso',
  )
})

// ─── 4. La aceptación se ata al CORREO, no al token ──────────────────────────

test('aceptar y rechazar comprueban que el correo invitado es de ESA cuenta', () => {
  assert.ok(
    /function casaElCorreo/.test(LIB_CODIGO),
    'la comprobación vive en una función con nombre, no repartida por tres sitios',
  )
  // Compara el hash de la invitación contra los canales de ESA identidad.
  assert.ok(
    /portalCanal\.findFirst\(\{\s*where:\s*\{\s*identidadId,\s*valorHash:\s*destinatarioCanalHash/.test(
      LIB_CODIGO,
    ),
    'el hash guardado se compara contra `portal_canal` filtrado por la identidad que acepta',
  )
  // Las tres funciones que actúan sobre una invitación ajena tienen que pasar
  // por ahí. Sin esto, un enlace reenviado abre los seguros de un tercero.
  const usos = LIB_CODIGO.match(/casaElCorreo\(/g) ?? []
  assert.ok(
    usos.length >= 3,
    'la comprobación se declara una vez y se usa en `invitacionParaIdentidad` y en ' +
      `\`responderInvitacion\`; encontradas ${usos.length} apariciones`,
  )
})

test('responder EXIGE sesion: el token no abre nada por si mismo', () => {
  assert.ok(
    /requireIdentidad\(\)/.test(RUTA_RESPONDER),
    'sin sesión no se acepta: «aceptado por el que tenía el enlace» no es una prueba de consentimiento',
  )
  assert.ok(
    /export async function POST/.test(RUTA_RESPONDER) && !/export async function GET/.test(RUTA_RESPONDER),
    'es un POST: un GET lo consumen el antivirus del correo y el prefetch antes de que la persona lo toque',
  )
})

test('la pagina publica del token no puede enseñar NADA', () => {
  // `invitacionPorToken` es la única consulta sin identidad del fichero, y por
  // eso lo único que devuelve es si existe y si sigue viva.
  const firma = LIB_CODIGO.match(
    /export async function invitacionPorToken\([^)]*\):\s*Promise<\{([^}]*)\}>/,
  )
  assert.ok(firma, 'no se encuentra la firma de `invitacionPorToken`')
  const campos = firma[1]
  assert.ok(/existe/.test(campos) && /viva/.test(campos), 'devuelve `existe` y `viva`')
  for (const filtrado of ['nombre', 'otorgante', 'alcance', 'mensaje', 'poliza']) {
    assert.ok(
      !new RegExp(filtrado, 'i').test(campos),
      `la página pública no puede saber «${filtrado}»: quien tiene el enlace todavía no ha ` +
        'probado ser nadie, y el correo ya nombró a quien invita',
    )
  }
})

// ─── 5. Aislamiento y forma de las escrituras ────────────────────────────────

test('la identidad sale de la cookie y ningun clienteId entra desde la request', () => {
  assert.ok(/from '\.\/session'/.test(LIB_CODIGO), 'la puerta única es `lib/session`')
  assert.ok(
    /portalVinculo\.findMany\(\{\s*where:\s*\{\s*identidadId/.test(LIB_CODIGO),
    'la ficha desde la que se invita se comprueba contra `portal_vinculo` filtrado por la identidad',
  )
  assert.ok(
    /puedeAutorizar\(nivelDeVinculo\(/.test(LIB_CODIGO),
    'quién puede invitar lo decide el módulo puro (`puedeAutorizar`), no un `if` copiado aquí',
  )
})

test('toda escritura lleva la guarda en el WHERE, no solo en el if', () => {
  // Entre leer y escribir cabe otra petición: un doble «aceptar» pisaría el
  // sello del primero, y `count === 0` es como se sabe que alguien llegó antes.
  const updates = LIB_CODIGO.match(/portalInvitacion\.updateMany\(\{[\s\S]*?\}\)/g) ?? []
  assert.ok(updates.length >= 3, `esperadas al menos 3 escrituras guardadas, encontradas ${updates.length}`)
  for (const u of updates) {
    assert.ok(
      /aceptadaEn:\s*null/.test(u) && /rechazadaEn:\s*null/.test(u) && /retiradaEn:\s*null/.test(u),
      `esta escritura no lleva las tres guardas en el WHERE:\n${u}`,
    )
  }
  const comprobaciones = LIB_CODIGO.match(/count === 0/g) ?? []
  assert.ok(comprobaciones.length >= 3, 'cada escritura guardada comprueba su `count === 0`')
})

test('aceptar crea la autorizacion SIEMPRE por identidad, y en la misma transaccion', () => {
  assert.ok(/\$transaction/.test(LIB_CODIGO), 'la autorización y el sello de la invitación van juntos o no van')
  assert.ok(
    /autorizadoClienteId:\s*null,/.test(LIB_CODIGO) && /autorizadoIdentidadId:\s*identidadId,/.test(LIB_CODIGO),
    'quien mira es la IDENTIDAD (lo que hay detrás de la cookie), aunque esa persona sea cliente: ' +
      'una sola rama es una sola cosa que puede fallar',
  )
  assert.ok(
    /aceptadoEn:\s*hoy,[\s\S]{0,200}aceptadoPorIdentidadId:\s*identidadId,/.test(LIB_CODIGO),
    'nace ya aceptada: el acto de aceptar la invitación ES la segunda firma',
  )
  assert.ok(
    /versionTexto:\s*esJuridica\s*\?\s*TEXTO_REPRESENTACION_V1\s*:\s*TEXTO_AUTORIZACION_V1/.test(LIB_CODIGO),
    'sin saber QUÉ texto se aceptó, el consentimiento no se puede demostrar (art. 7.1 RGPD)',
  )
})

test('ya_autorizado mira LAS DOS ramas de la autorizacion', () => {
  // Desde el 04/09/2026 una autorización apunta o a una ficha o a una identidad.
  // Mirar solo una dejaría a José con dos autorizaciones vivas equivalentes.
  // El cuerpo se acota por índices y no con un `[\s\S]*?\n\}`: la firma de la
  // función lleva un objeto multilínea, así que el primer `}` a la izquierda
  // cierra los PARÁMETROS y el cepo se quedaría mirando la nada.
  const desde = LIB_CODIGO.indexOf('async function tieneAutorizacionViva')
  const hasta = LIB_CODIGO.indexOf('export type InvitacionEnviada')
  assert.ok(desde > 0 && hasta > desde, 'no se encuentra `tieneAutorizacionViva`')
  const bloque = LIB_CODIGO.slice(desde, hasta)
  assert.ok(/autorizadoIdentidadId/.test(bloque), 'mira la rama de la identidad')
  assert.ok(/autorizadoClienteId/.test(bloque), 'mira la rama de la ficha')
  assert.ok(/polizaId:\s*d\.polizaId/.test(bloque), 'la póliza entra en la clave, como en el índice único')
})

test('el cupo diario es por IDENTIDAD que invita, nunca por destinatario', () => {
  const bloque = LIB_CODIGO.match(/portalInvitacion\.count\(\{[\s\S]*?\}\)/)
  assert.ok(bloque, 'no se encuentra la cuenta del cupo')
  assert.ok(
    /otorgadaPorIdentidadId:\s*identidadId/.test(bloque[0]),
    'el cupo se cuenta por quien invita: un límite por destinatario contestaría «a este puedo ' +
      'invitarle diez veces, luego existe»',
  )
  assert.ok(
    !/destinatarioCanalHash/.test(bloque[0]),
    'el destinatario no puede entrar en la cuenta del cupo',
  )
  assert.equal(MAX_INVITACIONES_DIA, 10)
})

// ─── 6. Las rutas ────────────────────────────────────────────────────────────

test('sin permiso se contesta 404, nunca 403', () => {
  // Un 403 confirma que esa invitación existe, y con ella que alguien invitó a
  // alguien. La única excepción es `no_es_tu_correo`, que no filtra nada: quien
  // pregunta ya tiene el token y por tanto ya sabe que la invitación existe.
  assert.ok(/no_encontrada:\s*404/.test(RUTA_ID), 'retirar contesta 404 cuando la invitación no es tuya')
  assert.ok(!/no_te_toca|403/.test(soloCodigo(RUTA_ID)), 'retirar no distingue «existe pero no es tuya»')
  assert.ok(/no_es_tu_correo:\s*403/.test(RUTA_RESPONDER), 'responder sí puede decir que la cuenta no casa')
})

test('los codigos de crear son un mapa completo y separan 502 de 503', () => {
  const codigo = soloCodigo(RUTA_CREAR)
  assert.ok(/envio_fallido:\s*502/.test(codigo), '502 = la invitación existe, lo que falló fue avisar')
  assert.ok(/sin_enlace:\s*503/.test(codigo), '503 = no hay dominio, así que la fila no se ha escrito')
  // Los siete resultados del módulo puro (menos `enviada`) tienen que estar en
  // el mapa: uno sin código HTTP sale como `undefined` y Next contesta un 200.
  for (const r of RESULTADOS_INVITACION) {
    if (r === 'enviada') continue
    assert.ok(new RegExp(`${r}:\\s*\\d{3}`).test(codigo), `falta el código HTTP de \`${r}\``)
  }
  assert.ok(/status:\s*201/.test(codigo), 'una invitación creada es un 201')
})

test('la respuesta de crear dice si la fila QUEDO ESCRITA', () => {
  // Decir «no se ha invitado» cuando la fila está escrita es mentir, y además
  // el segundo intento chocaría con el índice único.
  assert.ok(/registrada:\s*r\.registrada/.test(RUTA_CREAR), 'la ruta reenvía `registrada` a la pantalla')
  assert.ok(
    /invitacionEscrita\(/.test(LIB_CODIGO),
    'quién sabe si la fila existe es el módulo puro, no un `if` copiado en la capa de BD',
  )
})

test('el correo del invitado no vuelve en ninguna respuesta', () => {
  for (const [nombre, src] of [
    ['route.ts', RUTA_CREAR],
    ['[id]/route.ts', RUTA_ID],
    ['responder/route.ts', RUTA_RESPONDER],
  ] as const) {
    const codigo = soloCodigo(src)
    assert.ok(
      !/NextResponse\.json\([^)]*\bemail\b/.test(codigo),
      `${nombre} no puede devolver el correo del invitado: es el dato de un tercero`,
    )
  }
})
