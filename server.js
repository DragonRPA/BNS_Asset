const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');

// Exit process immediately on uncaught exceptions or unhandled promise rejections
process.on('uncaughtException', (err) => {
  console.error("CRITICAL BACKEND ERROR (Uncaught Exception):", err.message);
  console.error(err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error("CRITICAL BACKEND ERROR (Unhandled Rejection):", reason);
  process.exit(1);
});

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.static(__dirname));

const DATA_DIR = 'd:\\BNS_Asset';
const FILE1_PATH = path.join(DATA_DIR, 'temp_file1.xlsx');
const FILE2_PATH = path.join(DATA_DIR, 'temp_file2.xlsx');
const FILE3_PATH = path.join(DATA_DIR, 'temp_file3.xlsx');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const RESULT_FILE = '추정자료.xlsx';

// Config Helpers
function readConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
      console.error("Error reading config.json:", e);
    }
  }
  return {};
}

function writeConfig(updates) {
  const current = readConfig();
  const newConfig = { ...current, ...updates };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf8');
}

// Helper: Clean comparison keys
function cleanSerial(val) {
  if (val === null || val === undefined) return "";
  return String(val).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

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

// Levenshtein distance
function getLevenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
  }
  return matrix[b.length][a.length];
}

// ============================================================
// 헤더 키를 실제 파일의 헤더에서 정확히 찾는 헬퍼
// ============================================================
function findHeader(headers, exactNames) {
  for (const name of exactNames) {
    const found = headers.find(h => String(h).trim() === name);
    if (found) return found;
  }
  return null;
}

function findHeaderIncludes(headers, keywords) {
  for (const kw of keywords) {
    const found = headers.find(h => String(h).includes(kw));
    if (found) return found;
  }
  return null;
}

// ============================================================
// Routes
// ============================================================

app.get('/api/config', (req, res) => {
  const config = readConfig();
  if (!config.file1Path || !config.file2Path || !config.file3Path) {
    return res.json({ hasConfig: false });
  }

  const f1Path = fs.existsSync(config.file1Path) ? config.file1Path : FILE1_PATH;
  const f2Path = fs.existsSync(config.file2Path) ? config.file2Path : FILE2_PATH;
  const f3Path = fs.existsSync(config.file3Path) ? config.file3Path : FILE3_PATH;

  if (!fs.existsSync(f1Path) || !fs.existsSync(f2Path) || !fs.existsSync(f3Path)) {
    return res.json({ hasConfig: false });
  }

  try {
    const wb1 = XLSX.readFile(f1Path);
    const headers1 = XLSX.utils.sheet_to_json(wb1.Sheets[wb1.SheetNames[0]], { header: 1 })[0] || [];
    const wb2 = XLSX.readFile(f2Path);
    const headers2 = XLSX.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]], { header: 1 })[0] || [];
    const wb3 = XLSX.readFile(f3Path);
    const sheetName3 = wb3.SheetNames.includes('렌탈사현황') ? '렌탈사현황' : wb3.SheetNames[0];
    const headers3 = XLSX.utils.sheet_to_json(wb3.Sheets[sheetName3], { header: 1 })[0] || [];

    res.json({
      hasConfig: true,
      file1Name: config.file1Name, file2Name: config.file2Name, file3Name: config.file3Name,
      key1: config.key1, key2: config.key2, key3: config.key3,
      headers1, headers2, headers3
    });
  } catch (error) {
    console.error(error);
    res.json({ hasConfig: false, error: error.message });
  }
});

app.post('/api/upload-file1', (req, res) => {
  const { name, base64 } = req.body;
  if (!base64) return res.status(400).json({ error: '파일 데이터가 없습니다.' });
  try {
    const targetPath = path.join(DATA_DIR, name);
    const buffer = Buffer.from(base64, 'base64');
    fs.writeFileSync(targetPath, buffer);
    fs.writeFileSync(FILE1_PATH, buffer);
    writeConfig({ file1Name: name, file1Path: targetPath });
    const wb = XLSX.readFile(targetPath);
    const headers = (XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })[0]) || [];
    res.json({ name, headers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '파일 1 처리 중 오류: ' + error.message });
  }
});

app.post('/api/upload-file2', (req, res) => {
  const { name, base64 } = req.body;
  if (!base64) return res.status(400).json({ error: '파일 데이터가 없습니다.' });
  try {
    const targetPath = path.join(DATA_DIR, name);
    const buffer = Buffer.from(base64, 'base64');
    fs.writeFileSync(targetPath, buffer);
    fs.writeFileSync(FILE2_PATH, buffer);
    writeConfig({ file2Name: name, file2Path: targetPath });
    const wb = XLSX.readFile(targetPath);
    const headers = (XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })[0]) || [];
    res.json({ name, headers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '파일 2 처리 중 오류: ' + error.message });
  }
});

app.post('/api/upload-file3', (req, res) => {
  const { name, base64 } = req.body;
  if (!base64) return res.status(400).json({ error: '파일 데이터가 없습니다.' });
  try {
    const targetPath = path.join(DATA_DIR, name);
    const buffer = Buffer.from(base64, 'base64');
    fs.writeFileSync(targetPath, buffer);
    fs.writeFileSync(FILE3_PATH, buffer);
    writeConfig({ file3Name: name, file3Path: targetPath });
    const wb = XLSX.readFile(targetPath);
    const sheetName = wb.SheetNames.includes('렌탈사현황') ? '렌탈사현황' : wb.SheetNames[0];
    const headers = (XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 })[0]) || [];
    res.json({ name, headers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '파일 3 처리 중 오류: ' + error.message });
  }
});

let currentProgress = 0;

app.get('/api/compare-progress', (req, res) => {
  res.json({ progress: currentProgress });
});

// ============================================================
// Compare Route
// ============================================================
app.post('/api/compare', async (req, res) => {
  const { key1, key2, key3 } = req.body;
  writeConfig({ key1, key2, key3 });

  const config = readConfig();
  const f1Path = fs.existsSync(config.file1Path) ? config.file1Path : FILE1_PATH;
  const f2Path = fs.existsSync(config.file2Path) ? config.file2Path : FILE2_PATH;
  const f3Path = fs.existsSync(config.file3Path) ? config.file3Path : FILE3_PATH;

  if (!fs.existsSync(f1Path) || !fs.existsSync(f2Path) || !fs.existsSync(f3Path)) {
    return res.status(400).json({ error: '비교할 파일이 존재하지 않습니다.' });
  }
  if (!key1 || !key2 || !key3) {
    return res.status(400).json({ error: '비교 대상 컬럼을 각각 지정해야 합니다.' });
  }

  try {
    currentProgress = 0;
    const wb1 = XLSX.readFile(f1Path);
    const rows1 = XLSX.utils.sheet_to_json(wb1.Sheets[wb1.SheetNames[0]], { defval: "" });
    const wb2 = XLSX.readFile(f2Path);
    const rows2 = XLSX.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]], { defval: "" });
    const wb3 = XLSX.readFile(f3Path);
    const sheetName3 = wb3.SheetNames.includes('렌탈사현황') ? '렌탈사현황' : wb3.SheetNames[0];
    const rows3 = XLSX.utils.sheet_to_json(wb3.Sheets[sheetName3], { defval: "" });

    const billingData = rows1.map((row, idx) => ({
      _id: `b_${idx}`, idx: idx + 2,
      name: row['이름'] || row['사용자'] || row['성명'] || "",
      empId: row['사번'] || row['사원번호'] || "",
      dept: row['부서'] || row['소속'] || "",
      device: row['지급기기'] || row['구분'] || row['기기'] || "",
      model: row['상세모델'] || row['모델명'] || row['모델'] || "",
      serial: String(row[key1] || "").trim(),
      cleanSerial: cleanSerial(row[key1]),
      originalRow: row
    }));

    const actualData = rows2.map((row, idx) => ({
      _id: `a_${idx}`, idx: idx + 2,
      name: row['이름'] || row['사용자'] || row['성명'] || "",
      empId: row['사번'] || row['사원번호'] || "",
      dept: row['부서'] || row['소속'] || "",
      device: row['구분'] || row['지급기기'] || row['기기'] || "",
      model: row['상세모델'] || row['모델명'] || row['모델'] || "",
      serial: String(row[key2] || "").trim(),
      cleanSerial: cleanSerial(row[key2]),
      originalRow: row
    }));

    const rentalData = rows3.map((row, idx) => ({
      _id: `r_${idx}`, idx: idx + 2,
      name: row['이름'] || row['사용자'] || row['성명'] || "", // Do not default to '최종 수요처' here to avoid matching name against address
      empId: row['사번'] || row['사원번호'] || "",
      dept: row['부서'] || row['소속'] || "",
      device: row['제품'] || row['품명'] || row['지급기기'] || row['구분'] || "",
      model: row['상세모델'] || row['모델명'] || row['모델'] || "",
      serial: String(row[key3] || "").trim(),
      cleanSerial: cleanSerial(row[key3]),
      originalRow: row
    }));

    const exactMatches = [];
    const similarMatches = [];
    const unmatchedBilling1 = [];
    const unmatchedActual = [];

    // STEP 1: Billing vs Actual - Exact Match
    const actualMap = new Map();
    actualData.forEach(row => {
      if (row.cleanSerial) {
        if (!actualMap.has(row.cleanSerial)) actualMap.set(row.cleanSerial, []);
        actualMap.get(row.cleanSerial).push(row);
      } else {
        unmatchedActual.push(row);
      }
    });

    const matchedActualIds = new Set();
    billingData.forEach(bRow => {
      if (!bRow.cleanSerial) { unmatchedBilling1.push(bRow); return; }
      if (actualMap.has(bRow.cleanSerial)) {
        const match = actualMap.get(bRow.cleanSerial).find(c => !matchedActualIds.has(c._id));
        if (match) {
          matchedActualIds.add(match._id);
          exactMatches.push({ billing: bRow, actual: match, matchType: '완전일치 (청구-실사)' });
        } else { unmatchedBilling1.push(bRow); }
      } else { unmatchedBilling1.push(bRow); }
    });

    actualData.forEach(aRow => {
      if (aRow.cleanSerial && !matchedActualIds.has(aRow._id)) unmatchedActual.push(aRow);
    });

    // STEP 2: Billing vs Actual - Similar (<=1 char diff, length>=12)
    const billingMatchedInSimilar = new Set();
    const actualMatchedInSimilar = new Set();

    const totalSteps = unmatchedBilling1.length * 2;
    let stepsDone = 0;

    const highCandidates = [];
    for (let i = 0; i < unmatchedBilling1.length; i++) {
      const bRow = unmatchedBilling1[i];
      if (bRow.cleanSerial && bRow.cleanSerial.length >= 12) {
        unmatchedActual.forEach(aRow => {
          if (!aRow.cleanSerial || aRow.cleanSerial.length < 12) return;
          if (actualMatchedInSimilar.has(aRow._id)) return;
          const nameMatch = cleanName(bRow.name) === cleanName(aRow.name) && cleanName(bRow.name).length >= 2;
          const empIdMatch = compareEmpId(bRow.empId, aRow.empId);
          const is14to15Rule = (
            bRow.cleanSerial.length === 14 &&
            aRow.cleanSerial.length === 15 &&
            /^[A-Z]$/i.test(aRow.cleanSerial.charAt(14)) &&
            aRow.cleanSerial.substring(0, 14) === bRow.cleanSerial
          );

          if (nameMatch || empIdMatch || is14to15Rule) {
            if (Math.abs(bRow.cleanSerial.length - aRow.cleanSerial.length) <= 1) {
              const dist = getLevenshteinDistance(bRow.cleanSerial, aRow.cleanSerial);
              if (dist <= 1) {
                let reason = nameMatch ? '이름 일치 & 유사' : '사번 일치 & 유사';
                if (is14to15Rule) {
                  reason = '14-15자리 패턴 일치(자동승인)';
                }
                highCandidates.push({
                  billing: bRow, actual: aRow, distance: dist, confidence: 'High',
                  reason: reason,
                  matchType: '유사일치 (청구-실사)',
                  approved: is14to15Rule ? true : undefined
                });
              }
            }
          }
        });
      }
      stepsDone++;
      if (i % 25 === 0) {
        currentProgress = Math.min(99, Math.round((stepsDone / totalSteps) * 100));
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    highCandidates.sort((a, b) => a.distance - b.distance);
    highCandidates.forEach(c => {
      if (!billingMatchedInSimilar.has(c.billing._id) && !actualMatchedInSimilar.has(c.actual._id)) {
        billingMatchedInSimilar.add(c.billing._id);
        actualMatchedInSimilar.add(c.actual._id);
        similarMatches.push(c);
      }
    });

    const lowCandidates = [];
    for (let i = 0; i < unmatchedBilling1.length; i++) {
      const bRow = unmatchedBilling1[i];
      if (!billingMatchedInSimilar.has(bRow._id) && bRow.cleanSerial && bRow.cleanSerial.length >= 12) {
        unmatchedActual.forEach(aRow => {
          if (actualMatchedInSimilar.has(aRow._id)) return;
          if (!aRow.cleanSerial || aRow.cleanSerial.length < 12) return;
          if (Math.abs(bRow.cleanSerial.length - aRow.cleanSerial.length) <= 1) {
            const dist = getLevenshteinDistance(bRow.cleanSerial, aRow.cleanSerial);
            if (dist <= 1) {
              lowCandidates.push({
                billing: bRow, actual: aRow, distance: dist, confidence: 'Low',
                reason: '텍스트 유사 (검토 필요)', matchType: '유사일치 (청구-실사)'
              });
            }
          }
        });
      }
      stepsDone++;
      if (i % 25 === 0) {
        currentProgress = Math.min(99, Math.round((stepsDone / totalSteps) * 100));
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    lowCandidates.sort((a, b) => a.distance - b.distance);
    lowCandidates.forEach(c => {
      if (!billingMatchedInSimilar.has(c.billing._id) && !actualMatchedInSimilar.has(c.actual._id)) {
        billingMatchedInSimilar.add(c.billing._id);
        actualMatchedInSimilar.add(c.actual._id);
        similarMatches.push(c);
      }
    });

    currentProgress = 100;

    // STEP 3: Remaining Billing vs Rental - Excluded from match list per user request.
    const finalUnmatchedBilling = unmatchedBilling1.filter(b => !billingMatchedInSimilar.has(b._id));
    const finalUnmatchedActual = unmatchedActual.filter(a => !actualMatchedInSimilar.has(a._id));

    // Build rental lookup map to provide helper info to the user
    const rentalLookupMap = new Map();
    rentalData.forEach(row => {
      if (row.cleanSerial && !rentalLookupMap.has(row.cleanSerial)) rentalLookupMap.set(row.cleanSerial, row);
    });
    const sampleRentalRow = rentalData[0]?.originalRow || {};
    const rentalMgmtKeyForLabel = Object.keys(sampleRentalRow).find(k => k.includes('관리번호') || k.includes('자산번호')) || '자산번호';

    similarMatches.forEach(match => {
      const bClean = match.billing.cleanSerial;
      const aClean = match.actual.cleanSerial;
      match.billingRentalMatch = (bClean && rentalLookupMap.has(bClean))
        ? { matched: true, serial: rentalLookupMap.get(bClean).serial, assetNo: rentalLookupMap.get(bClean).originalRow[rentalMgmtKeyForLabel] || "" }
        : { matched: false };
      match.actualRentalMatch = (aClean && rentalLookupMap.has(aClean))
        ? { matched: true, serial: rentalLookupMap.get(aClean).serial, assetNo: rentalLookupMap.get(aClean).originalRow[rentalMgmtKeyForLabel] || "" }
        : { matched: false };
    });

    res.json({
      summary: {
        billingTotal: rows1.length, actualTotal: rows2.length, rentalTotal: rows3.length,
        exactMatchesCount: exactMatches.length, similarMatchesCount: similarMatches.length,
        unmatchedBillingCount: finalUnmatchedBilling.length, unmatchedActualCount: finalUnmatchedActual.length
      },
      exactMatches, similarMatches,
      unmatchedBilling: finalUnmatchedBilling,
      unmatchedActual: finalUnmatchedActual
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '엑셀 데이터 분석 중 오류: ' + error.message });
  }
});

// ============================================================
// Save Route - 단일 시트 출력 (인덱스 보정 방식으로 완벽한 동기화)
// ============================================================
app.post('/api/save', async (req, res) => {
  const { exactMatches, similarMatches, unmatchedBilling, unmatchedActual, key1, key2, key3 } = req.body;
  const config = readConfig();

  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BNS Asset';
    workbook.created = new Date();

    // 스타일 정의
    const whiteColor = 'FFFFFF';
    const headerFont = { name: '맑은 고딕', size: 11, bold: true, color: { argb: whiteColor } };
    const normalFont = { name: '맑은 고딕', size: 10 };
    const boldFont = { name: '맑은 고딕', size: 10, bold: true };
    const greenFont = { name: '맑은 고딕', size: 10, bold: true, color: { argb: '375623' } };
    const orangeFont = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'BF6000' } };
    const redFont = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'C00000' } };

    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1F4E79' } };
    const resultHeaderFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7030A0' } };
    const exactFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2EFDA' } };
    const similarFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2CC' } };
    const unmatchedFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FCE4D6' } };
    const borderStyle = {
      top: { style: 'thin', color: { argb: 'D9D9D9' } },
      left: { style: 'thin', color: { argb: 'D9D9D9' } },
      bottom: { style: 'thin', color: { argb: 'D9D9D9' } },
      right: { style: 'thin', color: { argb: 'D9D9D9' } }
    };

    // 원본 파일들 다시 읽기
    const f1Path = fs.existsSync(config.file1Path) ? config.file1Path : FILE1_PATH;
    const f2Path = fs.existsSync(config.file2Path) ? config.file2Path : FILE2_PATH;
    const f3Path = fs.existsSync(config.file3Path) ? config.file3Path : FILE3_PATH;

    const wb1 = XLSX.readFile(f1Path);
    const wb2 = XLSX.readFile(f2Path);
    const wb3 = XLSX.readFile(f3Path);
    const sheetName3 = wb3.SheetNames.includes('렌탈사현황') ? '렌탈사현황' : wb3.SheetNames[0];

    // 헤더 리스트 추출 (2D 읽기 방식으로 완벽 보존)
    const headers1 = XLSX.utils.sheet_to_json(wb1.Sheets[wb1.SheetNames[0]], { header: 1 })[0] || [];
    const headers2 = XLSX.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]], { header: 1 })[0] || [];
    const headers3 = XLSX.utils.sheet_to_json(wb3.Sheets[sheetName3], { header: 1 })[0] || [];

    // ========================================
    // 파일1(청구) 헤더 매핑 대상 찾기
    // ========================================
    const b_이름 = findHeader(headers1, ['이름', '사용자', '성명']);
    const b_사번 = findHeader(headers1, ['사번', '사원번호']);
    const b_사업장 = findHeader(headers1, ['사업장']);
    const b_부서 = findHeader(headers1, ['부서', '소속', '부서명']);
    const b_망구분 = findHeader(headers1, ['망구분']);
    const b_관리번호 = findHeaderIncludes(headers1, ['관리번호', '자산번호']);

    // ========================================
    // 파일2(실사) 헤더 매핑 대상 찾기
    // ========================================
    const a_이름 = findHeader(headers2, ['이름', '사용자', '성명']);
    const a_사번 = findHeader(headers2, ['사번', '사원번호']);
    const a_사업장 = findHeader(headers2, ['사업장']);
    const a_부서 = findHeader(headers2, ['부서', '소속', '부서명']);
    const a_망구분 = findHeader(headers2, ['망구분']);
    const a_관리번호 = findHeaderIncludes(headers2, ['관리번호', '자산번호']);

    // ========================================
    // 파일3(렌탈사) 헤더 매핑 대상 찾기
    // * 중요: 이름 매핑 시 '최종 수요처' 제외 (최종 수요처는 주소창에 불과하므로 개인정보를 덮어쓰지 않도록 함)
    // ========================================
    const r_이름 = findHeader(headers3, ['이름', '사용자', '성명']);
    const r_사번 = findHeader(headers3, ['사번', '사원번호']);
    const r_사업장 = findHeader(headers3, ['사업장']);
    const r_부서 = findHeader(headers3, ['부서', '소속', '부서명']);
    const r_망구분 = findHeader(headers3, ['망구분']);
    const r_관리번호 = findHeaderIncludes(headers3, ['관리번호', '자산번호']);

    // 각 헤더 명칭의 열 인덱스 구하기 (0-based)
    const nameColIdx = b_이름 ? headers1.indexOf(b_이름) : -1;
    const empIdColIdx = b_사번 ? headers1.indexOf(b_사번) : -1;
    const locColIdx = b_사업장 ? headers1.indexOf(b_사업장) : -1;
    const deptColIdx = b_부서 ? headers1.indexOf(b_부서) : -1;
    const netColIdx = b_망구분 ? headers1.indexOf(b_망구분) : -1;
    const mgmtColIdx = b_관리번호 ? headers1.indexOf(b_관리번호) : -1;
    const serialColIdx = key1 ? headers1.indexOf(key1) : -1;

    // 보정 로직 (인덱스 직접 치환 방식)
    function applyCorrection(rowArray, matchActualRow, isRental) {
      const src_이름 = isRental ? r_이름 : a_이름;
      const src_사번 = isRental ? r_사번 : a_사번;
      const src_사업장 = isRental ? r_사업장 : a_사업장;
      const src_부서 = isRental ? r_부서 : a_부서;
      const src_망구분 = isRental ? r_망구분 : a_망구분;
      const src_관리번호 = isRental ? r_관리번호 : a_관리번호;
      const src_serial = isRental ? key3 : key2;

      // 제조번호 업데이트
      if (serialColIdx !== -1) {
        const val = matchActualRow[src_serial];
        if (val !== undefined && val !== "") rowArray[serialColIdx] = val;
      }
      // 이름 업데이트
      if (nameColIdx !== -1 && src_이름) {
        const val = matchActualRow[src_이름];
        if (val !== undefined && val !== "") rowArray[nameColIdx] = val;
      }
      // 사번 업데이트
      if (empIdColIdx !== -1 && src_사번) {
        const val = matchActualRow[src_사번];
        if (val !== undefined && val !== "") rowArray[empIdColIdx] = val;
      }
      // 사업장 업데이트
      if (locColIdx !== -1 && src_사업장) {
        const val = matchActualRow[src_사업장];
        if (val !== undefined && val !== "") rowArray[locColIdx] = val;
      }
      // 부서 업데이트
      if (deptColIdx !== -1 && src_부서) {
        const val = matchActualRow[src_부서];
        if (val !== undefined && val !== "") rowArray[deptColIdx] = val;
      }
      // 망구분 업데이트
      if (netColIdx !== -1 && src_망구분) {
        const val = matchActualRow[src_망구분];
        if (val !== undefined && val !== "") rowArray[netColIdx] = val;
      }
      // 관리번호 업데이트 (렌탈사 매칭인 경우 관리번호 업데이트 제외)
      if (mgmtColIdx !== -1 && src_관리번호 && !isRental) {
        const val = matchActualRow[src_관리번호];
        if (val !== undefined && val !== "") rowArray[mgmtColIdx] = val;
      }
    }

    // ========================================
    // 단일 시트 생성
    // ========================================
    const sheet = workbook.addWorksheet('추정자료');
    sheet.views = [{ showGridLines: true, freezeRow: 1 }];

    // 파일1을 2D array 형태로 완벽하게 읽기 (공백/특수키 불일치 방지)
    const originalRows1 = XLSX.utils.sheet_to_json(wb1.Sheets[wb1.SheetNames[0]], { header: 1, defval: "" });
    const dataRows1 = originalRows1.slice(1); // 헤더 제외

    // 출력 헤더 생성
    const outputHeaders = ['추정 결과', ...headers1];
    sheet.addRow(outputHeaders);
    sheet.getRow(1).height = 26;
    for (let i = 1; i <= outputHeaders.length; i++) {
      const cell = sheet.getCell(1, i);
      cell.fill = (i === 1) ? resultHeaderFill : headerFill;
      cell.font = headerFont;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = borderStyle;
    }

    // 1. 청구(File 1) 목록 보정 후 추가
    dataRows1.forEach((rowArray, i) => {
      const idx = i + 2; // Excel 행 인덱스 (1-based)
      
      const exactMatch = exactMatches.find(m => m.billing.idx === idx);
      const approvedSimMatch = similarMatches.find(m => m.billing.idx === idx && m.approved);

      let resultLabel = '불일치';
      let resultFont = redFont;
      let resultFill = unmatchedFill;

      // 원본 행 복사본 생성하여 가공
      const correctedRowArray = [...rowArray];

      if (exactMatch) {
        resultLabel = '완전 일치';
        resultFont = greenFont;
        resultFill = exactFill;

        const isRental = (exactMatch.matchType || '').includes('렌탈사');
        applyCorrection(correctedRowArray, exactMatch.actual.originalRow, isRental);
      } else if (approvedSimMatch) {
        resultLabel = '유사해서 보정후 업데이트';
        resultFont = orangeFont;
        resultFill = similarFill;

        const isRental = (approvedSimMatch.matchType || '').includes('렌탈사');
        applyCorrection(correctedRowArray, approvedSimMatch.actual.originalRow, isRental);
      }

      const rowData = [resultLabel, ...correctedRowArray];
      const row = sheet.addRow(rowData);
      row.height = 20;
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.font = normalFont;
        cell.border = borderStyle;
        cell.alignment = { vertical: 'middle' };
        if (colNum === 1) {
          cell.alignment.horizontal = 'center';
          cell.font = resultFont;
          cell.fill = resultFill;
        }
      });
    });

    // Auto-fit widths
    sheet.columns.forEach(column => {
      let maxLen = 12;
      column.eachCell({ includeEmpty: true }, cell => {
        if (cell.value) {
          const len = String(cell.value).length * 1.3;
          if (len > maxLen) maxLen = len;
        }
      });
      column.width = Math.min(maxLen, 35);
    });

    const resultPath = path.join(DATA_DIR, RESULT_FILE);
    await workbook.xlsx.writeFile(resultPath);
    console.log(`Saved single-sheet result file at: ${resultPath}`);

    res.json({ message: '성공적으로 추정자료 결과를 저장했습니다.', file: RESULT_FILE });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '엑셀 결과 저장 중 오류: ' + error.message });
  }
});

app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`자산 실사 대조 프로그램 서버 구동 중...`);
  console.log(`주소: http://localhost:${PORT}`);
  console.log(`=================================================`);

  const url = `http://localhost:${PORT}`;
  const startCmd = process.platform === 'win32' ? `start "" "${url}"` : (process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`);
  require('child_process').exec(startCmd);
});
