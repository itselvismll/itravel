export const ALPHA3_TO_ALPHA2 = {
  'BRA': 'BR', 'USA': 'US', 'ARG': 'AR', 'PRT': 'PT', 'ESP': 'ES',
  'FRA': 'FR', 'ITA': 'IT', 'DEU': 'DE', 'GBR': 'GB', 'JPN': 'JP',
  'CHN': 'CN', 'MEX': 'MX', 'COL': 'CO', 'CHL': 'CL', 'URY': 'UY',
  'BOL': 'BO', 'PER': 'PE', 'VEN': 'VE', 'ECU': 'EC', 'PRY': 'PY',
  'CAN': 'CA', 'AUS': 'AU', 'NZL': 'NZ', 'ZAF': 'ZA', 'EGY': 'EG',
  'MAR': 'MA', 'NGA': 'NG', 'KEN': 'KE', 'THA': 'TH', 'VNM': 'VN',
  'IDN': 'ID', 'MYS': 'MY', 'SGP': 'SG', 'IND': 'IN', 'PAK': 'PK',
  'RUS': 'RU', 'UKR': 'UA', 'POL': 'PL', 'NLD': 'NL', 'BEL': 'BE',
  'CHE': 'CH', 'AUT': 'AT', 'SWE': 'SE', 'NOR': 'NO', 'DNK': 'DK',
  'FIN': 'FI', 'GRC': 'GR', 'TUR': 'TR', 'ISR': 'IL', 'SAU': 'SA',
  'ARE': 'AE', 'QAT': 'QA', 'KOR': 'KR', 'TWN': 'TW', 'HKG': 'HK',
  'CUB': 'CU', 'DOM': 'DO', 'GTM': 'GT', 'CRI': 'CR', 'PAN': 'PA',
  'CZE': 'CZ', 'HUN': 'HU', 'ROU': 'RO', 'BGR': 'BG', 'HRV': 'HR',
  'SRB': 'RS', 'SVK': 'SK', 'SVN': 'SI', 'PHL': 'PH', 'BGD': 'BD',
  'ETH': 'ET', 'DZA': 'DZ', 'LBY': 'LY', 'TUN': 'TN', 'SDN': 'SD',
  'SOM': 'SO', 'GHA': 'GH', 'TZA': 'TZ', 'UGA': 'UG', 'MOZ': 'MZ',
  'MDG': 'MG', 'CMR': 'CM', 'CIV': 'CI', 'NER': 'NE', 'BFA': 'BF',
  'MLI': 'ML', 'MWI': 'MW', 'ZMB': 'ZM', 'ZWE': 'ZW', 'SEN': 'SN',
  'TCD': 'TD', 'GIN': 'GN', 'RWA': 'RW', 'BEN': 'BJ', 'BDI': 'BI',
  'TGO': 'TG', 'ERI': 'ER', 'SLE': 'SL', 'CAF': 'CF', 'COD': 'CD',
  'COG': 'CG', 'AGO': 'AO', 'NAM': 'NA', 'BWA': 'BW', 'LSO': 'LS',
  'SWZ': 'SZ', 'DJI': 'DJ', 'GMB': 'GM', 'GNB': 'GW', 'GNQ': 'GQ',
  'CPV': 'CV', 'STP': 'ST', 'COM': 'KM', 'MUS': 'MU', 'SYC': 'SC',
  'LBR': 'LR', 'MRT': 'MR', 'GAB': 'GA', 'IRN': 'IR', 'IRQ': 'IQ',
  'SYR': 'SY', 'LBN': 'LB', 'JOR': 'JO', 'KWT': 'KW', 'BHR': 'BH',
  'OMN': 'OM', 'YEM': 'YE', 'AFG': 'AF', 'KAZ': 'KZ', 'UZB': 'UZ',
  'TKM': 'TM', 'KGZ': 'KG', 'TJK': 'TJ', 'MNG': 'MN', 'NPL': 'NP',
  'LKA': 'LK', 'MMR': 'MM', 'KHM': 'KH', 'LAO': 'LA', 'PRK': 'KP',
  'PNG': 'PG', 'FJI': 'FJ', 'SLB': 'SB', 'VUT': 'VU', 'WSM': 'WS',
  'TON': 'TO', 'KIR': 'KI', 'FSM': 'FM', 'PLW': 'PW', 'MHL': 'MH',
  'NRU': 'NR', 'TUV': 'TV', 'HTI': 'HT', 'JAM': 'JM', 'TTO': 'TT',
  'BRB': 'BB', 'LCA': 'LC', 'VCT': 'VC', 'GRD': 'GD', 'ATG': 'AG',
  'KNA': 'KN', 'DMA': 'DM', 'BLZ': 'BZ', 'HND': 'HN', 'SLV': 'SV',
  'NIC': 'NI', 'GUY': 'GY', 'SUR': 'SR', 'PRI': 'PR', 'ALB': 'AL',
  'MKD': 'MK', 'BIH': 'BA', 'MNE': 'ME', 'MDA': 'MD', 'BLR': 'BY',
  'LTU': 'LT', 'LVA': 'LV', 'EST': 'EE', 'GEO': 'GE', 'ARM': 'AM',
  'AZE': 'AZ', 'CYP': 'CY', 'MLT': 'MT', 'ISL': 'IS', 'LUX': 'LU',
  'MCO': 'MC', 'AND': 'AD', 'SMR': 'SM', 'VAT': 'VA', 'LIE': 'LI',
  'IRL': 'IE',
};

export const getAlpha2 = (code) => {
  if (!code) return null;
  if (code.length === 2) return code.toLowerCase();
  return (ALPHA3_TO_ALPHA2[code.toUpperCase()] || code).toLowerCase();
};

export const getStampRotation = (countryCode) => {
  let hash = 0;
  for (let i = 0; i < countryCode.length; i++) {
    hash = countryCode.charCodeAt(i) + ((hash << 5) - hash);
  }
  return (hash % 17) - 8;
};

export const COUNTRY_NAMES_PT = {
  'Afghanistan': 'Afeganistão', 'Albania': 'Albânia', 'Algeria': 'Argélia',
  'Angola': 'Angola', 'Argentina': 'Argentina', 'Australia': 'Austrália',
  'Austria': 'Áustria', 'Belgium': 'Bélgica', 'Bolivia': 'Bolívia',
  'Brazil': 'Brasil', 'Bulgaria': 'Bulgária', 'Canada': 'Canadá',
  'Chile': 'Chile', 'China': 'China', 'Colombia': 'Colômbia',
  'Croatia': 'Croácia', 'Cuba': 'Cuba', 'Czech Republic': 'República Tcheca',
  'Czechia': 'República Tcheca', 'Denmark': 'Dinamarca', 'Ecuador': 'Equador',
  'Egypt': 'Egito', 'Ethiopia': 'Etiópia', 'Finland': 'Finlândia',
  'France': 'França', 'Germany': 'Alemanha', 'Greece': 'Grécia',
  'Hungary': 'Hungria', 'India': 'Índia', 'Indonesia': 'Indonésia',
  'Iran': 'Irã', 'Iraq': 'Iraque', 'Ireland': 'Irlanda',
  'Israel': 'Israel', 'Italy': 'Itália', 'Jamaica': 'Jamaica',
  'Japan': 'Japão', 'Jordan': 'Jordânia', 'Kenya': 'Quênia',
  'Libya': 'Líbia', 'Malaysia': 'Malásia', 'Mexico': 'México',
  'Morocco': 'Marrocos', 'Netherlands': 'Holanda', 'New Zealand': 'Nova Zelândia',
  'Nigeria': 'Nigéria', 'North Korea': 'Coreia do Norte', 'Norway': 'Noruega',
  'Pakistan': 'Paquistão', 'Panama': 'Panamá', 'Paraguay': 'Paraguai',
  'Peru': 'Peru', 'Philippines': 'Filipinas', 'Poland': 'Polônia',
  'Portugal': 'Portugal', 'Romania': 'Romênia', 'Russia': 'Rússia',
  'Saudi Arabia': 'Arábia Saudita', 'Serbia': 'Sérvia', 'Somalia': 'Somália',
  'South Africa': 'África do Sul', 'South Korea': 'Coreia do Sul',
  'Spain': 'Espanha', 'Sudan': 'Sudão', 'Sweden': 'Suécia',
  'Switzerland': 'Suíça', 'Syria': 'Síria', 'Thailand': 'Tailândia',
  'Tunisia': 'Tunísia', 'Turkey': 'Turquia', 'Türkiye': 'Turquia',
  'Ukraine': 'Ucrânia', 'United Arab Emirates': 'Emirados Árabes',
  'United Kingdom': 'Reino Unido', 'United States of America': 'Estados Unidos',
  'United States': 'Estados Unidos',
  'Uruguay': 'Uruguai', 'Venezuela': 'Venezuela', 'Vietnam': 'Vietnã',
  'Tanzania': 'Tanzânia', 'Uganda': 'Uganda', 'Ghana': 'Gana',
  'Cameroon': 'Camarões', 'Mozambique': 'Moçambique',
  'Costa Rica': 'Costa Rica', 'Dominican Republic': 'República Dominicana',
  'El Salvador': 'El Salvador', 'Guatemala': 'Guatemala', 'Honduras': 'Honduras',
  'Nicaragua': 'Nicarágua', 'Suriname': 'Suriname',
  'Guyana': 'Guiana', 'Trinidad and Tobago': 'Trinidad e Tobago',
  'Haiti': 'Haiti',
  'Kazakhstan': 'Cazaquistão', 'Uzbekistan': 'Uzbequistão',
  'Turkmenistan': 'Turcomenistão', 'Kyrgyzstan': 'Quirguistão',
  'Tajikistan': 'Tajiquistão', 'Mongolia': 'Mongólia', 'Nepal': 'Nepal',
  'Sri Lanka': 'Sri Lanka', 'Myanmar': 'Mianmar', 'Cambodia': 'Camboja',
  'Laos': 'Laos',
  'Taiwan': 'Taiwan',
  'Hong Kong': 'Hong Kong', 'Singapore': 'Singapura',
  'Bangladesh': 'Bangladesh',
};

export const getCountryNamePt = (name) => COUNTRY_NAMES_PT[name] || name;

let regionNamesPt;

export const getCountryNamePtByCode = (code, fallbackName = '') => {
  const alpha2 = getAlpha2(code);
  if (!alpha2 || alpha2.length !== 2) {
    return getCountryNamePt(fallbackName || code);
  }

  try {
    regionNamesPt ||= new Intl.DisplayNames(['pt-BR'], { type: 'region' });
    return regionNamesPt.of(alpha2.toUpperCase()) || getCountryNamePt(fallbackName);
  } catch {
    return getCountryNamePt(fallbackName || code);
  }
};

export const getAlpha3 = (input) => {
  if (!input) return null;
  const code = input.trim();
  if (code.length === 3) return code.toUpperCase();
  const target = code.toLowerCase();
  for (const [alpha3, alpha2] of Object.entries(ALPHA3_TO_ALPHA2)) {
    if (String(alpha2).toLowerCase() === target) return alpha3;
  }
  return code.toUpperCase();
};
