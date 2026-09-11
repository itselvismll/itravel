'use dom';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GlobeMap from './GlobeMap.web';
import CountryBadgeMarkers from './CountryBadgeMarkers.web';
import CountryFillLayer from './CountryFillLayer.web';
import { getWorldGeoData } from '../../services/geoService';
import { buildCountryAnchors } from './countryCentroids';
import { statusOf } from './countryStatus';
import { getCountryNamePtByCode } from '../../utils/countryUtils';
import { getGeoCountryAlpha3, getGeoCountryName } from '../../utils/geo-country-utils';

/**
 * Globo web executado dentro da WebView gerenciada pelo Expo no Android/iOS.
 *
 * O MapLibre Native ainda não oferece a projeção `globe` usada pela versão web.
 * Um DOM Component mantém a mesma renderização WebGL e deixa apenas a casca da
 * tela (busca, modal e tab bar) no React Native. Props cruzam a ponte somente em
 * formatos serializáveis; Map e Set são reconstruídos neste contexto.
 *
 * ESTE LADO É O DONO DA GEOMETRIA.
 *
 * O GeoJSON é buscado e processado aqui, e só aqui. Antes a tela do React Native
 * fazia o mesmo trabalho em paralelo (useGlobeCountries com `loadGeometry`), e
 * como a WebView é outro contexto de JS, o cache de módulo do geoService não
 * cruzava a ponte: o mundo era baixado e parseado DUAS VEZES por sessão, em dois
 * engines diferentes.
 *
 * Agora a lista de países sai daqui pela ponte, por `onCountriesResolved`, em
 * ~238 objetos rasos — a tela usa isso para a busca e para a contagem, que é
 * tudo que ela precisava. A geometria não atravessa: mandar a FeatureCollection
 * pela ponte só trocaria o parse duplicado por um stringify + parse, que é pior.
 */
export default function NativeGlobe({
  visitedCodes = [],
  wishlistCodes = [],
  focusCountry = null,
  onSelectCountry,
  onCountriesResolved,
  onMapFailure,
  dom: _dom,
}) {
  const [map, setMap] = useState(null);
  const [geoData, setGeoData] = useState(null);
  const [anchors, setAnchors] = useState(null);

  const visited = useMemo(() => new Set(visitedCodes), [visitedCodes]);
  const wishlist = useMemo(() => new Set(wishlistCodes), [wishlistCodes]);

  // A lista dos badges, montada deste lado a partir das âncoras locais. O status
  // vem das marcações que chegam por prop, então marcar um país no modal continua
  // repintando o badge sem esperar nada.
  const countries = useMemo(() => {
    if (!anchors) return [];

    const names = new Map();
    for (const feature of geoData?.features ?? []) {
      const code = getGeoCountryAlpha3(feature);
      if (code) names.set(code, getGeoCountryName(feature));
    }

    return Object.entries(anchors).map(([code, anchor]) => ({
      code,
      name: getCountryNamePtByCode(code, names.get(code) || code),
      lat: anchor.lat,
      lng: anchor.lng,
      area: anchor.area,
      status: statusOf(code, visited, wishlist),
    }));
  }, [anchors, geoData, visited, wishlist]);

  const countriesByCode = useMemo(
    () => new Map(countries.map((country) => [country.code, country])),
    [countries]
  );

  useEffect(() => {
    let cancelled = false;

    getWorldGeoData()
      .then((data) => {
        if (cancelled) return;
        setGeoData(data);
        setAnchors(buildCountryAnchors(data));
      })
      .catch(async (error) => {
        if (!cancelled) {
          await onMapFailure?.(error?.message || 'Não foi possível carregar os países do mapa');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [onMapFailure]);

  // O envio acontece UMA vez por conjunto de âncoras, e este ref é o que garante
  // isso: `onCountriesResolved` é uma função que veio pela ponte e a identidade
  // dela não é estável entre renders. Sem a trava o efeito reenviaria a lista, o
  // outro lado adotaria um array novo, isso o faria renderizar de novo — e o
  // ciclo não fecharia sozinho.
  const sentAnchorsRef = useRef(null);

  // Entrega a lista para o lado React Native assim que ela existe.
  //
  // Sem o `status`: ele é derivado de visited/wishlist, que são a fonte da
  // verdade LÁ — mandar de volta uma cópia derivada daqui criaria dois donos do
  // mesmo dado, e o daqui chegaria sempre um passo atrasado. O que atravessa é
  // só a parte geográfica, que não muda.
  useEffect(() => {
    if (!countries.length || !onCountriesResolved) return;
    if (sentAnchorsRef.current === anchors) return;
    sentAnchorsRef.current = anchors;

    onCountriesResolved(
      countries.map(({ code, name, lat, lng, area }) => ({ code, name, lat, lng, area }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só as âncoras mudam a lista geográfica; o status não atravessa
  }, [anchors, onCountriesResolved]);

  useEffect(() => {
    if (!map || !focusCountry?.center) return;
    map.flyTo({ center: focusCountry.center, zoom: 4, duration: 1800 });
  }, [focusCountry, map]);

  const selectCountry = useCallback(
    async (country) => {
      if (country?.code) await onSelectCountry?.(country);
    },
    [onSelectCountry]
  );

  const selectCountryByCode = useCallback(
    async (code) => {
      const country = countriesByCode.get(code);
      if (country) await selectCountry(country);
    },
    [countriesByCode, selectCountry]
  );

  return (
    <div style={styles.root}>
      <style>{GLOBAL_CSS}</style>
      <GlobeMap
        onMapReady={setMap}
        onError={async (error) => {
          await onMapFailure?.(error?.message || 'Não foi possível carregar o globo');
        }}
        showGlobeControl={false}
        performanceMode
        style={undefined}
      />
      <CountryFillLayer
        map={map}
        geoData={geoData}
        visited={visited}
        wishlist={wishlist}
        onSelectCountry={selectCountryByCode}
      />
      <CountryBadgeMarkers map={map} countries={countries} onSelect={selectCountry} />
    </div>
  );
}

const GLOBAL_CSS = `
  html, body, #root {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: #05070F;
  }
  * { box-sizing: border-box; }
`;

const styles = {
  root: /** @type {import('react').CSSProperties} */ ({
    position: 'fixed',
    inset: 0,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: '#05070F',
  }),
};
