/**
 * Agente SEI — wrapper sobre a OpenAI Responses API.
 *
 * Mantém o estado de conversa por sessão usando `previous_response_id`,
 * o mecanismo nativo de continuação da Responses API.
 */

const OPENAI_API_KEY   = process.env.OPENAI_API_KEY;
const SEI_MODEL        = process.env.OPENAI_SEI_MODEL || 'gpt-4o-mini';
// OPENAI_SEI_WORKFLOW_ID é reservado para uso futuro com o widget ChatKit frontend.
// O workflow (wf_xxx) do AgentBuilder só é acessível via SDK JS browser (não REST server-to-server).
// Para comunicação server-to-server (caso deste MCP server), usamos a Responses API abaixo.
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
  console.log(`[sei-agent] OPENAI_SEI_WORKFLOW_ID configurado: ${SEI_WORKFLOW_ID}`);
  console.log('[sei-agent] Nota: o workflow ID é para uso com widget ChatKit (frontend). Este servidor usa a Responses API para comunicação server-to-server.');
}

async function callOpenAI(body) {
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
    throw new Error(`OpenAI API error ${response.status}: ${err}`);
  }

  return response.json();
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

  const body = {
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
