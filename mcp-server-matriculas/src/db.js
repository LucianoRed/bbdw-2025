import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, '..', 'data', 'students.json');

export const ALLOWED_YEARS = [5, 6, 7, 8];

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
