// Regra ÚNICA da bio do perfil — mesmo papel que utils/username.js cumpre para o
// username, e mesmo formato de retorno ({ valid, value, error }), para as telas
// tratarem os dois campos do mesmo jeito.
//
// A bio é opcional, aceita quebra de linha e emoji, e tem dois bloqueios: link e
// palavrão. Os dois EXISTEM PARA IMPEDIR O SALVAMENTO, com mensagem explicando o
// motivo — nada de remover ou mascarar o texto pelas costas de quem escreveu.
//
// SEM DEPENDÊNCIA NOVA, e por decisão, não por preguiça: as libs de filtro de
// palavrão do npm são quase todas focadas em inglês, e as poucas com PT-BR trazem
// listas grandes e agressivas que geram falso positivo em palavra comum. A lista
// abaixo é curta, revisável e nossa.

export const BIO_MAX_LENGTH = 160;

// Quantas quebras a bio pode ter DEPOIS da normalização — ou seja, quantas
// linhas de texto ela pode ocupar.
//
// Este limite BLOQUEIA o salvamento, diferente da compactação de blocos, que é
// silenciosa. A diferença é proposital: juntar quebras coladas uma na outra não
// muda o que a pessoa escreveu, mas quebras ESPALHADAS pelo texto são a
// formatação que ela escolheu — comprimir isso em silêncio reescreveria a bio
// dela. Melhor recusar e explicar.
export const BIO_MAX_LINE_BREAKS = 4;
export const BIO_MAX_LINES = BIO_MAX_LINE_BREAKS + 1;

/**
 * Detecção de link.
 *
 * São três padrões porque "link" aparece de três formas diferentes, e pegar só
 * `http://` deixaria passar justamente o caso mais comum (`instagram.com/fulano`
 * escrito sem protocolo).
 *
 * O terceiro padrão é o delicado: ele precisa pegar "meusite.com" sem acusar
 * "cheguei em SP. Foi ótimo" (ponto seguido de espaço) nem "3.5 estrelas". Daí a
 * exigência de um TLD conhecido colado ao ponto, sem espaço, com pelo menos duas
 * letras antes.
 */
const LINK_PATTERNS = [
  // Protocolo explícito: http://, https://, ftp://
  /\b(?:https?|ftp):\/\/\S+/i,
  // www. sem protocolo
  /\bwww\.[a-z0-9-]+\.[a-z]{2,}/i,
  // dominio.tld — só TLDs conhecidos, para não confundir com fim de frase
  /\b[a-z0-9][a-z0-9-]{1,}\.(?:com|net|org|io|co|br|me|app|dev|gg|tv|link|site|xyz|info|biz|shop|store|blog|online|live)\b/i,
];

/**
 * Termos bloqueados (PT-BR).
 *
 * Lista deliberadamente curta: ela cobre o palavrão explícito e o xingamento
 * mais comum, e para aí. Cada termo a mais é uma chance a mais de barrar um
 * usuário que não fez nada — e uma bio recusada sem motivo claro é pior, para
 * o produto, do que uma bio feia que passou.
 *
 * Sem acento e em minúsculas: o texto é normalizado antes da comparação, então
 * "MERD4"/"mérda" caem na mesma entrada.
 */
const BLOCKED_TERMS = [
  'caralho', 'porra', 'foda', 'foder', 'fodase', 'buceta', 'boceta',
  'puta', 'putaria', 'piranha', 'vagabunda', 'vadia', 'cuzao', 'cuzuda',
  'merda', 'bosta', 'viado', 'veado', 'bicha', 'traveco',
  'arrombado', 'arrombada', 'corno', 'pqp', 'fdp', 'vsf', 'tnc',
  'otario', 'otaria', 'imbecil', 'retardado', 'mongoloide',
  'macaco', 'criolo', 'crioulo', 'preto imundo',
  'pedofilo', 'estuprador', 'nazista', 'hitler',
];

/**
 * Forma de comparação: minúscula, sem acento e com os disfarces mais óbvios
 * desfeitos — zero vira "o", um vira "i", três vira "e", quatro e arroba viram
 * "a", cinco e cifrão viram "s".
 *
 * Isso não é um filtro à prova de quem QUER burlar — nenhum é. Serve para o
 * caso comum: quem escreve "p0rra" está escrevendo "porra".
 */
const foldForMatch = (text) => (text ?? '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[0]/g, 'o')
  // O "!" ficou DE FORA de propósito, apesar de ser leet clássico para "i":
  // ele é pontuação comum, e mapeá-lo transformava "merda!" em "merdai", que
  // não casa mais com o termo — o disfarce raro quebrava a detecção do caso
  // comum. O mesmo raciocínio vale para qualquer sinal frequente em texto.
  .replace(/[1|]/g, 'i')
  .replace(/[3]/g, 'e')
  .replace(/[4@]/g, 'a')
  .replace(/[5$]/g, 's');

/**
 * A bio contém um link?
 * @param {string} text
 */
export const containsLink = (text) => LINK_PATTERNS.some((pattern) => pattern.test(text ?? ''));

/**
 * Primeiro termo bloqueado encontrado, ou null.
 *
 * A busca é por PALAVRA INTEIRA (fronteira de não-letra dos dois lados). Sem
 * isso, "merda" barraria... nada óbvio, mas "puta" barraria "reputação" e
 * "computador" — e esse tipo de falso positivo é exatamente o que faz o usuário
 * achar que o app está quebrado.
 *
 * @param {string} text
 * @returns {string | null}
 */
export const findBlockedTerm = (text) => {
  const folded = foldForMatch(text);
  if (!folded) return null;

  for (const term of BLOCKED_TERMS) {
    // Fronteira própria em vez de \b: \b considera o acento como fronteira, e o
    // texto aqui já vem sem acento, mas emoji e pontuação continuam sendo
    // separadores válidos.
    const pattern = new RegExp(`(?:^|[^a-z0-9])${term.replace(/ /g, '\\s+')}(?:[^a-z0-9]|$)`);
    if (pattern.test(folded)) return term;
  }

  return null;
};

/**
 * Deixa a bio na forma exata em que será salva.
 *
 * Duas coisas, nesta ordem:
 *
 * 1. COMPACTA QUEBRAS EXCESSIVAS — três ou mais quebras seguidas viram duas, que
 *    é uma linha em branco. Sem isso, dá para empurrar o texto para baixo com
 *    dez Enters e abrir um vão vertical enorme no perfil, que é abuso de
 *    formatação e não conteúdo. Uma quebra simples e uma linha em branco entre
 *    parágrafos continuam intactas: são formatação legítima.
 *
 *    A compactação é SILENCIOSA, e não um erro. Recusar o salvamento por causa
 *    de Enter a mais seria implicância; o texto de ninguém é perdido, só o vão.
 *
 *    O `[^\S\n]*` no padrão é o que faz a linha "em branco" com espaços contar
 *    como em branco: quem cola texto de outro app traz "\n   \n   \n", que a
 *    olho nu é idêntico a "\n\n\n" e sem isso escaparia da regra.
 *
 * 2. APARA AS PONTAS. As quebras do MEIO são conteúdo e sobrevivem.
 *
 * @param {string | null | undefined} raw
 * @returns {string}
 */
export const normalizeBio = (raw) => (raw ?? '')
  // CRLF e CR viram LF antes de qualquer contagem: colado do Windows, "\r\n\r\n"
  // são duas quebras, e sem esta linha o padrão abaixo não as enxergaria.
  .replace(/\r\n?/g, '\n')
  // Bloco de quebras vira UMA quebra — e só as quebras são tocadas.
  //
  // Não existe linha em branco na bio. Antes o limite era "no máximo uma linha
  // em branco" (`\n\n`), e ainda dava para ocupar meia tela: várias quebras
  // simples com pouco texto em cada linha empilham o card inteiro. Rede social
  // nenhuma permite isso. Agora Enter só pula para a próxima linha de texto.
  //
  // CUIDADO AO MEXER NESTE PADRÃO. A versão de duas versões atrás era
  // `(?:[^\S\n]*\n){3,}[^\S\n]*` trocada por uma string fixa, e ela APAGAVA
  // CARACTERES DO TEXTO: o `[^\S\n]*` das pontas engolia os espaços e tabs
  // vizinhos ao bloco, e eles iam embora na substituição — "BB\n\n\n n." virava
  // "BB\n\nn.", sem o espaço. Um fuzz de 200 mil entradas acusou 6.773 casos.
  //
  // As duas defesas que impedem a volta disso: o padrão começa no `\n` (não
  // consome o que vem ANTES do bloco) e o replacer devolve todo caractere que
  // não é quebra. Assim a única coisa que a função remove são quebras. O espaço
  // de uma linha "em branco" com espaços é preservado e reaparece à frente do
  // texto seguinte — feio num caso raro, mas conteúdo do usuário não se perde.
  .replace(/\n(?:[^\S\n]*\n)+/g, (bloco) => `\n${bloco.replace(/\n/g, '')}`)
  // Pontas: este é o ÚNICO ponto que remove caractere não-quebra, e é
  // comportamento antigo e intencional (bio não começa nem termina com espaço).
  .replace(/^\s+|\s+$/g, '');

/**
 * Quantas quebras de linha o texto tem.
 *
 * Espera o texto JÁ normalizado — quem chama com texto cru conta quebras que a
 * normalização ia juntar, e recusa uma bio que caberia.
 *
 * @param {string} text
 * @returns {number}
 */
export const countLineBreaks = (text) => (String(text ?? '').match(/\n/g) || []).length;

/**
 * Valida a bio e devolve a mensagem pronta para a UI.
 *
 * `value` volta com as pontas aparadas — é exatamente o que será salvo. Bio
 * vazia é válida e vira null, que é o "sem bio" do banco.
 *
 * @param {string | null | undefined} raw
 * @returns {{ valid: boolean, value: string | null, error: string | null }}
 */
export function validateBio(raw) {
  const value = normalizeBio(raw);

  // Campo opcional. Sai como null para o banco distinguir "não preencheu" de
  // "preencheu com vazio".
  if (!value) return { valid: true, value: null, error: null };

  if ([...value].length > BIO_MAX_LENGTH) {
    return {
      valid: false,
      value,
      error: `A bio precisa ter no máximo ${BIO_MAX_LENGTH} caracteres.`,
    };
  }

  // Contado no texto JÁ normalizado: blocos colados viraram uma quebra só, então
  // o que sobra aqui são as quebras que a pessoa realmente usou para separar
  // linhas. "a\n\n\n\nb" não gasta quatro do orçamento — gasta uma.
  if (countLineBreaks(value) > BIO_MAX_LINE_BREAKS) {
    return {
      valid: false,
      value,
      error: `A bio pode ter no máximo ${BIO_MAX_LINES} linhas. Junte algumas linhas para salvar.`,
    };
  }

  if (containsLink(value)) {
    return {
      valid: false,
      value,
      error: 'Links não são permitidos na bio. Remova o endereço para salvar.',
    };
  }

  const blocked = findBlockedTerm(value);
  if (blocked) {
    return {
      valid: false,
      value,
      error: 'Sua bio contém uma palavra que não é permitida. Revise o texto para salvar.',
    };
  }

  return { valid: true, value, error: null };
}

/**
 * Quantos caracteres a bio tem, contando emoji como UM.
 *
 * `String.length` conta unidades UTF-16: "🇧🇷" daria 4 e "👨‍👩‍👧" daria 8, e o
 * contador da tela mostraria um número que não bate com o que a pessoa vê. O
 * spread do iterador de string conta por code point, que é bem mais perto da
 * intuição — e é a MESMA contagem que `validateBio` usa para o limite, então o
 * contador nunca discorda do erro.
 *
 * @param {string | null | undefined} text
 * @returns {number}
 */
export const bioLength = (text) => [...((text ?? ''))].length;
