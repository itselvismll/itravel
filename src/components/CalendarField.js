import React, { useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { parseBrazilianDate } from '../utils/dateUtils';

const WEEK_DAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const pad = value => String(value).padStart(2, '0');
const toBr = date => `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
const startOfDay = date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export default function CalendarField({ label, value, onChange, minDate = new Date() }) {
  const selected = parseBrazilianDate(value);
  const [visible, setVisible] = useState(false);
  const [month, setMonth] = useState(() => selected || minDate || new Date());
  const minimum = startOfDay(minDate || new Date());

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array(first.getDay()).fill(null), ...Array.from({ length: count }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1))];
  }, [month]);

  const moveMonth = delta => setMonth(current => new Date(current.getFullYear(), current.getMonth() + delta, 1));

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.input} onPress={() => setVisible(true)}>
        <Text style={value ? styles.value : styles.placeholder}>{value || 'Selecionar data'}</Text>
        <Ionicons name="calendar-outline" size={19} color="#A78BFA" />
      </TouchableOpacity>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.monthHeader}>
              <TouchableOpacity onPress={() => moveMonth(-1)} style={styles.icon}><Ionicons name="chevron-back" size={21} color="#fff" /></TouchableOpacity>
              <Text style={styles.monthTitle}>{MONTHS[month.getMonth()]} {month.getFullYear()}</Text>
              <TouchableOpacity onPress={() => moveMonth(1)} style={styles.icon}><Ionicons name="chevron-forward" size={21} color="#fff" /></TouchableOpacity>
            </View>
            <View style={styles.grid}>{WEEK_DAYS.map((day, index) => <Text key={`${day}-${index}`} style={styles.weekDay}>{day}</Text>)}</View>
            <View style={styles.grid}>
              {days.map((date, index) => {
                if (!date) return <View key={`empty-${index}`} style={styles.day} />;
                const disabled = startOfDay(date) < minimum;
                const active = selected && toBr(selected) === toBr(date);
                return (
                  <TouchableOpacity
                    key={date.toISOString()}
                    disabled={disabled}
                    style={[styles.day, active && styles.dayActive]}
                    onPress={() => { onChange(toBr(date)); setVisible(false); }}
                  >
                    <Text style={[styles.dayText, disabled && styles.dayDisabled, active && styles.dayActiveText]}>{date.getDate()}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={styles.close} onPress={() => setVisible(false)}><Text style={styles.closeText}>Cancelar</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flex: 1, minWidth: 150, gap: 6 },
  label: { color: '#A5ACC8', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7 },
  input: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, backgroundColor: '#202744', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', paddingHorizontal: 13 },
  value: { color: '#F7F7F2', fontSize: 14 },
  placeholder: { color: '#626987', fontSize: 14 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  modal: { width: '100%', maxWidth: 390, borderRadius: 20, backgroundColor: '#171D36', padding: 16, borderWidth: 1, borderColor: '#323B60' },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  monthTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  icon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekDay: { width: '14.285%', textAlign: 'center', color: '#777F9E', fontSize: 11, fontWeight: '800', marginBottom: 8 },
  day: { width: '14.285%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 99 },
  dayActive: { backgroundColor: '#6C2BD9' },
  dayText: { color: '#E9EAF2', fontSize: 13, fontWeight: '600' },
  dayDisabled: { color: '#424966' },
  dayActiveText: { color: '#fff', fontWeight: '900' },
  close: { alignSelf: 'center', marginTop: 12, paddingHorizontal: 20, paddingVertical: 9 },
  closeText: { color: '#A78BFA', fontWeight: '800' },
});

