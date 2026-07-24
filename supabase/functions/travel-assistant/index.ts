import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Método não permitido' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json', Allow: 'POST' } }
    )
  }

  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY')

    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'GEMINI_API_KEY não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const { promptType, destination, userContext = {} } = body

    if (typeof destination !== 'string' || !destination.trim() || destination.length > 120) {
      return new Response(
        JSON.stringify({ success: false, error: 'Destino inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const allowedPromptTypes = new Set(['guide', 'itinerary', 'budget', 'weather', 'scams', 'summary'])
    if (!allowedPromptTypes.has(promptType)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Tipo de solicitação inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const sanitizeList = (value: unknown) => Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string').slice(0, 195).map(item => item.slice(0, 80))
      : []

    const safeContext = {
      visitedCountries: sanitizeList(userContext?.visitedCountries),
      wishlistCountries: sanitizeList(userContext?.wishlistCountries),
      level: typeof userContext?.level === 'string' ? userContext.level.slice(0, 40) : 'Iniciante',
      totalCountries: Number.isFinite(userContext?.totalCountries)
        ? Math.max(0, Math.min(195, Number(userContext.totalCountries)))
        : 0,
    }

    const systemContext = `Você é um assistente de viagem especializado
integrado ao app Journi. Responda sempre em português brasileiro,
de forma clara, prática e bem organizada com seções definidas.
Use emojis moderadamente.

Contexto do usuário:
- Países visitados: ${safeContext.visitedCountries.join(', ') || 'nenhum ainda'}
- Wishlist: ${safeContext.wishlistCountries.join(', ') || 'nenhum ainda'}
- Nível: ${safeContext.level}
- Total de países: ${safeContext.totalCountries}`

    const prompts: Record<string, string> = {
      guide: `${systemContext}\n\nCrie um guia completo de 1 página para
uma viagem a ${destination}. Inclua: melhor época, dicas de voo,
hospedagem, roteiro diário resumido (3-5 dias), transporte local,
números de emergência, câmbio e regras culturais.`,

      itinerary: `${systemContext}\n\nMonte um roteiro de experiências
locais em ${destination} com lugares autênticos, pouco turísticos e
joias escondidas. Atividades gratuitas ou baratas, onde comer bem
sem gastar muito, plano dia a dia por região.`,

      budget: `${systemContext}\n\nCrie um planejamento de orçamento
para ${destination}. Estime custos de voo, hospedagem, alimentação,
transporte e passeios. Onde economizar, onde vale investir mais,
alternativas mais baratas por categoria.`,

      weather: `${systemContext}\n\nDescreva o clima em ${destination}
e crie 2 roteiros: um para sol e outro para chuva. Opções indoor e
outdoor, tempo estimado em cada lugar e plano B para imprevistos.`,

      scams: `${systemContext}\n\nListe golpes comuns, passeios caros
demais e áreas de atenção em ${destination}. Como evitar cada
situação e alternativas mais seguras e econômicas.`,

      summary: `${systemContext}\n\nResumo completo de viagem para
${destination}: documentos, moeda e câmbio, transporte do aeroporto,
apps úteis, frases básicas no idioma, costumes importantes e
checklist do que levar.`,
    }

    const userMessage = prompts[promptType] ||
      `${systemContext}\n\nDê informações úteis sobre ${destination}.`

    const geminiUrl =
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent'
    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: {
          maxOutputTokens: 1500,
        },
      }),
    })

    const rawData = await geminiResponse.text()

    let data
    try {
      data = JSON.parse(rawData)
    } catch(e) {
      console.error('Erro ao parsear JSON:', (e as Error).message)
      return new Response(
        JSON.stringify({ success: false, error: 'Resposta inválida do Gemini' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }


    if (!geminiResponse.ok || data.error) {
      console.error('Gemini API error:', JSON.stringify(data.error))
      return new Response(
        JSON.stringify({ success: false, error: 'O assistente está temporariamente indisponível' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const responseText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      data?.candidates?.[0]?.output ||
      null

    if (!responseText) {
      console.error('Sem texto na resposta. Estrutura:', JSON.stringify(data).substring(0, 300))
      return new Response(
        JSON.stringify({ success: false, error: 'Gemini não retornou texto' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, response: responseText }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Erro geral:', (error as Error).message, (error as Error).stack)
    return new Response(
      JSON.stringify({ success: false, error: 'Não foi possível processar a solicitação' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
