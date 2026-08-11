// Prende um CountryBadge por país como Marker do MapLibre e resolve as colisões
// entre eles a cada movimento da câmera.
//
// O Marker aceita um elemento DOM pronto, e o CountryBadge é componente React
// Native (Web). A ponte é um portal: criamos um <div> vazio por país, damos ele
// ao MapLibre, e o React renderiza o badge lá dentro. Assim o marker segue a
// rotação/zoom do globo pelo próprio MapLibre e o badge continua sendo React —
// com o CountryFlag compartilhado, não uma cópia em HTML.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Marker } from 'maplibre-gl';
import CountryBadge, { COMPACT_BADGE_WIDTH, BADGE_HEIGHT } from './CountryBadge';
import { resolveBadgeModes, EXPANDED, COMPACT } from './badgeCollision';
import { badgePriority, isExpandable, renderedBadgeMode } from './countryStatus';
import { expandsEveryBadge, passesZoomFilter } from './featuredCountries';

// Enquanto o badge não foi medido no DOM, estimamos a largura pelo nome. Só vale
// para o primeiro quadro: no commit seguinte a medida real entra no lugar.
const estimateExpandedWidth = (name) => COMPACT_BADGE_WIDTH + 7 + name.length * 7;

// Margem para considerar um badge dentro da tela. Um pouco além da borda ainda
// conta, senão o badge trocaria de estado bem no momento de entrar em cena.
const VIEWPORT_MARGIN = 120;

// Ordem de empilhamento quando dois badges encostam: o nome escrito por cima do
// pill, senão um pill vizinho corta a palavra no meio. Os badges são todos
// iguais agora — a diferença de status vive no território pintado por baixo
// (countryFill.js), não aqui.
//
// Recebe o estado DESENHADO, não o que a colisão devolveu: um país não marcado
// volta como "expandido" com frequência (ele disputa com a largura de um pill),
// e usar esse número aqui daria a ele a camada de um badge escrito.
const zIndexFor = (mode) => String(mode === EXPANDED ? 2 : 1);

/**
 * Um país está atrás do globo?
 *
 * `isLocationOccluded` é a mesma checagem que o Marker do MapLibre usa para
 * esconder o que está do outro lado da esfera, mas está marcada como @internal.
 * Se sumir numa atualização, caímos no ângulo de grande círculo até o centro do
 * mapa: mais de 90° significa hemisfério de trás. A aproximação é levemente
 * permissiva na borda, e o pior caso é um badge da silhueta participar da
 * colisão sem precisar.
 */
const isBehindGlobe = (map, lngLat) => {
  const transform = /** @type {any} */ (map).transform;
  if (typeof transform?.isLocationOccluded === 'function') {
    return transform.isLocationOccluded(lngLat);
  }

  const center = map.getCenter();
  const toRad = Math.PI / 180;
  const cosAngle =
    Math.sin(lngLat.lat * toRad) * Math.sin(center.lat * toRad) +
    Math.cos(lngLat.lat * toRad) *
      Math.cos(center.lat * toRad) *
      Math.cos((lngLat.lng - center.lng) * toRad);
  return cosAngle < 0;
};

/**
 * Limpa a lista de países antes de virar marker.
 *
 * Duas coisas fazem um país "sumir" do globo antes mesmo de existir badge:
 * coordenada inválida (o marker vai para um ponto que nunca é visível) e código
 * repetido — dois portais com a mesma key do React, e um dos dois não renderiza.
 * Códigos repetidos aparecem naturalmente quando a lista de visitados vem de
 * várias viagens no mesmo país.
 */
const sanitize = (countries) => {
  const seen = new Set();
  const result = [];

  for (const country of countries ?? []) {
    if (!country?.code || seen.has(country.code)) continue;
    if (!Number.isFinite(country.lng) || !Number.isFinite(country.lat)) continue;

    seen.add(country.code);
    result.push(country);
  }

  return result;
};

/**
 * @param {{
 *   map: import('maplibre-gl').Map | null,
 *   countries: Array<{
 *     code: string,
 *     name: string,
 *     lat: number,
 *     lng: number,
 *     area?: number,
 *     status?: string,
 *   }>,
 *   onSelect?: (country: any) => void,
 * }} props
 */
export default function CountryBadgeMarkers({ map, countries, onSelect }) {
  const [entries, setEntries] = useState([]);
  const [modes, setModes] = useState({});

  // Códigos que o nível de zoom + viewport atual deixam em cena. Quem está fora
  // continua montado, só que com opacity 0 — é o que dá o fade e o que mantém a
  // largura já medida válida para quando o país voltar.
  const [shown, setShown] = useState(() => new Set());

  // No nível de país (zoom 5+) até os não marcados podem abrir o nome. É estado
  // porque muda o que é RENDERIZADO, e ref porque a medição precisa dele fora do
  // ciclo do React.
  const [expandAll, setExpandAll] = useState(false);

  // code -> { country, element, marker }. É a fonte da verdade para o cálculo de
  // colisão; `entries` é só a cópia que o React precisa para montar os portais.
  const markersRef = useRef(new Map());

  // Larguras medidas no DOM, por país e por estado. Medir é a única forma
  // confiável de saber a largura do nome escrito (varia com fonte e idioma).
  const widthsRef = useRef({});
  const modesRef = useRef({});
  const shownRef = useRef(/** @type {Set<string>} */ (new Set()));
  const expandAllRef = useRef(false);

  // `measure` precisa perguntar ao mapa se a câmera está em movimento, mas ela é
  // chamada de efeitos que não dependem de `map` (o de pós-render roda a cada
  // commit). O ref evita recriar esses efeitos a cada troca de instância.
  const mapRef = useRef(map);
  mapRef.current = map;

  // Ficou medição pendente porque o gesto ainda estava rolando?
  const pendingMeasureRef = useRef(false);
  const frameRef = useRef(0);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Assinatura do conteúdo da lista. O pai quase sempre passa um array novo a
  // cada render (`visited.map(...)`); sem isso, o efeito abaixo destruiria e
  // recriaria todos os markers a cada render do pai — que é justamente o tipo de
  // coisa que faz badge piscar e sumir.
  const signature = (countries ?? [])
    .map((country) => `${country?.code}@${country?.lng},${country?.lat}`)
    .join('|');

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` já resume `countries`
  const list = useMemo(() => sanitize(countries), [signature]);

  // Sincroniza os markers com a lista: cria os que entraram, remove os que
  // saíram, reposiciona os que mudaram de coordenada. Nada é recriado à toa, e
  // as larguras já medidas sobrevivem à atualização da lista.
  useEffect(() => {
    if (!map) return undefined;

    const markers = markersRef.current;
    const wanted = new Set(list.map((country) => country.code));

    for (const [code, entry] of markers) {
      if (wanted.has(code)) continue;
      entry.marker.remove();
      markers.delete(code);
      delete widthsRef.current[code];
      delete modesRef.current[code];
    }

    for (const country of list) {
      const existing = markers.get(country.code);
      if (existing) {
        existing.country = country;
        existing.marker.setLngLat([country.lng, country.lat]);
        continue;
      }

      const element = document.createElement('div');
      // O MapLibre move cada marker escrevendo `transform` a cada quadro, mas
      // não avisa o browser disso. Sem o will-change, os ~240 badges vivem na
      // camada de pintura normal e cada arrasto repinta a área toda; com ele,
      // cada badge vira camada própria e o movimento é só composição na GPU.
      element.style.willChange = 'transform';
      const marker = new Marker({ element, anchor: 'bottom' })
        .setLngLat([country.lng, country.lat])
        .addTo(map);

      // Some de vez quando o país gira para o outro lado do globo. O padrão do
      // MapLibre é 0.2, que deixa os badges do lado escondido "vazando" por cima
      // da esfera.
      marker.setOpacity('1', '0');

      markers.set(country.code, { country, element, marker });
    }

    setEntries(list.map((country) => ({ country, element: markers.get(country.code).element })));

    return undefined;
  }, [map, list]);

  // Desmonta tudo quando o mapa some (troca de instância ou saída da tela).
  useEffect(() => {
    if (!map) return undefined;

    return () => {
      for (const entry of markersRef.current.values()) entry.marker.remove();
      markersRef.current.clear();
      widthsRef.current = {};
      modesRef.current = {};
      shownRef.current = new Set();
      expandAllRef.current = false;
      setExpandAll(false);
      setEntries([]);
      setModes({});
      setShown(new Set());
    };
  }, [map]);

  const recalculate = useCallback(() => {
    const markers = markersRef.current;
    if (!map || markers.size === 0) return;

    const canvas = map.getCanvas();
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const zoom = map.getZoom();

    const candidates = [];
    const nextShown = new Set();

    // Precisa valer já neste cálculo, e não só depois do próximo render: é ele
    // que decide a largura com que cada badge entra na disputa por espaço.
    const allowUnmarked = expandsEveryBadge(zoom);
    expandAllRef.current = allowUnmarked;
    const expandOptions = { allowUnmarked };

    for (const [code, entry] of markers) {
      // getLngLat() e não country.lng/lat: o Marker reescreve a longitude para a
      // cópia do mundo mais próxima da câmera (smartWrap) ao cruzar o
      // antimeridiano. Projetar a coordenada original devolveria um ponto fora
      // da tela e o badge ficaria congelado no estado anterior.
      const lngLat = entry.marker.getLngLat();
      const point = map.project(lngLat);
      const occluded = isBehindGlobe(map, lngLat);

      const onScreen =
        point.x > -VIEWPORT_MARGIN &&
        point.x < width + VIEWPORT_MARGIN &&
        point.y > -VIEWPORT_MARGIN &&
        point.y < height + VIEWPORT_MARGIN;

      // Exibição progressiva: no globo inteiro só os destaques e os países do
      // usuário; a partir do zoom de continente, todo país que estiver na tela.
      // Ver featuredCountries.js.
      const visible = onScreen && !occluded && passesZoomFilter(entry.country, zoom);
      if (visible) nextShown.add(code);

      // O marker fica com opacity 0 do outro lado da esfera, mas continua
      // clicável — sem isto dá para clicar num país invisível atrás do globo. O
      // mesmo vale para quem o filtro de zoom tirou de cena.
      //
      // A escrita é condicional porque este laço roda a cada quadro de arrasto:
      // atribuir a mesma string 240 vezes por quadro invalida o estilo dos 240
      // elementos à toa, e o browser recalcula tudo de novo.
      const pointerEvents = visible ? 'auto' : 'none';
      if (entry.pointerEvents !== pointerEvents) {
        entry.pointerEvents = pointerEvents;
        entry.element.style.pointerEvents = pointerEvents;
      }

      const measured = widthsRef.current[code] ?? {};
      const compactWidth = measured[COMPACT] ?? COMPACT_BADGE_WIDTH;

      candidates.push({
        key: code,
        x: point.x,
        y: point.y,
        // Quem está fora do nível de zoom não disputa espaço: um país escondido
        // não pode fazer um visível colapsar para pill.
        visible,
        // País não marcado nunca abre o nome, então ele entra na disputa já com
        // o tamanho do pill. É assim que o "sempre compacto" chega até a
        // colisão sem precisar de um caso especial lá dentro: para o resolvedor
        // é só um badge cujo estado expandido tem a largura de um pill.
        expandedWidth: isExpandable(entry.country, expandOptions)
          ? measured[EXPANDED] ?? estimateExpandedWidth(entry.country.name ?? code)
          : compactWidth,
        compactWidth,
        height: BADGE_HEIGHT,
        priority: badgePriority(entry.country),
      });
    }

    const next = resolveBadgeModes(candidates, { previous: modesRef.current });

    for (const [code, entry] of markers) {
      // Condicional pelo mesmo motivo do pointerEvents acima: o z-index de um
      // badge muda raramente, e o laço roda a cada quadro.
      const zIndex = zIndexFor(renderedBadgeMode(entry.country, next[code], expandOptions));
      if (entry.zIndex !== zIndex) {
        entry.zIndex = zIndex;
        entry.element.style.zIndex = zIndex;
      }
    }

    // Só re-renderiza quando algum estado realmente mudou: o recálculo roda a
    // cada quadro de arrasto e o React não precisa saber disso quase sempre.
    const previous = modesRef.current;
    const changed =
      Object.keys(next).length !== Object.keys(previous).length ||
      Object.keys(next).some((key) => next[key] !== previous[key]);

    if (changed) {
      modesRef.current = next;
      setModes(next);
    }

    // Mesma lógica para o conjunto em cena: durante um arrasto ele fica igual
    // quadro após quadro, e só o zoom ou a borda da tela o mudam de verdade.
    const shownBefore = shownRef.current;
    let shownChanged = nextShown.size !== shownBefore.size;
    if (!shownChanged) {
      // for..of e não [...nextShown].some(): espalhar o Set aloca um array de
      // ~240 posições por quadro, e o coletor paga essa conta no meio do arrasto.
      for (const code of nextShown) {
        if (!shownBefore.has(code)) {
          shownChanged = true;
          break;
        }
      }
    }

    if (shownChanged) {
      shownRef.current = nextShown;
      setShown(nextShown);
    }

    setExpandAll((current) => (current === allowUnmarked ? current : allowUnmarked));
  }, [map]);

  // Recalcula no máximo uma vez por quadro, venha o gatilho de onde vier.
  const schedule = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      recalculate();
    });
  }, [recalculate]);

  useEffect(() => {
    if (!map) return undefined;

    const events = /** @type {const} */ ([
      'move',
      'zoom',
      'rotate',
      'pitch',
      'resize',
      'moveend',
      // O filtro por zoom precisa de um recálculo garantido no fim do gesto:
      // 'zoom' cobre o caminho, 'zoomend' cobre o último quadro, quando a
      // câmera já parou no nível novo.
      'zoomend',
      'idle',
    ]);

    schedule();
    events.forEach((event) => map.on(event, schedule));

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      events.forEach((event) => map.off(event, schedule));
    };
  }, [map, schedule]);

  // Lê a largura real de cada badge no estado em que ele está agora.
  //
  // `offsetWidth` e não `getBoundingClientRect()`: o marker aplica um transform
  // no elemento pai, e o rect vem com esse transform embutido. offsetWidth é a
  // largura de layout, que é o que a colisão precisa.
  //
  // CUIDADO: ler offsetWidth força o browser a calcular o layout na hora
  // (reflow síncrono), e aqui isso acontece ~240 vezes seguidas. Fora de
  // movimento é barato — o layout já está calculado e as leituras saem do
  // cache. NO MEIO DE UM ARRASTO é o oposto: cada quadro move os 240 markers,
  // invalida o layout, e a primeira leitura obriga o browser a refazer tudo
  // antes de responder. Era a origem das travadas. Por isso a medição é adiada
  // enquanto a câmera se mexe e cobrada no fim do gesto.
  const measure = useCallback(() => {
    if (mapRef.current?.isMoving?.() || mapRef.current?.isZooming?.()) {
      pendingMeasureRef.current = true;
      return false;
    }

    pendingMeasureRef.current = false;
    let learned = false;

    for (const [code, entry] of markersRef.current) {
      const badge = entry.element.firstElementChild;
      if (!badge) continue;

      const measured = badge.offsetWidth;
      if (!measured) continue;

      // O estado em que o badge está DESENHADO, que nem sempre é o que a colisão
      // devolveu: um país não marcado é sempre pill, mesmo quando sobra espaço.
      // Guardar a medida sob o estado errado envenenaria o cálculo seguinte.
      const mode = renderedBadgeMode(entry.country, modesRef.current[code], {
        allowUnmarked: expandAllRef.current,
      });
      const entryWidths = widthsRef.current[code] ?? (widthsRef.current[code] = {});

      if (entryWidths[mode] !== measured) {
        entryWidths[mode] = measured;
        learned = true;
      }
    }

    return learned;
  }, []);

  // Depois de cada render, guarda as larguras. Se alguma medida nova apareceu,
  // refaz o cálculo com os números certos. Durante um gesto isto vira um adiar
  // barato — ver o comentário de `measure`.
  useEffect(() => {
    if (measure()) schedule();
  });

  // Fim do gesto: cobra a medição que ficou pendente e, se alguma largura mudou,
  // refaz a colisão com os números certos. É aqui que o trabalho pesado
  // acontece, com a câmera parada, em vez de no meio do arrasto.
  useEffect(() => {
    if (!map) return undefined;

    const flush = () => {
      if (!pendingMeasureRef.current) return;
      if (measure()) schedule();
    };

    const events = /** @type {const} */ (['moveend', 'zoomend', 'idle']);
    events.forEach((event) => map.on(event, flush));

    return () => events.forEach((event) => map.off(event, flush));
  }, [map, measure, schedule]);

  // A Poppins carrega depois do primeiro render. Até lá o nome é medido na fonte
  // de fallback, que é mais estreita — as larguras ficam subestimadas e badges
  // vizinhos, que a colisão julgou folgados, encostam quando a fonte troca.
  // Um ResizeObserver por badge cobre isso e também a troca de estado, o
  // fallback de bandeira quebrada e qualquer mudança de nome.
  useEffect(() => {
    if (entries.length === 0 || typeof ResizeObserver === 'undefined') return undefined;

    // Também passa pelo adiamento de `measure`: trocar de estado no meio de um
    // arrasto dispara o observer, e medir ali dentro reintroduziria o reflow que
    // acabamos de tirar do caminho. Fica pendente e o 'moveend' cobra.
    const observer = new ResizeObserver(() => {
      if (measure()) schedule();
    });

    for (const { element } of entries) {
      if (element.firstElementChild) observer.observe(element.firstElementChild);
    }

    return () => observer.disconnect();
  }, [entries, measure, schedule]);

  return (
    <>
      {entries.map(({ country, element }) =>
        createPortal(
          <CountryBadge
            countryCode={country.code}
            name={country.name}
            compact={
              renderedBadgeMode(country, modes[country.code], { allowUnmarked: expandAll }) ===
              COMPACT
            }
            hidden={!shown.has(country.code)}
            onPress={() => onSelectRef.current?.(country)}
          />,
          element,
          country.code
        )
      )}
    </>
  );
}
