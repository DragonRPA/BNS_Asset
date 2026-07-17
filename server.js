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

// Helper: Parse various excel and string date formats safely
function parseExcelDate(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return new Date((val - 25569) * 86400 * 1000);
  }
  const str = String(val).trim();
  if (!str) return null;

  const cleaned = str.replace(/[^0-9]/g, '');
  if (cleaned.length === 8) {
    const y = parseInt(cleaned.substring(0, 4), 10);
    const m = parseInt(cleaned.substring(4, 6), 10) - 1;
    const d = parseInt(cleaned.substring(6, 8), 10);
    return new Date(y, m, d);
  }

  const parsed = Date.parse(str);
  if (!isNaN(parsed)) {
    return new Date(parsed);
  }
  return null;
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
  const { key1, key2, key3, refDate } = req.body;
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

    // 1. 청구 데이터 로드 및 날짜 필터 적용
    const rawBillingData = rows1.map((row, idx) => ({
      _id: `b_${idx}`, idx: idx + 2,
      name: row['이름'] || row['사용자'] || row['성명'] || "",
      empId: row['사번'] || row['사원번호'] || "",
      dept: row['부서'] || row['소속'] || "",
      workplace: row['사업장'] || "",
      device: row['지급기기'] || row['구분'] || row['기기'] || "",
      model: row['상세모델'] || row['모델명'] || row['모델'] || "",
      serial: String(row[key1] || "").trim(),
      cleanSerial: cleanSerial(row[key1]),
      originalRow: row
    }));

    const parsedRef = parseExcelDate(refDate);
    const excludedSerials = new Set();
    let billingData = rawBillingData;

    if (parsedRef) {
      billingData = rawBillingData.filter(b => {
        const cDate = parseExcelDate(b.originalRow['렌탈 시작일자'] || b.originalRow['렌탈시작일'] || b.originalRow['계약시작일'] || b.originalRow['계약일'] || b.originalRow['시작일']);
        const isIncluded = cDate !== null && cDate <= parsedRef;
        if (!isIncluded && b.cleanSerial) {
          excludedSerials.add(b.cleanSerial);
        }
        return isIncluded;
      });
    }

    // 2. 실사 데이터 로드 및 한화 제외 + 제외 시리얼 필터 적용
    const actualData = rows2.map((row, idx) => ({
      _id: `a_${idx}`, idx: idx + 2,
      name: row['이름'] || row['사용자'] || row['성명'] || "",
      empId: row['사번'] || row['사원번호'] || "",
      dept: row['부서'] || row['소속'] || "",
      workplace: row['사업장'] || "",
      device: row['구분'] || row['지급기기'] || row['기기'] || "",
      model: row['상세모델'] || row['모델명'] || row['모델'] || "",
      serial: String(row[key2] || "").trim(),
      cleanSerial: cleanSerial(row[key2]),
      originalRow: row
    })).filter(row => {
      // 실사 데이터에서 "자산소유" 컬럼의 값이 "한화" 인것을 제외
      const ownership = row.originalRow['자산소유'] ? String(row.originalRow['자산소유']).trim() : '';
      if (ownership === '한화') return false;

      // 검색기준일 필터로 제외된 청구 시리얼과 일치하는 실사 자산도 제외
      if (row.cleanSerial && excludedSerials.has(row.cleanSerial)) {
        return false;
      }
      return true;
    });

    // 3. 렌탈사 데이터 로드 및 제외 시리얼 필터 적용
    const rentalData = rows3.map((row, idx) => ({
      _id: `r_${idx}`, idx: idx + 2,
      name: row['이름'] || row['사용자'] || row['성명'] || "", 
      empId: row['사번'] || row['사원번호'] || "",
      dept: row['부서'] || row['소속'] || "",
      workplace: row['사업장'] || "",
      device: row['제품'] || row['품명'] || row['지급기기'] || row['구분'] || "",
      model: row['상세모델'] || row['모델명'] || row['모델'] || "",
      serial: String(row[key3] || "").trim(),
      cleanSerial: cleanSerial(row[key3]),
      originalRow: row
    })).filter(row => {
      // 검색기준일 필터로 제외된 청구 시리얼과 일치하는 렌탈 자산 제외
      if (row.cleanSerial && excludedSerials.has(row.cleanSerial)) {
        return false;
      }
      return true;
    });

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

// ============================================================
// 시리얼없음 초기 데이터 조회 API
// ============================================================
app.get('/api/serialless-initial', async (req, res) => {
  const config = readConfig();
  const f1Path = fs.existsSync(config.file1Path) ? config.file1Path : FILE1_PATH;
  const f2Path = fs.existsSync(config.file2Path) ? config.file2Path : FILE2_PATH;

  if (!fs.existsSync(f1Path) || !fs.existsSync(f2Path)) {
    return res.json({ hasData: false });
  }

  try {
    const wb1 = XLSX.readFile(f1Path);
    const rows1 = XLSX.utils.sheet_to_json(wb1.Sheets[wb1.SheetNames[0]], { defval: "" });
    const wb2 = XLSX.readFile(f2Path);
    const rows2 = XLSX.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]], { defval: "" });

    const k1 = req.query.key1 || config.key1;
    const k2 = req.query.key2 || config.key2;

    const rawBillingData = rows1.map((row, idx) => ({
      _id: `b_${idx}`,
      model: String(row['상세모델'] || row['모델명'] || row['모델'] || ""),
      serial: String(row[k1] || "").trim(),
      cleanSerial: cleanSerial(row[k1]),
      originalRow: row
    }));

    const parsedRef = parseExcelDate(req.query.refDate);
    const excludedSerials = new Set();
    let billingData = rawBillingData;

    if (parsedRef) {
      billingData = rawBillingData.filter(b => {
        const cDate = parseExcelDate(b.originalRow['렌탈 시작일자'] || b.originalRow['렌탈시작일'] || b.originalRow['계약시작일'] || b.originalRow['계약일'] || b.originalRow['시작일']);
        const isIncluded = cDate !== null && cDate <= parsedRef;
        if (!isIncluded && b.cleanSerial) {
          excludedSerials.add(b.cleanSerial);
        }
        return isIncluded;
      });
    }

    const actualData = rows2.map((row, idx) => ({
      _id: `a_${idx}`,
      model: String(row['상세모델'] || row['모델명'] || row['모델'] || ""),
      serial: String(row[k2] || "").trim(),
      cleanSerial: cleanSerial(row[k2]),
      originalRow: row
    })).filter(row => {
      // 실사 데이터에서 "자산소유" 컬럼의 값이 "한화" 인것을 제외
      const ownership = row.originalRow['자산소유'] ? String(row.originalRow['자산소유']).trim() : '';
      if (ownership === '한화') return false;

      // 검색기준일 필터로 제외된 청구 시리얼과 일치하는 실사 자산도 제외
      if (row.cleanSerial && excludedSerials.has(row.cleanSerial)) {
        return false;
      }
      return true;
    });

    const exactBillingIds = new Set();
    const exactActualIds = new Set();
    
    const actualMap = new Map();
    actualData.forEach(row => {
      if (row.cleanSerial) {
        if (!actualMap.has(row.cleanSerial)) actualMap.set(row.cleanSerial, []);
        actualMap.get(row.cleanSerial).push(row);
      }
    });

    billingData.forEach(bRow => {
      if (bRow.cleanSerial && actualMap.has(bRow.cleanSerial)) {
        const matched = actualMap.get(bRow.cleanSerial).find(a => !exactActualIds.has(a._id));
        if (matched) {
          exactBillingIds.add(bRow._id);
          exactActualIds.add(matched._id);
        }
      }
    });

    const unmatchedB = billingData.filter(b => !exactBillingIds.has(b._id));
    const unmatchedA = actualData.filter(a => !exactActualIds.has(a._id));

    // Filter billing models based on manufacturing serial search query
    let filteredB = unmatchedB;
    if (req.query.billingSerial) {
      const search = req.query.billingSerial.trim().toUpperCase();
      filteredB = filteredB.filter(b => b.serial.toUpperCase().includes(search));
    }

    const billingModels = [...new Set(filteredB.map(b => b.model).filter(Boolean))];
    const actualModels = [...new Set(unmatchedA.map(a => a.model).filter(Boolean))];

    res.json({
      hasData: true,
      models: {
        billing: billingModels,
        actual: actualModels
      },
      counts: {
        billing: filteredB.length,
        actual: unmatchedA.length
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 시리얼없음 매칭 API
// ============================================================
app.post('/api/match-serialless', async (req, res) => {
  const { criteria, filters, key1, key2, key3, refDate } = req.body;
  const config = readConfig();
  
  const f1Path = fs.existsSync(config.file1Path) ? config.file1Path : FILE1_PATH;
  const f2Path = fs.existsSync(config.file2Path) ? config.file2Path : FILE2_PATH;
  const f3Path = fs.existsSync(config.file3Path) ? config.file3Path : FILE3_PATH;

  if (!fs.existsSync(f1Path) || !fs.existsSync(f2Path)) {
    return res.status(400).json({ error: '청구자료와 실사결과 파일이 모두 필요합니다.' });
  }

  try {
    const wb1 = XLSX.readFile(f1Path);
    const rows1 = XLSX.utils.sheet_to_json(wb1.Sheets[wb1.SheetNames[0]], { defval: "" });
    const wb2 = XLSX.readFile(f2Path);
    const rows2 = XLSX.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]], { defval: "" });
    
    let rows3 = [];
    if (fs.existsSync(f3Path)) {
      const wb3 = XLSX.readFile(f3Path);
      const sheetName3 = wb3.SheetNames.includes('렌탈사현황') ? '렌탈사현황' : wb3.SheetNames[0];
      rows3 = XLSX.utils.sheet_to_json(wb3.Sheets[sheetName3], { defval: "" });
    }

    const rawBillingData = rows1.map((row, idx) => ({
      _id: `b_${idx}`, idx: idx + 2,
      name: String(row['이름'] || row['사용자'] || row['성명'] || ""),
      empId: String(row['사번'] || row['사원번호'] || ""),
      dept: String(row['부서'] || row['소속'] || ""),
      workplace: String(row['사업장'] || ""),
      device: String(row['지급기기'] || row['구분'] || row['기기'] || ""),
      model: String(row['상세모델'] || row['모델명'] || row['모델'] || ""),
      serial: String(row[key1 || config.key1] || "").trim(),
      cleanSerial: cleanSerial(row[key1 || config.key1]),
      originalRow: row
    }));

    const parsedRef = parseExcelDate(refDate);
    const excludedSerials = new Set();
    let billingData = rawBillingData;

    if (parsedRef) {
      billingData = rawBillingData.filter(b => {
        const cDate = parseExcelDate(b.originalRow['렌탈 시작일자'] || b.originalRow['렌탈시작일'] || b.originalRow['계약시작일'] || b.originalRow['계약일'] || b.originalRow['시작일']);
        const isIncluded = cDate !== null && cDate <= parsedRef;
        if (!isIncluded && b.cleanSerial) {
          excludedSerials.add(b.cleanSerial);
        }
        return isIncluded;
      });
    }

    const actualData = rows2.map((row, idx) => ({
      _id: `a_${idx}`, idx: idx + 2,
      name: String(row['이름'] || row['사용자'] || row['성명'] || ""),
      empId: String(row['사번'] || row['사원번호'] || ""),
      dept: String(row['부서'] || row['소속'] || ""),
      workplace: String(row['사업장'] || ""),
      device: String(row['구분'] || row['지급기기'] || row['기기'] || ""),
      model: String(row['상세모델'] || row['모델명'] || row['모델'] || ""),
      serial: String(row[key2 || config.key2] || "").trim(),
      cleanSerial: cleanSerial(row[key2 || config.key2]),
      originalRow: row
    })).filter(row => {
      // 실사 데이터에서 "자산소유" 컬럼의 값이 "한화" 인것을 제외
      const ownership = row.originalRow['자산소유'] ? String(row.originalRow['자산소유']).trim() : '';
      if (ownership === '한화') return false;

      // 검색기준일 필터로 제외된 청구 시리얼과 일치하는 실사 자산도 제외
      if (row.cleanSerial && excludedSerials.has(row.cleanSerial)) {
        return false;
      }
      return true;
    });

    const rentalData = rows3.map((row, idx) => ({
      _id: `r_${idx}`, idx: idx + 2,
      name: String(row['이름'] || row['사용자'] || row['성명'] || ""),
      empId: String(row['사번'] || row['사원번호'] || ""),
      dept: String(row['부서'] || row['소속'] || ""),
      workplace: String(row['사업장'] || ""),
      serial: String(row[key3 || config.key3] || "").trim(),
      cleanSerial: cleanSerial(row[key3 || config.key3]),
      originalRow: row
    })).filter(row => {
      // 검색기준일 필터로 제외된 청구 시리얼과 일치하는 렌탈 자산 제외
      if (row.cleanSerial && excludedSerials.has(row.cleanSerial)) {
        return false;
      }
      return true;
    });

    // 1. 제조번호가 동일한 완전일치 데이터 제외 (사용자 요청: 제조번호 일치 건은 화면 표시 제외)
    const exactBillingIds = new Set();
    const exactActualIds = new Set();
    
    // 빌링 제조번호와 일치하는 실사 데이터 맵핑
    const actualMap = new Map();
    actualData.forEach(row => {
      if (row.cleanSerial) {
        if (!actualMap.has(row.cleanSerial)) actualMap.set(row.cleanSerial, []);
        actualMap.get(row.cleanSerial).push(row);
      }
    });

    billingData.forEach(bRow => {
      if (bRow.cleanSerial && actualMap.has(bRow.cleanSerial)) {
        const matched = actualMap.get(bRow.cleanSerial).find(a => !exactActualIds.has(a._id));
        if (matched) {
          exactBillingIds.add(bRow._id);
          exactActualIds.add(matched._id);
        }
      }
    });

    const unmatchedB = billingData.filter(b => !exactBillingIds.has(b._id));
    const unmatchedA = actualData.filter(a => !exactActualIds.has(a._id));

    // 렌탈현황 데이터 맵 (빠른 검색용)
    const rentalLookup = new Map();
    rentalData.forEach(r => {
      if (r.cleanSerial) {
        rentalLookup.set(r.cleanSerial, r);
      }
    });

    // 렌탈현황 유사 비교 헬퍼
    function checkRentalStatus(serialStr) {
      if (!serialStr) return { status: '없음', detail: '' };
      const cSer = cleanSerial(serialStr);
      if (!cSer) return { status: '없음', detail: '' };
      
      if (rentalLookup.has(cSer)) {
        const match = rentalLookup.get(cSer);
        const assetNo = match.originalRow['관리번호'] || match.originalRow['자산번호'] || '';
        return { status: '일치', detail: `렌탈 일치${assetNo ? `(${assetNo})` : ''}` };
      }

      // 유사 매칭 확인 (거리 1)
      for (const [rClean, rRow] of rentalLookup.entries()) {
        if (Math.abs(rClean.length - cSer.length) <= 1) {
          if (getLevenshteinDistance(cSer, rClean) <= 1) {
            const assetNo = rRow.originalRow['관리번호'] || rRow.originalRow['자산번호'] || '';
            return { status: '유사', detail: `렌탈 유사: ${rRow.serial}${assetNo ? `(${assetNo})` : ''}` };
          }
        }
      }

      return { status: '미검출', detail: '렌탈 미일치' };
    }

    // 필터 전 전체 모델명 추출 (드롭다운을 위해)
    const billingModels = [...new Set(unmatchedB.map(b => b.model).filter(Boolean))];
    const actualModels = [...new Set(unmatchedA.map(a => a.model).filter(Boolean))];

    // 필터 적용 (체크박스 리스트 OR 텍스트박스 키워드 필터링)
    let filteredB = unmatchedB;
    const bChecked = (filters && filters.billingModels) || [];
    const bKeyword = (filters && filters.billingModelKeyword) ? filters.billingModelKeyword.trim().toUpperCase() : "";
    if (bChecked.length > 0 || bKeyword !== "") {
      filteredB = filteredB.filter(b => {
        const matchesChecked = bChecked.includes(b.model);
        const matchesKeyword = bKeyword !== "" && b.model.toUpperCase().includes(bKeyword);
        return matchesChecked || matchesKeyword;
      });
    }

    if (filters && filters.billingSerial) {
      const search = filters.billingSerial.trim().toUpperCase();
      filteredB = filteredB.filter(b => b.serial.toUpperCase().includes(search));
    }

    let filteredA = unmatchedA;
    const aChecked = (filters && filters.actualModels) || [];
    const aKeyword = (filters && filters.actualModelKeyword) ? filters.actualModelKeyword.trim().toUpperCase() : "";
    if (aChecked.length > 0 || aKeyword !== "") {
      filteredA = filteredA.filter(a => {
        const matchesChecked = aChecked.includes(a.model);
        const matchesKeyword = aKeyword !== "" && a.model.toUpperCase().includes(aKeyword);
        return matchesChecked || matchesKeyword;
      });
    }

    // 2. 조건 필터링 기반 1:1 매칭 알고리즘
    const matchedPairs = [];
    const matchedActualIds = new Set();

    const hasAnyCriteria = !!(criteria && (criteria.empid || criteria.name || criteria.dept || criteria.workplace));

    if (hasAnyCriteria) {
      filteredB.forEach(bRow => {
        let bestCandidate = null;
        let highestScore = -1;

        filteredA.forEach(aRow => {
          if (matchedActualIds.has(aRow._id)) return;

          const empIdMatch = bRow.empId && aRow.empId && compareEmpId(bRow.empId, aRow.empId);
          const nameMatch = cleanName(bRow.name) === cleanName(aRow.name) && cleanName(bRow.name).length >= 2;
          const deptMatch = bRow.dept && aRow.dept && bRow.dept.trim() === aRow.dept.trim();
          const workplaceMatch = bRow.workplace && aRow.workplace && bRow.workplace.trim() === aRow.workplace.trim();

          // [필수 조건] 체크박스가 true인 기준은 반드시 일치해야 함 (AND 조건)
          let isMatched = true;
          if (criteria.empid && !empIdMatch) isMatched = false;
          if (criteria.name && !nameMatch) isMatched = false;
          if (criteria.dept && !deptMatch) isMatched = false;
          if (criteria.workplace && !workplaceMatch) isMatched = false;

          // 제조번호 유사도 검사 및 3글자 이상 차이 시 제외
          if (bRow.cleanSerial && aRow.cleanSerial) {
            const dist = getLevenshteinDistance(bRow.cleanSerial, aRow.cleanSerial);
            if (dist >= 3) {
              isMatched = false;
            }
          }

          // 필수 조건(AND) 만족 시, 최적의 유사 후보 결정을 위한 스코어 연산 (체크 여부 무관)
          if (isMatched) {
            let score = 0;
            if (empIdMatch) score += 100;
            if (nameMatch) score += 50;
            if (deptMatch) score += 20;
            if (workplaceMatch) score += 10;

            if (score > highestScore) {
              highestScore = score;
              bestCandidate = aRow;
            }
          }
        });

        if (bestCandidate) {
          matchedActualIds.add(bestCandidate._id);
          
          // 각 컬럼별 일치 및 상이 여부 상세 분석
          const empIdMatch = bRow.empId && bestCandidate.empId && compareEmpId(bRow.empId, bestCandidate.empId);
          const nameMatch = cleanName(bRow.name) === cleanName(bestCandidate.name) && cleanName(bRow.name).length >= 2;
          const deptMatch = bRow.dept && bestCandidate.dept && bRow.dept.trim() === bestCandidate.dept.trim();
          const workplaceMatch = bRow.workplace && bestCandidate.workplace && bRow.workplace.trim() === bestCandidate.workplace.trim();

          const matches = [];
          const diffs = [];

          if (empIdMatch) matches.push("사번"); else if (bRow.empId || bestCandidate.empId) diffs.push("사번");
          if (nameMatch) matches.push("이름"); else if (bRow.name || bestCandidate.name) diffs.push("이름");
          if (deptMatch) matches.push("부서"); else if (bRow.dept || bestCandidate.dept) diffs.push("부서");
          if (workplaceMatch) matches.push("사업장"); else if (bRow.workplace || bestCandidate.workplace) diffs.push("사업장");

          const confidence = (empIdMatch || nameMatch) ? 'High' : 'Low';
          
          let confidenceReason = matches.length > 0 ? `${matches.join('/')} 일치` : "정보 불일치";
          if (diffs.length > 0) {
            confidenceReason += ` (${diffs.join('/')} 상이)`;
          }

          // 렌탈 현황 참조 검사
          const bRental = checkRentalStatus(bRow.serial);
          const aRental = checkRentalStatus(bestCandidate.serial);

          matchedPairs.push({
            billing: bRow,
            actual: bestCandidate,
            score: highestScore,
            confidence,
            reason: confidenceReason,
            billingRental: bRental,
            actualRental: aRental
          });
        }
      });
    }

    // 매칭에서 선택되지 않은 잔여 데이터
    const finalUnmatchedB = filteredB.filter(b => !matchedPairs.some(p => p.billing._id === b._id));
    const finalUnmatchedA = filteredA.filter(a => !matchedActualIds.has(a._id));

    res.json({
      matchedPairs,
      unmatchedBilling: finalUnmatchedB,
      unmatchedActual: finalUnmatchedA,
      models: {
        billing: billingModels,
        actual: actualModels
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '시리얼없음 매칭 처리 중 오류: ' + error.message });
  }
});

// ============================================================
// 시리얼없음 개별 행 재매칭 API
// ============================================================
app.post('/api/rematch-row', async (req, res) => {
  const { billingRow, criteria, filters, alreadyMatchedActualIds, excludedActualIds, key1, key2, key3, refDate } = req.body;
  const config = readConfig();
  const f1Path = fs.existsSync(config.file1Path) ? config.file1Path : FILE1_PATH;
  const f2Path = fs.existsSync(config.file2Path) ? config.file2Path : FILE2_PATH;
  const f3Path = fs.existsSync(config.file3Path) ? config.file3Path : FILE3_PATH;

  if (!fs.existsSync(f2Path)) {
    return res.status(400).json({ error: '실사 데이터 파일이 존재하지 않습니다.' });
  }

  try {
    const XLSX = require('xlsx');
    
    // 1. 청구 데이터 로드하여 제외 시리얼 집계
    const excludedSerials = new Set();
    if (fs.existsSync(f1Path)) {
      const wb1 = XLSX.readFile(f1Path);
      const rows1 = XLSX.utils.sheet_to_json(wb1.Sheets[wb1.SheetNames[0]], { defval: "" });
      const k1 = key1 || config.key1;
      const rawBillingData = rows1.map((row, idx) => ({
        cleanSerial: cleanSerial(row[k1]),
        originalRow: row
      }));
      const parsedRef = parseExcelDate(refDate);
      if (parsedRef) {
        rawBillingData.forEach(b => {
          const cDate = parseExcelDate(b.originalRow['렌탈 시작일자'] || b.originalRow['렌탈시작일'] || b.originalRow['계약시작일'] || b.originalRow['계약일'] || b.originalRow['시작일']);
          const isIncluded = cDate !== null && cDate <= parsedRef;
          if (!isIncluded && b.cleanSerial) {
            excludedSerials.add(b.cleanSerial);
          }
        });
      }
    }

    const wb2 = XLSX.readFile(f2Path);
    const rows2 = XLSX.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]], { defval: "" });
    const k2 = key2 || config.key2;

    const actualData = rows2.map((row, idx) => ({
      _id: `a_${idx}`,
      model: String(row['상세모델'] || row['모델명'] || row['모델'] || ""),
      serial: String(row[k2] || "").trim(),
      cleanSerial: cleanSerial(row[k2]),
      empId: String(row['사번'] || row['사용자사번'] || ""),
      name: String(row['이름'] || row['사용자'] || row['사용자명'] || ""),
      dept: String(row['부서'] || row['사용부서'] || ""),
      workplace: String(row['사업장'] || row['근무지'] || ""),
      originalRow: row
    })).filter(row => {
      // 실사 데이터에서 "자산소유" 컬럼의 값이 "한화" 인것을 제외
      const ownership = row.originalRow['자산소유'] ? String(row.originalRow['자산소유']).trim() : '';
      if (ownership === '한화') return false;

      // 검색기준일 필터로 제외된 청구 시리얼과 일치하는 실사 자산 제외
      if (row.cleanSerial && excludedSerials.has(row.cleanSerial)) {
        return false;
      }
      return true;
    });

    // 렌탈사 데이터 로드 및 lookup 작성
    let rows3 = [];
    if (fs.existsSync(f3Path)) {
      const wb3 = XLSX.readFile(f3Path);
      const sheetName3 = wb3.SheetNames.includes('렌탈사현황') ? '렌탈사현황' : wb3.SheetNames[0];
      rows3 = XLSX.utils.sheet_to_json(wb3.Sheets[sheetName3], { defval: "" });
    }

    const rentalData = rows3.map((row, idx) => ({
      _id: `r_${idx}`, idx: idx + 2,
      name: String(row['이름'] || row['사용자'] || row['성명'] || ""),
      empId: String(row['사번'] || row['사원번호'] || ""),
      dept: String(row['부서'] || row['소속'] || ""),
      workplace: String(row['사업장'] || ""),
      serial: String(row[key3 || config.key3] || "").trim(),
      cleanSerial: cleanSerial(row[key3 || config.key3]),
      originalRow: row
    })).filter(row => {
      // 검색기준일 필터로 제외된 청구 시리얼과 일치하는 렌탈 자산 제외
      if (row.cleanSerial && excludedSerials.has(row.cleanSerial)) {
        return false;
      }
      return true;
    });

    const rentalLookup = new Map();
    rentalData.forEach(r => {
      if (r.cleanSerial) {
        rentalLookup.set(r.cleanSerial, r);
      }
    });

    const rentalLookupKeys = Array.from(rentalLookup.keys());

    function checkRentalStatus(serialStr) {
      if (!serialStr) return { status: '없음', detail: '' };
      const cSer = cleanSerial(serialStr);
      if (!cSer) return { status: '없음', detail: '' };
      
      if (rentalLookup.has(cSer)) {
        const match = rentalLookup.get(cSer);
        const assetNo = match.originalRow['관리번호'] || match.originalRow['자산번호'] || '';
        return { status: '일치', detail: `렌탈 일치${assetNo ? `(${assetNo})` : ''}` };
      }

      for (let i = 0; i < rentalLookupKeys.length; i++) {
        const rClean = rentalLookupKeys[i];
        if (Math.abs(rClean.length - cSer.length) <= 1) {
          if (getLevenshteinDistance(cSer, rClean) <= 1) {
            const rRow = rentalLookup.get(rClean);
            const assetNo = rRow.originalRow['관리번호'] || rRow.originalRow['자산번호'] || '';
            return { status: '유사', detail: `렌탈 유사: ${rRow.serial}${assetNo ? `(${assetNo})` : ''}` };
          }
        }
      }

      return { status: '미검출', detail: '렌탈 미일치' };
    }

    // 1. 이미 매칭되었거나 사용자가 거절한(더블클릭한) 실사 ID 제외
    const ignoreActualIds = new Set([
      ...(Array.isArray(alreadyMatchedActualIds) ? alreadyMatchedActualIds : []),
      ...(Array.isArray(excludedActualIds) ? excludedActualIds : [])
    ]);

    const candidates = actualData.filter(a => !ignoreActualIds.has(a._id));

    // 2. 모델 필터링 적용 (실사 키워드 및 체크박스 필터)
    let filteredA = candidates;
    const aChecked = (filters && filters.actualModels) || [];
    const aKeyword = (filters && filters.actualModelKeyword) ? filters.actualModelKeyword.trim().toUpperCase() : "";
    if (aChecked.length > 0 || aKeyword !== "") {
      filteredA = filteredA.filter(a => {
        const matchesChecked = aChecked.includes(a.model);
        const matchesKeyword = aKeyword !== "" && a.model.toUpperCase().includes(aKeyword);
        return matchesChecked || matchesKeyword;
      });
    }

    // 3. 단일 청구 데이터에 대해 새로운 매칭 후보 탐색 (AND 조건 적용)
    let bestCandidate = null;
    let highestScore = -1;

    filteredA.forEach(aRow => {
      const empIdMatch = billingRow.empId && aRow.empId && compareEmpId(billingRow.empId, aRow.empId);
      const nameMatch = cleanName(billingRow.name) === cleanName(aRow.name) && cleanName(billingRow.name).length >= 2;
      const deptMatch = billingRow.dept && aRow.dept && billingRow.dept.trim() === aRow.dept.trim();
      const workplaceMatch = billingRow.workplace && aRow.workplace && billingRow.workplace.trim() === aRow.workplace.trim();

      let isMatched = true;
      if (criteria.empid && !empIdMatch) isMatched = false;
      if (criteria.name && !nameMatch) isMatched = false;
      if (criteria.dept && !deptMatch) isMatched = false;
      if (criteria.workplace && !workplaceMatch) isMatched = false;

      // 제조번호 유사도 검사 및 3글자 이상 차이 시 제외
      if (billingRow.cleanSerial && aRow.cleanSerial) {
        const dist = getLevenshteinDistance(billingRow.cleanSerial, aRow.cleanSerial);
        if (dist >= 3) {
          isMatched = false;
        }
      }

      if (isMatched) {
        let score = 0;
        if (empIdMatch) score += 100;
        if (nameMatch) score += 50;
        if (deptMatch) score += 20;
        if (workplaceMatch) score += 10;

        if (score > highestScore) {
          highestScore = score;
          bestCandidate = aRow;
        }
      }
    });

    if (bestCandidate) {
      // 신뢰도 및 상세 내용 계산
      const empIdMatch = billingRow.empId && bestCandidate.empId && compareEmpId(billingRow.empId, bestCandidate.empId);
      const nameMatch = cleanName(billingRow.name) === cleanName(bestCandidate.name) && cleanName(billingRow.name).length >= 2;
      const deptMatch = billingRow.dept && bestCandidate.dept && billingRow.dept.trim() === bestCandidate.dept.trim();
      const workplaceMatch = billingRow.workplace && bestCandidate.workplace && billingRow.workplace.trim() === bestCandidate.workplace.trim();

      const matches = [];
      const diffs = [];
      if (empIdMatch) matches.push("사번"); else if (billingRow.empId || bestCandidate.empId) diffs.push("사번");
      if (nameMatch) matches.push("이름"); else if (billingRow.name || bestCandidate.name) diffs.push("이름");
      if (deptMatch) matches.push("부서"); else if (billingRow.dept || bestCandidate.dept) diffs.push("부서");
      if (workplaceMatch) matches.push("사업장"); else if (billingRow.workplace || bestCandidate.workplace) diffs.push("사업장");

      const confidence = (empIdMatch || nameMatch) ? 'High' : 'Low';
      let detail = matches.length > 0 ? `${matches.join('/')} 일치` : "정보 불일치";
      if (diffs.length > 0) detail += ` (${diffs.join('/')} 상이)`;

      // 렌탈 현황 참조 검사
      const bRental = checkRentalStatus(billingRow.serial);
      const aRental = checkRentalStatus(bestCandidate.serial);

      res.json({
        success: true,
        candidate: {
          _id: bestCandidate._id,
          model: bestCandidate.model,
          serial: bestCandidate.serial,
          empId: bestCandidate.empId,
          name: bestCandidate.name,
          dept: bestCandidate.dept,
          workplace: bestCandidate.workplace
        },
        score: highestScore,
        confidence,
        reason: detail,
        billingRental: bRental,
        actualRental: aRental
      });
    } else {
      res.json({ success: true, candidate: null });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// 시리얼없음 매칭 결과 반영 및 저장 API
// ============================================================
app.post('/api/save-serialless', async (req, res) => {
  const { updates, key1 } = req.body;
  const config = readConfig();

  const f1Path = fs.existsSync(config.file1Path) ? config.file1Path : FILE1_PATH;

  if (!fs.existsSync(f1Path)) {
    return res.status(400).json({ error: '청구자료 파일이 존재하지 않습니다.' });
  }
  if (!updates || !Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ error: '업데이트할 매칭 데이터가 지정되지 않았습니다.' });
  }

  try {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(f1Path);
    const sheet = workbook.worksheets[0];

    const targetKey = key1 || config.key1;
    if (!targetKey) {
      return res.status(400).json({ error: '청구자료 비교 기준 컬럼(제조번호)이 설정되지 않았습니다.' });
    }

    // 1. 헤더 행(1번 행)에서 '제조번호'와 '보정이력' 컬럼 위치 파악
    const headerRow = sheet.getRow(1);
    let serialColIdx = -1;
    let historyColIdx = -1;
    let maxColNum = 1;

    headerRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      const cellVal = cell.value ? String(cell.value).trim() : '';
      if (cellVal === targetKey) {
        serialColIdx = colNum;
      }
      if (cellVal === '보정이력') {
        historyColIdx = colNum;
      }
      if (colNum > maxColNum) {
        maxColNum = colNum;
      }
    });

    if (serialColIdx === -1) {
      return res.status(400).json({ error: `청구자료에서 '${targetKey}' 컬럼을 찾을 수 없습니다.` });
    }

    // '보정이력' 컬럼이 존재하지 않으면 맨 마지막 열 오른쪽에 새로 생성
    if (historyColIdx === -1) {
      historyColIdx = maxColNum + 1;
      const historyHeaderCell = headerRow.getCell(historyColIdx);
      historyHeaderCell.value = '보정이력';
      historyHeaderCell.font = { name: '맑은 고딕', size: 11, bold: true };
      historyHeaderCell.alignment = { horizontal: 'center', vertical: 'middle' };
    }

    // 2. 각 매칭 자산 보정값 및 수정이력(타임스탬프) 반영
    const nowStr = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

    updates.forEach(upd => {
      const row = sheet.getRow(upd.billingIdx);
      
      // 제조번호 셀 업데이트
      const serialCell = row.getCell(serialColIdx);
      serialCell.value = String(upd.actualSerial);

      // 보정이력 셀 업데이트 (누적 기록 지원)
      const historyCell = row.getCell(historyColIdx);
      const oldVal = historyCell.value ? String(historyCell.value).trim() : '';
      const newLog = `[${nowStr}] 보정: 실사 제조번호 [${upd.actualSerial}] 반영`;
      historyCell.value = oldVal ? `${oldVal}\n${newLog}` : newLog;
      historyCell.alignment = { wrapText: true, vertical: 'middle' };
    });

    // 3. 서식을 그대로 보존하여 파일 저장
    await workbook.xlsx.writeFile(f1Path);
    console.log(`Updated ${updates.length} rows using ExcelJS in File 1: ${f1Path}`);

    res.json({ message: `성공적으로 ${updates.length}개의 자산 제조번호와 보정이력을 청구 데이터에 반영했습니다.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '청구 파일 업데이트 저장 중 오류: ' + error.message });
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
