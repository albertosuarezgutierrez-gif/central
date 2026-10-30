// Explorador 0.3.25 (30/10/2026) · fixtures SINTÉTICAS (sin PII):
// Fidelidade «Datos Cliente - Nombre y régimen» (56b4b52c…): el MAPA de esa pantalla solo traía `marcar` PROPIETARIO (el nombre y el submit
// tenían ids recortados con «…» = sin selector estable → huecos) y NINGÚN avance. Repetirlo marcaba el régimen ANTES de que la IA rellenara
// el nombre; el portal recalcula el avance en el `change` del radio y el botón se quedó deshabilitado → la IA paró. Una pantalla del mapa sin
// avance conocido es memoria a medias: no se usa (decide la IA con el inventario completo). Con avance, el mapa sigue sirviendo igual.
import { describe, it, expect } from 'vitest'
import { construirMapa, huellaPantalla, planDesdeMapa, sanearInventarioDom, type InventarioDom, type RespuestaExplorador } from './index.ts'

const FI = 'fidelidade:particulares:vivienda'
const URL_FI = 'https://mediadores.fidelidade.es/OPI_ES_Vivienda/Simualtion.aspx'
const LARGO = 'OPI_Theme_wt25_block_wtMainContent_FID_B2B_SIM_Pat_wt22_block_wtForm_FID_B2B_SIM_Pat_wtNombreCompletoInputLargo'
const inv: InventarioDom = sanearInventarioDom({ marcos: [{ url: URL_FI, nombre: null, titulos: [], elementos: [
  { tag: 'label', texto: 'Nombre y apellidos/Razón Social' },
  { tag: 'input', type: 'text', id: LARGO, name: LARGO.replace(/_/g, '$'), conValor: false },
  { tag: 'input', type: 'radio', id: 'reg1', etiqueta: 'PROPIETARIO', texto: 'PROPIETARIO', conValor: false },
  { tag: 'input', type: 'radio', id: 'reg2', etiqueta: 'INQUILINO', texto: 'INQUILINO', conValor: false },
  { tag: 'button', id: 'btnSiguiente', texto: 'Siguiente' },
] }] }, undefined, { refs: true })!
const ref = (id: string) => inv.marcos[0].elementos.find((e) => (id === LARGO ? e.type === 'text' : e.id === id))!.ref!
const meta = { entrada: FI, compania: 'fidelidade', producto: 'hogar', modelo: null, fecha: '2026-10-30', efectosEnPortal: [] as never[], redNoGet: [], coste: { llamadas: 1, eurEstimado: 0.01 }, motivoFin: null }
const mapaDe = (acciones: RespuestaExplorador['acciones']) => construirMapa(meta, [{ huella: huellaPantalla(inv), inventario: inv, respuesta: { version: 1, pantalla: { nombre: 'Datos Cliente', tipo: 'formulario' }, acciones, mapeo: [{ ref: ref('reg1'), campoCanonico: 'hogar.regimen', confianza: 'alta' }], motivo: null } }])

describe('0.3.25 · planDesdeMapa: una pantalla del mapa SIN avance no se repite', () => {
  it('real: solo `marcar` del régimen y avance null → null (decide la IA)', () => {
    const mapa = mapaDe([{ accion: 'rellenar', ref: ref(LARGO), dato: 'tomador.nombre_completo' }, { accion: 'marcar', ref: ref('reg1') }])
    const p = mapa.pantallas[0]
    expect(p.avance).toBeNull()
    expect(p.campos.map((c) => c.tipo)).toEqual(['marcar'])
    expect(mapa.huecos.some((h) => /sin selector estable/.test(h))).toBe(true)
    expect(planDesdeMapa(p, inv)).toBeNull()
  })

  it('con avance conocido el mapa sigue sirviendo (marcar + avanzar)', () => {
    const mapa = mapaDe([{ accion: 'marcar', ref: ref('reg1') }, { accion: 'avanzar', ref: ref('btnSiguiente'), efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }])
    const plan = planDesdeMapa(mapa.pantallas[0], inv)
    expect(plan?.acciones.map((a) => a.accion)).toEqual(['marcar', 'avanzar'])
  })
})
