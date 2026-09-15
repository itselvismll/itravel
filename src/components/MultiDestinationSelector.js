import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CountryFlag from './CountryFlag';
import { COUNTRIES_STATIC } from '../data/countriesStaticData';
import { getAlpha3, getCountryNamePtByCode } from '../utils/countryUtils';
import {
  CITY_SEARCH_DEBOUNCE_MS,
  formatAirportLabel,
  formatAirportSubtitle,
  formatCityLabel,
  isExactAirportCode,
  searchCountries,
  searchTravelLocations,
} from '../utils/geoSearch';

const COUNTRIES = Object.entries(COUNTRIES_STATIC).map(([code, country]) => ({
  code,
  name: getCountryNamePtByCode(code, country.name),
  nameEn: country.name,
}));

export const getTravelDestinationKey = destination => (
  destination?.id || `${destination?.type || 'country'}:${destination?.code || ''}:${destination?.name || ''}`
);

const destinationIcon = type => (
  type === 'airport' ? 'airplane-outline' : type === 'city' ? 'business-outline' : 'earth-outline'
);

export default function MultiDestinationSelector({ label, selected = [], onChange }) {
  const [query, setQuery] = useState('');
  const [cities, setCities] = useState([]);
  const [airports, setAirports] = useState([]);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);
  const countries = useMemo(() => searchCountries(COUNTRIES, query, 3), [query]);
  const selectedKeys = new Set(selected.map(getTravelDestinationKey));

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setCities([]);
      setAirports([]);
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await searchTravelLocations(trimmed, {
          signal: controller.signal,
          cityLimit: 5,
          airportLimit: 3,
        });
        if (requestRef.current === requestId) {
          setCities(result.cities);
          setAirports(result.airports);
        }
      } catch (error) {
        if (error?.name !== 'AbortError' && requestRef.current === requestId) {
          setCities([]);
          setAirports([]);
        }
      } finally {
        if (!controller.signal.aborted && requestRef.current === requestId) setLoading(false);
      }
    }, CITY_SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const exactAirports = airports.filter(airport => isExactAirportCode(airport, query));
  const otherAirports = airports.filter(airport => !isExactAirportCode(airport, query));
  const mapAirport = airport => ({
    id: `airport-${airport.countryCode}-${airport.iata || airport.icao || airport.name}`,
    type: 'airport',
    code: getAlpha3(airport.countryCode),
    countryCode: airport.countryCode,
    countryName: airport.country,
    name: formatAirportLabel(airport),
    nameEn: formatAirportLabel(airport),
    label: formatAirportLabel(airport),
    subtitle: `Aeroporto • ${formatAirportSubtitle(airport)}`,
    airport,
  });

  const results = [
    ...exactAirports.map(mapAirport),
    ...countries.map(country => ({
      id: `country-${country.code}`,
      type: 'country',
      code: country.code,
      countryCode: country.code,
      name: country.name,
      nameEn: country.nameEn,
      label: country.name,
      subtitle: 'País',
    })),
    ...cities.map(city => {
      const labelText = formatCityLabel(city);
      return {
        id: `city-${city.countryCode}-${city.ibgeId || `${city.shortName}-${city.state}`}`,
        type: 'city',
        code: getAlpha3(city.countryCode),
        countryCode: city.countryCode,
        countryName: city.country,
        name: labelText,
        nameEn: labelText,
        label: labelText,
        subtitle: 'Cidade',
        city,
      };
    }),
    ...otherAirports.map(mapAirport),
  ];

  const toggle = destination => {
    const key = getTravelDestinationKey(destination);
    onChange(selectedKeys.has(key)
      ? selected.filter(item => getTravelDestinationKey(item) !== key)
      : [...selected, destination]);
    setQuery('');
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {!!selected.length && (
        <View style={styles.selectedList}>
          {selected.map((destination, index) => (
            <TouchableOpacity
              key={getTravelDestinationKey(destination)}
              style={styles.selectedChip}
              onPress={() => toggle(destination)}
              accessibilityLabel={`Remover ${destination.name}`}
            >
              <CountryFlag countryCode={destination.countryCode || destination.code} width={22} height={15} borderRadius={2} />
              <Ionicons name={destinationIcon(destination.type)} size={14} color="#C4B5FD" />
              <Text style={styles.selectedName} numberOfLines={1}>{destination.name}</Text>
              {index === 0 && <Text style={styles.primary}>PRINCIPAL</Text>}
              <Ionicons name="close-circle" size={17} color="#A9B0C9" />
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.inputWrap}>
        <Ionicons name="search-outline" size={19} color="#A78BFA" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Cidade, país ou aeroporto (ex: GRU)"
          placeholderTextColor="#626987"
          style={styles.input}
          autoCorrect={false}
          autoCapitalize="words"
        />
        {loading && <ActivityIndicator size="small" color="#A78BFA" />}
      </View>

      {!!query.trim() && results.length > 0 && (
        <View style={styles.results}>
          {results.map(destination => {
            const checked = selectedKeys.has(getTravelDestinationKey(destination));
            return (
              <TouchableOpacity
                key={getTravelDestinationKey(destination)}
                style={styles.result}
                onPress={() => toggle(destination)}
              >
                <CountryFlag countryCode={destination.countryCode || destination.code} width={30} height={20} borderRadius={4} />
                <View style={styles.resultCopy}>
                  <Text style={styles.resultName} numberOfLines={2}>{destination.label}</Text>
                  <Text style={styles.resultType} numberOfLines={1}>{destination.subtitle}</Text>
                </View>
                <View style={[styles.typeIcon, checked && styles.typeIconSelected]}>
                  <Ionicons
                    name={checked ? 'checkmark' : destinationIcon(destination.type)}
                    size={17}
                    color={checked ? '#FFFFFF' : '#A78BFA'}
                  />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      <Text style={styles.helper}>Adicione países, cidades específicas ou aeroportos. O primeiro será o destino principal.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { width: '100%', gap: 7, zIndex: 20 },
  label: { color: '#A5ACC8', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7 },
  selectedList: { gap: 7 },
  selectedChip: { minHeight: 40, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, borderRadius: 13, backgroundColor: 'rgba(108,43,217,0.24)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.45)' },
  selectedName: { flexShrink: 1, color: '#F7F7F2', fontSize: 11, fontWeight: '800' },
  primary: { color: '#C4B5FD', fontSize: 7, fontWeight: '900', letterSpacing: 0.7 },
  inputWrap: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, backgroundColor: '#202744', borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  input: { flex: 1, color: '#F7F7F2', paddingVertical: 12, fontSize: 14 },
  results: { backgroundColor: '#171E37', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#3A4367' },
  result: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  resultCopy: { flex: 1, gap: 3 },
  resultName: { color: '#F7F7F2', fontSize: 12, lineHeight: 17, fontWeight: '800' },
  resultType: { color: '#858DAD', fontSize: 9, lineHeight: 13 },
  typeIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: 'rgba(167,139,250,0.09)' },
  typeIconSelected: { backgroundColor: '#6C2BD9' },
  helper: { color: '#747D9D', fontSize: 10, lineHeight: 15 },
});
