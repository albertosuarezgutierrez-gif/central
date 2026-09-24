# Calculadora de bonificación hipotecaria por seguro vinculado

**Fecha:** 07/09/2026
**App:** `apps/asegura-portal`
**Origen:** idea de Alberto — le pasó personalmente que, aun perdiendo la bonificación del tipo,
salía más barato contratar el seguro fuera del banco. Herramienta para que un cliente logueado
compare ambos caminos con sus propios números.

## Objetivo

Simulador de punto de equilibrio: ¿compensa mantener el seguro (hogar+vida) vinculado al banco
por la bonificación del tipo de interés, o sale más barato sacarlo y asumir el tipo sin
bonificar? Sirve en los dos sentidos — retener a un cliente propio al que el banco quiere
captar, y convencer a un cliente/prospecto cuyo seguro está hoy en el banco.

**No es** un tarificador ni una recomendación en firme (ver Legal/disclaimer). No calcula la
prima real de mercado: el usuario introduce las dos primas a comparar.

## Fuera de alcance

- Sin persistencia: la simulación no se guarda en BD, no hay tabla nueva.
- Sin proyección de amortización futura del capital ni de subidas de precio de las
  aseguradoras — cálculo estático con capital y cuota actuales (decisión explícita de Alberto,
  09/2026: ambos efectos son inciertos/no deterministas a futuro y se cancelan mal entre sí;
  se cubre con el disclaimer, no con más matemática).
- Sin tarificación automática ni llamada a compañías.

## Cálculo

Función pura en `packages/module-seguros-portal/src/calculo-bonificacion-hipoteca.ts`
(sin BD, sin red — mismo patrón que el resto del paquete: `acceso.ts`, `resumen-cartera.ts`).

Entrada:
- `capitalPendiente` (€)
- `diferencialTipoPP` (puntos porcentuales que se pierden al no bonificar, ej. 0.5)
- `primaAnualBanco` (€, hogar+vida vinculados)
- `primaAnualExterna` (€, hogar+vida fuera del banco)

Salida:
- `ahorroInteresesAnual` = `capitalPendiente * diferencialTipoPP / 100` (coste de NO bonificar)
- `diferenciaPrimaAnual` = `primaAnualBanco - primaAnualExterna`
- `netoAnual` = `diferenciaPrimaAnual - ahorroInteresesAnual` (positivo = compensa salir del banco)

Cálculo estático de un año, no acumulado a N años (evita implicar una proyección que no se
está haciendo). Test unitario cubriendo: diferencial 0, primas iguales, neto positivo y
negativo, capital 0.

## Precarga

La página es un server component que llama a `requireIdentidad()` (`lib/session.ts`) y a
`carteraDeIdentidad(identidadId)` (`lib/cartera-lectura.ts`, ya existente). Si el cliente tiene
una póliza viva de hogar o vida con Grupo ASegura, su prima anual real precarga
`primaAnualExterna` (editable). Si no tiene ninguna, el campo va vacío. `primaAnualBanco` va
siempre vacío — es el dato que el cliente trae de su banco.

## Pantalla

`apps/asegura-portal/app/(portal)/hipoteca/page.tsx` (server component) + un client component
para el formulario, dentro del layout `(portal)` existente (`NavPortal`).

- Formulario: capital pendiente, diferencial (%), las dos primas anuales.
- Resultado: desglose de los tres valores del cálculo + veredicto en una frase
  ("con estos números, mantener el seguro en el banco te compensa en X €/año" o al revés).
- Formato de dinero con `eur()` de `apps/asegura-portal/lib/dinero.ts` (ya existe, espejo del
  de `apps/asegura`).
- Responsive: formulario en una columna en móvil (regla global de responsive, ≥320px).

## CTA a presupuesto real

`asegura-portal` no tiene hoy ningún endpoint de lead — lo más parecido (`app/api/peticiones`)
es para pedir acceso a la póliza de un tercero, un mecanismo distinto. Se crea
`apps/asegura-portal/app/api/hipoteca/lead/route.ts`: reenvía a
`POST /api/publico/correduria/lead` de `apps/plataforma` (mismo canal que ya usa
`asegura-web` → Telegram), con el contacto tomado de la identidad YA logueada (no se le vuelve
a pedir nombre/email/teléfono) y una nota con los números calculados, para que Alberto tenga
contexto en el aviso.

## Legal / disclaimer

Debajo del resultado, texto fijo: *"Cálculo orientativo con los datos que has introducido. No
es una recomendación ni sustituye el análisis de tu correduría."* — evita que un simulador de
autoservicio se lea como una recomendación en firme, que en mediación de seguros (RDL 3/2020)
obligaría a análisis objetivo + IPID antes de recomendar. Mismo espíritu que
`apps/asegura-web/lib/ramos.test.ts`.

## Aislamiento y reglas del portal

Respeta `apps/asegura-portal/CLAUDE.md`: la lectura de cartera se filtra siempre por
`identidadId` de la sesión (nunca por un id de la URL), nunca se expone dato de la póliza de
un tercero, y el endpoint de lead no toca el rol `prisma_asegura_portal` para nada ajeno a leer
la identidad propia.

## Testing

- Unit test de `calculo-bonificacion-hipoteca.ts` (casos arriba).
- Test de que la página no rompe sin cartera previa (campo vacío, no `0`/error — regla de
  "dato que no hay ≠ dato que no se ha mirado").
- Verificación responsive con Playwright a 320-360-1024 si el formulario tiene varios campos
  en fila.
