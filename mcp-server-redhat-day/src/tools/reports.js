import { getDay } from '../db.js';

// ------------------------------------------------------------------ Schedule calculation

const SCHEDULE_CONFIG = {
  full:      { start: '09:00', coffeeAM: '10:30', lunchStart: '12:00', lunchEnd: '13:30', coffeePM: '15:30', end: '17:00' },
  morning:   { start: '09:00', coffeeAM: '10:30', end: '12:00' },
  afternoon: { start: '13:30', coffeePM: '15:30', end: '17:00' },
};

// Minutos úteis por tipo (sem coffee breaks — descontados depois)
const AVAILABLE_MINUTES = {
  full:      { raw: 390, coffeeBreaks: 2 }, // 180 manhã + 210 tarde
  morning:   { raw: 180, coffeeBreaks: 1 }, // 09h–12h
  afternoon: { raw: 210, coffeeBreaks: 1 }, // 13h30–17h
};

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function buildSchedule(day, { coffeeBreakMinutes = 30 } = {}) {
  const cfg = SCHEDULE_CONFIG[day.type] || SCHEDULE_CONFIG.full;
  const sorted = [...day.presentations].sort((a, b) => a.order - b.order);

  let cursor = timeToMinutes(cfg.start);
  const lunchStart = cfg.lunchStart ? timeToMinutes(cfg.lunchStart) : null;
  const lunchEnd   = cfg.lunchEnd   ? timeToMinutes(cfg.lunchEnd)   : null;
  const coffeeAM   = cfg.coffeeAM   ? timeToMinutes(cfg.coffeeAM)   : null;
  const coffeePM   = cfg.coffeePM   ? timeToMinutes(cfg.coffeePM)   : null;
  const endTime    = timeToMinutes(cfg.end);

  const scheduled = [];
  let slotNumber = 1;
  let coffeeAMDone = false;
  let coffeePMDone = false;

  for (const p of sorted) {
    const duration = (Number(p.durationMinutes) || 20) + (Number(p.discussionMinutes) || 10);

    // Inserir coffee break da manhã se o slot cruzar o horário
    if (coffeeAM !== null && !coffeeAMDone && cursor < coffeeAM && cursor + duration > coffeeAM) {
      coffeeAMDone = true;
      scheduled.push({ type: 'coffee', label: '☕ Coffee Break', start: minutesToTime(coffeeAM), end: minutesToTime(coffeeAM + coffeeBreakMinutes) });
      cursor = coffeeAM + coffeeBreakMinutes;
    }

    // Inserir almoço se o slot cruzar o meio-dia
    if (lunchStart !== null && cursor < lunchStart && cursor + duration > lunchStart) {
      scheduled.push({ type: 'break', label: '🍽️ Almoço', start: minutesToTime(lunchStart), end: minutesToTime(lunchEnd) });
      cursor = lunchEnd;
    }

    // Inserir coffee break da tarde se o slot cruzar o horário
    if (coffeePM !== null && !coffeePMDone && cursor < coffeePM && cursor + duration > coffeePM) {
      coffeePMDone = true;
      scheduled.push({ type: 'coffee', label: '☕ Coffee Break', start: minutesToTime(coffeePM), end: minutesToTime(coffeePM + coffeeBreakMinutes) });
      cursor = coffeePM + coffeeBreakMinutes;
    }

    if (cursor >= endTime) {
      scheduled.push({ type: 'warning', label: `⚠️ ${p.title} não cabe no horário restante` });
      continue;
    }

    const startTime = minutesToTime(cursor);
    const endSlot = cursor + duration;
    const endSlotTime = minutesToTime(Math.min(endSlot, endTime));

    scheduled.push({
      type: 'presentation',
      slot: slotNumber++,
      id: p.id,
      product: p.product,
      title: p.title,
      description: p.description,
      presenter: p.presenter,
      startTime,
      endTime: endSlotTime,
      durationMinutes: p.durationMinutes,
      discussionMinutes: p.discussionMinutes,
    });

    cursor = Math.min(endSlot, endTime);
  }

  const usedMinutes = scheduled
    .filter((s) => s.type === 'presentation')
    .reduce((acc, s) => acc + (s.durationMinutes || 20) + (s.discussionMinutes || 10), 0);

  const times = AVAILABLE_MINUTES[day.type] || AVAILABLE_MINUTES.full;
  const availableMinutes = times.raw - (times.coffeeBreaks * coffeeBreakMinutes);

  return { scheduled, usedMinutes, availableMinutes };
}

// ------------------------------------------------------------------ Tool

export const toolReports = [
  {
    name: 'gerar_relatorio',
    description:
      'Gera o relatório completo de um Red Hat Day com a agenda calculada automaticamente, horários de cada apresentação e resumo do dia.',
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

      const typeLabel = { full: 'Dia inteiro (09h–17h)', morning: 'Manhã (09h–12h)', afternoon: 'Tarde (13h30–17h)' };
      const { scheduled, usedMinutes, availableMinutes } = buildSchedule(day);

      const lines = [
        `# 🔴 Red Hat Day — ${day.clientName}`,
        '',
        `| Campo | Valor |`,
        `|---|---|`,
        `| **Cliente** | ${day.clientName} |`,
        `| **Contato** | ${day.clientContact || '—'} |`,
        `| **Data** | ${day.date} |`,
        `| **Formato** | ${typeLabel[day.type] || day.type} |`,
        `| **Interesses** | ${(day.clientInterests || []).join(', ') || '—'} |`,
        `| **Criado em** | ${new Date(day.createdAt).toLocaleDateString('pt-BR')} |`,
        '',
        `## 📋 Agenda`,
        '',
      ];

      for (const slot of scheduled) {
        if (slot.type === 'break') {
          lines.push(`---`);
          lines.push(`**${slot.label}** — ${slot.start} às ${slot.end}`);
          lines.push(`---`);
          lines.push('');
        } else if (slot.type === 'warning') {
          lines.push(`> ${slot.label}`);
          lines.push('');
        } else {
          lines.push(`### ${slot.slot}. ${slot.title}`);
          lines.push(`**Produto:** ${slot.product}  |  **Horário:** ${slot.startTime}–${slot.endTime}  |  **Apresentador:** ${slot.presenter || '_(a definir)_'}`);
          lines.push(`**Duração:** ${slot.durationMinutes} min apresentação + ${slot.discussionMinutes} min discussão`);
          if (slot.description) lines.push(`> ${slot.description}`);
          lines.push('');
        }
      }

      const remaining = availableMinutes - usedMinutes;
      lines.push(`---`);
      lines.push(`## ⏱️ Resumo de tempo`);
      lines.push('');
      lines.push(`| | Minutos |`);
      lines.push(`|---|---|`);
      lines.push(`| Disponível no dia | ${availableMinutes} min |`);
      lines.push(`| Utilizado | ${usedMinutes} min |`);
      lines.push(`| Restante | ${remaining} min${remaining < 0 ? ' ⚠️ agenda estourada!' : ''} |`);
      lines.push(`| Apresentações | ${day.presentations.length} |`);

      if (!day.presentations.length) {
        lines.push('');
        lines.push('_Nenhuma apresentação cadastrada. Use `adicionar_apresentacao` ou `sugerir_agenda` para montar a agenda._');
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  },
];

export { buildSchedule };
