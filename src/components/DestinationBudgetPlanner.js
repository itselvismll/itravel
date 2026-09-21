import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Linking, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CurrencyPicker from './CurrencyPicker';
import {
  formatMoneyInput,
  getDailyExchangeRate,
  parseMoneyInput,
  sanitizeMoneyInput,
} from '../services/currencyService';

const BUDGET_LEVELS = [
  {
    id: 'economy',
    label: 'Econômico',
    eyebrow: 'Gastar menos',
    description: 'A IA procura passagens, hospedagens e experiências com menor custo, sem deixar de fora os pontos essenciais.',
  },
  {
    id: 'balanced',
    label: 'Equilibrado',
    eyebrow: 'Custo-benefício',
    description: 'Combina bons preços, localização prática, conforto e as atrações pagas que realmente valem a pena.',
  },
  {
    id: 'premium',
    label: 'Confortável',
    eyebrow: 'Mais comodidade',
    description: 'Prioriza melhores horários, boa localização, deslocamentos cômodos e experiências especiais.',
  },
];

const getBudgetLevelIcon = levelId => (
  levelId === 'economy' ? 'wallet-outline' : levelId === 'premium' ? 'diamond-outline' : 'scale-outline'
);

const formatConvertedValue = value => {
  const numericValue = Number(value) || 0;
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: numericValue > 0 && numericValue < 1 ? 4 : 2,
    maximumFractionDigits: numericValue > 0 && numericValue < 1 ? 6 : 2,
  }).format(numericValue);
};

export default function DestinationBudgetPlanner({
  budgetLevel,
  onBudgetLevelChange,
  converterBaseCurrency = 'BRL',
  displayCurrency = 'USD',
  onConverterBaseCurrencyChange,
  onDisplayCurrencyChange,
  onConversionChange,
  initialAmount = '1',
}) {
  const [levelMenuOpen, setLevelMenuOpen] = useState(false);
  const [amount, setAmount] = useState(() => formatMoneyInput(initialAmount) || '1');
  const [rate, setRate] = useState(null);
  const [rateDate, setRateDate] = useState('');
  const [rateSource, setRateSource] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const onConversionChangeRef = useRef(onConversionChange);
  onConversionChangeRef.current = onConversionChange;

  const convertedAmount = useMemo(
    () => parseMoneyInput(amount) * (Number(rate) || 0),
    [amount, rate]
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getDailyExchangeRate(converterBaseCurrency, displayCurrency).then(result => {
      if (!active) return;
      if (!result.success) {
        setRate(null);
        setRateDate('');
        setRateSource('');
        setError(result.error || 'Cotação indisponível agora.');
        return;
      }
      setRate(result.rate);
      setRateDate(result.date || '');
      setRateSource(result.source || '');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [converterBaseCurrency, displayCurrency]);

  useEffect(() => {
    onConversionChangeRef.current?.({
      amount: parseMoneyInput(amount),
      convertedAmount,
      fromCurrency: converterBaseCurrency,
      toCurrency: displayCurrency,
      rate: Number(rate) || 0,
      rateDate,
    });
  }, [amount, convertedAmount, converterBaseCurrency, displayCurrency, rate, rateDate]);

  const invertCurrencies = () => {
    const previousBase = converterBaseCurrency;
    const nextAmount = rate ? formatMoneyInput(convertedAmount) : amount;
    onConverterBaseCurrencyChange(displayCurrency);
    onDisplayCurrencyChange(previousBase);
    setAmount(nextAmount || '1');
  };

  const selectedLevel = BUDGET_LEVELS.find(level => level.id === budgetLevel) || BUDGET_LEVELS[1];

  return (
    <View style={styles.wrapper}>
      <View>
        <Text style={styles.title}>Orçamento da viagem</Text>
        <Text style={styles.subtitle}>Escolha seu estilo. A IA pesquisa os custos e estima quanto a viagem realmente deve custar.</Text>
      </View>

      <View style={styles.preferenceBlock}>
        <Text style={styles.fieldLabel}>COMO VOCÊ QUER VIAJAR?</Text>
        <TouchableOpacity
          style={styles.levelSelector}
          onPress={() => setLevelMenuOpen(current => !current)}
          accessibilityRole="button"
          accessibilityState={{ expanded: levelMenuOpen }}
          accessibilityLabel={`Estilo de orçamento: ${selectedLevel.label}`}
        >
          <View style={styles.levelIcon}>
            <Ionicons name={getBudgetLevelIcon(selectedLevel.id)} size={20} color="#C4B5FD" />
          </View>
          <View style={styles.levelCopy}>
            <Text style={styles.levelEyebrow}>{selectedLevel.eyebrow}</Text>
            <Text style={styles.levelText}>{selectedLevel.label}</Text>
            <Text style={styles.levelDescription}>{selectedLevel.description}</Text>
          </View>
          <Ionicons name={levelMenuOpen ? 'chevron-up' : 'chevron-down'} size={19} color="#A78BFA" />
        </TouchableOpacity>
        {levelMenuOpen && (
          <View style={styles.levelMenu}>
            {BUDGET_LEVELS.map(level => {
              const active = budgetLevel === level.id;
              return (
                <TouchableOpacity
                  key={level.id}
                  style={[styles.levelOption, active && styles.levelOptionActive]}
                  onPress={() => {
                    onBudgetLevelChange(level.id);
                    setLevelMenuOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Ionicons name={getBudgetLevelIcon(level.id)} size={20} color={active ? '#C4B5FD' : '#858DAD'} />
                  <View style={styles.levelCopy}>
                    <Text style={[styles.levelText, active && styles.levelTextActive]}>{level.label}</Text>
                    <Text style={styles.levelDescription}>{level.description}</Text>
                  </View>
                  {active && <Ionicons name="checkmark-circle" size={20} color="#A78BFA" />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        <Text style={styles.aiHint}>Não existe limite por destino: o roteiro mostrará a estimativa encontrada para passagem, hospedagem, alimentação, transporte e passeios.</Text>
      </View>

      <View style={styles.converterBlock}>
        <View style={styles.converterHeader}>
          <View style={styles.converterTitleRow}>
            <Ionicons name="swap-horizontal-outline" size={18} color="#35D3C8" />
            <Text style={styles.converterTitle}>Conversor de moedas</Text>
          </View>
          <Text style={styles.converterSubtitle}>Compare qualquer moeda sem alterar a moeda usada no roteiro.</Text>
        </View>

        {!!rate && !loading && (
          <Text style={styles.rateHeadline} selectable>
            1 {converterBaseCurrency} = {formatConvertedValue(rate)} {displayCurrency}
          </Text>
        )}

        <View style={styles.currencyRow}>
          <TextInput
            style={styles.currencyInput}
            value={amount}
            onChangeText={value => setAmount(sanitizeMoneyInput(value))}
            keyboardType="decimal-pad"
            placeholder="1"
            placeholderTextColor="#687191"
            accessibilityLabel={`Valor em ${converterBaseCurrency}`}
          />
          <View style={styles.currencyDivider} />
          <CurrencyPicker inline value={converterBaseCurrency} onChange={onConverterBaseCurrencyChange} />
        </View>

        <TouchableOpacity
          style={styles.swapButton}
          onPress={invertCurrencies}
          disabled={loading || !rate}
          accessibilityRole="button"
          accessibilityLabel={`Inverter ${converterBaseCurrency} e ${displayCurrency}`}
        >
          <Ionicons name="swap-vertical" size={19} color={rate ? '#C4B5FD' : '#5F6787'} />
        </TouchableOpacity>

        <View style={[styles.currencyRow, styles.currencyRowResult]}>
          <View style={styles.convertedValueBox}>
            {loading
              ? <ActivityIndicator size="small" color="#35D3C8" />
              : <Text style={styles.convertedValue} selectable>{error ? '—' : formatConvertedValue(convertedAmount)}</Text>}
          </View>
          <View style={styles.currencyDivider} />
          <CurrencyPicker inline value={displayCurrency} onChange={onDisplayCurrencyChange} />
        </View>

        {!!error && <Text style={styles.errorText} selectable>{error}</Text>}
        {!!rateDate && !error && (
          <Text style={styles.rateText}>
            Cotação de {rateDate}{rateSource ? ' • Fonte: ' : ''}
            {rateSource.includes('ExchangeRate-API') ? (
              <Text style={styles.rateLink} onPress={() => Linking.openURL('https://www.exchangerate-api.com')}>
                {rateSource}
              </Text>
            ) : rateSource}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 18 },
  title: { color: '#F7F7F2', fontSize: 20, fontWeight: '900' },
  subtitle: { color: '#8F96B3', fontSize: 12, lineHeight: 18, marginTop: 4 },
  preferenceBlock: { gap: 8 },
  fieldLabel: { color: '#A5ACC8', fontSize: 10, fontWeight: '900', letterSpacing: 0.9 },
  levelSelector: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderRadius: 14, backgroundColor: 'rgba(108,43,217,0.2)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.45)' },
  levelIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: 'rgba(139,92,246,0.18)' },
  levelCopy: { flex: 1, gap: 2 },
  levelEyebrow: { color: '#A78BFA', fontSize: 9, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  levelText: { color: '#F7F7F2', fontSize: 14, fontWeight: '900' },
  levelTextActive: { color: '#fff' },
  levelDescription: { color: '#929AB7', fontSize: 10, lineHeight: 15 },
  levelMenu: { gap: 6, padding: 7, borderRadius: 14, backgroundColor: '#10162B', borderWidth: 1, borderColor: '#30395D' },
  levelOption: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 11 },
  levelOptionActive: { backgroundColor: 'rgba(139,92,246,0.14)' },
  aiHint: { color: '#747D9D', fontSize: 9, lineHeight: 14 },
  converterBlock: { gap: 10, padding: 14, borderRadius: 16, backgroundColor: '#10162B', borderWidth: 1, borderColor: '#293354' },
  converterHeader: { gap: 3 },
  converterTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  converterTitle: { color: '#F7F7F2', fontSize: 14, fontWeight: '900' },
  converterSubtitle: { color: '#858DAD', fontSize: 10, lineHeight: 15 },
  rateHeadline: { color: '#E8E9F3', fontSize: 17, lineHeight: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  currencyRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', borderRadius: 13, backgroundColor: '#202744', borderWidth: 1, borderColor: '#4C5677', overflow: 'hidden' },
  currencyRowResult: { backgroundColor: '#171D2F', borderColor: '#343C59' },
  currencyInput: { flex: 0.7, minWidth: 90, color: '#F7F7F2', fontSize: 18, paddingHorizontal: 14, fontVariant: ['tabular-nums'] },
  convertedValueBox: { flex: 0.7, minWidth: 90, paddingHorizontal: 14 },
  convertedValue: { color: '#F7F7F2', fontSize: 18, fontVariant: ['tabular-nums'] },
  currencyDivider: { width: 1, height: 34, backgroundColor: 'rgba(255,255,255,0.12)' },
  swapButton: { alignSelf: 'center', width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: '#241A48', borderWidth: 1, borderColor: '#4B3786', marginVertical: -3, zIndex: 1 },
  errorText: { color: '#FF8AA0', fontSize: 10, lineHeight: 15 },
  rateText: { color: '#737C9E', fontSize: 9, lineHeight: 14 },
  rateLink: { color: '#35D3C8', textDecorationLine: 'underline' },
});
