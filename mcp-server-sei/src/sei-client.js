/**
 * sei-client.js
 * Cliente SOAP para o SEI (Sistema Eletrônico de Informações).
 *
 * Esta instalação não possui a API REST v1 habilitada.
 * Toda comunicação é feita via WebService SOAP disponível em:
 *   {SEI_URL}/sei/controlador_ws.php?servico=sei
 *
 * Variáveis de ambiente necessárias:
 *   SEI_URL      - URL base da instalação (ex: http://sei.orgao.gov.br)
 *   SEI_TOKEN    - Token/chave do sistema cadastrado em Administração > Sistemas
 *   SEI_UNIDADE  - ID numérico da unidade no SEI
 *   SEI_SISTEMA  - Sigla do sistema cadastrado no SEI (padrão: 'SEI')
 */

import soap from 'soap';

const SEI_URL     = process.env.SEI_URL?.replace(/\/$/, '');
const SEI_TOKEN   = process.env.SEI_TOKEN;
const SEI_UNIDADE = process.env.SEI_UNIDADE;
const SEI_SISTEMA = process.env.SEI_SISTEMA || 'ABC';

let _client = null;

function validateConfig() {
  const missing = [];
  if (!SEI_URL)     missing.push('SEI_URL');
  if (!SEI_TOKEN)   missing.push('SEI_TOKEN');
  if (!SEI_UNIDADE) missing.push('SEI_UNIDADE');
  if (missing.length) {
    throw new Error(`Variáveis de ambiente obrigatórias não definidas: ${missing.join(', ')}`);
  }
}

/** Retorna (ou cria) o cliente SOAP singleton. */
async function getClient() {
  if (_client) return _client;
  validateConfig();
  const wsdlUrl = `${SEI_URL}/sei/controlador_ws.php?servico=sei`;
  _client = await soap.createClientAsync(wsdlUrl);
  return _client;
}

/** Parâmetros de autenticação presentes em todas as chamadas SOAP. */
function auth() {
  return {
    SiglaSistema:         SEI_SISTEMA,
    IdentificacaoServico: SEI_TOKEN,
    IdUnidade:            SEI_UNIDADE,
  };
}

/**
 * Executa uma operação SOAP no SEI e retorna o resultado desembalado.
 * @param {string} operation - Nome exato da operação no WSDL
 * @param {object} [extra]   - Parâmetros adicionais além dos de autenticação
 */
async function seiCall(operation, extra = {}) {
  const client = await getClient();
  const args   = { ...auth(), ...extra };

  if (typeof client[`${operation}Async`] !== 'function') {
    throw new Error(`Operação SOAP '${operation}' não encontrada no WSDL do SEI.`);
  }

  try {
    const [result] = await client[`${operation}Async`](args);
    // O SEI SOAP encapsula arrays em <parametros> e objetos simples em <parametros> tb
    return result?.parametros ?? result?.return ?? result;
  } catch (err) {
    const raw = err.message || '';
    // Traduz erros comuns de configuração do SEI para mensagens mais claras
    if (raw.includes('Nenhuma operação configurada')) {
      const match = raw.match(/para \[(.+?)\] no serviço/);
      const op = match ? match[1] : operation;
      throw new Error(
        `A operação '${op}' não está habilitada para o sistema '${SEI_SISTEMA}' no SEI. ` +
        `Para habilitar: Administração → Sistemas → ${SEI_SISTEMA} → Operações → marque '${op}'.`
      );
    }
    throw err;
  }
}

/**
 * Normaliza arrays retornados pelo SOAP.
 * O node-soap desserializa ArrayOf* em { attributes: {...}, item: [...] } ou
 * diretamente como array nativo. Também lida com item único sem wrapper.
 */
function toArray(val) {
  if (!val) return [];
  // { attributes: {...}, item: [...] } — padrão SOAP-ENC array wrapper
  // ATENÇÃO: verificar 'item' em val além de 'attributes', pois objetos únicos
  // do SOAP também possuem 'attributes' mas NÃO possuem 'item'.
  if (typeof val === 'object' && !Array.isArray(val) && 'attributes' in val && 'item' in val) {
    // item pode ser array (N > 1) ou objeto único (N = 1)
    return toArray(val.item);
  }
  return Array.isArray(val) ? val : [val];
}

/**
 * Normaliza objetos SOAP removendo os wrappers { attributes, $value } gerados
 * pelo node-soap para campos xsi:type. Retorna objetos simples com strings planas.
 */
function flatten(val) {
  if (val === null || val === undefined) return val;
  if (Array.isArray(val)) return val.map(flatten);
  if (typeof val !== 'object') return val;

  // Campo escalar encapsulado: { attributes: {...}, $value: "..." }
  const keys = Object.keys(val);
  if (keys.length === 2 && keys.includes('attributes') && keys.includes('$value')) {
    return val.$value;
  }
  if (keys.length === 1 && keys[0] === '$value') {
    return val.$value;
  }

  // Array SOAP-ENC: { attributes: {...}, item: [...] }
  if ('attributes' in val && 'item' in val) {
    return flatten(val.item);
  }

  // Objeto genérico: processa cada campo, ignora 'attributes'
  const out = {};
  for (const [k, v] of Object.entries(val)) {
    if (k === 'attributes') continue;
    out[k] = flatten(v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Unidades
// ---------------------------------------------------------------------------

/** Lista unidades acessíveis pelo token. */
export async function listarUnidades() {
  // SinExibirUnidadesVinculadas: 'S' retorna a hierarquia completa
  const result = await seiCall('listarUnidades', { SinExibirUnidadesVinculadas: 'S' });
  return flatten(toArray(result));
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Lista tipos de processo (procedimento) disponíveis na unidade. */
export async function listarTiposProcesso() {
  // SinIndividual: '' retorna TODOS os tipos (individual + coletivo)
  // 'S' = só individuais, 'N' = só coletivos, '' = todos
  const result = await seiCall('listarTiposProcedimento', { SinIndividual: '' });
  return flatten(toArray(result));
}

/** Lista séries documentais (tipos de documento) disponíveis na unidade. */
export async function listarTiposDocumento() {
  // Sem IdTipoProcedimento retorna todas as séries disponíveis na unidade
  const result = await seiCall('listarSeries', {});
  return flatten(toArray(result));
}

// ---------------------------------------------------------------------------
// Interessados (Contatos no vocabulário SOAP do SEI)
// ---------------------------------------------------------------------------

/**
 * Lista contatos/interessados cadastrados no SEI.
 * Os registros retornados contêm IdContato, Nome e Sigla — os mesmos campos
 * exigidos pelo campo Interessados ao criar um processo via gerarProcedimento.
 *
 * @param {object} [filtros]
 * @param {string} [filtros.nome]              - Filtro parcial por nome (busca LIKE)
 * @param {string} [filtros.id_tipo_contato]   - ID do tipo de contato para restringir a busca
 * @param {number} [filtros.pagina]            - Página (padrão: 1)
 * @param {number} [filtros.registros_por_pagina] - Registros por página (padrão: 50, máximo aconselhável: 100)
 */
export async function listarInteressados(filtros = {}) {
  const extra = {};

  if (filtros.nome)            extra.Nome            = filtros.nome;
  if (filtros.id_tipo_contato) extra.IdTipoContato   = String(filtros.id_tipo_contato);
  if (filtros.pagina)          extra.Pagina          = String(filtros.pagina ?? 1);
  if (filtros.registros_por_pagina) {
    extra.RegistrosPorPagina = String(filtros.registros_por_pagina);
  }

  const result = await seiCall('listarContatos', extra);
  const contatos = flatten(toArray(result));

  // Normaliza para { id, nome, sigla } para facilitar o uso na criação de processo
  // Filtra registros com campos vazios para evitar que a LLM use dados inválidos
  return contatos
    .map(c => ({
      id:    c.IdContato  ?? c.id    ?? '',
      nome:  c.Nome       ?? c.nome  ?? '',
      sigla: c.Sigla      ?? c.sigla ?? '',
    }))
    .filter(c => c.id && c.nome);
}

// ---------------------------------------------------------------------------
// Processos (Procedimentos no vocabulário SOAP do SEI)
// ---------------------------------------------------------------------------

/**
 * Lista processos da unidade.
 * NOTA: O WebService SOAP do SEI não oferece operação de listagem paginada de
 * processos — apenas consulta individual. Esta função retorna uma mensagem
 * informativa. Para consultar um processo específico, use consultarProcesso().
 */
export async function listarProcessos(filtros = {}) {
  return {
    aviso: 'O WebService SOAP do SEI não suporta listagem de processos. Use consultarProcesso(numero) para consultar um processo específico pelo número ou protocolo.',
    filtros_recebidos: filtros,
  };
}

/**
 * Consulta os detalhes completos de um processo (procedimento).
 * @param {string} protocolo - Número formatado do processo (ex: '00002.123456/2024-01')
 */
export async function consultarProcesso(protocolo) {
  const result = await seiCall('consultarProcedimento', {
    ProtocoloProcedimento:          protocolo,
    SinRetornarAssuntos:            'S',
    SinRetornarAndamentos:          'N',
    SinRetornarDocumentos:          'S',
    SinRetornarUnidadesEnvolvidas:  'S',
    SinRetornarProcedimentosRelacionados: 'N',
    SinRetornarProcedimentosAnexados:     'N',
  });
  return flatten(result);
}

/**
 * Cria um novo processo (procedimento) no SEI.
 * @param {object} dados
 * @param {string} dados.id_tipo_processo  - IdTipoProcedimento (obrigatório)
 * @param {string} dados.especificacao     - Especificação/assunto (obrigatório)
 * @param {string} [dados.nivel_acesso]    - '0'=público, '1'=restrito, '2'=sigiloso
 * @param {string} [dados.hipotese_legal]  - IdHipoteseLegal (necessário se restrito/sigiloso)
 * @param {string[]} [dados.assuntos]      - Array de IdAssunto
 * @param {object[]} [dados.interessados]  - Array de { Nome, Sigla }
 * @param {string} [dados.observacoes]     - Observações internas
 */
export async function criarProcesso(dados) {
  // O tipo complexo Procedimento no WSDL do SEI define os campos no nível raiz:
  //   IdTipoProcedimento (string, obrigatório)
  //   Especificacao      (string, opcional)
  //   NivelAcesso        (string, opcional)
  //   IdHipoteseLegal    (string, opcional)
  //   Assuntos           (ArrayOfAssunto, obrigatório — enviar vazio se não houver)
  //   Interessados       (ArrayOfInteressado, obrigatório — enviar vazio se não houver)
  //   Observacao         (string, opcional)
  //
  // ATENÇÃO: IdTipoProcedimento fica direto no objeto, NÃO aninhado em TipoProcedimento.

  const assuntosArr = toArray(dados.assuntos).map(id => ({ IdAssunto: String(id) }));
  const interessadosArr = toArray(dados.interessados).map(i => ({
    IdContato: String(i.id || i.IdContato || ''),
    Nome:  i.nome || i.Nome || '',
    Sigla: i.sigla || i.Sigla || '',
  }));

  const procedimento = {
    IdTipoProcedimento: String(dados.id_tipo_processo),
    Especificacao:      dados.especificacao ?? '',
    NivelAcesso:        dados.nivel_acesso ?? '0',
    // Assuntos e Interessados são campos obrigatórios do tipo Procedimento
    Assuntos:    assuntosArr.length    ? { item: assuntosArr }     : { item: [] },
    Interessados: interessadosArr.length ? { item: interessadosArr } : { item: [] },
  };

  if (dados.observacoes) {
    procedimento.Observacao = dados.observacoes;
  }

  if (dados.hipotese_legal) {
    procedimento.IdHipoteseLegal = String(dados.hipotese_legal);
  }

  const result = await seiCall('gerarProcedimento', {
    Procedimento: procedimento,
    // Documentos, ProcedimentosRelacionados, UnidadesEnvio são parâmetros opcionais
    // de gerarProcedimento (não são parte de Procedimento)
  });
  return flatten(result);
}

// ---------------------------------------------------------------------------
// Documentos
// ---------------------------------------------------------------------------

/**
 * Lista os documentos de um processo consultando o procedimento completo.
 * @param {string} protocolo - Número do processo
 */
export async function listarDocumentosProcesso(protocolo) {
  const proc = await seiCall('consultarProcedimento', {
    ProtocoloProcedimento:         protocolo,
    SinRetornarAssuntos:           'N',
    SinRetornarAndamentos:         'N',
    SinRetornarDocumentos:         'S',
    SinRetornarUnidadesEnvolvidas: 'N',
    SinRetornarProcedimentosRelacionados: 'N',
    SinRetornarProcedimentosAnexados:     'N',
  });
  return flatten(toArray(proc?.DocumentosProcedimento?.item ?? proc?.DocumentosProcedimento));
}

/**
 * Consulta os metadados e conteúdo de um documento.
 * @param {string} protocoloDocumento - Número/protocolo do documento
 */
export async function consultarDocumento(protocoloDocumento) {
  const result = await seiCall('consultarDocumento', {
    ProtocoloDocumento:   protocoloDocumento,
    SinRetornarAndamentos: 'N',
    SinRetornarAssinaturas: 'S',
    SinRetornarPublicacoes: 'N',
    SinRetornarCampos:      'S',
    SinRetornarDisposicao:  'N',
  });
  return flatten(result);
}

/**
 * Recupera o conteúdo HTML de um documento interno.
 * Usa consultarDocumento — o campo Conteudo contém o HTML em Base64.
 * @param {string} protocoloDocumento - Número/protocolo do documento
 */
export async function conteudoDocumento(protocoloDocumento) {
  const doc = await consultarDocumento(protocoloDocumento);
  const conteudoB64 = doc?.Conteudo;
  if (!conteudoB64) return { conteudo: null, aviso: 'Documento sem conteúdo (pode ser externo/binário).' };
  try {
    return { conteudo: Buffer.from(conteudoB64, 'base64').toString('utf-8') };
  } catch {
    return { conteudo_base64: conteudoB64 };
  }
}

/**
 * Inclui um documento externo em um processo.
 * @param {string} protocolo - Número do processo
 * @param {object} dados
 * @param {string} dados.id_tipo_documento  - IdSerie (tipo de documento)
 * @param {string} dados.nome               - Descrição/nome do documento
 * @param {string} dados.data               - Data (DD/MM/AAAA)
 * @param {string} [dados.nivel_acesso]     - '0'=público, '1'=restrito, '2'=sigiloso
 * @param {string} dados.conteudo_base64    - Conteúdo do arquivo em Base64
 * @param {string} [dados.nome_arquivo]     - Nome do arquivo com extensão (ex: 'arquivo.pdf')
 * @param {string} [dados.remetente]        - Nome do remetente
 */
export async function incluirDocumento(protocolo, dados) {
  const documento = {
    Tipo:                    'R', // R = Recebido (externo)
    ProtocoloProcedimento:   protocolo,
    IdSerie:                 dados.id_tipo_documento,
    Numero:                  dados.nome,
    Data:                    dados.data,
    NivelAcesso:             dados.nivel_acesso ?? '0',
    Remetente:               dados.remetente ? { Nome: dados.remetente } : undefined,
    Conteudo:                dados.conteudo_base64,
    NomeArquivo:             dados.nome_arquivo || 'documento.pdf',
  };

  const result = await seiCall('incluirDocumento', { Documento: documento });
  return flatten(result);
}

// ---------------------------------------------------------------------------
// Utilitários de configuração
// ---------------------------------------------------------------------------

/** Retorna o status da configuração sem expor o token completo. */
export function statusConfiguracao() {
  return {
    sei_url:      SEI_URL      || '(não configurado)',
    sei_unidade:  SEI_UNIDADE  || '(não configurado)',
    sei_sistema:  SEI_SISTEMA,
    sei_token:    SEI_TOKEN
      ? `${SEI_TOKEN.slice(0, 4)}${'*'.repeat(Math.max(0, SEI_TOKEN.length - 8))}${SEI_TOKEN.slice(-4)}`
      : '(não configurado)',
    configurado:  !!(SEI_URL && SEI_TOKEN && SEI_UNIDADE),
    modo:         'SOAP (WebService)',
    wsdl:         SEI_URL ? `${SEI_URL}/sei/controlador_ws.php?servico=sei` : null,
  };
}
