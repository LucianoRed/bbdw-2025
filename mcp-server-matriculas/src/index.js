import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import db from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuração do Servidor Express (Web UI) ---
const app = express();
const HTTP_PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Endpoints para a interface Web
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

// Inicia o servidor HTTP em background
app.listen(HTTP_PORT, () => {
  // Log apenas para stderr para não poluir o stdout usado pelo MCP
  console.error(`Web interface running at http://localhost:${HTTP_PORT}`);
});

// --- Configuração do Servidor MCP ---
const server = new McpServer({
  name: "mcp-server-matriculas",
  version: "1.0.0"
});

// Tool: Listar Alunos
server.tool(
  "listar_alunos",
  "Lista todos os alunos matriculados no sistema.",
  {},
  async () => {
    const students = db.getAll();
    return {
      content: [{
        type: "text",
        text: JSON.stringify(students, null, 2)
      }]
    };
  }
);

// Tool: Matricular Aluno
server.tool(
  "matricular_aluno",
  "Realiza a matrícula de um novo aluno.",
  {
    name: z.string().describe("Nome completo do aluno"),
    dob: z.string().describe("Data de nascimento (DD/MM/AAAA)"),
    year: z.string().describe("Ano ou série desejada (ex: '2º Ano Ensino Médio')")
  },
  async ({ name, dob, year }) => {
    const student = db.add({ name, dob, year });
    return {
      content: [{
        type: "text",
        text: `Aluno matriculado com sucesso: ID ${student.id} - ${student.name}`
      }]
    };
  }
);

// Tool: Buscar Aluno
server.tool(
  "buscar_aluno",
  "Busca alunos pelo nome.",
  {
    query: z.string().describe("Nome ou parte do nome para busca")
  },
  async ({ query }) => {
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
);

// Conecta o transporte via Stdio
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Server running on Stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
