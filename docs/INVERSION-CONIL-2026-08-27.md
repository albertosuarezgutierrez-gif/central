# Conil de la Frontera — curva de temporada medida (27/08/2026)

> Medición REAL con el conector de Booking.com, hecha para probar de punta a punta el motor de
> underwriting (`apps/plataforma/lib/inversion/*`). Se deja escrita para que los números del spec y
> del PR **se puedan re-derivar**, no haya que fiarse de un resumen.

**Método.** Una búsqueda por mes: apartamentos, `currency: EUR`, `user_country_code: es`,
**4 adultos**, ventana de **2 noches** en un fin de semana a mitad de mes. De cada resultado se toma
`price.book` —que es el **TOTAL de la estancia**, no el precio por noche— se divide entre 2 y se
saca la **mediana** de los 10 comparables que devuelve la búsqueda.

## La curva

| Mes | Ventana medida | Comparables | ADR mediano (€/noche, precio guest) |
|---|---|---|---|
| Ene 2027 | 15–17 | 10 | 85,57€ |
| Feb 2027 | 12–14 | 10 | 117,40€ |
| Mar 2027 | 12–14 | 10 | **84,36€** ← valle |
| Abr 2027 | 09–11 | 10 | 113,83€ |
| May 2027 | 14–16 | 10 | 125,28€ |
| Jun 2027 | 11–13 | 10 | 207,06€ |
| Jul 2027 | 09–11 | 10 | 412,58€ |
| Ago 2027 | 13–15 | 10 | **488,50€** ← pico |
| Sep 2026 | 11–13 | 10 | 188,95€ |
| Oct 2026 | 09–11 | 10 | 106,32€ |
| Nov 2026 | 13–15 | 10 | 92,24€ |
| Dic 2026 | 11–13 | 10 | 86,80€ |

**Pico / valle = 5,79×.** Seis meses del año (nov–abr) se mueven entre 84€ y 118€; dos (jul–ago)
entre 412€ y 488€. Tarificar o valorar un VUT de playa con una media anual es inventarse el negocio.

## Mercado de aforo grande (misma plaza, otro tamaño)

Ventana 28–30 ago 2026, apartamentos + casas + villas:

| Aforo | Comparables | Mediana €/noche | €/plaza/noche |
|---|---|---|---|
| 4 plazas | 10 | 332,50€ | 83,13€ |
| 10 plazas | 3 | 665,00€ | 66,50€ |

El mercado grande es **más fino pero más barato por plaza**. Por eso el motor calcula y compara
**siempre** los dos escenarios, entero y segregado, en vez de dar uno por bueno.

## Lo que estas cifras NO son

- **No son ocupación.** Booking publica precio y disponibilidad, no ocupación. Para estimarla haría
  falta medir además el universo de comparables del municipio y calcular la saturación; no se hizo,
  así que el proxy va a `null` y cualquier ingreso calculado con estos ADR descansa sobre una
  ocupación **declarada como supuesto**.
- **No son un censo.** Son los 10 comparables que devuelve una página de resultados por ventana, no
  toda la oferta de Conil.
- **Una sola ventana por mes.** Dentro de agosto hay diferencias grandes: el 28–30 de agosto de 2026
  (fin de temporada, a un día vista) dio 332,50€ y el 13–15 de agosto de 2027 (pleno pico) 488,50€.
  Un mes no es un número.
- **Hay outliers y la mediana los absorbe:** un comparable pedía 4.020€ por dos noches en julio y en
  agosto (2.010€/noche). Con media aritmética ese solo anuncio movía el mes entero.

## Prueba de extremo a extremo

Con esta curva se corrieron dos análisis completos por el motor:

1. **El inmueble tal como está hoy** (sin precio, sin licencia verificada) → `no_calculable`,
   enumerando lo que falta: licencia VUT · nº de Registro Único · precio. Ningún yield en pantalla.
2. **Con supuestos declarados** (precio inventado, ocupación asumida al 55%) → cifras completas de
   los dos escenarios, con el aviso «⚠️ La ocupación NO está medida: 12 de 12 meses usan la
   ocupación supuesta» dentro del propio veredicto.

Esa segunda pasada destapó **dos fallos de honestidad en los mensajes**, ya corregidos y con test:
el veredicto citaba el *yield neto* junto al listón cuando lo que de verdad comparaba era el
*cash-on-cash* (producía frases falsas del tipo «8,27% … bate el listón de 9,00%»), y decía «con el
año entero medido» cuando lo medido era el ADR y la ocupación era un supuesto.
