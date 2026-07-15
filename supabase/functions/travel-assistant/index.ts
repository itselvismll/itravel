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
  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    console.log('API key present:', !!apiKey)
    console.log('API key prefix:', apiKey ? apiKey.substring(0, 8) : 'MISSING')

    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'GEMINI_API_KEY não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    console.log('Body received:', JSON.stringify(body).substring(0, 200))
    const { promptType, destination, userContext } = body

    const systemContext = `Você é um assistente de viagem especializado
integrado ao app Journi. Responda sempre em português brasileiro,
de forma clara, prática e bem organizada com seções definidas.
Use emojis moderadamente.

Contexto do usuário:
- Países visitados: ${userContext.visitedCountries?.join(', ') || 'nenhum ainda'}
- Wishlist: ${userContext.wishlistCountries?.join(', ') || 'nenhum ainda'}
- Nível: ${userContext.level || 'Iniciante'}
- Total de países: ${userContext.totalCountries || 0}`

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

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`
    console.log('Calling Gemini URL (without key):', geminiUrl.split('?')[0])

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: {
          maxOutputTokens: 1500,
          temperature: 0.7
        },
      }),
    })

    const rawData = await geminiResponse.text()
    console.log('Gemini status:', geminiResponse.status)
    console.log('Gemini raw response:', rawData.substring(0, 500))

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

    console.log('Gemini data keys:', Object.keys(data))

    if (data.error) {
      console.error('Gemini API error:', JSON.stringify(data.error))
      return new Response(
        JSON.stringify({ success: false, error: `Gemini: ${data.error.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
