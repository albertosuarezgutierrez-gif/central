# Gestor de pólizas como imán de leads: SEO, landing, carta de baja, consentimiento y solapamientos

> Origen: Alberto trajo el 19/09/2026 un prompt de consultoría («Gestor y Agregador de Pólizas
> Gratuito» + 4 pilares SEO/producto) y pidió valorarlo contra lo que ya existe. Valoración: ~70 %
> ya construido o decidido; tres propuestas chocan con decisiones firmadas (semáforo de precio,
> reseñas automatizadas, referidos con incentivo). Después: «Hazlo todo» sobre los 7 puntos que sí
> añaden valor. Este documento es lo que se hizo, lo que se dejó fuera y por qué.

## Lo que el prompt proponía y ya existía (no se volvió a diseñar)

| Pilar del prompt | Estado real |
|---|---|
| Gestor abierto a no clientes, bóveda de otras compañías | `apps/asegura-portal`, vivo en `clientes.grupoasegura.es` |
| OCR de PDF/foto con confirmación | `lib/extraer-poliza.ts` + `POST /api/polizas` |
| Alertas de vencimiento | fecha accionable (art. 22 LCS) en campana; **cron de correo apagado** |
| Multiusuario familiar | Contactos + autorizaciones direccionales |
| Gestor de siniestros + teléfonos | wizard `ParteSiniestro` + `companias_dgs` verificado a mano |
| Micro-nichos, EEAT, GBP, GSC | 8 ramos; `MEDIADOR`; ficha verificada; GSC conectada |

## Lo que se descartó, con motivo

- **Semáforo de precio / «pagas de más»**: medido el 12/09 (1-2 comparables por celda), decisión de
  Alberto de no automatizar; y es asesoramiento (RDL 3/2020) → `lib/ramos.test.ts` en rojo.
- **Reseñas «de 5 estrellas» automatizadas tras renovación**: comunicación saliente sin OK por envío
  (regla global) + review gating, con 4 fichas ya suspendidas en la cuenta de Google.
- **Referidos con incentivo**: aparcado (§M de `CORREDURIA-INTRANET-IDEAS.md`) hasta la asesoría.
- **Panel B2B**: bloqueado por el parser de CIMA (idea J).
- **«Teléfonos de todas las aseguradoras»**: solo los verificados uno a uno (regla del 05/09).
- **«Colegiados»**: los corredores están *inscritos en la DGSFP*; no se usa la palabra.

## Lo construido (19/09/2026)

### `packages/module-seguros-portal` (puro, con tests)
- `carta-no-renovacion.ts` — `estadoPlazoCarta()` (sin_fecha / en_plazo / fuera_de_plazo / vencida,
  sobre `fechaAccionable()`) y `componerCartaNoRenovacion()`: texto con huecos `[TU NIF]`… para lo
  que el portal no sabe. **Nunca se envía desde el portal.**
- `solapamientos.ts` — `detectarSolapamientos()`: tres familias (defensa jurídica, asistencia en
  viaje, RC familiar) presentes en ≥2 pólizas PROPIAS. Informa, no juzga: el matiz de cada familia
  dice por qué no es automáticamente un duplicado.
- `consentimiento.ts` — `comercial` pasa a `TIPOS_QUE_SE_REGISTRAN`; `TEXTO_CONSENTIMIENTO_COMERCIAL`
  + `VERSION_TEXTO_COMERCIAL` (`2026-09-c1`); `consentimientoVigente()` = última fila del tipo
  (`null` = nunca preguntado). `avisos` sigue sin casilla.

### `apps/asegura-portal`
- `POST /api/consentimiento` — solo `comercial`, append-only, sin cambio no escribe, veto a la vista
  de corredor, sella `VERSION_TEXTO_COMERCIAL`.
- `boveda/ConsentimientoComercial.tsx` — casilla independiente, nace desmarcada, retirar = desmarcar,
  en «Mis datos».
- `boveda/Solapamientos.tsx` — bloque en «Mis seguros», solo si hay ≥1 (con cero no se pinta nada).
- `boveda/carta/[id]` — la carta de una póliza DECLARADA (identidad en el `where`; 404 nunca 403),
  con plazo, huecos declarados, copiar/imprimir/`mailto:` sin destinatario, y la alternativa
  «quédate donde estás y que la llevemos nosotros» (enlace a `/cambiar-de-correduria`).
- `legal/privacidad` — fila nueva (6.1.a) + nota reescrita; `VERSION_TEXTOS_LEGALES` → `2026-09-v5`
  (obliga a re-acreditar `lds_art19` a la siguiente entrada: es lo correcto, la política cambió).
- Cepo raíz `regression-portal-consentimiento.test.ts` ampliado: `comercial` solo se escribe desde su
  ruta; la casilla no nace marcada; la política lo declara.

### `apps/asegura-web`
- `/gestor-de-seguros` — landing de intención («organizar mis seguros en un solo sitio»), copy en
  `lib/gestor.ts` con cepo propio (`gestor.test.ts`: `revisarCopy`, sin promesas que el portal no
  cumple, SERP, normas). JSON-LD `SoftwareApplication` gratuito + FAQ + migas. En NAV (pie), sitemap
  (0.9) y enlazada desde la portada.
- `components/CalculadoraVencimientos.tsx` + `lib/calculadora-vencimientos.ts` — widget sin
  registro: vencimiento − 30 días por línea, resumen «N con la fecha de decisión en 90 días», CTA al
  portal. No guarda ni manda nada.
- Artículo `como-dar-de-baja-un-seguro-a-tiempo` (art. 22 LCS, `base` declarada) con el campo nuevo
  `Articulo.cta` (pintado entre el cuerpo y las FAQ; `href: 'PORTAL'` → `PORTAL_URL`).
- `lib/companias-baja.ts` — canales de baja de Mapfre, Allianz, Occident, Reale y Generali con sus
  URL oficiales, **todo `verificado: false`**: la red del contenedor bloquea los cinco dominios y lo
  que hay son extractos de buscador. `companias-baja.test.ts` impide que un email/domicilio sin
  verificar aparezca en cualquier artículo o página.
- Mapa de consultas (`keywords.md` §2) + `CONSULTAS` de plataforma: dos consultas nuevas.

## Lo que queda, y de quién depende

1. **Encender el aviso de vencimiento** (`ASEGURA_AVISOS_ACTIVOS=1` en `central-asegura`, tras contar
   en ensayo ≤112). Sin esto la landing dice «te lo enseña», no «te avisamos». **Alberto.**
2. **Verificar los cinco canales de baja** abriendo las URL de `companias-baja.ts` (10 min por
   compañía) y poner `verificado: true` + fecha. Entonces se escriben los artículos por compañía CON
   datos. **Alberto o una sesión con red a esos dominios.**
3. **Cambio de mediador automatizado** (idea H, `@central/core-firma`): hoy la carta enlaza a la
   explicación; el trámite firmado es un spec aparte con OK de Alberto.
4. Medir en GSC las dos consultas nuevas antes de escribir variantes de la landing.
