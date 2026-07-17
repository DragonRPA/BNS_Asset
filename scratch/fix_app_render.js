const fs = require('fs');

const filePath = 'd:/BNS_Asset/app.js';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Remove the extra closing brace and fix corrupt characters inside renderDashboard
const targetSegmentRegex = /if \(actualVerifyEl\) {[\s\S]*?actualVerifyEl\.innerText = `[\s\S]*?`;[\s\S]*?}[\s\S]*?}[\s\S]*?\}\s*\/\/\s*Update tab data count labels/;

// Let's replace the verification block + tab labels update block in renderDashboard cleanly
const regexBlock = /function renderDashboard\(\) {[\s\S]*?\/\/ Save final report to backend folder/;

const replacementBlock = `function renderDashboard() {
  const s = appData.summary;
  document.getElementById('metric-billing-total').innerText = s.billingTotal.toLocaleString();
  document.getElementById('metric-actual-total').innerText = s.actualTotal.toLocaleString();
  document.getElementById('metric-exact').innerText = s.exactMatchesCount.toLocaleString();
  
  // Show breakdown details (실사 vs 렌탈)
  document.getElementById('metric-exact-details').innerText = \`실사 \${s.exactF2Count.toLocaleString()}건 / 렌탈 \${s.exactF3Count.toLocaleString()}건\`;

  // Display only approved similar matches count in the main value of the card
  document.getElementById('metric-similar').innerText = s.approvedSimCount.toLocaleString();
  
  document.getElementById('metric-unmatched-b').innerText = s.unmatchedBillingCount.toLocaleString();
  document.getElementById('metric-unmatched-a').innerText = s.unmatchedActualCount.toLocaleString();

  document.getElementById('badge-similar').innerText = appData.similarMatches.length;
  document.getElementById('badge-unmatched-b').innerText = s.unmatchedBillingCount;
  document.getElementById('badge-unmatched-a').innerText = s.unmatchedActualCount;
  document.getElementById('badge-exact').innerText = s.exactMatchesCount;

  const totalSim = appData.similarMatches.length;
  document.getElementById('sim-review-progress').innerText = \`\${s.approvedSimCount}건 승인 / \${totalSim - s.approvedSimCount}건 제외\`;

  // Verification: Show partition sum vs raw total on Cards 1 & 2
  const billingVerifyEl = document.getElementById('metric-billing-verify');
  const actualVerifyEl = document.getElementById('metric-actual-verify');
  
  const billingDiff = s.billingTotal - s.billingPartitionSum;
  const actualDiff = s.actualTotal - s.actualPartitionSum;

  if (billingVerifyEl) {
    billingVerifyEl.style.display = 'inline-block';
    if (billingDiff === 0) {
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
  }

  // Update tab data count labels
  const countSimilar = document.getElementById('count-similar');
  const countUnmatchedB = document.getElementById('count-unmatched-b');
  const countUnmatchedA = document.getElementById('count-unmatched-a');
  const countExact = document.getElementById('count-exact');
  
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
}

// Save final report to backend folder
`;

if (regexBlock.test(content)) {
  content = content.replace(regexBlock, replacementBlock);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log("Successfully rebuilt renderDashboard!");
} else {
  console.error("Error: Could not match renderDashboard block regex.");
}
