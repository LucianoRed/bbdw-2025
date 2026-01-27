# MCP Server - Sistema de Saúde Escolar

Sistema de gerenciamento de registros de saúde dos alunos com suporte a Model Context Protocol (MCP).

## Funcionalidades

- Registro de condições de saúde dos alunos
- Vinculação com alunos através do CPF
- Lista de doenças comuns que requerem atenção escolar
- Interface web moderna
- API REST
- Suporte a MCP (STDIO e SSE)

## Doenças Monitoradas

1. Diabetes Tipo 1
2. Asma
3. Alergia Alimentar
4. Doença Celíaca
5. TDAH
6. Epilepsia
7. Anemia Falciforme
8. Deficiência de Lactose
9. Rinite Alérgica
10. Hipertensão

## Como usar

```bash
npm install
npm start
```

A aplicação estará disponível em `http://localhost:3001`

## Ferramentas MCP

- `listar_registros_saude`: Lista todos os registros de saúde
- `adicionar_registro_saude`: Adiciona novo registro de saúde
- `buscar_registro_por_cpf`: Busca registro pelo CPF do aluno
