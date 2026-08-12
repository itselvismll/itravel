// Fallback nativo: o globo MapLibre só existe no web nesta fase da migração.
// A implementação real vive em CountryFillLayer.web.js.
export default function CountryFillLayer({
  map = null,
  geoData = null,
  visited = undefined,
  wishlist = undefined,
  onSelectCountry = undefined,
}) {
  return null;
}
