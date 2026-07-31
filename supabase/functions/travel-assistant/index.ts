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

const fetchJson = async (url: string) => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(7000) })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

const getLiveContext = async (destination: string, currency: string) => {
  const geocodingUrl = new URL('https://geocoding-api.open-meteo.com/v1/search')
  geocodingUrl.searchParams.set('name', destination)
  geocodingUrl.searchParams.set('count', '1')
  geocodingUrl.searchParams.set('language', 'pt')
  geocodingUrl.searchParams.set('format', 'json')

  const [geocoding, exchange] = await Promise.all([
    fetchJson(geocodingUrl.toString()),
    fetchJson(`https://api.frankfurter.app/latest?from=${encodeURIComponent(currency)}`),
  ])

  const place = geocoding?.results?.[0]
  let weather = null
  let weatherSourceUrl = ''
  if (place?.latitude && place?.longitude) {
    const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast')
    weatherUrl.searchParams.set('latitude', String(place.latitude))
    weatherUrl.searchParams.set('longitude', String(place.longitude))
    weatherUrl.searchParams.set('current', 'temperature_2m,weather_code')
    weatherUrl.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_probability_max')
    weatherUrl.searchParams.set('timezone', 'auto')
    weatherUrl.searchParams.set('forecast_days', '7')
    weatherSourceUrl = weatherUrl.toString()
    weather = await fetchJson(weatherSourceUrl)
  }

  return {
    place: place ? {
      name: place.name,
      country: place.country,
      countryCode: place.country_code,
      latitude: place.latitude,
      longitude: place.longitude,
      timezone: place.timezone,
    } : null,
    weather: weather ? {
      current: weather.current,
      daily: weather.daily,
    } : null,
    exchange: exchange ? {
      base: exchange.base,
      date: exchange.date,
      rates: exchange.rates,
    } : null,
    sources: [
      place ? { label: 'Localização — Open-Meteo', url: geocodingUrl.toString() } : null,
      weather ? { label: 'Previsão do tempo — Open-Meteo', url: weatherSourceUrl } : null,
      exchange ? { label: 'Câmbio — Frankfurter', url: `https://api.frankfurter.app/latest?from=${encodeURIComponent(currency)}` } : null,
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
            items: {
              type: 'OBJECT',
              required: ['period', 'title', 'description', 'location', 'duration', 'estimatedCost', 'mapQuery', 'indoor'],
              properties: {
                period: { type: 'STRING' },
                title: { type: 'STRING' },
                description: { type: 'STRING' },
                location: { type: 'STRING' },
                duration: { type: 'STRING' },
                estimatedCost: { type: 'NUMBER' },
                mapQuery: { type: 'STRING' },
                indoor: { type: 'BOOLEAN' },
              },
            },
          },
        },
      },
    },
    budget: {
      type: 'OBJECT',
      required: ['total', 'currency', 'items'],
      properties: {
        total: { type: 'NUMBER' },
        currency: { type: 'STRING' },
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
    const action = body?.action === 'regenerate_activity' ? 'regenerate_activity' : 'generate_plan'
    const request = body?.planRequest || {}
    const destination = cleanText(request.destination, 120)
    const origin = cleanText(request.origin, 120)
    const currency = cleanText(request.currency, 3).toUpperCase() || 'BRL'
    const travelers = Math.max(1, Math.min(30, Number(request.travelers) || 1))
    const duration = Math.max(1, Math.min(14, Number(request.duration) || 3))
    const budget = Math.max(0, Number(request.budget) || 0)

    if (!destination) return jsonResponse({ success: false, error: 'Informe um destino válido' }, 400)

    const safeRequest = {
      destination,
      origin,
      startDate: cleanText(request.startDate, 10),
      endDate: cleanText(request.endDate, 10),
      duration,
      travelers,
      travelerType: cleanText(request.travelerType, 40),
      budget,
      currency,
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

    const liveContext = await getLiveContext(destination, currency)
    const regenerationInstruction = action === 'regenerate_activity'
      ? `Ajuste somente a atividade indicada e preserve todo o restante. Bloco: ${JSON.stringify(body?.block || {}).slice(0, 500)}. Roteiro atual: ${JSON.stringify(body?.existingPlan || {}).slice(0, 30000)}`
      : 'Crie um roteiro novo e coerente.'

    const prompt = `Você é o planejador de viagens do Journi. Responda em português brasileiro e apenas no JSON solicitado.

Pedido: ${JSON.stringify(safeRequest)}
Perfil do viajante: ${JSON.stringify(safeUserContext)}
Dados externos disponíveis: ${JSON.stringify(liveContext)}
Operação: ${regenerationInstruction}

Regras:
- Crie exatamente ${duration} dias, respeitando datas, ritmo, interesses, alimentação e acessibilidade.
- Distribua manhã, tarde e noite sem deslocamentos impossíveis; agrupe locais próximos.
- Todos os custos devem ser numéricos em ${currency}, para ${travelers} viajante(s), e o total deve respeitar o orçamento quando ele for maior que zero.
- mapQuery deve ser uma busca precisa no formato "local, cidade, país".
- Use os dados meteorológicos apenas quando existirem; caso contrário diga que a previsão deve ser conferida perto da viagem.
- Não invente horários de funcionamento, preços oficiais ou regras legais. Indique estimativas claramente.
- As fontes devem incluir as URLs reais dos dados externos usados e a data de consulta.
- Checklist deve incluir documentos, saúde, dinheiro, conectividade e bagagem.
- Inclua alertas de segurança objetivos, sem alarmismo.`

    const geminiResponse = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
            responseSchema: planSchema,
          },
        }),
      },
    )

    const geminiData = await geminiResponse.json().catch(() => null)
    if (!geminiResponse.ok || !geminiData) {
      return jsonResponse({ success: false, error: 'A IA não conseguiu montar o roteiro agora' }, 502)
    }

    const responseText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!responseText) return jsonResponse({ success: false, error: 'A IA retornou uma resposta vazia' }, 502)

    let plan
    try {
      plan = JSON.parse(responseText)
    } catch {
      return jsonResponse({ success: false, error: 'A IA retornou um roteiro fora do formato esperado' }, 502)
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
