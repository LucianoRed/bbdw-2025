import { getRedis } from './db.js';
import { parse } from 'node-html-parser';

const PRODUCTS_URL = 'https://docs.redhat.com/en/products';
const CACHE_KEY = 'rhd:products:cache';
const CACHE_TTL_SECONDS = 86400; // 24h

// Fallback list — used when scraping fails
const FALLBACK_PRODUCTS = [
  { name: 'Red Hat Enterprise Linux', slug: 'red_hat_enterprise_linux', category: 'Infrastructure' },
  { name: 'Red Hat OpenShift', slug: 'openshift_container_platform', category: 'Cloud & Containers' },
  { name: 'Red Hat OpenShift AI', slug: 'red_hat_openshift_ai_self_managed', category: 'AI & Machine Learning' },
  { name: 'Red Hat Ansible Automation Platform', slug: 'red_hat_ansible_automation_platform', category: 'Automation' },
  { name: 'Red Hat OpenStack Platform', slug: 'red_hat_openstack_platform', category: 'Cloud & Containers' },
  { name: 'Red Hat Satellite', slug: 'red_hat_satellite', category: 'Management' },
  { name: 'Red Hat Insights', slug: 'red_hat_insights', category: 'Management' },
  { name: 'Red Hat Advanced Cluster Management', slug: 'red_hat_advanced_cluster_management_for_kubernetes', category: 'Cloud & Containers' },
  { name: 'Red Hat Advanced Cluster Security', slug: 'red_hat_advanced_cluster_security_for_kubernetes', category: 'Security' },
  { name: 'Red Hat Quay', slug: 'red_hat_quay', category: 'Cloud & Containers' },
  { name: 'Red Hat OpenShift Virtualization', slug: 'openshift_container_platform', category: 'Cloud & Containers' },
  { name: 'Red Hat OpenShift Service Mesh', slug: 'openshift_service_mesh', category: 'Cloud & Containers' },
  { name: 'Red Hat OpenShift Pipelines', slug: 'red_hat_openshift_pipelines', category: 'Developer Tools' },
  { name: 'Red Hat OpenShift GitOps', slug: 'red_hat_openshift_gitops', category: 'Developer Tools' },
  { name: 'Red Hat OpenShift Dev Spaces', slug: 'red_hat_openshift_dev_spaces', category: 'Developer Tools' },
  { name: 'Red Hat Data Foundation', slug: 'red_hat_openshift_data_foundation', category: 'Storage' },
  { name: 'Red Hat OpenShift Data Science', slug: 'red_hat_openshift_ai_self_managed', category: 'AI & Machine Learning' },
  { name: 'Red Hat Process Automation Manager', slug: 'red_hat_process_automation', category: 'Middleware' },
  { name: 'Red Hat Integration', slug: 'red_hat_fuse', category: 'Middleware' },
  { name: 'Red Hat AMQ', slug: 'red_hat_amq', category: 'Middleware' },
  { name: 'Red Hat JBoss Enterprise Application Platform', slug: 'red_hat_jboss_enterprise_application_platform', category: 'Middleware' },
  { name: 'Red Hat Single Sign-On', slug: 'red_hat_single_sign-on', category: 'Security' },
  { name: 'Red Hat Certificate System', slug: 'red_hat_certificate_system', category: 'Security' },
  { name: 'Red Hat Directory Server', slug: 'red_hat_directory_server', category: 'Security' },
  { name: 'Red Hat Identity Management', slug: 'red_hat_enterprise_linux', category: 'Security' },
  { name: 'Red Hat Ceph Storage', slug: 'red_hat_ceph_storage', category: 'Storage' },
  { name: 'Red Hat Gluster Storage', slug: 'red_hat_gluster_storage', category: 'Storage' },
  { name: 'Red Hat 3scale API Management', slug: 'red_hat_3scale_api_management', category: 'Middleware' },
  { name: 'Red Hat OpenShift API Management', slug: 'red_hat_openshift_api_management', category: 'Middleware' },
  { name: 'Red Hat OpenShift Serverless', slug: 'openshift_serverless', category: 'Cloud & Containers' },
  { name: 'Red Hat Trusted Application Pipeline', slug: 'red_hat_trusted_application_pipeline', category: 'Security' },
  { name: 'Red Hat OpenShift Container Storage', slug: 'red_hat_openshift_data_foundation', category: 'Storage' },
];

async function scrapeProducts() {
  try {
    const res = await fetch(PRODUCTS_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RedHatDayPlanner/1.0)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const root = parse(html);

    const products = [];

    // Try several CSS selector patterns docs.redhat.com uses
    const cards = root.querySelectorAll('a.pf-v5-c-card, a[data-testid], .product-card a, article a, li a[href*="/products/"]');
    for (const card of cards) {
      const nameEl = card.querySelector('h3, h4, .pf-v5-c-card__title, .product-name, strong');
      const name = nameEl ? nameEl.text.trim() : card.text.trim();
      const href = card.getAttribute('href') || '';
      if (!name || name.length < 3) continue;
      const slug = href.split('/').filter(Boolean).pop() || '';
      const catEl = card.closest('[data-category], section');
      const category = catEl ? (catEl.getAttribute('data-category') || catEl.querySelector('h2, h3')?.text?.trim() || '') : '';
      if (name.toLowerCase().includes('red hat') || href.includes('/en/products/')) {
        products.push({ name, slug, category });
      }
    }

    // Deduplicate by name
    const seen = new Set();
    const unique = products.filter((p) => {
      if (seen.has(p.name)) return false;
      seen.add(p.name);
      return true;
    });

    if (unique.length >= 5) return unique;
    console.error('[RHD] Scraping returned too few results, using fallback');
    return FALLBACK_PRODUCTS;
  } catch (err) {
    console.error('[RHD] Scraping failed:', err.message, '— using fallback list');
    return FALLBACK_PRODUCTS;
  }
}

export async function getProducts(forceRefresh = false) {
  const r = getRedis();
  if (!forceRefresh) {
    try {
      const cached = await r.get(CACHE_KEY);
      if (cached) {
        try { return JSON.parse(cached); } catch { /* ignore parse error */ }
      }
    } catch { /* Redis unavailable — skip cache */ }
  }
  const products = await scrapeProducts();
  try {
    await r.set(CACHE_KEY, JSON.stringify(products), 'EX', CACHE_TTL_SECONDS);
  } catch { /* Redis unavailable — skip caching */ }
  return products;
}

export async function invalidateProductsCache() {
  try {
    const r = getRedis();
    await r.del(CACHE_KEY);
  } catch { /* ignore */ }
}
