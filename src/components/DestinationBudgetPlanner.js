import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Linking, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CountryFlag from './CountryFlag';
import {
  convertCurrency,
  formatMoneyInput,
  getCountryCurrency,
  getDailyExchangeRate,
  parseMoneyInput,
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

const convertedValue = (row, amount = parseMoneyInput(row.amount)) => {
  if (!row.rate) return 0;
  return row.direction === LOCAL_TO_BASE ? amount / row.rate : amount * row.rate;
};

const budgetValues = row => {
  const input = parseMoneyInput(row.amount);
  const converted = convertedValue(row, input);
  return row.direction === LOCAL_TO_BASE
    ? { localAmount: input, amountInBRL: converted }
    : { localAmount: converted, amountInBRL: input };
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
}) {
  const [rows, setRows] = useState(initialBudgets);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const destinationSignature = destinations.map(item => `${item.code}:${item.name}`).join('|');

  useEffect(() => {
    setRows(current => destinations.map(destination => {
      const existing = current.find(item => item.countryCode === destination.code)
        || initialBudgets.find(item => item.countryCode === destination.code);
      return existing || {
        countryCode: destination.code,
        countryName: destination.name,
        currency: '',
        currencyName: '',
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
    let active = true;
    const hydrateRows = async () => {
      const pendingRows = rows.filter(row => row.loading || !row.currency || row.rate == null || row.rateDirection !== BASE_TO_LOCAL);
      const hydrated = await Promise.all(pendingRows.map(async row => {
        const currencyResult = row.currency
          ? { success: true, code: row.currency, name: row.currencyName }
          : await getCountryCurrency(row.countryCode);
        if (!currencyResult.success) return { ...row, loading: false, error: currencyResult.error };

        const exchangeResult = await getDailyExchangeRate(baseCurrency, currencyResult.code);
        if (!exchangeResult.success) {
          return {
            ...row,
            currency: currencyResult.code,
            currencyName: currencyResult.name,
            loading: false,
            error: exchangeResult.error,
          };
        }

        return {
          ...row,
          currency: currencyResult.code,
          currencyName: currencyResult.name,
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
        const hydratedByCountry = Object.fromEntries(hydrated.map(row => [row.countryCode, row]));
        setRows(current => current.map(row => hydratedByCountry[row.countryCode] || row));
      }
    };
    if (rows.some(row => row.loading || !row.currency || row.rate == null || row.rateDirection !== BASE_TO_LOCAL)) hydrateRows();
    return () => { active = false; };
  }, [baseCurrency, destinationSignature, rows.length]);

  const total = useMemo(() => rows.reduce((sum, row) => sum + budgetValues(row).amountInBRL, 0), [rows]);

  useEffect(() => {
    onChangeRef.current?.(
      rows.map(({ loading, error, ...row }) => ({
        ...row,
        ...budgetValues(row),
      })),
      total
    );
  }, [rows, total]);

  const updateAmount = (countryCode, value) => {
    const formatted = formatMoneyInput(value);
    setRows(current => current.map(row => row.countryCode === countryCode
      ? {
        ...row,
        amount: formatted,
        convertedAmount: convertedValue(row, parseMoneyInput(formatted)),
      }
      : row));
  };

  const invertCurrency = countryCode => {
    setRows(current => current.map(row => {
      if (row.countryCode !== countryCode || !row.rate) return row;
      const input = parseMoneyInput(row.amount);
      const output = convertedValue(row, input);
      return {
        ...row,
        direction: row.direction === LOCAL_TO_BASE ? BASE_TO_LOCAL : LOCAL_TO_BASE,
        amount: formatMoneyInput(Math.round(output)),
        convertedAmount: input,
      };
    }));
  };

  const removeDestination = countryCode => {
    setRows(current => current.filter(row => row.countryCode !== countryCode));
    onRemoveDestination(countryCode);
  };

  return (
    <View style={styles.wrapper}>
      <View>
        <Text style={styles.title}>Orçamento da viagem</Text>
        <Text style={styles.subtitle}>Informe em reais e veja quanto terá na moeda de cada destino.</Text>
      </View>

      <View style={styles.levels}>
        {[
          { id: 'economy', label: 'Barato' },
          { id: 'balanced', label: 'Médio' },
          { id: 'premium', label: 'Caro' },
        ].map(level => {
          const active = budgetLevel === level.id;
          return (
            <TouchableOpacity
              key={level.id}
              style={[styles.level, active && styles.levelActive]}
              onPress={() => onBudgetLevelChange(level.id)}
            >
              <Text style={[styles.levelText, active && styles.levelTextActive]}>{level.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {!rows.length ? (
        <View style={styles.empty}>
          <Ionicons name="earth-outline" size={24} color="#8B5CF6" />
          <Text style={styles.emptyText}>Selecione os países em “Destinos da viagem” para montar o orçamento.</Text>
        </View>
      ) : rows.map(row => (
        <View key={row.countryCode} style={styles.destinationCard}>
          <View style={styles.destinationHeader}>
            <View style={styles.destinationNameRow}>
              <CountryFlag countryCode={row.countryCode} width={27} height={18} borderRadius={3} />
              <Text style={styles.destinationName}>{row.countryName}</Text>
            </View>
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => removeDestination(row.countryCode)}
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
                  {row.direction === LOCAL_TO_BASE ? (row.currency || '---') : baseCurrency}
                </Text>
              )}
              <TextInput
                style={styles.amountInput}
                value={row.amount}
                onChangeText={value => updateAmount(row.countryCode, value)}
                placeholder="0"
                placeholderTextColor="#687191"
                keyboardType="number-pad"
                editable={!row.loading && !!row.currency}
              />
            </View>
            <TouchableOpacity
              style={styles.invertButton}
              onPress={() => invertCurrency(row.countryCode)}
              disabled={row.loading || !!row.error}
              accessibilityLabel={`Inverter moedas de ${row.countryName}`}
            >
              <Ionicons name="swap-horizontal" size={19} color={row.error ? '#4D5574' : '#A78BFA'} />
            </TouchableOpacity>
            <View style={styles.convertedBox}>
              <Text style={styles.convertedCurrency}>
                {row.direction === LOCAL_TO_BASE ? baseCurrency : (row.currency || '---')}
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
              Cotação de {row.rateDate}
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
  levels: { flexDirection: 'row', gap: 8 },
  level: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#202744', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  levelActive: { backgroundColor: '#6C2BD9', borderColor: '#9B6EF3' },
  levelText: { color: '#A5ACC8', fontSize: 13, fontWeight: '800' },
  levelTextActive: { color: '#fff' },
  empty: { alignItems: 'center', gap: 8, backgroundColor: '#10162B', borderRadius: 15, padding: 22, borderWidth: 1, borderColor: 'rgba(139,92,246,0.18)' },
  emptyText: { color: '#8F96B3', fontSize: 11, lineHeight: 17, textAlign: 'center' },
  destinationCard: { backgroundColor: '#10162B', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', gap: 11 },
  destinationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  destinationNameRow: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 },
  destinationName: { color: '#F7F7F2', fontSize: 14, fontWeight: '900' },
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
