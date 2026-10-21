import test from 'node:test'
import assert from 'node:assert/strict'
import { adaptadorDeRamo, checklistBot, ramosConBots } from './tarificador-bots-ramos.ts'

test('ramo sin adaptador (o raro) → null', () => {
  for (const r of ['vida', 'salud', 'decesos', 'comunidades', 'HOGAR', 'AUTO', '', 'toString', '__proto__', null, undefined]) {
    assert.equal(adaptadorDeRamo(r as string | null | undefined), null, String(r))
  }
})

test('moto → adaptador con cilindrada editable; sin ella faltan datos y lo dice sin valores', () => {
  const a = adaptadorDeRamo('moto')
  assert.ok(a)
  assert.equal(a.ramo, 'moto')
  assert.deepEqual(a.campos.map((c) => c.clave), ['cilindrada', 'sexo', 'companiaAnterior', 'fechaAdquisicion', 'polizaAnteriorUltimos5', 'fotocopiaAnterior'])
  assert.ok(ramosConBots().includes('moto'))
  const r = a.construir({
    matricula: '', marca: null, modelo: null, version: null, codigoPostal: null, fechaNacimiento: null, fechaCarne: null,
    sexo: null, conductorEnOtraFicha: false, propietarioEnOtraFicha: false, tieneSeguroActual: false,
    aniosAsegurado: '', aniosSinSiniestros: '', siniestrosUltimos5: '',
  }, { cilindrada: '' })
  assert.equal(r.ok, false)
  if (!r.ok) assert.ok(r.faltan.some((f) => /Cilindrada/.test(f)))
})

test('lista de ramos con bots fijada: moto, auto (coche, Mapfre NSEI, 14/10/2026) y hogar (Allianz, en exploración, 19/10/2026)', () => {
  assert.deepEqual(ramosConBots().sort(), ['auto', 'hogar', 'moto'])
})

test('auto → adaptador con 3 desplegables (uso, ámbito, clase del permiso; defecto de coche) + compañía anterior (texto); sin historial ni matrícula faltan datos y lo dice sin valores', () => {
  const a = adaptadorDeRamo('auto')
  assert.ok(a)
  assert.equal(a.ramo, 'auto')
  assert.deepEqual(a.campos.map((c) => [c.clave, c.porDefecto]), [['usoVehiculo', 'particular'], ['ambitoCirculacion', 'espana'], ['clasePermiso', 'b'], ['companiaAnterior', undefined], ['polizaAnteriorUltimos5', undefined]])
  assert.ok(a.campos.filter((c) => !c.texto).every((c) => c.opciones?.some((o) => o.valor === c.porDefecto)), 'el defecto es una de las opciones')
  const r = a.construir({
    matricula: '', marca: null, modelo: null, version: null, codigoPostal: 'ficha', fechaNacimiento: 'ficha', fechaCarne: 'ficha',
    sexo: null, garaje: null, conductorEnOtraFicha: false, propietarioEnOtraFicha: false, tieneSeguroActual: false,
    aniosAsegurado: '', aniosSinSiniestros: '', siniestrosUltimos5: '',
  }, {})
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.ok(r.faltan.some((f) => /Matrícula/.test(f)))
    assert.ok(r.faltan.some((f) => /Seguro actual/.test(f)))
  }
})

// 🔒 15/10/2026: Mapfre auto con años en la compañía anterior pide su NOMBRE; la falta se ve en la pantalla, no tras abrir el portal.
const AUTO_BASE = {
  matricula: '1234BCD', marca: null, modelo: null, version: null, codigoPostal: '41003', fechaNacimiento: '1980-05-17', fechaCarne: '2000-06-01',
  sexo: null, garaje: null, conductorEnOtraFicha: false, propietarioEnOtraFicha: false, tieneSeguroActual: true,
  aniosAsegurado: '5', aniosSinSiniestros: '5', siniestrosUltimos5: '0', companiaAnterior: null,
  // 20/10/2026: con seguro anterior Allianz y Mapfre piden la póliza anterior; aquí consta (sintética) y su defecto son sus 5 últimas cifras.
  numeroPolizaActual: 'POL-2026-00012345',
}

test('auto · Mapfre y Allianz: con seguro actual y sin compañía anterior falta (Allianz la exige con cambio de seguro, 19/10/2026)', () => {
  const a = adaptadorDeRamo('auto')!
  const m = checklistBot(a, AUTO_BASE, {}, 'mapfre')
  assert.ok(m.estado === 'evaluado' && m.bloquea && /compañía anterior/.test(m.resumen))
  const m2 = checklistBot(a, AUTO_BASE, { companiaAnterior: '   ' }, 'mapfre')
  assert.ok(m2.estado === 'evaluado' && m2.bloquea && /compañía anterior/.test(m2.resumen))
  const al = checklistBot(a, AUTO_BASE, {}, 'allianz')
  assert.ok(al.estado === 'evaluado' && al.bloquea && /compañía actual del vehículo/.test(al.resumen))
  const al2 = checklistBot(a, AUTO_BASE, { companiaAnterior: 'Línea Directa' }, 'allianz')
  assert.ok(al2.estado === 'evaluado' && !al2.bloquea)
})

test('auto · compañía anterior tecleada (o traída del formulario) quita la falta y viaja en el riesgo; tocar el campo vacío manda', () => {
  const a = adaptadorDeRamo('auto')!
  const bloquea = (f: object, x: Record<string, string>) => { const c = checklistBot(a, f, x, 'mapfre'); return c.estado === 'evaluado' && c.bloquea }
  assert.equal(bloquea(AUTO_BASE, { companiaAnterior: 'Línea Directa' }), false)
  assert.equal(bloquea({ ...AUTO_BASE, companiaAnterior: 'Línea Directa' }, {}), false)
  assert.equal(bloquea({ ...AUTO_BASE, companiaAnterior: 'Línea Directa' }, { companiaAnterior: '' }), true)
  const r = a.construir(AUTO_BASE, { companiaAnterior: ' Línea   Directa ' })
  assert.ok(r.ok && r.riesgo.companiaAnterior === 'Línea Directa')
})

test('auto · sin años (0) no se afirma que falte la compañía anterior; sin seguro actual el formulario no está listo (no «todo ok»)', () => {
  const a = adaptadorDeRamo('auto')!
  const c = checklistBot(a, { ...AUTO_BASE, aniosAsegurado: '0' }, {}, 'mapfre')
  assert.ok(c.estado === 'evaluado' && !c.filas.some((f) => f.clave === 'companiaAnterior'))
  assert.equal(checklistBot(a, { ...AUTO_BASE, tieneSeguroActual: false }, {}, 'mapfre').estado, 'sin_formulario')
  // 19/10/2026: años asegurado sin dato = supuesto favorable (no bloquea el formulario ni desactiva los botones, como moto).
  const sinAnios = checklistBot(a, { ...AUTO_BASE, aniosAsegurado: '' }, {}, 'mapfre')
  assert.ok(sinAnios.estado === 'evaluado' && sinAnios.filas.find((f) => f.clave === 'aniosAseguradoAnterior')?.estado === 'supuesto')
})

test('compañía sin declaración → no_disponible, también con el formulario incompleto; nunca evaluado', () => {
  const a = adaptadorDeRamo('auto')!
  assert.equal(checklistBot(a, AUTO_BASE, {}, 'zurich').estado, 'no_disponible')
  assert.equal(checklistBot(a, { ...AUTO_BASE, matricula: '' }, {}, 'zurich').estado, 'no_disponible')
})

// 20/10/2026 (bot Allianz moto 0.7.11): Allianz moto exige además póliza/justificante del seguro anterior y fecha de adquisición, que este formulario aún no recoge: aquí se mira solo el SEXO.
const sinFaltaSexo = (c: ReturnType<typeof checklistBot>) => c.estado === 'evaluado' && !c.faltan.some((f) => f.clave === 'conductor.sexo')

test('moto · sexo del conductor elegido en el bloque llega al riesgo y desbloquea Allianz Moto; vacío no se inventa', () => {
  const a = adaptadorDeRamo('moto')!
  const F = {
    matricula: '1234BCD', marca: 'Honda', modelo: 'PCX', version: null, codigoPostal: '41003', fechaNacimiento: '1980-05-17', fechaCarne: '2000-06-01',
    sexo: null, conductorEnOtraFicha: false, propietarioEnOtraFicha: false, tieneSeguroActual: true,
    aniosAsegurado: '5', aniosSinSiniestros: '5', siniestrosUltimos5: '0',
  }
  // 18/10/2026: vacío no se inventa — se toma del Sr./Sra. de la ficha (asegura, al encolar): fila «de la ficha», no bloquea aquí.
  const sin = checklistBot(a, F, { cilindrada: '125', sexo: '' }, 'allianz')
  assert.ok(sin.estado === 'evaluado' && sin.filas.find((f) => f.clave === 'conductor.sexo')?.estado === 'ficha')
  const r0 = a.construir(F, { cilindrada: '125', sexo: '' })
  assert.ok(r0.ok && (r0.riesgo.conductor as { sexo: unknown }).sexo === null)
  const con = checklistBot(a, F, { cilindrada: '125', sexo: 'mujer' }, 'allianz')
  assert.ok(sinFaltaSexo(con))
  const r = a.construir(F, { cilindrada: '125', sexo: 'mujer' })
  assert.ok(r.ok && (r.riesgo.conductor as { sexo: string }).sexo === 'mujer')
  // Sin tocar el desplegable manda el del formulario.
  const r2 = a.construir({ ...F, sexo: 'hombre' }, { cilindrada: '125' })
  assert.ok(r2.ok && (r2.riesgo.conductor as { sexo: string }).sexo === 'hombre')
  // Bot 0.7.18: campo de adquisición sin tocar (vacío) → la de matriculación con la marca «por defecto»; tecleada → explícita.
  const d = a.construir({ ...F, fechaMatriculacion: '2023-05-10' }, { cilindrada: '125', sexo: 'mujer', fechaAdquisicion: '' })
  assert.ok(d.ok && d.riesgo.fechaAdquisicion === '2023-05-10' && d.riesgo.fechaAdquisicionPorDefecto === true)
  const x = a.construir({ ...F, fechaMatriculacion: '2023-05-10' }, { cilindrada: '125', sexo: 'mujer', fechaAdquisicion: '2024-01-02' })
  assert.ok(x.ok && x.riesgo.fechaAdquisicion === '2024-01-02' && x.riesgo.fechaAdquisicionPorDefecto === false)
})

test('moto · desplegable de sexo en su valor inicial («») no pisa el sexo del formulario', () => {
  const a = adaptadorDeRamo('moto')!
  const F = {
    matricula: '1234BCD', marca: 'Honda', modelo: 'PCX', version: null, codigoPostal: '41003', fechaNacimiento: '1980-05-17', fechaCarne: '2000-06-01',
    sexo: 'hombre', conductorEnOtraFicha: false, propietarioEnOtraFicha: false, tieneSeguroActual: true,
    aniosAsegurado: '5', aniosSinSiniestros: '5', siniestrosUltimos5: '0',
  }
  const r = a.construir(F, { cilindrada: '125', sexo: '' })
  assert.ok(r.ok && (r.riesgo.conductor as { sexo: string }).sexo === 'hombre')
})

// 19/10/2026: Allianz Hogar (en exploración). Las cuatro elecciones que deciden la tarifa NO tienen valor por defecto.
const HOGAR_BASE = {
  codigoPostal: '41001', municipio: 'VILLAPRUEBA', nombreVia: 'INVENTADA', numero: '1', planta: '2', puerta: 'B', anioConstruccion: 1990, anioReforma: null,
  superficieM2: 90, referenciaCatastral: '1234567AB1234C0001DF', capitalContinenteEur: null, capitalContenidoEur: null, tomadorEmpresa: false,
}
const ELECCIONES = { uso: 'habitual', regimen: 'propietario', tipoVivienda: 'piso', conMadera: 'no' }

test('hogar → adaptador con 4 desplegables SIN valor por defecto (uso, régimen, tipo, madera) y estado honesto «en exploración»', () => {
  const a = adaptadorDeRamo('hogar')
  assert.ok(a)
  assert.equal(a.ramo, 'hogar')
  assert.deepEqual(a.campos.map((c) => [c.clave, c.porDefecto]), [['uso', ''], ['regimen', ''], ['tipoVivienda', ''], ['conMadera', '']])
  assert.ok(a.campos.every((c) => c.opciones?.[0]?.valor === '' && c.opciones[0].etiqueta === 'Elegir…'), 'la primera opción es «Elegir…»')
  assert.match(a.estado ?? '', /en exploración/)
  assert.match(a.estado ?? '', /primera prueba real/)
  assert.match(a.estado ?? '', /no emite/)
  assert.match(a.sinIntegraciones ?? '', /integración activa/)
})

test('hogar: sin elegir nada el bot no puede encolar y lo dice (sin valores); con las cuatro elecciones y la vivienda, sí', () => {
  const a = adaptadorDeRamo('hogar')!
  const sin = a.construir(HOGAR_BASE, {})
  assert.equal(sin.ok, false)
  if (!sin.ok) {
    for (const re of [/Uso de la vivienda/, /Régimen/, /Tipo de vivienda/, /madera/]) assert.ok(sin.faltan.some((f) => re.test(f)), String(re))
  }
  const ok = a.construir(HOGAR_BASE, ELECCIONES)
  assert.equal(ok.ok, true)
  if (ok.ok) {
    assert.equal(ok.riesgo.ramo, 'hogar')
    assert.ok(!('tomador' in ok.riesgo), 'el tomador (DNI y nacimiento) no sale de plataforma')
    assert.deepEqual(ok.completarDesdeFicha, [])
  }
})

test('hogar: checklist de Allianz — el DNI/NIE y el nacimiento del tomador se toman de la ficha (no bloquean); lo que falta del formulario, sí; Mapfre/Occident no se evalúan como Allianz', () => {
  const a = adaptadorDeRamo('hogar')!
  const ok = checklistBot(a, HOGAR_BASE, ELECCIONES, 'allianz')
  assert.equal(ok.estado, 'evaluado')
  if (ok.estado === 'evaluado') {
    assert.equal(ok.bloquea, false)
    assert.deepEqual(ok.filas.filter((f) => f.estado === 'ficha').map((f) => f.clave), ['tomador.documentoIdentidad', 'tomador.fechaNacimiento'])
  }
  // Formulario incompleto → sin_formulario (los faltantes generales se listan aparte).
  assert.equal(checklistBot(a, HOGAR_BASE, {}, 'allianz').estado, 'sin_formulario')
  // Compañía sin declaración → no disponible, nunca «todo ok».
  assert.equal(checklistBot(a, HOGAR_BASE, ELECCIONES, 'reale').estado, 'no_disponible')
})

test('moto · sexoSinFicha (la ficha no da Sr./Sra.) bloquea Allianz Moto salvo que se elija el sexo en el bloque', () => {
  const a = adaptadorDeRamo('moto')!
  const F = {
    matricula: '1234BCD', marca: 'Honda', modelo: 'PCX', version: null, codigoPostal: '41003', fechaNacimiento: '1980-05-17', fechaCarne: '2000-06-01',
    sexo: null, sexoSinFicha: true, conductorEnOtraFicha: false, propietarioEnOtraFicha: false, tieneSeguroActual: true,
    aniosAsegurado: '5', aniosSinSiniestros: '5', siniestrosUltimos5: '0',
  }
  const sin = checklistBot(a, F, { cilindrada: '125', sexo: '' }, 'allianz')
  assert.ok(sin.estado === 'evaluado' && sin.bloquea && sin.filas.find((f) => f.clave === 'conductor.sexo')?.estado === 'falta')
  const con = checklistBot(a, F, { cilindrada: '125', sexo: 'hombre' }, 'allianz')
  assert.ok(sinFaltaSexo(con))
  assert.ok(con.estado === 'evaluado' && con.faltan.some((f) => f.clave === 'fechaAdquisicion'), 'Allianz moto pide la fecha de adquisición (0.7.11)')
})

// ─── Mapfre MOTO y la compañía anterior (19/10/2026, captura de Alberto: BMW sin póliza de moto) ──────────────────────────
const MOTO_BASE = {
  matricula: '1234BCD', marca: 'BMW', modelo: 'F800', version: null, codigoPostal: 'ficha', fechaNacimiento: 'ficha', fechaCarne: 'ficha',
  sexo: null, conductorEnOtraFicha: false, propietarioEnOtraFicha: false, tieneSeguroActual: true,
  aniosAsegurado: '', aniosSinSiniestros: '', siniestrosUltimos5: '',
}
const extraMoto = { cilindrada: '800' }
const faltaCompania = (c: ReturnType<typeof checklistBot>) => c.estado === 'evaluado' && c.faltan.some((f) => f.clave === 'companiaAnterior')

test('moto Mapfre: SIN seguro actual declarado no se pide la compañía anterior', () => {
  const a = adaptadorDeRamo('moto')!
  const c = checklistBot(a, { ...MOTO_BASE, tieneSeguroActual: false }, extraMoto, 'mapfre')
  assert.equal(c.estado, 'evaluado')
  assert.equal(faltaCompania(c), false)
})

test('moto Mapfre: años asegurado 0 declarados → no se pide; con seguro y años > 0 sin nombre → falta; con nombre → listo', () => {
  const a = adaptadorDeRamo('moto')!
  assert.equal(faltaCompania(checklistBot(a, { ...MOTO_BASE, aniosAsegurado: '0' }, extraMoto, 'mapfre')), false)
  assert.equal(faltaCompania(checklistBot(a, { ...MOTO_BASE, aniosAsegurado: '8' }, extraMoto, 'mapfre')), true)
  assert.equal(faltaCompania(checklistBot(a, { ...MOTO_BASE, aniosAsegurado: '8' }, { ...extraMoto, companiaAnterior: 'Línea Directa' }, 'mapfre')), false)
})

test('moto Mapfre: con seguro y años SIN teclear (se desconoce) → supuesto favorable de 5 años ⇒ sigue pidiendo el nombre (no se inventa)', () => {
  const a = adaptadorDeRamo('moto')!
  assert.equal(faltaCompania(checklistBot(a, MOTO_BASE, extraMoto, 'mapfre')), true)
  assert.equal(faltaCompania(checklistBot(a, MOTO_BASE, { ...extraMoto, companiaAnterior: 'Línea Directa' }, 'mapfre')), false)
})

test('moto: la compañía anterior viaja en el riesgo solo con seguro actual y años ≠ 0', () => {
  const a = adaptadorDeRamo('moto')!
  const riesgo = (f: object, x: Record<string, string>) => { const r = a.construir(f, { ...extraMoto, ...x }); assert.equal(r.ok, true, JSON.stringify(r)); return (r as { riesgo: Record<string, unknown> }).riesgo }
  assert.equal(riesgo({ ...MOTO_BASE, aniosAsegurado: '8' }, { companiaAnterior: ' Línea  Directa ' }).companiaAnterior, 'Línea Directa')
  assert.equal('companiaAnterior' in riesgo({ ...MOTO_BASE, aniosAsegurado: '0' }, { companiaAnterior: 'Línea Directa' }), false)
  assert.equal('companiaAnterior' in riesgo({ ...MOTO_BASE, tieneSeguroActual: false }, { companiaAnterior: 'Línea Directa' }), false)
  assert.equal(riesgo({ ...MOTO_BASE, tieneSeguroActual: false }, {}).aniosAseguradoAnterior, 0)
  // No se sabe (null) ≠ sin seguro: años null (supuesto favorable), y la compañía tecleada en el checklist sigue viajando.
  assert.equal(riesgo({ ...MOTO_BASE, tieneSeguroActual: null, aniosAsegurado: '' }, {}).aniosAseguradoAnterior, null)
  assert.equal(riesgo({ ...MOTO_BASE, tieneSeguroActual: null, aniosAsegurado: '' }, { companiaAnterior: 'Línea Directa' }).companiaAnterior, 'Línea Directa')
})
