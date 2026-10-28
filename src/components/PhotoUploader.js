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
import { getAlpha2, getAlpha3, toStorableCountryCode } from '../utils/countryUtils';
import { markCountryAsVisited } from '../services/supabase';
import { useLocale } from '../i18n/LocaleProvider';
import {
  searchCities as searchCitiesApi,
  formatCityLabel,
  CITY_SEARCH_DEBOUNCE_MS,
  MIN_CITY_QUERY_LENGTH,
} from '../utils/geoSearch';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';

const GOOGLE_PLACES_KEY = API_CONFIG.GOOGLE_MAPS_API_KEY;
const IS_WEB = process.env.EXPO_OS === 'web';

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export default function PhotoUploader({
  countryCode = null, countryName = null, countryNameEn = null, userId, onPhotoUploaded,
  prefilledCity = null, prefilledCountryName = null, prefilledCountryCode = null,
  prefilledCityLat = null, prefilledCityLng = null,
}) {
  const { t } = useLocale();
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
  const [cityLookupFailed, setCityLookupFailed] = useState(false);
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
    if (query.trim().length < MIN_CITY_QUERY_LENGTH) {
      citySearchAbortRef.current?.abort();
      setCitySuggestions([]);
      setCityLookupFailed(false);
      setLoadingCities(false);
      return;
    }

    citySearchAbortRef.current?.abort();
    const controller = new AbortController();
    citySearchAbortRef.current = controller;
    setLoadingCities(true);
    setCityLookupFailed(false);

    try {
      const cities = await searchCitiesApi(query, {
        countryAlpha2: effectiveCountryAlpha2.toUpperCase(),
        countryNameEn: effectiveCountryNameEn || effectiveCountryName,
        signal: controller.signal,
      });
      if (citySearchAbortRef.current === controller) setCitySuggestions(cities);
    } catch (error) {
      if (error?.name !== 'AbortError') {
        setCitySuggestions([]);
        // Falha de rede não é o mesmo que "cidade inexistente" — a mensagem muda.
        setCityLookupFailed(true);
      }
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
      Alert.alert(t('photoUploader.fileTooBigTitle'), t('photoUploader.fileTooBigMessage'));
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
        Alert.alert(t('photoUploader.permissionTitle'), t('photoUploader.permissionMessage'));
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
        Alert.alert(t('photoUploader.fileTooBigTitle'), t('photoUploader.fileTooBigMessage'));
        return;
      }

      setSelectedFile(asset);
      setUploadSuccess(false);
      setPreview(asset.uri);
    } catch {
      Alert.alert(t('photoUploader.libraryFailedTitle'), t('photoUploader.libraryFailedMessage'));
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
    setCityLookupFailed(false);
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
      Alert.alert(t('photoUploader.cityRequiredTitle'), t('photoUploader.cityRequiredMessage'));
      return;
    }

    setUploading(true);

    // `toStorableCountryCode` e não `getAlpha3`: getAlpha3 NUNCA falha — a última
    // linha dela é `return code.toUpperCase()`, então `getAlpha3('XX')` devolve
    // 'XX'. O fallback `|| selectedCity.countryCode` que existia aqui quase nunca
    // chegava a rodar; quem gravava alpha-2 na coluna era a própria getAlpha3,
    // devolvendo o código cru com cara de resposta boa. Era essa a origem da
    // mistura de alpha-2 e alpha-3 em country_photos.
    //
    // Agora as três origens (fluxo do mapa, GPS e seletor de cidade) passam pela
    // mesma porta, e o que não for reconhecido vira null em vez de virar linha
    // no banco.
    const uploadCountryCode =
      toStorableCountryCode(effectiveCountryCode) ||
      toStorableCountryCode(selectedCity.countryCode);
    const uploadCountryName = effectiveCountryName || selectedCity.country;

    if (!uploadCountryCode || !uploadCountryName) {
      setUploading(false);
      setCityError(true);
      Alert.alert(
        t('photoUploader.countryUnknownTitle'),
        t('photoUploader.countryUnknownMessage')
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
          t('photoUploader.uploadedPartialTitle'),
          t('photoUploader.uploadedPartialMessage')
        );
      }

      setUploadSuccess(true);
      if (onPhotoUploaded) onPhotoUploaded(result.data);
      setTimeout(() => {
        handleRemovePreview();
      }, 1500);
    } else {
      Alert.alert(t('photoUploader.uploadFailedTitle'), result.error || t('photoUploader.uploadFailedMessage'));
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
          <Text style={styles.addButtonText}>{t('photoUploader.addButton')}</Text>
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
                <Text style={styles.successText}>{t('photoUploader.submitted')}</Text>
              </View>
            )}
          </View>

          {/* Caption */}
          <TextInput
            style={styles.captionInput}
            placeholder={t('photoUploader.captionPlaceholder')}
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
              placeholder={t('photoUploader.cityPlaceholder')}
              placeholderTextColor={COLORS.textSecondary}
              value={citySearch}
              onChangeText={(text) => {
                setCitySearch(text);
                setSelectedCity(null);
                setCityError(false);
                if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                searchTimerRef.current = setTimeout(() => {
                  searchCities(text);
                }, CITY_SEARCH_DEBOUNCE_MS);
              }}
              editable={!uploading}
            />
            {loadingCities && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <ActivityIndicator size="small" color="#6C2BD9" />
                <Text style={{ fontSize: 11, color: '#999' }}>{t('photoUploader.searchingCities')}</Text>
              </View>
            )}
            {!loadingCities && citySuggestions.length === 0 &&
              citySearch.trim().length >= MIN_CITY_QUERY_LENGTH && !selectedCity && (
              <Text style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                {cityLookupFailed
                  ? t('photoUploader.searchFailed')
                  : t('photoUploader.noCityFound')}
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
                      setCitySearch(formatCityLabel(city));
                      setCitySuggestions([]);
                      setCityError(false);
                    }}
                  >
                    <Ionicons name="location-outline" size={14} color={COLORS.gray} />
                    <Text style={styles.suggestionText}>{formatCityLabel(city)}</Text>
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
            <Text style={styles.formLabel}>{t('photoUploader.specificPlaceLabel')} <Text style={styles.formLabelOptional}>{t('photoUploader.optional')}</Text></Text>
            {IS_WEB || !GOOGLE_PLACES_KEY ? (
              <TextInput
                style={styles.formInput}
                placeholder={t('photoUploader.placePlaceholder')}
                placeholderTextColor="#bbb"
                value={locationName}
                onChangeText={setLocationName}
                maxLength={80}
                editable={!uploading}
              />
            ) : (
              <GooglePlacesAutocomplete
                placeholder={t('photoUploader.placePlaceholder')}
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
            <Text style={styles.formLabel}>{t('photoUploader.ratingLabel')} <Text style={styles.formLabelOptional}>{t('photoUploader.optional')}</Text></Text>
            <View style={styles.starPicker}>
              {[1,2,3,4,5].map(star => (
                <TouchableOpacity key={star} onPress={() => setRating(star)} disabled={uploading}>
                  <Ionicons name="star" size={28} color={star <= rating ? '#6C2BD9' : '#e0e0e0'} style={styles.starPickIcon} />
                </TouchableOpacity>
              ))}
            </View>
            {rating > 0 && (
              <Text style={styles.ratingLabel}>
                {rating > 0 ? t('photoUploader.ratingLevels.' + rating) : ''}
              </Text>
            )}
          </View>

          {/* Review — só aparece se tiver rating */}
          {rating > 0 && (
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>{t('photoUploader.ratingQuestion')}</Text>
              <TextInput
                style={[styles.formInput, { height: 80, textAlignVertical: 'top', paddingTop: 8 }]}
                placeholder={t('photoUploader.reviewPlaceholder')}
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
                  {isPublic ? t('photoUploader.public') : t('photoUploader.private')}
                </Text>
                <Text style={styles.privacySubLabel}>
                  {isPublic ? t('photoUploader.publicHint') : t('photoUploader.privateHint')}
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
                <Text style={styles.uploadButtonText}>{t('photoUploader.submitting')}</Text>
              </View>
            ) : uploadSuccess ? (
              <View style={styles.uploadingRow}>
                <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                <Text style={styles.uploadButtonText}>{t('photoUploader.submitted')}</Text>
              </View>
            ) : (
              <View style={styles.uploadingRow}>
                <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />
                <Text style={styles.uploadButtonText}>{t('photoUploader.submit')}</Text>
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
