import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { API_CONFIG, COLORS, SIZES } from '../utils/constants';
import { uploadPhoto } from '../services/photoService';
import { getAlpha2, getAlpha3 } from '../utils/countryUtils';
import { markCountryAsVisited } from '../services/supabase';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';

const GOOGLE_PLACES_KEY = API_CONFIG.GOOGLE_MAPS_API_KEY;
const IS_WEB = process.env.EXPO_OS === 'web';

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export default function PhotoUploader({
  countryCode = null, countryName = null, countryNameEn = null, userId, onPhotoUploaded,
  prefilledCity = null, prefilledCountryName = null, prefilledCountryCode = null,
  prefilledCityLat = null, prefilledCityLng = null,
}) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [selectedCity, setSelectedCity] = useState(null);
  const [loadingCities, setLoadingCities] = useState(false);
  const [cityError, setCityError] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [locationName, setLocationName] = useState('');
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');
  const fileInputRef = useRef(null);
  const searchTimerRef = useRef(null);
  const citySearchAbortRef = useRef(null);

  // Valores efetivos: fluxo do mapa tem prioridade sobre prefill do GPS
  // prefilledCountryCode vem como alpha-2 do GPS (ex: 'BR') — converte para alpha-3 (ex: 'BRA')
  const effectiveCountryCode = countryCode || (prefilledCountryCode ? getAlpha3(prefilledCountryCode) : '') || '';
  const effectiveCountryName = countryName || prefilledCountryName || '';
  const effectiveCountryNameEn = countryNameEn || prefilledCountryName || '';
  const effectiveCountryAlpha2 = getAlpha2(effectiveCountryCode)?.toLowerCase() || '';

  const getPrefilledCity = () => {
    if (countryCode || !prefilledCity) return null;
    return {
      shortName: prefilledCity,
      country: prefilledCountryName || '',
      countryCode: prefilledCountryCode || '',
      lat: Number.isFinite(prefilledCityLat) ? prefilledCityLat : null,
      lng: Number.isFinite(prefilledCityLng) ? prefilledCityLng : null,
    };
  };

  // Inicializar cidade a partir do GPS quando não há countryCode (fluxo global)
  useEffect(() => {
    const detectedCity = getPrefilledCity();
    if (detectedCity) {
      setCitySearch(prefilledCity);
      setSelectedCity(detectedCity);
    }
  }, [
    prefilledCity,
    prefilledCountryName,
    prefilledCityLat,
    prefilledCityLng,
    countryCode,
  ]);

  useEffect(() => () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    citySearchAbortRef.current?.abort();
    if (IS_WEB && preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
  }, [preview]);

  const searchCities = async (query) => {
    if (query.length < 3) {
      citySearchAbortRef.current?.abort();
      setCitySuggestions([]);
      setLoadingCities(false);
      return;
    }

    citySearchAbortRef.current?.abort();
    const controller = new AbortController();
    citySearchAbortRef.current = controller;
    setLoadingCities(true);

    try {
      const countryQuery = effectiveCountryNameEn || effectiveCountryName;
      const searchQuery = countryQuery ? `${query}, ${countryQuery}` : query;
      const response = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(searchQuery)}&limit=12&lang=pt`,
        { signal: controller.signal }
      );
      if (!response.ok) throw new Error(`Busca de cidades indisponível (${response.status})`);
      const data = await response.json();
      const seen = new Set();
      const cities = (data.features || [])
        .filter((feature) => {
          if (!['city', 'town', 'village', 'locality', 'municipality']
            .includes(feature.properties?.type)) return false;
          const featureCountryCode = feature.properties?.countrycode?.toLowerCase();
          return !effectiveCountryAlpha2 ||
            !featureCountryCode ||
            featureCountryCode === effectiveCountryAlpha2;
        })
        .map((feature) => {
          const shortName = feature.properties.name;
          const country = feature.properties.country || effectiveCountryName;
          const countryCode = feature.properties?.countrycode?.toUpperCase() || '';
          const key = `${shortName}|${country}`.toLocaleLowerCase('pt-BR');
          if (!shortName || seen.has(key)) return null;
          seen.add(key);
          return {
            name: `${shortName}, ${country}`,
            shortName,
            country,
            countryCode,
            lat: feature.geometry.coordinates[1],
            lng: feature.geometry.coordinates[0],
          };
        })
        .filter(Boolean)
        .slice(0, 8);
      setCitySuggestions(cities);
    } catch (error) {
      if (error?.name !== 'AbortError') setCitySuggestions([]);
    } finally {
      if (citySearchAbortRef.current === controller) {
        setLoadingCities(false);
      }
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > MAX_SIZE_BYTES) {
      Alert.alert('Arquivo muito grande', 'A imagem deve ter no máximo 5MB.');
      e.target.value = '';
      return;
    }

    setSelectedFile(file);
    setUploadSuccess(false);
    setPreview(URL.createObjectURL(file));
  };

  const handlePickPhoto = async () => {
    if (IS_WEB) {
      fileInputRef.current?.click();
      return;
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permissão necessária', 'Permita o acesso às fotos para adicionar uma imagem.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.85,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > MAX_SIZE_BYTES) {
        Alert.alert('Arquivo muito grande', 'A imagem deve ter no máximo 5MB.');
        return;
      }

      setSelectedFile(asset);
      setUploadSuccess(false);
      setPreview(asset.uri);
    } catch {
      Alert.alert('Erro', 'Não foi possível abrir sua biblioteca de fotos.');
    }
  };

  const handleRemovePreview = () => {
    if (IS_WEB && preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
    setSelectedFile(null);
    setPreview(null);
    setCaption('');
    const detectedCity = getPrefilledCity();
    setCitySearch(detectedCity?.shortName || '');
    setCitySuggestions([]);
    setSelectedCity(detectedCity);
    setCityError(false);
    setUploadSuccess(false);
    setLocationName('');
    setRating(0);
    setReview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    if (!selectedCity) {
      setCityError(true);
      Alert.alert('Cidade obrigatória', 'Por favor, selecione a cidade onde a foto foi tirada.');
      return;
    }

    setUploading(true);

    const uploadCountryCode =
      effectiveCountryCode ||
      getAlpha3(selectedCity.countryCode)?.toUpperCase() ||
      selectedCity.countryCode;
    const uploadCountryName = effectiveCountryName || selectedCity.country;

    if (!uploadCountryCode || !uploadCountryName) {
      setUploading(false);
      setCityError(true);
      Alert.alert(
        'País não identificado',
        'Selecione novamente a cidade para identificarmos o país da foto.'
      );
      return;
    }

    const result = await uploadPhoto(userId, uploadCountryCode, uploadCountryName, selectedFile, caption, {
      city: selectedCity?.shortName || null,
      city_lat: selectedCity?.lat ?? null,
      city_lng: selectedCity?.lng ?? null,
      country_code: uploadCountryCode,
      country_name: uploadCountryName,
      is_public: isPublic,
      location_name: locationName.trim() || null,
      rating: rating || null,
      review: review.trim() || null,
    });

    setUploading(false);

    if (result.success) {
      let visitResult = { success: true };
      if (userId && uploadCountryCode) {
        visitResult = await markCountryAsVisited(
          userId,
          uploadCountryCode,
          uploadCountryName
        );
      }

      if (!visitResult.success) {
        Alert.alert(
          'Foto enviada',
          'A foto foi salva, mas não foi possível atualizar o país visitado agora.'
        );
      }

      setUploadSuccess(true);
      if (onPhotoUploaded) onPhotoUploaded(result.data);
      setTimeout(() => {
        handleRemovePreview();
      }, 1500);
    } else {
      Alert.alert('Erro no upload', result.error || 'Não foi possível enviar a foto.');
    }
  };

  return (
    <View style={styles.container}>
      {/* Input file nativo web — oculto */}
      {IS_WEB && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/jpg"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      )}

      {!selectedFile ? (
        <TouchableOpacity
          style={styles.addButton}
          onPress={handlePickPhoto}
          activeOpacity={0.7}
        >
          <Ionicons name="camera" size={22} color={COLORS.primary} />
          <Text style={styles.addButtonText}>+ Adicionar Foto</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.uploadForm}>
          {/* Preview */}
          <View style={styles.previewContainer}>
            <Image source={{ uri: preview }} style={styles.previewImage} resizeMode="cover" />
            <TouchableOpacity
              style={styles.removeButton}
              onPress={handleRemovePreview}
              disabled={uploading}
            >
              <Ionicons name="close-circle" size={26} color={COLORS.error} />
            </TouchableOpacity>

            {uploadSuccess && (
              <View style={styles.successOverlay}>
                <Ionicons name="checkmark-circle" size={48} color={COLORS.success} />
                <Text style={styles.successText}>Enviado!</Text>
              </View>
            )}
          </View>

          {/* Caption */}
          <TextInput
            style={styles.captionInput}
            placeholder="Adicione uma legenda (opcional)"
            placeholderTextColor={COLORS.textSecondary}
            value={caption}
            onChangeText={setCaption}
            maxLength={200}
            editable={!uploading}
          />

          {/* Cidade */}
          <View style={styles.cityContainer}>
            <Text style={styles.cityLabel}>
              Em qual cidade você estava? <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.cityInput, cityError && { borderColor: 'red' }]}
              placeholder="Digite o nome da cidade..."
              placeholderTextColor={COLORS.textSecondary}
              value={citySearch}
              onChangeText={(text) => {
                setCitySearch(text);
                setSelectedCity(null);
                setCityError(false);
                if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                searchTimerRef.current = setTimeout(() => {
                  searchCities(text);
                }, 400);
              }}
              editable={!uploading}
            />
            {loadingCities && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <ActivityIndicator size="small" color="#6C2BD9" />
                <Text style={{ fontSize: 11, color: '#999' }}>Buscando cidades...</Text>
              </View>
            )}
            {!loadingCities && citySuggestions.length === 0 && citySearch.length >= 3 && !selectedCity && (
              <Text style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                Nenhuma cidade encontrada. Tente outro nome.
              </Text>
            )}
            {citySuggestions.length > 0 && !selectedCity && (
              <View style={styles.suggestionsContainer}>
                {citySuggestions.map((city, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.suggestionItem,
                      index === citySuggestions.length - 1 && { borderBottomWidth: 0 },
                    ]}
                    onPress={() => {
                      setSelectedCity(city);
                      setCitySearch(`${city.shortName}, ${city.country}`);
                      setCitySuggestions([]);
                      setCityError(false);
                    }}
                  >
                    <Ionicons name="location-outline" size={14} color={COLORS.gray} />
                    <Text style={styles.suggestionText}>{city.shortName}, {city.country}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {selectedCity && (
              <View style={styles.cityConfirmed}>
                <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
                <Text style={styles.cityConfirmedText}>{citySearch}</Text>
                <TouchableOpacity onPress={() => {
                  setSelectedCity(null);
                  setCitySearch('');
                  setCitySuggestions([]);
                }}>
                  <Ionicons name="close-circle" size={16} color="#aaa" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Local específico */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Local específico <Text style={styles.formLabelOptional}>(opcional)</Text></Text>
            {IS_WEB || !GOOGLE_PLACES_KEY ? (
              <TextInput
                style={styles.formInput}
                placeholder="Ex: Cristo Redentor, Pelourinho..."
                placeholderTextColor="#bbb"
                value={locationName}
                onChangeText={setLocationName}
                maxLength={80}
                editable={!uploading}
              />
            ) : (
              <GooglePlacesAutocomplete
                placeholder="Ex: Cristo Redentor, Pelourinho..."
                minLength={2}
                fetchDetails={false}
                onPress={(data) => setLocationName(data.description)}
                query={{ key: GOOGLE_PLACES_KEY, language: 'pt-BR', types: 'establishment|geocode' }}
                styles={{
                  container: { flex: 0, zIndex: 999 },
                  textInput: {
                    backgroundColor: '#f8f8f8',
                    borderRadius: 6,
                    paddingHorizontal: 10,
                    fontSize: 13,
                    height: 40,
                    borderWidth: 0.5,
                    borderColor: '#e0e0e0',
                    color: '#0D1326',
                  },
                  listView: {
                    backgroundColor: 'white',
                    borderRadius: 8,
                    borderWidth: 0.5,
                    borderColor: '#eee',
                    zIndex: 999,
                  },
                  row: { padding: 12 },
                  description: { fontSize: 13, color: '#333' },
                }}
                enablePoweredByContainer={false}
                keepResultsAfterBlur={false}
                listViewDisplayed="auto"
              />
            )}
          </View>

          {/* Avaliação com estrelas */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Avaliação <Text style={styles.formLabelOptional}>(opcional)</Text></Text>
            <View style={styles.starPicker}>
              {[1,2,3,4,5].map(star => (
                <TouchableOpacity key={star} onPress={() => setRating(star)} disabled={uploading}>
                  <Text style={[styles.starPickIcon, { color: star <= rating ? '#6C2BD9' : '#e0e0e0' }]}>★</Text>
                </TouchableOpacity>
              ))}
            </View>
            {rating > 0 && (
              <Text style={styles.ratingLabel}>
                {['', 'Ruim', 'Regular', 'Bom', 'Ótimo', 'Excelente'][rating]}
              </Text>
            )}
          </View>

          {/* Review — só aparece se tiver rating */}
          {rating > 0 && (
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>O que você achou?</Text>
              <TextInput
                style={[styles.formInput, { height: 80, textAlignVertical: 'top', paddingTop: 8 }]}
                placeholder="Conta um pouco sobre sua experiência..."
                placeholderTextColor="#bbb"
                value={review}
                onChangeText={setReview}
                multiline
                maxLength={200}
                editable={!uploading}
              />
              <Text style={styles.charCount}>{review.length}/200</Text>
            </View>
          )}

          {/* Toggle privacidade */}
          <View style={styles.privacyRow}>
            <View style={styles.privacyInfo}>
              <Ionicons
                name={isPublic ? 'earth-outline' : 'lock-closed-outline'}
                size={16}
                color={isPublic ? '#6C2BD9' : '#999'}
              />
              <View>
                <Text style={styles.privacyLabel}>
                  {isPublic ? 'Foto pública' : 'Foto privada'}
                </Text>
                <Text style={styles.privacySubLabel}>
                  {isPublic ? 'Aparece no Explorar' : 'Só você vê'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.toggleBtn, isPublic && styles.toggleBtnActive]}
              onPress={() => setIsPublic(!isPublic)}
            >
              <View style={[styles.toggleThumb, isPublic && styles.toggleThumbActive]} />
            </TouchableOpacity>
          </View>

          {/* Botão Enviar */}
          <TouchableOpacity
            style={[styles.uploadButton, (uploading || uploadSuccess) && styles.uploadButtonDisabled]}
            onPress={handleUpload}
            disabled={uploading || uploadSuccess}
            activeOpacity={0.8}
          >
            {uploading ? (
              <View style={styles.uploadingRow}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.uploadButtonText}>Enviando...</Text>
              </View>
            ) : uploadSuccess ? (
              <View style={styles.uploadingRow}>
                <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                <Text style={styles.uploadButtonText}>Enviado!</Text>
              </View>
            ) : (
              <View style={styles.uploadingRow}>
                <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />
                <Text style={styles.uploadButtonText}>Enviar Foto</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    borderRadius: SIZES.radius,
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: '#FFF5F2',
  },
  addButtonText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  uploadForm: {
    gap: 12,
  },
  previewContainer: {
    position: 'relative',
    borderRadius: SIZES.radius,
    overflow: 'hidden',
    backgroundColor: COLORS.lightGray,
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: SIZES.radius,
  },
  removeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
  },
  successOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  successText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.success,
  },
  captionInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: SIZES.body,
    color: COLORS.text,
  },
  cityContainer: {
    marginBottom: 4,
  },
  cityLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  cityInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: '#fff',
  },
  suggestionsContainer: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: '#fff',
    marginTop: 4,
    maxHeight: 200,
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.background,
    gap: 8,
  },
  suggestionText: {
    fontSize: 13,
    color: COLORS.text,
    flex: 1,
  },
  cityConfirmed: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f0fdf4', borderRadius: 8, padding: 10, borderWidth: 0.5, borderColor: '#86efac', marginTop: 6 },
  cityConfirmedText: { flex: 1, fontSize: 13, color: '#166534', fontWeight: '500' },
  required: {
    color: 'red',
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 0.5,
    borderTopColor: '#f0f0f0',
    marginTop: 8,
  },
  privacyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  privacyLabel: { fontSize: 13, fontWeight: '600', color: '#0D1326' },
  privacySubLabel: { fontSize: 11, color: '#999', marginTop: 1 },
  toggleBtn: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e0e0e0',
    padding: 2,
    justifyContent: 'center',
  },
  toggleBtnActive: { backgroundColor: '#6C2BD9' },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'white',
    alignSelf: 'flex-start',
  },
  toggleThumbActive: { alignSelf: 'flex-end' },
  uploadButton: {
    backgroundColor: COLORS.primary,
    borderRadius: SIZES.radius,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadButtonDisabled: {
    opacity: 0.65,
  },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  uploadButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  formGroup: { marginBottom: 12 },
  formLabel: { fontSize: 11, fontWeight: '600', color: '#666', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  formLabelOptional: { fontSize: 10, color: '#bbb', fontWeight: '400', textTransform: 'none' },
  formInput: { backgroundColor: '#f8f8f8', borderWidth: 0.5, borderColor: '#e0e0e0', borderRadius: 6, padding: 10, fontSize: 13, color: '#0D1326' },
  starPicker: { flexDirection: 'row', gap: 8 },
  starPickIcon: { fontSize: 28 },
  ratingLabel: { fontSize: 11, color: '#6C2BD9', marginTop: 3 },
  charCount: { fontSize: 10, color: '#bbb', textAlign: 'right', marginTop: 2 },
});
