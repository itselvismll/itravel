import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getCurrentUser, getVisitedCountries } from '../../services/supabase';
import { getWishlist } from '../../services/socialService';
import {
  generateTravelPlan,
  TRAVEL_INTERESTS,
  TRAVEL_PACES,
} from '../../services/assistantService';
import { getCountryNamePtByCode } from '../../utils/countryUtils';
import {
  maskBrazilianDate,
  parseBrazilianDate,
  toBrazilianDate,
  toIsoDate,
} from '../../utils/dateUtils';

const TRAVELER_TYPES = ['Solo', 'Casal', 'Família', 'Amigos', 'Trabalho'];
const CURRENCIES = ['BRL', 'USD', 'EUR', 'GBP'];

const initialForm = {
  origin: '',
  destination: '',
  startDate: '',
  endDate: '',
  travelers: '1',
  travelerType: 'Solo',
  budget: '',
  currency: 'BRL',
  pace: 'balanced',
  interests: [],
  foodPreferences: '',
  accessibility: '',
  notes: '',
};

export default function TripPlannerScreen({ navigation, route }) {
  const [form, setForm] = useState(() => {
    const initialRequest = route.params?.initialRequest || {};
    return {
      ...initialForm,
      ...initialRequest,
      startDate: toBrazilianDate(initialRequest.startDate),
      endDate: toBrazilianDate(initialRequest.endDate),
      travelers: String(initialRequest.travelers || initialForm.travelers),
      budget: initialRequest.budget ? String(initialRequest.budget) : '',
    };
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const duration = useMemo(() => {
    const start = parseBrazilianDate(form.startDate);
    const end = parseBrazilianDate(form.endDate);
    if (!start || !end || end < start) return null;
    return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  }, [form.endDate, form.startDate]);

  const update = (field, value) => {
    setForm(current => ({ ...current, [field]: value }));
    setError('');
  };

  const toggleInterest = (interest) => {
    update(
      'interests',
      form.interests.includes(interest)
        ? form.interests.filter(item => item !== interest)
        : [...form.interests, interest].slice(0, 6)
    );
  };

  const validate = () => {
    if (!form.destination.trim()) return 'Informe para onde você quer viajar.';
    if (!form.origin.trim()) return 'Informe sua cidade de origem.';
    const start = parseBrazilianDate(form.startDate);
    const end = parseBrazilianDate(form.endDate);
    if (!start || !end) return 'Use datas válidas no formato DD/MM/AAAA.';
    if (end < start) return 'A data de volta deve ser posterior à data de ida.';
    if (duration > 14) return 'Nesta versão, o roteiro pode ter no máximo 14 dias.';
    if (Number(form.travelers) < 1 || Number(form.travelers) > 30) {
      return 'Informe de 1 a 30 viajantes.';
    }
    if (form.interests.length === 0) return 'Escolha pelo menos um interesse.';
    return null;
  };

  const buildUserContext = async () => {
    const user = await getCurrentUser();
    if (!user) return {};
    const [visitedResult, wishlistResult] = await Promise.all([
      getVisitedCountries(user.id),
      getWishlist(user.id),
    ]);
    const visited = visitedResult.data || [];
    return {
      visitedCountries: visited.map(item => item.country_name).filter(Boolean),
      wishlistCountries: (wishlistResult.data || []).map(item => (
        getCountryNamePtByCode(item.country_code, item.country_name)
      )),
      level: visited.length > 10 ? 'Experiente' : visited.length > 3 ? 'Viajante' : 'Iniciante',
    };
  };

  const handleGenerate = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError('');
    const planRequest = {
      ...form,
      origin: form.origin.trim(),
      destination: form.destination.trim(),
      startDate: toIsoDate(form.startDate),
      endDate: toIsoDate(form.endDate),
      duration,
      travelers: Number(form.travelers),
      budget: Number(form.budget) || 0,
    };

    try {
      const userContext = await buildUserContext();
      const result = await generateTravelPlan({ planRequest, userContext });
      if (!result.success) {
        setError(result.error);
        return;
      }
      navigation.replace('AssistantResult', {
        request: planRequest,
        plan: result.plan,
        liveContext: result.liveContext,
        userContext,
      });
    } catch {
      setError('Não foi possível gerar seu roteiro agora. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={22} color="#F7F7F2" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Planejar com IA</Text>
          <Text style={styles.headerSubtitle}>Um roteiro feito para o seu jeito de viajar</Text>
        </View>
        <Ionicons name="sparkles" size={24} color="#8B5CF6" />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>SEU PRÓXIMO DESTINO</Text>
          <Text style={styles.heroTitle}>Conte os detalhes. A gente organiza a aventura.</Text>
          <Text style={styles.heroText}>
            Datas, orçamento e preferências ajudam a criar dias possíveis, próximos e personalizados.
          </Text>
        </View>

        <FormSection icon="location-outline" title="Trajeto">
          <Field label="Saindo de" value={form.origin} onChangeText={value => update('origin', value)} placeholder="Ex: São Paulo" />
          <Field label="Destino" value={form.destination} onChangeText={value => update('destination', value)} placeholder="Ex: Paris, França" />
        </FormSection>

        <FormSection icon="calendar-outline" title="Datas">
          <View style={styles.row}>
            <Field
              compact
              label="Ida"
              value={form.startDate}
              onChangeText={value => update('startDate', maskBrazilianDate(value, form.startDate))}
              placeholder="DD/MM/AAAA"
              keyboardType="number-pad"
              maxLength={10}
            />
            <Field
              compact
              label="Volta"
              value={form.endDate}
              onChangeText={value => update('endDate', maskBrazilianDate(value, form.endDate))}
              placeholder="DD/MM/AAAA"
              keyboardType="number-pad"
              maxLength={10}
            />
          </View>
          <Text style={styles.helperText}>
            {duration ? `${duration} dia${duration > 1 ? 's' : ''} de roteiro` : 'Máximo de 14 dias por roteiro'}
          </Text>
        </FormSection>

        <FormSection icon="people-outline" title="Quem vai">
          <Field
            label="Número de viajantes"
            value={String(form.travelers)}
            onChangeText={value => update('travelers', value.replace(/\D/g, '').slice(0, 2))}
            keyboardType="number-pad"
            placeholder="1"
          />
          <ChipGroup values={TRAVELER_TYPES} selected={[form.travelerType]} onPress={value => update('travelerType', value)} />
        </FormSection>

        <FormSection icon="wallet-outline" title="Orçamento total">
          <View style={styles.row}>
            <Field compact label="Valor" value={form.budget} onChangeText={value => update('budget', value.replace(/[^0-9.,]/g, ''))} keyboardType="decimal-pad" placeholder="Ex: 8000" />
            <View style={styles.compactField}>
              <Text style={styles.label}>Moeda</Text>
              <ChipGroup values={CURRENCIES} selected={[form.currency]} onPress={value => update('currency', value)} compact />
            </View>
          </View>
        </FormSection>

        <FormSection icon="speedometer-outline" title="Ritmo da viagem">
          <ChipGroup
            values={TRAVEL_PACES.map(item => item.label)}
            selected={[TRAVEL_PACES.find(item => item.id === form.pace)?.label]}
            onPress={label => update('pace', TRAVEL_PACES.find(item => item.label === label)?.id || 'balanced')}
          />
        </FormSection>

        <FormSection icon="heart-outline" title="O que você gosta">
          <Text style={styles.helperText}>Escolha até 6 interesses.</Text>
          <ChipGroup values={TRAVEL_INTERESTS} selected={form.interests} onPress={toggleInterest} />
        </FormSection>

        <FormSection icon="options-outline" title="Preferências importantes">
          <Field label="Alimentação" value={form.foodPreferences} onChangeText={value => update('foodPreferences', value)} placeholder="Ex: vegetariano, sem lactose..." multiline />
          <Field label="Acessibilidade" value={form.accessibility} onChangeText={value => update('accessibility', value)} placeholder="Mobilidade, pausas, crianças, idosos..." multiline />
          <Field label="Observações" value={form.notes} onChangeText={value => update('notes', value)} placeholder="Algo que não pode faltar ou que prefere evitar" multiline />
        </FormSection>

        {!!error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={19} color="#FF8AA0" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.generateButton, loading && styles.disabled]}
          onPress={handleGenerate}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Ionicons name="sparkles" size={20} color="#fff" />}
          <Text style={styles.generateText}>{loading ? 'Montando seu roteiro...' : 'Criar meu roteiro'}</Text>
        </TouchableOpacity>
        <Text style={styles.disclaimer}>Custos e horários são estimativas. Confirme reservas e regras oficiais.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FormSection({ icon, title, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionTitleRow}>
        <View style={styles.sectionIcon}><Ionicons name={icon} size={17} color="#A78BFA" /></View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Field({ label, compact = false, ...props }) {
  return (
    <View style={compact ? styles.compactField : styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor="#626987"
        style={[styles.input, props.multiline && styles.multiline]}
      />
    </View>
  );
}

function ChipGroup({ values, selected, onPress, compact = false }) {
  return (
    <View style={[styles.chips, compact && styles.compactChips]}>
      {values.map(value => {
        const active = selected.includes(value);
        return (
          <TouchableOpacity key={value} onPress={() => onPress(value)} style={[styles.chip, active && styles.chipActive]}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{value}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1326' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  iconButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#1B2240', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#F7F7F2', fontSize: 18, fontWeight: '800' },
  headerSubtitle: { color: '#8F96B3', fontSize: 11, marginTop: 2 },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16, paddingBottom: 56, gap: 14 },
  hero: { backgroundColor: '#171D36', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: 'rgba(139,92,246,0.35)' },
  heroEyebrow: { color: '#A78BFA', fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  heroTitle: { color: '#fff', fontSize: 23, lineHeight: 30, fontWeight: '800', marginTop: 8 },
  heroText: { color: '#9DA4C3', fontSize: 13, lineHeight: 20, marginTop: 8 },
  section: { backgroundColor: '#151B33', borderRadius: 18, padding: 16, gap: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  sectionIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: 'rgba(139,92,246,0.14)', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { color: '#F7F7F2', fontSize: 15, fontWeight: '800' },
  field: { width: '100%', gap: 6 },
  compactField: { flex: 1, minWidth: 130, gap: 6 },
  label: { color: '#A5ACC8', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7 },
  input: { color: '#F7F7F2', backgroundColor: '#202744', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', paddingHorizontal: 13, paddingVertical: 12, fontSize: 14 },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  helperText: { color: '#757D9D', fontSize: 11, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  compactChips: { gap: 5 },
  chip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 99, backgroundColor: '#202744', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  chipActive: { backgroundColor: '#6C2BD9', borderColor: '#9B6EF3' },
  chipText: { color: '#9DA4C3', fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: '#fff' },
  errorBox: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: 'rgba(255,77,109,0.12)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,77,109,0.35)' },
  errorText: { color: '#FFB0BF', flex: 1, fontSize: 12, lineHeight: 18 },
  generateButton: { backgroundColor: '#6C2BD9', borderRadius: 15, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  generateText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.65 },
  disclaimer: { color: '#676F90', fontSize: 10, textAlign: 'center', lineHeight: 16 },
});
