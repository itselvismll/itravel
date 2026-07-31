import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { deleteTripPlan, getSavedTripPlans } from '../../services/tripPlanService';
import { confirm, notify } from '../../utils/dialogs';

export default function SavedTripsScreen({ navigation }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    const result = await getSavedTripPlans();
    if (result.success) setPlans(result.data);
    else notify('Erro ao carregar roteiros', result.error);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { loadPlans(); }, [loadPlans]));

  const openPlan = (savedPlan) => {
    navigation.getParent()?.navigate('AssistantResult', {
      id: savedPlan.id,
      planId: savedPlan.id,
      request: savedPlan.request_data,
      plan: savedPlan.plan_data,
    });
  };

  const removePlan = async (plan) => {
    const approved = await confirm('Excluir roteiro', `Remover “${plan.title}”?`);
    if (!approved) return;
    const result = await deleteTripPlan(plan.id);
    if (!result.success) notify('Erro ao excluir', result.error);
    else setPlans(current => current.filter(item => item.id !== plan.id));
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={22} color="#F7F7F2" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Minhas viagens</Text>
          <Text style={styles.subtitle}>Roteiros planejados e salvos</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.getParent()?.navigate('TripPlanner')} style={styles.newButton}>
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#8B5CF6" style={{ marginTop: 50 }} />
      ) : plans.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Ionicons name="map-outline" size={34} color="#A78BFA" /></View>
          <Text style={styles.emptyTitle}>Nenhum roteiro salvo</Text>
          <Text style={styles.emptyText}>Planeje sua próxima viagem e encontre tudo organizado aqui.</Text>
          <TouchableOpacity style={styles.createButton} onPress={() => navigation.getParent()?.navigate('TripPlanner')}>
            <Ionicons name="sparkles" size={18} color="#fff" />
            <Text style={styles.createText}>Planejar viagem</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {plans.map(plan => {
            const request = plan.request_data || {};
            const days = plan.plan_data?.days?.length || 0;
            return (
              <TouchableOpacity key={plan.id} onPress={() => openPlan(plan)} style={styles.card} activeOpacity={0.86}>
                <View style={styles.cardIcon}><Ionicons name="airplane" size={20} color="#C4B5FD" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{plan.title}</Text>
                  <Text style={styles.destination}>{plan.origin ? `${plan.origin} → ` : ''}{plan.destination}</Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.meta}>{days} dias</Text>
                    <Text style={styles.dot}>•</Text>
                    <Text style={styles.meta}>{request.travelers || plan.travelers} viajante(s)</Text>
                    {plan.local_only && <Text style={styles.localBadge}>LOCAL</Text>}
                  </View>
                </View>
                <TouchableOpacity onPress={() => removePlan(plan)} style={styles.deleteButton}>
                  <Ionicons name="trash-outline" size={18} color="#FF8AA0" />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1326' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  iconButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#1B2240', alignItems: 'center', justifyContent: 'center' },
  newButton: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#6C2BD9', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#F7F7F2', fontSize: 18, fontWeight: '800' },
  subtitle: { color: '#858DAD', fontSize: 11, marginTop: 2 },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 15, gap: 11, paddingBottom: 50 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, backgroundColor: '#171D36', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  cardIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(139,92,246,0.16)', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: '#F7F7F2', fontSize: 14, fontWeight: '800' },
  destination: { color: '#A2A9C5', fontSize: 11, marginTop: 3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  meta: { color: '#707896', fontSize: 9 },
  dot: { color: '#4D5575', fontSize: 9 },
  localBadge: { color: '#35D3C8', fontSize: 8, fontWeight: '900', marginLeft: 4 },
  deleteButton: { padding: 9 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: 'rgba(139,92,246,0.13)', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: '#F7F7F2', fontSize: 18, fontWeight: '800', marginTop: 18 },
  emptyText: { color: '#858DAD', fontSize: 12, lineHeight: 19, textAlign: 'center', maxWidth: 300, marginTop: 7 },
  createButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#6C2BD9', paddingHorizontal: 18, paddingVertical: 13, borderRadius: 12, marginTop: 20 },
  createText: { color: '#fff', fontSize: 12, fontWeight: '800' },
});
