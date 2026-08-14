import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CountryFlag from './CountryFlag';
import { COUNTRIES_STATIC } from '../data/countriesStaticData';
import { getCountryNamePtByCode } from '../utils/countryUtils';
import { searchCities, searchCountries, CITY_SEARCH_DEBOUNCE_MS } from '../utils/geoSearch';

const COUNTRIES = Object.entries(COUNTRIES_STATIC).map(([code, country]) => ({
  code,
  name: getCountryNamePtByCode(code, country.name),
  nameEn: country.name,
}));

export default function LocationAutocomplete({ label, value, onChange, placeholder = 'Busque uma cidade ou país' }) {
  const [focused, setFocused] = useState(false);
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(false);
  const selectedRef = useRef(false);

  const countries = useMemo(
    () => focused ? searchCountries(COUNTRIES, value, 4) : [],
    [focused, value]
  );

  useEffect(() => {
    if (!focused || selectedRef.current || String(value || '').trim().length < 2) {
      setCities([]);
      setLoading(false);
      selectedRef.current = false;
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        setCities(await searchCities(value, { signal: controller.signal, limit: 6 }));
      } catch (error) {
        if (error?.name !== 'AbortError') setCities([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, CITY_SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [focused, value]);

  const choose = item => {
    selectedRef.current = true;
    setFocused(false);
    setCities([]);
    onChange(item.label, item);
  };

  const results = [
    ...countries.map(country => ({
      id: `country-${country.code}`,
      type: 'country',
      label: country.name,
      subtitle: 'País',
      countryCode: country.code,
    })),
    ...cities.map((city, index) => ({
      id: `city-${city.countryCode}-${city.shortName}-${index}`,
      type: 'city',
      label: [city.shortName, city.state, city.country].filter(Boolean).join(', '),
      subtitle: 'Cidade',
      countryCode: city.countryCode,
      city,
    })),
  ];

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <Ionicons name="location-outline" size={18} color="#858DAD" />
        <TextInput
          value={value}
          onChangeText={text => { selectedRef.current = false; onChange(text, null); }}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          placeholderTextColor="#626987"
          style={styles.input}
          autoCorrect={false}
        />
        {loading && <ActivityIndicator size="small" color="#A78BFA" />}
      </View>
      {focused && results.length > 0 && (
        <View style={styles.results}>
          {results.map(item => (
            <TouchableOpacity key={item.id} style={styles.result} onPress={() => choose(item)}>
              <CountryFlag countryCode={item.countryCode} width={28} height={19} borderRadius={3} />
              <View style={{ flex: 1 }}><Text style={styles.resultName}>{item.label}</Text><Text style={styles.resultType}>{item.subtitle}</Text></View>
              <Ionicons name={item.type === 'city' ? 'business-outline' : 'earth-outline'} size={17} color="#7E86A6" />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { width: '100%', gap: 6, zIndex: 30 },
  label: { color: '#A5ACC8', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7 },
  inputWrap: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, backgroundColor: '#202744', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  input: { flex: 1, color: '#F7F7F2', paddingVertical: 12, fontSize: 14 },
  results: { backgroundColor: '#252D4C', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#3A4367' },
  result: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  resultName: { color: '#F7F7F2', fontSize: 12, fontWeight: '700' },
  resultType: { color: '#7E86A6', fontSize: 9, marginTop: 2 },
});
