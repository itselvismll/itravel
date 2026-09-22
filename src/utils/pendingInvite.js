// O convite que a pessoa abriu antes de ter sessão, guardado até dar para usar.
//
// POR QUE ISTO PRECISOU EXISTIR
//
// O destino do link vivia só no estado do React. Isso basta no celular, onde
// entrar na conta não derruba o processo do app — e NÃO basta na web, onde todo
// caminho até a sessão SAI DA PÁGINA:
//
//   • entrar com Google redireciona para o Supabase e volta em `origin`, sem o
//     caminho do convite (`redirect_to=https://journi.expo.app`, medido no
//     navegador: o `/trip-invite/<token>` some no caminho de ida);
//   • cadastrar por e-mail manda confirmar em OUTRA aba, que nasce em `origin`;
//   • e um F5 na tela de login zera o estado do mesmo jeito.
//
// Em todos esses casos o app voltava sem memória nenhuma do convite: a pessoa
// terminava logada na tela inicial, e o relato — correto — era "cliquei no link
// e não aconteceu nada". O convite não estava quebrado; estava esquecido.
//
// A memória fica no `localStorage` da web porque é o que sobrevive a sair da
// página e volta na aba nova da confirmação de e-mail (mesma origem, mesmo
// navegador). No iOS e no Android quem chama passa `null` e o estado em memória
// continua valendo: lá o retorno do OAuth acontece dentro do mesmo processo.
//
// NADA DAQUI É CONFIÁVEL POR VIR DO ARMAZENAMENTO. Na web qualquer pessoa edita
// o `localStorage` pelo console, então o que é lido de volta é validado com o
// mesmo rigor de uma URL vinda de fora — token no formato certo, rota conhecida
// — antes de virar navegação. E validar não é proteger a viagem: quem protege é
// a `redeem_trip_invite`, que exige sessão e um token que exista no banco. Isto
// aqui só impede o app de navegar para uma tela com lixo no parâmetro.
import { routeForUrl } from './deepLinks';
import { isValidInviteToken } from './inviteLink';

/** Onde o convite pendente mora. Com prefixo para não colidir com o auth-js. */
export const PENDING_INVITE_KEY = 'journi.pendingInvite';

/**
 * Depois disto, o convite guardado é descartado.
 *
 * Um dia é folgado para "abri o link, criei a conta, confirmei o e-mail" e
 * curto o bastante para um convite esquecido não sequestrar uma abertura do app
 * uma semana depois — que seria pior do que não ter guardado: a pessoa abre o
 * Journi para ver as próprias viagens e cai numa tela de convite que ela não
 * pediu naquele momento.
 */
export const PENDING_INVITE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Um armazenamento no formato do `localStorage`, ou nada.
 *
 * @typedef {{ getItem: (k: string) => string | null, setItem: (k: string, v: string) => void, removeItem: (k: string) => void } | null | undefined} InviteStorage
 */

/**
 * Guarda o destino do convite.
 *
 * Silencioso de propósito: no Safari privado e com cookies de terceiros
 * bloqueados o `setItem` LANÇA. Deixar a exceção subir derrubaria a abertura do
 * app por causa de uma conveniência — o destino em memória continua valendo.
 *
 * @param {InviteStorage} storage
 * @param {{ name: string, params: Record<string, unknown> } | null} route
 * @param {number} [now]
 * @returns {boolean} guardou?
 */
export const savePendingInvite = (storage, route, now = Date.now()) => {
  if (!storage || !route || route.name !== 'TripInvite') return false;
  if (!isValidInviteToken(route.params?.token)) return false;

  try {
    storage.setItem(PENDING_INVITE_KEY, JSON.stringify({
      name: route.name,
      params: { token: String(route.params.token).toLowerCase() },
      savedAt: now,
    }));
    return true;
  } catch {
    return false;
  }
};

/**
 * O convite guardado, se ainda vale.
 *
 * @param {InviteStorage} storage
 * @param {number} [now]
 * @returns {{ name: string, params: { token: string } } | null}
 */
export const readPendingInvite = (storage, now = Date.now()) => {
  if (!storage) return null;

  let guardado;
  try {
    guardado = storage.getItem(PENDING_INVITE_KEY);
  } catch {
    return null;
  }
  if (!guardado) return null;

  let dados;
  try {
    dados = JSON.parse(guardado);
  } catch {
    // Lixo no lugar do JSON. Limpar evita repetir este parse a cada abertura.
    clearPendingInvite(storage);
    return null;
  }

  const token = dados?.params?.token;
  const idade = now - Number(dados?.savedAt);
  const vencido = !Number.isFinite(idade) || idade < 0 || idade > PENDING_INVITE_MAX_AGE_MS;

  if (dados?.name !== 'TripInvite' || !isValidInviteToken(token) || vencido) {
    clearPendingInvite(storage);
    return null;
  }

  return { name: 'TripInvite', params: { token: String(token).toLowerCase() } };
};

/**
 * Esquece o convite guardado. Chamado depois de navegar para ele.
 *
 * Sem isto, o convite consumido reabriria a tela a cada abertura do app até
 * vencer — e a pessoa já está na viagem.
 *
 * @param {InviteStorage} storage
 */
export const clearPendingInvite = (storage) => {
  if (!storage) return;
  try {
    storage.removeItem(PENDING_INVITE_KEY);
  } catch {
    // Nada a fazer: no pior caso o convite reabre uma vez e a RPC é idempotente.
  }
};

/**
 * O destino de abertura do app: o da URL, ou o que ficou guardado.
 *
 * É a decisão inteira do caminho do convite, num lugar só, para o AppNavigator
 * só ter de escutar o sistema e navegar — e para um teste sem app conseguir
 * afirmar a travessia que quebrou em produção: ver a URL deslogado, sair da
 * página para entrar na conta, e voltar em `origin` ainda sabendo do convite.
 *
 * @param {string | null | undefined} url a URL que abriu o app, se houver
 * @param {InviteStorage} storage
 * @param {number} [now]
 * @returns {{ name: string, params: Record<string, unknown> } | null}
 */
export const startupRoute = (url, storage, now = Date.now()) => {
  const daUrl = routeForUrl(url);
  if (daUrl) {
    savePendingInvite(storage, daUrl, now);
    return daUrl;
  }

  return readPendingInvite(storage, now);
};
