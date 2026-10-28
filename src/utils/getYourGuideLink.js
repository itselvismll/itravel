// Link de afiliado da GetYourGuide — busca por cidade, sem passeio específico.
//
// POR QUE SÓ A BUSCA, E NÃO UM PASSEIO ESCOLHIDO
//
// Não há integração com a API de busca da GetYourGuide (fora do escopo desta
// entrega): o link leva para a página de resultados DELES para a cidade, e é
// o próprio site que decide o que mostrar. Dá pra trocar por um link mais
// específico depois sem mudar quem chama esta função — é por isso que ela
// existe centralizada, e os dois pontos do app (botão "Reservar" no roteiro, e
// o card "Passeios em [cidade]" do Explorar) chamam a MESMA função em vez de
// montar a URL cada um do seu jeito.
//
// MÓDULO PURO: sem Linking, sem React. Quem abre o link é a tela.
const GETYOURGUIDE_PARTNER_ID = 'UCD6XMM';

/**
 * A URL de busca da GetYourGuide.
 *
 * `primaryTerm` é o que de fato diferencia a busca — o nome da ATRAÇÃO
 * ("Coliseu e Fórum Romano"), quando tem uma; sem ela, a cidade sozinha já é
 * mais específico que nada. `contextTerm` é a cidade, somada ao nome da
 * atração para desambiguar ("Coliseu, Roma" em vez de só "Coliseu" — o
 * mesmo nome de atração existe em mais de uma cidade/réplica turística).
 *
 * A busca da GetYourGuide é texto livre (não há campo de cidade separado na
 * URL), então os dois termos entram juntos, por vírgula, como alguém
 * digitaria na busca de verdade.
 *
 * @param {string | null | undefined} primaryTerm nome da atração, ou a cidade quando não há atração
 * @param {string | null | undefined} [contextTerm] cidade, somada ao termo principal para desambiguar
 * @returns {string | null} null quando os dois vêm vazios — nunca um link de busca vazia
 */
export const buildGetYourGuideSearchUrl = (primaryTerm, contextTerm) => {
  const primary = String(primaryTerm || '').trim();
  const context = String(contextTerm || '').trim();
  const query = [primary, context].filter(Boolean).join(', ');
  if (!query) return null;

  return `https://www.getyourguide.com/s/?q=${encodeURIComponent(query)}`
    + `&partner_id=${GETYOURGUIDE_PARTNER_ID}&utm_medium=online_publisher`;
};
