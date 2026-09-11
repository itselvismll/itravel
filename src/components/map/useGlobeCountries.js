// Fonte de dados dos badges do globo: o mundo inteiro, com o status de cada país.
//
// O GeoJSON é o mesmo do geoService, compartilhado com o resto do app (faz
// cache do fetch), então abrir o globo depois do mapa não custa uma segunda
// requisição.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCurrentUser, getVisitedCountries } from '../../services/supabase';
import { getWishlist } from '../../services/socialService';
import { loadWorldCountries } from '../../data/worldGeoData';
import { getAlpha3, getCountryNamePtByCode } from '../../utils/countryUtils';
import { getGeoCountryAlpha3, getGeoCountryName } from '../../utils/geo-country-utils';
import { buildCountryAnchors } from './countryCentroids';
import { buildGlobeCountries, expandUkNations, statusOf, toAlpha3Set } from './countryStatus';

/**
 * Nome em português de cada código, a partir do nome em inglês do GeoJSON.
 *
 * O caminho normal é o Intl.DisplayNames traduzir o alpha-2, e para isso o nome
 * do dataset nem seria preciso. Ele existe pelas nações do Reino Unido:
 * 'GB-ENG' não é um alpha-2, o Intl não sabe traduzir, e sem o "England" do
 * GeoJSON o badge mostraria o código cru em vez de "Inglaterra".
 */
const buildNameIndex = (geoData) => {
  const names = new Map();
  for (const feature of geoData?.features ?? []) {
    const code = getGeoCountryAlpha3(feature);
    if (code) names.set(code, getGeoCountryName(feature));
  }
  return names;
};

/**
 * Todos os países do mundo prontos para virar badge.
 *
 * As marcações do usuário chegam depois das âncoras (uma é rede, a outra é
 * banco), e cada parte entra assim que fica pronta: o globo já mostra o mundo
 * inteiro em pill enquanto visitados e wishlist ainda estão carregando, e os
 * badges promovidos aparecem quando a resposta chega.
 *
 * DE ONDE VÊM AS ÂNCORAS, E POR QUE ISSO É UMA OPÇÃO
 *
 * No web, daqui mesmo: o hook busca o GeoJSON e calcula os centroides.
 *
 * No nativo, não. Lá o globo roda dentro de uma WebView (NativeGlobe.dom.js), que
 * é um contexto de JS separado — o cache de módulo do geoService não atravessa a
 * ponte. Com `loadGeometry` ligado dos dois lados, o GeoJSON era baixado e
 * processado DUAS VEZES por sessão, em dois engines diferentes (Hermes e o da
 * WebView), e o lado React Native pagava os centroides em d3 sem ter o que fazer
 * com a geometria: ele só precisa da lista de países para a busca e a contagem.
 *
 * Então no nativo a tela passa `loadGeometry: false`, a WebView calcula as
 * âncoras uma vez e devolve pela ponte só `{ code, name, lat, lng, area }` — os
 * ~238 objetos que interessam, e não os 38 mil vértices que não interessam.
 * `adoptCountryAnchors` é a porta de entrada dessa lista.
 *
 * O STATUS é recalculado deste lado nos dois casos, a partir de `visited` e
 * `wishlist`, que moram aqui. É o que mantém a marcação instantânea: marcar um
 * país no modal promove o badge sem uma volta pela ponte nem pelo banco.
 *
 * @param {{ loadGeometry?: boolean }} [options]
 * @returns {{
 *   countries: Array<{ code: string, name: string, lat: number, lng: number, area: number, status: string }>,
 *   geoData: { features?: any[] } | null,
 *   visited: Set<string>,
 *   wishlist: Set<string>,
 *   user: any,
 *   applyVisitedChange: (code: string, isVisited: boolean) => void,
 *   applyWishlistChange: (code: string, inWishlist: boolean) => void,
 *   adoptCountryAnchors: (list: Array<{ code: string, name: string, lat: number, lng: number, area: number }>) => void,
 *   loading: boolean,
 *   error: string | null,
 * }}
 */
export default function useGlobeCountries({ loadGeometry = true } = {}) {
  const [anchors, setAnchors] = useState(null);
  // Lista pronta vinda de fora (a WebView do nativo). Alternativa a `anchors`,
  // nunca as duas ao mesmo tempo — ver o comentário do cabeçalho.
  const [adoptedAnchors, setAdoptedAnchors] = useState(null);
  // O mesmo GeoJSON alimenta duas coisas: as âncoras dos badges e a geometria da
  // fill layer que pinta o território.
  const [geoData, setGeoData] = useState(null);
  const [visited, setVisited] = useState(() => new Set());
  const [wishlist, setWishlist] = useState(() => new Set());
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // No nativo quem carrega o GeoJSON é a WebView, e só ela. Ver o cabeçalho.
    if (!loadGeometry) return undefined;

    let cancelled = false;

    loadWorldCountries()
      .then((geoData) => {
        if (cancelled) return;
        if (!geoData) {
          setError('Não foi possível carregar os países do mapa');
          return;
        }
        setGeoData(geoData);
        setAnchors(buildCountryAnchors(geoData));
      })
      .catch((cause) => {
        if (!cancelled) setError(cause?.message || 'Não foi possível carregar os países do mapa');
      });

    return () => {
      cancelled = true;
    };
  }, [loadGeometry]);

  useEffect(() => {
    let cancelled = false;

    // Visitante sem login continua vendo o mundo todo, só que sem destaque
    // nenhum — daí a falha aqui não virar erro de tela.
    (async () => {
      const currentUser = await getCurrentUser();
      if (cancelled) return;
      setUser(currentUser);
      if (!currentUser) return;

      const [visitedResult, wishlistResult] = await Promise.all([
        getVisitedCountries(currentUser.id),
        getWishlist(currentUser.id),
      ]);
      if (cancelled) return;

      // expandUkNations: quem marcou "Reino Unido" antes de a ilha virar 4
      // nações continua vendo os 4 territórios pintados.
      if (visitedResult?.success) setVisited(expandUkNations(toAlpha3Set(visitedResult.data)));
      if (wishlistResult?.success) setWishlist(expandUkNations(toAlpha3Set(wishlistResult.data)));
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Recebe a lista de âncoras calculada fora daqui (a WebView do nativo).
   *
   * Guarda só a parte geográfica; o status é aplicado no `countries` abaixo, com
   * os conjuntos que vivem deste lado. A lista chega uma vez por sessão, quando o
   * GeoJSON termina de carregar lá dentro.
   */
  const adoptCountryAnchors = useCallback((list) => {
    const next = Array.isArray(list) && list.length ? list : null;

    setAdoptedAnchors((previous) => {
      // Segunda trava contra o reenvio pela ponte (a primeira está no
      // NativeGlobe). Adotar um array novo com o mesmo conteúdo recalcularia
      // `countries`, e com ele todo o resto que depende dele — de graça.
      if (previous?.length === next?.length) return previous;
      return next;
    });
  }, []);

  const countries = useMemo(() => {
    // Caminho do nativo: a lista já vem com código, nome e coordenada prontos —
    // falta só cruzar com as marcações, que é o que muda quando o usuário
    // marca um país.
    if (adoptedAnchors) {
      return adoptedAnchors.map((country) => ({
        ...country,
        status: statusOf(country.code, visited, wishlist),
      }));
    }

    if (!anchors) return [];

    const names = buildNameIndex(geoData);
    const nameOf = (code) => getCountryNamePtByCode(code, names.get(code) || code);

    return buildGlobeCountries(anchors, { visited, wishlist, nameOf });
  }, [adoptedAnchors, anchors, geoData, visited, wishlist]);

  // Marcar um país no modal precisa refletir no globo na hora — território
  // repintado e badge promovido — sem esperar uma nova ida ao banco. O modal
  // devolve alpha-2 para visitado e alpha-3 para wishlist (é o que cada tabela
  // guarda); aqui tudo vira alpha-3, que é a moeda das âncoras.
  const applyChange = useCallback((setCodes, rawCode, present) => {
    const alpha3 = rawCode ? getAlpha3(rawCode)?.toUpperCase() : null;
    if (!alpha3) return;

    setCodes((previous) => {
      if (previous.has(alpha3) === present) return previous;
      const next = new Set(previous);
      if (present) next.add(alpha3);
      else next.delete(alpha3);
      return next;
    });
  }, []);

  const applyVisitedChange = useCallback(
    (code, isVisited) => applyChange(setVisited, code, isVisited),
    [applyChange]
  );

  const applyWishlistChange = useCallback(
    (code, inWishlist) => applyChange(setWishlist, code, inWishlist),
    [applyChange]
  );

  // `geoData`, `visited` e `wishlist` saem daqui porque a fill layer precisa dos
  // três: geometria para desenhar e os conjuntos para colorir. `countries` já é
  // o cruzamento pronto dos mesmos dados, só que no formato do badge.
  return {
    countries,
    geoData,
    visited,
    wishlist,
    user,
    applyVisitedChange,
    applyWishlistChange,
    adoptCountryAnchors,
    // Carregado é ter a lista de países, venha ela de onde vier: das âncoras
    // calculadas aqui (web) ou das adotadas da WebView (nativo).
    loading: !anchors && !adoptedAnchors && !error,
    error,
  };
}
