// Fallback nativo da camada de roteiro. O globo 3D é WebGL sobre canvas de
// browser e no iOS/Android a GlobeScreen cai na lista de países — não há mapa
// para plotar o roteiro. A implementação real vive em PlanRouteLayer.web.js.
//
// Mesma assinatura de props, para a tela não precisar saber em qual plataforma
// está.
export default function PlanRouteLayer({
  map = null,
  points = undefined,
  planId = undefined,
  selectedDay = null,
}) {
  return null;
}
