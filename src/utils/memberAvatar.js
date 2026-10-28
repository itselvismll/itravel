// A identidade visual de uma pessoa na viagem: iniciais e gradiente.
//
// Modulo PURO — sem React, sem View, sem LinearGradient. O componente
// (components/trip/MemberAvatar) so pinta o que sai daqui, e e por isso que
// `node:test` consegue afirmar a regra inteira sem browser.
//
// POR QUE GRADIENTE POR PESSOA, E NAO FOTO OU ICONE PADRAO
//
// Numa viagem compartilhada a lista de participantes e lida de relance, muitas
// vezes: quem editou, quem falta aceitar, de quem e aquele comentario. Avatar
// generico (o mesmo circulo roxo com uma letra, que era o comportamento antigo)
// obriga a LER o nome toda vez. Uma cor propria e estavel transforma cada pessoa
// num alvo reconhecivel antes da leitura.
//
// O gradiente e DETERMINISTICO pelo id: a mesma pessoa tem a mesma cor neste
// aparelho, no aparelho do outro participante, hoje e no mes que vem. Se fosse
// sorteado a cada render, seria ruido em vez de identidade — e pior que o
// generico, porque mudaria debaixo do olho de quem ja tinha memorizado.

/**
 * Os pares do mockup aprovado, na ordem em que entram.
 *
 * Cada par e {de, para} de um gradiente diagonal. Sao quatro porque quatro
 * matizes bem separados (rosa, violeta, ambar, turquesa-esverdeado) ainda se
 * distinguem de relance num circulo de 46px; com oito, dois deles viram "aquele
 * meio azulado" e a identidade se perde.
 */
export const AVATAR_GRADIENTS = Object.freeze([
  Object.freeze({ from: '#F0517A', to: '#C23A63' }), // --d1, rosa
  Object.freeze({ from: '#8B5CF6', to: '#5B3AA8' }), // --d4, violeta
  Object.freeze({ from: '#F5A623', to: '#C07D17' }), // --d3, ambar
  Object.freeze({ from: '#2FD9C4', to: '#1C9C8D' }), // --d2, turquesa
]);

/**
 * O gradiente de quem organiza a viagem.
 *
 * Fora do rodizio, e de proposito: o organizador ja se distingue pelo selo
 * dourado, e deixa-lo cair num dos quatro faria duas pessoas dividirem a mesma
 * cor com frequencia alta numa lista pequena. O roxo da marca tambem amarra o
 * dono da viagem ao app.
 */
export const OWNER_GRADIENT = Object.freeze({ from: '#A78BFA', to: '#6C2BD9' });

/**
 * A direcao do gradiente, em coordenadas de `expo-linear-gradient`.
 *
 * Equivale ao `linear-gradient(155deg, ...)` do mockup: 155 graus a partir do
 * norte, no sentido horario, da o vetor (sin155, -cos155) = (0.42, 0.91), que
 * normalizado ao quadrado unitario vira o par abaixo. Diagonal de verdade, nao
 * vertical — e o que da volume ao circulo sem precisar de sombra interna.
 */
export const GRADIENT_DIRECTION = Object.freeze({
  start: Object.freeze({ x: 0.29, y: 0.05 }),
  end: Object.freeze({ x: 0.71, y: 0.95 }),
});

/**
 * Hash estavel de uma string.
 *
 * djb2. Nao precisa ser criptografico — precisa ser IGUAL em todo lugar e em
 * toda versao do app. Por isso esta escrito aqui e nao delegado a nada do
 * ambiente: `String.prototype.hashCode` nao existe, e qualquer coisa que dependa
 * de ordem de propriedade ou de locale mudaria a cor da pessoa entre
 * plataformas.
 *
 * O `>>> 0` em cada passo mantem o numero dentro de 32 bits sem sinal; sem ele o
 * acumulado estoura o inteiro seguro do JS e o resto da divisao passa a variar.
 *
 * @param {string} value
 * @returns {number}
 */
const hash = (value) => {
  let acc = 5381;
  for (let i = 0; i < value.length; i += 1) {
    acc = (((acc << 5) + acc) + value.charCodeAt(i)) >>> 0;
  }
  return acc;
};

/**
 * As iniciais que vao dentro do circulo.
 *
 * Duas palavras viram duas iniciais ("Mariana Freitas" -> "MF"); uma palavra so
 * vira as duas primeiras letras ("Mariana" -> "MA"), porque uma letra sozinha
 * num circulo de 46px fica perdida e deixa dois "M" identicos na mesma lista.
 *
 * Particulas ("de", "da", "dos", "e") sao puladas: "Maria da Silva" precisa dar
 * "MS", nao "MD". Sao as particulas do portugues porque e a lingua do app.
 *
 * @param {string | null | undefined} name
 * @param {string} [fallback] o que sai quando nao ha nome aproveitavel
 * @returns {string} uma ou duas letras maiusculas
 */
export const initialsFrom = (name, fallback = '?') => {
  const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'del', 'van', 'von']);

  const palavras = String(name ?? '')
    .trim()
    // Fora tudo que nao e letra: emoji, pontuacao e o "@" de um username colado
    // no lugar do nome nao sao iniciais de ninguem.
    .split(/\s+/)
    .map((palavra) => palavra.replace(/[^\p{L}]/gu, ''))
    .filter(Boolean);

  const uteis = palavras.filter((palavra) => !PARTICULAS.has(palavra.toLocaleLowerCase('pt-BR')));
  // Nome so de particulas ("De") nao deveria acontecer, mas se acontecer e
  // melhor usar a particula do que devolver o fallback.
  const base = uteis.length ? uteis : palavras;

  if (!base.length) return fallback;

  if (base.length === 1) {
    return base[0].slice(0, 2).toLocaleUpperCase('pt-BR');
  }

  return (base[0][0] + base[base.length - 1][0]).toLocaleUpperCase('pt-BR');
};

/**
 * Tudo que o componente precisa para desenhar o avatar de uma pessoa.
 *
 * A CHAVE DO GRADIENTE E O `id`, NAO O NOME. Nome muda (a pessoa edita o perfil)
 * e dois primos podem se chamar igual; o id nao muda e e unico. Quando nao ha id
 * — um resultado de busca ainda sem perfil carregado — o username serve de
 * chave, e so entao o nome.
 *
 * @param {{
 *   id?: string | null,
 *   username?: string | null,
 *   display_name?: string | null,
 *   role?: string | null,
 * } | null | undefined} person
 * @returns {{ initials: string, gradient: { from: string, to: string }, isOwner: boolean }}
 */
export const avatarIdentity = (person) => {
  const nome = person?.display_name || person?.username || '';
  const chave = String(person?.id || person?.username || nome || '');
  const isOwner = person?.role === 'owner';

  return {
    initials: initialsFrom(nome, '?'),
    gradient: isOwner
      ? OWNER_GRADIENT
      : AVATAR_GRADIENTS[hash(chave) % AVATAR_GRADIENTS.length],
    isOwner,
  };
};
