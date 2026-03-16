/**
 * ChatKit Sessions API — OpenAI AgentBuilder
 *
 * Cria sessões para o workflow SEI hospedado na OpenAI.
 * O client_secret retornado é usado pelo widget ChatKit JS no browser
 * para se conectar diretamente ao workflow.
 *
 * Docs: https://developers.openai.com/api/docs/guides/chatkit
 */

const OPENAI_API_KEY  = process.env.OPENAI_API_KEY;
const SEI_WORKFLOW_ID = process.env.OPENAI_SEI_WORKFLOW_ID;

// session_id → previous_response_id (para manter contexto de conversa)
const sessionState = new Map();

/**
 * Cria uma sessão ChatKit para o workflow SEI.
 * @param {string} userId  Identificador único do usuário (email, UUID, etc.)
 * @returns {Promise<string>} client_secret para uso no widget JS do browser
 */
export async function criarSessao(userId) {
  if (!OPENAI_API_KEY)  throw new Error('OPENAI_API_KEY não configurado');
  if (!SEI_WORKFLOW_ID) throw new Error('OPENAI_SEI_WORKFLOW_ID não configurado (ex: wf_xxx)');

  console.error(`[chatkit] Criando sessão → user=${userId}, workflow=${SEI_WORKFLOW_ID}`);

  const resp = await fetch('https://api.openai.com/v1/chatkit/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type':  'application/json',
      'OpenAI-Beta':   'chatkit_beta=v1',
    },
    body: JSON.stringify({
      workflow: { id: SEI_WORKFLOW_ID },
      user: userId,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error(`[chatkit] Erro ${resp.status}:`, err);
    throw new Error(`ChatKit Sessions API error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  console.error(`[chatkit] Sessão criada com sucesso`);
  return data.client_secret;
}

/**
 * Envia uma mensagem ao workflow SEI via Responses API (server-to-server).
 * O workflow ID é usado diretamente como model — as instruções e ferramentas
 * já estão configuradas no AgentBuilder, não precisam ser repetidas aqui.
 *
 * @param {string} message    Mensagem do usuário
 * @param {string} sessionId  ID de sessão para manter contexto (opcional)
 * @returns {Promise<string>} Resposta do agente
 */
export async function agentChat(message, sessionId) {
  if (!OPENAI_API_KEY)  throw new Error('OPENAI_API_KEY não configurado');
  if (!SEI_WORKFLOW_ID) throw new Error('OPENAI_SEI_WORKFLOW_ID não configurado (ex: wf_xxx)');

  const body = {
    model: SEI_WORKFLOW_ID,
    input: message,
  };

  const previousId = sessionId && sessionState.get(sessionId);
  if (previousId) {
    body.previous_response_id = previousId;
  }

  console.error(`[chatkit] Responses API → workflow=${SEI_WORKFLOW_ID}, session=${sessionId || 'anon'}`);

  const resp = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error(`[chatkit] Responses API erro ${resp.status}:`, err);
    throw new Error(`Responses API error ${resp.status}: ${err}`);
  }

  const result = await resp.json();

  if (result.id && sessionId) {
    sessionState.set(sessionId, result.id);
  }

  const text = result.output
    ?.filter(i  => i.type === 'message')
    ?.flatMap(i => i.content || [])
    ?.filter(c  => c.type === 'output_text')
    ?.map(c    => c.text)
    ?.join('\n');

  return text || 'O agente SEI não retornou uma resposta.';
}

export function limparSessao(sessionId) {
  sessionState.delete(sessionId);
}

export function getConfig() {
  return {
    workflow_id:        SEI_WORKFLOW_ID  || null,
    api_key_configured: !!OPENAI_API_KEY,
  };
}
