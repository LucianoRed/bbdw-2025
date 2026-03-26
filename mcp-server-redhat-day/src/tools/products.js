import { getProducts, invalidateProductsCache } from '../products.js';
import { getDay, saveDay, addPresentation } from '../db.js';

export const toolProducts = [
  {
    name: 'listar_produtos_redhat',
    description:
      'Lista os produtos Red Hat disponíveis para apresentação, buscando do portal docs.redhat.com (com cache de 24h). Use esta ferramenta para consultar o catálogo antes de montar uma agenda.',
    inputSchema: {
      type: 'object',
      properties: {
        categoria: {
          type: 'string',
          description: 'Filtra por categoria (ex: "Cloud & Containers", "Automation", "Security", "AI & Machine Learning"). Opcional.',
        },
        forceRefresh: {
          type: 'boolean',
          description: 'Se true, ignora o cache e busca novamente do docs.redhat.com (padrão: false)',
        },
      },
      required: [],
    },
    handler: async (args) => {
      const { categoria, forceRefresh } = args || {};
      const products = await getProducts(!!forceRefresh);
      let filtered = products;
      if (categoria) {
        const lower = categoria.toLowerCase();
        filtered = products.filter((p) => p.category.toLowerCase().includes(lower));
      }
      if (!filtered.length) {
        return { content: [{ type: 'text', text: `Nenhum produto encontrado${categoria ? ` na categoria "${categoria}"` : ''}.` }] };
      }

      // Group by category
      const byCategory = {};
      for (const p of filtered) {
        const cat = p.category || 'Outros';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(p.name);
      }

      const lines = Object.entries(byCategory)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([cat, names]) => `**${cat}:**\n${names.map((n) => `  - ${n}`).join('\n')}`);

      return {
        content: [{
          type: 'text',
          text: `## Produtos Red Hat (${filtered.length} encontrado(s)${forceRefresh ? ' — cache atualizado' : ''})\n\n${lines.join('\n\n')}`,
        }],
      };
    },
  },

  {
    name: 'sugerir_agenda',
    description:
      'Sugere uma lista de apresentações para um Red Hat Day com base nos interesses do cliente e no formato do dia. Pode adicionar as sugestões automaticamente à agenda se solicitado.',
    inputSchema: {
      type: 'object',
      properties: {
        dayId: {
          type: 'string',
          description: 'ID do Red Hat Day. Se informado, usa os interesses cadastrados nele.',
        },
        clientInterests: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lista de interesses (ex: ["OpenShift", "segurança", "automação"]). Usado se dayId não informado ou para enriquecer.',
        },
        type: {
          type: 'string',
          enum: ['full', 'morning', 'afternoon'],
          description: 'Tipo de dia (se dayId não informado). Define quantas apresentações cabem.',
        },
        addToAgenda: {
          type: 'boolean',
          description: 'Se true, adiciona automaticamente as sugestões à agenda do dayId informado (padrão: false)',
        },
      },
      required: [],
    },
    handler: async (args) => {
      const { dayId, clientInterests: extraInterests, type: typeArg, addToAgenda } = args || {};

      let day = null;
      let interests = extraInterests || [];
      let dayType = typeArg || 'full';

      if (dayId) {
        day = await getDay(dayId);
        if (!day) {
          return { content: [{ type: 'text', text: `Red Hat Day com ID ${dayId} não encontrado.` }], isError: true };
        }
        interests = [...new Set([...(day.clientInterests || []), ...interests])];
        dayType = day.type;
      }

      const products = await getProducts();

      // Calculate available slots based on day type
      const slotsPerType = { full: 10, morning: 4, afternoon: 5 };
      const maxSlots = slotsPerType[dayType] || 8;

      // Score products by interest match
      const scored = products.map((p) => {
        let score = 0;
        const pName = p.name.toLowerCase();
        const pCategory = (p.category || '').toLowerCase();
        for (const interest of interests) {
          const interestLower = interest.toLowerCase();
          if (pName.includes(interestLower)) score += 3;
          else if (pCategory.includes(interestLower)) score += 1;
          // Also check keywords
          const keywords = interestLower.split(/\s+/);
          for (const kw of keywords) {
            if (kw.length > 3 && pName.includes(kw)) score += 2;
          }
        }
        return { ...p, score };
      });

      // Sort by score desc, then alphabetically
      const sorted = scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
      const suggestions = sorted.slice(0, maxSlots);

      const lines = suggestions.map((p, i) => `${i + 1}. **${p.name}** *(${p.category || 'Outros'})* ${p.score > 0 ? `— relevância: ${p.score}` : ''}`);

      let added = 0;
      if (addToAgenda && day) {
        for (const p of suggestions) {
          addPresentation(day, { product: p.name, title: p.name });
          added++;
        }
        await saveDay(day);
      }

      const typeLabel = { full: 'Dia inteiro', morning: 'Manhã', afternoon: 'Tarde' };
      return {
        content: [{
          type: 'text',
          text: `## Sugestão de Agenda — ${typeLabel[dayType] || dayType} (${maxSlots} slots)\n\n` +
            `**Interesses considerados:** ${interests.length ? interests.join(', ') : '(nenhum — exibindo produtos populares)'}\n\n` +
            lines.join('\n') +
            (addToAgenda && day ? `\n\n✅ ${added} apresentações adicionadas automaticamente à agenda de **${day.clientName}**.` : '\n\n_Para adicionar à agenda, use `adicionar_apresentacao` ou repita com `addToAgenda: true`._'),
        }],
      };
    },
  },
];
