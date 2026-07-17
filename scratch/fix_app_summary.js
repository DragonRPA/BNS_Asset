const fs = require('fs');

const filePath = 'd:/BNS_Asset/app.js';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Fix recalculateSummary
const target1 = `  const exactF2Count = appData.exactMatches.filter(e => e.matchType.includes('??偓')).length;
  const exactF3Count = exactCount - exactF2Count;
  const simF2Approved = approvedSim.filter(s => s.matchType.includes('??偓')).length;
  const simF2Rejected = rejectedSim.filter(s => s.matchType.includes('??偓')).length;
  const simF3Rejected = rejectedSim.filter(s => s.matchType.includes('?岉儓??)).length;`;

// Let's use a regex to match the lines around those.
const regex1 = /const exactF2Count[\s\S]*?const simF3Rejected[\s\S]*?;/;
const replacement1 = `const exactF2Count = appData.exactMatches.filter(e => (e.matchType || '').includes('실사')).length;
  const exactF3Count = exactCount - exactF2Count;
  const simF2Approved = approvedSim.filter(s => (s.matchType || '').includes('실사')).length;
  const simF2Rejected = rejectedSim.filter(s => (s.matchType || '').includes('실사')).length;
  const simF3Rejected = rejectedSim.filter(s => (s.matchType || '').includes('렌탈')).length;`;

if (regex1.test(content)) {
  content = content.replace(regex1, replacement1);
} else {
  console.error("Warning: regex1 did not match directly, checking fallback...");
}

// 2. Fix renderDashboard details line
// Show breakdown details (??偓 vs ?岉儓??
// document.getElementById('metric-exact-details').innerText = `??偓 \${s.exactF2Count.toLocaleString()}??/ ?岉儓 \${s.exactF3Count.toLocaleString()}??;
const regex2 = /Show breakdown details[\s\S]*?metric-exact-details[\s\S]*?;/;
const replacement2 = `Show breakdown details (실사 vs 렌탈)
  document.getElementById('metric-exact-details').innerText = \`실사 \${s.exactF2Count.toLocaleString()}건 / 렌탈 \${s.exactF3Count.toLocaleString()}건\`;`;

if (regex2.test(content)) {
  content = content.replace(regex2, replacement2);
} else {
  console.error("Warning: regex2 did not match directly.");
}

fs.writeFileSync(filePath, content, 'utf8');
console.log("Done patching app.js!");
