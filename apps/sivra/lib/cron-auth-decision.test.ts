import { test } from "node:test"
import assert from "node:assert/strict"
import { autorizaSecreto } from "./cron-auth-decision.ts"

test("sin CRON_SECRET en producción: DENIEGA (antes autorizaba a cualquiera)", () => {
  assert.equal(autorizaSecreto({ secret: undefined, produccion: true }), false)
})

test("sin CRON_SECRET en dev: paso franco", () => {
  assert.equal(autorizaSecreto({ secret: undefined, produccion: false }), true)
})

test("con secreto: solo el valor exacto autoriza", () => {
  assert.equal(autorizaSecreto({ secret: "s", bearer: "s", produccion: true }), true)
  assert.equal(autorizaSecreto({ secret: "s", qs: "s", produccion: true }), true)
  assert.equal(autorizaSecreto({ secret: "s", bearer: "x", produccion: true }), false)
  assert.equal(autorizaSecreto({ secret: "s", produccion: true }), false)
})
