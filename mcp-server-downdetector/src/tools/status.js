import axios from 'axios';

export const checkStatusTool = {
  name: "check_status",
  description: "Verifica o status de um website ou serviço (UP/DOWN, latência, código de status)",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL do serviço a ser verificado (ex: https://google.com)"
      },
      timeout: {
        type: "number",
        description: "Timeout em milissegundos (padrão: 5000)"
      }
    },
    required: ["url"]
  },
  handler: async (args) => {
    const url = args.url.startsWith('http') ? args.url : `https://${args.url}`;
    const timeout = args.timeout || 5000;
    
    const start = Date.now();
    try {
      const response = await axios.get(url, { 
        timeout,
        validateStatus: () => true // Não lança erro para status != 2xx
      });
      const latency = Date.now() - start;
      
      const isUp = response.status >= 200 && response.status < 300;
      const statusText = isUp ? "UP" : (response.status >= 500 ? "DOWN" : "WARN");

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            url,
            status: statusText,
            statusCode: response.status,
            latencyMs: latency,
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };
    } catch (error) {
      const latency = Date.now() - start;
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            url,
            status: "DOWN",
            error: error.message,
            latencyMs: latency,
            timestamp: new Date().toISOString()
          }, null, 2)
        }],
        isError: true
      };
    }
  }
};
