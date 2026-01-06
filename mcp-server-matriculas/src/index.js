import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import db from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuração do Servidor Express (Web UI + MCP SSE) ---
const app = express();
const HTTP_PORT = process.env.PORT || 3000;

app.use(cors());

// NOTA: body-parser.json() pode interferir na leitura manual do body do MCP se não configurado corretamente para rotas específicas.
// Para simplificar, usamos express.json() globalmente, mas para o SSE pode ser necessário cuidado.
// No caso da SDK do MCP, o handlePostMessage espera req/res crus do Node.js, ou compatíveis.
// O endpoint /messages do Express precisa lidar com isso.

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json()); // Para a API REST da Web UI

// --- API Endpoints para a interface Web ---
app.get('/api/students', (req, res) => {
  const query = req.query.q;
  if (query) {
    res.json(db.search(query));
  } else {
    res.json(db.getAll());
  }
});

app.post('/api/students', (req, res) => {
  const { name, dob, year } = req.body;
  if (!name || !dob || !year) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }
  const newStudent = db.add({ name, dob, year });
  res.status(201).json(newStudent);
});

// --- Configuração do Servidor MCP ---
const server = new Server(
  {
    name: "mcp-server-matriculas",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// Definição das Ferramentas
const TOOLS = [
  {
    name: "listar_alunos",
    description: "Lista todos os alunos matriculados no sistema.",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "matricular_aluno",
    description: "Realiza a matrícula de um novo aluno.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nome completo do aluno" },
        dob: { type: "string", description: "Data de nascimento (DD/MM/AAAA)" },
        year: { type: "string", description: "Ano ou série desejada (ex: '2º Ano Ensino Médio')" }
      },
      required: ["name", "dob", "year"]
    }
  },
  {
    name: "buscar_aluno",
    description: "Busca alunos pelo nome.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Nome ou parte do nome para busca" }
      },
      required: ["query"]
    }
  }
];

// Handler para listar ferramentas
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handler para executar ferramentas
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "listar_alunos": {
        const students = db.getAll();
        return {
          content: [{
            type: "text",
            text: JSON.stringify(students, null, 2)
          }]
        };
      }
      case "matricular_aluno": {
        const { name, dob, year } = args;
        if (!name || !dob || !year) {
           throw new Error("Parâmetros 'name', 'dob' e 'year' são obrigatórios.");
        }
        const student = db.add({ name, dob, year });
        return {
          content: [{
            type: "text",
            text: `Aluno matriculado com sucesso: ID ${student.id} - ${student.name}`
          }]
        };
      }
      case "buscar_aluno": {
        const { query } = args;
        if (!query) {
           throw new Error("Parâmetro 'query' é obrigatório.");
        }
        const results = db.search(query);
        if (results.length === 0) {
          return {
            content: [{ type: "text", text: "Nenhum aluno encontrado." }]
          };
        }
        return {
          content: [{
            type: "text",
            text: JSON.stringify(results, null, 2)
          }]
        };
      }
      default:
        return {
           content: [{ type: "text", text: `Ferramenta não encontrada: ${name}` }],
           isError: true
        };
    }
  } catch (error) {
    return {
      content: [{ type: "text", text: `Erro ao executar ferramenta: ${error.message}` }],
      isError: true
    };
  }
});

// --- MCP SSE Transport Configuration ---
let transport; // Variável para armazenar o transporte SSE ativo (simplificado, para multi-sessão real precisaria de um Map)

app.get('/sse', async (req, res) => {
    console.log("Nova conexão SSE recebida");
    transport = new SSEServerTransport("/messages", res);
    await server.connect(transport);
});

app.post('/messages', async (req, res) => {
    console.log("Nova mensagem recebida no endpoint /messages");
    if (transport) {
      await transport.handlePostMessage(req, res);
    } else {
      res.status(404).json({ error: "Session not found" });
    }
});

// Inicia o servidor HTTP
app.listen(HTTP_PORT, () => {
  console.error(`Server running at http://localhost:${HTTP_PORT}`);
  console.error(`Web Interface: http://localhost:${HTTP_PORT}`);
  console.error(`MCP SSE Endpoint: http://localhost:${HTTP_PORT}/sse`);
});
