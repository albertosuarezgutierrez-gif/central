// Cliente IA para ialimp — NVIDIA NIM (llama-3.3-70b)
// timeoutMs: corta la llamada si NVIDIA no responde (evita colgar la función serverless).
export async function aiComplete(prompt: string, timeoutMs = 30000): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY
  if (!apiKey) throw new Error('NVIDIA_API_KEY no configurada')

  const ctrl = new AbortController()
  const t = timeoutMs ? setTimeout(() => ctrl.abort(), timeoutMs) : null
  try {
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model: 'meta/llama-3.3-70b-instruct',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1024,
      }),
      signal: ctrl.signal,
    })

    if (!res.ok) throw new Error('Error IA: ' + res.status)
    const data = await res.json()
    return data.choices?.[0]?.message?.content || ''
  } finally {
    if (t) clearTimeout(t)
  }
}
