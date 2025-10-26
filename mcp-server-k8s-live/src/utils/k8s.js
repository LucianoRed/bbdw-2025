import https from 'https';

// Env vars
export const K8S_API_URL = process.env.K8S_API_URL;
export const K8S_BEARER_TOKEN = process.env.K8S_BEARER_TOKEN;
export const K8S_SKIP_TLS_VERIFY = (process.env.K8S_SKIP_TLS_VERIFY || '').toLowerCase() === 'true';

if (!K8S_API_URL || !K8S_BEARER_TOKEN) {
  // Não encerramos o processo para permitir handshake MCP; a ferramenta retornará erro amigável
  console.warn('K8S_API_URL e K8S_BEARER_TOKEN não definidos. Defina-os no ambiente do servidor MCP.');
}

// Helpers de parse (equivalentes ao PHP)
export function parseCpuMillicores(v) {
  if (v == null || v === '') return 0;
  const s = String(v).trim();
  if (s.endsWith('m')) return parseInt(s.slice(0, -1), 10) || 0;
  if (s.endsWith('n')) {
    const n = parseFloat(s.slice(0, -1));
    return Math.round(n / 1_000_000.0);
  }
  if (!isNaN(Number(s))) return Math.round(Number(s) * 1000);
  return 0;
}

export function parseMemBytes(v) {
  if (v == null || v === '') return 0;
  const s = String(v).trim();
  const map = new Map([
    ['Ki', 1024],
    ['Mi', 1024 * 1024],
    ['Gi', 1024 * 1024 * 1024],
    ['Ti', 1024 * 1024 * 1024 * 1024],
    ['Pi', 1024 * 1024 * 1024 * 1024 * 1024],
    ['k', 1000],
    ['M', 1000 * 1000],
    ['G', 1000 * 1000 * 1000],
  ]);
  for (const [suf, mul] of map.entries()) {
    if (s.endsWith(suf)) {
      const num = parseFloat(s.slice(0, -suf.length));
      return Math.round(num * mul);
    }
  }
  if (!isNaN(Number(s))) return Math.round(Number(s));
  return 0;
}

export function bytesToMiB(b) { return Math.round(b / (1024 * 1024)); }

// HTTP helpers para API do Kubernetes
export async function k8sGet(path, { optional = false } = {}) {
  if (!K8S_API_URL || !K8S_BEARER_TOKEN) {
    if (optional) return null;
    const err = new Error('Defina K8S_API_URL e K8S_BEARER_TOKEN no ambiente do servidor MCP.');
    err.statusCode = 500;
    throw err;
  }
  const url = `${K8S_API_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  const headers = {
    'Accept': 'application/json',
    'Authorization': `Bearer ${K8S_BEARER_TOKEN}`,
  };
  const agent = new https.Agent({ rejectUnauthorized: !K8S_SKIP_TLS_VERIFY });
  return await new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', headers, agent }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          if (optional) return resolve(null);
          const err = new Error(`Falha HTTP ${res.statusCode} em ${path}`);
          err.statusCode = res.statusCode;
          return reject(err);
        }
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          if (optional) return resolve(null);
          const err = new Error('Resposta inválida da API Kubernetes.');
          err.statusCode = 500;
          reject(err);
        }
      });
    });
    req.on('error', (e) => {
      if (optional) return resolve(null);
      const err = new Error(`Erro ao consultar API: ${e.message}`);
      err.statusCode = 502;
      reject(err);
    });
    req.end();
  });
}

export async function k8sPost(path, body) {
  if (!K8S_API_URL || !K8S_BEARER_TOKEN) {
    const err = new Error('Defina K8S_API_URL e K8S_BEARER_TOKEN no ambiente do servidor MCP.');
    err.statusCode = 500;
    throw err;
  }
  const url = `${K8S_API_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${K8S_BEARER_TOKEN}`,
  };
  const agent = new https.Agent({ rejectUnauthorized: !K8S_SKIP_TLS_VERIFY });
  return await new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'POST', headers, agent }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const err = new Error(`Falha HTTP ${res.statusCode} em ${path}: ${data}`);
          err.statusCode = res.statusCode;
          return reject(err);
        }
        try {
          const json = data ? JSON.parse(data) : {};
          resolve(json);
        } catch (e) {
          const err = new Error('Resposta inválida da API Kubernetes.');
          err.statusCode = 500;
          reject(err);
        }
      });
    });
    req.on('error', (e) => {
      const err = new Error(`Erro ao consultar API: ${e.message}`);
      err.statusCode = 502;
      reject(err);
    });
    req.write(JSON.stringify(body));
    req.end();
  });
}

export async function k8sDelete(path) {
  if (!K8S_API_URL || !K8S_BEARER_TOKEN) {
    const err = new Error('Defina K8S_API_URL e K8S_BEARER_TOKEN no ambiente do servidor MCP.');
    err.statusCode = 500;
    throw err;
  }
  const url = `${K8S_API_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  const headers = {
    'Accept': 'application/json',
    'Authorization': `Bearer ${K8S_BEARER_TOKEN}`,
  };
  const agent = new https.Agent({ rejectUnauthorized: !K8S_SKIP_TLS_VERIFY });
  return await new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'DELETE', headers, agent }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const err = new Error(`Falha HTTP ${res.statusCode} em ${path}: ${data}`);
          err.statusCode = res.statusCode;
          return reject(err);
        }
        try {
          const json = data ? JSON.parse(data) : {};
          resolve(json);
        } catch (e) {
          // Alguns deletes podem não retornar JSON
          resolve({});
        }
      });
    });
    req.on('error', (e) => {
      const err = new Error(`Erro ao consultar API: ${e.message}`);
      err.statusCode = 502;
      reject(err);
    });
    req.end();
  });
}
