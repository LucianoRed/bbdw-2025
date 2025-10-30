import https from 'https';

// Env vars
export const K8S_API_URL = process.env.K8S_API_URL;
export const K8S_BEARER_TOKEN = process.env.K8S_BEARER_TOKEN;
export const K8S_SKIP_TLS_VERIFY = (process.env.K8S_SKIP_TLS_VERIFY || '').toLowerCase() === 'true';

if (!K8S_API_URL || !K8S_BEARER_TOKEN) {
  // Não encerramos o processo para permitir handshake MCP; a ferramenta retornará erro amigável
  console.warn('K8S_API_URL e K8S_BEARER_TOKEN não definidos. Defina-os no ambiente do servidor MCP.');
}

// GET JSON
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

// GET bruto (texto) — útil para endpoints como /log
export async function k8sGetRaw(path, { optional = false } = {}) {
  if (!K8S_API_URL || !K8S_BEARER_TOKEN) {
    if (optional) return '';
    const err = new Error('Defina K8S_API_URL e K8S_BEARER_TOKEN no ambiente do servidor MCP.');
    err.statusCode = 500;
    throw err;
  }
  const url = `${K8S_API_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  const baseHeaders = { 'Authorization': `Bearer ${K8S_BEARER_TOKEN}` };
  const agent = new https.Agent({ rejectUnauthorized: !K8S_SKIP_TLS_VERIFY });
  async function tryOnce(customHeaders) {
    return await new Promise((resolve, reject) => {
      const req = https.request(url, { method: 'GET', headers: customHeaders, agent }, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const err = new Error(`Falha HTTP ${res.statusCode} em ${path}`);
            err.statusCode = res.statusCode;
            return reject(err);
          }
          resolve(data);
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
  const attempts = [
    { Accept: 'text/plain; charset=utf-8, */*' },
    { Accept: '*/*' },
    {},
  ];
  let lastErr = null;
  for (const add of attempts) {
    const headers = { ...baseHeaders, ...(add.Accept ? { Accept: add.Accept } : {}) };
    try { return await tryOnce(headers); } catch (e) {
      if (e?.statusCode !== 406) { if (optional) return ''; throw e; }
      lastErr = e;
    }
  }
  if (optional) return '';
  throw lastErr || new Error('Falha ao obter dados brutos.');
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
        try { resolve(data ? JSON.parse(data) : {}); }
        catch { resolve({}); }
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
        try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
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
