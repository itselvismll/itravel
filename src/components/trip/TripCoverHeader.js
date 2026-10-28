// A capa da viagem: foto do destino, botões flutuantes, nome grande por cima e
// os chips de metadados sobrepondo a borda de baixo.
//
// A FOTO NÃO É DO USUÁRIO nesta fase. Ela vem do tourismImageService, que já
// existia no app (busca no Wikimedia Commons, com cache) e é o mesmo caminho que
// a tela Explorar usa — upload de capa própria traria storage e moderação junto.
//
// `expo-image` e não `Image` do React Native: é ele que tem cache em disco. Uma
// capa de 900px baixada de novo a cada abertura da viagem é o tipo de custo que
// só aparece no plano de dados de quem está viajando, que é exatamente quem usa
// esta tela.
//
// TRÊS DECISÕES DE DESENHO QUE PARECEM ENFEITE E NÃO SÃO:
//
//   • a capa tem margem lateral e cantos de 22px em vez de sangrar a tela. Ela
//     vira um CARTÃO, e o cartão diz "esta é uma viagem", que é a unidade que a
//     lista e esta tela compartilham;
//   • os chips sobem 22px sobre a borda de baixo. A sobreposição é o que cria
//     profundidade entre a foto e o conteúdo — colados abaixo, eles pareceriam
//     uma segunda barra;
//   • os botões flutuam SOBRE a foto, em círculos translúcidos. É o padrão de
//     tela com capa: a navegação não pode roubar altura de uma imagem que é
//     metade da mensagem.
//
// Componente React Native puro: o mesmo arquivo nas três plataformas.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocale } from '../../i18n/LocaleProvider';

// `backdrop-filter` é CSS: existe no web e o React Native ignora a chave (com
// aviso). Fora do web o círculo fica no fundo sólido translúcido, que é o mesmo
// recurso que o pill do globo já usa.
const blur = Platform.OS === 'web'
  ? { backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }
  : null;

/** Cor do ícone de cada chip. Não é decoração: são as mesmas cores dos dias e do
 * acento do app, e é o que impede a fileira de chips de virar um bloco cinza. */
const CHIP_ICON_COLOR = {
  date: '#A78BFA',
  duration: '#E9B949',
  travelers: '#00D1C1',
  stops: '#FF4D6D',
};

const CircleButton = ({ icon, label, onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.75}
    accessibilityRole="button"
    accessibilityLabel={label}
    style={styles.circle}
  >
    <Ionicons name={icon} size={16} color="#FFFFFF" />
  </TouchableOpacity>
);

/**
 * @param {{
 *   destination: string,
 *   photoUrl?: string | null,
 *   chips?: Array<{ id: string, icon: any, label: string }>,
 *   onBack?: () => void,
 *   onOpenMap?: () => void,
 *   onEdit?: () => void,
 *   onMore?: () => void,
 * }} props
 */
export default function TripCoverHeader({
  destination,
  photoUrl = null,
  chips = [],
  onBack,
  onOpenMap,
  onEdit,
  onMore,
}) {
  const { t } = useLocale();
  return (
    <View style={styles.container}>
      <View style={styles.cover}>
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            // Some em disco e volta instantânea na segunda abertura.
            cachePolicy="memory-disk"
            transition={220}
            accessibilityLabel={`Foto de ${destination}`}
          />
        ) : null}

        {/* O degradê existe para o NOME, não para a foto: sem ele, um destino
            com céu claro no rodapé da imagem engole o texto branco. Ele também
            cobre o caso da foto que não veio, deixando a capa como um cartão
            escuro em vez de um buraco. */}
        <LinearGradient
          colors={['rgba(13,19,38,0.10)', 'rgba(13,19,38,0.30)', 'rgba(13,19,38,0.92)']}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />

        {onBack ? (
          <View style={styles.topLeft}>
            <CircleButton icon="chevron-back" label={t('tripCoverHeader.back')} onPress={onBack} />
          </View>
        ) : null}

        <View style={styles.topRight}>
          {onOpenMap ? (
            <CircleButton icon="map-outline" label={t('tripCoverHeader.viewOnGlobe')} onPress={onOpenMap} />
          ) : null}
          {onEdit ? (
            <CircleButton icon="create-outline" label={t('tripCoverHeader.edit')} onPress={onEdit} />
          ) : null}
          {onMore ? (
            <CircleButton icon="ellipsis-horizontal" label={t('tripCoverHeader.moreOptions')} onPress={onMore} />
          ) : null}
        </View>

        {/* Sem `numberOfLines`: o nome de três países PRECISA quebrar em duas
            linhas, e cortar "Itália, Croácia e Eslo…" seria pior do que a
            quebra. O que limita é a altura da capa, que comporta duas linhas
            com folga. */}
        <Text style={styles.destination}>{destination}</Text>
      </View>

      {chips.length ? (
        <View style={styles.chips}>
          {chips.map((chip) => (
            <View key={chip.id} style={styles.chip}>
              <Ionicons
                name={chip.icon}
                size={13}
                color={CHIP_ICON_COLOR[chip.id] || '#A7AEC6'}
              />
              <Text style={styles.chipText} numberOfLines={1}>{chip.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 0 },
  // As margens são RELATIVAS ao container, que na tela da viagem já tem 15px de
  // padding. A capa fica rente a ele (≈15px da borda da tela, o respiro do
  // mockup) e os chips recuam mais 6.
  cover: {
    height: 260,
    borderRadius: 22,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    backgroundColor: '#0D1326',
  },
  topLeft: { position: 'absolute', top: 14, left: 14 },
  topRight: { position: 'absolute', top: 14, right: 14, flexDirection: 'row', gap: 8 },
  circle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(13,19,38,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    ...blur,
  },
  destination: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_700Bold',
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 31,
    paddingHorizontal: 20,
    // O espaço de baixo conta com os chips subindo por cima: sem ele, o nome
    // ficaria atrás do primeiro chip.
    paddingBottom: 34,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  // A margem negativa é a sobreposição: os chips sobem sobre a borda de baixo da
  // capa, e a sombra deles é o que os separa da foto.
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: -22,
    marginHorizontal: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: '#161F38',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  chipText: {
    color: '#E4E7F2',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
    fontWeight: '600',
  },
});
