// Cepo del ORÁCULO de las peticiones de acceso.
//
// ─── Qué protege, y por qué se escribió ──────────────────────────────────────
// Para pedirle acceso a alguien hay que decir QUIÉN, y aquí eso es un CORREO.
// Si la respuesta distinguiera «esa persona no está con nosotros» de «petición
// registrada», el portal sería una máquina de recorrer correos y sacar quién es
// cliente de la correduría: 32.600 fichas, desde fuera, sin límite y sin que
// nada falle en ningún log. No es un fallo que se note — es uno que se explota.
//
// El cepo mira las tres capas donde eso se puede romper, porque romper una sola
// basta:
//   1. La FUNCIÓN pura (`respuestaPublica`): que los cuatro estados sigan
//      colapsando en `registrada`.
//   2. La RUTA: que el cuerpo y el código HTTP se monten desde la respuesta
//      pública y nunca desde el resultado interno, y que el texto se IMPORTE.
//   3. La CAPA DE BD: que la fila se escriba SIEMPRE —también cuando no hay
//      ficha— porque un camino que escribe y otro que no se distinguen por el
//      RELOJ aunque contesten lo mismo; y que el correo en claro no se guarde,
//      no se loguee y no vuelva.
//
// ⚠️ Se leen las FUENTES, no se monta un servidor: `lib/peticiones.ts` abre
// Prisma en el import y un test que necesita BD para comprobar una decisión de
// diseño es un test que nadie corre. Mismo camino que
// `test/regression-portal-parte-siniestro.test.ts` y que `extraer-poliza.test.ts`.
//
// ⚠️ Y los comentarios se quitan ANTES de mirar: si no, el cepo se muerde a sí
// mismo — el fichero que protege EXPLICA en prosa los cuatro resultados que no
// se pueden distinguir, y esas palabras no son código.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  MAX_PETICIONES_DIA,
  RESULTADOS_PETICION,
  TEXTO_REGISTRADA,
  respuestaPublica,
  type ResultadoPeticion,
} from '@central/module-seguros-portal'

const APP = join(import.meta.dirname, '..')

/** Quita comentarios de línea y de bloque. Lo que queda es código. */
function soloCodigo(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function fuente(rel: string): string {
  return readFileSync(join(APP, rel), 'utf8')
}

const LIB = fuente('lib/peticiones.ts')
const LIB_CODIGO = soloCodigo(LIB)
const RUTA = fuente('app/api/peticiones/route.ts')
const RUTA_CODIGO = soloCodigo(RUTA)
const RUTA_ID = fuente('app/api/peticiones/[id]/route.ts')
const RUTA_ID_CODIGO = soloCodigo(RUTA_ID)

/** Los cuatro que NO se pueden distinguir: dependen del DESTINATARIO. */
const COLAPSAN: ResultadoPeticion[] = ['creada', 'sin_destinatario', 'ya_pendiente', 'ya_autorizado']

// ─── 1. La función pura ──────────────────────────────────────────────────────

test('los cuatro resultados que dependen del destinatario colapsan en una sola respuesta', () => {
  const respuestas = new Set(COLAPSAN.map((r) => respuestaPublica(r)))
  assert.deepEqual(
    [...respuestas],
    ['registrada'],
    'Si alguno de estos cuatro deja de contestar `registrada`, cualquiera puede recorrer ' +
      'una lista de correos y sacar quién es cliente de la correduría.',
  )
})

test('solo se dicen aparte los estados que dependen de QUIEN PREGUNTA', () => {
  // Estos dos sí, porque no revelan nada de nadie más.
  assert.equal(respuestaPublica('a_si_mismo'), 'a_si_mismo')
  assert.equal(respuestaPublica('limite_diario'), 'limite_diario')
  // Y no hay un sexto resultado suelto sin decidir: si alguien añade uno al
  // vocabulario, este test le obliga a pasar por `respuestaPublica`.
  const sinDecidir = RESULTADOS_PETICION.filter((r) => !COLAPSAN.includes(r) && r !== 'a_si_mismo' && r !== 'limite_diario')
  assert.deepEqual(sinDecidir, [], `Resultados nuevos sin decidir qué se contesta: ${sinDecidir.join(', ')}`)
})

// ─── 2. La ruta ──────────────────────────────────────────────────────────────

test('la ruta monta la respuesta desde `respuesta`, nunca desde el `resultado` interno', () => {
  assert.match(
    RUTA_CODIGO,
    /status:\s*ESTADO_HTTP\[r\.respuesta\]/,
    'El código HTTP tiene que salir de la respuesta pública: uno por resultado interno es el oráculo.',
  )
  assert.match(RUTA_CODIGO, /TEXTO\[r\.respuesta\]/, 'El texto también sale de la respuesta pública.')
  assert.ok(
    !/r\.resultado/.test(RUTA_CODIGO),
    'La ruta NO puede mirar `r.resultado`: es lo que pasó de verdad y no se le enseña a nadie.',
  )
  for (const r of COLAPSAN) {
    assert.ok(
      !new RegExp(`['"]${r}['"]`).test(RUTA_CODIGO),
      `La ruta nombra '${r}': un \`if\` por ese estado contesta la pregunta que esta ruta no puede contestar.`,
    )
  }
})

test('el texto de `registrada` se IMPORTA del módulo, no se reescribe', () => {
  assert.match(
    RUTA_CODIGO,
    /registrada:\s*TEXTO_REGISTRADA/,
    'Escribirlo a mano lo duplica, y dos textos con matices distintos reabren el oráculo por la puerta del copy.',
  )
  assert.match(RUTA_CODIGO, /TEXTO_REGISTRADA[\s\S]*from '@central\/module-seguros-portal'/)
  // Y lo que ese texto NO puede decir: ni que exista esa persona, ni que le
  // haya llegado nada.
  assert.ok(!/no hemos encontrado/i.test(TEXTO_REGISTRADA))
  assert.ok(!/no est[áa]/i.test(TEXTO_REGISTRADA))
})

test('los tres códigos HTTP: `registrada` es UNO solo para los cuatro casos', () => {
  const mapa = RUTA_CODIGO.match(/const ESTADO_HTTP[\s\S]*?\n\}/)?.[0] ?? ''
  assert.match(mapa, /registrada:\s*\d{3}/, 'Falta el código de `registrada`.')
  // Una sola entrada para los cuatro estados colapsados: no hay dónde meter una
  // diferencia sin tocar antes `respuestaPublica`.
  assert.equal((mapa.match(/registrada:/g) ?? []).length, 1)
})

// ─── 3. La capa de BD ────────────────────────────────────────────────────────

/** El cuerpo de `crearPeticion` hasta la escritura de la fila. */
function antesDeEscribirLaFila(): string {
  const cuerpo = LIB_CODIGO.slice(LIB_CODIGO.indexOf('export async function crearPeticion'))
  const corte = cuerpo.indexOf('portalPeticionAcceso.create')
  assert.ok(corte > 0, 'No se encuentra la escritura de la fila en `crearPeticion`.')
  return cuerpo.slice(0, corte)
}

test('la fila se escribe SIEMPRE: ningún camino del destinatario vuelve antes', () => {
  const antes = antesDeEscribirLaFila()
  const salidas = antes.match(/return\s*\{[\s\S]*?\}/g) ?? []
  assert.ok(salidas.length > 0, 'El cepo no está viendo ninguna salida: revisa el corte.')

  const permitidas = /'datos_invalidos'|'no_disponible'|'limite_diario'|'a_si_mismo'/
  const sospechosas = salidas.filter((s) => !permitidas.test(s))
  assert.deepEqual(
    sospechosas,
    [],
    'Estas salidas se van antes de escribir la fila. Solo pueden hacerlo las que dependen de ' +
      'QUIEN PIDE (su cupo, pedírselo a sí mismo) o una avería nuestra: si un camino escribe y ' +
      `otro no, el RELOJ dice lo que la respuesta calla:\n  ${sospechosas.join('\n  ')}`,
  )
  for (const r of COLAPSAN) {
    assert.ok(
      !new RegExp(`return[^\\n]*['"]${r}['"]`).test(LIB_CODIGO),
      `'${r}' se devuelve por un atajo: los cuatro tienen que llegar juntos al final y salir por respuestaPublica().`,
    )
  }
})

test('la fila guarda `null` cuando no se resolvió ficha, en vez de no guardarse', () => {
  assert.match(
    LIB_CODIGO,
    /destinatarioClienteId,/,
    'La fila tiene que llevar `destinatario_cliente_id`, que es `null` cuando no había ficha o había varias.',
  )
  assert.match(
    LIB_CODIGO,
    /elegida\.estado === 'ok' \? elegida\.clienteId : null/,
    'Varias fichas o ninguna → `null`. No se adivina, y las dos se contestan igual.',
  )
})

test('el cupo es por SOLICITANTE, nunca por destinatario', () => {
  const conteo = LIB_CODIGO.match(/portalPeticionAcceso\.count\(\{[\s\S]*?\}\)/)?.[0] ?? ''
  assert.match(conteo, /solicitanteIdentidadId/, 'El cupo se cuenta sobre quien pide.')
  assert.ok(
    !/destinatario/i.test(conteo),
    'Un cupo por destinatario vuelve a filtrar: «a este me deja pedírselo cinco veces, luego existe».',
  )
  assert.match(LIB_CODIGO, /MAX_PETICIONES_DIA/, 'El tope lo fija el módulo puro, no un número suelto aquí.')
  assert.equal(typeof MAX_PETICIONES_DIA, 'number')
})

test('las consultas que dependen del destinatario se hacen IGUAL cuando no lo hay', () => {
  // Un `if` que se las salte cuando no hay ficha convierte el reloj en la
  // respuesta que el texto no da. De ahí el uuid que no casa con nada.
  assert.match(LIB_CODIGO, /const NINGUNA_FICHA = '0{8}-0{4}-0{4}-0{4}-0{12}'/)
  assert.match(
    LIB_CODIGO,
    /otorganteClienteId: destinatarioClienteId \?\? NINGUNA_FICHA/,
    'La consulta de «ya te autorizó» tiene que lanzarse también cuando no hay destinatario.',
  )
})

test('el correo en claro no se guarda, no se loguea y no vuelve', () => {
  // Solo se usa para calcular el índice ciego; de ahí en adelante viaja el hash.
  const usos = LIB_CODIGO.match(/datos\.email/g) ?? []
  assert.equal(usos.length, 1, 'El correo en claro solo puede aparecer en el cálculo del índice ciego.')
  assert.match(LIB_CODIGO, /computeEmailLookupHash\(datos\.email\)/)

  for (const src of [LIB_CODIGO, RUTA_CODIGO, RUTA_ID_CODIGO]) {
    for (const log of src.match(/console\.\w+\([\s\S]*?\)/g) ?? []) {
      assert.ok(
        !/email|hash|mensaje/i.test(log),
        `Un log con datos personales: ${log}`,
      )
    }
  }
  // Y la respuesta no devuelve nada del destinatario: ni su ficha, ni su nombre,
  // ni el id de la fila (un id que a veces está y a veces no también contesta).
  assert.ok(!/destinatario/i.test(RUTA_CODIGO), 'La ruta no puede nombrar al destinatario en su respuesta.')
})

test('lo que ve QUIEN PIDIÓ no dice si el destinatario existe', () => {
  const vista = LIB_CODIGO.match(/export type PeticionEnviada = \{[\s\S]*?\n\}/)?.[0] ?? ''
  assert.ok(vista.length > 0, 'No se encuentra la vista de las peticiones enviadas.')
  assert.ok(
    !/destinatario|Nombre/i.test(vista),
    'Si el historial dijera «pendiente de Fulano», el oráculo se reabre por la pantalla.',
  )
})

// ─── Conceder: la autorización que sale de una petición ──────────────────────

test('pedirla ES aceptarla: la autorización se acepta con la fecha de la PETICIÓN', () => {
  assert.match(
    LIB_CODIGO,
    /aceptadoEn: fila\.creadaEn/,
    'La doble aceptación existe para que nadie aparezca en un registro sin saberlo; quien pidió ya lo sabe. ' +
      'Y la fecha honesta es la de su petición: fecharla hoy pondría en el registro que aceptó cuando no hizo nada.',
  )
  assert.match(LIB_CODIGO, /aceptadoPorIdentidadId: fila\.solicitanteIdentidadId/)
  assert.match(LIB_CODIGO, /caducaEn: caducidadPorDefecto\(hoy\)/, 'La autorización caduca al año, como cualquier otra.')
})

test('sin ficha del solicitante no se inventa una: error propio y distinguible', () => {
  assert.match(LIB_CODIGO, /error: 'solicitante_sin_ficha'/)
  assert.match(
    RUTA_ID_CODIGO,
    /solicitante_sin_ficha:\s*409/,
    'Es una limitación conocida (`autorizado_cliente_id` es NOT NULL), no un «no puedes».',
  )
  assert.ok(
    !/cliente\.create|crearFicha/i.test(LIB_CODIGO),
    'Crear una ficha para tapar el hueco ensucia la cartera y deja autorizaciones apuntando a nadie.',
  )
})

test('sin vínculo con la ficha destinataria se contesta 404, no 403', () => {
  assert.match(
    RUTA_ID_CODIGO,
    /no_encontrada:\s*404/,
    'Un 403 confirma que esa petición existe, y con ella que existe la persona a la que se le pidió.',
  )
  assert.match(LIB_CODIGO, /portalVinculo\.findMany/, 'El permiso para conceder sale de `portal_vinculo`, no del cuerpo.')
  assert.match(LIB_CODIGO, /peticionResoluble\(fila, hoy\)/, 'Solo se resuelve una PENDIENTE, y eso lo decide el módulo.')
})

test('insistir NO revienta ni contesta distinto: lo resuelve el índice único de la BD', () => {
  // `idx_portal_peticion_pendiente` es UNIQUE por (solicitante, hash) mientras
  // la petición sigue sin resolver. Sin recoger ese choque, el segundo intento
  // sale por un 500 — y un 500 en un camino y un 202 en otro es exactamente la
  // diferencia que las cuatro respuestas iguales existen para borrar.
  assert.match(LIB_CODIGO, /esChoqueDePendiente\(e\)/, 'El choque contra el índice se recoge, no se deja subir.')
  assert.match(LIB_CODIGO, /code === 'P2002'/, 'Y se mira el código exacto: un catch que se traga todo esconde un fallo de BD.')
  assert.match(
    LIB_CODIGO,
    /if \(!esChoqueDePendiente\(e\)\) throw e/,
    'Cualquier otro error TIENE que subir: decir «registrada» de una fila que no existe es la peor mentira del portal.',
  )
  // Y no se pregunta antes con un SELECT: eso es una carrera, y dos clics
  // seguidos dejarían al destinatario la misma pregunta dos veces.
  assert.ok(
    !/portalPeticionAcceso\.findMany\([\s\S]{0,400}concedidaEn: null/.test(LIB_CODIGO),
    'El «ya se lo pediste» lo decide el índice único, no un SELECT previo.',
  )
})
