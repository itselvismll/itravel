// Inscrição em Realtime que sobrevive a uma remontagem rápida do componente.
//
// O BUG QUE ISTO RESOLVE
//
// `supabase.channel(topic)` NÃO cria sempre um canal novo. Ele procura um canal
// já registrado com o mesmo tópico e, se achar, devolve AQUELE (ver
// RealtimeClient.channel no @supabase/realtime-js). E o canal antigo demora a
// sair da lista: `removeChannel` espera o `unsubscribe()`, que só resolve quando
// o servidor confirma a saída — o `_remove` que tira o canal da lista roda no
// `_onClose`, depois de uma ida e volta de rede.
//
// A limpeza de um useEffect, por outro lado, é síncrona: o React roda o cleanup
// do efeito anterior e o efeito novo no mesmo commit. Então numa remontagem
// rápida — sair de uma tela e voltar para ela — a sequência é:
//
//   1. cleanup chama removeChannel(canal)  -> a saída começa, o canal FICA na lista
//   2. o efeito novo chama supabase.channel(mesmo tópico) -> devolve o canal VELHO
//   3. .on(...) num canal que já passou por subscribe() -> lança
//
//   "cannot add `postgres_changes` callbacks ... after `subscribe()`"
//
// Esse erro estourava dentro do efeito, o React derrubava a árvore e a tela
// ficava em branco.
//
// A CORREÇÃO, EM DUAS CAMADAS
//
// 1. O tópico real leva um sufixo único por inscrição. Como nenhuma inscrição
//    nova divide tópico com uma antiga, `channel()` nunca tem um canal para
//    reaproveitar e a ordem criar -> .on() -> .subscribe() vale sempre, mesmo
//    que a saída do canal anterior ainda esteja em curso ou nunca termine (a
//    rede pode cair no meio).
//
// 2. Antes de criar, os canais órfãos do mesmo tópico-base são varridos. É o que
//    impede o vazamento que o sufixo único sozinho permitiria: sem a varredura,
//    um cleanup que falhasse deixaria canais acumulando sob tópicos diferentes.
//
// As duas camadas cobrem falhas diferentes de propósito: a primeira garante que
// a inscrição nova FUNCIONE, a segunda garante que as velhas SUMAM.
import { supabase } from './supabase';

// Contador de instância. Só precisa ser único dentro desta sessão de JS, que é o
// tempo de vida da lista de canais do cliente.
let instanceCounter = 0;

// O separador não pode aparecer num tópico-base, senão a varredura de órfãos
// pegaria canais que não são do mesmo grupo.
const INSTANCE_SEPARATOR = '#';

/** O prefixo que o realtime-js coloca no tópico de todo canal. */
const REALTIME_PREFIX = 'realtime:';

/**
 * Remove os canais que sobraram de inscrições anteriores neste mesmo tópico-base.
 *
 * Dispara e não espera: a saída de um canal que já não interessa não pode
 * atrasar a inscrição nova — foi justamente esperar por ela que criou o bug. O
 * `catch` vazio existe porque aqui não há o que fazer com a falha: o canal já
 * está fora de uso, e se a saída não completar o servidor a derruba junto com o
 * socket.
 *
 * @param {string} baseTopic
 */
const removeStaleChannels = (baseTopic) => {
  const prefix = `${REALTIME_PREFIX}${baseTopic}${INSTANCE_SEPARATOR}`;

  for (const channel of supabase.getChannels()) {
    if (!channel.topic.startsWith(prefix)) continue;
    Promise.resolve(supabase.removeChannel(channel)).catch(() => {});
  }
};

/**
 * Abre um canal Realtime com uma ou mais escutas de `postgres_changes`.
 *
 * A ordem exigida pelo realtime-js — criar, depois `.on()`, depois
 * `.subscribe()` — acontece aqui dentro, uma vez só, e não tem como ser
 * invertida por quem chama.
 *
 * Uso típico, dentro de um useEffect:
 *
 *   useEffect(() => {
 *     if (!userId) return undefined;
 *     return openPostgresChangesChannel({
 *       topic: `feed-header-counts-${userId}`,
 *       listeners: [{ filter: {...}, handler: (payload) => {...} }],
 *     });
 *   }, [userId]);
 *
 * @param {{
 *   topic: string,
 *   listeners: Array<{ filter: object, handler: (payload: any) => void }>,
 *   onStatus?: (status: string, error?: Error) => void,
 * }} options
 * @returns {() => void} limpeza, pronta para ser devolvida de um useEffect
 */
export const openPostgresChangesChannel = ({ topic, listeners, onStatus }) => {
  removeStaleChannels(topic);

  instanceCounter += 1;
  const channel = supabase.channel(`${topic}${INSTANCE_SEPARATOR}${instanceCounter}`);

  // Todo `.on()` vem antes do `.subscribe()`, que é a regra que o realtime-js
  // impõe e que este módulo existe para não deixar quebrar.
  for (const { filter, handler } of listeners) {
    channel.on('postgres_changes', filter, handler);
  }

  channel.subscribe(onStatus);

  return () => {
    Promise.resolve(supabase.removeChannel(channel)).catch(() => {});
  };
};
