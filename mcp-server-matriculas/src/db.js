import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, '..', 'data', 'students.json');

// Dados iniciais (10 alunos)
const INITIAL_DATA = [
  { id: 1, name: "Ana Silva", dob: "15/03/2008", year: "2º Ano Ensino Médio" },
  { id: 2, name: "Bruno Santos", dob: "22/07/2009", year: "1º Ano Ensino Médio" },
  { id: 3, name: "Carla Oliveira", dob: "10/11/2010", year: "9º Ano Ensino Fundamental" },
  { id: 4, name: "Daniel Costa", dob: "05/01/2008", year: "2º Ano Ensino Médio" },
  { id: 5, name: "Eduarda Lima", dob: "30/09/2007", year: "3º Ano Ensino Médio" },
  { id: 6, name: "Felipe Pereira", dob: "12/04/2009", year: "1º Ano Ensino Médio" },
  { id: 7, name: "Gabriela Souza", dob: "18/08/2010", year: "9º Ano Ensino Fundamental" },
  { id: 8, name: "Henrique Alves", dob: "25/12/2008", year: "2º Ano Ensino Médio" },
  { id: 9, name: "Isabela Martins", dob: "03/06/2007", year: "3º Ano Ensino Médio" },
  { id: 10, name: "João Ferreira", dob: "14/02/2011", year: "8º Ano Ensino Fundamental" }
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
