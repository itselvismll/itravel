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
              required: ['period', 'title', 'description', 'location', 'duration', 'estimatedCost', 'mapQuery', 'indoor', 'purchaseNote'],
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
    const primaryDestination = destinations[0]?.name || destination
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

    const prompt = `Você é o planejador de viagens do Journi. Responda em português brasileiro e apenas no JSON solicitado.

Pedido: ${JSON.stringify(safeRequest)}
Perfil do viajante: ${JSON.stringify(safeUserContext)}
Dados externos disponíveis: ${JSON.stringify(liveContext)}
Operação: ${operationInstruction}

Regras:
- Crie exatamente ${duration} dias, respeitando datas, ritmo, interesses, alimentação, acessibilidade e todos os países selecionados em destinations.
- Crie exatamente 3 atividades objetivas por dia (manhã, tarde e noite). Mantenha title, description e purchaseNote concisos para que roteiros longos não sejam cortados.
- O padrão de orçamento é ${safeRequest.budgetLevel}: economy significa econômico/barato, balanced significa médio e premium significa caro/confortável.
- Distribua manhã, tarde e noite sem deslocamentos impossíveis; agrupe locais próximos.
- Todos os custos devem ser numéricos em ${currency}, para ${travelers} viajante(s), e o total deve respeitar o orçamento quando ele for maior que zero.
- budget.items deve detalhar Passagens, Hospedagem, Alimentação, Transporte local, Passeios e ingressos, Compras e Reserva. Os itens devem somar exatamente budget.total.
- Quando destinationBudgets existir, respeite o teto informado para cada país e use amountInBRL como referência consolidada. Explique em budget.scopeNote como o total foi distribuído entre os destinos.
- Não presuma passagens ou hospedagem: quando não houver dados suficientes, use valor 0 na categoria e explique em note que não está incluída. Não conte o custo de uma atividade duas vezes.
- Inclua uma verba de Compras somente quando ela couber no orçamento ou estiver alinhada aos interesses. shoppingIncluded só pode ser true quando a categoria Compras tiver valor maior que 0. Explique todas as inclusões e exclusões em scopeNote.
- Atividades realmente gratuitas devem ter estimatedCost igual a 0. Não use textos como "grátis" no campo numérico.
- mapQuery deve ser uma busca precisa no formato "local, cidade, país".
- Priorize os locais de realPlaces. Ao usar um deles, copie nome, latitude, longitude, avaliação, quantidade de avaliações, horários e mapsUrl sem alterar os dados; copie website para officialUrl e provider para verificationSource.
- Combine a categoria: refeições usam realPlaces.category restaurante, hospedagem usa hotel e passeios usam passeio. Copie também placeId sem alterar.
- officialUrl só pode receber uma URL presente nos dados externos. Nunca invente links de ingresso, afiliados ou sites de compra.
- Em purchaseNote, quando houver officialUrl, oriente a conferir/comprar no site oficial. Sem officialUrl, oriente a consultar ingressos e canais oficiais na ficha do local no Maps. Para atividade gratuita, informe que o valor é 0 e que as regras devem ser confirmadas.
- Se uma fonte não trouxer avaliação ou horário, deixe o campo ausente; nunca fabrique reviews ou horários.
- Use os dados meteorológicos apenas quando existirem; caso contrário diga que a previsão deve ser conferida perto da viagem.
- Não invente horários de funcionamento, preços oficiais ou regras legais. Indique estimativas claramente.
- As fontes devem incluir as URLs reais dos dados externos usados e a data de consulta.
- Checklist deve incluir documentos, saúde, dinheiro, conectividade e bagagem.
- Inclua alertas de segurança objetivos, sem alarmismo.`

    const responseSchema = {
      ...planSchema,
      properties: {
        ...planSchema.properties,
        days: {
          ...planSchema.properties.days,
          minItems: duration,
          maxItems: duration,
        },
      },
    }

    const configuredModel = Deno.env.get('GEMINI_MODEL') || 'gemini-3.6-flash'
    const models = [...new Set([configuredModel, 'gemini-3.5-flash-lite'])]
    let geminiResponse: Response | null = null
    let geminiData: any = null

    for (const model of models) {
      geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: 65535,
              responseMimeType: 'application/json',
              responseSchema,
            },
          }),
        },
      )
      geminiData = await geminiResponse.json().catch(() => null)
      if (geminiResponse.ok && geminiData) break
    }

    if (!geminiResponse?.ok || !geminiData) {
      const providerStatus = geminiData?.error?.status
      const responseStatus = geminiResponse?.status || 502
      const error = responseStatus === 429
        ? 'O limite temporário da IA foi atingido. Aguarde um minuto e tente novamente.'
        : 'A IA não conseguiu montar o roteiro agora. Tente novamente em instantes.'
      console.error('travel-assistant provider failure', { status: responseStatus, providerStatus })
      return jsonResponse({ success: false, error }, responseStatus === 429 ? 429 : 502)
    }

    const responseText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!responseText) return jsonResponse({ success: false, error: 'A IA retornou uma resposta vazia' }, 502)

    let plan
    try {
      plan = JSON.parse(responseText)
    } catch {
      return jsonResponse({ success: false, error: 'A IA retornou um roteiro fora do formato esperado' }, 502)
    }

    if (!Array.isArray(plan.days) || plan.days.length !== duration) {
      return jsonResponse({
        success: false,
        error: `A IA gerou ${plan.days?.length || 0} de ${duration} dias. Tente gerar novamente.`,
      }, 502)
    }

    plan.sources = (liveContext.sources || []).map((source: { label: string; url: string }) => ({
      ...source,
      updatedAt: liveContext.retrievedAt,
    }))

    return jsonResponse({ success: true, plan, liveContext })
  } catch {
    return jsonResponse({ success: false, error: 'Não foi possível processar o planejamento' }, 500)
  }
})
