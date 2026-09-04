import test from 'node:test'
import assert from 'node:assert/strict'
import { EIAC_TIPOLOGIA_SINIESTRO, descripcionEiacSiniestro } from './eiac-siniestros.ts'
import { etiquetaTipoSiniestro } from './siniestros.ts'

test('eiac: la tabla es la del estándar entero — 182 claves, con sus huecos oficiales', () => {
  assert.equal(Object.keys(EIAC_TIPOLOGIA_SINIESTRO).length, 182)
  // Huecos que TIREA deja en la numeración: no se rellenan por parecido.
  assert.equal(descripcionEiacSiniestro('1711'), null)
  assert.equal(descripcionEiacSiniestro('2005'), null)
  // 1814 sí existe, aunque el documento lo liste fuera de orden (tras 1821).
  assert.equal(descripcionEiacSiniestro('1814'), 'Otras - Reclamación')
})

test('eiac: los códigos que hay HOY en seguros.siniestros se explican con la tabla oficial', () => {
  // Los 16 valores distintos de `tipo` medidos el 04/09/2026 (67 filas, todas de CIMA).
  assert.equal(descripcionEiacSiniestro('1107'), 'Otras Asistencias')
  assert.equal(descripcionEiacSiniestro('1915'), 'Otras - Responsabilidades')
  assert.equal(descripcionEiacSiniestro('1312'), 'Daños Propios - Incendio')
  assert.equal(descripcionEiacSiniestro('1713'), 'Otras - Otras Causas')
  assert.equal(descripcionEiacSiniestro('2102'), 'Rotura - Cristales, espejos y similares')
  assert.equal(descripcionEiacSiniestro('1104'), 'Asistencia - Manitas - Bricolaje')
  assert.equal(descripcionEiacSiniestro('1207'), 'Riesgos Extraordinarios - Viento')
  assert.equal(descripcionEiacSiniestro('1211'), 'Otras Atmosféricos')
  assert.equal(descripcionEiacSiniestro('1313'), 'Daños propios - Lunas')
  assert.equal(descripcionEiacSiniestro('1411'), 'Otras - Daños Eléctricos')
  assert.equal(descripcionEiacSiniestro('1203'), 'Lluvia')
  assert.equal(descripcionEiacSiniestro('1321'), 'Otras - Daños Propios')
  assert.equal(descripcionEiacSiniestro('1515'), 'Otros Accidentes - Daños Personales')
  assert.equal(descripcionEiacSiniestro('2107'), 'Otras - Roturas')
  // Los de DOS dígitos son la cabecera de grupo, y el XSD los admite como valor.
  assert.equal(descripcionEiacSiniestro('10'), 'Agua y conducciones')
  assert.equal(descripcionEiacSiniestro('17'), 'Otras Causas')
})

test('eiac: null es «no está en la tabla», no «no significa nada»', () => {
  assert.equal(descripcionEiacSiniestro('9999'), null)
  assert.equal(descripcionEiacSiniestro('lunas'), null)
  assert.equal(descripcionEiacSiniestro(''), null)
  assert.equal(descripcionEiacSiniestro('   '), null)
  assert.equal(descripcionEiacSiniestro(null), null)
  assert.equal(descripcionEiacSiniestro(undefined), null)
  // Se admite el código con espacios alrededor, no con ceros de más.
  assert.equal(descripcionEiacSiniestro(' 1107 '), 'Otras Asistencias')
  assert.equal(descripcionEiacSiniestro('01107'), null)
  // Nada del prototipo de Object se cuela como si fuera una descripción.
  assert.equal(descripcionEiacSiniestro('constructor'), null)
  assert.equal(descripcionEiacSiniestro('toString'), null)
})

test('eiac: la etiqueta usa la descripción oficial, y lo desconocido sigue siendo «código CIMA»', () => {
  assert.equal(etiquetaTipoSiniestro('1107'), 'Otras Asistencias')
  assert.equal(etiquetaTipoSiniestro('17'), 'Otras Causas')
  // Un código numérico fuera de la tabla NO se bautiza: se pinta como código.
  assert.equal(etiquetaTipoSiniestro('9999'), 'código CIMA 9999')
  assert.equal(etiquetaTipoSiniestro('1711'), 'código CIMA 1711')
  // Nuestro catálogo manda sobre la tabla EIAC, y el vacío sigue sin tipo.
  assert.equal(etiquetaTipoSiniestro('lunas'), 'Lunas y cristales')
  assert.equal(etiquetaTipoSiniestro(null), 'sin tipo')
  assert.equal(etiquetaTipoSiniestro('Texto libre'), 'Texto libre')
})
