// Seletor de dia do roteiro no globo, em forma de calendário.
//
// Um roteiro de uma semana coloca sete trajetos sobrepostos na mesma cidade, e
// as cores por dia só resolvem até certo ponto — no centro, onde as paradas se
// concentram, tudo vira um novelo. Isolar um dia é o que devolve a leitura.
//
// TERCEIRA FORMA DESTE CONTROLE, E O PORQUÊ DE CADA MUDANÇA
//
//   1. fileira de pills escritas ("Dia 1", "Dia 2"...) com rolagem lateral:
//      ocupava a largura inteira e escondia metade dos dias atrás de um gesto
//      que nada anunciava;
//   2. grade de chips numerados: cabia tudo, mas num roteiro de três semanas
//      quebrava em três fileiras de números cobrindo o mapa;
//   3. esta: uma JANELA de cinco pílulas, com o dia em foco no meio. O que muda
//      não é o tamanho do controle, é quantos dias ele tenta mostrar de uma vez
//      — cinco, sempre, seja a viagem de 5 ou de 21 dias.
//
// A pílula é um cartão de calendário: linha de cima pequena (dia da semana,
// quando o roteiro tem data; a palavra "DIA" quando não tem) e o número embaixo.
// A do dia em foco é maior, preenchida com a cor daquele dia — a MESMA dos pinos
// e do traçado no mapa — e tem sombra na cor dela. As vizinhas encolhem e
// perdem opacidade conforme se afastam, o que dá a sensação de faixa contínua
// sem precisar desenhar uma.
//
// Três caminhos para trocar de dia, porque nenhum deles serve a todo mundo:
// tocar numa pílula visível, tocar nas setas (um dia por vez, sem dar a volta) e
// arrastar o dedo sobre a faixa.
//
// ARRASTAR ROLA A FAIXA; SÓ O TOQUE ESCOLHE O DIA
//
// Esta é a quarta forma, e ela desfaz uma parte da terceira. A janela de cinco
// pílulas economizava espaço, mas deixava o fim de uma viagem longa a vinte
// toques de distância: só dava para tocar no que estava visível, e a seta anda um
// dia por vez.
//
// A primeira tentativa de resolver isso leu o arrasto como troca de dia — o dia
// sob o dedo ia sendo selecionado durante o gesto, como um swipe de trocar de
// página. No aparelho ficou errado, e por um motivo que vale escrito: arrastar
// para NAVEGAR passou a mudar o dia sem que ninguém tivesse escolhido nada, e no
// mapa isso refiltrava o roteiro no meio do gesto.
//
// Arrastar e escolher são duas coisas. Aqui a faixa é um ScrollView horizontal de
// verdade: o arrasto é o do sistema, rola a faixa acompanhando o dedo e NÃO
// seleciona nada — é o que o dedo faz em qualquer lista. A escolha é o toque na
// pílula, e só ele. O ScrollView já sabe distinguir os dois: se o gesto virou
// rolagem, ele cancela o toque do filho, e nenhum dia é escolhido.
//
// Por isso a faixa mostra TODOS os dias agora, e não cinco: é ela que rola. As
// setas continuam, e ganharam uma função a mais — quando elas mudam o dia, a
// faixa rola até a pílula escolhida, porque essa pílula pode estar fora da vista
// (`stripScrollXForDay`, em planDayFocus.js).
//
// O que a forma nº 1 fazia de errado e que isto NÃO repete: lá a rolagem lateral
// era o único caminho, e nada anunciava o gesto. Aqui as setas continuam
// visíveis, e são elas que anunciam que há mais dias para os lados.
//
// Componente React Native puro: o mesmo arquivo na web e no app nativo, onde o
// mapa vive dentro de uma WebView e todo controle fica de fora dela. A
// aritmética da janela e dos rótulos está em planDayStrip.js, testada sem tela.
//
// ───────────────────────────────────────────────────────────────────────────
// A UNIDADE DESTE COMPONENTE É O DIA DA VIAGEM (1-based). SEM EXCEÇÃO.
//
// "Tocar no dia N e chegar no dia N-1" voltou quatro vezes aqui, sempre por
// motivos diferentes, e três consertos mexeram na conta do scroll — que nas
// duas últimas vezes nem era o problema. O que resolveu foi fixar a UNIDADE e
// escrever o caminho inteiro num lugar só. Ele é este:
//
//   1. `days`            — dia da VIAGEM, 1-based, vindo de `dayList` na tela
//                          (`Number(day?.day) || index + 1`, a MESMA conta que
//                          numera os cartões em `dayNumber`);
//   2. `days.map((day, index) => …)` — `day` é o VALOR (dia da viagem);
//                          `index` é 0-based e serve SÓ para opacidade e para
//                          a posição em pixels. Nunca vira dia;
//   3. o que a pílula ESCREVE — `dayPillLabel(day, …).bottom`, que é
//                          `String(day)`. Já foi o dia do MÊS, e era aí que o
//                          -1 nascia: escrevia "4" e carregava o dia 3;
//   4. o que o toque ENTREGA — `onSelect(day)`, o mesmo `day` do passo 2;
//   5. na tela do roteiro  — `scrollToDay(day)` → `measureDay(day)` procura
//                          `dayRefs.current[day]`, guardado sob `dayNumber`
//                          (mesma conta do passo 1) → `measureContentOffset`
//                          devolve pixels de conteúdo → `scrollTargetForDay`
//                          tira a margem → `scrollTo({ y })`;
//   6. no globo            — `setSelectedDay(day)`, e o mapa filtra por dia.
//
// Só dois lugares convertem dia em índice, e os dois usam `indexOf`, nunca
// aritmética: `stepDay` (setas) e `stripScrollXForDay` (rolar a faixa até a
// pílula). Se aparecer um `day - 1` ou `index + 1` fora do passo 1, é bug.
//
// A trava viva disso é o teste "o número escrito na pílula é exatamente o dia
// que o toque entrega" (tests/plan-day-tabs-touch.test.cjs): ele lê o número
// desenhado na árvore e compara com o que o `onPress` entrega, em viagens
// começando em vários dias do mês.
// ───────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dayColor } from './planRoute';
import {
  DAY_WINDOW_SIZE,
  dayPillLabel,
  daySummaryLabel,
  needsDayStrip,
  stepDay,
} from './planDayStrip';
import { DAY_PILL_PITCH, stripScrollXForDay } from './planDayFocus';
import { useLocale } from '../../i18n/LocaleProvider';

/**
 * @param {{
 *   days: number[],
 *   selectedDay: number | null,
 *   onSelect: (day: number | null) => void,
 *   dayInfo?: Record<number, { date?: string | null, place?: string }>,
 *   deselectable?: boolean,
 *   style?: any,
 * }} props
 */
export default function PlanDayTabs({
  days,
  selectedDay,
  onSelect,
  dayInfo = {},
  // Tocar no dia JÁ selecionado desfaz a escolha?
  //
  // No globo, sim: a faixa filtra o mapa, e `null` é o estado "mostre a viagem
  // inteira" — sem isso não haveria como voltar para ele.
  //
  // No roteiro, NÃO, e era o bug: ali a faixa é um índice, o dia destacado é o
  // que a pessoa está LENDO, e a tela descarta `null` porque "desrolar" não
  // significa nada. Para ver a pílula do dia 20 você precisa ter rolado até
  // perto do dia 20 — o que deixa justamente essa pílula destacada. O toque nela
  // mandava `null`, a tela jogava fora, e o clique não fazia absolutamente nada.
  deselectable = true,
  style,
}) {
  const { t } = useLocale();
  const step = useCallback(
    (direction) => {
      const next = stepDay(days, selectedDay, direction);
      // `null` é ponta de faixa: a seta não dá a volta, e um toque sem efeito é
      // melhor do que um salto do dia 1 para o dia 21.
      if (next !== null) onSelect(next);
    },
    [days, selectedDay, onSelect]
  );

  const stripRef = useRef(null);
  // Largura da faixa, medida na tela. Sem ela não há como centrar a pílula, e é
  // por isso que a rolagem automática espera o primeiro layout.
  const [stripWidth, setStripWidth] = useState(0);

  // A faixa vai até a pílula escolhida quando a escolha vem de FORA do dedo —
  // das setas, ou do dia que a leitura do roteiro destacou. Quando quem mexeu foi
  // o próprio dedo arrastando, a pílula já está à vista e o efeito não tem o que
  // fazer: `selectedDay` não mudou.
  useEffect(() => {
    if (!stripWidth) return;
    const x = stripScrollXForDay({
      days,
      day: selectedDay,
      viewportWidth: stripWidth,
      pitch: DAY_PILL_PITCH,
      pillWidth: PILL,
    });
    if (x === null) return;
    stripRef.current?.scrollTo?.({ x, animated: true });
  }, [days, selectedDay, stripWidth]);

  // Um dia só não é escolha: a faixa seria um botão que não faz nada.
  if (!days?.length || days.length < 2) return null;

  // TODOS os dias são desenhados: a faixa rola, então não há mais janela a
  // recortar. `DAY_WINDOW_SIZE` sobrou para decidir as setas — elas só aparecem
  // quando há dia fora da vista, que é a mesma pergunta de antes.
  const withArrows = needsDayStrip(days, DAY_WINDOW_SIZE);
  const selectedIndex = days.indexOf(Number(selectedDay));

  const summary = daySummaryLabel({
    selectedDay: Number.isFinite(selectedDay) ? selectedDay : null,
    totalDays: days.length,
    place: Number.isFinite(selectedDay) ? dayInfo?.[selectedDay]?.place : '',
  });

  return (
    <View style={[styles.container, style]} pointerEvents="box-none">
      <View style={styles.row}>
        {withArrows ? (
          <Arrow name="chevron-back" label={t('planDayTabs.previousDay')} onPress={() => step(-1)} />
        ) : null}

        <ScrollView
          ref={stripRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          // O arrasto é o do sistema: ele ROLA a faixa e não escolhe dia
          // nenhum. Se o gesto virar rolagem, o ScrollView cancela o toque da
          // pílula por conta própria — que é exatamente a regra pedida, e é de
          // graça justamente por não haver gesto escrito à mão aqui.
          //
          // `handled` deixa o primeiro toque já valer para a pílula em vez de
          // ser gasto só para segurar a faixa.
          keyboardShouldPersistTaps="handled"
          onLayout={(event) => setStripWidth(event.nativeEvent.layout.width)}
          style={styles.strip}
          contentContainerStyle={styles.stripContent}
        >
          {days.map((day, index) => {
            const active = selectedDay === day;
            const color = dayColor(day);
            const label = dayPillLabel(day, dayInfo?.[day]?.date);

            // A opacidade cai com a distância do dia em foco, mas POUCO.
            //
            // O mockup usava 0.55 e 0.35, e ali funcionava: o fundo dele era uma
            // tela escura chapada. O fundo real é imagem de satélite — sobre
            // deserto, neve ou nuvem, uma pílula a 35% simplesmente não existe.
            // Quem carrega a hierarquia aqui é o TAMANHO e a COR do dia em foco,
            // que já são diferença de sobra; a opacidade só insinua profundidade.
            const distance = selectedIndex < 0 ? 0 : Math.abs(index - selectedIndex);
            const dim = distance === 0 ? 1 : distance === 1 ? 0.95 : 0.85;

            return (
              <TouchableOpacity
                key={day}
                onPress={() => onSelect(active && deselectable ? null : day)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                // O rótulo visível é curto; o leitor de tela recebe a frase
                // inteira, porque "15" sozinho não diz nada a quem não vê a cor.
                accessibilityLabel={
                  active && deselectable
                    ? `Dia ${day} selecionado. Tocar mostra o roteiro inteiro.`
                    : active
                      ? `Dia ${day}, em foco`
                      : deselectable
                        ? `Mostrar apenas o dia ${day}`
                        : `Ir para o dia ${day}`
                }
                style={[
                  styles.pill,
                  active
                    ? [
                      styles.pillActive,
                      { backgroundColor: color, shadowColor: color },
                    ]
                    : [styles.pillIdle, { opacity: dim }],
                ]}
              >
                <Text style={[styles.pillTop, active && styles.pillTopActive]}>
                  {label.top}
                </Text>
                <Text style={[styles.pillNumber, active && styles.pillNumberActive]}>
                  {label.bottom}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {withArrows ? (
          <Arrow name="chevron-forward" label={t('planDayTabs.nextDay')} onPress={() => step(1)} />
        ) : null}
      </View>

      <Text style={styles.summary} numberOfLines={1}>
        {summary}
      </Text>
    </View>
  );
}

const Arrow = ({ name, label, onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.7}
    accessibilityRole="button"
    accessibilityLabel={label}
    style={styles.arrow}
  >
    <Ionicons name={name} size={14} color="#C3C9E0" />
  </TouchableOpacity>
);

const PILL = 52;
const PILL_ACTIVE = 58;

const styles = StyleSheet.create({
  container: { position: 'absolute', left: 0, right: 0, zIndex: 1001, paddingHorizontal: 16 },
  row: {
    flexDirection: 'row',
    // `center` e não `stretch`: a pílula em foco é mais alta que as outras, e é
    // do centro dela que a diferença precisa crescer para os dois lados.
    alignItems: 'center',
    gap: 6,
  },
  // A faixa é o ScrollView. `flex: 1` dá a ela o espaço entre as duas setas, e o
  // `overflow: visible` deixa a sombra colorida da pílula em foco escapar da
  // caixa — sem ele o ScrollView recorta a sombra e a pílula perde o vínculo com
  // o traçado daquele dia no mapa.
  strip: {
    flex: 1,
    overflow: 'visible',
  },
  // O alinhamento agora é do CONTEÚDO, não da caixa: é ele que cresce com o
  // número de dias e rola por dentro dela.
  stripContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    // Respiro nas pontas para a primeira e a última pílula não nascerem coladas
    // nas setas quando a faixa está no começo ou no fim.
    paddingHorizontal: 2,
    // A viagem curta (que não rola) fica centrada, como antes; a longa começa na
    // esquerda porque `grow` só tem efeito quando sobra espaço.
    flexGrow: 1,
    justifyContent: 'center',
  },
  pill: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pillIdle: {
    width: PILL,
    height: PILL,
    borderRadius: 12,
    // Vidro escuro SÓLIDO, o mesmo das setas e dos outros controles do globo.
    // O branco a 5% do mockup contava com um fundo escuro por baixo; aqui por
    // baixo tem satélite, e a pílula precisa trazer o próprio fundo.
    backgroundColor: 'rgba(22,31,56,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  pillActive: {
    width: PILL_ACTIVE,
    height: PILL_ACTIVE,
    borderRadius: 14,
    // A sombra é da COR DO DIA (shadowColor entra inline): é ela que liga a
    // pílula ao traçado daquele dia no mapa, sem precisar de legenda.
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  pillTop: {
    color: '#A7AEC6',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  pillTopActive: { color: 'rgba(255,255,255,0.85)', fontWeight: '700' },
  pillNumber: {
    color: '#C3C9E0',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 15,
    fontWeight: '600',
  },
  pillNumberActive: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  arrow: {
    width: 28,
    height: PILL,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(22,31,56,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  summary: {
    marginTop: 8,
    color: '#8B93AD',
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
    fontWeight: '500',
    // A sombra faz as vezes do fundo que a legenda não tem: ela flutua sobre o
    // satélite, que pode ser deserto, neve ou nuvem.
    textShadowColor: 'rgba(5,7,15,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
