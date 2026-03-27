import { listRegistrations, deleteAllRegistrations } from '../db.js';

const NIVEL_LABEL = (n) => {
  n = Number(n);
  if (n <= 3) return 'Iniciante';
  if (n <= 6) return 'Intermediário';
  if (n <= 9) return 'Avançado';
  return 'Expert';
};

export const toolRegistrations = [
  {
    name: 'listar_inscricoes',
    description: 'Lista todos os participantes inscritos em um Red Hat Day, exibindo perfil técnico e dados de contato.',
    inputSchema: {
      type: 'object',
      properties: {
        dayId: { type: 'string', description: 'ID do Red Hat Day (ex: cliente-2025-01-15)' },
      },
      required: ['dayId'],
    },
    async handler({ dayId }) {
      const regs = await listRegistrations(dayId);
      if (!regs.length) {
        return { content: [{ type: 'text', text: `Nenhuma inscrição encontrada para o Red Hat Day "${dayId}".` }] };
      }

      const lines = [`## Inscrições — ${dayId}`, `Total: **${regs.length}** participante(s)`, ''];

      for (const r of regs) {
        lines.push(`### ${r.nome}`);
        lines.push(`- **Email:** ${r.email}`);
        lines.push(`- **Empresa:** ${r.empresa} | **Área:** ${r.area} | **Cargo:** ${r.cargo}`);
        if (r.funcaoDescricao) lines.push(`- **Função:** ${r.funcaoDescricao}`);
        if (r.telefone) lines.push(`- **Telefone:** ${r.telefone}`);
        if (r.whatsapp) lines.push(`- **WhatsApp:** ${r.whatsapp}`);
        lines.push(`- **Nível técnico:**`);
        lines.push(`  - Desenvolvimento: ${r.nivelDev}/10 (${NIVEL_LABEL(r.nivelDev)})`);
        lines.push(`  - Operações: ${r.nivelOps}/10 (${NIVEL_LABEL(r.nivelOps)})`);
        lines.push(`  - Containers/Docker: ${r.nivelContainers}/10 (${NIVEL_LABEL(r.nivelContainers)})`);
        lines.push(`  - Kubernetes: ${r.nivelKubernetes}/10 (${NIVEL_LABEL(r.nivelKubernetes)})`);
        lines.push(`  - OpenShift: ${r.nivelOpenShift}/10 (${NIVEL_LABEL(r.nivelOpenShift)})`);
        lines.push(`  - Seg. Containers: ${r.nivelSegContainers}/10 (${NIVEL_LABEL(r.nivelSegContainers)})`);
        lines.push(`  - Seg. Kubernetes: ${r.nivelSegKubernetes}/10 (${NIVEL_LABEL(r.nivelSegKubernetes)})`);
        lines.push(`- **Inscrito em:** ${new Date(r.createdAt).toLocaleString('pt-BR')}`);
        lines.push('');
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  },

  {
    name: 'exportar_inscricoes_csv',
    description: 'Exporta as inscrições de um Red Hat Day em formato CSV (separador ;, UTF-8 com BOM).',
    inputSchema: {
      type: 'object',
      properties: {
        dayId: { type: 'string', description: 'ID do Red Hat Day' },
      },
      required: ['dayId'],
    },
    async handler({ dayId }) {
      const regs = await listRegistrations(dayId);
      if (!regs.length) {
        return { content: [{ type: 'text', text: `Nenhuma inscrição para exportar em "${dayId}".` }] };
      }

      const cols = [
        'nome', 'email', 'empresa', 'area', 'cargo', 'funcaoDescricao',
        'telefone', 'whatsapp', 'nivelDev', 'nivelOps', 'nivelContainers',
        'nivelKubernetes', 'nivelOpenShift', 'nivelSegContainers', 'nivelSegKubernetes', 'createdAt',
      ];
      const header = [
        'Nome', 'Email', 'Empresa', 'Área', 'Cargo', 'Função (desc.)',
        'Telefone', 'WhatsApp', 'Dev', 'Ops', 'Containers',
        'Kubernetes', 'OpenShift', 'Seg.Containers', 'Seg.Kubernetes', 'Data Inscrição',
      ];

      const csv = [
        header.join(';'),
        ...regs.map((r) =>
          cols.map((c) => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(';')
        ),
      ].join('\n');

      return {
        content: [{
          type: 'text',
          text: `CSV pronto (${regs.length} linha(s)):\n\n\`\`\`csv\n${csv}\n\`\`\``,
        }],
      };
    },
  },

  {
    name: 'resumo_perfil_tecnico',
    description: 'Gera um resumo estatístico do perfil técnico dos participantes inscritos em um Red Hat Day, com médias por área de conhecimento.',
    inputSchema: {
      type: 'object',
      properties: {
        dayId: { type: 'string', description: 'ID do Red Hat Day' },
      },
      required: ['dayId'],
    },
    async handler({ dayId }) {
      const regs = await listRegistrations(dayId);
      if (!regs.length) {
        return { content: [{ type: 'text', text: `Nenhuma inscrição encontrada para "${dayId}".` }] };
      }

      const campos = [
        { key: 'nivelDev',            label: 'Desenvolvimento' },
        { key: 'nivelOps',            label: 'Operações de TI' },
        { key: 'nivelContainers',     label: 'Containers/Docker' },
        { key: 'nivelKubernetes',     label: 'Kubernetes' },
        { key: 'nivelOpenShift',      label: 'OpenShift' },
        { key: 'nivelSegContainers',  label: 'Segurança — Containers' },
        { key: 'nivelSegKubernetes',  label: 'Segurança — Kubernetes' },
      ];

      const n = regs.length;
      const lines = [
        `## Perfil Técnico — ${dayId}`,
        `Baseado em **${n}** inscrito(s)`,
        '',
        '| Área | Média | Nível médio |',
        '|------|-------|-------------|',
      ];

      for (const { key, label } of campos) {
        const avg = regs.reduce((s, r) => s + Number(r[key] || 0), 0) / n;
        lines.push(`| ${label} | ${avg.toFixed(1)}/10 | ${NIVEL_LABEL(Math.round(avg))} |`);
      }

      // Sugestão de foco
      const sorted = campos
        .map(({ key, label }) => ({
          label,
          avg: regs.reduce((s, r) => s + Number(r[key] || 0), 0) / n,
        }))
        .sort((a, b) => a.avg - b.avg);

      lines.push('');
      lines.push(`**Menor nível médio (foco recomendado):** ${sorted[0].label} (${sorted[0].avg.toFixed(1)}/10)`);
      lines.push(`**Maior nível médio:** ${sorted[sorted.length - 1].label} (${sorted[sorted.length - 1].avg.toFixed(1)}/10)`);

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  },
];
