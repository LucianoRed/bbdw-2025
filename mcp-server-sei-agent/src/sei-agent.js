/**
 * Agente SEI — wrapper sobre a OpenAI Responses API.
 *
 * Quando OPENAI_SEI_WORKFLOW_ID está configurado, usa o workflow criado no
 * AgentBuilder como `model` na Responses API — o workflow carrega suas próprias
 * instruções, ferramentas e configurações, dispensando o `instructions` local.
 *
 * Quando não configurado, usa o modelo genérico com instruções locais.
 *
 * Mantém o estado de conversa por sessão usando `previous_response_id`.
 */

const OPENAI_API_KEY   = process.env.OPENAI_API_KEY;
const SEI_MODEL        = process.env.OPENAI_SEI_MODEL || 'gpt-4o-mini';
// ID do workflow criado no OpenAI AgentBuilder (wf_xxx).
// Quando definido, é passado como `model` na Responses API para que o agente
// use as instruções e ferramentas configuradas no workflow — não as locais.
const SEI_WORKFLOW_ID  = process.env.OPENAI_SEI_WORKFLOW_ID || null;
const SEI_INSTRUCTIONS = process.env.OPENAI_SEI_INSTRUCTIONS ||
  `Você é um agente especializado no SEI — Sistema Eletrônico de Informações do governo federal brasileiro.
Você possui as seguintes capacidades:
- Consultar processos, documentos e expedientes do SEI
- Orientar sobre criação, tramitação e assinatura de documentos
- Explicar fluxos e tipos de processos disponíveis
- Informar sobre unidades organizacionais e seus papéis no SEI
- Auxiliar com autenticação e permissões no sistema

Sempre responda em português, de forma clara e objetiva, usando markdown quando adequado.
Se o usuário pedir uma ação que requer acesso direto ao sistema SEI (como abrir um processo real),
explique o que seria feito e qual API SOAP seria chamada, sem executar — a menos que tenha
ferramentas MCP do SEI disponíveis para isso.`;

// Mapa session_id → previous_response_id (estado de conversa por sessão)
const sessionState = new Map();

if (SEI_WORKFLOW_ID) {
  console.log(`[sei-agent] Usando workflow do AgentBuilder: ${SEI_WORKFLOW_ID}`);
} else {
  console.log(`[sei-agent] Usando modelo genérico: ${SEI_MODEL} (sem workflow configurado)`);
}

async function callOpenAI(body) {
  console.error('[sei-agent] Enviando para /v1/responses, body:', JSON.stringify({ ...body, instructions: body.instructions ? '(omitido)' : undefined }));

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`[sei-agent] Erro da OpenAI API (${response.status}):`, err);
    throw new Error(`OpenAI API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  console.error('[sei-agent] Resposta recebida, id:', data.id, 'model:', data.model);
  return data;
}

/**
 * Retorna a configuração ativa do agente (sem expor a API key).
 */
export function getAgentConfig() {
  return {
    workflow_id: SEI_WORKFLOW_ID || null,
    model: SEI_WORKFLOW_ID ? SEI_WORKFLOW_ID : SEI_MODEL,
    using_workflow: !!SEI_WORKFLOW_ID,
    api_key_configured: !!OPENAI_API_KEY,
  };
}

/**
 * Envia uma mensagem ao agente SEI e retorna a resposta.
 * Mantém o histórico de conversa via previous_response_id por sessão.
 *
 * @param {string} message    - Mensagem do usuário
 * @param {string} sessionId  - ID da sessão (para manter contexto de conversa)
 * @returns {string} Texto da resposta do agente
 */
export async function seiAgentChat(message, sessionId) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY não configurado no mcp-server-sei-agent');
  }

  // Quando o workflow está configurado, usá-lo como model e omitir instructions
  // locais — o workflow já carrega seu próprio system prompt configurado no AgentBuilder.
  const body = SEI_WORKFLOW_ID
    ? {
        model: SEI_WORKFLOW_ID,
        input: message,
      }
    : {
        model: SEI_MODEL,
        instructions: SEI_INSTRUCTIONS,
        input: message,
      };

  // Adiciona continuação de conversa se houver estado anterior
  const previousId = sessionState.get(sessionId);
  if (previousId) {
    body.previous_response_id = previousId;
  }

  const result = await callOpenAI(body);

  // Persiste o ID da resposta para a próxima mensagem da mesma sessão
  if (result.id) {
    sessionState.set(sessionId, result.id);
  }

  // Extrai o texto da resposta
  const outputText = result.output
    ?.filter(item => item.type === 'message')
    ?.flatMap(item => item.content || [])
    ?.filter(c => c.type === 'output_text')
    ?.map(c => c.text)
    ?.join('\n') || '';

  return outputText || 'O agente SEI não retornou uma resposta.';
}

/**
 * Remove o estado de conversa de uma sessão (útil para resetar contexto).
 */
export function clearSession(sessionId) {
  sessionState.delete(sessionId);
}
