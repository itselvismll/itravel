// Lista completa de países de uma seção do perfil, em tela cheia.
//
// É para onde o card "+N" do CountryGridSection leva. Modal e não rota nova: a
// lista é uma expansão do card que a abriu, não um lugar do app — fechar tem de
// devolver o usuário exatamente onde ele estava, com o scroll do perfil intacto.
//
// Não sabe de qual seção veio: recebe países, título e cor. Passaporte e
// wishlist são a mesma tela com dados e um teal diferentes.
import React, { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CountryTag from './CountryTag';
import { filterCountries, groupByContinent } from '../../utils/countryContinents';
import { countryKey, tagRotation } from './countryGridData';

/**
 * @param {{
 *   visible: boolean,
 *   onClose: () => void,
 *   countries?: Array<any>,
 *   title?: string,
 *   accentColor?: string,
 *   accentBorderColor?: string,
 * }} props
 */
export default function CountryListModal({
  visible,
  onClose,
  countries = [],
  title = 'Países',
  accentColor,
  accentBorderColor,
}) {
  const [query, setQuery] = useState('');

  // Filtra ANTES de agrupar: agrupar a lista inteira e depois filtrar dentro de
  // cada seção deixaria cabeçalhos de continente sem nenhum país embaixo.
  const sections = useMemo(
    () => groupByContinent(filterCountries(countries, query)),
    [countries, query]
  );

  const total = countries?.length ?? 0;
  const found = sections.reduce((sum, section) => sum + section.data.length, 0);

  // A busca não é persistida entre aberturas: reabrir a lista com o filtro de
  // ontem escondendo metade dos países pareceria dado faltando.
  const handleClose = () => {
    setQuery('');
    onClose?.();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      presentationStyle="fullScreen"
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Fechar"
            style={styles.closeButton}
            // A área de toque do X é maior que o ícone: 24px de ícone é menos
            // que o mínimo confortável para o polegar no topo da tela.
            hitSlop={12}
          >
            <Ionicons name="close" size={24} color="#F7F7F2" />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <Text style={styles.subtitle}>
              {total} {total === 1 ? 'país' : 'países'}
            </Text>
          </View>
        </View>

        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color="#A2A9C5" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar país"
            placeholderTextColor="#697093"
            style={styles.searchInput}
            autoCorrect={false}
            // O teclado de busca fecha com "Buscar" em vez de quebrar linha, e o
            // filtro já roda a cada tecla — não há o que submeter.
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {!!query && (
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Limpar busca">
              <Ionicons name="close-circle" size={16} color="#697093" />
            </Pressable>
          )}
        </View>

        <SectionList
          sections={sections}
          keyExtractor={countryKey}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, !!accentColor && { color: accentColor }]}>
                {section.title}
              </Text>
              <Text style={styles.sectionCount}>{section.data.length}</Text>
            </View>
          )}
          renderItem={({ item, index }) => (
            <View style={styles.row}>
              <CountryTag
                country={item}
                // Na lista a etiqueta fica reta: a rotação existe para dar o ar
                // de adesivo colado num grid solto, e empilhada em coluna ela só
                // desalinharia a margem esquerda.
                rotation={0}
                accentColor={accentColor}
                accentBorderColor={accentBorderColor}
              />
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyText}>
                {query
                  ? `Nenhum país encontrado para "${query.trim()}".`
                  : 'Nenhum país nesta lista ainda.'}
              </Text>
            </View>
          }
        />

        {/* A contagem do filtro só aparece quando há filtro: sem busca ela
            repetiria o total que já está no cabeçalho. */}
        {!!query && found > 0 && (
          <Text style={styles.resultCount}>
            {found} {found === 1 ? 'resultado' : 'resultados'}
          </Text>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1326' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 16 : 8,
    paddingBottom: 12,
  },
  closeButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  title: {
    color: '#F7F7F2',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  subtitle: { color: '#A2A9C5', fontSize: 12, marginTop: 2 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#171D36',
    borderWidth: 1,
    borderColor: '#252B42',
  },
  searchInput: {
    flex: 1,
    color: '#F7F7F2',
    fontSize: 14,
    // O outline do input no web é do browser e destoa da borda do campo.
    ...Platform.select({ web: /** @type {any} */ ({ outlineStyle: 'none' }), default: {} }),
  },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#F7F7F2',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sectionCount: { color: '#697093', fontSize: 11, fontWeight: '700' },
  row: { marginBottom: 10 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyIcon: { fontSize: 32 },
  emptyText: { color: '#A2A9C5', fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },
  resultCount: {
    color: '#697093',
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 10,
  },
});
