// Fallback nativo: os markers do MapLibre são DOM, então no iOS/Android não há
// o que montar. A implementação real vive em CountryBadgeMarkers.web.js.
export default function CountryBadgeMarkers({
  map = null,
  countries = [],
  onSelect = undefined,
}) {
  return null;
}
