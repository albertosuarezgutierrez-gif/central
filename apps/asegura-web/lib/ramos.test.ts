// Guardián del copy de las páginas de ramo.
//
// No comprueba estilo: comprueba que no se ha colado nada que convierta una
// página informativa en asesoramiento (RDL 3/2020) o en una promesa que la
// correduría no puede sostener. Es el mismo tipo de red que
// `test/regression-nombre-comercial-asegura.test.ts`: barato de mantener y
// difícil de saltarse sin darse cuenta.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PROHIBIDO, ACOTA_AMBITO } from '@central/module-seguros'
import { RAMOS, ramoPorSlug, type Ramo } from './ramos.ts'

/** Todo el texto visible de un ramo, en una sola cadena, para barrerlo. */
function copy(r: Ramo): string {
  return [r.h1, r.title, r.description, ...r.intro, ...r.cubre, ...r.paraQuien, ...r.faq.flatMap((f) => [f.pregunta, f.respuesta])].join(' ')
}

test('hay al menos un ramo y todos tienen los campos con contenido', () => {
  assert.ok(RAMOS.length >= 1)
  for (const r of RAMOS) {
    assert.match(r.slug, /^[a-z0-9-]+$/, `slug inválido: ${r.slug}`)
    for (const campo of ['nombre', 'h1', 'title', 'description'] as const) {
      assert.ok(r[campo].trim().length > 0, `${r.slug}: ${campo} vacío`)
    }
    assert.ok(r.intro.length >= 1, `${r.slug}: sin intro`)
    assert.ok(r.cubre.length >= 3, `${r.slug}: menos de 3 puntos en "cubre"`)
    assert.ok(r.paraQuien.length >= 2, `${r.slug}: menos de 2 en "paraQuien"`)
    assert.ok(r.faq.length >= 3, `${r.slug}: menos de 3 preguntas`)
  }
})

test('los slugs no se repiten', () => {
  const vistos = new Set<string>()
  for (const r of RAMOS) {
    assert.ok(!vistos.has(r.slug), `slug duplicado: ${r.slug}`)
    vistos.add(r.slug)
  }
})

test('ramoPorSlug devuelve null para lo que no existe, nunca un ramo de relleno', () => {
  assert.equal(ramoPorSlug('no-existe'), null)
  assert.equal(ramoPorSlug(''), null)
  assert.equal(ramoPorSlug(RAMOS[0].slug)?.slug, RAMOS[0].slug)
})

// 🚨 El guardián de verdad. Un claim de ahorro o un superlativo sobre el
// resultado convierte la página en asesoramiento, y el asesoramiento arrastra
// análisis objetivo documentado e IPID entregado antes de contratar.
// 🚨 La lista NO vive aquí desde el 07/09/2026: vive en `copy-regulado.ts` de
// `@central/module-seguros`, porque la correduría ya no publica solo en esta
// web. Un post de LinkedIn está sujeto a la MISMA regla (RDL 3/2020) y con dos
// copias de estos patrones una de las dos deja de vigilar sin que nada falle.
// Y en redes el daño es peor: una página se corrige, un post publicado no.

test('el copy no promete ahorros, precios ni superlativos (RDL 3/2020)', () => {
  for (const r of RAMOS) {
    const texto = copy(r)
    for (const { patron, porque } of PROHIBIDO) {
      assert.ok(!patron.test(texto), `${r.slug}: ${porque} → ${patron}`)
    }
  }
})

// La marca se escribe «Grupo ASegura» (A y S mayúsculas): el monograma del logo
// ES el nombre. Ya lo protege un guardián global, pero aquí es donde el nombre
// sale a la calle, así que se comprueba también en el copy publicado.
test('si se nombra la marca, se escribe «Grupo ASegura»', () => {
  for (const r of RAMOS) {
    const texto = copy(r)
    const malas = texto.match(/Grupo\s+A(?!Segura\b)\w*/g) ?? []
    assert.deepEqual(malas, [], `${r.slug}: la marca mal escrita → ${malas.join(', ')}`)
  }
})

// La plantilla del layout es `%s · Grupo ASegura`, así que Next le añade la
// marca a cada `title` de ramo: lo que mide Google es la suma, no lo escrito
// aquí. Medir solo el trozo dejaba 16 caracteres fuera de la cuenta.
const SUFIJO_MARCA = ' · Grupo ASegura'

test('title y description caben en la SERP sin cortarse a mitad de palabra', () => {
  for (const r of RAMOS) {
    const titulo = r.title + SUFIJO_MARCA
    assert.ok(titulo.length <= 65, `${r.slug}: title de ${titulo.length} caracteres con la marca (máx 65)`)
    assert.ok(r.description.length >= 110 && r.description.length <= 165, `${r.slug}: description de ${r.description.length} caracteres (110-165)`)
  }
})

// El `title` NO lleva la marca escrita: la pone la plantilla. Escribirla aquí
// la duplicaba («… · Grupo ASegura · Grupo ASegura»), que es lo que se estaba
// publicando en las seis páginas de ramo hasta el 07/09/2026.
test('el title no repite la marca que ya añade la plantilla', () => {
  for (const r of RAMOS) {
    assert.ok(!/Grupo\s+ASegura/i.test(r.title), `${r.slug}: el title escribe la marca y la plantilla la añade otra vez`)
  }
})

// ── Ámbito: se vende en toda España ────────────────────────────────────────
//
// 🚨 Hasta el 07/09/2026 el cepo de aquí exigía justo lo contrario: que el h1
// nombrara Sevilla. La intención era SEO local, pero el efecto lo pagaba la
// venta — «Seguro de coche y moto en Sevilla» le dice a quien entra desde
// Madrid que no es cliente. Un corredor inscrito en la DGSFP media en todo el
// territorio nacional, así que un texto que acota la provincia no está
// acotando la palabra clave: está acotando la oferta.
//
// El anclaje local no vive en los encabezados: vive en la dirección postal de
// la ficha `InsuranceAgency` (`lib/seo.ts`) y en el perfil de Google Business,
// que es de donde sale la señal del pack local. Por eso ese domicilio sigue
// diciendo Sevilla y estos textos ya no.
// (misma razón: `ACOTA_AMBITO` también es compartida.)

test('ningún texto de ramo acota el servicio a Sevilla, su provincia o Andalucía', () => {
  for (const r of RAMOS) {
    const texto = copy(r)
    for (const { patron, porque } of ACOTA_AMBITO) {
      assert.ok(!patron.test(texto), `${r.slug}: ${porque} → ${patron}`)
    }
  }
})

// Y que se diga en voz alta dónde se trabaja, no solo que no se diga lo
// contrario: un h1 mudo sobre el ámbito no le aclara nada a quien llega de
// fuera.
test('el h1 y el title declaran el ámbito nacional', () => {
  for (const r of RAMOS) {
    assert.match(r.h1, /Espa[ñn]a/i, `${r.slug}: el h1 no dice dónde se trabaja`)
    assert.match(r.title, /Espa[ñn]a/i, `${r.slug}: el title no dice dónde se trabaja`)
  }
})

// ── El mismo cepo, sobre el copy que NO vive en `RAMOS` ─────────────────────
//
// 🚨 Este fichero se describía como el guardián que «barre todas las páginas»,
// y no era verdad: solo miraba `RAMOS`. El texto de la portada —el hero, la
// sección del corredor, el bloque del formulario— estaba SIN vigilar, que es
// justo donde acabaría un «ahorra hasta un 30 %» si alguien lo escribe: es el
// sitio con más tentación comercial de toda la web y el que más gente lee.
//
// Barre el fuente en vez del HTML renderizado por lo mismo que `portal.test.ts`:
// ni `tsc` ni `next build` miran lo que dice un párrafo, y montar un render
// para leer un texto cuesta más de lo que este cepo vale.
const RAIZ = join(import.meta.dirname, '..')

function fuentesTsx(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) fuentesTsx(p, acc)
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) acc.push(p)
  }
  return acc
}

/** Sin comentarios: un aviso que NOMBRA lo prohibido no puede disparar el cepo. */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

test('el copy de las páginas (fuera de RAMOS) tampoco promete ahorros ni precios', () => {
  const fuentes = [...fuentesTsx(join(RAIZ, 'app')), ...fuentesTsx(join(RAIZ, 'components'))]
  assert.ok(fuentes.length > 0, 'no se ha encontrado ni un fuente que barrer: el guardián estaría en verde mirando al vacío')
  for (const f of fuentes) {
    const src = sinComentarios(readFileSync(f, 'utf8'))
    for (const { patron, porque } of PROHIBIDO) {
      assert.ok(!patron.test(src), `${f}: ${porque} → ${patron}`)
    }
  }
})

// El mismo cepo del ámbito, sobre las páginas: la portada, «quiénes somos» y
// los legales son justo donde vivían las frases que acotaban («Correduría en
// Sevilla», «Atendemos en Sevilla y su provincia»).
//
// ⚠️ El aviso legal queda FUERA a propósito: su fuero nombra los juzgados de
// la ciudad del titular, y eso es una cláusula jurídica, no una promesa
// comercial. Excluir el fichero entero es lo honesto: si mañana su copy acota
// el servicio, este cepo no lo verá. Lo cubre el de arriba para los ramos y la
// revisión del texto legal, que no se toca sin mirarlo.
const SIN_CEPO_DE_AMBITO = [join('legal', 'aviso-legal')]

test('el copy de las páginas no acota el servicio a Sevilla ni a Andalucía', () => {
  const fuentes = [...fuentesTsx(join(RAIZ, 'app')), ...fuentesTsx(join(RAIZ, 'components'))].filter(
    (f) => !SIN_CEPO_DE_AMBITO.some((excluido) => f.includes(excluido)),
  )
  assert.ok(fuentes.length > 0, 'no se ha encontrado ni un fuente que barrer: el guardián estaría en verde mirando al vacío')
  for (const f of fuentes) {
    const src = sinComentarios(readFileSync(f, 'utf8'))
    for (const { patron, porque } of ACOTA_AMBITO) {
      assert.ok(!patron.test(src), `${f}: ${porque} → ${patron}`)
    }
  }
})

// 🚨 Cepo del 07/09/2026, y nace de un cambio que DEBILITÓ la portada a
// propósito. El h1 decía «Sube tus pólizas. / Aunque no sean mías.» y esa
// segunda línea era lo único de toda la web que un corredor de al lado no
// puede copiar: que las pólizas de OTRAS compañías vivan aquí. Alberto la
// quitó («aunque no sean míos no lo pongas»), así que el diferenciador se
// quedó viviendo en UNA frase del `lead` del hero.
//
// El modo de fallo es mudo: alguien acorta el `lead` porque tiene cuatro
// líneas en móvil —cosa razonable— y la portada pasa a no decir en ninguna
// parte lo único que la distingue. No falla el build, no falla el typecheck y
// la página sigue teniendo buen aspecto. Por eso se ancla aquí.
test('la portada sigue diciendo que la intranet acepta pólizas de CUALQUIER compañía', () => {
  const home = sinComentarios(readFileSync(join(RAIZ, 'app', 'page.tsx'), 'utf8'))
  assert.match(
    home,
    /de cualquier compañía/i,
    'la portada ya no dice que acepta pólizas de cualquier compañía: se quedó sin el único argumento que no puede copiar otro corredor',
  )
})
