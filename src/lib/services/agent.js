/**
 * Mock Agent Service
 * Simulates an AI agent answering questions.
 * Will be replaced with real API calls later.
 */

/**
 * Ask the agent a question and get an answer
 * @param {string} question - The user's question
 * @param {string|null} context - Optional context from parent node
 * @param {string|null} bookContext - Optional text context from the currently read book spread
 * @returns {Promise<string>} The agent's answer
 */
export async function askAgent(question, context = null, bookContext = null) {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, context, bookContext })
    });
    
    if (!res.ok) throw new Error('Chat API returned an error');
    const data = await res.json();
    return data.answer || "Sorry, I couldn't process that.";
  } catch (err) {
    console.error('Error in askAgent:', err);
    return "Error communicating with the intelligent tutor. Please check API keys.";
  }
}

/**
 * Generate a short 3-4 word summary of a question for the index title.
 * @param {string} question - The user's question
 * @returns {Promise<string>} The summary title
 */
export async function summarizeQuestion(question) {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: `Summarize this question in 2-4 words for a title. Return ONLY the title, no quotes or punctuation: ${question}`,
        context: null,
        bookContext: null
      })
    });
    
    if (!res.ok) return question.split(' ').slice(0, 4).join(' ');
    const data = await res.json();
    return data.answer.replace(/["']/g, '');
  } catch (err) {
    return question.split(' ').slice(0, 4).join(' ');
  }
}
