#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const repoRoot = process.cwd();

function getArg(flag, fallback) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) {
    return fallback;
  }
  return args[idx + 1];
}

const reportPath = getArg('--report', 'audit-report.json');
const exceptionsPath = getArg('--exceptions', 'security/audit-exceptions.json');
const now = new Date();

function resolveInsideRepo(filePath) {
  const resolved = path.resolve(repoRoot, filePath);
  const rootWithSep = repoRoot.endsWith(path.sep) ? repoRoot : repoRoot + path.sep;
  if (resolved !== repoRoot && !resolved.startsWith(rootWithSep)) {
    throw new Error(`Caminho fora do repositório recusado: ${filePath}`);
  }
  return resolved;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(resolveInsideRepo(filePath), 'utf8'));
}

const report = readJson(reportPath);
const exceptionsFile = readJson(exceptionsPath);
const exceptionMap = new Map(exceptionsFile.exceptions.map((item) => [item.package, item]));

const vulnerabilities = Object.values(report.vulnerabilities || {}).filter((vuln) =>
  ['high', 'critical'].includes(vuln.severity),
);

const failures = [];
const covered = [];

for (const vuln of vulnerabilities) {
  const exception = exceptionMap.get(vuln.name);

  if (!exception) {
    failures.push(
      `Pacote "${vuln.name}" com severidade "${vuln.severity}" sem exceção registrada em ${exceptionsPath}.`,
    );
    continue;
  }

  if (!exception.owner || !exception.expiresAt || !exception.reason) {
    failures.push(`Exceção inválida para "${vuln.name}": campos obrigatórios owner/expiresAt/reason.`);
    continue;
  }

  const expiresAt = new Date(exception.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    failures.push(`Exceção inválida para "${vuln.name}": expiresAt não é data válida.`);
    continue;
  }

  if (expiresAt < now) {
    failures.push(`Exceção expirada para "${vuln.name}" em ${exception.expiresAt}.`);
    continue;
  }

  covered.push(vuln.name);
}

for (const exception of exceptionsFile.exceptions) {
  if (!covered.includes(exception.package)) {
    console.log(`Aviso: exceção "${exception.package}" não aparece no relatório atual.`);
  }
}

if (failures.length > 0) {
  console.error('Falha na política de audit (high/critical):');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Audit policy OK: ${vulnerabilities.length} vulnerabilidades high/critical cobertas por exceções temporárias válidas.`,
);
