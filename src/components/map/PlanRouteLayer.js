// Resolução de plataforma da camada de roteiro.
//
// ATENÇÃO AO QUE ISTO É E AO QUE NÃO É. No iOS/Android o roteiro É desenhado: o
// globo nativo é o mesmo MapLibre rodando dentro de um DOM Component
// (NativeGlobe.dom.js), e é ele quem monta PlanRouteLayer.web diretamente, do
// lado de dentro da WebView.
//
// Este arquivo cobre o caso em que alguém importar a camada do lado React Native,
// onde não existe instância de mapa para receber layers. Ele devolve null porque
// não há o que montar ali — e não porque o roteiro não exista no nativo.
//
// A implementação real vive em PlanRouteLayer.web.js. Mesma assinatura de props,
// para a tela não precisar saber em qual plataforma está.
export default function PlanRouteLayer({
  map = null,
  points = undefined,
  planId = undefined,
  selectedDay = null,
  countryCodes = undefined,
  nearbyArea = null,
  focusPlace = null,
  bottomInset = 0,
  onSelectStop = undefined,
  onSelectCluster = undefined,
  onDismiss = undefined,
}) {
  return null;
}
