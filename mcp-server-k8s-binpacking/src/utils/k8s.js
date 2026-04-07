import https from 'https';

export const K8S_API_URL = process.env.K8S_API_URL;
export const K8S_BEARER_TOKEN = process.env.K8S_BEARER_TOKEN;
export const K8S_SKIP_TLS_VERIFY = (process.env.K8S_SKIP_TLS_VERIFY || '').toLowerCase() === 'true';

if (!K8S_API_URL || !K8S_BEARER_TOKEN) {
  console.warn('K8S_API_URL e K8S_BEARER_TOKEN nao definidos. Defina-os no ambiente do servidor MCP.');
}

export function parseCpuMillicores(v) {
  if (v == null || v === '') return 0;
  const s = String(v).trim();
  if (s.endsWith('m')) return parseInt(s.slice(0, -1), 10) || 0;
  if (s.endsWith('n')) {
    const n = parseFloat(s.slice(0, -1));
    return Math.round(n / 1_000_000);
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
  for (const [suffix, multiplier] of map.entries()) {
    if (s.endsWith(suffix)) {
      const num = parseFloat(s.slice(0, -suffix.length));
      return Math.round(num * multiplier);
    }
  }
  if (!isNaN(Number(s))) return Math.round(Number(s));
  return 0;
}

export function bytesToMiB(bytes) {
  return Math.round(bytes / (1024 * 1024));
}

export function bytesToGiB(bytes) {
  return Math.round((bytes / (1024 * 1024 * 1024)) * 100) / 100;
}

export function millicoresToCores(millicores) {
  return Math.round((millicores / 1000) * 100) / 100;
}

export function percent(used, total) {
  if (!total) return 0;
  return Math.round((used / total) * 1000) / 10;
}

export async function k8sGet(path, { optional = false } = {}) {
  if (!K8S_API_URL || !K8S_BEARER_TOKEN) {
    if (optional) return null;
    const err = new Error('Defina K8S_API_URL e K8S_BEARER_TOKEN no ambiente do servidor MCP.');
    err.statusCode = 500;
    throw err;
  }

  const url = `${K8S_API_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${K8S_BEARER_TOKEN}`,
  };
  const agent = new https.Agent({ rejectUnauthorized: !K8S_SKIP_TLS_VERIFY });

  return await new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', headers, agent }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if ((res.statusCode || 500) < 200 || (res.statusCode || 500) >= 300) {
          if (optional) return resolve(null);
          const err = new Error(`Falha HTTP ${res.statusCode} em ${path}`);
          err.statusCode = res.statusCode;
          return reject(err);
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          if (optional) return resolve(null);
          const err = new Error('Resposta invalida da API Kubernetes.');
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
