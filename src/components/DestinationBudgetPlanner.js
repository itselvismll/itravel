import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Linking, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CountryFlag from './CountryFlag';
import CurrencyPicker from './CurrencyPicker';
import {
  convertCurrency,
  formatMoneyInput,
  getCountryCurrency,
  getDailyExchangeRate,
  parseMoneyInput,
  sanitizeMoneyInput,
} from '../services/currencyService';

const formatCurrency = (value, currency) => {
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(Number(value) || 0);
  } catch {
    return `${currency} ${Math.round(Number(value) || 0).toLocaleString('pt-BR')}`;
  }
};

const BASE_TO_LOCAL = 'baseToLocal';
const LOCAL_TO_BASE = 'localToBase';
const BUDGET_LEVELS = [
  {
    id: 'economy',
    label: 'Econômico',
    eyebrow: 'Gastar menos',
    description: 'Hospedagens simples, transporte público, refeições acessíveis e prioridade para passeios gratuitos.',
  },
  {
    id: 'balanced',
    label: 'Equilibrado',
    eyebrow: 'Custo-benefício',
    description: 'Mistura economia e conforto, incluindo as atrações pagas mais importantes sem exagerar nos gastos.',
  },
  {
    id: 'premium',
    label: 'Confortável',
    eyebrow: 'Mais comodidade',
    description: 'Prioriza boa localização, experiências especiais, transporte cômodo e restaurantes mais completos.',
  },
];
const getDestinationId = destination => (
  destination?.id || `${destination?.type || 'country'}:${destination?.code || ''}:${destination?.name || ''}`
);
const getBudgetLevelIcon = levelId => (
  levelId === 'economy' ? 'wallet-outline' : levelId === 'premium' ? 'diamond-outline' : 'scale-outline'
);

const convertedValue = (row, amount = parseMoneyInput(row.amount)) => {
  if (!row.rate) return 0;
  return row.direction === LOCAL_TO_BASE ? amount / row.rate : amount * row.rate;
};

const budgetValues = row => {
  const input = parseMoneyInput(row.amount);
  const converted = convertedValue(row, input);
  const comparisonAmount = row.direction === LOCAL_TO_BASE ? input : converted;
  const amountInBRL = row.direction === LOCAL_TO_BASE ? converted : input;
  const localAmount = row.destinationRate
    ? convertCurrency(amountInBRL, row.destinationRate)
    : amountInBRL;
  return { comparisonAmount, localAmount, amountInBRL };
};

export default function DestinationBudgetPlanner({
  destinations = [],
  initialBudgets = [],
  budgetLevel,
  onBudgetLevelChange,
  onChange,
  onRemoveDestination,
  onAddDestination,
  baseCurrency = 'BRL',
  displayCurrency = 'USD',
  onDisplayCurrencyChange,
}) {
  const [rows, setRows] = useState(initialBudgets);
  const [levelMenuOpen, setLevelMenuOpen] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const destinationSignature = destinations.map(getDestinationId).join('|');

  useEffect(() => {
    setRows(current => destinations.map(destination => {
      const destinationId = getDestinationId(destination);
      const hasRepeatedCountry = destinations.filter(item => item.code === destination.code).length > 1;
      const existing = current.find(item => item.destinationId === destinationId)
        || initialBudgets.find(item => item.destinationId === destinationId)
        || (!hasRepeatedCountry && initialBudgets.find(item => item.countryCode === destination.code));
      if (existing) {
        const sameComparisonCurrency = existing.comparisonCurrency === displayCurrency;
        const amountInBRL = Number(existing.amountInBRL) || parseMoneyInput(existing.amount);
        return {
          ...existing,
          destinationId,
          countryCode: destination.countryCode || destination.code,
          countryName: destination.name,
          currency: existing.destinationCurrency || '',
          destinationCurrency: existing.destinationCurrency || '',
          destinationCurrencyName: existing.destinationCurrencyName || '',
          destinationCurrencyLoaded: Boolean(existing.destinationCurrencyLoaded && existing.destinationCurrency),
          destinationRate: existing.destinationRate || null,
          comparisonCurrency: displayCurrency,
          amount: sameComparisonCurrency ? existing.amount : formatMoneyInput(amountInBRL),
          rate: sameComparisonCurrency ? existing.rate : null,
          direction: sameComparisonCurrency ? existing.direction : BASE_TO_LOCAL,
          loading: true,
        };
      }
      return {
        destinationId,
        countryCode: destination.countryCode || destination.code,
        countryName: destination.name,
        currency: '',
        destinationCurrency: '',
        destinationCurrencyName: '',
        destinationCurrencyLoaded: false,
        destinationRate: null,
        comparisonCurrency: displayCurrency,
        amount: '',
        rate: null,
        rateDate: '',
        convertedAmount: 0,
        direction: BASE_TO_LOCAL,
        rateDirection: BASE_TO_LOCAL,
        rateSource: '',
        loading: true,
        error: '',
      };
    }));
  }, [destinationSignature]);

  useEffect(() => {
    setRows(current => current.map(row => {
      if (row.comparisonCurrency === displayCurrency) return row;
      const amountInBRL = budgetValues(row).amountInBRL;
      return {
        ...row,
        comparisonCurrency: displayCurrency,
        amount: formatMoneyInput(amountInBRL),
        rate: null,
        rateDate: '',
        rateSource: '',
        convertedAmount: 0,
        direction: BASE_TO_LOCAL,
        rateDirection: BASE_TO_LOCAL,
        loading: true,
        error: '',
      };
    }));
  }, [displayCurrency]);

  const hydrationSignature = rows.map(row => (
    `${row.destinationId}:${row.comparisonCurrency}:${row.loading ? 1 : 0}:${row.rate == null ? 1 : 0}:${row.destinationCurrencyLoaded ? 1 : 0}:${row.destinationRate == null ? 1 : 0}`
  )).join('|');

  useEffect(() => {
    let active = true;
    const hydrateRows = async () => {
      const pendingRows = rows.filter(row => (
        row.loading
        || row.comparisonCurrency !== displayCurrency
        || row.rate == null
        || row.rateDirection !== BASE_TO_LOCAL
        || !row.destinationCurrencyLoaded
      ));
      const hydrated = await Promise.all(pendingRows.map(async row => {
        const comparisonCurrency = row.comparisonCurrency || displayCurrency;
        const currencyResult = row.destinationCurrencyLoaded
          ? { success: Boolean(row.destinationCurrency), code: row.destinationCurrency, name: row.destinationCurrencyName }
          : await getCountryCurrency(row.countryCode);
        const destinationCurrency = currencyResult.success ? currencyResult.code : '';
        const exchangeResult = await getDailyExchangeRate(baseCurrency, comparisonCurrency);
        const destinationExchangeResult = !destinationCurrency || destinationCurrency === baseCurrency
          ? { success: true, rate: 1 }
          : destinationCurrency === comparisonCurrency
            ? exchangeResult
            : await getDailyExchangeRate(baseCurrency, destinationCurrency);
        if (!exchangeResult.success) {
          return {
            ...row,
            currency: destinationCurrency,
            destinationCurrency,
            destinationCurrencyName: currencyResult.name || '',
            destinationCurrencyLoaded: true,
            destinationRate: destinationExchangeResult.success ? destinationExchangeResult.rate : null,
            comparisonCurrency,
            loading: false,
            error: exchangeResult.error,
          };
        }

        return {
          ...row,
          currency: destinationCurrency,
          destinationCurrency,
          destinationCurrencyName: currencyResult.name || '',
          destinationCurrencyLoaded: true,
          destinationRate: destinationExchangeResult.success ? destinationExchangeResult.rate : null,
          comparisonCurrency,
          rate: exchangeResult.rate,
          rateDate: exchangeResult.date,
          rateDirection: BASE_TO_LOCAL,
          rateSource: exchangeResult.source,
          direction: row.direction || BASE_TO_LOCAL,
          convertedAmount: (row.direction || BASE_TO_LOCAL) === LOCAL_TO_BASE
            ? parseMoneyInput(row.amount) / exchangeResult.rate
            : convertCurrency(parseMoneyInput(row.amount), exchangeResult.rate),
          loading: false,
          error: '',
        };
      }));
      if (active) {
        const hydratedByDestination = Object.fromEntries(hydrated.map(row => [row.destinationId, row]));
        setRows(current => current.map(row => hydratedByDestination[row.destinationId] || row));
      }
    };
    if (rows.some(row => (
      row.loading
      || row.comparisonCurrency !== displayCurrency
      || row.rate == null
      || row.rateDirection !== BASE_TO_LOCAL
      || !row.destinationCurrencyLoaded
    ))) hydrateRows();
    return () => { active = false; };
  }, [baseCurrency, destinationSignature, displayCurrency, hydrationSignature]);

  const total = useMemo(() => rows.reduce((sum, row) => sum + budgetValues(row).amountInBRL, 0), [rows]);
  const convertedTotal = useMemo(() => rows.reduce((sum, row) => sum + budgetValues(row).comparisonAmount, 0), [rows]);

  useEffect(() => {
    onChangeRef.current?.(
      rows.map(({ loading, error, ...row }) => ({
        ...row,
        currency: row.destinationCurrency || baseCurrency,
        ...budgetValues(row),
      })),
      total,
      convertedTotal,
      rows.find(row => row.rateDate)?.rateDate || ''
    );
  }, [convertedTotal, rows, total]);

  const updateAmount = (destinationId, value) => {
    const formatted = sanitizeMoneyInput(value);
    setRows(current => current.map(row => row.destinationId === destinationId
      ? {
        ...row,
        amount: formatted,
        convertedAmount: convertedValue(row, parseMoneyInput(formatted)),
      }
      : row));
  };

  const invertCurrency = destinationId => {
    setRows(current => current.map(row => {
      if (row.destinationId !== destinationId || !row.rate) return row;
      const input = parseMoneyInput(row.amount);
      const output = convertedValue(row, input);
      return {
        ...row,
        direction: row.direction === LOCAL_TO_BASE ? BASE_TO_LOCAL : LOCAL_TO_BASE,
        amount: formatMoneyInput(output),
        convertedAmount: input,
      };
    }));
  };

  const removeDestination = destinationId => {
    setRows(current => current.filter(row => row.destinationId !== destinationId));
    onRemoveDestination(destinationId);
  };

  return (
    <View style={styles.wrapper}>
      <View>
        <Text style={styles.title}>Orçamento da viagem</Text>
        <Text style={styles.subtitle}>Defina o estilo da viagem e compare seus limites em qualquer moeda.</Text>
      </View>

      <View style={styles.preferenceBlock}>
        <Text style={styles.fieldLabel}>ESTILO DE ORÇAMENTO</Text>
        {(() => {
          const selectedLevel = BUDGET_LEVELS.find(level => level.id === budgetLevel) || BUDGET_LEVELS[1];
          return (
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
                <Text style={styles.levelDescription} numberOfLines={2}>{selectedLevel.description}</Text>
              </View>
              <Ionicons name={levelMenuOpen ? 'chevron-up' : 'chevron-down'} size={19} color="#A78BFA" />
            </TouchableOpacity>
          );
        })()}
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
        <Text style={styles.aiHint}>A IA usa esta escolha para decidir hospedagem, alimentação, transporte e passeios.</Text>
      </View>

      <CurrencyPicker
        label="Moeda para comparar"
        value={displayCurrency}
        onChange={onDisplayCurrencyChange}
        supportingText={`Compare seus limites em ${displayCurrency}. A moeda oficial de cada destino continua separada.`}
      />

      <View style={styles.divider}>
        <Text style={styles.fieldLabel}>LIMITE POR DESTINO</Text>
      </View>

      {!rows.length ? (
        <View style={styles.empty}>
          <Ionicons name="earth-outline" size={24} color="#8B5CF6" />
          <Text style={styles.emptyText}>Selecione os países em “Destinos da viagem” para montar o orçamento.</Text>
        </View>
      ) : rows.map(row => (
        <View key={row.destinationId} style={styles.destinationCard}>
          <View style={styles.destinationHeader}>
            <View style={styles.destinationNameRow}>
              <CountryFlag countryCode={row.countryCode} width={27} height={18} borderRadius={3} />
              <View style={styles.destinationCopy}>
                <Text style={styles.destinationName}>{row.countryName}</Text>
                <Text style={styles.destinationCurrencyText}>
                  Moeda local: {row.destinationCurrency || 'identificando…'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => removeDestination(row.destinationId)}
              accessibilityLabel={`Remover ${row.countryName} do roteiro`}
            >
              <Ionicons name="trash-outline" size={18} color="#FF8AA0" />
            </TouchableOpacity>
          </View>

          <View style={styles.valuesRow}>
            <View style={styles.amountBox}>
              {row.loading ? (
                <ActivityIndicator size="small" color="#A78BFA" />
              ) : (
                <Text style={styles.currencyCode}>
                  {row.direction === LOCAL_TO_BASE ? (row.comparisonCurrency || '---') : baseCurrency}
                </Text>
              )}
              <TextInput
                style={styles.amountInput}
                value={row.amount}
                onChangeText={value => updateAmount(row.destinationId, value)}
                placeholder="0"
                placeholderTextColor="#687191"
                keyboardType="decimal-pad"
                editable={!row.loading && !!row.comparisonCurrency}
              />
            </View>
            <TouchableOpacity
              style={styles.invertButton}
              onPress={() => invertCurrency(row.destinationId)}
              disabled={row.loading || !!row.error}
              accessibilityLabel={`Inverter conversão de ${baseCurrency} e ${row.comparisonCurrency} em ${row.countryName}`}
            >
              <Ionicons name="swap-horizontal" size={19} color={row.error ? '#4D5574' : '#A78BFA'} />
            </TouchableOpacity>
            <View style={styles.convertedBox}>
              <Text style={styles.convertedCurrency}>
                {row.direction === LOCAL_TO_BASE ? baseCurrency : (row.comparisonCurrency || '---')}
              </Text>
              <Text style={styles.convertedAmount} numberOfLines={1}>
                {row.loading
                  ? 'Calculando…'
                  : row.error
                    ? 'Sem cotação'
                    : `≈ ${Math.round(row.convertedAmount || 0).toLocaleString('pt-BR')}`}
              </Text>
            </View>
          </View>
          {!!row.error && <Text style={styles.errorText}>{row.error}</Text>}
          {!!row.rateDate && (
            <Text style={styles.rateText}>
              Comparação {baseCurrency} → {row.comparisonCurrency} • Cotação de {row.rateDate}
              {row.rateSource ? ' • Fonte: ' : ''}
              {row.rateSource === 'ExchangeRate-API' ? (
                <Text style={styles.rateLink} onPress={() => Linking.openURL('https://www.exchangerate-api.com')}>
                  ExchangeRate-API
                </Text>
              ) : row.rateSource}
            </Text>
          )}
        </View>
      ))}

      <TouchableOpacity style={styles.addButton} onPress={onAddDestination}>
        <Ionicons name="add-circle-outline" size={19} color="#A78BFA" />
        <Text style={styles.addButtonText}>Adicionar destino</Text>
      </TouchableOpacity>

      <View style={styles.totalRow}>
        <View>
          <Text style={styles.totalLabel}>TOTAL ESTIMADO</Text>
          <Text style={styles.totalHint}>Soma convertida para reais</Text>
        </View>
        <Text style={styles.totalValue}>{formatCurrency(total, baseCurrency)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 15 },
  title: { color: '#F7F7F2', fontSize: 20, fontWeight: '900' },
  subtitle: { color: '#8F96B3', fontSize: 12, marginTop: 4 },
  preferenceBlock: { gap: 8 },
  fieldLabel: { color: '#A5ACC8', fontSize: 10, fontWeight: '900', letterSpacing: 0.9 },
  levelSelector: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderRadius: 14, backgroundColor: 'rgba(108,43,217,0.2)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.45)' },
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
  divider: { paddingTop: 3 },
  empty: { alignItems: 'center', gap: 8, backgroundColor: '#10162B', borderRadius: 15, padding: 22, borderWidth: 1, borderColor: 'rgba(139,92,246,0.18)' },
  emptyText: { color: '#8F96B3', fontSize: 11, lineHeight: 17, textAlign: 'center' },
  destinationCard: { backgroundColor: '#10162B', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', gap: 11 },
  destinationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  destinationNameRow: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 },
  destinationCopy: { flex: 1, gap: 2 },
  destinationName: { color: '#F7F7F2', fontSize: 14, fontWeight: '900' },
  destinationCurrencyText: { color: '#7F88A8', fontSize: 9, fontWeight: '700' },
  removeButton: { width: 35, height: 35, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,88,118,0.08)' },
  valuesRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  amountBox: { flex: 1, minWidth: 125, minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#202744', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  currencyCode: { color: '#8F96B3', fontSize: 13, fontWeight: '800' },
  amountInput: { flex: 1, color: '#F7F7F2', fontSize: 18, fontWeight: '800', paddingVertical: 12 },
  invertButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(139,92,246,0.1)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.22)' },
  convertedBox: { flex: 1, minWidth: 125, minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#0B1021', borderWidth: 1, borderColor: 'rgba(53,211,200,0.13)' },
  convertedCurrency: { color: '#7D86A8', fontSize: 12, fontWeight: '800' },
  convertedAmount: { flex: 1, color: '#35D3C8', fontSize: 16, fontWeight: '900' },
  errorText: { color: '#FF8AA0', fontSize: 9 },
  rateText: { color: '#687191', fontSize: 9 },
  rateLink: { color: '#A78BFA', textDecorationLine: 'underline' },
  addButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(167,139,250,0.35)', backgroundColor: 'rgba(139,92,246,0.06)' },
  addButtonText: { color: '#C4B5FD', fontSize: 12, fontWeight: '800' },
  totalRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', paddingTop: 16 },
  totalLabel: { color: '#A5ACC8', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  totalHint: { color: '#687191', fontSize: 9, marginTop: 3 },
  totalValue: { color: '#F7F7F2', fontSize: 25, fontWeight: '900' },
});
