// Aplica a pintura de território no mapa: source de países + fill + contorno.
//
// Componente sem saída visual própria (devolve null) — ele existe para prender o
// ciclo de vida das layers ao ciclo de vida do React, do mesmo jeito que
// CountryBadgeMarkers faz com os markers.
//
// A divisão de trabalho: countryFill.js decide O QUE desenhar e sabe conversar
// com um mapa; aqui é só quando fazer isso.
import { useEffect, useMemo, useRef } from 'react';
import {
  attachCountryLayers,
  bindCountryClick,
  buildCountryFillData,
  detachCountryLayers,
  isStyleReady,
  repaintCountryLayers,
} from './countryFill';

// Assinatura estável de um Set de códigos, para o efeito de repintura só rodar
// quando o CONTEÚDO muda. O hook devolve um Set novo a cada resposta do banco.
const signatureOf = (codes) => [...(codes ?? [])].sort().join(',');

/**
 * @param {{
 *   map: import('maplibre-gl').Map | null,
 *   geoData: { features?: any[] } | null,
 *   visited?: Set<string>,
 *   wishlist?: Set<string>,
 *   onSelectCountry?: (alpha3: string) => void,
 * }} props
 */
export default function CountryFillLayer({ map, geoData, visited, wishlist, onSelectCountry }) {
  const data = useMemo(() => buildCountryFillData(geoData), [geoData]);

  // Ref para o callback: assim trocar a função no pai não desfaz e refaz os
  // listeners do mapa a cada render.
  const onSelectRef = useRef(onSelectCountry);
  onSelectRef.current = onSelectCountry;

  const visitedKey = signatureOf(visited);
  const wishlistKey = signatureOf(wishlist);

  // Cria source e layers, e refaz só quando a geometria muda (na prática, quando
  // o GeoJSON termina de carregar). Marcar um país NÃO passa por aqui — ver o
  // efeito de repintura abaixo.
  useEffect(() => {
    if (!map) return undefined;

    const attach = () => attachCountryLayers(map, { data, visited, wishlist });

    // A style pode ainda não estar parseada (mapa criado, style em voo) e volta
    // ao estado cru numa troca de style. Nos dois casos 'style.load' é o gatilho
    // para montar de novo; quando ela já está pronta, `attach` roda agora e o
    // listener nunca dispara.
    if (!isStyleReady(map)) map.on('style.load', attach);
    else attach();

    return () => {
      map.off('style.load', attach);
      detachCountryLayers(map);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- visited/wishlist entram só na montagem; a repintura é o efeito abaixo
  }, [map, data]);

  // Clique no território. Vive num efeito próprio porque o listener é da LAYER:
  // registrar antes dela existir não pega nada, e o `data` na dependência garante
  // que ele seja religado sempre que as layers forem remontadas.
  useEffect(() => {
    if (!map) return undefined;
    return bindCountryClick(map, (alpha3) => onSelectRef.current?.(alpha3));
  }, [map, data]);

  // Reatividade: marcar ou desmarcar um país troca só as expressions de cor. A
  // geometria já está no worker e não é reenviada — é a diferença entre repintar
  // e recarregar o mundo a cada clique.
  useEffect(() => {
    repaintCountryLayers(map, { visited, wishlist });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as chaves resumem os Sets
  }, [map, data, visitedKey, wishlistKey]);

  return null;
}
