import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Svg, Path, G } from 'react-native-svg';
import * as d3 from 'd3-geo';
import { COLORS } from '../../utils/constants';
import { loadWorldCountries, VISITED_COUNTRIES } from '../../data/worldGeoData';

export default function WorldMap({ onCountryPress }) {
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [hoveredCountry, setHoveredCountry] = useState(null);

  useEffect(() => {
    loadMapData();
  }, []);

  const loadMapData = async () => {
    const data = await loadWorldCountries();
    if (data && data.features) {
      setCountries(data.features);
    }
    setLoading(false);
  };

  const isVisited = (countryCode) => {
    return VISITED_COUNTRIES.includes(countryCode);
  };

  const getCountryColor = (country) => {
    const countryCode = country.properties['ISO3166-1-Alpha-3'];
    
    if (hoveredCountry === countryCode) {
      return '#FFB380';
    }
    
    if (selectedCountry === countryCode) {
      return COLORS.primaryDark;
    }
    
    if (isVisited(countryCode)) {
      return COLORS.primary;
    }
    
    return '#E0E0E0';
  };

  const handleCountryClick = (country) => {
    const countryCode = country.properties['ISO3166-1-Alpha-3'];
    const countryName = country.properties.name;
    
    setSelectedCountry(countryCode);
    
    if (onCountryPress) {
      onCountryPress(countryCode, countryName);
    }
  };

  const handleCountryHover = (country) => {
    setHoveredCountry(country.properties['ISO3166-1-Alpha-3']);
  };

  const handleCountryLeave = () => {
    setHoveredCountry(null);
  };

  const projection = d3.geoMercator()
    .scale(220)
    .translate([700, 450]);

  const pathGenerator = d3.geoPath().projection(projection);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Carregando mapa-múndi...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
        <svg 
          width="1400" 
          height="900" 
          viewBox="0 0 1400 900"
          style={{ display: 'block' }}
        >
          {/* Oceano */}
          <rect width="1400" height="900" fill="#E3F2FD" />
          
          {/* Países */}
          <g>
            {countries.map((country, index) => {
              const countryPath = pathGenerator(country);
              const countryCode = country.properties['ISO3166-1-Alpha-3'];
              
              if (!countryPath) return null;
              
              return (
                <path
                  key={`country-${countryCode || index}`}
                  d={countryPath}
                  fill={getCountryColor(country)}
                  stroke="#FFFFFF"
                  strokeWidth="0.5"
                  onClick={() => handleCountryClick(country)}
                  onMouseEnter={() => handleCountryHover(country)}
                  onMouseLeave={handleCountryLeave}
                  style={{ 
                    cursor: 'pointer',
                    transition: 'fill 0.2s ease'
                  }}
                />
              );
            })}
          </g>
          
          {/* Pins nos países visitados - Formato Alfinete Vermelho */}
          {countries.map((country, index) => {
            const countryCode = country.properties['ISO3166-1-Alpha-3'];
            if (!isVisited(countryCode)) return null;
            
            const centroid = pathGenerator.centroid(country);
            if (!centroid || !isFinite(centroid[0]) || !isFinite(centroid[1])) return null;
            
            return (
              <g key={`pin-${countryCode || index}`}>
                {/* Sombra do pin */}
                <ellipse
                  cx={centroid[0]}
                  cy={centroid[1] + 18}
                  rx="8"
                  ry="3"
                  fill="rgba(0,0,0,0.2)"
                />
                
                {/* Corpo do alfinete */}
                <path
                  d={`M ${centroid[0]},${centroid[1]} 
                      L ${centroid[0]},${centroid[1] + 15}`}
                  stroke="#8B0000"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                
                {/* Cabeça do alfinete */}
                <circle
                  cx={centroid[0]}
                  cy={centroid[1] - 5}
                  r="8"
                  fill="#DC143C"
                  stroke="#8B0000"
                  strokeWidth="1.5"
                />
                
                {/* Brilho no alfinete */}
                <circle
                  cx={centroid[0] - 2}
                  cy={centroid[1] - 7}
                  r="2.5"
                  fill="rgba(255,255,255,0.6)"
                />
              </g>
            );
          })}
        </svg>
      </View>
      
      {selectedCountry && (
        <View style={styles.selectedBadge}>
          <Text style={styles.badgeTitle}>
            {countries.find(c => c.properties['ISO3166-1-Alpha-3'] === selectedCountry)?.properties.name}
          </Text>
          <Text style={styles.badgeCode}>Código: {selectedCountry}</Text>
        </View>
      )}
      
      {hoveredCountry && !selectedCountry && (
        <View style={styles.hoverBadge}>
          <Text style={styles.hoverText}>
            {countries.find(c => c.properties['ISO3166-1-Alpha-3'] === hoveredCountry)?.properties.name}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.gray,
  },
  selectedBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.25)',
    zIndex: 10,
  },
  badgeTitle: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  badgeCode: {
    color: 'white',
    fontSize: 11,
    marginTop: 4,
    opacity: 0.9,
  },
  hoverBadge: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  hoverText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '500',
  },
});
