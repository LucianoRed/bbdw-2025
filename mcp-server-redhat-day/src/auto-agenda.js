// ---- Interest category detection ----

const CATEGORY_PATTERNS = {
  security:   /segurança|security|compliance|rbac|scc\b|policy|vulnerab|conformidade|hardening|auditoria|pentest|devsecops/i,
  automation: /automaç|automação|automation|ansible|ci.?cd|pipeline|gitops|tekton|argocd|iac\b|idempotent/i,
  containers: /container|docker|podman|registry|oci\b/i,
  kubernetes: /kubernetes|k8s\b/i,
  cloud:      /cloud|nuvem|hybri|multicloud|on.prem/i,
  monitoring: /monitor|observab|prometheus|grafana|splunk|alerta|log\b|métrica|telemetria/i,
  storage:    /storage|armazen|ceph|rook|pvc\b|persistent|object.storage/i,
  networking: /\bred[e]?\b|network(?!.policy)|load.balancer|ingress|route(?!r)|sdn\b|ovn\b|microsserv/i,
  ai:         /\b(ai|ia)\b|intelig.*artif|llm\b|machine.learn|\bml\b|modelo.*ia|gpu\b|generativ/i,
  devops:     /devops|dev.ops|developer|desenvolv|aplicaç|aplicativo|moderniz|ciclo.de.vida/i,
};

function detectCategories(interests = [], clientDescription = '') {
  const text = [...interests, clientDescription].join(' ');
  return Object.entries(CATEGORY_PATTERNS)
    .filter(([, pattern]) => pattern.test(text))
    .map(([cat]) => cat);
}

// ---- Product description templates ----
// _base = always shown. Category keys = appended when detected in client interests/description.

const PRODUCT_TEMPLATES = {
  openshift: {
    _base: 'Red Hat OpenShift Container Platform: deployment, escalabilidade e operação de aplicações containerizadas em Kubernetes enterprise.',
    security:   'Com foco em segurança: RBAC, Security Context Constraints (SCC), NetworkPolicy, ImagePolicy e auditoria de conformidade.',
    monitoring: 'Com foco em observabilidade: stack Prometheus/Grafana nativo, alertas customizados e Cluster Logging.',
    ai:         'Com foco em cargas de trabalho IA/ML: GPU scheduling, serving de modelos e integração com OpenShift AI (RHOAI).',
    automation: 'Com foco em GitOps e automação: Operators, ArgoCD, Tekton Pipelines e entrega contínua.',
    devops:     'Com foco no ciclo de vida de aplicações: Source-to-Image, Helm charts, pipelines e deploy automatizado.',
    cloud:      'Com foco em multi-cloud e hybrid: deploy em bare metal, VMware, AWS, Azure e GCP com portabilidade total.',
    networking: 'Com foco em rede e tráfego: OVN-Kubernetes, Routes, Ingress, balanceamento e políticas de rede.',
    containers: 'Com foco em runtime de containers: CRI-O, Image Streams, builds e mirror de registries.',
  },
  ansible: {
    _base: 'Red Hat Ansible Automation Platform: automação de infraestrutura, configurações e deploys com playbooks reutilizáveis e idempotentes.',
    security:   'Com foco em automação de segurança: hardening de SO, conformidade CIS/STIG, remediação automática e auditoria.',
    networking: 'Com foco em automação de redes: configuração de switches, roteadores, firewalls e balanceadores de carga.',
    cloud:      'Com foco em automação cloud: provisionamento em AWS, Azure, GCP e ambientes híbridos.',
    devops:     'Com foco em DevOps: integração com pipelines CI/CD, AWX/AAP Controller e automação de releases.',
    containers: 'Com foco em containers: automação de builds, deploys no OpenShift e gestão de imagens.',
    monitoring: 'Com foco em observabilidade: configuração automatizada de agentes, alertas e dashboards de monitoramento.',
  },
  rhel: {
    _base: 'Red Hat Enterprise Linux: sistema operacional enterprise com suporte de longo prazo, certificação e estabilidade corporativa.',
    security:   'Com foco em segurança do SO: SELinux, FIPS 140-2, auditoria, criptografia de disco e conformidade CIS/STIG.',
    automation: 'Com foco em gerenciamento em escala: Red Hat Satellite, Ansible e automação de patches e configurações.',
    cloud:      'Com foco em RHEL em nuvem: Universal Base Image (UBI), imagens certificadas e portabilidade cross-cloud.',
    monitoring: 'Com foco em observabilidade: Red Hat Insights, análise preditiva de saúde e telemetria de SO.',
    containers: 'Com foco em containers: Universal Base Image (UBI) como base segura e certificada para imagens.',
  },
  satellite: {
    _base: 'Red Hat Satellite: gerenciamento centralizado de RHEL — patches, conteúdo, inventário e conformidade em escala.',
    security:   'Com foco em compliance e patching: relatórios OpenSCAP, aplicação agendada de patches de segurança e auditoria.',
    automation: 'Com foco em automação: integração com Ansible, kickstart e provisionamento automatizado de hosts.',
    cloud:      'Com foco em ambientes híbridos: gerenciamento unificado de hosts on-prem, cloud e edge.',
  },
  insights: {
    _base: 'Red Hat Insights: análise preditiva e gestão proativa da saúde dos sistemas Red Hat com recomendações inteligentes.',
    security:   'Com foco em segurança: detecção de CVEs, conformidade OpenSCAP e guias de remediação automatizados.',
    monitoring: 'Com foco em observabilidade: relatórios de drift de configuração, análise de performance e alertas proativos.',
    automation: 'Com foco em automação de remediação: playbooks Ansible gerados automaticamente para corrigir issues identificados.',
  },
  acs: {
    _base: 'Red Hat Advanced Cluster Security (ACS/StackRox): segurança nativa para Kubernetes — detecção de ameaças, prevenção e conformidade de containers.',
    security:   'Com foco em DevSecOps: scanning de imagens no pipeline, políticas de runtime, detecção de anomalias e conformidade automatizada.',
    kubernetes: 'Com foco em segurança Kubernetes: RBAC, network segmentation, detecção de comportamentos anômalos e incident response.',
    devops:     'Com foco em shift-left security: integração em pipelines CI/CD, gating de builds e feedback imediato para devs.',
    containers: 'Com foco em segurança de imagens: análise de CVEs em containers, blocklist e políticas de deployment.',
  },
  acm: {
    _base: 'Red Hat Advanced Cluster Management (ACM): gerenciamento centralizado de múltiplos clusters Kubernetes/OpenShift.',
    cloud:      'Com foco em multi-cloud e hybrid: visibilidade, políticas e compliance em clusters on-prem e em múltiplas nuvens.',
    security:   'Com foco em governance: políticas centralizadas de segurança, compliance e configuração em todos os clusters.',
    automation: 'Com foco em GitOps multi-cluster: distribuição de aplicações via ArgoCD e conectividade via Submariner.',
    monitoring: 'Com foco em observabilidade fleet: métricas e alertas centralizados para todos os clusters gerenciados.',
  },
  odf: {
    _base: 'Red Hat OpenShift Data Foundation (ODF): storage software-defined para containers — block, file e object storage.',
    storage:    'Com foco em persistência: Ceph nativo, StorageClasses dinâmicas, snapshots, backup e recuperação de dados.',
    cloud:      'Com foco em hybrid storage: Multicloud Object Gateway e portabilidade de dados entre on-prem e nuvem.',
    kubernetes: 'Com foco em storage nativo Kubernetes: provisioner dinâmico, ReadWriteMany (RWX) e storage resiliente para workloads stateful.',
  },
  quay: {
    _base: 'Red Hat Quay: registry enterprise de imagens de container com alta disponibilidade, automação e segurança integrada.',
    security:   'Com foco em segurança de imagens: scanning de CVEs com Clair, políticas de acesso granulares e assinatura de imagens.',
    automation: 'Com foco em automação: integração com CI/CD, mirroring automático de registries e builds disparados por commits.',
    containers: 'Com foco em gerenciamento de imagens: organize repositórios, geo-replicação e controle de ciclo de vida de imagens.',
  },
  'openshift ai': {
    _base: 'Red Hat OpenShift AI (RHOAI): plataforma MLOps integrada ao OpenShift para desenvolver, treinar e servir modelos de IA/ML.',
    ai:         'Com foco em IA generativa: fine-tuning de LLMs, serving com vLLM/KServe, pipelines Kubeflow e Model Registry integrado.',
    devops:     'Com foco em MLOps: versionamento de modelos, reproducibilidade de experimentos e CI/CD para Machine Learning.',
    kubernetes: 'Com foco em operações: scheduling de GPU no OpenShift, isolamento de projetos e escalabilidade de inferência.',
  },
  'service mesh': {
    _base: 'Red Hat Service Mesh (baseado em Istio): gerenciamento de tráfego, observabilidade e segurança para microsserviços.',
    security:   'Com foco em segurança: mTLS automático entre serviços, políticas de autorização e auditoria de tráfego.',
    monitoring: 'Com foco em observabilidade: Kiali para topologia, Jaeger distributed tracing e métricas de microsserviços.',
    networking: 'Com foco em tráfego inteligente: canary releases, circuit breaker, retry policies e roteamento granular.',
  },
  serverless: {
    _base: 'Red Hat OpenShift Serverless (Knative): plataforma serverless e event-driven para aplicações que escalam automaticamente a zero.',
    automation: 'Com foco em event-driven: triggers, brokers e integração com Apache Kafka, AWS SNS e fontes de eventos externas.',
    devops:     'Com foco em modernização: migração de funções, escalonamento a zero e simplificação de operações sem gerenciar infraestrutura.',
    ai:         'Com foco em serving de modelos: deploy serverless de modelos de inferência com escalonamento por demanda.',
  },
  pipelines: {
    _base: 'Red Hat OpenShift Pipelines (Tekton): pipelines CI/CD cloud-native e Kubernetes-native para entrega contínua de aplicações.',
    automation: 'Com foco em automação: Tasks reutilizáveis, Workspaces compartilhados, triggers por eventos e integração com GitOps.',
    devops:     'Com foco em DevOps: build, teste e deploy automatizados com rollback inteligente e zero-downtime.',
    security:   'Com foco em DevSecOps: scanning de imagens no pipeline, assinatura com Cosign e gating por conformidade de segurança.',
  },
  gitops: {
    _base: 'Red Hat OpenShift GitOps (ArgoCD): gerenciamento declarativo de aplicações e configurações usando Git como fonte única de verdade.',
    automation: 'Com foco em automação: sync automático, drift detection e rollback declarativo para múltiplos ambientes (dev/staging/prod).',
    devops:     'Com foco em DevOps: fluxos GitOps com approvals, multi-tenant e progressive delivery com Argo Rollouts.',
    security:   'Com foco em auditoria e conformidade: rastreabilidade completa de mudanças, aprovações e rollback instantâneo.',
  },
  virtualization: {
    _base: 'Red Hat OpenShift Virtualization: execução de VMs tradicionais lado a lado com containers no OpenShift (baseado no KubeVirt).',
    cloud:      'Com foco em migração para nuvem híbrida: ferramentas de conversão de VMs e convivência de workloads legados com modernos.',
    devops:     'Com foco em modernização incremental: mover VMs para OpenShift sem reescrever aplicações, como passo para containerização.',
    automation: 'Com foco em automação de VMs: provisioning, snapshots e lifecycle de VMs via APIs Kubernetes-nativas.',
  },
};

// ---- Product key matching from name ----

function matchProductKey(productName) {
  const lower = productName.toLowerCase();
  if (/openshift ai|rhoai/.test(lower))                       return 'openshift ai';
  if (/advanced cluster security|acs\b|stackrox/.test(lower)) return 'acs';
  if (/advanced cluster management|acm\b/.test(lower))        return 'acm';
  if (/data foundation|odf\b/.test(lower))                    return 'odf';
  if (/service mesh/.test(lower))                             return 'service mesh';
  if (/serverless/.test(lower))                               return 'serverless';
  if (/pipeline/.test(lower))                                 return 'pipelines';
  if (/gitops/.test(lower))                                   return 'gitops';
  if (/virtualizat/.test(lower))                              return 'virtualization';
  if (/satellite/.test(lower))                                return 'satellite';
  if (/insights/.test(lower))                                 return 'insights';
  if (/ansible/.test(lower))                                  return 'ansible';
  if (/quay/.test(lower))                                     return 'quay';
  if (/openshift/.test(lower))                                return 'openshift';
  if (/rhel|enterprise linux/.test(lower))                    return 'rhel';
  return null;
}

// ---- Public API ----

/**
 * Generate a contextual description for a presentation based on the product
 * and the client's interests/description.
 *
 * @param {string} productName - Red Hat product name
 * @param {string[]} interests - Array of client interest tags
 * @param {string} clientDescription - Free-text description of client objectives
 * @returns {string} Tailored presentation description
 */
export function generateDescription(productName, interests = [], clientDescription = '') {
  const key = matchProductKey(productName);
  if (!key) return '';

  const template = PRODUCT_TEMPLATES[key];
  if (!template) return '';

  const categories = detectCategories(interests, clientDescription);

  // Pick up to 2 matching category additions to avoid overly long descriptions
  const additions = categories
    .filter((cat) => template[cat])
    .slice(0, 2)
    .map((cat) => template[cat]);

  if (!additions.length) return template._base;
  return [template._base, ...additions].join(' ');
}
