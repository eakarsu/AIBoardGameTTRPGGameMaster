/**
 * Robustly parse JSON from AI model output.
 * Handles raw JSON, markdown code fences, and embedded JSON.
 */
function parseAIJson(text) {
  if (!text || typeof text !== 'string') return null;

  // 1. Direct parse
  try { return JSON.parse(text); } catch (e) {}

  // 2. Strip markdown code fences
  const stripped = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  try { return JSON.parse(stripped); } catch (e) {}

  // 3. Extract first {...} block
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch (e) {}
  }

  // 4. Extract first [...] block
  const arrStart = text.indexOf('[');
  const arrEnd = text.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
    try { return JSON.parse(text.slice(arrStart, arrEnd + 1)); } catch (e) {}
  }

  return null;
}

module.exports = { parseAIJson };
