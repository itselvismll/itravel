import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CountryFlag from './CountryFlag';
import { getAlpha3, buildCountryDirectory } from '../utils/countryUtils';
import { useLocale } from '../i18n/LocaleProvider';
import {
  CITY_SEARCH_DEBOUNCE_MS,
  formatAirportLabel,
  formatAirportSubtitle,
  formatCityLabel,
  isExactAirportCode,
  searchCountries,
  searchTravelLocations,
} from '../utils/geoSearch';

export default function LocationAutocomplete({ label, value, onChange, placeholder = 'Busque uma cidade ou país' }) {
  const { tag } = useLocale();
  const [focused, setFocused] = useState(false);
  const [cities, setCities] = useState([]);
  const [airports, setAirports] = useState([]);
  const [loading, setLoading] = useState(false);
  const selectedRef = useRef(false);
  const blurTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(blurTimerRef.current), []);

  // Recalculado por idioma: o nome de cada país muda com `tag`, e trocar o
  // idioma em runtime não pode deixar a lista presa no idioma de quando o
  // componente montou.
  const allCountries = useMemo(() => buildCountryDirectory(tag), [tag]);

  const countries = useMemo(
    () => focused ? searchCountries(allCountries, value, 4, tag) : [],
    [focused, value, allCountries, tag]
  );

  useEffect(() => {
    if (!focused || selectedRef.current || String(value || '').trim().length < 2) {
      setCities([]);
      setAirports([]);
      setLoading(false);
      selectedRef.current = false;
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await searchTravelLocations(value, {
          signal: controller.signal,
          cityLimit: 6,
          airportLimit: 4,
          tag,
        });
        setCities(result.cities);
        setAirports(result.airports);
      } catch (error) {
        if (error?.name !== 'AbortError') {
          setCities([]);
          setAirports([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, CITY_SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [focused, value, tag]);

  const choose = item => {
    clearTimeout(blurTimerRef.current);
    selectedRef.current = true;
    setFocused(false);
    setCities([]);
    setAirports([]);
    onChange(item.label, item);
  };

  const exactAirports = airports.filter(airport => isExactAirportCode(airport, value));
  const otherAirports = airports.filter(airport => !isExactAirportCode(airport, value));
  const mapAirport = (airport, index) => ({
    id: `airport-${airport.iata || airport.icao || airport.name}-${index}`,
    type: 'airport',
    label: formatAirportLabel(airport),
    subtitle: `Aeroporto${formatAirportSubtitle(airport) ? ` • ${formatAirportSubtitle(airport)}` : ''}`,
    countryCode: airport.countryCode,
    code: getAlpha3(airport.countryCode),
    airport,
  });

  const results = [
    ...exactAirports.map(mapAirport),
    ...countries.map(country => ({
      id: `country-${country.code}`,
      type: 'country',
      label: country.name,
      subtitle: 'País',
      code: country.code,
      countryCode: country.code,
    })),
    ...cities.map((city, index) => ({
      id: `city-${city.countryCode}-${city.shortName}-${index}`,
      type: 'city',
      label: formatCityLabel(city),
      subtitle: 'Cidade',
      countryCode: city.countryCode,
      code: getAlpha3(city.countryCode),
      city,
    })),
    ...otherAirports.map(mapAirport),
  ];

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <Ionicons name="location-outline" size={18} color="#858DAD" />
        <TextInput
          value={value}
          onChangeText={text => { selectedRef.current = false; onChange(text, null); }}
          onFocus={() => {
            clearTimeout(blurTimerRef.current);
            setFocused(true);
          }}
          onBlur={() => {
            blurTimerRef.current = setTimeout(() => setFocused(false), 150);
          }}
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
              <Ionicons
                name={item.type === 'airport' ? 'airplane-outline' : item.type === 'city' ? 'business-outline' : 'earth-outline'}
                size={17}
                color={item.type === 'airport' ? '#35D3C8' : '#7E86A6'}
              />
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
  resultName: { color: '#F7F7F2', fontSize: 12, lineHeight: 17, fontWeight: '700' },
  resultType: { color: '#7E86A6', fontSize: 9, lineHeight: 13, marginTop: 2 },
});
