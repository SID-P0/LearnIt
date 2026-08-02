import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export async function POST({ request }) {
  try {
    const { question, context, bookContext } = await request.json();

    if (!env.OPENROUTER_API_KEY) {
      return json({ error: 'OpenRouter API key missing' }, { status: 500 });
    }

    let systemPrompt = "You are an intelligent tutor designed to help students learn. Give concise, highly educational answers.";
    
    if (bookContext) {
      systemPrompt += `\n\nThe student is currently reading this text:\n"${bookContext}"\n\nUse this text to inform your answers if relevant.`;
    }

    if (context) {
      systemPrompt += `\n\nHere is the previous context in the learning node:\n${context}`;
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.1-8b-instruct", // Fast and cheap for QA
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('OpenRouter Chat Error:', err);
      return json({ error: 'Chat API failed' }, { status: 500 });
    }

    const data = await response.json();
    return json({ answer: data.choices[0].message.content.trim() });
  } catch (err) {
    console.error('Chat Endpoint Error:', err);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
