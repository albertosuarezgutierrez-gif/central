# Solicitud web de presupuesto de patinete (Grupo ASegura) — diseño (03/11/2026)

**Flujo:** formulario en `grupoasegura.es` → lead + oportunidad en `/correduria` → bots RPA Allianz + Mapfre **tarifican**
(nunca emiten) → presupuesto BORRADOR auto-montado → **Telegram a Alberto (resumen + PDF, ✅ Enviar / ✏️ Modificar)** →
solo con ✅ sale el correo al cliente con la URL → el cliente elige, mete datos + IBAN y firma → Telegram a Alberto → él emite a mano.
Decisión de Alberto (03/11): **nada sale solo al cliente hasta que el flujo funcione al 100 %**. El autoenvío es fase futura.

## 0. Punto de partida real (BD, solo SELECT, 03/11/2026)
- **No existe tarificación de patinete con datos reales.** `tarificacion_trabajos` ramo `patinete`: 53 trabajos, TODOS `modo='exploracion'`
  (37 ok, 16 error_definitivo), 0 con `tarificacion_id`. `tarificador_exploraciones` (53): todas `con_datos_reales=false`, mapa en
  `borrador`, cierres `ambiguo` (21), `guard_emision` (13), `dato_sensible_requerido` (9), `cerca_de_emision` (3)…; ninguna lleva prima.
- `services/tarificador-rpa/src/adapters/index.ts:12-19` no registra adaptador de patinete: el runner `tarificar` no tiene ramo
  `patinete` (`ramo.ts:25-27` solo vehículo auto/moto y hogar). Lo que «funciona» es el **explorador IA** (entradas
  `allianz:autos:movilidad_personal` y `mapfre:automoviles:patinetes`, `packages/module-tarificacion/src/explorador.ts:360-380`), con
  **tomador = el mediador** (`:174-178`) y datos sintéticos. Esto es la pieza más grande que falta (paso 4.3).
- El enum `seguros.tipo_seguro` ya tiene `patinete`; el lead web ya mapea `patinete-electrico → patinete` (`apps/plataforma/lib/leads-web.ts:357`).

## 1. Qué piden hoy los bots → campos del formulario
Catálogo del explorador (`explorador.ts:472-483` comunes + `:570-578` patinete) y pantallas inventariadas de Allianz VMP
(`tarificador_exploracion_pasos`): `VMPBean` marca/modelo/matrícula/homologado(Sí/No), `MunicipioVMPBean` CP/población,
`ConductorVMPBean` fecha de nacimiento, `IntervinientesBean` tipo doc. + doc. de tomador/conductor/propietario y 2.º conductor Sí/No,
`DatosGeneralesBean` fecha efecto, recibos. **Mapfre nunca pasó del menú NSE** (no hay campos del riesgo inventariados): su lista es
provisional hasta una exploración que llegue a la pantalla del vehículo.

| Campo del formulario | Uso | Notas |
|---|---|---|
| Marca + modelo (catálogo, §2) | `vmp.marca`, `vmp.modelo` | obligatorio |
| CP de circulación (→ población automática) | `vehiculo.codigo_postal`, `vehiculo.poblacion` | regla de direcciones: CP → municipio por desplegable |
| Fecha de nacimiento del conductor habitual | `ConductorVMPBean` | obligatorio (tarifa) |
| Nombre, apellidos, correo, móvil | ficha + contacto | correo obligatorio (puerta del portal) |
| Consentimientos (privacidad; comerciales opcional) | `consent_logs` | ya lo hace el lead |
| **supuesto** Uso no profesional | `vmp.uso_profesional = No` | si marca «uso profesional/reparto» → no auto-tarificar, a Alberto |
| **supuesto** Homologado / con certificado DGT = Sí | `vmp.homologado` | pregunta Sí/No/No sé; «No» o «No sé» → a Alberto |
| **supuesto** Tomador = conductor = propietario, sin 2.º conductor | `IntervinientesBean` | |
| **supuesto** Efecto = mañana | `efecto.fecha` (`@manana`) | |
| **supuesto** Matrícula/nº DGT vacío | `omitibleSinValor` | se pide en la firma (`inscripcionDgt`, `datos-riesgo-libre.ts:38`) |
| NIF del tomador | `tomador.nif` (`fuente:'riesgo'`, sin sintético) | **no** en el formulario: se tarifica con NIF del mediador solo si Alberto lo autoriza para este uso (pregunta 1); si no, el NIF se pide en la web y va cifrado |

## 2. Marca/modelo
- Hoy: la IA del explorador elige del `<select>` del portal usando la pista sintética («Xiaomi», «Electric Scooter 4 Pro»);
  el inventario conserva las opciones que casan (`pistasOpcionesInventario`, `explorador.ts:605`); no hay regla «más parecido»
  determinista. Allianz: `VMPBean$marca` 55 marcas, `VMPBean$modelo` dependiente (28 para Xiaomi), ya guardadas en
  `tarificador_exploracion_pasos.inventario`. Mapfre: sin datos.
- Reutilizable: `seguros.tarificador_elecciones` (compania, ramo, tipo, clave_normalizada, codigo, etiqueta, confirmaciones) está
  **vacía** y tiene la forma justa para el mapeo «texto del cliente → opción del portal».
- Propuesta: tabla nueva `seguros.vmp_catalogo` (marca, modelo, normalizado, fuente, visto_at) = lo que ve el cliente en el desplegable
  (con «Otro / no está en la lista» → texto libre y la oportunidad va a Alberto sin tarificar) + `tarificador_elecciones` (tipo
  `vmp_modelo`) para la correspondencia por compañía. Poblado: (a) script de solo lectura que extrae las opciones ya inventariadas de
  Allianz; (b) entrada `soloLectura` del explorador (patrón Pelayo, `explorador.ts:183`) que recorra marcas en Allianz y llegue a la
  pantalla del vehículo en Mapfre; (c) cada tarificación real confirma (`confirmaciones++`) o falla la elección. Ningún «parecido» se
  aplica sin estar confirmado: una elección no confirmada para una compañía = ese bot no se lanza y se avisa.

## 3. Piezas existentes (archivo:línea)
- Web → plataforma: `apps/asegura-web/app/api/lead/route.ts:59` (reenvía `x-forwarded-for`, `:83-88`); tipos `apps/asegura-web/lib/contrato-lead.ts:15`.
- Lead en plataforma: `apps/plataforma/app/api/publico/correduria/lead/route.ts:42` (rate limit 6/h por IP **en memoria, por instancia**,
  honeypot, alta por puerto, `tgAviso` `correduria.lead-nuevo`); validación `lib/leads-web.ts:182`, enlace `:372`.
- Oportunidad: `apps/asegura/lib/lead-web-solicitud.ts:50` → `crearOportunidad` (`lib/oportunidad-seguimiento.ts:844`), origen `web:lead`.
- Tarificación: `apps/asegura/lib/tarificador.ts:145` `encolarTrabajo`; cierre `:636` `registrarResultado`; tomador mediador
  `lib/tarificador-explorador-mediador.ts`; entradas Mapfre `services/tarificador-rpa/src/adapters/mapfre/entrada.ts:94,314`.
- Auto-montaje: `apps/asegura/app/api/tarificador/resultado/route.ts:69` → `lib/presupuesto-rpa.ts:70/92` (borrador `ofertas`, ofertas
  `extraida` que el trigger obliga a revisar, Telegram interno); disparo `lib/presupuesto-rpa-reglas.ts:334` (solo `modo='tarificar'`). PDF `lib/presupuesto-pdf*.ts`.
- Envío/enlace: `lib/envio-presupuesto.ts:166` `avisarPresupuesto` (token nuevo con CAS, solo hash, `enviado_at` solo si Resend acepta,
  idempotencia; exige `necesidades` IDD `:220`); URL `:92` → `apps/asegura-portal/app/presupuesto/[token]/page.tsx` (ya existe: código de
  un solo uso por correo, elegir, datos, IBAN, firma OTP) vía `apps/asegura/app/api/portal/presupuesto/route.ts:67`; IBAN cifrado con
  `encryptField` (`lib/presupuesto-aceptacion.ts:31`, sin clave = `sin_cifrado`, no firma `:373`).
- Telegram con botones, patrón a copiar: factura del huésped `apps/plataforma/lib/sivra/facturas/telegram.ts:54` (✅ callback / ✏️ URL,
  solo `from.id = TELEGRAM_CHAT_ID`, `mensajeVigente` `:41`), `servicio.ts:234` `proponerEnTelegram` + `:277` PDF, enrutado en
  `app/api/sivra/mensajes/telegram-webhook/route.ts:1064`; `tgSendDocument`/`tgSendButtons` `packages/core-telegram/src/index.ts:77,100`;
  catálogo de avisos `apps/plataforma/lib/telegram/catalogo.ts`. Remitente `MEDIADOR.email` (`packages/module-seguros/src/mediador.ts:133`).

## 4. Lo que falta (orden de construcción)
1. **Formulario** `/seguro-patinete-electrico/presupuesto` en asegura-web (campos §1, CP→municipio, consentimientos, honeypot),
   `contrato-lead` con bloque `riesgoPatinete` validado por helper puro con test. Verifica: test + envío con riesgo de prueba.
2. **Catálogo VMP**: SQL `vmp_catalogo` + extractor de solo lectura de los inventarios de Allianz + endpoint público cacheado (CORS fijo,
   regla de `/api/publico/*`). Verifica: el desplegable lista las 55 marcas.
3. **Adaptador `tarificar` de patinete** (Allianz primero, luego Mapfre): consolidar el mapa del explorador en adaptador determinista,
   validador `patinete` en `ramo.ts`, `faltanParaTarificar` en `obligatorios.ts`, guard de emisión intacto, flag `*_PATINETE_ACTIVO` y fila
   `companias_integracion` `rpa_autorizada`. Verifica: un trabajo `modo='tarificar'` con riesgo de prueba deja `tarificacion_id` y prima.
4. **Encolar desde el lead**: con riesgo completo, el lead (puerto asegura) crea oportunidad + `info_riesgo` + `necesidades` (texto
   derivado del formulario: «RC obligatoria del patinete X, uso particular») + un trabajo por compañía. Verifica: test puro + oportunidad real de prueba.
5. **Borrador → Telegram a Alberto**: tras `presupuestoTrasTrabajoRpa`, si `origen web:patinete`: resumen (nº ofertas, rango de primas,
   supuestos, sin PII más allá del nombre de pila) + PDF + ✅ Enviar (prefijo propio, p. ej. `psp_env:<uuid>`) / ✏️ Modificar (URL a la
   oportunidad). ✅ = marcar las ofertas revisadas + `avisarPresupuesto(canal 'email')`; solo el mensaje vigente; resultado `incierto`
   no se reintenta. Verifica: test del decidor + pulsación real con cliente de prueba.
6. **Aviso de aceptación**: al firmar en el portal, Telegram «aceptado: emite tú» (sin IBAN, sin NIF) con enlace a la oportunidad.
7. **Fase futura** (apagada): `ASEGURA_SOLICITUD_PATINETE_AUTOENVIO` (por defecto ausente = off) que salta el ✅ en §5.

## 5. Seguridad y cumplimiento
- **Envío**: regla general intacta; cada correo al cliente sale por el ✅ de Alberto. El interruptor futuro solo valdría para
  solicitudes web de patinete, con todas las ofertas sin avisos de error y el texto «precio orientativo hasta la emisión».
- **IBAN**: solo en el portal en la firma, cifrado con `PII_ENCRYPTION_KEY`; nunca en logs, correo, Telegram ni en el puerto
  `/api/operador/*` (allí, máscara). Ídem NIF si llega a pedirse en la web.
- **Enlace**: token de un solo uso con hash y CAS (ya existe), `vence_el` de `calcularVencimiento`; entrada al portal con código por correo.
- **Antispam**: el 6/h por IP en memoria no basta para una ruta que gasta bots: añadir tope persistente por IP /24 y por correo
  (y el `TOPE_DIARIO_LEADS_WEB = 20` de `apps/asegura/lib/lead-web-regla.ts:13`), honeypot y, si hace falta, Turnstile. Tarificar solo
  tras correo verificado (doble opt-in) — pregunta 3.
- **RGPD**: consentimiento versionado en `consent_logs` (ya existe); finalidad «presupuesto» separada de comerciales.
- **IDD**: correo y página con identidad del mediador desde `MEDIADOR` (nunca a mano), criterio «análisis de un número limitado de
  compañías (Allianz y Mapfre), no de todo el mercado», necesidades guardadas antes de proponer, IPID por opción.
- **Bot que falla**: si hay ≥1 oferta, borrador con las que haya y el Telegram dice cuál falló; si ninguna, Telegram «sin ofertas, llama
  tú» y no se monta presupuesto.

## 6. Preguntas abiertas para Alberto
1. ¿Se tarifica con el NIF del mediador como tomador (como en las exploraciones) y se cambia al real en la emisión, o se pide NIF en la web?
2. ¿Qué hacer con «uso profesional/reparto» y «no homologado / no sé»: a mano siempre?
3. ¿Doble opt-in (confirmar el correo) antes de gastar bots?
4. ¿Coberturas opcionales (robo, daños, accidentes) se tarifican o solo RC obligatoria?
5. ¿Prioridad Allianz primero (ya llega a la pantalla del vehículo) y Mapfre después?
