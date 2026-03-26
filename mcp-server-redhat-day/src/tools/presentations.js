import { getDay, saveDay, addPresentation, removePresentation, updatePresentation } from '../db.js';

export const toolPresentations = [
  {
    name: 'adicionar_apresentacao',
    description:
      'Adiciona uma apresentação à agenda de um Red Hat Day. O tempo padrão é 20 min de apresentação + 10 min de discussão, mas pode ser alterado.',
    inputSchema: {
      type: 'object',
      properties: {
        dayId: { type: 'string', description: 'ID do Red Hat Day' },
        product: { type: 'string', description: 'Produto Red Hat a ser apresentado (ex: OpenShift, RHEL, Ansible)' },
        title: { type: 'string', description: 'Título da apresentação (opcional; padrão: nome do produto)' },
        description: { type: 'string', description: 'Descrição ou tópicos que serão abordados (opcional)' },
        presenter: { type: 'string', description: 'Nome do apresentador' },
        durationMinutes: {
          type: 'integer',
          description: 'Tempo de apresentação em minutos (padrão: 20)',
          default: 20,
        },
        discussionMinutes: {
          type: 'integer',
          description: 'Tempo de discussão em minutos após a apresentação (padrão: 10)',
          default: 10,
        },
      },
      required: ['dayId', 'product'],
    },
    handler: async (args) => {
      const { dayId, product, title, description, presenter, durationMinutes, discussionMinutes } = args;
      const day = await getDay(dayId);
      if (!day) {
        return { content: [{ type: 'text', text: `Red Hat Day com ID ${dayId} não encontrado.` }], isError: true };
      }
      const presentation = addPresentation(day, { product, title, description, presenter, durationMinutes, discussionMinutes });
      await saveDay(day);
      const totalMin = presentation.durationMinutes + presentation.discussionMinutes;
      return {
        content: [{
          type: 'text',
          text: `✅ Apresentação adicionada!\n\n` +
            `**Produto:** ${presentation.product}\n` +
            `**Título:** ${presentation.title}\n` +
            `**Apresentador:** ${presentation.presenter || '(a definir)'}\n` +
            `**Duração:** ${presentation.durationMinutes} min apresentação + ${presentation.discussionMinutes} min discussão = **${totalMin} min total**\n` +
            `**Ordem:** ${presentation.order}\n` +
            `**ID da Apresentação:** \`${presentation.id}\`\n\n` +
            `Total de apresentações no dia: ${day.presentations.length}`,
        }],
      };
    },
  },

  {
    name: 'remover_apresentacao',
    description: 'Remove uma apresentação da agenda de um Red Hat Day pelo ID da apresentação.',
    inputSchema: {
      type: 'object',
      properties: {
        dayId: { type: 'string', description: 'ID do Red Hat Day' },
        presentationId: { type: 'string', description: 'ID da apresentação a remover' },
      },
      required: ['dayId', 'presentationId'],
    },
    handler: async (args) => {
      const { dayId, presentationId } = args;
      const day = await getDay(dayId);
      if (!day) {
        return { content: [{ type: 'text', text: `Red Hat Day com ID ${dayId} não encontrado.` }], isError: true };
      }
      const removed = removePresentation(day, presentationId);
      if (!removed) {
        return { content: [{ type: 'text', text: `Apresentação com ID ${presentationId} não encontrada.` }], isError: true };
      }
      await saveDay(day);
      return {
        content: [{
          type: 'text',
          text: `Apresentação **${removed.title}** removida com sucesso. Restam ${day.presentations.length} apresentação(ões).`,
        }],
      };
    },
  },

  {
    name: 'atualizar_apresentacao',
    description: 'Atualiza campos de uma apresentação existente (produto, título, apresentador, duração, etc).',
    inputSchema: {
      type: 'object',
      properties: {
        dayId: { type: 'string', description: 'ID do Red Hat Day' },
        presentationId: { type: 'string', description: 'ID da apresentação' },
        product: { type: 'string', description: 'Novo nome do produto (opcional)' },
        title: { type: 'string', description: 'Novo título (opcional)' },
        description: { type: 'string', description: 'Nova descrição (opcional)' },
        presenter: { type: 'string', description: 'Novo nome do apresentador (opcional)' },
        durationMinutes: { type: 'integer', description: 'Novo tempo de apresentação em minutos (opcional)' },
        discussionMinutes: { type: 'integer', description: 'Novo tempo de discussão em minutos (opcional)' },
        order: { type: 'integer', description: 'Nova ordem na agenda (opcional)' },
      },
      required: ['dayId', 'presentationId'],
    },
    handler: async (args) => {
      const { dayId, presentationId, ...fields } = args;
      const day = await getDay(dayId);
      if (!day) {
        return { content: [{ type: 'text', text: `Red Hat Day com ID ${dayId} não encontrado.` }], isError: true };
      }
      const updated = updatePresentation(day, presentationId, fields);
      if (!updated) {
        return { content: [{ type: 'text', text: `Apresentação com ID ${presentationId} não encontrada.` }], isError: true };
      }
      await saveDay(day);
      return {
        content: [{
          type: 'text',
          text: `✅ Apresentação atualizada!\n\n` +
            `**Produto:** ${updated.product}\n` +
            `**Título:** ${updated.title}\n` +
            `**Apresentador:** ${updated.presenter || '(a definir)'}\n` +
            `**Duração:** ${updated.durationMinutes} min + ${updated.discussionMinutes} min discussão\n` +
            `**Ordem:** ${updated.order}`,
        }],
      };
    },
  },
];
