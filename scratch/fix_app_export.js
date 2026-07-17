const fs = require('fs');

const filePath = 'd:/BNS_Asset/app.js';
let content = fs.readFileSync(filePath, 'utf8');

const regexBlock = /\/\/ Excel Export: Export current tab's data as downloadable \.xlsx[\s\S]*?XLSX\.writeFile\(wb, fileName\);[\s\S]*?showToast[^\n]*\n\s*};/;

const replacementBlock = `// Excel Export: Export current tab's data as downloadable .xlsx
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
  showToast(\`\${fileName} 다운로드 완료! (\${(sheetData.length - 1).toLocaleString()}건)\`);
};`;

if (regexBlock.test(content)) {
  content = content.replace(regexBlock, replacementBlock);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log("Successfully rebuilt exportTabToExcel!");
} else {
  console.error("Error: Could not match exportTabToExcel block regex.");
}
