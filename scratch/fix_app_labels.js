const fs = require('fs');

const filePath = 'd:/BNS_Asset/app.js';
let content = fs.readFileSync(filePath, 'utf8');

// Replace tab data count labels
const regexTabs = /\/\/ Update tab data count labels[\s\S]*?function simF2Total\(\) {[\s\S]*?}/;
const replacementTabs = `// Update tab data count labels
  const countSimilar = document.getElementById('count-similar');
  const countUnmatchedB = document.getElementById('count-unmatched-b');
  const countUnmatchedA = document.getElementById('count-unmatched-a');
  const countExact = document.getElementById('count-exact');
  const totalSim = appData.similarMatches.length;
  
  if (countSimilar) {
    countSimilar.innerText = \`유사 \${totalSim.toLocaleString()}건 (승인 \${s.approvedSimCount.toLocaleString()}건 / 제외 \${(totalSim - s.approvedSimCount).toLocaleString()}건)\`;
  }
  if (countUnmatchedB) {
    countUnmatchedB.innerText = \`청구 \${s.unmatchedBillingCount.toLocaleString()}건\`;
  }
  if (countUnmatchedA) {
    countUnmatchedA.innerText = \`실사 \${s.unmatchedActualCount.toLocaleString()}건\`;
  }
  if (countExact) {
    countExact.innerText = \`일치 \${s.exactMatchesCount.toLocaleString()}건 (실사 \${s.exactF2Count.toLocaleString()}건 / 렌탈 \${s.exactF3Count.toLocaleString()}건)\`;
  }
}

// Helper to get total F2 similar match count (approved + rejected) for verification display
function simF2Total() {
  return appData.similarMatches.filter(s => (s.matchType || '').includes('실사')).length;
}`;

if (regexTabs.test(content)) {
  content = content.replace(regexTabs, replacementTabs);
} else {
  console.error("Warning: count labels replacement did not match.");
}

// Replace verify labels text
// billingVerifyEl
const regexBill = /billingVerifyEl\.innerText = `\?\s*€\s*歃\s*漁\s*K:[\s\S]*?`;/g;
// Let's replace the block of verification texts directly:
const regexVerifyBlock = /if \(billingDiff === 0\) {[\s\S]*?billingVerifyEl\.innerText = `[\s\S]*?`;[\s\S]*?} else {[\s\S]*?billingVerifyEl\.innerText = `[\s\S]*?`;[\s\S]*?}[\s\S]*?if \(actualDiff === 0\) {[\s\S]*?actualVerifyEl\.innerText = `[\s\S]*?`;[\s\S]*?} else {[\s\S]*?actualVerifyEl\.innerText = `[\s\S]*?`;[\s\S]*?}/;

const replacementVerifyBlock = `if (billingDiff === 0) {
      billingVerifyEl.style.background = '#e8f5e9';
      billingVerifyEl.style.color = '#2e7d32';
      billingVerifyEl.innerText = \`검증 OK: \${s.exactMatchesCount}+\${s.approvedSimCount}+\${s.unmatchedBillingCount}=\${s.billingPartitionSum.toLocaleString()}\`;
    } else {
      billingVerifyEl.style.background = '#ffebee';
      billingVerifyEl.style.color = '#c62828';
      billingVerifyEl.innerText = \`검증오차: 합계=\${s.billingPartitionSum.toLocaleString()} (차이 \${billingDiff})\`;
    }
  }
  
  if (actualVerifyEl) {
    actualVerifyEl.style.display = 'inline-block';
    if (actualDiff === 0) {
      actualVerifyEl.style.background = '#e8f5e9';
      actualVerifyEl.style.color = '#2e7d32';
      actualVerifyEl.innerText = \`검증 OK: \${s.exactF2Count}+\${simF2Total()}+\${s.unmatchedActualCount}=\${s.actualPartitionSum.toLocaleString()}\`;
    } else {
      actualVerifyEl.style.background = '#ffebee';
      actualVerifyEl.style.color = '#c62828';
      actualVerifyEl.innerText = \`검증오차: 합계=\${s.actualPartitionSum.toLocaleString()} (차이 \${actualDiff})\`;
    }
  }`;

if (regexVerifyBlock.test(content)) {
  content = content.replace(regexVerifyBlock, replacementVerifyBlock);
} else {
  console.error("Warning: verify block replacement did not match.");
}

fs.writeFileSync(filePath, content, 'utf8');
console.log("Labels patched successfully.");
