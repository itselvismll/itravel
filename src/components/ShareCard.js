import React, { forwardRef } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { getAlpha2, getStampRotation } from '../utils/countryUtils';
import { getLevelInfo } from '../utils/travelerLevels';

const STAMP_COLORS = ['#E74C3C', '#3498DB', '#27AE60', '#9B59B6', '#F39C12', '#1ABC9C'];

const getStampColor = (countryCode) => {
  let hash = 0;
  for (let i = 0; i < countryCode.length; i++) {
    hash = countryCode.charCodeAt(i) + ((hash << 5) - hash);
  }
  return STAMP_COLORS[Math.abs(hash) % STAMP_COLORS.length];
};

// Alpha-3 → nome curto em PT para o carimbo
const COUNTRY_NAMES_PT = {
  BRA:'Brasil', USA:'EUA', ARG:'Argentina', PRT:'Portugal', ESP:'Espanha',
  FRA:'França', ITA:'Itália', DEU:'Alemanha', GBR:'Reino Unido', JPN:'Japão',
  CHN:'China', MEX:'México', COL:'Colômbia', CHL:'Chile', URY:'Uruguai',
  BOL:'Bolívia', PER:'Peru', VEN:'Venezuela', ECU:'Equador', PRY:'Paraguai',
  CAN:'Canadá', AUS:'Austrália', NZL:'N. Zelândia', ZAF:'África do Sul',
  EGY:'Egito', MAR:'Marrocos', NGA:'Nigéria', KEN:'Quênia', THA:'Tailândia',
  VNM:'Vietnã', IDN:'Indonésia', MYS:'Malásia', SGP:'Singapura', IND:'Índia',
  PAK:'Paquistão', RUS:'Rússia', UKR:'Ucrânia', POL:'Polônia', NLD:'Holanda',
  BEL:'Bélgica', CHE:'Suíça', AUT:'Áustria', SWE:'Suécia', NOR:'Noruega',
  DNK:'Dinamarca', FIN:'Finlândia', GRC:'Grécia', TUR:'Turquia', ISR:'Israel',
  SAU:'Arábia Saudita', ARE:'Emirados', QAT:'Catar', KOR:'Coreia do Sul',
  TWN:'Taiwan', HKG:'Hong Kong', CUB:'Cuba', DOM:'Rep. Dominicana',
  GTM:'Guatemala', CRI:'Costa Rica', PAN:'Panamá', CZE:'Tchéquia',
  HUN:'Hungria', ROU:'Romênia', BGR:'Bulgária', HRV:'Croácia', SRB:'Sérvia',
  SVK:'Eslováquia', SVN:'Eslovênia', PHL:'Filipinas', BGD:'Bangladesh',
  ETH:'Etiópia', DZA:'Argélia', IRN:'Irã', IRQ:'Iraque', JOR:'Jordânia',
  KWT:'Kuwait', ARE:'Emirados', LBN:'Líbano', SYR:'Síria', YEM:'Iêmen',
  GEO:'Geórgia', ARM:'Armênia', AZE:'Azerbaijão',
};

const ShareCard = forwardRef(({ profile, visitedCountryCodes, totalPhotos, totalCities }, ref) => {
  const levelInfo = getLevelInfo(visitedCountryCodes.length);
  const initial = (profile?.username || 'V')[0].toUpperCase();

  const slots = [...visitedCountryCodes.slice(0, 6)];
  while (slots.length < 6) slots.push(null);

  return (
    <View ref={ref} style={styles.card} collapsable={false}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.tagline}>PASSAPORTE</Text>
        <Text style={styles.logo}>Journi</Text>
      </View>

      {/* Avatar + nome + nível */}
      <View style={styles.profileSection}>
        <View style={styles.avatarRing}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitial}>{initial}</Text>
            </View>
          )}
        </View>
        <Text style={styles.username}>@{profile?.username || 'viajante'}</Text>
        <View style={styles.levelBadge}>
          <Text style={styles.levelIcon}>{levelInfo.current.icon}</Text>
          <Text style={styles.levelName}>{levelInfo.current.name}</Text>
        </View>
      </View>

      {/* Stats — estilo boarding pass */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{visitedCountryCodes.length}</Text>
          <Text style={styles.statLabel}>PAÍSES</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalPhotos}</Text>
          <Text style={styles.statLabel}>FOTOS</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalCities || 0}</Text>
          <Text style={styles.statLabel}>CIDADES</Text>
        </View>
      </View>

      {/* Carimbos */}
      <View style={styles.stampsGrid}>
        {slots.map((code, i) => {
          if (!code) {
            return (
              <View
                key={`empty-${i}`}
                style={[styles.stampEmpty, { transform: [{ rotate: `${i % 2 === 0 ? -4 : 5}deg` }] }]}
              >
                <Text style={styles.stampEmptyText}>?</Text>
              </View>
            );
          }
          const color = getStampColor(code);
          return (
            <View
              key={code}
              style={[
                styles.stamp,
                {
                  borderColor: color + '99',
                  backgroundColor: color + '12',
                  transform: [{ rotate: `${getStampRotation(code)}deg` }],
                },
              ]}
            >
              <Image
                source={{ uri: `https://flagcdn.com/w80/${getAlpha2(code)}.png` }}
                style={styles.stampFlag}
              />
              <Text style={[styles.stampText, { color }]}>
                {(COUNTRY_NAMES_PT[code] || code).toUpperCase()}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>✈️ baixe o journi.app</Text>
        <Text style={styles.footerText}>@{profile?.username || 'viajante'}</Text>
      </View>
    </View>
  );
});

export default ShareCard;

const styles = StyleSheet.create({
  card: {
    width: 360,
    height: 640,
    backgroundColor: '#0D1326',
    padding: 28,
    justifyContent: 'flex-start',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tagline: { color: 'rgba(255,255,255,0.5)', fontSize: 11, letterSpacing: 3 },
  logo: { color: '#6C2BD9', fontSize: 18, fontWeight: '700', fontFamily: 'Poppins_700Bold' },
  profileSection: { alignItems: 'center', marginTop: 28 },
  avatarRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2.5,
    borderColor: '#6C2BD9',
    padding: 3,
  },
  avatarImage: { width: '100%', height: '100%', borderRadius: 38 },
  avatarFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 38,
    backgroundColor: '#2b2f45',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: 'white', fontSize: 28, fontWeight: '700' },
  username: { color: 'white', fontSize: 17, fontWeight: '700', marginTop: 12 },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,107,53,0.12)',
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 14,
    marginTop: 8,
  },
  levelIcon: { fontSize: 15 },
  levelName: { color: '#6C2BD9', fontSize: 12, fontWeight: '700' },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    marginTop: 28,
  },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  statValue: { color: '#6C2BD9', fontSize: 24, fontWeight: '700' },
  statLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    marginTop: 3,
    letterSpacing: 1,
  },
  statDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.1)' },
  stampsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 14,
    marginTop: 28,
  },
  stamp: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampFlag: { width: 30, height: 20, borderRadius: 2 },
  stampText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, marginTop: 4 },
  stampEmpty: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampEmptyText: { color: 'rgba(255,255,255,0.2)', fontSize: 28 },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 28,
    right: 28,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
    borderStyle: 'dashed',
    paddingTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: { color: 'rgba(255,255,255,0.35)', fontSize: 10 },
});
