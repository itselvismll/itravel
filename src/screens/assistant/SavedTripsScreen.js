import React, { useCallback, useEffect, useState } from 'react';
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
import { useActivePlan } from '../../context/ActivePlanContext';
import useTabBarContentPadding from '../../hooks/useTabBarContentPadding';
import TripListCard from '../../components/trip/TripListCard';
import { getTourismImage } from '../../services/tourismImageService';
import {
  countPlanStops,
  coverSearchTerm,
  destinationTitle,
  tripChips,
  tripDurationDays,
} from '../../utils/tripSummary';

export default function SavedTripsScreen({ navigation }) {
  // Dentro do ProfileStack, sob as tabs: a barra cobriria o último roteiro.
  const tabBarPadding = useTabBarContentPadding();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  // Capa de cada viagem, por id. O serviço tem cache próprio (memória +
  // localStorage), então voltar para a lista não repete nenhuma ida à rede — o
  // estado aqui é só o que já foi resolvido nesta sessão.
  const [covers, setCovers] = useState({});

  // Esta tela é o ÚNICO controle de "roteiro no globo" — o mapa não tem botão
  // nem card sobreposto. Só um roteiro fica aplicado por vez: aplicar outro
  // substitui o anterior (a troca é atômica no banco, ver activePlanService).
  const { activePlanId, applyToMap, removeFromMap } = useActivePlan();

  const loadPlans = useCallback(async () => {
    setLoading(true);
    const result = await getSavedTripPlans();
    if (result.success) setPlans(result.data);
    else notify('Erro ao carregar roteiros', result.error);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { loadPlans(); }, [loadPlans]));

  // Uma busca por DESTINO, não por viagem: duas viagens para a Itália dividem a
  // mesma foto e a mesma entrada de cache.
  useEffect(() => {
    let cancelled = false;

    plans.forEach((plan) => {
      // Um destino, não a lista: "Itália, Croácia, Eslováquia" não casa com nada
      // no Wikimedia e o cartão ficaria sem foto.
      const destino = coverSearchTerm(
        plan.request_data?.destinations,
        plan.destination || plan.title
      );
      if (!destino || covers[plan.id]) return;

      getTourismImage(null, destino).then((image) => {
        if (cancelled || !image?.url) return;
        setCovers((current) => ({ ...current, [plan.id]: image.url }));
      });
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `covers` é o acumulador; relê-lo aqui reiniciaria a busca a cada foto que chega
  }, [plans]);

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
    if (!result.success) {
      notify('Erro ao excluir', result.error);
      return;
    }
    // O roteiro excluído não pode continuar plotado no globo.
    if (plan.id === activePlanId) await removeFromMap();
    setPlans(current => current.filter(item => item.id !== plan.id));
  };

  const toggleOnMap = async (plan) => {
    const isActive = plan.id === activePlanId;
    const hasPoints = (plan.plan_data?.days || []).some(
      day => (day?.activities || []).some(activity => activity?.latitude != null)
    );

    // Roteiro antigo, salvo antes de as coordenadas existirem, não tem o que
    // plotar — melhor dizer isso do que aplicar e o globo não mudar nada.
    if (!isActive && !hasPoints) {
      notify('Sem pontos no mapa', 'Este roteiro não tem coordenadas. Gere-o novamente para vê-lo no globo.');
      return;
    }

    const result = isActive ? await removeFromMap() : await applyToMap(plan);
    if (!result.success) notify('Não foi possível atualizar o globo', result.error);
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
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: tabBarPadding }]}
          showsVerticalScrollIndicator={false}
        >
          {plans.map(plan => {
            const request = plan.request_data || {};
            const isActive = plan.id === activePlanId;

            // Os MESMOS números e o MESMO título da tela da viagem: é o que faz
            // a lista e a tela parecerem o mesmo produto.
            const chips = tripChips({
              startDate: request.startDate || plan.start_date,
              durationDays: tripDurationDays({
                startDate: request.startDate || plan.start_date,
                endDate: request.endDate || plan.end_date,
                planDays: (plan.plan_data?.days || []).length,
              }),
              travelers: Number(request.travelers || plan.travelers) || null,
              stops: countPlanStops(plan.plan_data),
            });

            return (
              <View key={plan.id} style={styles.tripBlock}>
                <TripListCard
                  title={destinationTitle(request.destinations, plan.destination || plan.title)}
                  photoUrl={covers[plan.id] || null}
                  chips={chips}
                  appliedToMap={isActive}
                  onPress={() => openPlan(plan)}
                />

                <View style={styles.actionRow}>
                  <TouchableOpacity
                    onPress={() => toggleOnMap(plan)}
                    style={[styles.mapButton, isActive && styles.mapButtonActive]}
                    accessibilityLabel={isActive ? 'Remover do mapa' : 'Aplicar no mapa'}
                  >
                    <Ionicons
                      name={isActive ? 'eye-off-outline' : 'map-outline'}
                      size={15}
                      color={isActive ? '#C4B5FD' : '#fff'}
                    />
                    <Text style={[styles.mapButtonText, isActive && styles.mapButtonTextActive]}>
                      {isActive ? 'Remover do mapa' : 'Aplicar no mapa'}
                    </Text>
                  </TouchableOpacity>

                  {plan.local_only ? <Text style={styles.localBadge}>LOCAL</Text> : null}

                  <TouchableOpacity
                    onPress={() => removePlan(plan)}
                    style={styles.deleteButton}
                    accessibilityLabel={`Excluir ${plan.title}`}
                  >
                    <Ionicons name="trash-outline" size={18} color="#FF8AA0" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1326' },
  // Cartão + fileira de ações formam um bloco; o `gap` do conteúdo separa uma
  // viagem da outra.
  tripBlock: { gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  iconButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#1B2240', alignItems: 'center', justifyContent: 'center' },
  newButton: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#6C2BD9', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#F7F7F2', fontSize: 18, fontWeight: '800' },
  subtitle: { color: '#858DAD', fontSize: 11, marginTop: 2 },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 15, gap: 11, paddingBottom: 50 },
  // O cartão de caixa cinza com ícone de avião virou o TripListCard, com a foto
  // do destino — mesma linguagem da capa da tela da viagem.
  // O roteiro plotado no globo se destaca na cor da marca, para a resposta de
  // "qual está no mapa?" caber num relance da lista.
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mapButton: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#6C2BD9', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 11 },
  mapButtonActive: { backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(196,181,253,0.35)' },
  mapButtonText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  mapButtonTextActive: { color: '#C4B5FD' },
  // O selo de "no globo" mora no cartão (TripListCard), sobre a capa.
  localBadge: { color: '#35D3C8', fontSize: 8, fontWeight: '900', marginLeft: 4 },
  deleteButton: { padding: 9 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: 'rgba(139,92,246,0.13)', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: '#F7F7F2', fontSize: 18, fontWeight: '800', marginTop: 18 },
  emptyText: { color: '#858DAD', fontSize: 12, lineHeight: 19, textAlign: 'center', maxWidth: 300, marginTop: 7 },
  createButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#6C2BD9', paddingHorizontal: 18, paddingVertical: 13, borderRadius: 12, marginTop: 20 },
  createText: { color: '#fff', fontSize: 12, fontWeight: '800' },
});
