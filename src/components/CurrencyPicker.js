import React, { useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CountryFlag from './CountryFlag';

export const CURRENCIES = [
  { code: 'BRL', name: 'Real brasileiro', country: 'BRA' },
  { code: 'USD', name: 'Dólar americano', country: 'USA' },
  { code: 'EUR', name: 'Euro', country: 'DEU' },
  { code: 'GBP', name: 'Libra esterlina', country: 'GBR' },
  { code: 'JPY', name: 'Iene japonês', country: 'JPN' },
  { code: 'CAD', name: 'Dólar canadense', country: 'CAN' },
  { code: 'AUD', name: 'Dólar australiano', country: 'AUS' },
  { code: 'CHF', name: 'Franco suíço', country: 'CHE' },
  { code: 'CNY', name: 'Yuan chinês', country: 'CHN' },
];

export const getCurrency = code => CURRENCIES.find(item => item.code === code) || CURRENCIES[0];

export default function CurrencyPicker({ label = '', value, onChange, supportingText = '' }) {
  const [visible, setVisible] = useState(false);
  const selected = getCurrency(value);
  return (
    <View style={styles.field}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity style={styles.selector} onPress={() => setVisible(true)}>
        <CountryFlag countryCode={selected.country} width={27} height={18} borderRadius={3} />
        <View style={{ flex: 1 }}><Text style={styles.code}>{selected.code}</Text><Text style={styles.name} numberOfLines={1}>{selected.name}</Text></View>
        <Ionicons name="chevron-down" size={17} color="#858DAD" />
      </TouchableOpacity>
      {!!supportingText && <Text style={styles.supportingText}>{supportingText}</Text>}
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setVisible(false)}>
          <View style={styles.modal}>
            <Text style={styles.title}>Escolha a moeda</Text>
            <FlatList data={CURRENCIES} keyExtractor={item => item.code} renderItem={({ item }) => (
              <TouchableOpacity style={[styles.option, item.code === value && styles.optionActive]} onPress={() => { onChange(item.code); setVisible(false); }}>
                <CountryFlag countryCode={item.country} width={32} height={22} borderRadius={4} />
                <View style={{ flex: 1 }}><Text style={styles.optionName}>{item.name}</Text><Text style={styles.optionCode}>{item.code}</Text></View>
                {item.code === value && <Ionicons name="checkmark-circle" size={20} color="#A78BFA" />}
              </TouchableOpacity>
            )} />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flex: 1, minWidth: 180, gap: 6 },
  label: { color: '#A5ACC8', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7 },
  selector: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#202744', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  code: { color: '#F7F7F2', fontWeight: '900', fontSize: 12 },
  name: { color: '#858DAD', fontSize: 9, marginTop: 1 },
  supportingText: { color: '#35D3C8', fontSize: 10, fontWeight: '700', marginTop: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 18 },
  modal: { width: '100%', maxWidth: 440, maxHeight: '78%', backgroundColor: '#171D36', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#30395D' },
  title: { color: '#fff', fontSize: 17, fontWeight: '900', marginBottom: 12 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 58, padding: 10, borderRadius: 12 },
  optionActive: { backgroundColor: 'rgba(139,92,246,0.14)' },
  optionName: { color: '#E7E8F1', fontSize: 13, fontWeight: '700' },
  optionCode: { color: '#777F9E', fontSize: 10, marginTop: 2 },
});
