const fs = require('fs');

const filePath = 'd:/BNS_Asset/app.js';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Fix getReconstructedActual
content = content.replace(/m\.matchType\.includes\('??偓'\)/g, "(m.matchType || '').includes('실사')");
content = content.replace(/m\.matchType\.includes\('\?\?偓'\)/g, "(m.matchType || '').includes('실사')");
content = content.replace(/m\.matchType\.includes\('[^']+'\)/g, function(match) {
  if (match.includes('?') || match.includes('偓')) {
    return "(m.matchType || '').includes('실사')";
  }
  return match;
});

// 2. Append closing brace to the end of app.js if it doesn't exist
content = content.trim();
if (!content.endsWith('}')) {
  content += '\n}';
  console.log("Appended closing brace to app.js");
}

fs.writeFileSync(filePath, content, 'utf8');
console.log("Patched getReconstructedActual and braces!");
