import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CountryFlag from './CountryFlag';
import { FALLBACK_CURRENCIES, getAvailableCurrencies } from '../services/currencyService';

export const CURRENCIES = FALLBACK_CURRENCIES;

export default function CurrencyPicker({ label = '', value, onChange, supportingText = '' }) {
  const [visible, setVisible] = useState(false);
  const [currencies, setCurrencies] = useState(FALLBACK_CURRENCIES);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const selected = currencies.find(item => item.code === value)
    || { code: value || 'BRL', name: value || 'Real brasileiro', country: '' };
  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
  const filteredCurrencies = useMemo(() => currencies.filter(item => (
    !normalizedQuery
    || item.code.toLocaleLowerCase('pt-BR').includes(normalizedQuery)
    || item.name.toLocaleLowerCase('pt-BR').includes(normalizedQuery)
  )), [currencies, normalizedQuery]);

  useEffect(() => {
    let active = true;
    getAvailableCurrencies().then(items => {
      if (active) setCurrencies(items);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const selectCurrency = item => {
    onChange(item.code);
    setQuery('');
    setVisible(false);
  };

  return (
    <View style={styles.field}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity
        style={styles.selector}
        onPress={() => setVisible(true)}
        accessibilityRole="button"
        accessibilityLabel={`Selecionar moeda. Atual: ${selected.name}, ${selected.code}`}
      >
        {selected.country
          ? <CountryFlag countryCode={selected.country} width={27} height={18} borderRadius={3} />
          : <Ionicons name="cash-outline" size={21} color="#A78BFA" />}
        <View style={{ flex: 1 }}><Text style={styles.code}>{selected.code}</Text><Text style={styles.name} numberOfLines={1}>{selected.name}</Text></View>
        <Ionicons name="chevron-down" size={17} color="#858DAD" />
      </TouchableOpacity>
      {!!supportingText && <Text style={styles.supportingText}>{supportingText}</Text>}
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setVisible(false)}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Escolha a moeda</Text>
                <Text style={styles.modalSubtitle}>Pesquise pelo nome ou código internacional.</Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Fechar seletor de moeda"
              >
                <Ionicons name="close" size={20} color="#B2B8CF" />
              </TouchableOpacity>
            </View>
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={18} color="#858DAD" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Ex: dólar, euro ou USD"
                placeholderTextColor="#626987"
                style={styles.searchInput}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {loading && <ActivityIndicator size="small" color="#A78BFA" />}
            </View>
            <FlatList
              data={filteredCurrencies}
              keyExtractor={item => item.code}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.emptyText}>Nenhuma moeda encontrada.</Text>}
              renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.option, item.code === value && styles.optionActive]}
                onPress={() => selectCurrency(item)}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${item.code}`}
                accessibilityState={{ selected: item.code === value }}
              >
                {item.country
                  ? <CountryFlag countryCode={item.country} width={32} height={22} borderRadius={4} />
                  : <Ionicons name="cash-outline" size={23} color="#858DAD" />}
                <View style={{ flex: 1 }}><Text style={styles.optionName}>{item.name}</Text><Text style={styles.optionCode}>{item.code}</Text></View>
                {item.code === value && <Ionicons name="checkmark-circle" size={20} color="#A78BFA" />}
              </TouchableOpacity>
            )} />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flex: 1, minWidth: 180, gap: 6 },
  label: { color: '#A5ACC8', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7 },
  selector: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#202744', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  code: { color: '#F7F7F2', fontWeight: '900', fontSize: 12 },
  name: { color: '#858DAD', fontSize: 9, marginTop: 1 },
  supportingText: { color: '#35D3C8', fontSize: 10, fontWeight: '700', marginTop: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 18 },
  modal: { width: '100%', maxWidth: 440, maxHeight: '78%', backgroundColor: '#171D36', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#30395D' },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  title: { color: '#fff', fontSize: 17, fontWeight: '900' },
  modalSubtitle: { color: '#858DAD', fontSize: 10, lineHeight: 15, marginTop: 3 },
  closeButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.05)' },
  searchBox: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, marginBottom: 8, borderRadius: 12, backgroundColor: '#10162B', borderWidth: 1, borderColor: '#30395D' },
  searchInput: { flex: 1, color: '#F7F7F2', fontSize: 13, paddingVertical: 10 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 58, padding: 10, borderRadius: 12 },
  optionActive: { backgroundColor: 'rgba(139,92,246,0.14)' },
  optionName: { color: '#E7E8F1', fontSize: 13, fontWeight: '700' },
  optionCode: { color: '#777F9E', fontSize: 10, marginTop: 2 },
  emptyText: { color: '#858DAD', fontSize: 12, textAlign: 'center', paddingVertical: 24 },
});
