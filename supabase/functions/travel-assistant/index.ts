import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const jsonResponse = (body: unknown, status = 200) => new Response(
  JSON.stringify(body),
  { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
)

const cleanText = (value: unknown, max = 160) => (
  typeof value === 'string' ? value.trim().slice(0, max) : ''
)

const cleanList = (value: unknown, maxItems = 12) => (
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
      .map(item => item.trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, maxItems)
    : []
)

const fetchJson = async (url: string, init: RequestInit = {}) => {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(7000) })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)

// ─── Geografia do roteiro ────────────────────────────────────────────────────
//
// Cada atividade precisa sair daqui com latitude/longitude válidas, categoria dentro do
// enum e ordem sequencial no dia. O globo 3D vai ler exatamente esses campos, então o
// dado nasce completo no servidor e vale para generate_plan, regenerate_activity e
// adjust_plan — o client não precisa reconstruir nada.

const PLACE_CATEGORIES = [
  'restaurante', 'atracao', 'compras', 'hotel',
  'transporte', 'natureza', 'vida_noturna', 'outro',
] as const

// A IA recebe as categorias de realPlaces ('passeio'/'restaurante'/'hotel'); mapeamos
// para o enum fechado para que o ícone do globo nunca receba um valor inesperado.
const CATEGORY_ALIASES: Record<string, string> = {
  passeio: 'atracao', atracao: 'atracao', atração: 'atracao', turismo: 'atracao',
  museu: 'atracao', restaurante: 'restaurante', cafe: 'restaurante', café: 'restaurante',
  gastronomia: 'restaurante', bar: 'vida_noturna', balada: 'vida_noturna',
  vida_noturna: 'vida_noturna', hotel: 'hotel', hospedagem: 'hotel',
  compras: 'compras', shopping: 'compras', mercado: 'compras',
  transporte: 'transporte', natureza: 'natureza', praia: 'natureza', parque: 'natureza',
}

export const normalizeCategory = (value: unknown, fallback = 'outro') => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if ((PLACE_CATEGORIES as readonly string[]).includes(raw)) return raw
  return CATEGORY_ALIASES[raw] || fallback
}

const isValidLatitude = (value: unknown): value is number =>
  Number.isFinite(value) && Math.abs(value as number) <= 90

const isValidLongitude = (value: unknown): value is number =>
  Number.isFinite(value) && Math.abs(value as number) <= 180

// A coordenada (0, 0) é o "Null Island" — quase sempre um campo não preenchido, não um
// lugar real. Descartar aqui evita um pino no meio do Atlântico.
export const isValidCoordinate = (lat: unknown, lng: unknown) =>
  isValidLatitude(lat) && isValidLongitude(lng) && !(lat === 0 && lng === 0)

const EARTH_RADIUS_KM = 6371

const haversineKm = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const toRad = (value: number) => (value * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

// Raio de sanidade em torno do destino geocodificado: pega a coordenada que a IA
// "alucinou" em outro continente. Só se aplica a viagens de destino único — um roteiro
// multi-país legitimamente espalha pontos por milhares de quilômetros.
const SANITY_RADIUS_KM = 300

const DIACRITICS_REGEX = new RegExp('[\\u0300-\\u036f]', 'g')

const normalizePlaceName = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(DIACRITICS_REGEX, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

const PHOTON_ENDPOINT = 'https://photon.komoot.io/api/'
// Um único batch paralelo, limitado: a função já opera dentro do AbortSignal de 60s do
// client, então o fallback de rede não pode crescer com o tamanho do roteiro.
const MAX_GEOCODE_LOOKUPS = 12
const GEOCODE_TIMEOUT_MS = 5000

const geocodeQuery = async (query: string, bias: { lat: number; lng: number } | null) => {
  if (!query) return null
  const url = new URL(PHOTON_ENDPOINT)
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '1')
  url.searchParams.set('lang', 'en')
  if (bias) {
    url.searchParams.set('lat', String(bias.lat))
    url.searchParams.set('lon', String(bias.lng))
  }
  try {
    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS) })
    if (!response.ok) return null
    const data = await response.json()
    const coords = data?.features?.[0]?.geometry?.coordinates
    const [lng, lat] = Array.isArray(coords) ? coords : []
    return isValidCoordinate(lat, lng) ? { latitude: lat, longitude: lng } : null
  } catch {
    return null
  }
}

/**
 * Garante coordenada, categoria e ordem em toda atividade do roteiro.
 *
 * Nível 0: a coordenada que a própria IA devolveu, se passar na validação.
 * Nível 1: casamento por nome com os realPlaces já buscados (custo zero, sem rede).
 * Nível 2: geocoding do mapQuery via Photon, em um único batch paralelo limitado.
 *
 * Devolve o plano mutado e um resumo para diagnóstico.
 */
// Exportado apenas para os testes: o entrypoint continua sendo o serve() abaixo.
export const normalizePlanGeography = async (
  plan: any,
  liveContext: any,
  { allowRadiusCheck }: { allowRadiusCheck: boolean },
) => {
  const origin = liveContext?.place
  const bias = isValidCoordinate(origin?.latitude, origin?.longitude)
    ? { lat: origin.latitude, lng: origin.longitude }
    : null

  const placesByName = new Map<string, any>()
  for (const item of liveContext?.realPlaces || []) {
    const key = normalizePlaceName(item?.name)
    if (key && isValidCoordinate(item?.latitude, item?.longitude) && !placesByName.has(key)) {
      placesByName.set(key, item)
    }
  }

  const matchRealPlace = (activity: any) => {
    for (const field of [activity?.title, activity?.location]) {
      const key = normalizePlaceName(field)
      if (!key) continue
      const exact = placesByName.get(key)
      if (exact) return exact
      // Casamento parcial: a IA costuma escrever "Jantar no Café X" para o lugar "Café X".
      for (const [placeKey, place] of placesByName) {
        if (placeKey.length >= 5 && key.includes(placeKey)) return place
      }
    }
    return null
  }

  const pending: any[] = []
  const summary = { total: 0, fromModel: 0, fromRealPlaces: 0, fromGeocoding: 0, missing: 0 }

  for (const day of plan?.days || []) {
    const activities = Array.isArray(day?.activities) ? day.activities : []
    activities.forEach((activity: any, index: number) => {
      summary.total += 1
      // A ordem é sempre reescrita pela posição real no dia: é isso que o globo vai
      // usar para desenhar a sequência de visita, e a IA erra a numeração com frequência.
      activity.order = index + 1
      activity.day = Number(day?.day) || 0

      const latitude = Number(activity?.latitude)
      const longitude = Number(activity?.longitude)
      let hasCoordinate = isValidCoordinate(latitude, longitude)

      if (hasCoordinate && allowRadiusCheck && bias
        && haversineKm(bias.lat, bias.lng, latitude, longitude) > SANITY_RADIUS_KM) {
        hasCoordinate = false
      }

      const matched = matchRealPlace(activity)
      activity.category = normalizeCategory(activity?.category, normalizeCategory(matched?.category))

      if (hasCoordinate) {
        activity.latitude = latitude
        activity.longitude = longitude
        activity.coordinateSource = activity.coordinateSource || 'ai'
        summary.fromModel += 1
        return
      }

      if (matched) {
        activity.latitude = matched.latitude
        activity.longitude = matched.longitude
        activity.coordinateSource = matched.provider || 'realPlaces'
        summary.fromRealPlaces += 1
        return
      }

      delete activity.latitude
      delete activity.longitude
      pending.push(activity)
    })
  }

  const lookups = pending.slice(0, MAX_GEOCODE_LOOKUPS)
  const resolved = await Promise.all(lookups.map((activity) => geocodeQuery(
    cleanText(activity?.mapQuery, 200) || cleanText(activity?.location, 200) || cleanText(activity?.title, 200),
    bias,
  )))

  lookups.forEach((activity, index) => {
    const coordinate = resolved[index]
    if (!coordinate) return
    activity.latitude = coordinate.latitude
    activity.longitude = coordinate.longitude
    activity.coordinateSource = 'Photon'
    summary.fromGeocoding += 1
  })

  // Último recurso: sem nenhuma coordenada própria, o ponto herda a do destino para não
  // sumir do globo. Fica marcado para que a plotagem possa exibi-lo como aproximado.
  for (const activity of pending) {
    if (isValidCoordinate(activity?.latitude, activity?.longitude)) continue
    summary.missing += 1
    if (bias) {
      activity.latitude = bias.lat
      activity.longitude = bias.lng
      activity.coordinateSource = 'destino (aproximado)'
      activity.approximateCoordinate = true
    }
  }

  return summary
}

const addDays = (date: Date, days: number) => {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}

const getLiveContext = async (
  destination: string,
  currency: string,
  startDate: string,
  endDate: string,
  interests: string[],
) => {
  const geocodingUrl = new URL('https://geocoding-api.open-meteo.com/v1/search')
  geocodingUrl.searchParams.set('name', destination)
  geocodingUrl.searchParams.set('count', '1')
  geocodingUrl.searchParams.set('language', 'pt')
  geocodingUrl.searchParams.set('format', 'json')

  const geocoding = await fetchJson(geocodingUrl.toString())
  const place = geocoding?.results?.[0]
  const countryUrl = place?.country_code
    ? `https://restcountries.com/v3.1/alpha/${encodeURIComponent(place.country_code)}?fields=currencies`
    : ''
  const countryData = countryUrl ? await fetchJson(countryUrl) : null
  const country = Array.isArray(countryData) ? countryData[0] : countryData
  const localCurrency = Object.keys(country?.currencies || {})[0] || currency
  const exchangeUrl = `https://api.frankfurter.dev/v2/rate/${encodeURIComponent(currency)}/${encodeURIComponent(localCurrency)}`

  let weather = null
  let weatherSourceUrl = ''
  let weatherCoverage = null
  if (place?.latitude && place?.longitude) {
    const today = new Date().toISOString().slice(0, 10)
    const forecastLimit = addDays(new Date(), 15)
    const requestedStart = isIsoDate(startDate) ? startDate : today
    const requestedEnd = isIsoDate(endDate) ? endDate : addDays(new Date(), 6)
    const forecastStart = requestedStart < today ? today : requestedStart
    const forecastEnd = requestedEnd > forecastLimit ? forecastLimit : requestedEnd
    if (forecastStart <= forecastEnd && requestedEnd >= today && requestedStart <= forecastLimit) {
      const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast')
      weatherUrl.searchParams.set('latitude', String(place.latitude))
      weatherUrl.searchParams.set('longitude', String(place.longitude))
      weatherUrl.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_probability_max')
      weatherUrl.searchParams.set('timezone', 'auto')
      weatherUrl.searchParams.set('start_date', forecastStart)
      weatherUrl.searchParams.set('end_date', forecastEnd)
      weatherSourceUrl = weatherUrl.toString()
      weather = await fetchJson(weatherSourceUrl)
      weatherCoverage = weather ? { startDate: forecastStart, endDate: forecastEnd, type: 'forecast' } : null
    }
  }

  const googlePlacesKey = Deno.env.get('GOOGLE_PLACES_API_KEY')
  let realPlaces: any[] = []
  let placesSourceUrl = ''
  let placesProvider = ''
  if (googlePlacesKey && place?.latitude && place?.longitude) {
    placesSourceUrl = 'https://places.googleapis.com/v1/places:searchText'
    const searchPlaces = async (textQuery: string, category: string) => {
      const placesData = await fetchJson(placesSourceUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': googlePlacesKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.regularOpeningHours,places.googleMapsUri,places.websiteUri',
        },
        body: JSON.stringify({
          textQuery,
          languageCode: 'pt-BR',
          maxResultCount: 6,
          locationBias: {
            circle: {
              center: { latitude: place.latitude, longitude: place.longitude },
              radius: 18000,
            },
          },
        }),
      })
      return (placesData?.places || []).map((item: any) => ({ ...item, category }))
    }
    const placeGroups = await Promise.all([
      searchPlaces(`principais atrações ${interests.join(' ')} em ${destination}`, 'passeio'),
      searchPlaces(`restaurantes bem avaliados em ${destination}`, 'restaurante'),
      searchPlaces(`hotéis bem avaliados em ${destination}`, 'hotel'),
    ])
    realPlaces = placeGroups.flat().map((item: any) => ({
      placeId: item.id,
      name: item.displayName?.text,
      address: item.formattedAddress,
      category: item.category,
      latitude: item.location?.latitude,
      longitude: item.location?.longitude,
      rating: item.rating || null,
      reviewCount: item.userRatingCount || null,
      openingHours: item.regularOpeningHours?.weekdayDescriptions || [],
      mapsUrl: item.googleMapsUri || '',
      website: item.websiteUri || '',
      provider: 'Google Places',
    })).filter((item: any) => item.name)
    placesProvider = realPlaces.length ? 'Google Places' : ''
  }

  if (!realPlaces.length && place?.latitude && place?.longitude) {
    const overpassQuery = `[out:json][timeout:12];(nwr(around:15000,${place.latitude},${place.longitude})[tourism~"attraction|museum|gallery|viewpoint|zoo|theme_park|hotel"][name];nwr(around:15000,${place.latitude},${place.longitude})[amenity~"restaurant|cafe"][name];);out center tags 30;`
    placesSourceUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`
    const osmData = await fetchJson(placesSourceUrl, { headers: { 'Accept-Language': 'pt-BR' } })
    realPlaces = (osmData?.elements || []).slice(0, 20).map((item: any) => ({
      name: item.tags?.name,
      category: item.tags?.amenity === 'restaurant' || item.tags?.amenity === 'cafe'
        ? 'restaurante'
        : item.tags?.tourism === 'hotel' ? 'hotel' : 'passeio',
      address: [item.tags?.['addr:street'], item.tags?.['addr:housenumber']].filter(Boolean).join(', '),
      latitude: item.lat || item.center?.lat,
      longitude: item.lon || item.center?.lon,
      rating: null,
      reviewCount: null,
      openingHours: item.tags?.opening_hours ? [item.tags.opening_hours] : [],
      mapsUrl: item.lat || item.center?.lat
        ? `https://www.google.com/maps/search/?api=1&query=${item.lat || item.center.lat},${item.lon || item.center.lon}`
        : '',
      website: item.tags?.website || '',
      provider: 'OpenStreetMap',
    })).filter((item: any) => item.name && item.latitude && item.longitude)
    placesProvider = realPlaces.length ? 'OpenStreetMap' : ''
  }

  const exchange = currency === localCurrency
    ? { base: currency, quote: localCurrency, rate: 1, date: new Date().toISOString().slice(0, 10) }
    : await fetchJson(exchangeUrl)

  return {
    place: place ? {
      name: place.name,
      country: place.country,
      countryCode: place.country_code,
      latitude: place.latitude,
      longitude: place.longitude,
      timezone: place.timezone,
    } : null,
    weather: weather ? { daily: weather.daily, coverage: weatherCoverage } : null,
    exchange: exchange ? {
      base: exchange.base,
      date: exchange.date,
      rates: { [localCurrency]: Number(exchange.rate) },
      requestedCurrency: currency,
      localCurrency,
    } : null,
    realPlaces,
    placesProvider,
    sources: [
      place ? { label: 'Localização — Open-Meteo', url: geocodingUrl.toString() } : null,
      weather ? { label: 'Previsão do tempo — Open-Meteo', url: weatherSourceUrl } : null,
      exchange ? { label: `Câmbio ${currency}/${localCurrency} — Frankfurter`, url: exchangeUrl } : null,
      countryData ? { label: 'Moeda local — Rest Countries', url: countryUrl } : null,
      realPlaces.length ? { label: `Locais verificados — ${placesProvider}`, url: placesSourceUrl } : null,
    ].filter(Boolean),
    retrievedAt: new Date().toISOString(),
  }
}

const planSchema = {
  type: 'OBJECT',
  required: ['title', 'summary', 'destinationCountry', 'localCurrency', 'budgetStatus', 'weatherNote', 'days', 'budget', 'checklist', 'safetyTips', 'practicalTips', 'sources'],
  properties: {
    title: { type: 'STRING' },
    summary: { type: 'STRING' },
    destinationCountry: { type: 'STRING' },
    localCurrency: { type: 'STRING' },
    budgetStatus: { type: 'STRING' },
    weatherNote: { type: 'STRING' },
    days: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        required: ['day', 'date', 'theme', 'activities'],
        properties: {
          day: { type: 'INTEGER' },
          date: { type: 'STRING' },
          theme: { type: 'STRING' },
            activities: {
              type: 'ARRAY',
              minItems: 3,
              maxItems: 3,
              items: {
              type: 'OBJECT',
              required: ['period', 'title', 'description', 'location', 'duration', 'estimatedCost', 'mapQuery', 'indoor', 'purchaseNote', 'latitude', 'longitude', 'category', 'order'],
              properties: {
                period: { type: 'STRING' },
                title: { type: 'STRING' },
                description: { type: 'STRING' },
                location: { type: 'STRING' },
                duration: { type: 'STRING' },
                estimatedCost: { type: 'NUMBER' },
                mapQuery: { type: 'STRING' },
                indoor: { type: 'BOOLEAN' },
                latitude: { type: 'NUMBER' },
                longitude: { type: 'NUMBER' },
                category: { type: 'STRING', enum: [...PLACE_CATEGORIES] },
                order: { type: 'INTEGER' },
                rating: { type: 'NUMBER' },
                reviewCount: { type: 'INTEGER' },
                openingHours: { type: 'ARRAY', items: { type: 'STRING' } },
                mapsUrl: { type: 'STRING' },
                officialUrl: { type: 'STRING' },
                placeId: { type: 'STRING' },
                verificationSource: { type: 'STRING' },
                purchaseNote: { type: 'STRING' },
              },
            },
          },
        },
      },
    },
    budget: {
      type: 'OBJECT',
      required: ['total', 'currency', 'items', 'shoppingIncluded', 'scopeNote'],
      properties: {
        total: { type: 'NUMBER' },
        currency: { type: 'STRING' },
        shoppingIncluded: { type: 'BOOLEAN' },
        scopeNote: { type: 'STRING' },
        items: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            required: ['category', 'amount', 'note'],
            properties: {
              category: { type: 'STRING' },
              amount: { type: 'NUMBER' },
              note: { type: 'STRING' },
            },
          },
        },
      },
    },
    checklist: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        required: ['category', 'item', 'done'],
        properties: {
          category: { type: 'STRING' },
          item: { type: 'STRING' },
          done: { type: 'BOOLEAN' },
        },
      },
    },
    safetyTips: { type: 'ARRAY', items: { type: 'STRING' } },
    practicalTips: { type: 'ARRAY', items: { type: 'STRING' } },
    sources: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        required: ['label', 'url', 'updatedAt'],
        properties: {
          label: { type: 'STRING' },
          url: { type: 'STRING' },
          updatedAt: { type: 'STRING' },
        },
      },
    },
  },
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Método não permitido' }, 405)

  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization?.startsWith('Bearer ')) {
      return jsonResponse({ success: false, error: 'Não autenticado' }, 401)
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) return jsonResponse({ success: false, error: 'Serviço de IA não configurado' }, 500)

    const body = await req.json()
    const supportedActions = ['generate_plan', 'regenerate_activity', 'adjust_plan']
    const action = supportedActions.includes(body?.action) ? body.action : 'generate_plan'
    const request = body?.planRequest || {}
    const destinations = Array.isArray(request.destinations)
      ? request.destinations.slice(0, 12).map((item: any) => ({
        name: cleanText(typeof item === 'string' ? item : item?.name, 100),
        nameEn: cleanText(typeof item === 'string' ? '' : item?.nameEn, 100),
        code: cleanText(typeof item === 'string' ? '' : item?.code, 3).toUpperCase(),
      })).filter((item: { name: string }) => item.name)
      : []
    const destinationBudgets = Array.isArray(request.destinationBudgets)
      ? request.destinationBudgets.slice(0, 12).map((item: any) => ({
        countryCode: cleanText(item?.countryCode, 3).toUpperCase(),
        countryName: cleanText(item?.countryName, 100),
        currency: cleanText(item?.currency, 3).toUpperCase(),
        amount: Math.max(0, Number(item?.localAmount) || Number(String(item?.amount || '').replace(/\D/g, '')) || 0),
        amountInBRL: Math.max(0, Number(item?.amountInBRL) || 0),
        rateDate: cleanText(item?.rateDate, 10),
      })).filter((item: { countryName: string }) => item.countryName)
      : []
    const destination = cleanText(request.destination, 500)
      || destinations.map((item: { name: string }) => item.name).join(', ')
    const primaryDestination = destinations[0]?.nameEn || destinations[0]?.name || destination
    const origin = cleanText(request.origin, 120)
    const currency = cleanText(request.currency, 3).toUpperCase() || 'BRL'
    const travelers = Math.max(1, Math.min(30, Number(request.travelers) || 1))
    const duration = Math.max(1, Math.floor(Number(request.duration) || 3))
    const budget = Math.max(0, Number(request.budget) || 0)

    if (!destination) return jsonResponse({ success: false, error: 'Informe um destino válido' }, 400)
    const today = new Date().toISOString().slice(0, 10)
    if (isIsoDate(request.startDate) && request.startDate < today) {
      return jsonResponse({ success: false, error: 'A data de ida não pode estar no passado' }, 400)
    }

    const safeRequest = {
      destination,
      destinations,
      destinationBudgets,
      origin,
      startDate: cleanText(request.startDate, 10),
      endDate: cleanText(request.endDate, 10),
      duration,
      travelers,
      travelerType: cleanText(request.travelerType, 40),
      budget,
      currency,
      budgetLevel: cleanText(request.budgetLevel, 20) || 'balanced',
      budgetCurrency: cleanText(request.budgetCurrency, 3).toUpperCase() || currency,
      displayCurrency: cleanText(request.displayCurrency, 3).toUpperCase(),
      preferredPlaces: cleanText(request.preferredPlaces, 500),
      pace: cleanText(request.pace, 20),
      interests: cleanList(request.interests),
      foodPreferences: cleanText(request.foodPreferences, 240),
      accessibility: cleanText(request.accessibility, 240),
      notes: cleanText(request.notes, 400),
    }

    const context = body?.userContext || {}
    const safeUserContext = {
      visitedCountries: cleanList(context.visitedCountries, 195),
      wishlistCountries: cleanList(context.wishlistCountries, 195),
      level: cleanText(context.level, 40) || 'Iniciante',
    }

    const liveContext = await getLiveContext(
      primaryDestination,
      currency,
      safeRequest.startDate,
      safeRequest.endDate,
      safeRequest.interests,
    )
    const existingPlan = JSON.stringify(body?.existingPlan || {}).slice(0, 30000)
    const operationInstruction = action === 'regenerate_activity'
      ? `Ajuste somente a atividade indicada e preserve todo o restante. Bloco: ${JSON.stringify(body?.block || {}).slice(0, 500)}. Roteiro atual: ${existingPlan}`
      : action === 'adjust_plan'
        ? `Atualize o roteiro atual conforme este pedido do usuário: "${cleanText(body?.adjustment, 600)}". Preserve tudo o que não precisar mudar. Roteiro atual: ${existingPlan}`
        : 'Crie um roteiro novo e coerente.'

    const configuredModel = Deno.env.get('GEMINI_MODEL') || 'gemini-3.5-flash-lite'
    const models = [...new Set([configuredModel, 'gemini-3.5-flash-lite', 'gemini-3.6-flash'])]
    const strictDaySchemaLimit = 3
    const chunkSpecs = [{ startDay: 1, days: duration }]

    const generateChunk = async (spec: { startDay: number; days: number }) => {
      const ratio = spec.days / duration
      const chunkStartDate = isIsoDate(safeRequest.startDate)
        ? addDays(new Date(`${safeRequest.startDate}T00:00:00Z`), spec.startDay - 1)
        : ''
      const chunkEndDate = chunkStartDate
        ? addDays(new Date(`${chunkStartDate}T00:00:00Z`), spec.days - 1)
        : ''
      const chunkRequest = {
        ...safeRequest,
        startDate: chunkStartDate || safeRequest.startDate,
        endDate: chunkEndDate || safeRequest.endDate,
        duration: spec.days,
        budget: budget > 0 ? Math.round(budget * ratio * 100) / 100 : 0,
        destinationBudgets: safeRequest.destinationBudgets.map((item: any) => ({
          ...item,
          amount: Math.round(item.amount * ratio * 100) / 100,
          amountInBRL: Math.round(item.amountInBRL * ratio * 100) / 100,
        })),
      }
      const chunkEndDay = spec.startDay + spec.days - 1
      const includePlanDetails = spec.startDay === 1
      const prompt = `Você é o planejador de viagens do Journi. Responda em português brasileiro e apenas no JSON solicitado.

Pedido deste bloco: ${JSON.stringify(chunkRequest)}
Contexto do roteiro completo: ${duration} dias; este bloco cobre os dias ${spec.startDay} a ${chunkEndDay}.
Perfil do viajante: ${JSON.stringify(safeUserContext)}
Dados externos disponíveis: ${JSON.stringify(liveContext)}
Operação: ${operationInstruction}

Regras:
- Crie exatamente ${spec.days} dias neste bloco, numerados de ${spec.startDay} a ${chunkEndDay}, respeitando datas, ritmo, interesses, alimentação, acessibilidade e todos os países selecionados em destinations.
- Crie exatamente 3 atividades objetivas por dia (manhã, tarde e noite). Mantenha title, description e purchaseNote concisos.
- O padrão de orçamento é ${safeRequest.budgetLevel}: economy significa econômico/barato, balanced significa médio e premium significa caro/confortável.
- Distribua manhã, tarde e noite sem deslocamentos impossíveis; agrupe locais próximos.
- Todos os custos devem ser numéricos em ${currency}, para ${travelers} viajante(s), e o total deste bloco deve respeitar o orçamento proporcional quando ele for maior que zero.
- budget.items deve detalhar Passagens, Hospedagem, Alimentação, Transporte local, Passeios e ingressos, Compras e Reserva. Os itens devem somar exatamente budget.total.
- Quando destinationBudgets existir, respeite o teto proporcional de cada país e use amountInBRL como referência consolidada.
- Não presuma passagens ou hospedagem: quando não houver dados suficientes, use valor 0 na categoria e explique em note que não está incluída. Não conte custos duas vezes.
- Inclua Compras somente quando couber no orçamento. shoppingIncluded só pode ser true quando a categoria Compras tiver valor maior que 0.
- Atividades realmente gratuitas devem ter estimatedCost igual a 0.
- mapQuery deve ser uma busca precisa no formato "local, cidade, país".
- Toda atividade é obrigada a trazer latitude e longitude reais do lugar, em graus decimais (ex.: -22.9519, -43.2105). Use as coordenadas verdadeiras do ponto citado no title/location, nunca o centro genérico da cidade e nunca 0. Se não souber a coordenada exata do estabelecimento, use a do endereço/quarteirão dele.
- category deve ser exatamente um destes valores: ${PLACE_CATEGORIES.join(', ')}. Refeições são restaurante, bares e baladas são vida_noturna, hospedagem é hotel, museus e pontos turísticos são atracao, parques e trilhas são natureza, lojas e feiras são compras, deslocamentos são transporte. Use outro apenas quando nenhum dos anteriores se aplicar.
- order é a sequência de visita dentro do dia, começando em 1 e seguindo a ordem cronológica (manhã, tarde, noite).

- Priorize realPlaces e copie seus dados verificados sem alterá-los. Combine restaurante, hotel e passeio com a categoria correta.

- officialUrl só pode receber uma URL presente nos dados externos. Nunca invente links de ingresso, afiliados ou sites de compra.
- Sem officialUrl, oriente em purchaseNote a consultar ingressos e canais oficiais na ficha do local no Maps.
- Não invente avaliações, horários, preços oficiais ou regras legais. Indique estimativas claramente.
- Use dados meteorológicos apenas quando existirem e inclua as fontes reais consultadas.
- Checklist deve incluir documentos, saúde, dinheiro, conectividade e bagagem.
- Inclua alertas de segurança objetivos, sem alarmismo.
- ${includePlanDetails ? 'Inclua todos os campos gerais do roteiro.' : 'Este é um bloco complementar: retorne somente o campo days.'}`
      const chunkDaysSchema = spec.days <= strictDaySchemaLimit
        ? { ...planSchema.properties.days, minItems: spec.days, maxItems: spec.days }
        : planSchema.properties.days
      const responseSchema = includePlanDetails
        ? {
          ...planSchema,
          properties: { ...planSchema.properties, days: chunkDaysSchema },
        }
        : {
          type: 'OBJECT',
          required: ['days'],
          properties: { days: chunkDaysSchema },
        }
      const maxOutputTokens = includePlanDetails
        ? Math.min(65535, Math.max(8192, spec.days * 1000))
        : 4096
      let lastStatus = 502
      let lastProviderStatus = ''
      let failureCode = 'AI_PROVIDER_ERROR'

      for (const model of models) {
        try {
          const geminiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
              signal: AbortSignal.timeout(80000),
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                  maxOutputTokens,
                  responseMimeType: 'application/json',
                  responseSchema,
                },
              }),
            },
          )
          lastStatus = geminiResponse.status
          const geminiData = await geminiResponse.json().catch(() => null)
          lastProviderStatus = geminiData?.error?.status || ''
          if (!geminiResponse.ok || !geminiData) {
            failureCode = lastProviderStatus || `HTTP_${geminiResponse.status}`
            console.error('travel-assistant provider attempt failed', {
              model, chunkStartDay: spec.startDay, status: lastStatus,
              providerStatus: lastProviderStatus,
              providerMessage: cleanText(geminiData?.error?.message, 240),
            })
            continue
          }
          const responseText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text
          if (!responseText) {
            failureCode = 'AI_EMPTY_RESPONSE'
            continue
          }
          try {
            const candidatePlan = JSON.parse(responseText)
            if (Array.isArray(candidatePlan.days) && candidatePlan.days.length === spec.days) {
              return { success: true, plan: candidatePlan, spec }
            }
            failureCode = 'AI_INCOMPLETE_PLAN'
          } catch {
            failureCode = 'AI_INVALID_JSON'
          }
        } catch (error) {
          failureCode = error instanceof DOMException && error.name === 'TimeoutError'
            ? 'AI_PROVIDER_TIMEOUT'
            : 'AI_PROVIDER_NETWORK_ERROR'
          console.error('travel-assistant provider request error', {
            model, chunkStartDay: spec.startDay, code: failureCode,
            message: cleanText(error instanceof Error ? error.message : '', 240),
          })
        }
      }
      return { success: false, failureCode, status: lastStatus, providerStatus: lastProviderStatus, spec }
    }

    const chunkResults: any[] = []
    const chunkConcurrency = 4
    for (let index = 0; index < chunkSpecs.length; index += chunkConcurrency) {
      const batch = await Promise.all(
        chunkSpecs.slice(index, index + chunkConcurrency).map(generateChunk),
      )
      chunkResults.push(...batch)
      if (batch.some(result => !result.success)) break
    }
    const failedChunk = chunkResults.find(result => !result.success)
    if (failedChunk) {
      const error = failedChunk.status === 429
        ? 'O limite temporário da IA foi atingido. Aguarde um minuto e tente novamente.'
        : failedChunk.failureCode === 'AI_INCOMPLETE_PLAN'
          ? 'A IA não concluiu todos os dias do roteiro. Tente novamente em instantes.'
          : 'O planejador está temporariamente indisponível. Tente novamente em instantes.'
      console.error('travel-assistant generation failed', failedChunk)
      return jsonResponse(
        { success: false, error, code: failedChunk.failureCode },
        failedChunk.status === 429 ? 429 : 503,
      )
    }

    const chunkPlans = chunkResults.map(result => result.plan)
    const plan = chunkPlans[0]
    if (chunkPlans.length > 1) {
      plan.title = `${duration} dias em ${destination}`
      plan.summary = `Roteiro completo de ${duration} dias, organizado em etapas para manter cada atividade detalhada e coerente.`
      plan.days = chunkResults.flatMap(result => result.plan.days.map((day: any, index: number) => ({
        ...day,
        day: result.spec.startDay + index,
        date: isIsoDate(safeRequest.startDate)
          ? addDays(new Date(`${safeRequest.startDate}T00:00:00Z`), result.spec.startDay + index - 1)
          : day.date,
      })))
      const budgetItems = new Map<string, { category: string; amount: number; note: string }>()
      for (const chunkPlan of chunkPlans) {
        for (const item of chunkPlan.budget?.items || []) {
          const current = budgetItems.get(item.category) || { category: item.category, amount: 0, note: item.note || '' }
          current.amount += Number(item.amount) || 0
          if (!current.note && item.note) current.note = item.note
          budgetItems.set(item.category, current)
        }
      }
      const items = [...budgetItems.values()].map(item => ({ ...item, amount: Math.round(item.amount * 100) / 100 }))
      const budgetScale = duration / chunkResults[0].spec.days
      const scaledItems = items.map(item => ({
        ...item,
        amount: Math.round(item.amount * budgetScale * 100) / 100,
      }))
      plan.budget = {
        ...plan.budget,
        items: scaledItems,
        total: Math.round(scaledItems.reduce((sum, item) => sum + item.amount, 0) * 100) / 100,
        shoppingIncluded: scaledItems.some(item => item.category === 'Compras' && item.amount > 0),
        scopeNote: `Estimativa consolidada dos ${chunkPlans.length} blocos que compõem os ${duration} dias da viagem.`,
      }
      plan.checklist = [...new Map(chunkPlans.flatMap(item => item.checklist || []).map((item: any) => [`${item.category}:${item.item}`, item])).values()]
      plan.safetyTips = [...new Set(chunkPlans.flatMap(item => item.safetyTips || []))]
      plan.practicalTips = [...new Set(chunkPlans.flatMap(item => item.practicalTips || []))]
    }

    plan.sources = (liveContext.sources || []).map((source: { label: string; url: string }) => ({
      ...source,
      updatedAt: liveContext.retrievedAt,
    }))

    // Um roteiro multi-país espalha pontos legitimamente por milhares de km, então o raio
    // de sanidade só vale quando há um destino único para servir de âncora.
    const geoSummary = await normalizePlanGeography(plan, liveContext, {
      allowRadiusCheck: destinations.length <= 1,
    })
    plan.geoCoverage = geoSummary
    if (geoSummary.missing) {
      console.warn('travel-assistant coordenadas aproximadas', geoSummary)
    }

    return jsonResponse({ success: true, plan, liveContext })
  } catch (error) {
    console.error('travel-assistant unhandled error', {
      message: cleanText(error instanceof Error ? error.message : '', 240),
    })
    return jsonResponse({
      success: false,
      error: 'Não foi possível processar o planejamento',
      code: 'ASSISTANT_INTERNAL_ERROR',
    }, 500)
  }
})
