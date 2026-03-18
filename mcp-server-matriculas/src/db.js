import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, '..', 'data', 'students.json');

export const ALLOWED_YEARS = [5, 6, 7, 8];

// Lista fixa de escolas (dados estáticos, não dependem de arquivo externo)
const SCHOOLS_DATA = [
  {
    id: 1,
    nome: "E.M. Santos Dumont",
    bairro: "Centro",
    endereco: "Rua Santos Dumont, 100 - Centro",
    telefone: "(11) 3300-1000",
    necessidadesEspeciais: ["TDAH", "autismo"],
    descricao: "Escola com equipe multidisciplinar especializada em inclusão, atendendo alunos com TDAH e autismo com salas de recurso e acompanhamento psicopedagógico."
  },
  {
    id: 2,
    nome: "E.M. José de Anchieta",
    bairro: "Centro",
    endereco: "Av. Central, 250 - Centro",
    telefone: "(11) 3300-1200",
    necessidadesEspeciais: [],
    descricao: "Escola tradicional do centro com ampla infraestrutura, laboratórios de ciências e informática."
  },
  {
    id: 3,
    nome: "E.M. Monteiro Lobato",
    bairro: "Vila Nova",
    endereco: "Rua das Flores, 45 - Vila Nova",
    telefone: "(11) 3400-2000",
    necessidadesEspeciais: ["TDAH", "dislexia"],
    descricao: "Referência em educação inclusiva com programa especial para alunos com TDAH e dislexia, incluindo tutores individuais e turmas reduzidas."
  },
  {
    id: 4,
    nome: "E.M. Rui Barbosa",
    bairro: "Vila Nova",
    endereco: "Rua das Acácias, 78 - Vila Nova",
    telefone: "(11) 3400-2200",
    necessidadesEspeciais: [],
    descricao: "Escola focada em esportes e artes, com quadra poliesportiva e sala de música."
  },
  {
    id: 5,
    nome: "E.M. Cecília Meireles",
    bairro: "Bela Vista",
    endereco: "Rua da Paz, 300 - Bela Vista",
    telefone: "(11) 3500-3000",
    necessidadesEspeciais: ["TDAH", "dislexia", "deficiência visual"],
    descricao: "Escola modelo em acessibilidade com salas adaptadas, material em braile e equipe especializada para TDAH e dislexia."
  },
  {
    id: 6,
    nome: "E.M. Anísio Teixeira",
    bairro: "Bela Vista",
    endereco: "Av. das Palmeiras, 120 - Bela Vista",
    telefone: "(11) 3500-3300",
    necessidadesEspeciais: [],
    descricao: "Escola integral com atividades extracurriculares diversificadas e excelência acadêmica."
  },
  {
    id: 7,
    nome: "E.M. Paulo Freire",
    bairro: "Jardim América",
    endereco: "Rua Esperança, 55 - Jardim América",
    telefone: "(11) 3600-4000",
    necessidadesEspeciais: ["TDAH", "deficiência auditiva"],
    descricao: "Escola inclusiva com intérprete de Libras e programa pedagógico adaptado para TDAH com turmas reduzidas."
  },
  {
    id: 8,
    nome: "E.M. Tiradentes",
    bairro: "Parque Industrial",
    endereco: "Av. Industrial, 1500 - Parque Industrial",
    telefone: "(11) 3700-5000",
    necessidadesEspeciais: [],
    descricao: "Escola com foco em tecnologia e preparação para o mercado de trabalho, com laboratórios modernos."
  },
  {
    id: 9,
    nome: "E.M. Florestan Fernandes",
    bairro: "Santa Cruz",
    endereco: "Rua Santa Luzia, 200 - Santa Cruz",
    telefone: "(11) 3800-6000",
    necessidadesEspeciais: ["TDAH", "autismo"],
    descricao: "Escola com AEE (Atendimento Educacional Especializado) e parceria com clínicas de saúde mental para suporte a alunos com TDAH e autismo."
  },
  {
    id: 10,
    nome: "E.M. Maria Montessori",
    bairro: "Boa Esperança",
    endereco: "Rua das Orquídeas, 88 - Boa Esperança",
    telefone: "(11) 3900-7000",
    necessidadesEspeciais: ["TDAH", "dislexia", "deficiência auditiva"],
    descricao: "Escola com metodologia ativa e equipe de psicopedagogos especializados em necessidades educacionais especiais diversas."
  },
  {
    id: 11,
    nome: "E.M. Zumbi dos Palmares",
    bairro: "Morada do Sol",
    endereco: "Av. Morada do Sol, 350 - Morada do Sol",
    telefone: "(11) 4000-8000",
    necessidadesEspeciais: [],
    descricao: "Escola com forte cultura de diversidade e inclusão social, com projetos comunitários e espaço de leitura."
  }
];

// Dados iniciais (10 alunos)
const INITIAL_DATA = [
  { id: 1, name: "Ana Silva", cpf: "123.456.789-01", dob: "15/03/2013", year: 7 },
  { id: 2, name: "Bruno Santos", cpf: "234.567.890-12", dob: "22/07/2014", year: 6 },
  { id: 3, name: "Carla Oliveira", cpf: "345.678.901-23", dob: "10/11/2012", year: 8 },
  { id: 4, name: "Daniel Costa", cpf: "456.789.012-34", dob: "05/01/2015", year: 5 },
  { id: 5, name: "Eduarda Lima", cpf: "567.890.123-45", dob: "30/09/2013", year: 7 },
  { id: 6, name: "Felipe Pereira", cpf: "678.901.234-56", dob: "12/04/2014", year: 6 },
  { id: 7, name: "Gabriela Souza", cpf: "789.012.345-67", dob: "18/08/2015", year: 5 },
  { id: 8, name: "Henrique Alves", cpf: "890.123.456-78", dob: "25/12/2012", year: 8 },
  { id: 9, name: "Isabela Martins", cpf: "901.234.567-89", dob: "03/06/2015", year: 5 },
  { id: 10, name: "João Ferreira", cpf: "012.345.678-90", dob: "14/02/2013", year: 7 }
];

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      saveData(INITIAL_DATA);
      return INITIAL_DATA;
    }
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error("Erro ao carregar dados:", error);
    return [];
  }
}

function saveData(data) {
  try {
    // Garante que o diretorio existe
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error("Erro ao salvar dados:", error);
  }
}

export const schools = {
  getAll: () => SCHOOLS_DATA,

  getById: (id) => {
    return SCHOOLS_DATA.find(s => s.id === Number(id)) || null;
  },

  getBySpecialNeed: (need) => {
    const lowerNeed = need.toLowerCase();
    return SCHOOLS_DATA.filter(s =>
      s.necessidadesEspeciais.some(n => n.toLowerCase().includes(lowerNeed))
    );
  },

  getByBairro: (bairro) => {
    const lowerBairro = bairro.toLowerCase();
    return SCHOOLS_DATA.filter(s => s.bairro.toLowerCase().includes(lowerBairro));
  }
};

const db = {
  getAll: () => loadData(),
  
  add: (student) => {
    const data = loadData();
    const newId = data.length > 0 ? Math.max(...data.map(s => s.id)) + 1 : 1;
    const newStudent = { id: newId, ...student };
    data.push(newStudent);
    saveData(data);
    return newStudent;
  },

  search: (query) => {
    const data = loadData();
    const lowerQuery = query.toLowerCase();
    return data.filter(s => s.name.toLowerCase().includes(lowerQuery));
  }
};

export default db;
