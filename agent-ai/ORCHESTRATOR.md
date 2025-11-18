# 🎯 Agente Orquestrador

Sistema de orquestração inteligente que analisa mensagens do usuário e delega automaticamente para o agente especializado mais apropriado.

## 📋 Visão Geral

O Agente Orquestrador funciona como um "despachante inteligente" que:

1. **Analisa** a mensagem do usuário para identificar a intenção
2. **Decide** qual especialista deve responder (K8s, Documentação, Troubleshooting, Geral)
3. **Delega** automaticamente para o agente apropriado
4. **Configura** automaticamente MCP e RAG baseado no tipo de pergunta

## 🏗️ Arquitetura

```
┌─────────────────┐
│     Usuário     │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│    ChatResource         │
│  (useOrchestrator=true) │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  OrchestratorService    │
│  - Coordena execução    │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│   OrchestratorAgent     │
│   - Analisa mensagem    │
│   - Retorna decisão     │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│           Especialistas                      │
│  ┌──────────┬──────────┬──────────┬───────┐│
│  │K8s Agent │ RAG Agent│Troublesh.│General││
│  └──────────┴──────────┴──────────┴───────┘│
└─────────────────────────────────────────────┘
```

## 🎓 Especialistas Disponíveis

### 1. K8S_CLUSTER 🔧
**Quando usar**: Consultas sobre estado atual do cluster

**Exemplos**:
- "Quantos pods estão rodando?"
- "Status dos deployments no namespace default"
- "Mostrar logs do pod nginx"
- "Listar eventos recentes"

**Configuração**: `useMcp: true`, `useRag: false`

---

### 2. DOCUMENTATION 📚
**Quando usar**: Perguntas conceituais, configurações, boas práticas

**Exemplos**:
- "Como criar um deployment no Kubernetes?"
- "O que é um Service?"
- "Boas práticas para configurar recursos"
- "Como funciona o rolling update?"

**Configuração**: `useMcp: false`, `useRag: true`

---

### 3. TROUBLESHOOTING 🔍
**Quando usar**: Análise de problemas, debugging, investigação de erros

**Exemplos**:
- "Meu pod está com status CrashLoopBackOff"
- "Por que não consigo acessar minha aplicação?"
- "Erro ImagePullBackOff, o que fazer?"
- "Como investigar problema de networking?"

**Configuração**: `useMcp: true`, `useRag: true` (usa ambos!)

---

### 4. GENERAL 💬
**Quando usar**: Cumprimentos, perguntas genéricas, conversas casuais

**Exemplos**:
- "Olá!"
- "Quem é você?"
- "O que você pode fazer?"
- "Me conte uma piada"

**Configuração**: `useMcp: false`, `useRag: false`

---

## 🚀 Como Usar

### Via Interface Web

1. Acesse a interface web
2. Ative o toggle **🎯 Orquestrador** na sidebar
3. Faça sua pergunta normalmente
4. O orquestrador decidirá automaticamente qual agente usar

**Dica**: Quando o orquestrador está ativo, os toggles MCP e RAG são ignorados (o orquestrador decide automaticamente).

### Via API REST

```bash
curl -X POST http://localhost:8080/chat/message \
  -H "Content-Type: application/json" \
  -d '{
    "message": "quantos pods estão rodando?",
    "sessionId": "user-123",
    "useOrchestrator": true,
    "model": "gpt-4o-mini"
  }'
```

### Resposta com Feedback

O orquestrador adiciona um footer na resposta indicando qual especialista foi usado:

```markdown
[Resposta do agente...]

---
*🔧 Respondido pelo especialista em Cluster K8s*
```

## 🔧 Configuração

### application.properties

```properties
# Orchestrator Agent (usa modelo rápido para decisões)
quarkus.langchain4j.orchestrator-model.chat-model.provider=openai
quarkus.langchain4j.openai.orchestrator-model.chat-model.model-name=gpt-4o-mini
quarkus.langchain4j.openai.orchestrator-model.chat-model.temperature=0.3
quarkus.langchain4j.openai.orchestrator-model.api-key=${openai.key}
quarkus.langchain4j.openai.orchestrator-model.organization-id=${openai.org.id}
quarkus.langchain4j.openai.orchestrator-model.timeout=${model.timeout}
```

**Observações**:
- Usa `temperature=0.3` para decisões mais consistentes
- Recomenda-se usar um modelo rápido e barato (GPT-4o-mini)
- O modelo não precisa ser o mais poderoso, apenas preciso na classificação

## 📊 Formato da Decisão

O OrchestratorAgent retorna JSON estruturado:

```json
{
  "specialist": "K8S_CLUSTER",
  "reason": "Pergunta sobre estado atual do cluster",
  "useMcp": true,
  "useRag": false,
  "confidence": 0.95
}
```

**Campos**:
- `specialist`: Tipo do especialista (K8S_CLUSTER, DOCUMENTATION, TROUBLESHOOTING, GENERAL)
- `reason`: Breve explicação da decisão
- `useMcp`: Se deve usar MCP tools (acesso ao cluster)
- `useRag`: Se deve usar RAG (documentação)
- `confidence`: Confiança na decisão (0.0-1.0)

## 💡 Vantagens

1. **Automático**: Usuário não precisa decidir quais features ativar
2. **Inteligente**: Contexto é analisado para tomar decisão
3. **Otimizado**: Usa recursos (MCP/RAG) apenas quando necessário
4. **Transparente**: Mostra qual especialista respondeu
5. **Eficiente**: Reduz custos ao não chamar recursos desnecessários

## 🎯 Casos de Uso

### Exemplo 1: Consulta de Cluster
```
Usuário: "Quantos pods estão em execução no namespace default?"

Orquestrador decide:
- Specialist: K8S_CLUSTER
- MCP: true (precisa consultar cluster)
- RAG: false (não precisa de documentação)

Resultado: AgentBBDW.sendMessageWithMcp()
```

### Exemplo 2: Dúvida Conceitual
```
Usuário: "Como funciona o rolling update no Kubernetes?"

Orquestrador decide:
- Specialist: DOCUMENTATION
- MCP: false (não precisa do cluster)
- RAG: true (precisa da documentação)

Resultado: AgentBBDWWithRAG.sendMessageWithRAG()
```

### Exemplo 3: Troubleshooting
```
Usuário: "Meu pod está em CrashLoopBackOff, como investigar?"

Orquestrador decide:
- Specialist: TROUBLESHOOTING
- MCP: true (precisa consultar logs/eventos)
- RAG: true (precisa da documentação para explicar)

Resultado: AgentBBDWWithRAG.sendMessageWithMcpAndRAG()
```

## 📝 Logs

O sistema gera logs detalhados para acompanhar o processo:

```
🎯 Orquestrador analisando mensagem: quantos pods estão rodando?
📋 Decisão do orquestrador: specialist=K8S_CLUSTER, useMcp=true, useRag=false, confidence=0.95
💭 Razão: Pergunta sobre estado atual do cluster
🔧 Delegando para agente K8S_CLUSTER
```

## 🔄 Fallback

Em caso de erro na orquestração, o sistema automaticamente faz fallback para o agente geral (AgentGPT4oMini).

## 🧪 Testando

```bash
# Teste com pergunta sobre cluster
curl -X POST http://localhost:8080/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message": "liste os pods", "useOrchestrator": true}'

# Teste com pergunta conceitual
curl -X POST http://localhost:8080/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message": "o que é um deployment?", "useOrchestrator": true}'

# Teste com troubleshooting
curl -X POST http://localhost:8080/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message": "pod crashando com erro OOM", "useOrchestrator": true}'
```

## 🎨 Extensão

Para adicionar novos especialistas:

1. Adicione o enum em `OrchestratorService.SpecialistType`
2. Atualize o prompt do `OrchestratorAgent` com o novo especialista
3. Adicione o case no `delegateToSpecialist()`
4. Atualize o método `getSpecialistInfo()`

## 🚦 Status

✅ Implementado
✅ Integrado com interface web
✅ Logging completo
✅ Fallback em caso de erro
✅ Feedback ao usuário
