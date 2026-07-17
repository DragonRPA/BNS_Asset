// Global Error Handler to print exception and halt all operations
function haltApplication(message, details = "") {
  console.error("Fatal Application Error:", message, details);
  alert(`치명적인 오류가 발생하여 모든 작동이 중단되었습니다.\n\n오류 내용: ${message}\n${details}`);
  
  // Hide loader
  if (typeof hideLoading === 'function') {
    hideLoading();
  }
  
  // Disable UI interactions entirely
  document.body.style.pointerEvents = 'none';
  document.body.style.opacity = '0.6';
  
  // Stop all timers/intervals
  let id = window.setTimeout(function() {}, 0);
  while (id--) {
    window.clearTimeout(id);
  }
  
  // Disable buttons
  const buttons = document.querySelectorAll('button, input, select');
  buttons.forEach(btn => {
    btn.disabled = true;
  });
}

window.onerror = function(message, source, lineno, colno, error) {
  haltApplication(message, `파일: ${source}\n라인: ${lineno}:${colno}`);
  return true; // prevent browser default error handling
};

window.addEventListener('unhandledrejection', function(event) {
  haltApplication(event.reason ? event.reason.message || event.reason : "Unhandled Promise Rejection");
});

// Global Application State
let appData = {
  summary: {},
  rawBillingTotal: 0,
  rawActualTotal: 0,
  rawRentalTotal: 0,
  exactMatches: [],
  similarMatches: [],
  unmatchedBilling: [],
  unmatchedActual: [],
  refinementResults: [] // Store serialless asset refinement candidates
};

let file1Uploaded = false;
let file2Uploaded = false;
let file3Uploaded = false;

// UI Elements
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

const searchInput = document.getElementById('search-input');
const filterConfHigh = document.getElementById('filter-conf-high');
const filterConfLow = document.getElementById('filter-conf-low');

const inputFile1 = document.getElementById('input-file1');
const inputFile2 = document.getElementById('input-file2');
const inputFile3 = document.getElementById('input-file3');
const lblFile1 = document.getElementById('lbl-file1');
const lblFile2 = document.getElementById('lbl-file2');
const lblFile3 = document.getElementById('lbl-file3');

const selKey1 = document.getElementById('sel-key1');
const selKey2 = document.getElementById('sel-key2');
const selKey3 = document.getElementById('sel-key3');
const btnRunCompare = document.getElementById('btn-run-compare');
const btnSave = document.getElementById('btn-save');

// Helper: Clean name for comparison
function cleanName(val) {
  if (!val) return "";
  let s = String(val).replace(/\s+/g, '');
  s = s.replace(/\(.*\)/g, ''); 
  s = s.replace(/\[.*\]/g, ''); 
  return s;
}

// Helper: Clean employee ID
function cleanEmpId(val) {
  if (!val) return "";
  return String(val).trim().replace(/[^0-9]/g, '');
}

// Helper: Compare employee ID with zero-padding
function compareEmpId(e1, e2) {
  const c1 = cleanEmpId(e1);
  const c2 = cleanEmpId(e2);
  if (!c1 || !c2 || c1.length < 3 || c2.length < 3) return false;
  const maxLen = Math.max(c1.length, c2.length);
  return c1.padStart(maxLen, '0') === c2.padStart(maxLen, '0');
}

// Initialize App
window.addEventListener('DOMContentLoaded', () => {
  hideLoading();
  btnSave.disabled = true;
  setupEventListeners();
  initSeriallessMatching();
});



// Setup Event Listeners
function setupEventListeners() {
  // File 1 Select
  inputFile1.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleUpload(file, '/api/upload-file1', lblFile1, selKey1, 1);
  });

  // File 2 Select
  inputFile2.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleUpload(file, '/api/upload-file2', lblFile2, selKey2, 2);
  });

  // File 3 Select
  inputFile3.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleUpload(file, '/api/upload-file3', lblFile3, selKey3, 3);
  });

  // Run comparison
  btnRunCompare.addEventListener('click', runCompare);

  // Tab buttons click
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      tabButtons.forEach(b => b.classList.remove('active'));
      const clickedBtn = e.currentTarget;
      clickedBtn.classList.add('active');
      
      const tabId = clickedBtn.getAttribute('data-tab');
      const panels = document.querySelectorAll('.tab-panel');
      panels.forEach(p => p.classList.remove('active'));
      document.getElementById(tabId).classList.add('active');
      
      const filterArea = document.getElementById('similar-filters-area');
      if (tabId === 'tab-similar') {
        filterArea.style.display = 'flex';
      } else {
        filterArea.style.display = 'none';
      }
      
      renderActiveTab();
    });
  });

  // Search input change
  searchInput.addEventListener('input', () => renderActiveTab());

  // Checkbox filters
  filterConfHigh.addEventListener('change', () => renderActiveTab());
  filterConfLow.addEventListener('change', () => renderActiveTab());

  // Save report
  btnSave.addEventListener('click', saveReport);

  // Top-level Navigation View Switching
  const topNavButtons = document.querySelectorAll('.top-nav-btn');
  topNavButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      topNavButtons.forEach(b => {
        b.classList.remove('active');
        b.style.borderBottomColor = 'transparent';
        b.style.color = 'var(--text-secondary)';
      });
      const clickedBtn = e.currentTarget;
      clickedBtn.classList.add('active');
      clickedBtn.style.borderBottomColor = 'var(--primary-color)';
      clickedBtn.style.color = 'var(--primary-color)';

      const viewId = clickedBtn.getAttribute('data-nav');
      document.querySelectorAll('.view-panel').forEach(panel => {
        panel.style.display = 'none';
      });
      document.getElementById(viewId).style.display = 'flex';
    });
  });
}

// Handle file loading & base64 upload to server
function handleUpload(file, endpoint, labelElem, selectElem, fileNum) {
  showLoading(`${file.name} 파일 업로드 및 분석 중...`);
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const base64 = e.target.result.split(',')[1];
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, base64 })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || '업로드 실패');
      }

      const resData = await response.json();
      
      // Update label
      labelElem.innerText = file.name;
      labelElem.style.color = 'var(--primary-color)';
      labelElem.style.fontWeight = 'bold';

      // Populate select headers dropdown
      selectElem.innerHTML = '';
      resData.headers.forEach(header => {
        const opt = document.createElement('option');
        opt.value = header;
        opt.innerText = header;
        selectElem.appendChild(opt);
      });
      selectElem.disabled = false;

      // Auto select matching key columns
      autoSelectDefaultKey(selectElem, fileNum);

      if (fileNum === 1) file1Uploaded = true;
      if (fileNum === 2) file2Uploaded = true;
      if (fileNum === 3) file3Uploaded = true;

      // Enable run button and auto-run if all three are ready
      if (file1Uploaded && file2Uploaded && file3Uploaded) {
        btnRunCompare.disabled = false;
        showToast('3개의 파일이 모두 로드되었습니다. 대조 분석을 시작합니다.');
        runCompare();
      } else {
        showToast(`${file.name} 파일의 업로드를 완료했습니다.`);
      }
    } catch (err) {
      haltApplication(`파일 처리 오류: ${err.message}`);
    } finally {
      hideLoading();
    }
  };

  reader.onerror = () => {
    haltApplication('파일을 읽어들이는 중 브라우저 오류가 발생했습니다.');
  };

  reader.readAsDataURL(file);
}

// Automatically match key comparison columns based on keyword lists
function autoSelectDefaultKey(selectElem, fileNum) {
  const options = Array.from(selectElem.options).map(o => o.value);
  let matchedKey = "";

  const keywords = [
    "제조번호",
    "제조사번호",
    "제조 번호",
    "SN",
    "시리얼",
    "시리얼넘버",
    "S/N",
    "SERIAL",
    "관리번호"
  ];

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

async function runCompare() {
  const k1 = selKey1.value;
  const k2 = selKey2.value;
  const k3 = selKey3.value;

  if (!k1 || !k2 || !k3) {
    alert('비교 기준 컬럼을 3개 모두 선택해 주세요.');
    return;
  }

  showLoading('3개 파일의 데이터를 지정한 기준 컬럼으로 분석 중... (0%)');
  
  // Set up progress polling
  let progressInterval = setInterval(async () => {
    try {
      const pRes = await fetch('/api/compare-progress');
      if (pRes.ok) {
        const pData = await pRes.json();
        const loaderText = document.querySelector('.loading-overlay p');
        if (loaderText) {
          loaderText.innerText = `3개 파일의 데이터를 지정한 기준 컬럼으로 분석 중... (${pData.progress}%)`;
        }
      }
    } catch (err) {
      console.error('Error fetching progress:', err);
    }
  }, 250);

  try {
    const response = await fetch('/api/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key1: k1, key2: k2, key3: k3 })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || '분석 실패');
    }

    const data = await response.json();
    // Store raw totals from server as ground truth (Excel row counts)
    appData.rawBillingTotal = data.summary.billingTotal;
    appData.rawActualTotal = data.summary.actualTotal;
    appData.rawRentalTotal = data.summary.rentalTotal;

    appData.exactMatches = data.exactMatches;
    appData.unmatchedBilling = data.unmatchedBilling;
    appData.unmatchedActual = data.unmatchedActual;

    appData.similarMatches = data.similarMatches.map(match => ({
      ...match,
      approved: match.confidence === 'High' || match.approved === true // Auto-approved if High confidence or pre-approved by server
    }));

    appData.refinementResults = []; // Clear previous refinement state

    recalculateSummary();
    renderDashboard();
    
    // Update labels in the table headers dynamically
    updateTableHeaders(k1, k2, k3);

    renderActiveTab();
    btnSave.disabled = false;
    showToast('분석 및 대조 작업이 완료되었습니다.');
    if (typeof window.loadInitialSeriallessData === 'function') {
      window.loadInitialSeriallessData();
    }
  } catch (error) {
    haltApplication(`분석 작업 실패: ${error.message}`);
  } finally {
    clearInterval(progressInterval);
    hideLoading();
  }
}

// Update table header text dynamically in all tabs
function updateTableHeaders(k1, k2, k3) {
  // Exact matches
  const exactH = document.querySelector('#table-exact th:last-child');
  if (exactH) exactH.innerText = `${k1} (시리얼)`;

  // Unmatched billing
  const billingH = document.querySelector('#table-unmatched-b th:last-child');
  if (billingH) billingH.innerText = `${k1} (기준 컬럼값)`;

  // Unmatched actual
  const actualH = document.querySelector('#table-unmatched-a th:last-child');
  if (actualH) actualH.innerText = `${k2} (기준 컬럼값)`;
}

// Recalculate summary metrics based on user approvals
function recalculateSummary() {
  // Use the partition sum for billing (mathematically guaranteed equal to raw row count)
  const billingPartitionSum = appData.exactMatches.length + appData.similarMatches.length + appData.unmatchedBilling.length;
  
  const approvedSim = appData.similarMatches.filter(s => s.approved);
  const rejectedSim = appData.similarMatches.filter(s => !s.approved);
  
  const exactCount = appData.exactMatches.length;
  const similarCount = appData.similarMatches.length;
  const approvedSimCount = approvedSim.length;

  const exactF2Count = appData.exactMatches.filter(e => (e.matchType || '').includes('실사')).length;
  const exactF3Count = exactCount - exactF2Count;
  const simF2Approved = approvedSim.filter(s => (s.matchType || '').includes('실사')).length;
  const simF2Rejected = rejectedSim.filter(s => (s.matchType || '').includes('실사')).length;
  const simF3Rejected = rejectedSim.filter(s => (s.matchType || '').includes('렌탈')).length;
  
  // Total actual = all F2 exact matches + all F2 similar matches (approved+rejected) + unmatched actual
  const actualPartitionSum = exactF2Count + simF2Approved + simF2Rejected + appData.unmatchedActual.length;
  const unmatchedBillingCount = appData.unmatchedBilling.length + simF2Rejected + simF3Rejected;
  const unmatchedActualCount = appData.unmatchedActual.length + simF2Rejected;

  // Use server's raw totals as the display values for Cards 1 & 2 (ground truth)
  // If raw totals are not available (shouldn't happen), fall back to partition sums
  const billingTotal = appData.rawBillingTotal || billingPartitionSum;
  const actualTotal = appData.rawActualTotal || actualPartitionSum;

  appData.summary = {
    billingTotal,
    actualTotal,
    billingPartitionSum,
    actualPartitionSum,
    exactMatchesCount: exactCount,
    exactF2Count,
    exactF3Count,
    similarMatchesCount: similarCount,
    approvedSimCount,
    unmatchedBillingCount,
    unmatchedActualCount
  };
}

// Render Dashboard
function renderDashboard() {
  const s = appData.summary;
  document.getElementById('metric-billing-total').innerText = s.billingTotal.toLocaleString();
  document.getElementById('metric-actual-total').innerText = s.actualTotal.toLocaleString();
  document.getElementById('metric-exact').innerText = s.exactMatchesCount.toLocaleString();
  
  // Show breakdown details (실사 vs 렌탈)
  document.getElementById('metric-exact-details').innerText = `실사 ${s.exactF2Count.toLocaleString()}건 / 렌탈 ${s.exactF3Count.toLocaleString()}건`;

  // Display only approved similar matches count in the main value of the card
  document.getElementById('metric-similar').innerText = s.approvedSimCount.toLocaleString();
  
  document.getElementById('metric-unmatched-b').innerText = s.unmatchedBillingCount.toLocaleString();
  document.getElementById('metric-unmatched-a').innerText = s.unmatchedActualCount.toLocaleString();

  document.getElementById('badge-similar').innerText = appData.similarMatches.length;
  document.getElementById('badge-unmatched-b').innerText = s.unmatchedBillingCount;
  document.getElementById('badge-unmatched-a').innerText = s.unmatchedActualCount;
  document.getElementById('badge-exact').innerText = s.exactMatchesCount;

  const totalSim = appData.similarMatches.length;
  document.getElementById('sim-review-progress').innerText = `${s.approvedSimCount}건 승인 / ${totalSim - s.approvedSimCount}건 제외`;

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
      billingVerifyEl.innerText = `검증 OK: ${s.exactMatchesCount}+${s.approvedSimCount}+${s.unmatchedBillingCount}=${s.billingPartitionSum.toLocaleString()}`;
    } else {
      billingVerifyEl.style.background = '#ffebee';
      billingVerifyEl.style.color = '#c62828';
      billingVerifyEl.innerText = `검증오차: 합계=${s.billingPartitionSum.toLocaleString()} (차이 ${billingDiff})`;
    }
  }
  
  if (actualVerifyEl) {
    actualVerifyEl.style.display = 'inline-block';
    if (actualDiff === 0) {
      actualVerifyEl.style.background = '#e8f5e9';
      actualVerifyEl.style.color = '#2e7d32';
      actualVerifyEl.innerText = `검증 OK: ${s.exactF2Count}+${simF2Total()}+${s.unmatchedActualCount}=${s.actualPartitionSum.toLocaleString()}`;
    } else {
      actualVerifyEl.style.background = '#ffebee';
      actualVerifyEl.style.color = '#c62828';
      actualVerifyEl.innerText = `검증오차: 합계=${s.actualPartitionSum.toLocaleString()} (차이 ${actualDiff})`;
    }
  }

  // Update tab data count labels
  const countSimilar = document.getElementById('count-similar');
  const countUnmatchedB = document.getElementById('count-unmatched-b');
  const countUnmatchedA = document.getElementById('count-unmatched-a');
  const countExact = document.getElementById('count-exact');
  
  if (countSimilar) {
    countSimilar.innerText = `유사 ${totalSim.toLocaleString()}건 (승인 ${s.approvedSimCount.toLocaleString()}건 / 제외 ${(totalSim - s.approvedSimCount).toLocaleString()}건)`;
  }
  if (countUnmatchedB) {
    countUnmatchedB.innerText = `청구 ${s.unmatchedBillingCount.toLocaleString()}건`;
  }
  if (countUnmatchedA) {
    countUnmatchedA.innerText = `실사 ${s.unmatchedActualCount.toLocaleString()}건`;
  }
  if (countExact) {
    countExact.innerText = `일치 ${s.exactMatchesCount.toLocaleString()}건 (실사 ${s.exactF2Count.toLocaleString()}건 / 렌탈 ${s.exactF3Count.toLocaleString()}건)`;
  }
}

// Helper to get total F2 similar match count (approved + rejected) for verification display
function simF2Total() {
  return appData.similarMatches.filter(s => (s.matchType || '').includes('실사')).length;
}

// Save final report to backend folder

async function saveReport() {
  showLoading('조정 보고서(추정자료.xlsx) 생성 및 저장 중...');
  try {
    const response = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exactMatches: appData.exactMatches,
        similarMatches: appData.similarMatches,
        unmatchedBilling: appData.unmatchedBilling,
        unmatchedActual: appData.unmatchedActual,
        key1: selKey1.value,
        key2: selKey2.value,
        key3: selKey3.value
      })
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || '보고서 저장 실패');
    }
    
    const result = await response.json();
    showToast(`보고서 저장 완료! 파일명: ${result.file}`);
  } catch (error) {
    haltApplication(`보고서 저장 중 오류가 발생했습니다: ${error.message}`);
  } finally {
    hideLoading();
  }
}

// Render active tab table
function renderActiveTab() {
  if (appData.exactMatches.length === 0 && appData.similarMatches.length === 0 && appData.unmatchedBilling.length === 0) {
    return; // No data loaded yet
  }

  const activeTab = document.querySelector('.tab-btn.active').getAttribute('data-tab');
  const query = searchInput.value.toLowerCase().trim();

  if (activeTab === 'tab-similar') {
    renderSimilarTable(query);
  } else if (activeTab === 'tab-unmatched-b') {
    renderUnmatchedBillingTable(query);
  } else if (activeTab === 'tab-unmatched-a') {
    renderUnmatchedActualTable(query);
  } else if (activeTab === 'tab-exact') {
    renderExactTable(query);
  }
}

// LCS alignment function to highlight serial differences in red-bold
function alignSerials(a, b) {
  const m = a.length;
  const n = b.length;
  
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  let i = m;
  let j = n;
  let alignA = [];
  let alignB = [];
  
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      alignA.push({ char: a[i - 1], match: true });
      alignB.push({ char: b[j - 1], match: true });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      alignA.push({ char: '-', match: false });
      alignB.push({ char: b[j - 1], match: false });
      j--;
    } else {
      alignA.push({ char: a[i - 1], match: false });
      alignB.push({ char: '-', match: false });
      i--;
    }
  }
  
  alignA.reverse();
  alignB.reverse();
  
  let htmlA = '';
  let htmlB = '';
  
  for (let k = 0; k < alignA.length; k++) {
    const itemA = alignA[k];
    const itemB = alignB[k];
    
    if (itemA.match) {
      htmlA += itemA.char;
      htmlB += itemB.char;
    } else {
      if (itemA.char === '-') {
        htmlA += '<span class="diff-gap">_</span>';
        htmlB += `<span class="diff-highlight">${itemB.char}</span>`;
      } else if (itemB.char === '-') {
        htmlA += `<span class="diff-highlight">${itemA.char}</span>`;
        htmlB += '<span class="diff-gap">_</span>';
      } else {
        htmlA += `<span class="diff-highlight">${itemA.char}</span>`;
        htmlB += `<span class="diff-highlight">${itemB.char}</span>`;
      }
    }
  }
  
  return { htmlA, htmlB };
}

// Render similar matches table with filters (compact horizontal layout)
function renderSimilarTable(query) {
  const tbody = document.getElementById('tbody-similar');
  tbody.innerHTML = '';

  const showHigh = filterConfHigh.checked;
  const showLow = filterConfLow.checked;

  let filtered = appData.similarMatches.filter(match => {
    if (match.confidence === 'High' && !showHigh) return false;
    if (match.confidence === 'Low' && !showLow) return false;

    if (query) {
      const bText = `${match.billing.name} ${match.billing.empId} ${match.billing.dept} ${match.billing.serial} ${match.billing.model}`.toLowerCase();
      const aText = `${match.actual.name} ${match.actual.empId} ${match.actual.dept} ${match.actual.serial} ${match.actual.model}`.toLowerCase();
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
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-secondary); padding: 2rem;">검색어 조건에 부합하는 대조 결과 데이터가 없습니다.</td></tr>`;
    return;
  }

  filtered.forEach((match) => {
    const originalIndex = appData.similarMatches.findIndex(s => s.billing._id === match.billing._id);
    const tr = document.createElement('tr');
    tr.id = `sim-row-${originalIndex}`;
    
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
    
    const billingMeta = `<div style="font-weight:bold; font-size:0.8rem;">${match.billing.name} <span style="font-weight:normal; font-size:0.7rem; color:var(--text-secondary);">(${match.billing.empId || '사번없음'})</span></div><div style="font-size:0.7rem; color:var(--text-secondary);">${match.billing.dept} | ${match.billing.device} | ${match.billing.model}</div>`;
    const actualMeta = `<div style="font-weight:bold; font-size:0.8rem;">${match.actual.name} <span style="font-weight:normal; font-size:0.7rem; color:var(--text-secondary);">(${match.actual.empId || '사번없음'})</span></div><div style="font-size:0.7rem; color:var(--text-secondary);">${match.actual.dept} | ${match.actual.device} | ${match.actual.model}</div>`;

    // Metadata comparison logic (Name, EmpID, Department)
    const nameMatch = cleanName(match.billing.name) === cleanName(match.actual.name);
    const empIdMatch = compareEmpId(match.billing.empId, match.actual.empId);
    const deptMatch = String(match.billing.dept || '').trim() === String(match.actual.dept || '').trim();

    const nameHtml = nameMatch
      ? `<span style="color:var(--success-color); font-weight:bold;">이름 일치</span>`
      : `<span style="color:var(--danger-color); font-weight:bold;">이름 불일치 (${match.billing.name} vs ${match.actual.name})</span>`;

    const empIdHtml = empIdMatch
      ? `<span style="color:var(--success-color); font-weight:bold;">사번 일치</span>`
      : `<span style="color:var(--danger-color); font-weight:bold;">사번 불일치 (&{match.billing.empId || '없음'} vs &{match.actual.empId || '없음'})</span>`;

    const deptHtml = deptMatch
      ? `<span style="color:var(--success-color); font-weight:bold;">부서 일치</span>`
      : `<span style="color:var(--danger-color); font-weight:bold;">부서 불일치</span>`;

    const metaCompareHtml = `
      <div style="font-size:0.7rem; line-height:1.2; display:flex; flex-direction:column; gap:1px;">
        <div>${nameHtml}</div>
        <div>${empIdHtml}</div>
        <div>${deptHtml}</div>
      </div>
    `;

    const matchTypeBadge = (match.matchType || '').includes('실사')
      ? `<span class="metric-tag" style="background-color:#ebf8ff; color:#2b6cb0; border:1px solid #bee3f8; display:inline-block; font-size:0.65rem; font-weight:bold; padding:1px 4px;">실사 대조</span>`
      : `<span class="metric-tag" style="background-color:#faf5ff; color:#6b46c1; border:1px solid #e9d8fd; display:inline-block; font-size:0.65rem; font-weight:bold; padding:1px 4px;">렌탈 대조</span>`;

    // Rental match indicators
    let rentalInfoA = `<span style="font-size:0.65rem; color:var(--text-secondary); margin-left:6px;">렌탈사 불일치</span>`;
    if (match.billingRentalMatch && match.billingRentalMatch.matched) {
      rentalInfoA = `<span style="font-size:0.65rem; color:var(--success-color); font-weight:bold; margin-left:6px;">렌탈사 일치 (${match.billingRentalMatch.assetNo || ''})</span>`;
    }

    let rentalInfoB = `<span style="font-size:0.65rem; color:var(--text-secondary); margin-left:6px;">렌탈사 불일치</span>`;
    if (match.actualRentalMatch && match.actualRentalMatch.matched) {
      rentalInfoB = `<span style="font-size:0.65rem; color:var(--success-color); font-weight:bold; margin-left:6px;">렌탈사 일치 (${match.actualRentalMatch.assetNo || ''})</span>`;
    }

    tr.innerHTML = `
      <td style="text-align: center;"><span class="status-pill ${statusClass}" style="padding:1px 4px; font-size:0.7rem;">${statusText}</span></td>
      <td style="text-align: center;">
        <span class="metric-tag ${confBadge}" style="display:inline-block; margin-top:0; font-size:0.6rem; padding:1px 3px;">${match.confidence === 'High' ? '높음' : '낮음'}</span>
        <div style="font-size:0.6rem; color:var(--text-secondary); margin-top:1px;">${match.reason}</div>
      </td>
      <td style="text-align: center;">${matchTypeBadge}</td>
      <td>${billingMeta}</td>
      <td style="font-family: monospace; font-size: 0.85rem; font-weight: 500; letter-spacing: 0.02em; white-space: nowrap;">
        ${htmlA}
        ${rentalInfoA}
      </td>
      <td style="text-align: center;"><span class="dist-badge" style="padding:1px 4px; font-size:0.75rem;">${match.distance}</span></td>
      <td style="font-family: monospace; font-size: 0.85rem; font-weight: 500; letter-spacing: 0.02em; white-space: nowrap;">
        ${htmlB}
        ${rentalInfoB}
      </td>
      <td>${actualMeta}</td>
      <td>${metaCompareHtml}</td>
      <td>
        <div class="action-buttons-group">
          <button class="btn ${match.approved === true ? 'btn-success' : 'btn-outline'} btn-sm" style="padding:1px 4px; font-size:0.7rem; font-weight:bold;" onclick="toggleMatch(${originalIndex}, true)">승인</button>
          <button class="btn ${match.approved === false ? 'btn-danger' : 'btn-outline'} btn-sm" style="padding:1px 4px; font-size:0.7rem; font-weight:bold;" onclick="toggleMatch(${originalIndex}, false)">제외</button>
        </div>
      </td>
    `;
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
  const tr = document.getElementById(`sim-row-${index}`);
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

// Render unmatched billing table
function renderUnmatchedBillingTable(query) {
  const tbody = document.getElementById('tbody-unmatched-b');
  tbody.innerHTML = '';

  const rejectedBilling = appData.similarMatches.filter(s => !s.approved).map(s => s.billing);
  const totalList = [...appData.unmatchedBilling, ...rejectedBilling];

  const filtered = totalList.filter(item => {
    if (query) {
      const text = `${item.name} ${item.empId} ${item.dept} ${item.serial} ${item.model}`.toLowerCase();
      return text.includes(query);
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-secondary); padding: 2rem;">불일치 청구 파일 1 데이터가 없습니다.</td></tr>`;
    return;
  }

  filtered.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><b>${item.name}</b></td>
      <td>${item.empId}</td>
      <td>${item.dept}</td>
      <td>${item.device}</td>
      <td>${item.model}</td>
      <td><span class="serial-highlight">${item.serial}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// Render unmatched actual table
function renderUnmatchedActualTable(query) {
  const tbody = document.getElementById('tbody-unmatched-a');
  tbody.innerHTML = '';

  const rejectedActual = appData.similarMatches.filter(s => !s.approved).map(s => s.actual);
  const totalList = [...appData.unmatchedActual, ...rejectedActual];

  const filtered = totalList.filter(item => {
    if (query) {
      const text = `${item.idx} ${item.name} ${item.empId} ${item.dept} ${item.serial} ${item.model}`.toLowerCase();
      return text.includes(query);
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-secondary); padding: 2rem;">불일치 실사 파일 2 데이터가 없습니다.</td></tr>`;
    return;
  }

  filtered.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="color: var(--text-secondary);">${item.idx}</td>
      <td><b>${item.name}</b></td>
      <td>${item.empId}</td>
      <td>${item.dept}</td>
      <td>${item.device}</td>
      <td>${item.model}</td>
      <td><span class="serial-highlight">${item.serial}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// Render exact matches table
function renderExactTable(query) {
  const tbody = document.getElementById('tbody-exact');
  tbody.innerHTML = '';

  const filtered = appData.exactMatches.filter(match => {
    if (query) {
      const text = `${match.billing.name} ${match.billing.empId} ${match.billing.dept} ${match.billing.serial} ${match.billing.model}`.toLowerCase();
      return text.includes(query);
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 2rem;">완전 일치 데이터가 없습니다.</td></tr>`;
    return;
  }

  filtered.forEach(match => {
    const tr = document.createElement('tr');
    
    const nameStr = match.billing.name === match.actual.name ? match.billing.name : `<span style="color:var(--danger-color); font-weight:700;">${match.billing.name}</span> / ${match.actual.name}`;
    const empIdStr = match.billing.empId === match.actual.empId ? match.billing.empId : `<span style="color:var(--danger-color); font-weight:700;">${match.billing.empId}</span> / ${match.actual.empId}`;
    const deptStr = match.billing.dept === match.actual.dept ? match.billing.dept : `<span style="color:var(--text-secondary);">${match.billing.dept}</span> / <span style="font-size:0.75rem;">${match.actual.dept}</span>`;
    const modelStr = match.billing.model === match.actual.model ? match.billing.model : `<span style="color:var(--text-secondary);">${match.billing.model}</span> / <span style="font-size:0.75rem;">${match.actual.model}</span>`;

    const matchTypeBadge = match.matchType.includes('실사')
      ? `<span class="metric-tag" style="background-color:#ebf8ff; color:#2b6cb0; border:1px solid #bee3f8; display:inline-block; font-size:0.7rem; font-weight:bold; padding:2px 6px;">실사 완전일치</span>`
      : `<span class="metric-tag" style="background-color:#faf5ff; color:#6b46c1; border:1px solid #e9d8fd; display:inline-block; font-size:0.7rem; font-weight:bold; padding:2px 6px;">렌탈사 완전일치</span>`;

    tr.innerHTML = `
      <td style="text-align: center;">${matchTypeBadge}</td>
      <td>${nameStr}</td>
      <td>${empIdStr}</td>
      <td>${deptStr}</td>
      <td>${modelStr}</td>
      <td><span class="serial-highlight" style="background-color:#e6fffa; color:#0d9488;">${match.billing.serial}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// Helper: Show Loading Screen
function showLoading(text) {
  loadingText.innerText = text;
  loadingOverlay.classList.add('active');
}

// Helper: Hide Loading Screen
function hideLoading() {
  loadingOverlay.classList.remove('active');
}

// Helper: Show Toast Notification
function showToast(message) {
  toastMessage.innerText = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}

// Direct index-by-index comparison for Excel cell diff formatting (coloring different chars in bold red)
function getRichTextRunsForDiff(a, b) {
  a = String(a || "").trim();
  b = String(b || "").trim();

  const buildRuns = (str1, str2) => {
    const runs = [];
    let currentText = "";
    let currentMatch = true;

    const flush = () => {
      if (currentText) {
        if (currentMatch) {
          runs.push({ t: currentText });
        } else {
          runs.push({
            t: currentText,
            font: { color: { rgb: 'FF0000' }, bold: true }
          });
        }
        currentText = "";
      }
    };

    const len = str1.length;
    for (let idx = 0; idx < len; idx++) {
      let isMatch = true;
      if (idx >= str2.length) {
        isMatch = false; // Extra character in str1
      } else if (str1[idx] !== str2[idx]) {
        isMatch = false; // Different character at same index
      }

      if (isMatch === currentMatch) {
        currentText += str1[idx];
      } else {
        flush();
        currentMatch = isMatch;
        currentText = str1[idx];
      }
    }
    flush();

    return runs;
  };

  return {
    runsA: buildRuns(a, b),
    runsB: buildRuns(b, a)
  };
}

// Excel Export: Export current tab's data as downloadable .xlsx
window.exportTabToExcel = function(tabType) {
  if (typeof XLSX === 'undefined') {
    alert('엑셀 라이브러리(SheetJS)가 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.');
    return;
  }

  let sheetData = [];
  let fileName = '';

  if (tabType === 'exact') {
    // Exact matches export
    sheetData.push(['대조구분', '청구_이름', '대조군_이름', '청구_사번', '대조군_사번', '청구_부서', '대조군_부서', '청구_상세모델', '대조군_상세모델', '제조번호']);
    appData.exactMatches.forEach(match => {
      sheetData.push([
        (match.matchType || '').includes('실사') ? '실사 완전일치' : '렌탈 완전일치',
        match.billing.name, match.actual.name,
        match.billing.empId, match.actual.empId,
        match.billing.dept, match.actual.dept,
        match.billing.model, match.actual.model,
        match.billing.serial
      ]);
    });
    fileName = '완전일치_목록.xlsx';
  } else if (tabType === 'similar') {
    // Similar matches export
    sheetData.push(['승인상태', '신뢰도', '대조구분', '매칭사유', '청구_이름', '청구_사번', '청구_부서', '청구_상세모델', '청구_제조번호', '거리', '대조군_이름', '대조군_사번', '대조군_부서', '대조군_상세모델', '대조군_제조번호']);
    appData.similarMatches.forEach(match => {
      let status = '대기중';
      if (match.approved === true) status = '승인됨';
      else if (match.approved === false) status = '제외됨';
      
      const { runsA, runsB } = getRichTextRunsForDiff(match.billing.serial, match.actual.serial);
      
      sheetData.push([
        status,
        match.confidence === 'High' ? '높음' : '낮음',
        (match.matchType || '').includes('실사') ? '실사 대조' : '렌탈 대조',
        match.reason,
        match.billing.name, match.billing.empId, match.billing.dept, match.billing.model,
        { t: 's', v: match.billing.serial, r: runsA }, // Rich text diff runs
        match.distance,
        match.actual.name, match.actual.empId, match.actual.dept, match.actual.model,
        { t: 's', v: match.actual.serial, r: runsB }  // Rich text diff runs
      ]);
    });
    fileName = '유사일치_목록.xlsx';
  } else if (tabType === 'unmatched-b') {
    // Unmatched billing export (includes rejected similar billing rows)
    sheetData.push(['상태', '이름', '사번', '부서', '구분', '상세모델', '제조번호']);
    appData.unmatchedBilling.forEach(item => {
      sheetData.push(['미일치', item.name, item.empId, item.dept, item.device, item.model, item.serial]);
    });
    appData.similarMatches.filter(s => !s.approved).forEach(match => {
      sheetData.push(['유사제외', match.billing.name, match.billing.empId, match.billing.dept, match.billing.device, match.billing.model, match.billing.serial]);
    });
    fileName = '청구미일치_목록.xlsx';
  } else if (tabType === 'unmatched-a') {
    // Unmatched actual export (includes rejected similar actual rows)
    sheetData.push(['상태', '행번호', '이름', '사번', '부서', '구분', '상세모델', '제조번호']);
    appData.unmatchedActual.forEach(item => {
      sheetData.push(['미일치', item.idx, item.name, item.empId, item.dept, item.device, item.model, item.serial]);
    });
    appData.similarMatches.filter(s => !s.approved && (s.matchType || '').includes('실사')).forEach(match => {
      sheetData.push(['유사제외', match.actual.idx, match.actual.name, match.actual.empId, match.actual.dept, match.actual.device, match.actual.model, match.actual.serial]);
    });
    fileName = '실사미일치_목록.xlsx';
  }

  if (sheetData.length <= 1) {
    showToast('내보낼 데이터가 없습니다.');
    return;
  }

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '데이터');

  // Auto-size columns
  const colWidths = sheetData[0].map((_, colIdx) => {
    let maxLen = 10;
    sheetData.forEach(row => {
      const val = row[colIdx];
      const cellLen = String(val && val.v !== undefined ? val.v : (val || '')).length;
      if (cellLen > maxLen) maxLen = cellLen;
    });
    return { wch: Math.min(maxLen + 2, 40) };
  });
  ws['!cols'] = colWidths;

  XLSX.writeFile(wb, fileName);
  showToast(`${fileName} 다운로드 완료! (${(sheetData.length - 1).toLocaleString()}건)`);
};

// Helper: Find value by keyword matches case-insensitively in original row keys
function getFieldValue(origRow, keywords) {
  if (!origRow) return "";
  const key = Object.keys(origRow).find(k => {
    const cleanK = k.trim().replace(/\s+/g, '').toUpperCase();
    return keywords.some(kw => cleanK.includes(kw));
  });
  return key ? String(origRow[key]).trim() : "";
}

// Reconstruct complete File 1 Billing list from partitioned states
function getReconstructedBilling() {
  const list = [];
  const added = new Set();
  
  appData.exactMatches.forEach(m => {
    if (m.billing && !added.has(m.billing._id)) {
      list.push(m.billing);
      added.add(m.billing._id);
    }
  });
  
  appData.similarMatches.forEach(m => {
    if (m.billing && !added.has(m.billing._id)) {
      list.push(m.billing);
      added.add(m.billing._id);
    }
  });
  
  appData.unmatchedBilling.forEach(b => {
    if (b && !added.has(b._id)) {
      list.push(b);
      added.add(b._id);
    }
  });
  
  return list.sort((a, b) => a.idx - b.idx);
}

// Reconstruct complete File 2 Actual list from partitioned states
function getReconstructedActual() {
  const list = [];
  const added = new Set();
  
  appData.exactMatches.forEach(m => {
    if (m.actual && (m.matchType || '').includes('실사') && !added.has(m.actual._id)) {
      list.push(m.actual);
      added.add(m.actual._id);
    }
  });
  
  appData.similarMatches.forEach(m => {
    if (m.actual && (m.matchType || '').includes('실사') && !added.has(m.actual._id)) {
      list.push(m.actual);
      added.add(m.actual._id);
    }
  });
  
  appData.unmatchedActual.forEach(a => {
    if (a && !added.has(a._id)) {
      list.push(a);
      added.add(a._id);
    }
  });
  
  return list.sort((a, b) => a.idx - b.idx);
}

// S酶rensen-Dice string similarity coefficient (bigram comparison)
function stringSimilarity(a, b) {
  a = String(a || "").replace(/\s+/g, '').toUpperCase();
  b = String(b || "").replace(/\s+/g, '').toUpperCase();
  if (!a || !b) return 0.0;
  if (a === b) return 1.0;
  if (a.length < 2 || b.length < 2) return 0.0;

  const getBigrams = (str) => {
    const bigrams = new Map();
    for (let i = 0; i < str.length - 1; i++) {
      const bigram = str.substring(i, i + 2);
      bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
    }
    return bigrams;
  };

  const bigramsA = getBigrams(a);
  const bigramsB = getBigrams(b);
  let intersection = 0;
  let totalBigrams = 0;
  
  bigramsA.forEach((count, bigram) => {
    totalBigrams += count;
    if (bigramsB.has(bigram)) {
      intersection += Math.min(count, bigramsB.get(bigram));
    }
  });
  
  bigramsB.forEach(count => {
    totalBigrams += count;
  });

  return (2.0 * intersection) / totalBigrams;
}

// ============================================================
// 시리얼없음 매칭 화면 프론트엔드 로직
// ============================================================
let slState = {
  matchedPairs: [],
  unmatchedBilling: [],
  unmatchedActual: [],
  selectedPairs: new Set(), // Set of billing._id
  allBillingModels: [],
  allActualModels: [],
  exclusions: {} // Record of billingId -> array of actualIds
};

function initSeriallessMatching() {
  const slBtnRunMatch = document.getElementById('sl-btn-run-match');
  const slBtnApplySave = document.getElementById('sl-btn-apply-save');
  const slFilterBillingSerial = document.getElementById('sl-filter-billing-serial');
  const slCbEmpid = document.getElementById('sl-cb-empid');
  const slCbName = document.getElementById('sl-cb-name');
  const slCbDept = document.getElementById('sl-cb-dept');
  const slCbWorkplace = document.getElementById('sl-cb-workplace');
  const slCbSelectAll = document.getElementById('sl-cb-select-all');
  const slBillingModelSelectAll = document.getElementById('sl-billing-model-select-all');
  const slActualModelSelectAll = document.getElementById('sl-actual-model-select-all');

  // Bind model Select All checkboxes
  if (slBillingModelSelectAll) {
    slBillingModelSelectAll.addEventListener('change', (e) => {
      const checked = e.target.checked;
      const container = document.getElementById('sl-filter-billing-model-container');
      if (container) {
        container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
          cb.checked = checked;
        });
      }
    });
  }

  if (slActualModelSelectAll) {
    slActualModelSelectAll.addEventListener('change', (e) => {
      const checked = e.target.checked;
      const container = document.getElementById('sl-filter-actual-model-container');
      if (container) {
        container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
          cb.checked = checked;
        });
      }
    });
  }

  // Load configuration if already uploaded in tab 1
  async function checkGlobalConfig() {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      if (data.hasConfig) {
        // Restore upload states in Tab 1
        file1Uploaded = true;
        file2Uploaded = true;
        file3Uploaded = true;

        lblFile1.innerText = data.file1Name;
        lblFile1.style.color = 'var(--primary-color)';
        lblFile1.style.fontWeight = 'bold';

        lblFile2.innerText = data.file2Name;
        lblFile2.style.color = 'var(--primary-color)';
        lblFile2.style.fontWeight = 'bold';

        lblFile3.innerText = data.file3Name;
        lblFile3.style.color = 'var(--primary-color)';
        lblFile3.style.fontWeight = 'bold';

        // Populate selKey1
        selKey1.innerHTML = '';
        data.headers1.forEach(h => {
          const opt = document.createElement('option');
          opt.value = h;
          opt.innerText = h;
          selKey1.appendChild(opt);
        });
        selKey1.value = data.key1;
        selKey1.disabled = false;

        // Populate selKey2
        selKey2.innerHTML = '';
        data.headers2.forEach(h => {
          const opt = document.createElement('option');
          opt.value = h;
          opt.innerText = h;
          selKey2.appendChild(opt);
        });
        selKey2.value = data.key2;
        selKey2.disabled = false;

        // Populate selKey3
        selKey3.innerHTML = '';
        data.headers3.forEach(h => {
          const opt = document.createElement('option');
          opt.value = h;
          opt.innerText = h;
          selKey3.appendChild(opt);
        });
        selKey3.value = data.key3;
        selKey3.disabled = false;

        btnRunCompare.disabled = false;

        // Auto trigger comparison in Tab 1
        await runCompare();

        if (slBtnRunMatch) slBtnRunMatch.disabled = false;
        await loadInitialSeriallessData();
      }
    } catch (e) {
      console.error(e);
    }
  }
  checkGlobalConfig();

  // Load initial unique models and raw unmatched counts (without matching)
  async function loadInitialSeriallessData() {
    try {
      const k1 = selKey1.value;
      const k2 = selKey2.value;
      const billingSerial = slFilterBillingSerial ? slFilterBillingSerial.value : "";
      const url = `/api/serialless-initial?key1=${encodeURIComponent(k1)}&key2=${encodeURIComponent(k2)}&billingSerial=${encodeURIComponent(billingSerial)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.hasData) {
        if (slBtnRunMatch) slBtnRunMatch.disabled = false;
        
        slState.allBillingModels = data.models.billing;
        slState.allActualModels = data.models.actual;

        // Populate model checkbox containers (unchecked by default on startup)
        populateCheckboxContainer('sl-filter-billing-model-container', data.models.billing, []);
        populateCheckboxContainer('sl-filter-actual-model-container', data.models.actual, []);
        
        // Update monitoring counts in global header
        document.getElementById('sl-mon-billing-count').innerText = data.counts.billing;
        document.getElementById('sl-mon-actual-count').innerText = data.counts.actual;
        document.getElementById('sl-mon-candidate-count').innerText = 0;
        document.getElementById('sl-mon-approved-count').innerText = 0;
        
        // Show placeholder table
        const tbodyPairs = document.getElementById('sl-tbody-pairs');
        if (tbodyPairs) {
          tbodyPairs.innerHTML = `
            <tr>
              <td colspan="4" style="text-align:center; padding:40px; color:#718096; font-weight:500;">
                조건을 설정한 후 [매칭 시작] 버튼을 누르면 매칭 분석이 시작됩니다.
              </td>
            </tr>
          `;
        }
      }
    } catch (e) {
      console.error("초기 모델명 및 미매칭 목록 로드 실패: ", e);
    }
  }

  // Dynamic filter for billing serial textbox (relists models dynamically on typing without matching)
  if (slFilterBillingSerial) {
    slFilterBillingSerial.addEventListener('input', () => {
      loadInitialSeriallessData();
    });
  }

  // Run match button
  if (slBtnRunMatch) {
    slBtnRunMatch.addEventListener('click', runSeriallessMatch);
  }

  // Expose loadInitialSeriallessData globally so it can be triggered by Tab 1 file uploads
  window.loadInitialSeriallessData = loadInitialSeriallessData;
  window.runSeriallessMatch = runSeriallessMatch;

  // Helper to get checked checkbox values
  function getCheckedModels(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    const checked = container.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checked).map(cb => cb.value);
  }

  async function runSeriallessMatch() {
    slState.exclusions = {};
    showLoading("시리얼없음 조건 매칭 분석 중...");
    try {
      const criteria = {
        empid: slCbEmpid.checked,
        name: slCbName.checked,
        dept: slCbDept.checked,
        workplace: slCbWorkplace.checked
      };
      const filters = {
        billingModels: getCheckedModels('sl-filter-billing-model-container'),
        billingSerial: slFilterBillingSerial.value,
        billingModelKeyword: document.getElementById('sl-filter-billing-model-keyword') ? document.getElementById('sl-filter-billing-model-keyword').value : "",
        actualModels: getCheckedModels('sl-filter-actual-model-container'),
        actualModelKeyword: document.getElementById('sl-filter-actual-model-keyword') ? document.getElementById('sl-filter-actual-model-keyword').value : ""
      };

      const res = await fetch('/api/match-serialless', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          criteria, 
          filters,
          key1: selKey1.value,
          key2: selKey2.value,
          key3: selKey3.value
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      slState.matchedPairs = data.matchedPairs;
      slState.unmatchedBilling = data.unmatchedBilling;
      slState.unmatchedActual = data.unmatchedActual;
      
      // Reset selections: default to select all matched pairs
      slState.selectedPairs.clear();
      slState.matchedPairs.forEach(p => {
        slState.selectedPairs.add(p.billing._id);
      });
      slCbSelectAll.checked = true;

      // Populate Model Checkbox Containers
      populateCheckboxContainer('sl-filter-billing-model-container', data.models.billing, filters.billingModels);
      populateCheckboxContainer('sl-filter-actual-model-container', data.models.actual, filters.actualModels);

      // Save models list in state
      slState.allBillingModels = data.models.billing;
      slState.allActualModels = data.models.actual;

      // Render all tables
      renderSeriallessTables();
      
      slBtnApplySave.disabled = slState.matchedPairs.length === 0;
      hideLoading();
    } catch (e) {
      hideLoading();
      alert("매칭 실패: " + e.message);
    }
  }

  function populateCheckboxContainer(containerId, options, selectedVals = null) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const currentChecked = new Set();
    if (selectedVals && selectedVals.length > 0) {
      selectedVals.forEach(v => currentChecked.add(v));
    } else if (selectedVals === null) {
      // Preserve current checks if selectedVals is null
      container.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
        currentChecked.add(cb.value);
      });
    }

    const currentLabels = container.querySelectorAll('label');
    const currentOptions = Array.from(currentLabels).map(l => l.querySelector('input').value);
    const sortedNewOptions = [...options].sort();
    
    if (currentOptions.length > 0 && JSON.stringify(currentOptions.sort()) === JSON.stringify(sortedNewOptions)) {
      container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = currentChecked.has(cb.value);
      });
      return;
    }
    
    container.innerHTML = '';
    
    if (options.length === 0) {
      container.innerHTML = '<div style="color:#718096; text-align:center; padding:10px;">모델 없음</div>';
      return;
    }
    
    sortedNewOptions.forEach(opt => {
      const label = document.createElement('label');
      label.style.display = 'flex';
      label.style.alignItems = 'center';
      label.style.gap = '6px';
      label.style.margin = '2px 0';
      label.style.cursor = 'pointer';
      label.style.fontSize = '0.72rem';
      
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = opt;
      cb.style.cursor = 'pointer';
      cb.checked = currentChecked.has(opt);
      
      label.appendChild(cb);
      
      const span = document.createElement('span');
      span.textContent = opt;
      span.style.whiteSpace = 'nowrap';
      span.style.overflow = 'hidden';
      span.style.textOverflow = 'ellipsis';
      span.style.maxWidth = '140px';
      span.title = opt;
      
      label.appendChild(span);
      container.appendChild(label);
    });
  }

  // Select all checkbox
  slCbSelectAll.addEventListener('change', (e) => {
    const checked = e.target.checked;
    const itemCheckboxes = document.querySelectorAll('.sl-pair-item-cb');
    itemCheckboxes.forEach(cb => {
      cb.checked = checked;
      const id = cb.getAttribute('data-id');
      const tr = cb.closest('tr');
      if (checked) {
        slState.selectedPairs.add(id);
        if (tr) tr.classList.add('sl-row-highlight');
      } else {
        slState.selectedPairs.delete(id);
        if (tr) tr.classList.remove('sl-row-highlight');
      }
    });
    updateMonitoringCounts();
  });

  // Apply and Save button
  slBtnApplySave.addEventListener('click', async () => {
    const updates = [];
    slState.matchedPairs.forEach(p => {
      if (slState.selectedPairs.has(p.billing._id)) {
        updates.push({
          billingIdx: p.billing.idx,
          actualSerial: p.actual.serial
        });
      }
    });

    if (updates.length === 0) {
      alert("선택된 매칭 항목이 없습니다.");
      return;
    }

    if (!confirm(`${updates.length}개 항목의 제조번호를 청구 데이터에 적용하고 엑셀 파일에 저장하시겠습니까?`)) {
      return;
    }

    showLoading("청구 데이터에 제조번호 업데이트 중...");
    try {
      const res = await fetch('/api/save-serialless', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      alert(data.message);
      hideLoading();

      // Refresh both views
      runSeriallessMatch();
      
      // Also trigger refresh for Tab 1 data
      if (typeof runCompare === 'function') {
        runCompare();
      }
    } catch (e) {
      hideLoading();
      alert("저장 실패: " + e.message);
    }
  });
}

function updateMonitoringCounts() {
  document.getElementById('sl-mon-billing-count').innerText = slState.unmatchedBilling.length;
  document.getElementById('sl-mon-actual-count').innerText = slState.unmatchedActual.length;
  document.getElementById('sl-mon-candidate-count').innerText = slState.matchedPairs.length;
  document.getElementById('sl-mon-approved-count').innerText = slState.selectedPairs.size;
  
  const elPairs = document.getElementById('sl-count-pairs');
  if (elPairs) elPairs.innerText = slState.matchedPairs.length;
  
  const elCol3 = document.getElementById('sl-count-col3');
  if (elCol3) elCol3.innerText = slState.unmatchedBilling.length;
  
  const elCol4 = document.getElementById('sl-count-col4');
  if (elCol4) elCol4.innerText = slState.unmatchedActual.length;
}

function renderSeriallessTables() {
  updateMonitoringCounts();
  
  const tbodyPairs = document.getElementById('sl-tbody-pairs');
  const tbodyCol3 = document.getElementById('sl-tbody-raw-billing');
  const tbodyCol4 = document.getElementById('sl-tbody-raw-actual');
  
  if (tbodyPairs) tbodyPairs.innerHTML = '';
  if (tbodyCol3) tbodyCol3.innerHTML = '';
  if (tbodyCol4) tbodyCol4.innerHTML = '';

  // Helper function to clean name for comparison
  function cleanName(val) {
    if (!val) return '';
    return String(val).replace(/\s+/g, '').replace(/\(공용\)/g, '').trim();
  }

  // Render Matched Pairs (Merged)
  if (tbodyPairs) {
    slState.matchedPairs.forEach((pair) => {
      const b = pair.billing;
      const a = pair.actual;
      const isChecked = slState.selectedPairs.has(b._id);

      // Mismatches highlighting
      const nameMismatch = cleanName(b.name) !== cleanName(a.name) ? 'sl-mismatch' : '';
      const deptMismatch = b.dept.trim() !== a.dept.trim() ? 'sl-mismatch' : '';
      const workplaceMismatch = b.workplace.trim() !== a.workplace.trim() ? 'sl-mismatch' : '';

      const tr = document.createElement('tr');
      if (isChecked) tr.classList.add('sl-row-highlight');
      tr.innerHTML = `
        <td style="text-align: center; padding: 10px 4px; vertical-align: middle;">
          <input type="checkbox" class="sl-pair-item-cb" data-id="${b._id}" ${isChecked ? 'checked' : ''}>
        </td>
        <td style="padding: 10px 8px; vertical-align: middle;">
          <div style="display: flex; justify-content: space-between; gap: 8px; align-items: center;">
            <div>
              <span style="font-weight:bold; font-size:0.85rem;">${b.name || '(공백)'}</span>
              <span style="font-size:0.7rem; color:#718096; margin-left:4px;">(${b.empId || '사번없음'})</span>
              <div style="font-size:0.75rem; color:#4a5568; margin-top:2px;">${b.dept || '-'} / ${b.workplace || '-'}</div>
            </div>
            <div style="text-align: right; min-width: 140px;">
              <div style="font-weight: 500; font-size:0.75rem; color:#1a202c;">${b.model}</div>
              <div class="serial-highlight" style="font-size:0.72rem; font-family:monospace; color:#4f46e5; font-weight:600; margin-top:2px;">${b.serial || '(시리얼없음)'}</div>
              <span class="sl-ref-subtext" style="color: ${pair.billingRental.status === '일치' ? '#16a34a' : (pair.billingRental.status === '유사' ? '#d97706' : '#718096')}; font-size:0.65rem; margin-top:2px;">
                ● ${pair.billingRental.detail || '렌탈 미일치'}
              </span>
            </div>
          </div>
        </td>
        <td style="text-align: center; padding: 10px 4px; vertical-align: middle; background-color: #f8fafc; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">
          <span class="badge-confidence badge-${pair.confidence.toLowerCase()}">${pair.confidence}</span>
          <div style="font-size:0.6rem; color:#64748b; margin-top:4px; font-weight:500; line-height:1.2;">${pair.reason}</div>
        </td>
        <td style="padding: 10px 8px; vertical-align: middle;">
          <div style="display: flex; justify-content: space-between; gap: 8px; align-items: center;">
            <div>
              <span style="font-weight:bold; font-size:0.85rem;" class="${nameMismatch}">${a.name || '(공백)'}</span>
              <span style="font-size:0.7rem; color:#718096; margin-left:4px;">(${a.empId || '사번없음'})</span>
              <div style="font-size:0.75rem; color:#4a5568; margin-top:2px;"><span class="${deptMismatch}">${a.dept || '-'}</span> / <span class="${workplaceMismatch}">${a.workplace || '-'}</span></div>
            </div>
            <div style="text-align: right; min-width: 140px;">
              <div style="font-weight: 500; font-size:0.75rem; color:#1a202c;">${a.model}</div>
              <div class="serial-highlight" style="font-size:0.72rem; font-family:monospace; color:#0d9488; font-weight:600; margin-top:2px;">${a.serial || '(시리얼없음)'}</div>
              <span class="sl-ref-subtext" style="color: ${pair.actualRental.status === '일치' ? '#16a34a' : (pair.actualRental.status === '유사' ? '#d97706' : '#718096')}; font-size:0.65rem; margin-top:2px;">
                ● ${pair.actualRental.detail || '렌탈 미일치'}
              </span>
            </div>
          </div>
        </td>
      `;

      // Bind checkbox change
      tr.querySelector('.sl-pair-item-cb').addEventListener('change', (e) => {
        const checked = e.target.checked;
        if (checked) {
          slState.selectedPairs.add(b._id);
          tr.classList.add('sl-row-highlight');
        } else {
          slState.selectedPairs.delete(b._id);
          tr.classList.remove('sl-row-highlight');
        }
        updateMonitoringCounts();
      });

      // Bind doubleclick rematch event (excluding checkbox clicks)
      tr.style.cursor = 'pointer';
      tr.addEventListener('dblclick', async (e) => {
        if (e.target.type === 'checkbox' || e.target.closest('.sl-pair-item-cb')) return;
        
        // Clear text selections triggered by double-click
        window.getSelection().removeAllRanges();
        
        const confirmMsg = `[${b.name || '사번없음'}] 청구 자산에 대한 제안된 실사 후보 [${a.name || '사번없음'}] 매칭이 마음에 들지 않으십니까?\n이 후보를 제외하고 다른 매칭 후보를 검색합니다.`;
        if (!confirm(confirmMsg)) return;

        // Initialize exclusion list if empty
        if (!slState.exclusions[b._id]) {
          slState.exclusions[b._id] = [];
        }
        slState.exclusions[b._id].push(a._id);

        // Gather all other currently matched actual IDs
        const alreadyMatchedActualIds = slState.matchedPairs
          .filter(p => p.billing._id !== b._id)
          .map(p => p.actual._id);

        showLoading("다른 매칭 후보 검색 중...");
        try {
          const criteria = {
            empid: slCbEmpid.checked,
            name: slCbName.checked,
            dept: slCbDept.checked,
            workplace: slCbWorkplace.checked
          };
          const filters = {
            billingModels: getCheckedModels('sl-filter-billing-model-container'),
            billingSerial: slFilterBillingSerial.value,
            billingModelKeyword: document.getElementById('sl-filter-billing-model-keyword') ? document.getElementById('sl-filter-billing-model-keyword').value : "",
            actualModels: getCheckedModels('sl-filter-actual-model-container'),
            actualModelKeyword: document.getElementById('sl-filter-actual-model-keyword') ? document.getElementById('sl-filter-actual-model-keyword').value : ""
          };

          const res = await fetch('/api/rematch-row', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              billingRow: b,
              criteria,
              filters,
              alreadyMatchedActualIds,
              excludedActualIds: slState.exclusions[b._id],
              key1: selKey1.value,
              key2: selKey2.value,
              key3: selKey3.value
            })
          });
          const data = await res.json();
          hideLoading();

          if (data.error) throw new Error(data.error);

          if (data.candidate) {
            // 1. Return old actual candidate back to unmatched list
            slState.unmatchedActual.push(a);

            // 2. Remove new actual candidate from unmatched list
            slState.unmatchedActual = slState.unmatchedActual.filter(item => item._id !== data.candidate._id);

            // 3. Swap inside matchedPairs list
            const pairIdx = slState.matchedPairs.findIndex(p => p.billing._id === b._id);
            if (pairIdx !== -1) {
              slState.matchedPairs[pairIdx].actual = data.candidate;
              slState.matchedPairs[pairIdx].score = data.score;
              slState.matchedPairs[pairIdx].confidence = data.confidence;
              slState.matchedPairs[pairIdx].reason = data.reason;
              slState.matchedPairs[pairIdx].billingRental = data.billingRental;
              slState.matchedPairs[pairIdx].actualRental = data.actualRental;
            }

            renderSeriallessTables();
          } else {
            // No candidate found
            const cancelMatch = confirm("더 이상 조건(AND)에 만족하는 다른 실사 자산 후보가 존재하지 않습니다.\n현재 매칭을 완전히 해제하고 각각 미매칭 목록으로 되돌리시겠습니까?");
            if (cancelMatch) {
              // Remove pair
              slState.matchedPairs = slState.matchedPairs.filter(p => p.billing._id !== b._id);
              slState.selectedPairs.delete(b._id);

              // Push back to unmatched lists
              slState.unmatchedBilling.push(b);
              slState.unmatchedActual.push(a);

              renderSeriallessTables();
            }
          }
        } catch (err) {
          hideLoading();
          alert("재매칭 오류: " + err.message);
        }
      });

      tbodyPairs.appendChild(tr);
    });
  }

  // Render Unmatched Raw Billing (Col 3)
  if (tbodyCol3) {
    slState.unmatchedBilling.forEach(b => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding: 6px 4px; vertical-align: middle;">
          <div style="font-weight:bold;">${b.name || '(공백)'}</div>
          <div style="font-size:0.65rem; color:#718096;">${b.empId || '(사번없음)'}</div>
        </td>
        <td style="padding: 6px 4px; vertical-align: middle;">
          <div>${b.dept || '-'}</div>
          <div style="font-size:0.65rem; color:#718096;">${b.workplace || '-'}</div>
        </td>
        <td style="padding: 6px 4px; vertical-align: middle;">${b.model}</td>
        <td style="padding: 6px 4px; vertical-align: middle; font-family:monospace;">${b.serial || '-'}</td>
      `;
      tbodyCol3.appendChild(tr);
    });
  }

  // Render Unmatched Raw Actual (Col 4)
  if (tbodyCol4) {
    slState.unmatchedActual.forEach(a => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding: 6px 4px; vertical-align: middle;">
          <div style="font-weight:bold;">${a.name || '(공백)'}</div>
          <div style="font-size:0.65rem; color:#718096;">${a.empId || '(사번없음)'}</div>
        </td>
        <td style="padding: 6px 4px; vertical-align: middle;">
          <div>${a.dept || '-'}</div>
          <div style="font-size:0.65rem; color:#718096;">${a.workplace || '-'}</div>
        </td>
        <td style="padding: 6px 4px; vertical-align: middle;">${a.model}</td>
        <td style="padding: 6px 4px; vertical-align: middle; font-family:monospace;">${a.serial || '-'}</td>
      `;
      tbodyCol4.appendChild(tr);
    });
  }
}