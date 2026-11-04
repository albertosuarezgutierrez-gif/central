/* eslint-disable @typescript-eslint/no-explicit-any */
// Ajustes → «Entrega del vehículo y conservación de fotos»: mínimo de 90 días, versión del texto y viaje de ida y vuelta por la BD.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { configDeAlta, FOTOS_RETENCION_MIN_DIAS } from '@central/module-taller'
import { aplicarAjuste } from '../lib/ajustes.ts'
import { guardarConfig, leerConfig } from '../lib/config-repo.ts'
import { crearConTaller } from '../lib/rls.ts'
import { crearBdFake } from './_fake-prisma.ts'

const T = 'f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b'
const cambio = (o: Partial<{ firmaObligatoria: boolean; textoConformidad: string; fotosRetencionDias: number }> = {}) => ({
  seccion: 'retirada_fotos' as const, firmaObligatoria: true, textoConformidad: configDeAlta().retirada.textoConformidad, fotosRetencionDias: 180, ...o,
})

test('por debajo del mínimo de 90 días se rechaza (89, 0, negativo); 90 y más se aceptan', () => {
  const antes = configDeAlta()
  for (const d of [89, 0, -1, 30]) {
    const r = aplicarAjuste(antes, cambio({ fotosRetencionDias: d }))
    assert.equal(r.ok, false, `${d}`)
    assert.ok(!r.ok && r.errores.some((e) => e.includes('fotosRetencionDias')))
  }
  for (const d of [FOTOS_RETENCION_MIN_DIAS, 91, 365, 1000]) assert.equal(aplicarAjuste(antes, cambio({ fotosRetencionDias: d })).ok, true, `${d}`)
})

test('texto cambiado = versión nueva; texto igual (aunque con espacios) = misma versión; vacío se rechaza', () => {
  const antes = configDeAlta()
  const igual = aplicarAjuste(antes, cambio({ textoConformidad: `  ${antes.retirada.textoConformidad}  ` }))
  assert.ok(igual.ok && igual.config.retirada.versionTextoConformidad === antes.retirada.versionTextoConformidad)
  const nuevo = aplicarAjuste(antes, cambio({ textoConformidad: 'Otro texto de conformidad.' }))
  assert.ok(nuevo.ok && nuevo.config.retirada.versionTextoConformidad === 'retirada-borrador-2')
  assert.ok(nuevo.ok && antes.retirada.versionTextoConformidad === 'retirada-borrador-1', 'no muta la configuración anterior')
  assert.equal(aplicarAjuste(antes, cambio({ textoConformidad: '   ' })).ok, false)
})

test('desactivar la firma y el plazo se guardan y se leen de la BD', async () => {
  const bd = crearBdFake()
  bd.sembrar('taller', { id: T })
  bd.sembrar('configuracion', { tallerId: T })
  const conTaller = crearConTaller(bd.cliente)
  await conTaller(T, (tx: any) => guardarConfig(tx, T, configDeAlta()))
  await conTaller(T, async (tx: any) => {
    const r = aplicarAjuste((await leerConfig(tx, T))!, cambio({ firmaObligatoria: false, fotosRetencionDias: 400, textoConformidad: 'Conforme con la entrega.' }))
    assert.ok(r.ok)
    if (r.ok) await guardarConfig(tx, T, r.config)
  })
  const c = (await conTaller(T, (tx: any) => leerConfig(tx, T)))!
  assert.equal(c.retirada.firmaObligatoria, false)
  assert.equal(c.retirada.textoConformidad, 'Conforme con la entrega.')
  assert.equal(c.retirada.versionTextoConformidad, 'retirada-borrador-2')
  assert.equal(c.fotosRetencionDias, 400)
})
