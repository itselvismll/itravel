// A folha que abre ao tocar numa parada do roteiro — ou num badge de grupo.
//
// ELA SUBSTITUI O POPUP. Antes, tocar num pino abria um cartão dentro do mapa
// com um botão "Ver em 15 min a pé", e só o toque nesse botão desenhava a área.
// Eram dois toques e duas superfícies para uma pergunta só. Agora o toque na
// parada já é a pergunta: a área sai no mapa e a folha lista o que há dentro
// dela. O cartão do popup virou o cabeçalho desta folha — inclusive a bandeira,
// que saiu de cima do pino e veio para cá, onde ela responde "que país é este?"
// em vez de disputar espaço com o número do dia.
//
// DOIS MODOS, UMA FOLHA. Uma parada mostra os lugares por perto; um grupo mostra
// as paradas que ele juntou. São a mesma lista compacta com o mesmo gesto de
// fechar, e separá-las em dois componentes duplicaria o layout inteiro por causa
// do conteúdo de três linhas que muda.
//
// Componente React Native puro — nenhuma dependência de mapa. Na web ele flutua
// sobre o canvas do MapLibre; no iOS/Android, sobre a WebView do globo. O mesmo
// arquivo nos dois casos.
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CountryFlag from '../CountryFlag';
import { CATEGORY_ICON } from './planRoute';
import { getCountryNamePtByCode } from '../../utils/countryUtils';
import { NEARBY_PREVIEW_COUNT } from '../../utils/nearbyPlaces';

/**
 * @param {{
 *   stop?: any,
 *   cluster?: { count?: number, members?: any[] } | null,
 *   places?: Array<any>,
 *   loading?: boolean,
 *   failed?: boolean,
 *   minutes?: number,
 *   onSelectStop?: (properties: any) => void,
 *   onFocusPlace?: (place: any) => void,
 *   onNavigatePlace?: (place: any) => void,
 *   focusedPlaceId?: string | null,
 *   onHeightChange?: (height: number) => void,
 *   onClose?: () => void,
 *   bottom?: number,
 * }} props
 */
export default function NearbyPlacesSheet({
  stop = null,
  cluster = null,
  places = [],
  loading = false,
  failed = false,
  minutes = 15,
  onSelectStop,
  onFocusPlace,
  onNavigatePlace,
  focusedPlaceId = null,
  onHeightChange,
  onClose,
  bottom = 0,
}) {
  const [expanded, setExpanded] = useState(false);

  // Abrir outra parada recolhe a lista. Sem isto, quem expandiu uma parada com
  // doze lugares abriria a próxima já rolada, sem ter pedido.
  useEffect(() => {
    setExpanded(false);
  }, [stop?.title, stop?.latitude, stop?.longitude, cluster?.count]);

  if (!stop && !cluster) return null;

  const members = cluster?.members ?? [];
  const visible = expanded ? places : places.slice(0, NEARBY_PREVIEW_COUNT);
  const hidden = places.length - visible.length;

  return (
    <View style={[styles.sheet, { bottom }]} pointerEvents="box-none">
      {/* A altura medida vai para o mapa: é ela que diz quanto da tela está
          coberto, e é com ela que a área a pé é enquadrada na faixa que sobra em
          vez de nascer atrás desta folha. */}
      <View
        style={styles.card}
        onLayout={(event) => onHeightChange?.(event.nativeEvent.layout.height)}
      >
        {cluster ? (
          <View style={styles.header}>
            <View style={styles.clusterBadge}>
              <Text style={styles.clusterCount}>{cluster.count ?? members.length}</Text>
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title} numberOfLines={1}>
                {members.length === 1 ? '1 parada aqui' : `${members.length} paradas aqui`}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                Muito perto umas das outras neste zoom
              </Text>
            </View>
            <CloseButton onPress={onClose} />
          </View>
        ) : (
          <View style={styles.header}>
            <View style={[styles.pin, { backgroundColor: stop.color || '#6C2BD9' }]}>
              <Text style={styles.pinText}>{stop.sequence ?? stop.order}</Text>
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title} numberOfLines={1}>
                {stop.title || 'Parada do roteiro'}
              </Text>
              <View style={styles.subtitleRow}>
                {/* A bandeira só entra quando o país foi resolvido: uma bandeira
                    errada é pior do que nenhuma. */}
                {!!stop.countryCode && (
                  <CountryFlag
                    countryCode={stop.countryCode}
                    width={18}
                    height={12}
                    borderRadius={2}
                  />
                )}
                <Text style={styles.subtitle} numberOfLines={1}>
                  {[
                    stop.countryCode ? getCountryNamePtByCode(stop.countryCode, '') : '',
                    `Dia ${stop.day}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            </View>
            <CloseButton onPress={onClose} />
          </View>
        )}

        {cluster ? (
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {members.map((member, index) => (
              <TouchableOpacity
                key={`${member?.title}-${member?.day}-${index}`}
                onPress={() => onSelectStop?.(member)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Abrir ${member?.title || 'parada'} do dia ${member?.day}`}
                style={styles.row}
              >
                <View style={[styles.rowPin, { backgroundColor: member?.color || '#6C2BD9' }]}>
                  <Text style={styles.rowPinText}>{member?.sequence ?? member?.order}</Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {member?.title || 'Parada do roteiro'}
                  </Text>
                  <View style={styles.rowMetaRow}>
                    <Ionicons
                      name={CATEGORY_ICON[member?.category] || CATEGORY_ICON.outro}
                      size={12}
                      color="#7A7E8C"
                    />
                    <Text style={styles.rowMeta} numberOfLines={1}>Dia {member?.day}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.35)" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <>
            <Text style={styles.sectionTitle}>{`A ${minutes} min a pé daqui`}</Text>

            {loading && !places.length ? (
              <View style={styles.status}>
                <ActivityIndicator size="small" color="#00D1C1" />
                <Text style={styles.statusText}>Procurando o que há por perto…</Text>
              </View>
            ) : null}

            {/* O aviso é discreto de propósito: a área e a lista são um extra
                sobre um mapa que já funciona, e uma tela de erro para um extra
                custa mais atenção do que vale. */}
            {!loading && failed ? (
              <View style={styles.status}>
                <Text style={styles.statusText}>
                  Não foi possível calcular o que há por perto agora.
                </Text>
              </View>
            ) : null}

            {!loading && !failed && !places.length ? (
              <View style={styles.status}>
                <Text style={styles.statusText}>
                  Nada de interesse a {minutes} minutos a pé daqui.
                </Text>
              </View>
            ) : null}

            {places.length ? (
              <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                {visible.map((place) => (
                  <View
                    key={place.id}
                    style={[styles.row, focusedPlaceId === place.id && styles.rowFocused]}
                  >
                    {/* O toque na LINHA só acende o lugar no mapa. Abrir o app de
                        mapas a partir dela tiraria o usuário do Journi sem ele
                        ter pedido — quem quer navegar toca no ícone ao lado. */}
                    <TouchableOpacity
                      onPress={() => onFocusPlace?.(place)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityState={{ selected: focusedPlaceId === place.id }}
                      accessibilityLabel={`Mostrar ${place.name} no mapa`}
                      style={styles.rowMain}
                    >
                      <View style={styles.rowIcon}>
                        <Ionicons
                          name={CATEGORY_ICON[place.category] || CATEGORY_ICON.outro}
                          size={16}
                          color="#00D1C1"
                        />
                      </View>
                      <View style={styles.rowText}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {place.name}
                        </Text>
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          {place.categoryLabel} · {place.minutes} min a pé
                        </Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => onNavigatePlace?.(place)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Traçar rota a pé até ${place.name}`}
                      hitSlop={6}
                      style={styles.routeButton}
                    >
                      <Ionicons name="navigate-outline" size={16} color="#00D1C1" />
                    </TouchableOpacity>
                  </View>
                ))}

                {hidden > 0 ? (
                  <Pressable
                    onPress={() => setExpanded(true)}
                    accessibilityRole="button"
                    accessibilityLabel={`Ver mais ${hidden} lugares`}
                    style={({ pressed }) => [styles.moreButton, pressed && styles.morePressed]}
                  >
                    <Text style={styles.moreText}>Ver mais {hidden}</Text>
                  </Pressable>
                ) : null}
              </ScrollView>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

const CloseButton = ({ onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel="Fechar"
    hitSlop={8}
    style={styles.close}
  >
    <Ionicons name="close" size={18} color="rgba(255,255,255,0.6)" />
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1002,
    paddingHorizontal: 12,
  },
  card: {
    borderRadius: 18,
    padding: 14,
    gap: 10,
    backgroundColor: 'rgba(13,19,38,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(108,43,217,0.4)',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerText: { flex: 1, gap: 3 },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  pinText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  clusterBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D1326',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  clusterCount: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  title: {
    color: '#F7F7F2',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 14,
    fontWeight: '700',
  },
  subtitle: {
    color: '#A2A9C5',
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
    flexShrink: 1,
  },
  close: { padding: 2 },
  sectionTitle: {
    color: '#00D1C1',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  // Teto de altura: a folha complementa o mapa, não o substitui. O que não cabe
  // rola aqui dentro, e o globo continua visível acima dela.
  list: { maxHeight: 210 },
  listContent: { gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  // O lugar aceso no mapa fica aceso na lista também: sem isso, quem tocou perde
  // de vista qual das doze linhas é o ponto que apareceu lá fora.
  rowFocused: {
    backgroundColor: 'rgba(0,209,193,0.10)',
    borderRadius: 10,
    paddingHorizontal: 6,
    marginHorizontal: -6,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  routeButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,209,193,0.35)',
    backgroundColor: 'rgba(0,209,193,0.10)',
  },
  rowIcon: { width: 22, alignItems: 'center', justifyContent: 'center' },
  rowMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowPin: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  rowPinText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  rowText: { flex: 1, gap: 1 },
  rowTitle: {
    color: '#F7F7F2',
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    fontWeight: '600',
  },
  rowMeta: {
    color: '#7A7E8C',
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
  },
  moreButton: { paddingVertical: 8, alignItems: 'center' },
  morePressed: { opacity: 0.7 },
  moreText: {
    color: '#00D1C1',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
    fontWeight: '700',
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  statusText: {
    color: '#7A7E8C',
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    flex: 1,
  },
});
