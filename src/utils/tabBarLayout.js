// Medidas da tab bar flutuante, num módulo só delas.
//
// A barra é `position: absolute` e flutua sobre o conteúdo, então ela NÃO
// reserva espaço no layout: qualquer coisa que a tela ancore no rodapé nasce
// por baixo dela. Quem tem controle no rodapé — o pill de países visitados e os
// controles do MapLibre no globo — precisa somar esta folga.
//
// Está aqui, e não dentro do AppNavigator, porque a tela do mapa não pode
// importar o navegador (o navegador é quem importa a tela; o ciclo quebraria o
// bundle). Trocar a altura da barra em um lugar move todo mundo junto.
import { Platform } from 'react-native';

export const TAB_BAR_HEIGHT = 70;

// Distância da barra até a base da janela.
export const TAB_BAR_BOTTOM = Platform.OS === 'web' ? 14 : 18;

/**
 * Altura livre que um elemento ancorado no rodapé precisa deixar para não ficar
 * atrás da barra. Some o safe-area inset por fora: ele varia por aparelho e só
 * a tela conhece o valor.
 */
export const TAB_BAR_CLEARANCE = TAB_BAR_HEIGHT + TAB_BAR_BOTTOM + 12;
