import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, '..', 'data', 'health-records.json');

// Lista de doenças comuns que requerem atenção escolar
export const COMMON_DISEASES = [
  "Diabetes Tipo 1",
  "Asma",
  "Alergia Alimentar",
  "Doença Celíaca",
  "TDAH",
  "Epilepsia",
  "Anemia Falciforme",
  "Deficiência de Lactose",
  "Rinite Alérgica",
  "Hipertensão"
];

// Dados iniciais - alguns alunos da lista de matrículas com condições de saúde
const INITIAL_DATA = [
  { 
    id: 1, 
    studentName: "Ana Silva", 
    cpf: "123.456.789-01", 
    diseases: ["Diabetes Tipo 1"], 
    medications: "Insulina",
    observations: "Necessita monitoramento de glicose antes e depois das refeições",
    emergencyContact: "(11) 98765-4321"
  },
  { 
    id: 2, 
    studentName: "Bruno Santos", 
    cpf: "234.567.890-12", 
    diseases: ["Asma"], 
    medications: "Bombinha (Salbutamol)",
    observations: "Pode ter crises durante atividades físicas intensas",
    emergencyContact: "(11) 98765-4322"
  },
  { 
    id: 3, 
    studentName: "Daniel Costa", 
    cpf: "456.789.012-34", 
    diseases: ["Alergia Alimentar", "Rinite Alérgica"], 
    medications: "Antialérgico (Loratadina)",
    observations: "Alergia a amendoim e frutos do mar. Evitar exposição a pólen",
    emergencyContact: "(11) 98765-4323"
  },
  { 
    id: 4, 
    studentName: "Eduarda Lima", 
    cpf: "567.890.123-45", 
    diseases: ["Doença Celíaca"], 
    medications: "Nenhum",
    observations: "Dieta estritamente sem glúten",
    emergencyContact: "(11) 98765-4324"
  },
  { 
    id: 5, 
    studentName: "Felipe Pereira", 
    cpf: "678.901.234-56", 
    diseases: ["TDAH"], 
    medications: "Ritalina",
    observations: "Necessita acompanhamento pedagógico especializado",
    emergencyContact: "(11) 98765-4325"
  },
  { 
    id: 6, 
    studentName: "Henrique Alves", 
    cpf: "890.123.456-78", 
    diseases: ["Epilepsia"], 
    medications: "Carbamazepina",
    observations: "Em caso de convulsão, posicionar de lado e chamar emergência",
    emergencyContact: "(11) 98765-4326"
  },
  { 
    id: 7, 
    studentName: "Isabela Martins", 
    cpf: "901.234.567-89", 
    diseases: ["Deficiência de Lactose"], 
    medications: "Lactase",
    observations: "Evitar produtos lácteos na merenda",
    emergencyContact: "(11) 98765-4327"
  }
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
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error("Erro ao salvar dados:", error);
  }
}

const db = {
  getAll: () => loadData(),
  
  add: (record) => {
    const data = loadData();
    const newId = data.length > 0 ? Math.max(...data.map(r => r.id)) + 1 : 1;
    const newRecord = { id: newId, ...record };
    data.push(newRecord);
    saveData(data);
    return newRecord;
  },

  searchByCpf: (cpf) => {
    const data = loadData();
    return data.filter(r => r.cpf === cpf);
  },

  search: (query) => {
    const data = loadData();
    const lowerQuery = query.toLowerCase();
    return data.filter(r => 
      r.studentName.toLowerCase().includes(lowerQuery) ||
      r.cpf.includes(query)
    );
  }
};

export default db;
