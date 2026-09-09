// O globo real do app como cenário dos slides de boas-vindas.
//
// É o MESMO MapLibre em projeção globe da tela de Mapa — não uma ilustração —,
// só que sem interação e com a câmera dirigida pelo slide atual. É o produto se
// apresentando: o usuário vê a esfera de satélite e os países pintando de roxo
// antes mesmo de tocar em nada.
//
// Uma única instância atravessa os três slides: recriar o mapa a cada slide
// custaria uma tela de carregamento por passo e quebraria a continuidade.
import React, { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, AttributionControl, config as maplibreConfig } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import {
  loadGlobeStyle,
  GLOBE_SPACE_BACKGROUND,
  GLOBE_SKY,
  SATELLITE_IMAGERY_ATTRIBUTION,
  preconnectToTileHosts,
  collapseAttributionOnce,
} from '../map/globeConfig';
import { localizeMapLabels } from '../map/styleLocalization';
import { STARFIELD_BACKGROUND_STYLE } from '../map/starfield';
import {
  attachCountryLayers,
  buildCountryFillData,
  isStyleReady,
  repaintCountryLayers,
} from '../map/countryFill';
import { loadWorldCountries } from '../../data/worldGeoData';

maplibreConfig.WORKER_URL = '/maplibre/maplibre-gl-worker.mjs';
preconnectToTileHosts();

const FADE_MS = 700;

// Graus por segundo da rotação ociosa. Devagar de propósito: o globo é pano de
// fundo do texto, não a animação principal.
const SPIN_DEGREES_PER_SECOND = 3.2;

/**
 * Câmera e países pintados de cada slide.
 *
 * Os países existem para o slide 1 mostrar o "mapa ganhando cor" e o slide 3
 * mostrar a diferença entre visitado (roxo) e wishlist (branco) — a mesma
 * legenda visual que o app usa de verdade.
 */
/** @type {Array<{ center: [number, number], zoom: number, visited: string[], wishlist: string[] }>} */
export const SLIDE_SCENES = [
  { center: [-30, 12], zoom: 1.45, visited: ['BRA', 'PRT', 'ESP', 'ARG'], wishlist: [] },
  {
    center: [10, 38],
    zoom: 1.9,
    visited: ['BRA', 'PRT', 'ESP', 'ARG', 'ITA', 'FRA', 'MAR'],
    wishlist: [],
  },
  {
    center: [70, 22],
    zoom: 1.6,
    visited: ['BRA', 'PRT', 'ESP', 'ARG', 'ITA', 'FRA', 'MAR'],
    wishlist: ['JPN', 'THA', 'IND', 'AUS'],
  },
];

/**
 * @param {{ slideIndex?: number, style?: any }} props
 */
export default function OnboardingGlobe({ slideIndex = 0, style = undefined }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [geoData, setGeoData] = useState(null);

  // O mapa passou a nascer DEPOIS de um fetch (a style é montada em
  // loadGlobeStyle), então `mapRef.current` não está mais preenchido na primeira
  // render. Este estado é o que avisa o efeito das camadas de país de que já há
  // mapa: uma ref sozinha não dispara re-render, e sem ele o onboarding perderia
  // os países pintados sempre que a style demorasse mais que o GeoJSON.
  const [mapCreated, setMapCreated] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const scene = SLIDE_SCENES[0];

    // A style chega por fetch (a source de satélite é trocada dentro dela — ver
    // loadGlobeStyle), então o mapa nasce assíncrono: a limpeza pode rodar antes
    // da style chegar, e aí só há uma criação para cancelar.
    let cancelled = false;
    /** @type {MapLibreMap | null} */
    let map = null;
    let releaseAttribution = () => {};

    const handleStyleLoad = () => {
      map.setProjection({ type: 'globe' });
      map.setSky(GLOBE_SKY);
      localizeMapLabels(map);
    };
    const handleLoad = () => setReady(true);
    // Tile que falha não pode prender o fade: melhor o globo incompleto do que
    // um retângulo vazio atrás do texto. Vale também para a style que não vem: o
    // onboarding segue sem o cenário em vez de travar no fade.
    const handleError = () => setReady(true);

    loadGlobeStyle().then((globeStyle) => {
      if (cancelled || !containerRef.current) return;

      map = new MapLibreMap({
        container: containerRef.current,
        style: globeStyle,
        center: scene.center,
        zoom: scene.zoom,
        // Cenário, não mapa: nenhum gesto deve competir com o swipe dos slides.
        interactive: false,
        attributionControl: false,
      });
      mapRef.current = map;
      setMapCreated(true);

      // A imagem aqui é a mesma do Mapbox da tela de Mapa, e o crédito é
      // obrigatório mesmo num globo decorativo. Recolhido, ele é só o ⓘ no
      // canto — não disputa espaço com o texto dos slides.
      map.addControl(
        new AttributionControl({
          compact: true,
          customAttribution: SATELLITE_IMAGERY_ATTRIBUTION,
        }),
        'bottom-left'
      );
      releaseAttribution = collapseAttributionOnce(map);

      map.on('style.load', handleStyleLoad);
      map.on('load', handleLoad);
      map.on('error', handleError);
    }, handleError);

    return () => {
      cancelled = true;
      if (!map) return;
      map.off('style.load', handleStyleLoad);
      map.off('load', handleLoad);
      map.off('error', handleError);
      releaseAttribution();
      map.remove();
      map = null;
      mapRef.current = null;
      setMapCreated(false);
      setReady(false);
    };
  }, []);

  // O GeoJSON do mundo é o mesmo do resto do app e tem cache no geoService, então
  // carregá-lo aqui também deixa a tela de Mapa pronta quando o onboarding acaba.
  useEffect(() => {
    let cancelled = false;
    loadWorldCountries().then((data) => {
      if (!cancelled && data) setGeoData(data);
    });
    return () => { cancelled = true; };
  }, []);

  // Monta as layers de território assim que a geometria E o mapa existem — as
  // duas coisas chegam por caminhos assíncronos independentes (o GeoJSON e a
  // style), e qualquer uma pode ganhar a corrida.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geoData) return undefined;

    const data = buildCountryFillData(geoData);
    const scene = SLIDE_SCENES[slideIndex] ?? SLIDE_SCENES[0];
    const attach = () => attachCountryLayers(map, {
      data,
      visited: new Set(scene.visited),
      wishlist: new Set(scene.wishlist),
    });

    if (!isStyleReady(map)) map.on('style.load', attach);
    else attach();

    return () => { map.off('style.load', attach); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a cena entra só na montagem; a troca por slide é o efeito abaixo
  }, [geoData, mapCreated]);

  // Troca de slide: repinta os países e leva a câmera para a região da cena.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const scene = SLIDE_SCENES[slideIndex] ?? SLIDE_SCENES[0];

    if (geoData && isStyleReady(map)) {
      repaintCountryLayers(map, {
        visited: new Set(scene.visited),
        wishlist: new Set(scene.wishlist),
      });
    }

    map.easeTo({
      center: scene.center,
      zoom: scene.zoom,
      duration: 1600,
      essential: true,
    });
  }, [slideIndex, ready, geoData]);

  // Rotação ociosa. Ela é retomada por frame a partir do centro ATUAL, então
  // convive com o easeTo da troca de slide sem brigar com ele: enquanto a câmera
  // está em movimento a rotação pausa, e volta quando ele termina.
  useEffect(() => {
    if (!ready) return undefined;
    if (typeof window === 'undefined') return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;

    let frame = 0;
    let previous = performance.now();

    const spin = (now) => {
      const map = mapRef.current;
      const elapsed = (now - previous) / 1000;
      previous = now;

      if (map && !map.isMoving()) {
        const center = map.getCenter();
        map.setCenter([center.lng + SPIN_DEGREES_PER_SECOND * elapsed, center.lat]);
      }
      frame = window.requestAnimationFrame(spin);
    };

    frame = window.requestAnimationFrame(spin);
    return () => window.cancelAnimationFrame(frame);
  }, [ready]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        backgroundColor: GLOBE_SPACE_BACKGROUND,
        // Na projeção globe o canvas fica transparente fora da esfera, então as
        // estrelas ficam no container — atrás do globo, como na tela de Mapa.
        ...STARFIELD_BACKGROUND_STYLE,
        ...style,
      }}
      aria-hidden="true"
    >
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          opacity: ready ? 1 : 0,
          transition: `opacity ${FADE_MS}ms ease-out`,
        }}
      />
    </div>
  );
}
