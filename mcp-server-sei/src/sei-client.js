/**
 * sei-client.js
 * Cliente HTTP para a API REST do SEI (Sistema Eletrônico de Informações) v1.
 *
 * Documentação da API SEI disponível para órgãos credenciados em:
 *   {SEI_URL}/sei/api/v1/documentacao
 *
 * Variáveis de ambiente necessárias:
 *   SEI_URL      - URL base da instalação (ex: https://sei.orgao.gov.br)
 *   SEI_TOKEN    - Token de API gerado no painel Administração > Sistemas
 *   SEI_UNIDADE  - ID numérico da unidade no SEI
 */

const SEI_URL    = process.env.SEI_URL?.replace(/\/$/, '');
const SEI_TOKEN  = process.env.SEI_TOKEN;
const SEI_UNIDADE = process.env.SEI_UNIDADE;

function validateConfig() {
  const missing = [];
  if (!SEI_URL)     missing.push('SEI_URL');
  if (!SEI_TOKEN)   missing.push('SEI_TOKEN');
  if (!SEI_UNIDADE) missing.push('SEI_UNIDADE');
  if (missing.length) {
    throw new Error(`Variáveis de ambiente obrigatórias não definidas: ${missing.join(', ')}`);
  }
}

/**
 * Realiza uma chamada HTTP à API SEI.
 * @param {string} method    - Método HTTP (GET, POST, PUT, DELETE)
 * @param {string} path      - Caminho relativo (ex: '/processos')
 * @param {object} [params]  - Query params extras
 * @param {object} [body]    - Body JSON (para POST/PUT)
 */
async function seiRequest(method, path, params = {}, body = null) {
  validateConfig();

  const { default: fetch } = await import('node-fetch');

  const url = new URL(`${SEI_URL}/sei/api/v1${path}`);

  // Token sempre como query param (padrão SEI)
  url.searchParams.set('token', SEI_TOKEN);

  // Unidade como query param quando não informada explicitamente
  if (!url.searchParams.has('id_unidade')) {
    url.searchParams.set('id_unidade', SEI_UNIDADE);
  }

  // Adiciona query params extras
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, String(v));
    }
  }

  const options = {
    method,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url.toString(), options);

  // 204 No Content
  if (res.status === 204) return null;

  const text = await res.text();

  if (!res.ok) {
    let detail = text;
    try { detail = JSON.parse(text)?.mensagem || detail; } catch (_) {}
    throw new Error(`SEI API erro ${res.status}: ${detail}`);
  }

  if (!text) return null;
  return JSON.parse(text);
}

// ---------------------------------------------------------------------------
// Unidades
// ---------------------------------------------------------------------------

/** Lista unidades acessíveis pelo token. */
export async function listarUnidades() {
  return seiRequest('GET', '/unidades');
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Lista tipos de processo disponíveis na unidade. */
export async function listarTiposProcesso() {
  return seiRequest('GET', '/tipos_processo');
}

/** Lista tipos de documento disponíveis na unidade. */
export async function listarTiposDocumento() {
  return seiRequest('GET', '/tipos_documento');
}

// ---------------------------------------------------------------------------
// Processos
// ---------------------------------------------------------------------------

/**
 * Lista processos da unidade.
 * @param {object} filtros
 * @param {string} [filtros.id_tipo_processo]  - Filtrar por tipo de processo
 * @param {string} [filtros.situacao]          - 'A' (aberto), 'C' (concluído), 'E' (em bloqueio)
 * @param {string} [filtros.pesquisa]          - Texto livre para pesquisa
 * @param {number} [filtros.pagina]            - Número da página (padrão: 1)
 * @param {number} [filtros.registros_por_pagina] - Qtd por página (padrão: 20, max: 100)
 */
export async function listarProcessos(filtros = {}) {
  const params = {};
  if (filtros.id_tipo_processo)      params['id_tipo_processo']       = filtros.id_tipo_processo;
  if (filtros.situacao)              params['situacao']                = filtros.situacao;
  if (filtros.pesquisa)              params['pesquisa']                = filtros.pesquisa;
  if (filtros.pagina)                params['pagina']                  = filtros.pagina;
  if (filtros.registros_por_pagina)  params['registros_por_pagina']    = filtros.registros_por_pagina;

  return seiRequest('GET', '/processos', params);
}

/**
 * Consulta os detalhes de um processo pelo ID ou número.
 * @param {string} protocolo - Número ou ID do processo (ex: '00002.123456/2024-01')
 */
export async function consultarProcesso(protocolo) {
  // O SEI aceita o protocolo na URL (encode de '/' e '.')
  const id = encodeURIComponent(protocolo);
  return seiRequest('GET', `/processos/${id}`);
}

/**
 * Cria um novo processo no SEI.
 * @param {object} dados
 * @param {string} dados.id_tipo_processo         - ID do tipo de processo (obrigatório)
 * @param {string} dados.especificacao             - Especificação/assunto (obrigatório)
 * @param {string} [dados.nivel_acesso]            - '0'=público, '1'=restrito, '2'=sigiloso
 * @param {string} [dados.hipotese_legal]          - Hipótese legal (obrigatório se restrito/sigiloso)
 * @param {string[]} [dados.assuntos]              - Array de IDs de assuntos
 * @param {object[]} [dados.interessados]          - Array de {nome, sigla}
 * @param {string} [dados.observacoes]             - Observações internas
 */
export async function criarProcesso(dados) {
  const body = {
    id_tipo_processo:  dados.id_tipo_processo,
    especificacao:     dados.especificacao,
    nivel_acesso:      dados.nivel_acesso  ?? '0',
  };
  if (dados.hipotese_legal) body.hipotese_legal  = dados.hipotese_legal;
  if (dados.assuntos)       body.assuntos         = dados.assuntos;
  if (dados.interessados)   body.interessados     = dados.interessados;
  if (dados.observacoes)    body.observacoes      = dados.observacoes;

  return seiRequest('POST', '/processos', {}, body);
}

// ---------------------------------------------------------------------------
// Documentos
// ---------------------------------------------------------------------------

/**
 * Lista os documentos de um processo.
 * @param {string} protocolo - Número ou ID do processo
 */
export async function listarDocumentosProcesso(protocolo) {
  const id = encodeURIComponent(protocolo);
  return seiRequest('GET', `/processos/${id}/documentos`);
}

/**
 * Consulta os metadados de um documento específico.
 * @param {string} idDocumento - ID do documento no SEI
 */
export async function consultarDocumento(idDocumento) {
  return seiRequest('GET', `/documentos/${idDocumento}`);
}

/**
 * Recupera o conteúdo (HTML/texto) de um documento.
 * @param {string} idDocumento - ID do documento no SEI
 */
export async function conteudoDocumento(idDocumento) {
  return seiRequest('GET', `/documentos/${idDocumento}/conteudo`);
}

/**
 * Inclui um documento externo (PDF, DOCX etc.) em um processo.
 * @param {string} protocolo - Número ou ID do processo
 * @param {object} dados
 * @param {string} dados.id_tipo_documento   - ID do tipo de documento
 * @param {string} dados.nome               - Nome do documento
 * @param {string} dados.data               - Data do documento (DD/MM/AAAA)
 * @param {string} dados.nivel_acesso       - '0'=público, '1'=restrito, '2'=sigiloso
 * @param {string} dados.conteudo_base64    - Conteúdo do arquivo em Base64
 * @param {string} [dados.descricao]        - Descrição adicional
 * @param {string} [dados.remetente]        - Nome do remetente (para doc externo)
 */
export async function incluirDocumento(protocolo, dados) {
  const id = encodeURIComponent(protocolo);
  const body = {
    id_tipo_documento:  dados.id_tipo_documento,
    nome:               dados.nome,
    data:               dados.data,
    nivel_acesso:       dados.nivel_acesso ?? '0',
    conteudo_base64:    dados.conteudo_base64,
  };
  if (dados.descricao)  body.descricao  = dados.descricao;
  if (dados.remetente)  body.remetente  = dados.remetente;

  return seiRequest('POST', `/processos/${id}/documentos`, {}, body);
}

// ---------------------------------------------------------------------------
// Utilitários de configuração
// ---------------------------------------------------------------------------

/**
 * Retorna o status da configuração (sem expor o token).
 */
export function statusConfiguracao() {
  return {
    sei_url:     SEI_URL     || '(não configurado)',
    sei_unidade: SEI_UNIDADE || '(não configurado)',
    sei_token:   SEI_TOKEN   ? `${SEI_TOKEN.slice(0, 4)}${'*'.repeat(Math.max(0, SEI_TOKEN.length - 8))}${SEI_TOKEN.slice(-4)}` : '(não configurado)',
    configurado: !!(SEI_URL && SEI_TOKEN && SEI_UNIDADE),
  };
}
