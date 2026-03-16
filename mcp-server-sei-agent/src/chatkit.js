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

export function getConfig() {
  return {
    workflow_id:        SEI_WORKFLOW_ID  || null,
    api_key_configured: !!OPENAI_API_KEY,
  };
}
