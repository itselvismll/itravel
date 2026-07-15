import React, { forwardRef } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { getAlpha2 } from '../utils/countryUtils';
import { getLevelInfo } from '../utils/travelerLevels';

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
  KWT:'Kuwait', LBN:'Líbano', SYR:'Síria', YEM:'Iêmen',
  GEO:'Geórgia', ARM:'Armênia', AZE:'Azerbaijão',
};

const getFlagEmoji = (code) => {
  if (!code) return '🌍';
  let alpha2 = code.toUpperCase();
  if (alpha2.length === 3) {
    alpha2 = (getAlpha2(alpha2) || alpha2).toUpperCase();
  }
  if (alpha2.length !== 2) return '🌍';
  return alpha2.split('').map(c => String.fromCodePoint(127397 + c.charCodeAt(0))).join('');
};

const FlagGrid = ({ codes, title, titleColor }) => {
  if (!codes || codes.length === 0) return null;
  const rows = [];
  for (let i = 0; i < codes.length; i += 6) {
    rows.push(codes.slice(i, i + 6));
  }
  return (
    <View style={{ marginTop: 18 }}>
      <Text style={{ color: titleColor, fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 10 }}>
        {title}
      </Text>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
          {row.map((code, j) => (
            <Text key={`${code}-${j}`} style={{ fontSize: 26 }}>
              {getFlagEmoji(code)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
};

const ShareCard = forwardRef(({ profile, visitedCountryCodes, wishlistCodes, totalPhotos, totalCities }, ref) => {
  const levelInfo = getLevelInfo((visitedCountryCodes || []).length);
  const initial = (profile?.username || 'V')[0].toUpperCase();

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

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{(visitedCountryCodes || []).length}</Text>
          <Text style={styles.statLabel}>PAÍSES</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalPhotos || 0}</Text>
          <Text style={styles.statLabel}>FOTOS</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalCities || 0}</Text>
          <Text style={styles.statLabel}>CIDADES</Text>
        </View>
      </View>

      {/* Grid de países visitados */}
      <FlagGrid
        codes={visitedCountryCodes}
        title="PAÍSES VISITADOS"
        titleColor="rgba(255,255,255,0.5)"
      />

      {/* Grid de wishlist */}
      <FlagGrid
        codes={wishlistCodes}
        title="QUERO VISITAR 💜"
        titleColor="#6C2BD9"
      />

      {/* Divider */}
      <View style={styles.footerDivider} />

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
    width: 380,
    backgroundColor: '#0D1326',
    padding: 28,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tagline: { color: 'rgba(255,255,255,0.5)', fontSize: 11, letterSpacing: 3 },
  logo: { color: '#6C2BD9', fontSize: 18, fontWeight: '700' },
  profileSection: { alignItems: 'center', marginTop: 24 },
  avatarRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2.5,
    borderColor: '#6C2BD9',
    padding: 3,
  },
  avatarImage: { width: '100%', height: '100%', borderRadius: 36 },
  avatarFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 36,
    backgroundColor: '#2b2f45',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: 'white', fontSize: 26, fontWeight: '700' },
  username: { color: 'white', fontSize: 16, fontWeight: '700', marginTop: 10 },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(108,43,217,0.15)',
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  levelIcon: { fontSize: 14 },
  levelName: { color: '#6C2BD9', fontSize: 11, fontWeight: '700' },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    marginTop: 22,
  },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  statValue: { color: '#6C2BD9', fontSize: 22, fontWeight: '700' },
  statLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 2, letterSpacing: 1 },
  statDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.1)' },
  footerDivider: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
    borderStyle: 'dashed',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  footerText: { color: 'rgba(255,255,255,0.35)', fontSize: 10 },
});
