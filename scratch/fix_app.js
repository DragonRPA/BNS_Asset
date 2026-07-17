const fs = require('fs');
const path = require('path');

const filePath = 'd:/BNS_Asset/app.js';
let content = fs.readFileSync(filePath, 'utf8');

const regex = /function autoSelectDefaultKey[\s\S]*?async function runCompare/;

const replacement = `function autoSelectDefaultKey(selectElem, fileNum) {
  const options = Array.from(selectElem.options).map(o => o.value);
  let matchedKey = "";

  const keywords = ["제조번호", "제조 번호", "시리얼", "SN", "SERIAL", "관리번호"];

  for (let kw of keywords) {
    const match = options.find(o => o.toUpperCase().includes(kw.toUpperCase()));
    if (match) {
      matchedKey = match;
      break;
    }
  }

  if (matchedKey) {
    selectElem.value = matchedKey;
  }
}

async function runCompare`;

if (regex.test(content)) {
  content = content.replace(regex, replacement);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('SUCCESS: Replaced autoSelectDefaultKey successfully!');
} else {
  console.error('ERROR: Could not find target pattern in app.js');
}
