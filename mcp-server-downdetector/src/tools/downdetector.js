import axios from 'axios';
import * as cheerio from 'cheerio';

export const downdetectorTool = {
  name: "downdetector",
  description: "Verifica o status de serviços e websites usando dados do Downdetector (ex: Netflix, Steam, Instagram)",
  inputSchema: {
    type: "object",
    properties: {
      serviceName: {
        type: "string",
        description: "Nome do serviço (ex: 'netflix', 'steam', 'twitter')"
      },
      domain: {
        type: "string",
        description: "Domínio do Downdetector (padrão: 'com', opções: 'com.br', 'uk', 'fr', etc.)",
        default: "com"
      }
    },
    required: ["serviceName"]
  },
  handler: async (args) => {
    const service = args.serviceName.toLowerCase().replace(/\s+/g, '');
    const domain = args.domain || 'com';
    const baseUrl = `https://downdetector.${domain}/status/${service}/`;

    try {
      // User-Agent é importante para evitar bloqueios simples
      const response = await axios.get(baseUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const $ = cheerio.load(response.data);
      
      // Extração de dados (seletores podem variar, tentando ser genérico)
      const title = $('h1').first().text().trim();
      const statusText = $('.indicator-title').text().trim() || 
                         $('.entry-title').text().trim() ||
                         $('div[class*="status-"]').text().trim();
      
      // Tenta encontrar o número de problemas
      const problemText = $('.h2').text().trim() || ''; // Às vezes aparece como "User reports indicate..."

      // Verifica classes de status
      let status = "UNKNOWN";
      if ($('.indicator-success').length > 0 || statusText.toLowerCase().includes('no problems')) {
        status = "UP";
      } else if ($('.indicator-danger').length > 0 || $('.indicator-warning').length > 0 || statusText.toLowerCase().includes('problems')) {
        status = "DOWN/ISSUES";
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            service: service,
            url: baseUrl,
            status: status,
            details: statusText || problemText || "Não foi possível extrair detalhes exatos.",
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };

    } catch (error) {
      if (error.response && error.response.status === 404) {
        return {
          content: [{
            type: "text",
            text: `Serviço '${service}' não encontrado no Downdetector (${baseUrl}). Verifique o nome.`
          }],
          isError: true
        };
      }
      return {
        content: [{
          type: "text",
          text: `Erro ao acessar Downdetector: ${error.message}`
        }],
        isError: true
      };
    }
  }
};
