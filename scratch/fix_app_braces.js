const fs = require('fs');

const filePath = 'd:/BNS_Asset/app.js';
let content = fs.readFileSync(filePath, 'utf8');

const regexBraces = /window\.toggleMatch = function\([\s\S]*?\}\s*\}\s*\}\s*\}\s*\}\s*;\s*\n\s*\/\/ Render unmatched billing table/;
const replacementBraces = `window.toggleMatch = function(index, approve) {
  // Update in-memory state
  appData.similarMatches[index].approved = approve;
  
  // Recalculate metrics and update dashboard cards / tab badges
  recalculateSummary();
  renderDashboard();
  
  // Update DOM in-place to prevent resetting scroll position
  const tr = document.getElementById(\`sim-row-\${index}\`);
  if (tr) {
    const statusPill = tr.querySelector('.status-pill');
    if (statusPill) {
      if (approve) {
        statusPill.className = 'status-pill approved';
        statusPill.innerText = '승인됨';
      } else {
        statusPill.className = 'status-pill rejected';
        statusPill.innerText = '제외됨';
      }
    }
    
    // Toggle button styles
    const buttons = tr.querySelectorAll('.action-buttons-group .btn');
    if (buttons && buttons.length >= 2) {
      const btnApprove = buttons[0];
      const btnExclude = buttons[1];
      if (approve) {
        btnApprove.className = 'btn btn-success btn-sm';
        btnExclude.className = 'btn btn-outline btn-sm';
      } else {
        btnApprove.className = 'btn btn-outline btn-sm';
        btnExclude.className = 'btn btn-danger btn-sm';
      }
    }
  }
}

// Render unmatched billing table`;

// Let's use regex pattern search/replace that handles newlines safely.
const targetRegex = /    \}\s*\}\s*\}\s*\}\s*\}\s*;\s*\n\s*\/\/ Render unmatched billing table/;
if (targetRegex.test(content)) {
  content = content.replace(targetRegex, `    }\n  }\n}\n\n// Render unmatched billing table`);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log("Successfully fixed extra braces!");
} else {
  // If the strict block regex fits better:
  const blockRegex = /window\.toggleMatch = function[\s\S]*?\/\/ Render unmatched billing table/;
  if (blockRegex.test(content)) {
    content = content.replace(blockRegex, replacementBraces);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("Successfully replaced toggleMatch block to fix braces!");
  } else {
    console.error("Error: Could not match braces pattern.");
  }
}
