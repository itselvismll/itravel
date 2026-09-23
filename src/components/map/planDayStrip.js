// A aritmética da faixa de dias: quais dias aparecem, qual dia a seta escolhe, e
// o que cada pílula escreve.
//
// Módulo puro — sem React, sem DOM, sem mapa. O seletor de dia é um controle
// React Native que roda igual na web e dentro do app nativo; o que mora aqui é a
// parte que dá para errar em silêncio (um roteiro de 21 dias mostrando a janela
// errada, uma pílula vazia na ponta, o dia 21 fora de alcance) e que, sendo
// pura, o teste pega sem precisar medir pixel nenhum na tela.

/**
 * O NÚMERO DO DIA DE UM DIA DO ROTEIRO. A única conta autorizada a produzi-lo.
 *
 * Existe por um motivo bem concreto: esta fórmula estava copiada em quatro
 * lugares — a lista de dias da faixa, o crachá do cartão, as paradas e as datas
 * — e "tocar no dia N e chegar no N-1" voltou quatro vezes neste componente. Nem
 * sempre foi divergência entre as cópias, mas quatro cópias de uma regra de
 * numeração é a condição que deixa esse bug possível. Com uma função só, duas
 * partes da tela não têm COMO numerar o mesmo dia de formas diferentes.
 *
 * O `|| index + 1` é a rede: roteiro gerado pela IA nem sempre traz `day` em
 * todo dia (e o campo já chegou como `0` e como texto vazio). Aí vale a posição
 * na lista, 1-based — porque a viagem começa no dia 1, não no dia 0.
 *
 * @param {{ day?: any } | null | undefined} planDay um item de `plan.days`
 * @param {number} index a posição dele em `plan.days`, 0-based
 * @returns {number} o dia da viagem, 1-based
 */
export const planDayNumber = (planDay, index) =>
  Number(planDay?.day) || index + 1;

/**
 * Quantas pílulas a faixa mostra de uma vez.
 *
 * Cinco é o que cabe numa tela de 360px com as duas setas e ainda deixa a pílula
 * do meio maior que as vizinhas. Mais do que isso e a faixa volta a ser a barra
 * larga que este controle já foi duas vezes.
 */
export const DAY_WINDOW_SIZE = 5;

/** A faixa precisa de setas? Só quando há dia fora da janela. */
export const needsDayStrip = (days, size = DAY_WINDOW_SIZE) =>
  (days?.length ?? 0) > size;

/**
 * Os dias visíveis na faixa, com o dia em foco no meio quando dá.
 *
 * "Quando dá" é a regra inteira: perto das pontas a janela PARA de deslizar em
 * vez de continuar centrando. Centrar o dia 1 pediria dois lugares antes dele —
 * e eles seriam buracos. A faixa sempre mostra `size` dias cheios (ou o roteiro
 * inteiro, se ele for menor que a janela).
 *
 * @param {number[]} days dias do roteiro, em ordem
 * @param {number | null} selectedDay dia em foco; null = nenhum (mostra o começo)
 * @param {number} [size]
 * @returns {number[]} os dias a desenhar, em ordem
 */
export const dayWindow = (days, selectedDay, size = DAY_WINDOW_SIZE) => {
  const list = days ?? [];
  if (list.length <= size) return [...list];

  const index = list.indexOf(Number(selectedDay));
  // Sem dia em foco, a janela começa no começo do roteiro — que é o que "Tudo"
  // mostra no mapa.
  if (index < 0) return list.slice(0, size);

  const half = Math.floor(size / 2);
  const start = Math.max(0, Math.min(index - half, list.length - size));
  return list.slice(start, start + size);
};

/**
 * O dia que a seta escolhe.
 *
 * Com um dia em foco, anda um para o lado pedido e PARA nas pontas — não dá a
 * volta. Voltar do dia 1 para o dia 21 com um toque numa seta é o tipo de salto
 * que faz o usuário perder de vista onde estava.
 *
 * Com "Tudo" em foco não há de onde andar, e a seta precisa significar alguma
 * coisa: ▶ entra pelo primeiro dia, ◀ entra pelo último.
 *
 * @param {number[]} days
 * @param {number | null} selectedDay
 * @param {1 | -1} direction 1 = ▶, -1 = ◀
 * @returns {number | null} o dia a selecionar, ou null quando não há para onde ir
 */
export const stepDay = (days, selectedDay, direction) => {
  const list = days ?? [];
  if (!list.length) return null;

  if (!Number.isFinite(selectedDay)) {
    return direction > 0 ? list[0] : list[list.length - 1];
  }

  const index = list.indexOf(Number(selectedDay));
  if (index < 0) return list[0];

  const next = index + (direction > 0 ? 1 : -1);
  if (next < 0 || next >= list.length) return null;
  return list[next];
};

const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

/**
 * A data do dia, quando ela existe e é uma data de verdade.
 *
 * Roteiro gerado pela IA traz `date` em cada dia, mas nem todo roteiro salvo tem
 * (os antigos não têm) e o campo já chegou como string vazia. `null` significa
 * "este roteiro não sabe em que dia do calendário isso acontece".
 */
const parseDayDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  // Meio-dia UTC: às 00:00 o fuso do Brasil joga a data para o dia anterior, e a
  // pílula mostraria a véspera.
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * As duas linhas de uma pílula.
 *
 * A LINHA DE BAIXO É O DIA DA VIAGEM. SEMPRE. E ISSO É UM CONSERTO.
 *
 * Ela já foi o dia do MÊS quando o roteiro tinha data — dia da semana em cima,
 * número do calendário embaixo, que é o que o mockup desenhava. Ficava bonito e
 * mentia: a pílula MOSTRAVA "4" e CARREGAVA o dia 3 da viagem. Numa viagem que
 * começa no dia 2 de outubro, o dia 3 do roteiro cai em 4 de outubro, então
 * tocar na pílula escrita "4" levava ao cartão marcado "3". Um deslocamento de
 * -1 perfeito, constante, e que não estava em conta nenhuma: estava na UNIDADE
 * do rótulo.
 *
 * Esse foi o quarto retorno do mesmo "dia errado" neste componente, e o único
 * que sobreviveu a três consertos da matemática do scroll — porque a matemática
 * nunca esteve errada dessa vez. A régua da tela toda é o DIA DA VIAGEM: é o que
 * o cartão estampa no crachá, o que a legenda diz ("Dia 3 de 21"), o que
 * `dayColor` pinta e o que `onSelect` entrega. A pílula era o único lugar que
 * falava outra língua.
 *
 * O dia da semana continua em cima, que era o que o calendário trazia de útil —
 * "é uma terça" — sem competir com o número.
 *
 * @param {number} day dia da VIAGEM (1-based), o mesmo que `onSelect` devolve
 * @param {string | null} [date] YYYY-MM-DD, quando o roteiro tiver
 * @returns {{ top: string, bottom: string }}
 */
export const dayPillLabel = (day, date) => {
  const parsed = parseDayDate(date);
  return {
    top: parsed ? WEEKDAYS[parsed.getUTCDay()] : 'DIA',
    bottom: String(day),
  };
};

/**
 * O que a legenda embaixo da faixa diz.
 *
 * "Dia 3 de 21 · Zagreb, Croácia" — a posição dentro da viagem mais onde aquele
 * dia acontece. Sem dia escolhido, ela conta a viagem inteira, que é o que o
 * mapa está mostrando nesse estado.
 *
 * @param {{ selectedDay?: number | null, totalDays?: number, place?: string }} params
 * @returns {string}
 */
export const daySummaryLabel = ({ selectedDay, totalDays = 0, place = '' }) => {
  const posicao = Number.isFinite(selectedDay)
    ? `Dia ${selectedDay} de ${totalDays}`
    : `Todos os ${totalDays} dias`;

  return place ? `${posicao} · ${place}` : posicao;
};

/**
 * Data e lugar de cada dia, para a faixa não precisar saber de onde isso vem.
 *
 * O lugar é o da PRIMEIRA parada do dia — é ela que dá o tom do dia no mapa, e é
 * onde a câmera vai quando o dia é escolhido. Vale o `location` da parada
 * quando ele existe (costuma ser "Zagreb, Croácia"); senão, o país resolvido
 * pela geometria, que é o que sempre dá para saber.
 *
 * @param {Array<any>} points paradas achatadas (getPlanPoints)
 * @param {{ days?: Array<any> }} [plan] roteiro salvo, de onde saem as datas
 * @param {Array<string | null>} [countryNames] país de cada parada, na ordem
 * @returns {Record<number, { date: string | null, place: string }>}
 */
export const buildDayInfo = (points, plan, countryNames) => {
  /** @type {Record<number, { date: string | null, place: string }>} */
  const info = {};

  (points ?? []).forEach((point, index) => {
    // ATENÇÃO: aqui o `|| 1` é PROPOSITAL e diferente do `planDayNumber`.
    //
    // `point` é uma PARADA achatada, não um dia do roteiro — quem chama já
    // numerou cada parada com `planDayNumber`. O `index` desta lista é a posição
    // da parada, não a do dia, então `index + 1` daria um dia inventado (a 5ª
    // parada viraria "dia 5"). Parada que chega sem dia cai no dia 1, que é o
    // único palpite defensável.
    const day = Number(point?.day) || 1;
    if (info[day]) return; // primeira parada do dia manda

    const location = typeof point?.location === 'string' ? point.location.trim() : '';
    info[day] = {
      date: null,
      place: location || countryNames?.[index] || '',
    };
  });

  // `planDayNumber`, e não `Number(day?.day)` puro: é a MESMA conta que numera
  // os cartões e monta `days`. Roteiro sem `day` (a IA nem sempre manda) caía em
  // `NaN` aqui, nenhuma data casava com nenhuma parada, e a faixa perdia o dia
  // da semana inteiro — mais uma versão de "cada lugar numera o dia do seu
  // jeito", que é a raiz desta família de bugs.
  (plan?.days ?? []).forEach((day, index) => {
    const number = planDayNumber(day, index);
    if (!info[number]) return;
    info[number].date = typeof day?.date === 'string' ? day.date : null;
  });

  return info;
};

/**
 * Qual dia está sendo lido, a partir de onde a tela está rolada.
 *
 * É o outro uso da faixa de dias: no mapa ela FILTRA, no roteiro ela indexa — o
 * dia destacado acompanha a leitura em vez de comandá-la. O que muda é só de
 * onde vem o dia em foco, e por isso a conta fica aqui, ao lado da que decide a
 * janela.
 *
 * A âncora existe porque a seção "vira" antes de chegar ao topo: um dia cujo
 * título está a 80px do topo já é o dia que a pessoa está lendo, não o anterior.
 *
 * @param {Record<number, number>} offsets posição vertical de cada dia na lista
 * @param {number} scrollY quanto a tela já rolou
 * @param {{ anchor?: number }} [options]
 * @returns {number | null} o dia em leitura, ou null quando nada foi medido
 */
export const activeDayFromScroll = (offsets, scrollY, { anchor = 120 } = {}) => {
  const entries = Object.entries(offsets ?? {})
    .map(([day, top]) => [Number(day), Number(top)])
    .filter(([day, top]) => Number.isFinite(day) && Number.isFinite(top))
    .sort((a, b) => a[1] - b[1]);

  if (!entries.length) return null;

  const line = (Number(scrollY) || 0) + anchor;

  let current = entries[0][0];
  for (const [day, top] of entries) {
    if (top <= line) current = day;
    else break;
  }

  return current;
};

/**
 * Para onde rolar quando alguém escolhe um dia.
 *
 * O BUG QUE ESTA FUNÇÃO EXISTE PARA FECHAR: tocar na pílula do dia 3 levava ao
 * dia 2. A conta em si nunca foi o problema — o problema eram as POSIÇÕES que
 * chegavam nela, medidas uma única vez e relativas ao container errado. Com a
 * escolha isolada aqui, o teste consegue afirmar o que a tela não deixa afirmar:
 * dia 3 rola para o cartão do dia 3, não para o do dia 2.
 *
 * As chaves chegam como string (é assim que um objeto guarda `{[day]: y}`), e
 * por isso a busca é feita nos dois formatos.
 *
 * @param {Record<string|number, number>} offsets posição de cada dia no conteúdo
 * @param {number} day dia escolhido
 * @param {{ margin?: number }} [options] respiro acima do cartão
 * @returns {number | null} posição de rolagem, ou null se o dia não foi medido
 */
export const scrollTargetForDay = (offsets, day, { margin = 12 } = {}) => {
  const map = offsets ?? {};
  const top = map[day] ?? map[String(day)];
  if (!Number.isFinite(top)) return null;
  return Math.max(0, Number(top) - margin);
};

/**
 * A partir de que rolagem o botão "voltar ao topo" aparece no roteiro.
 *
 * "Dois dias rolados": o botão surge quando o TERCEIRO dia chega ao topo da tela.
 * Antes disso o começo do roteiro ainda está a um gesto de distância, e um botão
 * flutuante ali seria só mais uma coisa por cima do conteúdo. Com um ou dois dias,
 * vale o último que existir; sem medida nenhuma (primeiro quadro, ou a medida
 * nativa que não respondeu), uma altura fixa que equivale a mais ou menos isso.
 *
 * @param {Record<string|number, number>} offsets posição de cada dia no conteúdo
 * @param {number[]} days os dias do roteiro, em ordem
 * @param {{ daysScrolled?: number, fallback?: number }} [options]
 * @returns {number} a rolagem (em px de conteúdo) a partir da qual o botão aparece
 */
export const backToTopThreshold = (offsets, days, { daysScrolled = 2, fallback = 1400 } = {}) => {
  const map = offsets ?? {};
  const lista = Array.isArray(days) ? days : [];
  const alvo = lista[Math.min(daysScrolled, lista.length - 1)];
  const top = alvo === undefined ? undefined : (map[alvo] ?? map[String(alvo)]);
  return Number.isFinite(top) && Number(top) > 0 ? Number(top) : fallback;
};
