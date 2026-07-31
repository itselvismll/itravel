import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { regeneratePlanActivity } from '../../services/assistantService';
import { saveTripPlan } from '../../services/tripPlanService';
import { notify } from '../../utils/dialogs';
import { toBrazilianDate } from '../../utils/dateUtils';

const TABS = [
  { id: 'itinerary', label: 'Roteiro', icon: 'map-outline' },
  { id: 'budget', label: 'Orçamento', icon: 'wallet-outline' },
  { id: 'checklist', label: 'Checklist', icon: 'checkbox-outline' },
  { id: 'tips', label: 'Dicas', icon: 'bulb-outline' },
];

const periodIcon = (period = '') => {
  const normalized = period.toLowerCase();
  if (normalized.includes('manhã')) return 'sunny-outline';
  if (normalized.includes('noite')) return 'moon-outline';
  return 'partly-sunny-outline';
};

const formatMoney = (value, currency = 'BRL') => {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(Number(value) || 0);
  } catch {
    return `${currency} ${Number(value || 0).toFixed(2)}`;
  }
};

export default function AssistantResultScreen({ route, navigation }) {
  const request = route.params?.request || route.params?.request_data || {};
  const [plan, setPlan] = useState(route.params?.plan || route.params?.plan_data || {});
  const [planId, setPlanId] = useState(route.params?.planId || route.params?.id || null);
  const userContext = route.params?.userContext || {};
  const [activeTab, setActiveTab] = useState('itinerary');
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState('');
  const [editing, setEditing] = useState(null);

  const checklistProgress = useMemo(() => {
    const items = plan.checklist || [];
    const done = items.filter(item => item.done).length;
    return { done, total: items.length, percent: items.length ? Math.round((done / items.length) * 100) : 0 };
  }, [plan.checklist]);

  const handleShare = async () => {
    const daySummary = (plan.days || []).map(day => (
      `Dia ${day.day} — ${day.theme}\n${(day.activities || []).map(item => `• ${item.period}: ${item.title}`).join('\n')}`
    )).join('\n\n');
    await Share.share({
      title: plan.title || 'Meu roteiro Journi',
      message: `${plan.title}\n${plan.summary}\n\n${daySummary}\n\nCriado no Journi ✈️`,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const result = await saveTripPlan({ planId, request, plan });
    setSaving(false);
    if (!result.success) {
      notify('Erro ao salvar', result.error || 'Tente novamente.');
      return;
    }
    setPlanId(result.data.id);
    notify('Roteiro salvo', result.warning || 'Você encontra esta viagem no seu perfil.');
  };

  const toggleChecklist = (index) => {
    setPlan(current => ({
      ...current,
      checklist: (current.checklist || []).map((item, itemIndex) => (
        itemIndex === index ? { ...item, done: !item.done } : item
      )),
    }));
  };

  const openMap = async (activity) => {
    const query = activity.mapQuery || `${activity.location}, ${request.destination}`;
    await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`);
  };

  const regenerateActivity = async (dayIndex, activityIndex) => {
    const key = `${dayIndex}-${activityIndex}`;
    setRegenerating(key);
    const result = await regeneratePlanActivity({
      planRequest: request,
      userContext,
      plan,
      block: { dayIndex, activityIndex },
    });
    setRegenerating('');
    if (!result.success) {
      notify('Não foi possível trocar a atividade', result.error);
      return;
    }
    setPlan(result.plan);
  };

  const startEditing = (dayIndex, activityIndex, activity) => {
    setEditing({ dayIndex, activityIndex, draft: { ...activity } });
  };

  const saveActivityEdit = () => {
    if (!editing) return;
    setPlan(current => ({
      ...current,
      days: current.days.map((day, dayIndex) => (
        dayIndex !== editing.dayIndex ? day : {
          ...day,
          activities: day.activities.map((activity, activityIndex) => (
            activityIndex === editing.activityIndex ? editing.draft : activity
          )),
        }
      )),
    }));
    setEditing(null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={22} color="#F7F7F2" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{plan.title || request.destination}</Text>
          <Text style={styles.headerSub}>{toBrazilianDate(request.startDate)} → {toBrazilianDate(request.endDate)} · {request.travelers} viajante(s)</Text>
        </View>
        <TouchableOpacity onPress={handleShare} style={styles.iconButton}>
          <Ionicons name="share-outline" size={21} color="#AAB1CC" />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {TABS.map(tab => (
          <TouchableOpacity key={tab.id} onPress={() => setActiveTab(tab.id)} style={[styles.tab, activeTab === tab.id && styles.tabActive]}>
            <Ionicons name={/** @type {any} */ (tab.icon)} size={16} color={activeTab === tab.id ? '#fff' : '#8D95B4'} />
            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View style={styles.aiBadge}><Ionicons name="sparkles" size={13} color="#C4B5FD" /><Text style={styles.aiBadgeText}>ROTEIRO PERSONALIZADO</Text></View>
            <Text style={styles.countryText}>{plan.destinationCountry}</Text>
          </View>
          <Text style={styles.summaryText}>{plan.summary}</Text>
          <View style={styles.quickFacts}>
            <Fact icon="time-outline" text={`${(plan.days || []).length} dias`} />
            <Fact icon="cash-outline" text={formatMoney(plan.budget?.total, plan.budget?.currency || request.currency)} />
            <Fact icon="walk-outline" text={request.pace === 'calm' ? 'Tranquilo' : request.pace === 'intense' ? 'Intenso' : 'Equilibrado'} />
          </View>
          {!!plan.weatherNote && <View style={styles.weatherBox}><Ionicons name="partly-sunny-outline" size={18} color="#35D3C8" /><Text style={styles.weatherText}>{plan.weatherNote}</Text></View>}
        </View>

        {activeTab === 'itinerary' && (
          <View style={styles.listGap}>
            {(plan.days || []).map((day, dayIndex) => (
              <View key={`${day.day}-${day.date}`} style={styles.dayCard}>
                <View style={styles.dayHeader}>
                  <View style={styles.dayNumber}><Text style={styles.dayNumberText}>{day.day}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dayTitle}>{day.theme}</Text>
                    <Text style={styles.dayDate}>{day.date || `Dia ${day.day}`}</Text>
                  </View>
                </View>
                {(day.activities || []).map((activity, activityIndex) => {
                  const key = `${dayIndex}-${activityIndex}`;
                  const isEditing = editing?.dayIndex === dayIndex && editing?.activityIndex === activityIndex;
                  return (
                    <View key={key} style={styles.activity}>
                      <View style={styles.timelineIcon}><Ionicons name={periodIcon(activity.period)} size={16} color="#A78BFA" /></View>
                      <View style={{ flex: 1 }}>
                        {isEditing ? (
                          <View style={styles.editBox}>
                            <TextInput value={editing.draft.title} onChangeText={title => setEditing(current => ({ ...current, draft: { ...current.draft, title } }))} style={styles.editInput} placeholderTextColor="#6F7798" />
                            <TextInput value={editing.draft.description} onChangeText={description => setEditing(current => ({ ...current, draft: { ...current.draft, description } }))} style={[styles.editInput, styles.editMultiline]} multiline placeholderTextColor="#6F7798" />
                            <View style={styles.actionRow}>
                              <SmallButton icon="close" label="Cancelar" onPress={() => setEditing(null)} />
                              <SmallButton icon="checkmark" label="Aplicar" primary onPress={saveActivityEdit} />
                            </View>
                          </View>
                        ) : (
                          <>
                            <Text style={styles.period}>{activity.period} · {activity.duration}</Text>
                            <Text style={styles.activityTitle}>{activity.title}</Text>
                            <Text style={styles.activityDescription}>{activity.description}</Text>
                            <View style={styles.metaRow}>
                              <Text style={styles.location} numberOfLines={1}>📍 {activity.location}</Text>
                              <Text style={styles.cost}>{formatMoney(activity.estimatedCost, plan.budget?.currency || request.currency)}</Text>
                            </View>
                            <View style={styles.actionRow}>
                              <SmallButton icon="map-outline" label="Mapa" onPress={() => openMap(activity)} />
                              <SmallButton icon="pencil-outline" label="Editar" onPress={() => startEditing(dayIndex, activityIndex, activity)} />
                              <SmallButton
                                icon="refresh-outline"
                                label={regenerating === key ? 'Trocando...' : 'Trocar com IA'}
                                loading={regenerating === key}
                                onPress={() => regenerateActivity(dayIndex, activityIndex)}
                              />
                            </View>
                          </>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        )}

        {activeTab === 'budget' && (
          <View style={styles.panel}>
            <Text style={styles.panelEyebrow}>ESTIMATIVA PARA TODA A VIAGEM</Text>
            <Text style={styles.totalBudget}>{formatMoney(plan.budget?.total, plan.budget?.currency || request.currency)}</Text>
            <Text style={styles.budgetStatus}>{plan.budgetStatus}</Text>
            <View style={styles.divider} />
            {(plan.budget?.items || []).map(item => (
              <View key={item.category} style={styles.budgetRow}>
                <View style={{ flex: 1 }}><Text style={styles.budgetCategory}>{item.category}</Text><Text style={styles.budgetNote}>{item.note}</Text></View>
                <Text style={styles.budgetAmount}>{formatMoney(item.amount, plan.budget.currency)}</Text>
              </View>
            ))}
          </View>
        )}

        {activeTab === 'checklist' && (
          <View style={styles.panel}>
            <View style={styles.progressHeader}><Text style={styles.panelTitle}>Preparação da viagem</Text><Text style={styles.progressText}>{checklistProgress.done}/{checklistProgress.total}</Text></View>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${checklistProgress.percent}%` }]} /></View>
            {(plan.checklist || []).map((item, index) => (
              <TouchableOpacity key={`${item.category}-${item.item}`} onPress={() => toggleChecklist(index)} style={styles.checkRow}>
                <Ionicons name={item.done ? 'checkbox' : 'square-outline'} size={22} color={item.done ? '#00D1C1' : '#6F7798'} />
                <View style={{ flex: 1 }}><Text style={styles.checkCategory}>{item.category}</Text><Text style={[styles.checkItem, item.done && styles.checkDone]}>{item.item}</Text></View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {activeTab === 'tips' && (
          <View style={styles.listGap}>
            <TipPanel title="Dicas práticas" icon="bulb-outline" color="#A78BFA" items={plan.practicalTips} />
            <TipPanel title="Segurança" icon="shield-checkmark-outline" color="#FF8AA0" items={plan.safetyTips} />
            {!!plan.sources?.length && (
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Fontes e atualizações</Text>
                {plan.sources.map(source => (
                  <TouchableOpacity key={`${source.label}-${source.url}`} onPress={() => source.url && Linking.openURL(source.url)} style={styles.sourceRow}>
                    <Ionicons name="open-outline" size={17} color="#8B5CF6" />
                    <View style={{ flex: 1 }}><Text style={styles.sourceLabel}>{source.label}</Text><Text style={styles.sourceDate}>{source.updatedAt}</Text></View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        <View style={styles.bottomActions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.replace('TripPlanner', { initialRequest: request })}>
            <Ionicons name="options-outline" size={18} color="#A78BFA" /><Text style={styles.secondaryText}>Alterar viagem</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Ionicons name="bookmark" size={18} color="#fff" />}
            <Text style={styles.saveText}>{planId ? 'Atualizar roteiro' : 'Salvar roteiro'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.disclaimer}>Valores são estimativas. Confirme preços, horários, documentos e alertas em fontes oficiais.</Text>
      </ScrollView>
    </View>
  );
}

function Fact({ icon, text }) {
  return <View style={styles.fact}><Ionicons name={/** @type {any} */ (icon)} size={15} color="#A78BFA" /><Text style={styles.factText}>{text}</Text></View>;
}

function SmallButton({ icon, label, onPress, primary = false, loading = false }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={loading} style={[styles.smallButton, primary && styles.smallButtonPrimary]}>
      {loading ? <ActivityIndicator size="small" color="#A78BFA" /> : <Ionicons name={/** @type {any} */ (icon)} size={14} color={primary ? '#fff' : '#A78BFA'} />}
      <Text style={[styles.smallButtonText, primary && { color: '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function TipPanel({ title, icon, color, items = [] }) {
  return (
    <View style={styles.panel}>
      <View style={styles.tipTitle}><Ionicons name={icon} size={19} color={color} /><Text style={styles.panelTitle}>{title}</Text></View>
      {items.map((item, index) => <Text key={`${item}-${index}`} style={styles.tipText}>• {item}</Text>)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1326' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  iconButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#1B2240', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#F7F7F2', fontSize: 16, fontWeight: '800' },
  headerSub: { color: '#858DAD', fontSize: 10, marginTop: 2 },
  tabs: { gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 99, backgroundColor: '#171D36' },
  tabActive: { backgroundColor: '#6C2BD9' },
  tabText: { color: '#8D95B4', fontSize: 12, fontWeight: '700' },
  tabTextActive: { color: '#fff' },
  content: { width: '100%', maxWidth: 860, alignSelf: 'center', padding: 15, paddingBottom: 50, gap: 14 },
  summaryCard: { padding: 18, borderRadius: 19, backgroundColor: '#171D36', borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)', gap: 12 },
  summaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(139,92,246,0.15)', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 99 },
  aiBadgeText: { color: '#C4B5FD', fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  countryText: { color: '#858DAD', fontSize: 11 },
  summaryText: { color: '#E8E9F3', fontSize: 14, lineHeight: 22 },
  quickFacts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#222946', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  factText: { color: '#C8CCE0', fontSize: 11, fontWeight: '700' },
  weatherBox: { flexDirection: 'row', gap: 9, backgroundColor: 'rgba(0,209,193,0.08)', borderRadius: 11, padding: 11 },
  weatherText: { color: '#A8DCD8', flex: 1, fontSize: 11, lineHeight: 17 },
  listGap: { gap: 13 },
  dayCard: { backgroundColor: '#151B33', borderRadius: 18, padding: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 4 },
  dayNumber: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#6C2BD9', alignItems: 'center', justifyContent: 'center' },
  dayNumberText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  dayTitle: { color: '#F7F7F2', fontSize: 15, fontWeight: '800' },
  dayDate: { color: '#777F9E', fontSize: 10, marginTop: 2 },
  activity: { flexDirection: 'row', gap: 11, paddingTop: 15, marginTop: 11, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.055)' },
  timelineIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(139,92,246,0.13)', alignItems: 'center', justifyContent: 'center' },
  period: { color: '#A78BFA', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  activityTitle: { color: '#F0F1F7', fontSize: 14, fontWeight: '800', marginTop: 3 },
  activityDescription: { color: '#9BA2BF', fontSize: 12, lineHeight: 18, marginTop: 5 },
  metaRow: { flexDirection: 'row', gap: 8, justifyContent: 'space-between', marginTop: 8 },
  location: { color: '#7F87A6', fontSize: 10, flex: 1 },
  cost: { color: '#35D3C8', fontSize: 10, fontWeight: '800' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  smallButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 9, borderWidth: 1, borderColor: 'rgba(167,139,250,0.25)', backgroundColor: 'rgba(139,92,246,0.07)' },
  smallButtonPrimary: { backgroundColor: '#6C2BD9', borderColor: '#6C2BD9' },
  smallButtonText: { color: '#BBA8FA', fontSize: 10, fontWeight: '700' },
  editBox: { gap: 8 },
  editInput: { color: '#fff', backgroundColor: '#202744', borderRadius: 10, padding: 10, fontSize: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  editMultiline: { minHeight: 74, textAlignVertical: 'top' },
  panel: { backgroundColor: '#151B33', borderRadius: 18, padding: 17, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  panelEyebrow: { color: '#858DAD', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  panelTitle: { color: '#F7F7F2', fontSize: 15, fontWeight: '800' },
  totalBudget: { color: '#35D3C8', fontSize: 30, fontWeight: '900', marginTop: 8 },
  budgetStatus: { color: '#9BA2BF', fontSize: 12, lineHeight: 18, marginTop: 5 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 15 },
  budgetRow: { flexDirection: 'row', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.045)' },
  budgetCategory: { color: '#E7E8F1', fontSize: 13, fontWeight: '800' },
  budgetNote: { color: '#777F9E', fontSize: 10, lineHeight: 15, marginTop: 3 },
  budgetAmount: { color: '#C4B5FD', fontSize: 12, fontWeight: '800' },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressText: { color: '#35D3C8', fontSize: 12, fontWeight: '800' },
  progressTrack: { height: 6, backgroundColor: '#252C48', borderRadius: 99, marginVertical: 13, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#00D1C1' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.045)' },
  checkCategory: { color: '#777F9E', fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  checkItem: { color: '#DDE0ED', fontSize: 12, marginTop: 2 },
  checkDone: { textDecorationLine: 'line-through', color: '#69718F' },
  tipTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 11 },
  tipText: { color: '#AAB0C9', fontSize: 12, lineHeight: 19, marginBottom: 6 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 12 },
  sourceLabel: { color: '#DDE0ED', fontSize: 12, fontWeight: '700' },
  sourceDate: { color: '#707896', fontSize: 9, marginTop: 2 },
  bottomActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  secondaryButton: { flex: 1, minWidth: 150, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13, padding: 14, borderWidth: 1, borderColor: '#6C2BD9' },
  secondaryText: { color: '#BBA8FA', fontSize: 12, fontWeight: '800' },
  saveButton: { flex: 1, minWidth: 150, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13, padding: 14, backgroundColor: '#6C2BD9' },
  saveText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  disclaimer: { color: '#636B89', fontSize: 9, lineHeight: 14, textAlign: 'center' },
});
