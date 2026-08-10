import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CountryFlag from './CountryFlag';
import { COUNTRIES_STATIC } from '../data/countriesStaticData';
import { getCountryNamePtByCode } from '../utils/countryUtils';
import { searchCountries } from '../utils/geoSearch';

const COUNTRIES = Object.entries(COUNTRIES_STATIC).map(([code, country]) => ({
  code,
  name: getCountryNamePtByCode(code, country.name),
  nameEn: country.name,
}));

export default function MultiCountrySelector({ label, selected = [], onChange }) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchCountries(COUNTRIES, query, 8), [query]);
  const selectedCodes = new Set(selected.map(item => item.code));

  const toggle = country => {
    if (selectedCodes.has(country.code)) onChange(selected.filter(item => item.code !== country.code));
    else onChange([...selected, { code: country.code, name: country.name, nameEn: country.nameEn }]);
    setQuery('');
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {!!selected.length && (
        <View style={styles.selectedList}>
          {selected.map((country, index) => (
            <TouchableOpacity key={country.code} style={styles.selectedChip} onPress={() => toggle(country)}>
              <CountryFlag countryCode={country.code} width={22} height={15} borderRadius={2} />
              <Text style={styles.selectedName}>{country.name}</Text>
              {index === 0 && <Text style={styles.primary}>PRINCIPAL</Text>}
              <Ionicons name="close-circle" size={17} color="#A9B0C9" />
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={styles.inputWrap}>
        <Ionicons name="add-circle-outline" size={19} color="#A78BFA" />
        <TextInput value={query} onChangeText={setQuery} placeholder="Buscar país para adicionar" placeholderTextColor="#626987" style={styles.input} autoCorrect={false} />
      </View>
      {!!query.trim() && results.length > 0 && (
        <View style={styles.results}>
          {results.map(country => {
            const checked = selectedCodes.has(country.code);
            return (
              <TouchableOpacity key={country.code} style={styles.result} onPress={() => toggle(country)}>
                <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={21} color={checked ? '#00D1C1' : '#7B84A4'} />
                <CountryFlag countryCode={country.code} width={28} height={19} borderRadius={3} />
                <Text style={styles.resultName}>{country.name}</Text>
                <Text style={styles.resultCode}>{country.code}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      <Text style={styles.helper}>Selecione um ou mais países. O primeiro será o destino principal.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { width: '100%', gap: 7, zIndex: 20 },
  label: { color: '#A5ACC8', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7 },
  selectedList: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  selectedChip: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, borderRadius: 99, backgroundColor: 'rgba(108,43,217,0.24)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.45)' },
  selectedName: { color: '#F7F7F2', fontSize: 11, fontWeight: '800' },
  primary: { color: '#C4B5FD', fontSize: 7, fontWeight: '900', letterSpacing: 0.7 },
  inputWrap: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, backgroundColor: '#202744', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  input: { flex: 1, color: '#F7F7F2', paddingVertical: 12, fontSize: 14 },
  results: { backgroundColor: '#252D4C', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#3A4367' },
  result: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  resultName: { flex: 1, color: '#F7F7F2', fontSize: 13, fontWeight: '700' },
  resultCode: { color: '#8189A8', fontSize: 10, fontWeight: '800' },
  helper: { color: '#747D9D', fontSize: 10, lineHeight: 15 },
});
