// O menu de acoes de um participante: promover, permitir edicao, remover.
//
// POR QUE UM `Modal` E NAO UMA `View` ABSOLUTA DENTRO DA LINHA
//
// A tentacao e posicionar o menu dentro da propria linha (`position:absolute`),
// como no mockup. Funciona na prancheta e quebra no app, por tres motivos que so
// aparecem no aparelho:
//
//  1. a lista vive dentro de um ScrollView; um menu que passe da borda do card e
//     RECORTADO, e o ultimo participante da lista — justamente o mais provavel
//     de precisar de acao — abriria um menu cortado pela metade;
//  2. no Android o empilhamento nao obedece so ao `zIndex`: sem `elevation`, o
//     menu some ATRAS das linhas seguintes;
//  3. tocar fora para fechar exigiria um fundo do tamanho da tela, que dentro do
//     ScrollView briga com a rolagem.
//
// O `Modal` resolve os tres de uma vez: ele desenha por cima de tudo, em
// qualquer plataforma. O preco e que ele nao sabe onde a pessoa tocou — dai a
// MEDICAO: quem abre o menu mede o botao na janela e passa as coordenadas, e o
// menu se ancora nelas. E o que mantem a promessa da direcao visual (o menu abre
// perto do avatar daquela pessoa, nao no centro da tela).
//
// Componente React Native puro: o mesmo arquivo nas tres plataformas.
import React from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { trip, font, shadow, radius } from '../../theme/tripCollab';
import { useLocale } from '../../i18n/LocaleProvider';

const LARGURA = 208;
/** Respiro minimo ate a borda da tela, para o menu nunca encostar. */
const MARGEM = 12;

/**
 * @typedef {{
 *   key: string,
 *   label: string,
 *   icon: string,
 *   color?: string,
 *   destructive?: boolean,
 *   onPress: () => void,
 * }} MemberAction
 */

/**
 * @param {{
 *   visible?: boolean,
 *   anchor?: { x: number, y: number, width: number, height: number } | null,
 *   actions?: Array<MemberAction>,
 *   onClose: () => void,
 * }} props
 */
export default function MemberActionsMenu({ visible = false, anchor = null, actions = [], onClose }) {
  const { t } = useLocale();
  const { width: larguraTela, height: alturaTela } = useWindowDimensions();

  if (!visible || !actions.length) return null;

  // Altura estimada para decidir se o menu cabe abaixo do botao. Nao precisa ser
  // exata — precisa errar para MAIS, senao o menu abre para baixo, nao cabe, e
  // fica com a ultima acao fora da tela.
  const alturaItem = 46;
  const alturaMenu = actions.length * alturaItem + (actions.length - 1) + 8;

  const base = anchor || { x: larguraTela - LARGURA - MARGEM, y: 80, width: 0, height: 0 };

  // Alinhado pela DIREITA do botao, como no mockup: o menu cresce para a
  // esquerda, na direcao de onde ha espaco (o botao fica sempre na borda direita
  // da linha).
  const left = Math.min(
    Math.max(MARGEM, base.x + base.width - LARGURA),
    larguraTela - LARGURA - MARGEM
  );

  // Abaixo do botao por padrao; acima quando nao couber. Sem esta inversao, o
  // menu do ultimo participante nasceria fora da tela.
  const abaixo = base.y + base.height + 6;
  const cabeAbaixo = abaixo + alturaMenu + MARGEM <= alturaTela;
  const top = cabeAbaixo ? abaixo : Math.max(MARGEM, base.y - alturaMenu - 6);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      // Android: sem isto o menu abre numa janela que pinta por cima da barra de
      // status e a tela "pisca" de cor ao abrir.
      statusBarTranslucent
    >
      {/* O fundo inteiro fecha o menu. E invisivel de proposito: escurecer a
          tela transformaria uma acao pequena (mudar o papel de alguem) num
          momento pesado. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('tripMemberActions.closeLabel')} />

      <View style={[styles.menu, { left, top }]}>
        {actions.map((action, index) => (
          <View key={action.key}>
            {/* Separadores finos ENTRE os itens, nunca antes do primeiro nem
                depois do ultimo: uma linha encostada na borda arredondada do
                menu aparece como um risco solto. */}
            {index > 0 ? <View style={styles.separator} /> : null}

            <Pressable
              onPress={() => {
                // Fecha ANTES de agir. A acao navega ou dispara rede; deixar o
                // menu aberto por tras de um alerta de confirmacao e o tipo de
                // detalhe que faz a interface parecer travada.
                onClose();
                action.onPress();
              }}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <Ionicons
                name={/** @type {any} */ (action.icon)}
                size={16}
                color={action.color || trip.ink}
              />
              <Text
                style={[styles.label, action.destructive && { color: trip.d1 }]}
                numberOfLines={1}
              >
                {action.label}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    width: LARGURA,
    backgroundColor: trip.card2,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: trip.line2,
    paddingVertical: 4,
    overflow: 'hidden',
    ...shadow.menu,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  itemPressed: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  label: {
    flex: 1,
    color: trip.ink,
    fontFamily: font.bodyMedium,
    fontSize: 13,
  },
  separator: {
    height: 1,
    backgroundColor: trip.line,
    // Recuado nos dois lados: e o "separador fino" do mockup, que separa sem
    // cortar o menu de ponta a ponta.
    marginHorizontal: 14,
  },
});
