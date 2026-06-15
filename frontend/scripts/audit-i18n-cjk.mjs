import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.resolve(root, "..");
const srcDir = path.join(root, "src");
const resourcesRoot = path.join(srcDir, "i18n", "resources");
const backendBalanceConfigRoot = path.join(workspaceRoot, "backend", "config", "balance");
const cjkPattern = /[\u4e00-\u9fff]/;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function walkFiles(dir, predicate, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, output);
    } else if (predicate(fullPath)) {
      output.push(fullPath);
    }
  }
  return output;
}

function flattenJson(value, prefix = "", output = {}) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) {
      flattenJson(child, prefix ? `${prefix}.${key}` : key, output);
    }
    return output;
  }
  output[prefix] = value;
  return output;
}

function collectJsonStrings(value, prefix = "", output = []) {
  if (typeof value === "string") {
    output.push({ key: prefix, value });
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      collectJsonStrings(child, `${prefix}[${index}]`, output);
    });
    return output;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) {
      collectJsonStrings(child, prefix ? `${prefix}.${key}` : key, output);
    }
  }
  return output;
}

function hasPath(object, key) {
  let cursor = object;
  for (const part of key.split(".")) {
    if (!cursor || typeof cursor !== "object" || !Object.prototype.hasOwnProperty.call(cursor, part)) {
      return false;
    }
    cursor = cursor[part];
  }
  return true;
}

function loadResources(language) {
  const languageDir = path.join(resourcesRoot, language);
  const bundles = {};
  const fileNames = fs.readdirSync(languageDir).filter((file) => file.endsWith(".json")).sort();
  for (const fileName of fileNames) {
    bundles[fileName.replace(/\.json$/, "")] = readJson(path.join(languageDir, fileName));
  }
  return bundles;
}

function keyExists(resources, key, namespaceHint) {
  if (key.includes(":")) {
    const [namespace, nestedKey] = key.split(/:(.*)/s);
    return Boolean(resources[namespace] && hasPath(resources[namespace], nestedKey));
  }
  if (namespaceHint) {
    return Boolean(resources[namespaceHint] && hasPath(resources[namespaceHint], key));
  }
  return Object.values(resources).some((bundle) => hasPath(bundle, key));
}

function getStringLiteral(node) {
  return node && ts.isStringLiteralLike(node) ? node.text : undefined;
}

function getDefaultText(node, sourceFile) {
  const literal = getStringLiteral(node);
  if (literal !== undefined) {
    return literal;
  }
  if (
    node &&
    (ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateExpression(node) ||
      ts.isTaggedTemplateExpression(node))
  ) {
    return node.getText(sourceFile);
  }
  return undefined;
}

function getDefaultValueFromSource(node, sourceFile) {
  const text = getDefaultText(node, sourceFile);
  if (text !== undefined) {
    return text;
  }
  if (!node || !ts.isObjectLiteralExpression(node)) {
    return undefined;
  }
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    const name = property.name;
    const isDefaultValue =
      (ts.isIdentifier(name) && name.text === "defaultValue") ||
      (ts.isStringLiteral(name) && name.text === "defaultValue");
    if (isDefaultValue) {
      return getDefaultText(property.initializer, sourceFile);
    }
  }
  return undefined;
}

function getUseTranslationNamespace(node) {
  if (!ts.isCallExpression(node)) {
    return undefined;
  }
  const expressionText = node.expression.getText();
  if (expressionText !== "useTranslation") {
    return undefined;
  }
  return getStringLiteral(node.arguments[0]);
}

function getDestructuredTranslationBindings(node) {
  if (!ts.isVariableDeclaration(node) || !ts.isObjectBindingPattern(node.name)) {
    return [];
  }
  const namespace = node.initializer ? getUseTranslationNamespace(node.initializer) : undefined;
  if (!namespace) {
    return [];
  }
  return node.name.elements
    .filter((element) => {
      const propertyName = element.propertyName;
      return (
        (ts.isIdentifier(element.name) && element.name.text === "t") ||
        (propertyName && ts.isIdentifier(propertyName) && propertyName.text === "t") ||
        (propertyName && ts.isStringLiteral(propertyName) && propertyName.text === "t")
      );
    })
    .map((element) => ({
      name: ts.isIdentifier(element.name) ? element.name.text : undefined,
      namespace,
    }))
    .filter((binding) => binding.name);
}

function getCallNamespaceHint(node, translationBindings, defaultNamespaceHint) {
  if (ts.isIdentifier(node.expression)) {
    return translationBindings.get(node.expression.text) ?? defaultNamespaceHint;
  }
  return defaultNamespaceHint;
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function auditEnglishResourceValues(enResources) {
  const findings = [];
  for (const [namespace, bundle] of Object.entries(enResources).sort(([a], [b]) => a.localeCompare(b))) {
    for (const [key, value] of Object.entries(flattenJson(bundle))) {
      if (typeof value === "string" && cjkPattern.test(value)) {
        findings.push({
          type: "english-resource-cjk",
          file: `src/i18n/resources/en/${namespace}.json`,
          key,
          value,
        });
      }
    }
  }
  return findings;
}

function auditResourceParity(enResources, zhResources) {
  const findings = [];
  const namespaces = new Set([...Object.keys(enResources), ...Object.keys(zhResources)].sort());
  for (const namespace of namespaces) {
    const enFlat = flattenJson(enResources[namespace] ?? {});
    const zhFlat = flattenJson(zhResources[namespace] ?? {});
    for (const key of Object.keys(zhFlat)) {
      if (!Object.prototype.hasOwnProperty.call(enFlat, key)) {
        findings.push({
          type: "missing-en-resource-key",
          file: `src/i18n/resources/en/${namespace}.json`,
          key,
          value: String(zhFlat[key]),
        });
      }
    }
  }
  return findings;
}

function auditMissingKeysWithChineseDefaults(enResources) {
  const findings = [];
  const files = walkFiles(
    srcDir,
    (filePath) => {
      const relativePath = path.relative(srcDir, filePath);
      return (
        /\.(ts|tsx)$/.test(filePath) &&
        !/\.d\.ts$/.test(filePath) &&
        !/\.(test|spec)\.(ts|tsx)$/.test(filePath) &&
        !relativePath.split(path.sep).some((part) => part === "__tests__" || part === "test" || part === "tests")
      );
    },
  );

  for (const filePath of files) {
    const text = fs.readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(
      filePath,
      text,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const translationBindings = new Map();
    let defaultNamespaceHint;

    function visit(node) {
      for (const binding of getDestructuredTranslationBindings(node)) {
        translationBindings.set(binding.name, binding.namespace);
      }
      if (ts.isCallExpression(node)) {
        const expressionText = node.expression.getText(sourceFile);
        const translationNamespace = getUseTranslationNamespace(node);
        if (translationNamespace) {
          defaultNamespaceHint = translationNamespace;
        }
        if (expressionText === "t" || expressionText === "i18n.t" || expressionText.endsWith(".t")) {
          const key = getStringLiteral(node.arguments[0]);
          const defaultValue = getDefaultValueFromSource(node.arguments[1], sourceFile);
          const namespaceHint = getCallNamespaceHint(node, translationBindings, defaultNamespaceHint);
          if (key && defaultValue && cjkPattern.test(defaultValue) && !keyExists(enResources, key, namespaceHint)) {
            findings.push({
              type: "missing-key-with-chinese-default",
              file: path.relative(root, filePath),
              line: lineOf(sourceFile, node),
              key,
              value: defaultValue,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }
  return findings;
}

function auditCssGeneratedContent() {
  const findings = [];
  const files = walkFiles(srcDir, (filePath) => filePath.endsWith(".css"));
  const contentPattern = /content\s*:\s*(["'])(.*?)\1/g;

  for (const filePath of files) {
    const textWithoutComments = fs.readFileSync(filePath, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const match of textWithoutComments.matchAll(contentPattern)) {
      const value = match[2] ?? "";
      if (!cjkPattern.test(value)) {
        continue;
      }
      const line = textWithoutComments.slice(0, match.index).split(/\r?\n/).length;
      findings.push({
        type: "css-generated-content-cjk",
        file: path.relative(root, filePath),
        line,
        key: "content",
        value,
      });
    }
  }

  return findings;
}

function auditBackendBalanceConfigLabels(enResources) {
  const findings = [];
  if (!fs.existsSync(backendBalanceConfigRoot)) {
    return findings;
  }

  const backendLabels = enResources.game?.backendLabels;
  const labelMap = backendLabels && typeof backendLabels === "object" ? backendLabels : {};
  const files = walkFiles(backendBalanceConfigRoot, (filePath) => filePath.endsWith(".json"));

  for (const filePath of files) {
    const strings = collectJsonStrings(readJson(filePath));
    for (const { key, value } of strings) {
      if (!cjkPattern.test(value) || Object.prototype.hasOwnProperty.call(labelMap, value)) {
        continue;
      }
      findings.push({
        type: "backend-balance-config-cjk-without-en-label",
        file: path.relative(workspaceRoot, filePath),
        key,
        value,
      });
    }
  }

  return findings;
}

const enResources = loadResources("en");
const zhResources = loadResources("zh");
const findings = [
  ...auditEnglishResourceValues(enResources),
  ...auditResourceParity(enResources, zhResources),
  ...auditMissingKeysWithChineseDefaults(enResources),
  ...auditCssGeneratedContent(),
  ...auditBackendBalanceConfigLabels(enResources),
];

if (findings.length > 0) {
  console.error(`i18n CJK audit failed with ${findings.length} finding(s):`);
  for (const finding of findings) {
    const location = finding.line ? `${finding.file}:${finding.line}` : finding.file;
    console.error(`[${finding.type}] ${location} ${finding.key}: ${finding.value}`);
  }
  process.exit(1);
}

console.log("i18n CJK audit passed.");
