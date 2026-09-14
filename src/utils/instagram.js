// As duas integrações com o Instagram: compartilhar o passaporte nos Stories e
// abrir o perfil de alguém pelo badge.
//
// Vivem no mesmo módulo porque dependem da MESMA condição de ambiente — o app do
// Instagram estar instalado e visível para o sistema (ver plugins/withInstagram)
// — e porque as duas precisam cair no navegador quando ele não está.
//
// POR QUE O `react-native-share` É CARREGADO POR `require` DENTRO DA FUNÇÃO
//
// Ele é um módulo NATIVO e não tem implementação web, e o Journi é publicado na
// web (journi.expo.app).
//
// O que o `require` tardio evita é a AVALIAÇÃO, não o empacotamento: o Metro não
// faz tree-shake de require dinâmico, então o módulo entra no bundle web de
// qualquer jeito (confirmado no dist). A diferença é que o corpo dele só roda
// quando alguém chama — e na web ninguém chama, porque `shareToInstagramStories`
// retorna antes, na primeira linha. Com `import` no topo o corpo rodaria no boot
// do bundle, procurando um NativeModule que não existe no navegador, e o que
// quebraria seria a tela inteira, não o botão.
import { Linking, Platform } from 'react-native';

/**
 * O arroba do Instagram, normalizado.
 *
 * Aceita o que a pessoa realmente digita: com arroba, com espaço sobrando, com
 * a URL inteira colada do navegador. Devolve string vazia quando não sobra nada
 * utilizável, para quem chama tratar como "não informado" sem testar formato.
 *
 * O Instagram permite letras, números, ponto e underline, até 30 caracteres.
 * Qualquer outra coisa é resto de cola (barra, query string) e é descartada.
 *
 * @param {string | null | undefined} entrada
 * @returns {string}
 */
export const normalizeInstagramUsername = (entrada) => {
  if (typeof entrada !== 'string') return '';

  const semUrl = entrada
    .trim()
    // O `https://` é opcional porque o navegador esconde o esquema na barra de
    // endereço: quem copia dali cola "instagram.com/fulano", sem protocolo.
    .replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');

  const semArroba = semUrl.replace(/^@+/, '').trim();

  return /^[A-Za-z0-9._]{1,30}$/.test(semArroba) ? semArroba : '';
};

/** @param {string} username */
export const instagramWebUrl = (username) => `https://instagram.com/${username}`;

/** @param {string} username */
export const instagramAppUrl = (username) => `instagram://user?username=${username}`;

/**
 * Abre o perfil no app do Instagram, com o navegador como reserva.
 *
 * `canOpenURL` antes de `openURL` porque no iOS um scheme não declarado no
 * Info.plist responde `false` sem sequer perguntar ao sistema, e no Android 11+
 * um pacote fora do `<queries>` some do mesmo jeito — nos dois casos o certo é
 * cair no navegador em vez de tentar e falhar na cara do usuário.
 *
 * O `try` existe porque `canOpenURL` REJEITA (não devolve false) quando o
 * scheme é malformado, e uma rejeição aqui derrubaria o toque no badge sem
 * abrir nada.
 *
 * @param {string} usernameCru
 * @returns {Promise<boolean>} se alguma coisa chegou a abrir
 */
export const openInstagramProfile = async (usernameCru) => {
  const username = normalizeInstagramUsername(usernameCru);
  if (!username) return false;

  const web = instagramWebUrl(username);

  // Na web o scheme do app não faz sentido: vai direto para o site, em aba nova.
  if (Platform.OS === 'web') {
    await Linking.openURL(web);
    return true;
  }

  try {
    if (await Linking.canOpenURL(instagramAppUrl(username))) {
      await Linking.openURL(instagramAppUrl(username));
      return true;
    }
  } catch {
    // Cai no navegador logo abaixo.
  }

  try {
    await Linking.openURL(web);
    return true;
  } catch {
    return false;
  }
};

/**
 * O App ID do Facebook, exigido pelo Instagram para publicar nos Stories.
 *
 * Obrigatório desde janeiro de 2023: sem ele o Instagram recusa o conteúdo, e é
 * por isso que este módulo checa ANTES de chamar o share — um erro genérico de
 * "não foi possível compartilhar" mandaria quem for investigar procurar no lugar
 * errado.
 */
export const facebookAppId = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID || '';

/** Resultados possíveis, para quem chama escolher a mensagem. */
export const STORIES_OK = 'ok';
export const STORIES_SEM_APP = 'instagram-ausente';
export const STORIES_SEM_APP_ID = 'sem-app-id';
export const STORIES_INDISPONIVEL = 'indisponivel';
export const STORIES_ERRO = 'erro';

/**
 * Publica uma imagem nos Stories do Instagram.
 *
 * @param {string} imagemUri URI de arquivo da imagem já capturada (file://...)
 * @returns {Promise<{ status: string, detalhe?: string }>}
 */
export const shareToInstagramStories = async (imagemUri) => {
  if (Platform.OS === 'web') return { status: STORIES_INDISPONIVEL };
  if (!imagemUri) return { status: STORIES_ERRO };
  if (!facebookAppId) return { status: STORIES_SEM_APP_ID };

  // Checa o app ANTES de tentar publicar: o erro que o react-native-share
  // devolve quando o Instagram não está instalado não é padronizado entre iOS e
  // Android, e adivinhar pela mensagem daria um diagnóstico errado na metade dos
  // casos. O scheme de Stories é o que precisa existir — ter o Instagram velho
  // demais para Stories é indistinguível de não ter, e o desfecho é o mesmo.
  try {
    if (!(await Linking.canOpenURL('instagram-stories://share'))) {
      return { status: STORIES_SEM_APP };
    }
  } catch {
    return { status: STORIES_SEM_APP };
  }

  try {
    // Carregado aqui, não no topo: ver a nota de bundle web no início do arquivo.
    const Share = require('react-native-share').default;

    await Share.shareSingle({
      social: /** @type {any} */ (Share.Social.INSTAGRAM_STORIES),
      appId: facebookAppId,
      backgroundImage: imagemUri,
      // O passaporte é desenhado sobre o navy do app; as duas pontas do gradiente
      // iguais evitam a barra clara que o Instagram põe atrás de imagens que não
      // preenchem a tela inteira.
      backgroundBottomColor: '#0D1326',
      backgroundTopColor: '#0D1326',
    });

    return { status: STORIES_OK };
  } catch (erro) {
    return { status: STORIES_ERRO, detalhe: erro?.message || String(erro) };
  }
};
