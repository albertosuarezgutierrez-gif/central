// Explorador 0.3.16 (29/10/2026) · fixtures SINTÉTICAS (sin PII):
//  1) Mapfre patinete: radios/casillas con onclick LARGO (JSF) — se mira el texto COMPLETO (hasta 2000 car.).
//  2) Allianz patinete: catálogo de VMP (matrícula omitible, CP, población, marca, modelo, uso, homologado) y contacto ≠ matrícula/CP.
import { describe, it, expect } from 'vitest'
import {
  catalogoDe,
  catalogoParaIA,
  claveIncompatibleConCampo,
  claveOmitibleSinValor,
  onclickEnviaFormulario,
  resolverDato,
  sanearInventarioDom,
  validarRespuestaExplorador,
  MAX_ONCLICK_CASILLA,
  ONCLICK_REDACTADO,
  bloqueoAvance,
  textoRechazo,
  type InventarioDom,
} from './index.ts'

const MF = 'mapfre:automoviles:patinetes'
const AZ = 'allianz:autos:movilidad_personal'
const URL_NSE = 'https://wmediadores.mapfre.com/EVT21_NSE_FWEB/app/emision/cargaOperacion.jsf'
function inv(elementos: unknown[]): InventarioDom {
  return sanearInventarioDom({ marcos: [{ url: URL_NSE, nombre: 'nse', titulos: [{ texto: 'Oferta / contratación', tag: 'h1' }], elementos }] }, undefined, { refs: true })!
}
function resp(i: InventarioDom, entrada: string, ramo: string, acciones: unknown[], mapeo: unknown[] = []) {
  return validarRespuestaExplorador({ version: 1, pantalla: { nombre: 'X', tipo: 'formulario' }, acciones, mapeo, motivo: null }, { inventario: i, ramo, entrada, datosReales: null, presupuestoEnCurso: false })
}
const ID = 'formulario:tProductosComerciales:3:tProductosComerciales_radio'
/** onclick JSF de selección de fila, LARGO (>200): el parámetro es el propio radio. */
const jsfFila = (relleno = 'x'.repeat(260)) => `/*${relleno}*/ mojarra.jsfcljs(document.getElementById('formulario'),{'${ID}':'${ID}'},'')`
const radio = (onclick: string | undefined) => ({ tag: 'input', type: 'radio', id: ID, name: 'tProductosComerciales_radio', etiqueta: 'MásPatín', ...(onclick ? { onclick } : {}) })

describe('0.3.16 · radio/casilla con onclick largo: se evalúa el texto COMPLETO', () => {
  it('el saneado conserva hasta 2000 car. de onclick en radios/casillas y en avances (button/a/td)', () => {
    const largo = jsfFila('y'.repeat(600))
    expect(largo.length).toBeGreaterThan(200)
    const i = inv([radio(largo), { tag: 'button', texto: 'Calcular', onclick: largo }])
    expect(i.marcos[0].elementos[0].onclick!.endsWith('…')).toBe(false)
    expect(i.marcos[0].elementos[1].onclick).toBe(largo)
    expect(inv([radio('z'.repeat(MAX_ONCLICK_CASILLA + 50))]).marcos[0].elementos[0].onclick!.endsWith('…')).toBe(true)
  })

  it('radio de producto con onclick mojarra LARGO sin emisión → se marca', () => {
    const i = inv([radio(jsfFila())])
    const r = resp(i, MF, 'patinete', [{ accion: 'marcar', ref: i.marcos[0].elementos[0].ref }])
    expect(r.ok, JSON.stringify(r)).toBe(true)
  })

  it('refresco AJAX (mojarra.ab / PrimeFaces.ab / jsf.ajax.request) largo sin emisión → se marca', () => {
    for (const oc of [
      `mojarra.ab(this,event,'valueChange','@this','tablaProductos ${'a'.repeat(250)}')`,
      `PrimeFaces.ab({s:"${ID}",e:"change",p:"@this",u:"tabla ${'b'.repeat(250)}"});return false;`,
      `jsf.ajax.request(this,event,{execute:'@this',render:'tabla ${'c'.repeat(250)}'})`,
    ]) {
      const i = inv([radio(oc)])
      expect(resp(i, MF, 'patinete', [{ accion: 'marcar', ref: i.marcos[0].elementos[0].ref }]).ok, oc.slice(0, 30)).toBe(true)
    }
  })

  it('el mismo onclick largo con emitir/contratar al FINAL (más allá de 200 car.) → bloqueado', () => {
    for (const fin of ["; emitirPoliza()", "; contratar()", "; accion('confirmar contratación')"]) {
      const i = inv([radio(jsfFila() + fin)])
      const r = resp(i, MF, 'patinete', [{ accion: 'marcar', ref: i.marcos[0].elementos[0].ref }])
      expect(r.ok, fin).toBe(false)
      expect(JSON.stringify(r), fin).toMatch(/casilla de acción final/)
    }
  })

  it('submit del formulario (aunque no diga emitir) y jsfcljs que nombra OTRO componente → bloqueado; casilla con submit de acción final también', () => {
    const malos = [
      `${'x'.repeat(250)}; document.forms[0].submit()`,
      `mojarra.jsfcljs(document.getElementById('formulario'),{'formulario:botonOculto':'formulario:botonOculto'},'')`,
      `mojarra.jsfcljs(document.getElementById('formulario'),{'${ID}':'${ID}','formulario:otro':'formulario:otro'},'')`,
      `document.getElementById('f').submit(); emitir()`,
    ]
    for (const oc of malos) {
      for (const tipo of ['radio', 'checkbox']) {
        const i = inv([{ ...radio(oc), type: tipo }])
        expect(resp(i, MF, 'patinete', [{ accion: 'marcar', ref: i.marcos[0].elementos[0].ref }]).ok, `${tipo} ${oc.slice(0, 40)}`).toBe(false)
      }
    }
  })

  it('onclick de más de 2000 car. (recortado) → no se marca (onclick_truncado)', () => {
    const i = inv([radio(jsfFila('w'.repeat(MAX_ONCLICK_CASILLA)))])
    const r = resp(i, MF, 'patinete', [{ accion: 'marcar', ref: i.marcos[0].elementos[0].ref }])
    expect(r.ok).toBe(false)
    expect(JSON.stringify(r)).toMatch(/onclick_truncado/)
  })

  it('selectSituacionComparativa y mca_aviso (sin onclick o con refresco ajax) se pueden marcar', () => {
    const i = inv([
      { tag: 'input', type: 'radio', id: 'f:selectSituacionComparativa:0', name: 'selectSituacionComparativa', etiqueta: 'Sí' },
      { tag: 'input', type: 'checkbox', id: 'f:mca_aviso', name: 'mca_aviso', etiqueta: 'He leído el aviso', onclick: "PrimeFaces.ab({s:'f:mca_aviso',e:'click'})" },
    ])
    const r = resp(i, MF, 'patinete', i.marcos[0].elementos.map((e) => ({ accion: 'marcar', ref: e.ref })))
    expect(r.ok, JSON.stringify(r)).toBe(true)
  })

  it('onclickEnviaFormulario: puro', () => {
    expect(onclickEnviaFormulario(undefined, {})).toBe(false)
    expect(onclickEnviaFormulario('this.form.submit()', { id: 'a' })).toBe(true)
    expect(onclickEnviaFormulario("mojarra.jsfcljs(f,{'a':'a'},'')", { id: 'a' })).toBe(false)
    expect(onclickEnviaFormulario("mojarra.jsfcljs(f,{'a':'a'},'')", {})).toBe(true)
    expect(onclickEnviaFormulario("mojarra.jsfcljs(f,{'b':'b'},'')", { id: 'a', name: 'n' })).toBe(true)
  })
})

describe('0.3.16 · catálogo de patinete/VMP y contacto ≠ matrícula/CP', () => {
  const ctx = (extra = {}) => ({ ramo: 'patinete', tomadorMediador: true, conDatosReales: false, riesgo: {}, env: {}, hoy: new Date('2026-10-29T00:00:00Z'), ...extra })
  it('claves nuevas con datos de prueba sin PII; la matrícula NO tiene valor inventado', () => {
    const claves = catalogoDe('patinete').map((d) => d.clave)
    for (const k of ['vehiculo.matricula', 'vehiculo.codigo_postal', 'vehiculo.poblacion', 'vmp.marca', 'vmp.modelo', 'vmp.uso_profesional', 'vmp.homologado']) expect(claves, k).toContain(k)
    const val = (k: string) => resolverDato(k, ctx())
    expect(val('vmp.marca')).toEqual({ ok: true, valor: 'Xiaomi' })
    expect(val('vmp.modelo')).toEqual({ ok: true, valor: 'Electric Scooter 4 Pro' })
    expect(val('vmp.uso_profesional')).toEqual({ ok: true, valor: 'No' })
    expect(val('vmp.homologado')).toEqual({ ok: true, valor: 'Sí' })
    expect(val('vehiculo.codigo_postal')).toEqual({ ok: true, valor: '41001' })
    expect(val('vehiculo.poblacion')).toEqual({ ok: true, valor: 'Sevilla' })
    expect(val('vehiculo.matricula')).toEqual({ ok: false, motivo: 'dato_sensible_requerido' })
    expect(claveOmitibleSinValor('patinete', 'vehiculo.matricula')).toBe(true)
    expect(claveOmitibleSinValor('auto', 'vehiculo.matricula')).toBe(false)
    expect(claveOmitibleSinValor('patinete', 'vmp.marca')).toBe(false)
  })
  it('la IA ve la pista de lo no personal y NADA del valor de la matrícula; con datos reales la matrícula sale del riesgo', () => {
    const c = catalogoParaIA('patinete')
    expect(c.find((d) => d.clave === 'vmp.marca')?.pista).toBe('Xiaomi')
    expect(c.find((d) => d.clave === 'vehiculo.matricula')?.pista).toBeUndefined()
    expect(resolverDato('vehiculo.matricula', ctx({ conDatosReales: true, riesgo: { matricula: 'TEST-0001' } }))).toEqual({ ok: true, valor: 'TEST-0001' })
  })
  it('contacto.telefono/email no se mapea ni rellena en un input de matrícula, código postal o población', () => {
    const campos = [
      { tag: 'input', type: 'text', id: 'VMPBean$matricula', name: 'VMPBean$matricula' },
      { tag: 'input', type: 'text', id: 'MunicipioVMPBean$codigoPostal', name: 'MunicipioVMPBean$codigoPostal' },
      { tag: 'input', type: 'text', id: 'p1', etiqueta: 'Población' },
    ]
    const i = inv(campos)
    for (const e of i.marcos[0].elementos) {
      expect(claveIncompatibleConCampo('contacto.telefono', e), e.id).toBe(true)
      expect(claveIncompatibleConCampo('contacto.email', e), e.id).toBe(true)
      expect(claveIncompatibleConCampo('vehiculo.codigo_postal', e), e.id).toBe(false)
      const rel = resp(i, AZ, 'patinete', [{ accion: 'rellenar', ref: e.ref, dato: 'contacto.telefono' }])
      expect(rel.ok, e.id).toBe(false)
      const map = resp(i, AZ, 'patinete', [{ accion: 'rellenar', ref: e.ref, dato: 'vehiculo.codigo_postal' }], [{ ref: e.ref, campoCanonico: 'contacto.telefono', confianza: 'baja' }])
      expect(map.ok && map.respuesta.mapeo.length, e.id).toBe(0)
    }
    const tel = inv([{ tag: 'input', type: 'tel', id: 'telefono', name: 'telefono' }])
    expect(resp(tel, AZ, 'patinete', [{ accion: 'rellenar', ref: tel.marcos[0].elementos[0].ref, dato: 'contacto.telefono' }]).ok).toBe(true)
  })
})

describe('0.3.16 (revisión) · radio/casilla: el ORIGEN de un ajax/jsfcljs tiene que ser el propio control', () => {
  const marcar = (oc: string) => {
    const i = inv([radio(oc)])
    return resp(i, MF, 'patinete', [{ accion: 'marcar', ref: i.marcos[0].elementos[0].ref }])
  }
  it('ajax/envío cuyo origen o parámetros nombran OTRO componente (id opaco, sin palabras de emisión) → bloqueado', () => {
    for (const oc of [
      `mojarra.ab('formulario:j_idt88',event,'action',0,0)`,
      `jsf.ajax.request(document.getElementById('formulario:j_idt88'),event,{execute:'@form'})`,
      `PrimeFaces.ab({s:"formulario:j_idt88",f:"formulario",p:"formulario:j_idt88"});return false;`,
      `PrimeFaces.ab({f:"formulario",p:"@this"})`,
      `A4J.AJAX.Submit('formulario',event,{'similarityGroupingId':'formulario:j_id12','parameters':{'formulario:j_id12':'formulario:j_id12'}})`,
      `mojarra.ab(this,event,'click',0,0); mojarra.ab('formulario:j_idt88',event,'action',0,0)`,
      `mojarra.jsfcljs(document.getElementById('formulario'),{'${ID}':'${ID}'},''); mojarra.jsfcljs(document.getElementById('formulario'),{'formulario:j_idt88':'formulario:j_idt88'},'')`,
      `document.getElementById('formulario:j_idt88').click()`,
      `jQuery('#formulario\\:j_idt88').trigger('click')`,
      `PrimeFaces.ajax.Request.handle({source:'formulario:j_idt88'})`,
    ]) {
      const r = marcar(oc)
      expect(r.ok, oc.slice(0, 60)).toBe(false)
      expect(JSON.stringify(r), oc.slice(0, 60)).toMatch(/casilla de acción final/)
    }
  })
  it('ajax con origen this o el propio control (también A4J con sus parámetros propios) → se marca', () => {
    for (const oc of [
      `mojarra.ab(this,event,'click',0,'tabla')`,
      `mojarra.ab('${ID}',event,'click',0,'tabla')`,
      `PrimeFaces.ab({s:this,e:'change',p:'@this'})`,
      `A4J.AJAX.Submit('formulario',event,{'similarityGroupingId':'${ID}','parameters':{'${ID}':'${ID}'}})`,
    ]) expect(marcar(oc).ok, oc.slice(0, 60)).toBe(true)
  })
  it('onclick que el saneado quita por dato personal → queda como REDACTADO (recortado) y no se marca', () => {
    const i = inv([radio(`seleccionar('12345678Z')`)])
    expect(i.marcos[0].elementos[0].onclick).toBe(ONCLICK_REDACTADO)
    const r = resp(i, MF, 'patinete', [{ accion: 'marcar', ref: i.marcos[0].elementos[0].ref }])
    expect(r.ok).toBe(false)
    expect(JSON.stringify(r)).toMatch(/onclick_truncado/)
  })
})

describe('0.3.16 · avance con onclick largo (Mapfre NSE «Siguiente >>», A4J.AJAX.Submit): se evalúa el texto COMPLETO', () => {
  const a4j = (relleno: string, fin = '') =>
    `A4J.AJAX.Submit('formProductos',event,{'similarityGroupingId':'formProductos:btnSiguiente','parameters':{'formProductos:btnSiguiente':'formProductos:btnSiguiente'},'containerId':'j_id_${relleno}'${fin}});return false;`
  const siguiente = (onclick: string) => ({ tag: 'a', role: 'link', id: 'formProductos:btnSiguiente', texto: 'Siguiente >>', onclick })
  const bloqueo = (onclick: string) => {
    const i = inv([siguiente(onclick)])
    return bloqueoAvance(MF, i.marcos[0].elementos[0], i.marcos[0])
  }
  it('A4J largo (>200) sin acción final → se puede pulsar', () => {
    const oc = a4j('x'.repeat(300))
    expect(oc.length).toBeGreaterThan(200)
    expect(bloqueo(oc)).toBeNull()
  })
  it('la acción final MÁS ALLÁ de los 200 car. se ve → boton_de_emision', () => {
    for (const fin of [",'emitir':'1'", ",'oncomplete':'contratarPoliza()'", ",'accion':'confirmar'"]) expect(bloqueo(a4j('x'.repeat(300), fin)), fin).toBe('boton_de_emision')
  })
  it('más de 2000 car. → onclick_truncado (no se pulsa)', () => {
    expect(bloqueo(a4j('x'.repeat(2100)))).toBe('onclick_truncado')
  })
  it('el rechazo del validador guarda acción, ref y causa (sin valores)', () => {
    const i = inv([siguiente(a4j('x'.repeat(2100)))])
    const ref = i.marcos[0].elementos[0].ref!
    const r = resp(i, MF, 'patinete', [{ accion: 'avanzar', ref, efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }])
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.rechazos?.[0]).toMatchObject({ indice: 0, accion: 'avanzar', ref })
    expect(r.rechazos?.[0].causa).toMatch(/onclick_truncado/)
    expect(textoRechazo(r.rechazos![0])).toMatch(new RegExp(`^rechazo acciones\\[0\\] avanzar ${ref}: .*onclick_truncado`))
    // Ref inventada por la IA: no se copia (solo refs del inventario).
    const r2 = resp(i, MF, 'patinete', [{ accion: 'marcar', ref: 'r999' }])
    expect(!r2.ok && r2.rechazos?.[0]).toMatchObject({ accion: 'marcar', ref: null })
  })
})
