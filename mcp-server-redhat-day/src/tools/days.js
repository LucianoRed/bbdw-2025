import { createDay, listDays, getDay, saveDay, deleteDay } from '../db.js';

export const toolDays = [
  {
    name: 'criar_redhat_day',
    description:
      'Cria um novo Red Hat Day para um cliente. Informe o nome do cliente, data, tipo de dia (full = dia inteiro 09h–17h, morning = manhã 09h–12h, afternoon = tarde 13h30–17h) e os temas/produtos de interesse do cliente.',
    inputSchema: {
      type: 'object',
      properties: {
        clientName: { type: 'string', description: 'Nome do cliente ou empresa' },
        clientContact: { type: 'string', description: 'Nome do contato / patrocinador no cliente (opcional)' },
        date: { type: 'string', description: 'Data do evento no formato YYYY-MM-DD' },
        type: {
          type: 'string',
          enum: ['full', 'morning', 'afternoon'],
          description: 'Tipo do dia: "full" (dia inteiro), "morning" (somente manhã), "afternoon" (somente tarde)',
        },
        clientInterests: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lista de produtos/temas de interesse do cliente (ex: ["OpenShift", "Ansible", "RHEL"])',
        },
      },
      required: ['clientName', 'date', 'type'],
    },
    handler: async (args) => {
      const { clientName, clientContact, date, type, clientInterests } = args;
      if (!clientName || !date || !type) {
        return { content: [{ type: 'text', text: 'Erro: clientName, date e type são obrigatórios.' }], isError: true };
      }
      const validTypes = ['full', 'morning', 'afternoon'];
      if (!validTypes.includes(type)) {
        return { content: [{ type: 'text', text: `Erro: type deve ser um de: ${validTypes.join(', ')}` }], isError: true };
      }
      const day = await createDay({ clientName, clientContact, date, type, clientInterests });
      const typeLabel = { full: 'Dia inteiro (09h–17h)', morning: 'Manhã (09h–12h)', afternoon: 'Tarde (13h30–17h)' }[type];
      return {
        content: [{
          type: 'text',
          text: `✅ Red Hat Day criado com sucesso!\n\n` +
            `**ID:** ${day.id}\n` +
            `**Cliente:** ${day.clientName}\n` +
            `**Data:** ${day.date}\n` +
            `**Formato:** ${typeLabel}\n` +
            `**Interesses:** ${(day.clientInterests || []).join(', ') || '(nenhum informado)'}\n\n` +
            `Use \`adicionar_apresentacao\` com o ID acima para montar a agenda.`,
        }],
      };
    },
  },

  {
    name: 'listar_redhat_days',
    description: 'Lista todos os Red Hat Days cadastrados, com data, cliente e quantidade de apresentações.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    handler: async () => {
      const days = await listDays();
      if (!days.length) {
        return { content: [{ type: 'text', text: 'Nenhum Red Hat Day cadastrado ainda. Use `criar_redhat_day` para começar.' }] };
      }
      const typeLabel = { full: 'Dia inteiro', morning: 'Manhã', afternoon: 'Tarde' };
      const lines = days.map((d) =>
        `- **${d.clientName}** | Data: ${d.date} | Formato: ${typeLabel[d.type] || d.type} | ${d.presentations.length} apresentação(ões) | ID: \`${d.id}\``
      );
      return { content: [{ type: 'text', text: `## Red Hat Days Cadastrados (${days.length})\n\n${lines.join('\n')}` }] };
    },
  },

  {
    name: 'buscar_redhat_day',
    description: 'Retorna os detalhes completos de um Red Hat Day pelo seu ID, incluindo todas as apresentações agendadas.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID do Red Hat Day' },
      },
      required: ['id'],
    },
    handler: async (args) => {
      const day = await getDay(args.id);
      if (!day) {
        return { content: [{ type: 'text', text: `Red Hat Day com ID ${args.id} não encontrado.` }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(day, null, 2) }] };
    },
  },

  {
    name: 'deletar_redhat_day',
    description: 'Remove permanentemente um Red Hat Day e todas as suas apresentações.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID do Red Hat Day a ser removido' },
      },
      required: ['id'],
    },
    handler: async (args) => {
      const removed = await deleteDay(args.id);
      if (!removed) {
        return { content: [{ type: 'text', text: `Red Hat Day com ID ${args.id} não encontrado.` }], isError: true };
      }
      return { content: [{ type: 'text', text: `Red Hat Day de **${removed.clientName}** (${removed.date}) removido com sucesso.` }] };
    },
  },
];
