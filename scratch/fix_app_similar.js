const fs = require('fs');

const filePath = 'd:/BNS_Asset/app.js';
let content = fs.readFileSync(filePath, 'utf8');

const regexTableAndToggle = /\/\/ Render similar matches table with filters[\s\S]*?const buttons = tr\.querySelectorAll\('\.action-buttons-group \.btn'\);[\s\S]*?const btnApprove = buttons\[0\];[\s\S]*?const btnExclude = buttons\[1\];/;
// Let's use a broader regex to capture renderSimilarTable and toggleMatch completely.
const regexBlock = /function renderSimilarTable\(query\) {[\s\S]*?window\.toggleMatch = function\(index, approve\) {[\s\S]*?btnExclude\.className = [^\n]*;\s*\}\s*\n\s*\}\s*\n/;

const replacementBlock = `function renderSimilarTable(query) {
  const tbody = document.getElementById('tbody-similar');
  tbody.innerHTML = '';

  const showHigh = filterConfHigh.checked;
  const showLow = filterConfLow.checked;

  let filtered = appData.similarMatches.filter(match => {
    if (match.confidence === 'High' && !showHigh) return false;
    if (match.confidence === 'Low' && !showLow) return false;

    if (query) {
      const bText = \`\${match.billing.name} \${match.billing.empId} \${match.billing.dept} \${match.billing.serial} \${match.billing.model}\`.toLowerCase();
      const aText = \`\${match.actual.name} \${match.actual.empId} \${match.actual.dept} \${match.actual.serial} \${match.actual.model}\`.toLowerCase();
      return bText.includes(query) || aText.includes(query);
    }
    return true;
  });

  // Sort: Unapproved (approved === false) first, Approved (approved === true) last
  filtered.sort((a, b) => {
    if (a.approved === b.approved) return 0;
    return a.approved ? 1 : -1;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = \`<tr><td colspan="10" style="text-align: center; color: var(--text-secondary); padding: 2rem;">검색어 조건에 부합하는 대조 결과 데이터가 없습니다.</td></tr>\`;
    return;
  }

  filtered.forEach((match) => {
    const originalIndex = appData.similarMatches.findIndex(s => s.billing._id === match.billing._id);
    const tr = document.createElement('tr');
    tr.id = \`sim-row-\${originalIndex}\`;
    
    let statusText = '대기중';
    let statusClass = 'pending';
    if (match.approved === true) {
      statusText = '승인됨';
      statusClass = 'approved';
    } else if (match.approved === false) {
      statusText = '제외됨';
      statusClass = 'rejected';
    }

    const confBadge = match.confidence === 'High' ? 'tag-success' : 'tag-warning';
    
    // Highlight differences
    const { htmlA, htmlB } = alignSerials(match.billing.serial, match.actual.serial);
    
    const billingMeta = \`<div style="font-weight:bold; font-size:0.8rem;">\${match.billing.name} <span style="font-weight:normal; font-size:0.7rem; color:var(--text-secondary);">(\${match.billing.empId || '사번없음'})</span></div><div style="font-size:0.7rem; color:var(--text-secondary);">\${match.billing.dept} | \${match.billing.device} | \${match.billing.model}</div>\`;
    const actualMeta = \`<div style="font-weight:bold; font-size:0.8rem;">\${match.actual.name} <span style="font-weight:normal; font-size:0.7rem; color:var(--text-secondary);">(\${match.actual.empId || '사번없음'})</span></div><div style="font-size:0.7rem; color:var(--text-secondary);">\${match.actual.dept} | \${match.actual.device} | \${match.actual.model}</div>\`;

    // Metadata comparison logic (Name, EmpID, Department)
    const nameMatch = cleanName(match.billing.name) === cleanName(match.actual.name);
    const empIdMatch = compareEmpId(match.billing.empId, match.actual.empId);
    const deptMatch = String(match.billing.dept || '').trim() === String(match.actual.dept || '').trim();

    const nameHtml = nameMatch
      ? \`<span style="color:var(--success-color); font-weight:bold;">이름 일치</span>\`
      : \`<span style="color:var(--danger-color); font-weight:bold;">이름 불일치 (\${match.billing.name} vs \${match.actual.name})</span>\`;

    const empIdHtml = empIdMatch
      ? \`<span style="color:var(--success-color); font-weight:bold;">사번 일치</span>\`
      : \`<span style="color:var(--danger-color); font-weight:bold;">사번 불일치 (\&{match.billing.empId || '없음'} vs \&{match.actual.empId || '없음'})</span>\`;

    const deptHtml = deptMatch
      ? \`<span style="color:var(--success-color); font-weight:bold;">부서 일치</span>\`
      : \`<span style="color:var(--danger-color); font-weight:bold;">부서 불일치</span>\`;

    const metaCompareHtml = \`
      <div style="font-size:0.7rem; line-height:1.2; display:flex; flex-direction:column; gap:1px;">
        <div>\${nameHtml}</div>
        <div>\${empIdHtml}</div>
        <div>\${deptHtml}</div>
      </div>
    \`;

    const matchTypeBadge = (match.matchType || '').includes('실사')
      ? \`<span class="metric-tag" style="background-color:#ebf8ff; color:#2b6cb0; border:1px solid #bee3f8; display:inline-block; font-size:0.65rem; font-weight:bold; padding:1px 4px;">실사 대조</span>\`
      : \`<span class="metric-tag" style="background-color:#faf5ff; color:#6b46c1; border:1px solid #e9d8fd; display:inline-block; font-size:0.65rem; font-weight:bold; padding:1px 4px;">렌탈 대조</span>\`;

    // Rental match indicators
    let rentalInfoA = \`<span style="font-size:0.65rem; color:var(--text-secondary); margin-left:6px;">렌탈사 불일치</span>\`;
    if (match.billingRentalMatch && match.billingRentalMatch.matched) {
      rentalInfoA = \`<span style="font-size:0.65rem; color:var(--success-color); font-weight:bold; margin-left:6px;">렌탈사 일치 (\${match.billingRentalMatch.assetNo || ''})</span>\`;
    }

    let rentalInfoB = \`<span style="font-size:0.65rem; color:var(--text-secondary); margin-left:6px;">렌탈사 불일치</span>\`;
    if (match.actualRentalMatch && match.actualRentalMatch.matched) {
      rentalInfoB = \`<span style="font-size:0.65rem; color:var(--success-color); font-weight:bold; margin-left:6px;">렌탈사 일치 (\${match.actualRentalMatch.assetNo || ''})</span>\`;
    }

    tr.innerHTML = \`
      <td style="text-align: center;"><span class="status-pill \${statusClass}" style="padding:1px 4px; font-size:0.7rem;">\${statusText}</span></td>
      <td style="text-align: center;">
        <span class="metric-tag \${confBadge}" style="display:inline-block; margin-top:0; font-size:0.6rem; padding:1px 3px;">\${match.confidence === 'High' ? '높음' : '낮음'}</span>
        <div style="font-size:0.6rem; color:var(--text-secondary); margin-top:1px;">\${match.reason}</div>
      </td>
      <td style="text-align: center;">\${matchTypeBadge}</td>
      <td>\${billingMeta}</td>
      <td style="font-family: monospace; font-size: 0.85rem; font-weight: 500; letter-spacing: 0.02em; white-space: nowrap;">
        \${htmlA}
        \${rentalInfoA}
      </td>
      <td style="text-align: center;"><span class="dist-badge" style="padding:1px 4px; font-size:0.75rem;">\${match.distance}</span></td>
      <td style="font-family: monospace; font-size: 0.85rem; font-weight: 500; letter-spacing: 0.02em; white-space: nowrap;">
        \${htmlB}
        \${rentalInfoB}
      </td>
      <td>\${actualMeta}</td>
      <td>\${metaCompareHtml}</td>
      <td>
        <div class="action-buttons-group">
          <button class="btn \${match.approved === true ? 'btn-success' : 'btn-outline'} btn-sm" style="padding:1px 4px; font-size:0.7rem; font-weight:bold;" onclick="toggleMatch(\${originalIndex}, true)">승인</button>
          <button class="btn \${match.approved === false ? 'btn-danger' : 'btn-outline'} btn-sm" style="padding:1px 4px; font-size:0.7rem; font-weight:bold;" onclick="toggleMatch(\${originalIndex}, false)">제외</button>
        </div>
      </td>
    \`;
    tbody.appendChild(tr);
  });
}

window.toggleMatch = function(index, approve) {
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
`;

// Run replace
if (regexBlock.test(content)) {
  content = content.replace(regexBlock, replacementBlock);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log("Successfully rebuilt renderSimilarTable and toggleMatch!");
} else {
  console.error("Error: Could not match renderSimilarTable block regex.");
}
