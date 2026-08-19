'use dom';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import GlobeMap from './GlobeMap.web';
import CountryBadgeMarkers from './CountryBadgeMarkers.web';
import CountryFillLayer from './CountryFillLayer.web';
import { getWorldGeoData } from '../../services/geoService';

/**
 * Globo web executado dentro da WebView gerenciada pelo Expo no Android/iOS.
 *
 * O MapLibre Native ainda não oferece a projeção `globe` usada pela versão web.
 * Um DOM Component mantém a mesma renderização WebGL e deixa apenas a casca da
 * tela (busca, modal e tab bar) no React Native. Props cruzam a ponte somente em
 * formatos serializáveis; Map e Set são reconstruídos neste contexto.
 */
export default function NativeGlobe({
  countries = [],
  visitedCodes = [],
  wishlistCodes = [],
  focusCountry = null,
  onSelectCountry,
  onMapFailure,
  dom: _dom,
}) {
  const [map, setMap] = useState(null);
  const [geoData, setGeoData] = useState(null);

  const visited = useMemo(() => new Set(visitedCodes), [visitedCodes]);
  const wishlist = useMemo(() => new Set(wishlistCodes), [wishlistCodes]);
  const countriesByCode = useMemo(
    () => new Map(countries.map((country) => [country.code, country])),
    [countries]
  );

  useEffect(() => {
    let cancelled = false;

    getWorldGeoData()
      .then((data) => {
        if (!cancelled) setGeoData(data);
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
  root: {
    position: 'fixed',
    inset: 0,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: '#05070F',
  },
};
