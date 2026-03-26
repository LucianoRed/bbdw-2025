import { getDay } from '../db.js';

// ------------------------------------------------------------------ Schedule calculation

const SCHEDULE_CONFIG = {
  full: { start: '09:00', lunchStart: '12:00', lunchEnd: '13:30', end: '17:00' },
  morning: { start: '09:00', end: '12:00' },
  afternoon: { start: '13:30', end: '17:00' },
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

function buildSchedule(day) {
  const cfg = SCHEDULE_CONFIG[day.type] || SCHEDULE_CONFIG.full;
  const sorted = [...day.presentations].sort((a, b) => a.order - b.order);

  let cursor = timeToMinutes(cfg.start);
  const lunchStart = cfg.lunchStart ? timeToMinutes(cfg.lunchStart) : null;
  const lunchEnd = cfg.lunchEnd ? timeToMinutes(cfg.lunchEnd) : null;
  const endTime = timeToMinutes(cfg.end);

  const scheduled = [];
  let slotNumber = 1;

  for (const p of sorted) {
    const duration = (Number(p.durationMinutes) || 20) + (Number(p.discussionMinutes) || 10);

    // Insert lunch break if we just crossed noon
    if (lunchStart !== null && cursor < lunchStart && cursor + duration > lunchStart) {
      scheduled.push({ type: 'break', label: '🍽️ Almoço', start: minutesToTime(lunchStart), end: minutesToTime(lunchEnd) });
      cursor = lunchEnd;
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

  const availableMinutes =
    day.type === 'full'
      ? (lunchStart - timeToMinutes(cfg.start)) + (endTime - lunchEnd)
      : endTime - timeToMinutes(cfg.start);

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
