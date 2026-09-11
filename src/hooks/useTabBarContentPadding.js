// Espaço que uma lista rolável precisa deixar no fim para o último item não
// nascer embaixo da tab bar flutuante.
//
// A barra é `position: absolute` (ver AppNavigator e utils/tabBarLayout): ela
// flutua SOBRE o conteúdo e não reserva espaço nenhum no layout. Uma lista que
// termina no fim da tela termina, portanto, atrás dela — e o último item fica
// invisível e intocável. Foi o que acontecia com o botão "Seguir" dos últimos
// usuários da tela Explorar.
//
// O valor é o mesmo que os elementos ancorados no rodapé do globo já usam
// (`TAB_BAR_CLEARANCE + insets.bottom`, em GlobeScreen). Existir como hook é o
// que impede a próxima tela de chutar um número: antes desta correção havia um
// 96, um 56, um 50, um 32 e um 20 espalhados pelo app, todos tentando resolver a
// mesma coisa e só um deles perto do valor certo.
//
// POR QUE UM ARQUIVO PRÓPRIO, E NÃO DENTRO DE utils/tabBarLayout
//
// O tabBarLayout é importado por GlobeMap.web.js, que roda dentro da WebView do
// DOM Component no nativo. Pôr um hook do react-native-safe-area-context lá
// arrastaria essa dependência para dentro do bundle da WebView, que não tem
// safe area nenhuma para consultar. O módulo de medidas fica puro; o hook, que é
// React e só faz sentido numa tela, mora aqui.
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_CLEARANCE } from '../utils/tabBarLayout';

// O `id` do Tab.Navigator em AppNavigator. `getParent(id)` devolve undefined
// quando a tela NÃO está debaixo dele, e é isso que responde à pergunta "esta
// tela tem tab bar por cima?".
const TAB_NAVIGATOR_ID = 'MainTabs';

/**
 * Padding inferior para o `contentContainerStyle` de uma lista/scroll.
 *
 * Devolve 0 para tela que não está sob as tabs, e é isso que torna o hook seguro
 * de usar em qualquer tela. A distinção não é teórica: a SupportScreen está
 * registrada DUAS vezes — no ProfileStack, sob as tabs, e no AuthStack, onde não
 * há barra nenhuma. Um valor fixo abriria um vão morto de ~100px no fim do
 * formulário de quem chega pelo login. O mesmo vale para as telas empilhadas no
 * RootStack (PublicProfile, Conversation, Notificações…), que cobrem a barra
 * inteira.
 *
 * @param {number} [extra] folga adicional, quando a tela quer mais respiro
 * @returns {number} pixels a reservar no fim do conteúdo (0 se não houver barra)
 */
export default function useTabBarContentPadding(extra = 0) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const hasTabBar = Boolean(navigation.getParent(TAB_NAVIGATOR_ID));
  if (!hasTabBar) return 0;

  return TAB_BAR_CLEARANCE + insets.bottom + extra;
}
