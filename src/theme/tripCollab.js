// Os tokens das telas de colaboracao (convite e participantes).
//
// Sao os mesmos nomes do mockup aprovado (--bg, --card, --accent, --gold,
// --d1..--d4), num lugar so, para nenhuma tela reinventar um roxo ligeiramente
// diferente — que e como uma paleta morre: nao de uma vez, mas de um `#6D2CDA`
// por tela ate nada mais combinar.
//
// RELACAO COM `theme/colors.js`: os dois tokens que ja existiam la continuam
// mandando, e os valores abaixo apontam para eles. `accent` e o `colors.primary`
// da marca; `bg` e o `colors.dark`. O resto (os tons de card, as linhas, os
// quatro diagnosticos) nunca esteve num modulo — estava espalhado como literal
// hexadecimal por dezenas de arquivos — e passa a existir aqui.
import { colors } from './colors';

export const trip = Object.freeze({
  // Fundos, do mais fundo ao mais proximo.
  bg: colors.dark,          // #0D1326
  card: '#161F38',
  card2: '#1B2545',

  // Marca.
  accent: colors.primary,   // #6C2BD9
  accentSoft: '#A78BFA',

  // Quem organiza. O dourado aparece SO no papel de organizador — selo, texto do
  // papel, e o aviso de qual papel o convite concede. Usa-lo em mais coisa
  // esvazia o unico significado que ele carrega.
  gold: '#E9B949',

  // Linhas e separadores. Sao brancos com alfa, e nao cinzas opacos, para
  // funcionarem por cima de qualquer um dos tres fundos sem recalculo.
  line: 'rgba(255,255,255,0.10)',
  line2: 'rgba(255,255,255,0.16)',

  // Texto, do mais forte ao mais apagado.
  ink: '#F4F5FB',
  inkDim: '#8B93AD',
  inkFaint: '#5B6483',

  // Os quatro "diagnosticos": as cores que identificam pessoa e estado.
  d1: '#F0517A', // rosa — tambem a cor de remover
  d2: '#2FD9C4', // turquesa — tambem "pode editar" e "ja convidado"
  d3: '#F5A623', // ambar
  d4: '#8B5CF6', // violeta
});

/**
 * As familias de fonte, pelos nomes que `App.js` registra no `useFonts`.
 *
 * Poppins nos nomes e titulos, Inter no resto — a direcao do mockup. O motivo e
 * legibilidade em tamanho pequeno: a Inter foi desenhada para texto de interface
 * a 12-13px, que e onde vive quase tudo nestas telas (papel, estado do convite,
 * o proprio link). A Poppins, geometrica, brilha no nome proprio e no titulo e
 * fica larga demais num paragrafo de 12px.
 */
export const font = Object.freeze({
  // Nomes de pessoa, titulos de tela e de card.
  title: 'Poppins_600SemiBold',
  name: 'Poppins_500Medium',
  // Corpo, rotulos, estados.
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
});

/**
 * As sombras do mockup.
 *
 * A direcao visual pede SOMBRA SUAVE em vez de borda lateral colorida. No React
 * Native isso e duas APIs diferentes: `shadow*` no iOS e na web, `elevation` no
 * Android. Declarar as duas no mesmo objeto e o unico jeito de a mesma peca sair
 * igual nas tres plataformas.
 */
export const shadow = Object.freeze({
  card: Object.freeze({
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  }),
  menu: Object.freeze({
    shadowColor: '#000',
    shadowOpacity: 0.65,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 14,
  }),
  accentButton: Object.freeze({
    shadowColor: colors.primary,
    shadowOpacity: 0.6,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  }),
});

/** Cantos, na faixa 14-18px que a direcao visual pede. */
export const radius = Object.freeze({
  chip: 20,
  control: 11,
  field: 14,
  row: 16,
  card: 18,
});

export default trip;
