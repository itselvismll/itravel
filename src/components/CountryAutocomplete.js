import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COUNTRIES_STATIC } from '../data/countriesStaticData';
import { getCountryNamePtByCode } from '../utils/countryUtils';
import CountryFlag from './CountryFlag';

const COUNTRIES = Object.entries(COUNTRIES_STATIC)
  .map(([code, country]) => ({ code, name: getCountryNamePtByCode(code, country.name), nameEn: country.name }))
  .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

export default function CountryAutocomplete({ label, value, onChange, placeholder = 'Busque um país' }) {
  const [focused, setFocused] = useState(false);
  const results = useMemo(() => {
    const query = String(value || '').trim().toLocaleLowerCase('pt-BR');
    if (!focused || query.length < 1) return [];
    return COUNTRIES.filter(country => (
      country.name.toLocaleLowerCase('pt-BR').includes(query)
      || country.nameEn.toLowerCase().includes(query)
      || country.code.toLowerCase().includes(query)
    )).slice(0, 6);
  }, [focused, value]);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={text => onChange(text, null)}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        placeholderTextColor="#626987"
        style={styles.input}
        autoComplete="country"
      />
      {results.length > 0 && (
        <View style={styles.results}>
          {results.map(country => (
            <TouchableOpacity
              key={country.code}
              style={styles.result}
              onPress={() => {
                onChange(country.name, country);
                setFocused(false);
              }}
            >
              <CountryFlag countryCode={country.code} width={28} height={19} borderRadius={3} />
              <Text style={styles.resultName}>{country.name}</Text>
              <Text style={styles.resultCode}>{country.code}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { width: '100%', gap: 6, zIndex: 20 },
  label: { color: '#A5ACC8', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7 },
  input: { color: '#F7F7F2', backgroundColor: '#202744', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', paddingHorizontal: 13, paddingVertical: 12, fontSize: 14 },
  results: { backgroundColor: '#252D4C', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#3A4367' },
  result: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  resultName: { color: '#F7F7F2', flex: 1, fontSize: 13, fontWeight: '700' },
  resultCode: { color: '#8189A8', fontSize: 10, fontWeight: '800' },
});

