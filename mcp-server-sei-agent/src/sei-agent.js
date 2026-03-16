/**
 * Agente SEI
 *
 * COMO FUNCIONA:
 *
 * O workflow do AgentBuilder (wf_xxx) hospedado na OpenAI só é acessível pelo
 * BROWSER via widget ChatKit JS + client_secret. Não existe API REST para enviar
 * mensagens ao workflow server-to-server — essa é uma limitação da plataforma.
 *
 * Este servidor oferece duas tools:
 *
 * 1. sei_agent_chat  → Responses API (server-to-server, para o agente MCP).
 *    Defina OPENAI_SEI_INSTRUCTIONS com o mesmo system prompt do seu workflow
 *    para que o comportamento seja idêntico.
 *
 * 2. sei_criar_sessao → ChatKit Sessions API.
 *    Retorna o client_secret para o BROWSER usar com o widget ChatKit JS,
 *    conectando diretamente ao workflow hospedado na OpenAI.
 */

const OPENAI_API_KEY   = process.env.OPENAI_API_KEY;
const SEI_MODEL        = process.env.OPENAI_SEI_MODEL || 'gpt-4o-mini';
const SEI_WORKFLOW_ID  = process.env.OPENAI_SEI_WORKFLOW_ID || null;
const SEI_INSTRUCTIONS = process.env.OPENAI_SEI_INSTRUCTIONS || null;

// session_id → previous_response_id
const sessionState = new Map();

if (!SEI_INSTRUCTIONS) {
  console.error('[sei-agent] AVISO: OPENAI_SEI_INSTRUCTIONS não definido. Copie o system prompt do seu workflow para esta variável.');
}
console.error(`[sei-agent] Modo chat: Responses API, model=${SEI_MODEL}`);
if (SEI_WORKFLOW_ID) {
  console.error(`[sei-agent] ChatKit (browser): workflow=${SEI_WORKFLOW_ID}`);
}

// ---------------------------------------------------------------------------
// sei_agent_chat — Responses API (server-to-server)
// ---------------------------------------------------------------------------

export async function seiAgentChat(message, sessionId) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY não configurado');
  }
  if (!SEI_INSTRUCTIONS) {
    throw new Error(
      'OPENAI_SEI_INSTRUCTIONS não configurado. Copie o system prompt do seu workflow do AgentBuilder para esta variável de ambiente.'
    );
  }

  const body = {
    model: SEI_MODEL,
    instructions: SEI_INSTRUCTIONS,
    input: message,
  };

  const previousId = sessionState.get(sessionId);
  if (previousId) {
    body.previous_response_id = previousId;
  }

  console.error(`[sei-agent] Responses API → model=${SEI_MODEL}, session=${sessionId}`);

  const resp = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error(`[sei-agent] Erro ${resp.status}:`, err);
    throw new Error(`OpenAI API error ${resp.status}: ${err}`);
  }

  const result = await resp.json();

  if (result.id) sessionState.set(sessionId, result.id);

  return result.output
    ?.filter(i => i.type === 'message')
    ?.flatMap(i => i.content || [])
    ?.filter(c => c.type === 'output_text')
    ?.map(c => c.text)
    ?.join('\n') || 'O agente SEI não retornou uma resposta.';
}

// ---------------------------------------------------------------------------
// sei_criar_sessao — ChatKit Sessions API (retorna client_secret p/ browser)
// ---------------------------------------------------------------------------

export async function criarSessaoChatKit(userId) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY não configurado');
  }
  if (!SEI_WORKFLOW_ID) {
    throw new Error('OPENAI_SEI_WORKFLOW_ID não configurado. Defina com o ID do workflow (wf_xxx).');
  }

  console.error(`[sei-agent] Criando sessão ChatKit: user=${userId}, workflow=${SEI_WORKFLOW_ID}`);

  const resp = await fetch('https://api.openai.com/v1/chatkit/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'chatkit_beta=v1',
    },
    body: JSON.stringify({
      workflow: { id: SEI_WORKFLOW_ID },
      user: userId,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error(`[sei-agent] Erro ChatKit Sessions (${resp.status}):`, err);
    throw new Error(`ChatKit Sessions API error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  return data.client_secret;
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

export function clearSession(sessionId) {
  sessionState.delete(sessionId);
}

export function getAgentConfig() {
  return {
    model: SEI_MODEL,
    instructions_configured: !!SEI_INSTRUCTIONS,
    workflow_id: SEI_WORKFLOW_ID || null,
    api_key_configured: !!OPENAI_API_KEY,
  };
}

