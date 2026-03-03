const fs = require('fs');
const path = require('path');

const filesToScan = ['server.js', 'app.js', 'styles.css', 'index.html'];

const suspiciousPatterns = [
  /^diff --git\s+/m,
  /^index\s+[0-9a-f]{7,}\.{2}[0-9a-f]{7,}/m,
  /^@@\s+-\d+,?\d*\s+\+\d+,?\d*\s+@@/m,
  /^<<<<<<<\s+/m,
  /^=======\s*$/m,
  /^>>>>>>>\s+/m,
];

const problems = [];

for (const relativePath of filesToScan) {
  const fullPath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(fullPath)) continue;

  const content = fs.readFileSync(fullPath, 'utf8');
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(content)) {
      problems.push({ file: relativePath, pattern: String(pattern) });
      break;
    }
  }
}

if (problems.length > 0) {
  console.error('Kaynak dosyalarda diff/merge kalıntısı tespit edildi:');
  for (const item of problems) {
    console.error(`- ${item.file} (${item.pattern})`);
  }
  console.error('\nDeploy öncesi bu satırları temizleyip tekrar push et.');
  process.exit(1);
}

console.log('Kaynak doğrulaması temiz: diff/merge kalıntısı bulunmadı.');
