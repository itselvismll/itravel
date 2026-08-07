import { createNavigationContainerRef } from '@react-navigation/native';

// O banner global de notificações vive FORA do <NavigationContainer> (irmão dele, para
// conseguir cobrir qualquer tela). Lá dentro não existe `useNavigation()`, então a
// navegação por deep link passa por esta ref.
export const navigationRef = createNavigationContainerRef();

/**
 * Navega a partir de fora da árvore de navegação.
 * @returns {boolean} false quando a navegação não pôde acontecer.
 */
export const navigateFromOutside = (name, params) => {
  if (!name || !navigationRef.isReady()) return false;
  // O nome da rota é resolvido em runtime a partir do tipo da notificação (e a lista
  // inclui destinos ainda não registrados, como Conversation/PassportDetail), então não
  // dá para satisfazer a assinatura tipada por `keyof ParamList` aqui.
  /** @type {any} */ (navigationRef).navigate(name, params);
  return true;
};
