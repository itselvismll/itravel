// "em" + nome de país, com a contração certa: no Japão, na França, nos Estados
// Unidos, nas Filipinas, em Portugal.
//
// Não dá para derivar isso do nome. "Canadá" e "Panamá" terminam em -á e são
// masculinos ("no Canadá"); "Cuba" termina em -a e não leva artigo nenhum ("em
// Cuba"); "Estados Unidos" é plural. A informação é lexical, então ela mora numa
// tabela.
//
// A REGRA DE OURO DESTE MÓDULO: país fora da tabela NÃO recebe um palpite.
// `inCountry` devolve null, e quem chama troca a frase por uma construção que
// não precisa de artigo. Um artigo errado ("na Canadá") é pior do que uma frase
// um pouco mais seca, e a tabela nunca vai cobrir os 250 códigos que o
// Intl.DisplayNames é capaz de devolver.

/**
 * Artigo definido de cada país, por alpha-3.
 *
 * 'o' | 'a' | 'os' | 'as' -> contrai com "em" (no / na / nos / nas)
 * ''                      -> país sem artigo, fica só "em X"
 * ausente                 -> não sabemos; ver a regra de ouro acima
 */
export const COUNTRY_ARTICLE = {
  // ── Américas ──────────────────────────────────────────────────────────────
  BRA: 'o', USA: 'os', CAN: 'o', MEX: 'o', ARG: 'a', CHL: 'o', URY: 'o',
  PRY: 'o', PER: 'o', BOL: 'a', COL: 'a', VEN: 'a', ECU: 'o', GUY: 'a',
  SUR: 'o', CRI: 'a', PAN: 'o', GTM: 'a', NIC: 'a', DOM: 'a', JAM: 'a',
  HTI: 'o', CUB: '', BLZ: '', HND: '', SLV: '', PRI: '', BRB: '',
  TTO: '', GRD: '', LCA: '', VCT: '', ATG: '', KNA: '', DMA: 'a', BHS: 'as',
  // ── Europa ────────────────────────────────────────────────────────────────
  PRT: '', ESP: 'a', FRA: 'a', ITA: 'a', DEU: 'a', GBR: 'o', IRL: 'a',
  NLD: 'os', BEL: 'a', CHE: 'a', AUT: 'a', SWE: 'a', NOR: 'a', DNK: 'a',
  FIN: 'a', ISL: 'a', GRC: 'a', POL: 'a', CZE: 'a', SVK: 'a', SVN: 'a',
  HUN: 'a', ROU: 'a', BGR: 'a', HRV: 'a', SRB: 'a', ALB: 'a', MKD: 'a',
  BIH: 'a', MNE: '', UKR: 'a', BLR: 'a', RUS: 'a', MDA: 'a', LTU: 'a',
  LVA: 'a', EST: 'a', MLT: '', CYP: '', LUX: '', MCO: '', AND: '',
  SMR: '', VAT: 'a', LIE: '', GIB: '', GRL: 'a', FRO: 'as',
  // ── África ────────────────────────────────────────────────────────────────
  ZAF: 'a', EGY: 'o', MAR: 'o', DZA: 'a', TUN: 'a', LBY: 'a', SDN: 'o',
  SSD: 'o', ETH: 'a', SOM: 'a', KEN: 'o', TZA: 'a', NGA: 'a', NER: 'o',
  MLI: 'o', TCD: 'o', SEN: 'o', CIV: 'a', GIN: 'a', GNB: '', GNQ: 'a',
  CMR: 'os', GAB: 'o', COG: 'o', COD: 'a', CAF: 'a', AGO: '', MOZ: '',
  NAM: 'a', ZMB: 'a', ZWE: 'o', MWI: 'o', BWA: '', LSO: '', SWZ: '',
  MDG: '', MUS: '', CPV: '', STP: '', COM: 'as', SYC: 'as', LBR: 'a',
  SLE: 'a', GHA: 'o', TGO: '', BEN: '', BFA: '', BDI: '', RWA: '',
  UGA: '', ERI: '', DJI: '', GMB: 'a', MRT: 'a', ESH: 'o',
  // ── Ásia e Oriente Médio ──────────────────────────────────────────────────
  JPN: 'o', CHN: 'a', KOR: 'a', PRK: 'a', IND: 'a', PAK: 'o', BGD: '',
  LKA: 'o', NPL: 'o', BTN: 'o', MDV: 'as', MMR: '', THA: 'a', VNM: 'o',
  KHM: 'o', LAO: 'o', MYS: 'a', IDN: 'a', PHL: 'as', SGP: '', BRN: '',
  TWN: '', MNG: 'a', KAZ: 'o', UZB: 'o', TKM: 'o', KGZ: 'o', TJK: 'o',
  AFG: 'o', IRN: 'o', IRQ: 'o', SYR: 'a', LBN: 'o', ISR: '', JOR: 'a',
  SAU: 'a', ARE: 'os', QAT: 'o', KWT: 'o', BHR: 'o', OMN: '', YEM: 'o',
  PSE: 'os', TLS: '', TUR: 'a', GEO: 'a', ARM: 'a', AZE: 'o',
  // ── Oceania ───────────────────────────────────────────────────────────────
  AUS: 'a', NZL: 'a', PNG: '', FJI: '', SLB: 'as', VUT: '', WSM: '',
  TON: '', KIR: '', FSM: 'a', PLW: '', MHL: 'as', NRU: '', TUV: '',
  NCL: 'a', PYF: 'a', COK: 'as',
  // ── Territórios e dependências ────────────────────────────────────────────
  // O grupo "Ilhas X" é mecânico: nome feminino plural, sempre "nas".
  PCN: 'as', MNP: 'as', VIR: 'as', UMI: 'as', ALA: 'as', CYM: 'as',
  TCA: 'as', VGB: 'as', FLK: 'as', SGS: 'as', HMD: 'as', CCK: 'as',
  BMU: 'as',
  // Sem artigo.
  ABW: '', CUW: '', SXM: '', MAF: '', BLM: '', GUM: '', ASM: '',
  NIU: '', TKL: '', IMN: '', JEY: '', GGY: '', AIA: '', MSR: '',
  GLP: '', MTQ: '', MYT: '', SPM: '', WLF: '', SJM: '', BVT: '',
  CXR: '', NFK: '', SHN: '', HKG: '', MAC: '', KOS: '',
  // Com artigo.
  GUF: 'a', REU: 'a', ATA: 'a', BES: 'os', ATF: 'os', IOT: 'o',
};

const CONTRACTION = { o: 'no', a: 'na', os: 'nos', as: 'nas' };

/**
 * "em" + país, contraído quando o país leva artigo.
 *
 * @param {string} code alpha-3
 * @param {string} name nome do país em português
 * @returns {string | null} "no Japão" | "em Portugal" | null se o artigo é
 *   desconhecido — nesse caso quem chama precisa de outra construção
 */
export const inCountry = (code, name) => {
  if (!code || !name) return null;

  const article = COUNTRY_ARTICLE[code];
  if (article === undefined) return null;
  if (article === '') return `em ${name}`;

  return `${CONTRACTION[article]} ${name}`;
};

/**
 * "para" + país, com a mesma regra (para o -> para o, para a -> para a).
 *
 * O português não contrai "para" com o artigo na escrita formal ("para o
 * Japão", não "pro Japão"), então aqui é só a concordância do artigo.
 *
 * @returns {string | null} "para o Japão" | "para Portugal" | null
 */
export const toCountry = (code, name) => {
  if (!code || !name) return null;

  const article = COUNTRY_ARTICLE[code];
  if (article === undefined) return null;
  if (article === '') return `para ${name}`;

  return `para ${article} ${name}`;
};
