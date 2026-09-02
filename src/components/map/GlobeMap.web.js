// Globo 3D (MapLibre GL JS) — implementação web.
// A projeção "globe" existe a partir do MapLibre GL JS v5; aqui usamos a v6.
// O pacote maplibre-gl é ESM-only ("exports" só expõe "import"), por isso este
// arquivo usa a extensão .web.js com import estático: o bundle nativo nunca o vê
// (o Metro resolve GlobeMap.js no native).
import React, { useEffect, useRef, useState } from 'react';
// A v6 do maplibre-gl não tem default export — só nomeados.
import {
  Map as MapLibreMap,
  AttributionControl,
  GlobeControl,
  config as maplibreConfig,
} from 'maplibre-gl';
import { Image } from 'react-native';
import 'maplibre-gl/dist/maplibre-gl.css';

// O símbolo passa pelo Image do react-native, e não por um <img> com a URL
// resolvida na mão: `Image.resolveAssetSource` não existe no react-native-web, e
// o formato que o `require` devolve para um asset varia entre plataforma e
// bundler. O componente é quem sabe lidar com isso — é como Logo.js e o resto do
// app já carregam este mesmo arquivo.
const JOURNI_SYMBOL = require('../../../assets/journi_simbolo.png');

import {
  GLOBE_STYLE_URL,
  GLOBE_MAX_ZOOM,
  GLOBE_INITIAL_VIEW,
  GLOBE_SPACE_BACKGROUND,
  GLOBE_SKY,
  SATELLITE_IMAGERY_ATTRIBUTION,
  preconnectToStadia,
  collapseAttributionOnce,
} from './globeConfig';
import { localizeMapLabels } from './styleLocalization';
import { TAB_BAR_CLEARANCE } from '../../utils/tabBarLayout';
import { STARFIELD_BACKGROUND_STYLE } from './starfield';

// O maplibre descobre o worker por import.meta.url, que não sobrevive ao bundle do
// Metro. Apontamos explicitamente para a cópia servida a partir de public/maplibre
// (gerada pelo postinstall em scripts/copy-maplibre-worker.cjs).
// Em um DOM Component nativo, o documento é servido por uma URL interna do
// Expo. EXPO_BASE_URL aponta para os assets públicos copiados para o app; no web
// continua sendo a raiz normal. Sem esse prefixo, o worker seria procurado em
// `file:///maplibre/...` no release Android e o globo não iniciaria.
const publicBaseUrl = process.env.EXPO_BASE_URL || '/';
maplibreConfig.WORKER_URL = `${publicBaseUrl.replace(/\/?$/, '/')}maplibre/maplibre-gl-worker.mjs`;

// No import, não na montagem: quando o componente monta, o React já gastou o
// tempo de render que a conexão poderia ter usado.
preconnectToStadia();

// Duração do fade do globo entrando em cena. Curto o bastante para não parecer
// lentidão, longo o bastante para não ler como "piscada".
const FADE_MS = 450;

// A animação do indicador vive numa tag <style> própria: keyframes não existem
// em estilo inline, e este é o único lugar do componente que precisa deles.
const LOADING_KEYFRAMES = `
@keyframes journi-globe-pulse {
  0%, 100% { opacity: 0.25; transform: scale(0.94); }
  50%      { opacity: 0.7;  transform: scale(1.06); }
}
@keyframes journi-globe-sweep {
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .journi-globe-halo, .journi-globe-sweep { animation: none !important; }
}
`;

// Os controles do MapLibre no rodapé (o crédito compacto e o botão globo ↔
// mercator) são DOM do próprio MapLibre, posicionados pelo CSS dele em
// `bottom: 0`. A tab bar flutua por cima daquele canto e engolia os dois — o
// botão do globo ficava clicável só pela metade.
//
// Precisa ser CSS, e não estilo inline: os elementos nascem dentro do MapLibre,
// depois da montagem, e o React nunca chega a renderizá-los.
const MAP_CONTROL_CLEARANCE_CSS = `
.maplibregl-ctrl-bottom-left,
.maplibregl-ctrl-bottom-right {
  margin-bottom: ${TAB_BAR_CLEARANCE}px;
}
`;

/**
 * Tela de carregamento do globo.
 *
 * Fundo #0D1326 com o mesmo campo de estrelas do mapa, para a transição para o
 * globo ser só a esfera surgindo — e não uma troca de cenário. O símbolo do
 * Journi fica no centro, com um halo pulsando e um anel girando devagar: dá
 * sinal de progresso sem virar spinner genérico.
 */
function GlobeLoadingOverlay() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0D1326',
        ...STARFIELD_BACKGROUND_STYLE,
        // O overlay some junto com o fade do globo entrando.
        transition: `opacity ${FADE_MS}ms ease-out`,
        zIndex: 2,
      }}
      role="status"
      aria-label="Carregando o globo"
    >
      <style>{LOADING_KEYFRAMES}</style>

      <div style={{ position: 'relative', width: 132, height: 132 }}>
        {/* Halo roxo pulsando atrás do símbolo. */}
        <div
          className="journi-globe-halo"
          style={{
            position: 'absolute',
            inset: 12,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(108,43,217,0.55), rgba(108,43,217,0) 70%)',
            animation: 'journi-globe-pulse 1.8s ease-in-out infinite',
          }}
        />

        {/* Anel com um arco claro: a volta lenta é o indicador de progresso. */}
        <div
          className="journi-globe-sweep"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.08)',
            borderTopColor: 'rgba(0,209,193,0.85)',
            animation: 'journi-globe-sweep 1.4s linear infinite',
          }}
        />

        <Image
          source={JOURNI_SYMBOL}
          resizeMode="contain"
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 52,
            height: 52,
            marginLeft: -26,
            marginTop: -26,
          }}
        />
      </div>
    </div>
  );
}

/**
 * Casca do mapa: cria a instância do MapLibre em projeção globe e entrega ela
 * via onMapReady assim que a style termina de carregar. Todas as camadas
 * (países, pins, clusters) serão penduradas nessa instância nas próximas fases.
 */
export default function GlobeMap({
  onMapReady,
  onError,
  showGlobeControl = true,
  performanceMode = false,
  style,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [failure, setFailure] = useState(null);

  // `ready` liga o fade do globo e desliga o overlay. Vem do evento 'load' do
  // MapLibre, não do 'style.load': o 'style.load' dispara quando a style foi
  // PARSEADA, com a esfera ainda sem textura nenhuma — mostrar aí é exatamente
  // a piscada que queremos evitar. O 'load' espera o primeiro quadro completo.
  const [ready, setReady] = useState(false);

  // Refs para os callbacks: assim o efeito de criação do mapa roda uma única vez,
  // sem recriar o globo quando o pai re-renderiza com funções novas.
  const onMapReadyRef = useRef(onMapReady);
  const onErrorRef = useRef(onError);
  onMapReadyRef.current = onMapReady;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: GLOBE_STYLE_URL,
      center: GLOBE_INITIAL_VIEW.center,
      zoom: GLOBE_INITIAL_VIEW.zoom,
      minZoom: GLOBE_INITIAL_VIEW.minZoom,
      maxZoom: GLOBE_MAX_ZOOM,
      // O globo nativo roda em WebView. Renderizar o canvas no DPR físico de
      // aparelhos Android (frequentemente 2x ou 3x) multiplica a quantidade de
      // pixels sem trazer diferença perceptível nessa tela. O navegador normal
      // mantém a densidade original.
      pixelRatio: performanceMode ? 1 : undefined,
      maxTileCacheSize: performanceMode ? 48 : null,
      // Desligado aqui para adicionar o controle com a atribuição do provedor.
      attributionControl: false,
    });
    mapRef.current = map;

    map.addControl(
      new AttributionControl({
        compact: true,
        customAttribution: SATELLITE_IMAGERY_ATTRIBUTION,
      }),
      'bottom-left'
    );
    // O `compact: true` acima define o FORMATO (ícone ⓘ com o painel atrás);
    // quem define o ESTADO INICIAL recolhido é esta chamada — o MapLibre não tem
    // opção para isso e abre o painel sozinho. Ver collapseAttributionOnce.
    const releaseAttribution = collapseAttributionOnce(map);

    // Sem NavigationControl: os botões + / − são redundantes num app de toque
    // (scroll e pinça já dão zoom) e ficavam embaixo do pill de países visitados,
    // no canto inferior direito. Esse canto agora é só do pill.
    // O GlobeControl (globo ↔ mercator) fica no canto do crédito, empilhado
    // acima dele — é o único canto sem UI do app por cima.
    if (showGlobeControl) {
      map.addControl(new GlobeControl(), 'bottom-left');
    }

    const handleStyleLoad = () => {
      // setProjection só pode ser chamado depois que a style carregou.
      map.setProjection({ type: 'globe' });
      // Halo azul na borda da esfera.
      map.setSky(GLOBE_SKY);
      // Rótulos em português a partir dos campos multilíngues do OpenMapTiles.
      localizeMapLabels(map);
      onMapReadyRef.current?.(map);
    };

    const handleLoad = () => setReady(true);

    const handleError = (event) => {
      const message = event?.error?.message || 'Erro desconhecido ao carregar o mapa';
      setFailure(message);
      onErrorRef.current?.(event?.error || new Error(message));
      // Tile que falha não pode deixar o overlay preso para sempre: melhor
      // mostrar o globo incompleto com a mensagem de erro do que uma tela de
      // carregamento eterna.
      setReady(true);
    };

    map.on('style.load', handleStyleLoad);
    map.on('load', handleLoad);
    map.on('error', handleError);

    return () => {
      map.off('style.load', handleStyleLoad);
      map.off('load', handleLoad);
      map.off('error', handleError);
      releaseAttribution();
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [performanceMode, showGlobeControl]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        backgroundColor: GLOBE_SPACE_BACKGROUND,
        // As estrelas ficam no container, não no canvas: na projeção globe o
        // MapLibre deixa transparente tudo que está fora da esfera.
        ...STARFIELD_BACKGROUND_STYLE,
        ...style,
      }}
    >
      <style>{MAP_CONTROL_CLEARANCE_CSS}</style>

      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          // O globo entra em fade em vez de aparecer de estalo. `ready` só vira
          // true depois do primeiro quadro completo, então o que aparece já é a
          // esfera com textura, não o rascunho dela.
          opacity: ready ? 1 : 0,
          transition: `opacity ${FADE_MS}ms ease-out`,
        }}
      />

      {!ready && !failure && <GlobeLoadingOverlay />}
      {failure && (
        <div
          style={{
            position: 'absolute',
            left: 16,
            top: 16,
            maxWidth: 420,
            padding: '10px 14px',
            borderRadius: 12,
            background: 'rgba(13,19,38,0.92)',
            border: '1px solid rgba(255,77,109,0.6)',
            color: '#FF4D6D',
            fontFamily: 'Poppins_400Regular, system-ui, sans-serif',
            fontSize: 13,
          }}
        >
          {failure}
        </div>
      )}
    </div>
  );
}
