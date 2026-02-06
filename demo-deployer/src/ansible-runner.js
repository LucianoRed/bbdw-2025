// ============================================================
// demo-deployer/src/ansible-runner.js — Executa playbooks Ansible
// ============================================================

import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ANSIBLE_DIR = path.resolve(__dirname, "../ansible");

/**
 * Executa um playbook Ansible e retorna o resultado.
 * @param {string} playbook - Nome do playbook (ex: deploy-component.yml)
 * @param {object} extraVars - Variáveis extras para --extra-vars
 * @param {function} onOutput - Callback para streaming de output (line) => void
 * @returns {Promise<{success: boolean, output: string, exitCode: number}>}
 */
export function runPlaybook(playbook, extraVars = {}, onOutput = null) {
  return new Promise((resolve) => {
    const args = [
      "-i", path.join(ANSIBLE_DIR, "inventory"),
      path.join(ANSIBLE_DIR, playbook),
    ];

    // Grava extra-vars em arquivo temporário para evitar problemas de escaping
    let varsFile = null;
    if (Object.keys(extraVars).length > 0) {
      varsFile = path.join(os.tmpdir(), `ansible-vars-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      fs.writeFileSync(varsFile, JSON.stringify(extraVars), "utf-8");
      args.push("--extra-vars", `@${varsFile}`);
    }

    // Sempre no modo verbose
    args.push("-v");

    console.log(`[Ansible] Executando: ansible-playbook ${playbook} (extra-vars via arquivo)`);

    const proc = spawn("ansible-playbook", args, {
      cwd: ANSIBLE_DIR,
      env: {
        ...process.env,
        ANSIBLE_FORCE_COLOR: "false",
        ANSIBLE_NOCOLOR: "true",
        HOME: process.env.HOME || "/app",
        ANSIBLE_LOCAL_TEMP: process.env.ANSIBLE_LOCAL_TEMP || "/app/.ansible/tmp",
        ANSIBLE_REMOTE_TEMP: process.env.ANSIBLE_REMOTE_TEMP || "/app/.ansible/tmp",
      },
    });

    let output = "";

    proc.stdout.on("data", (data) => {
      const text = data.toString();
      output += text;
      if (onOutput) onOutput(text);
    });

    proc.stderr.on("data", (data) => {
      const text = data.toString();
      output += text;
      if (onOutput) onOutput(text);
    });

    proc.on("close", (code) => {
      // Limpa arquivo temporário
      if (varsFile) {
        try { fs.unlinkSync(varsFile); } catch (_) { /* ignore */ }
      }
      resolve({
        success: code === 0,
        output,
        exitCode: code,
      });
    });

    proc.on("error", (err) => {
      if (varsFile) {
        try { fs.unlinkSync(varsFile); } catch (_) { /* ignore */ }
      }
      resolve({
        success: false,
        output: `Erro ao executar Ansible: ${err.message}`,
        exitCode: -1,
      });
    });
  });
}

/**
 * Executa o oc CLI diretamente para queries rápidas.
 */
export function runOcCommand(args, ocpApiUrl, ocpToken) {
  return new Promise((resolve) => {
    const fullArgs = [...args];

    const proc = spawn("oc", fullArgs, {
      env: {
        ...process.env,
        KUBECONFIG: "/tmp/deployer-kubeconfig",
      },
    });

    let output = "";

    proc.stdout.on("data", (data) => { output += data.toString(); });
    proc.stderr.on("data", (data) => { output += data.toString(); });

    proc.on("close", (code) => {
      resolve({ success: code === 0, output, exitCode: code });
    });

    proc.on("error", (err) => {
      resolve({ success: false, output: err.message, exitCode: -1 });
    });
  });
}
