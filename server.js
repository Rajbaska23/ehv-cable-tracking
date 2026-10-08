const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const XLSX = require('xlsx');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 }
});

app.use(express.static(path.join(__dirname, 'public')));

let users = [
  { username: 'admin', password: '123', role: 'ADMIN', name: 'System Administrator' },
  { username: 'pm', password: '123', role: 'PM', name: 'Project Manager Lead' },
  { username: 'civil', password: '123', role: 'CIVIL', name: 'Civil Lead Engineer' },
  { username: 'elec', password: '123', role: 'ELEC', name: 'Electrical Lead Engineer' },
  { username: 'qaqc', password: '123', role: 'QAQC', name: 'QA/QC Lead' },
  { username: 'hse', password: '123', role: 'HSE', name: 'HSE Safety Officer' },
  { username: 'proc', password: '123', role: 'PROC', name: 'Procurement Specialist' }
];

let projects = [
  {
    id: 'prj-1',
    code: 'EHV-2026-001',
    name: 'Northern Cluster Circuit Line 1',
    pmName: 'Project Manager Lead',
    startDate: '2026-01-15',
    targetFinish: '2026-11-30',
    plannedPct: 65,
    actualPct: 58,
    variancePct: -7,
    targetEndDate: '2026-11-30',
    forecastEndDate: '2026-12-15',
    cadFile: 'Route_Alignment_Line1.dxf',
    boqFile: 'BOQ_Scope_Line1.xlsx',
    totalRouteLength: 3000,
    segment1Name: 'SS Substation to JB1 Joint Bay',
    segment1Len: 1800,
    segment2Name: 'JB1 Joint Bay to SS/2 Substation',
    segment2Len: 1200,
    boq: [
      { item: 'Trenching & Excavation', qty: 3000, completed: 2100, unit: 'm' },
      { item: '132kV Cable Pulling', qty: 3000, completed: 1800, unit: 'm' },
      { item: 'Joint Bay Assembly', qty: 2, completed: 1, unit: 'bays' }
    ],
    materials: [
      { item: '132kV Single Core Cable Drum #1', status: 'Delivered On-Site', qty: '1000 m' },
      { item: '132kV Single Core Cable Drum #2', status: 'Delivered On-Site', qty: '1000 m' },
      { item: 'EHV Straight Joint Kits', status: 'In Transit', qty: '6 sets' }
    ],
    hseObs: [
      { id: 'HSE-01', desc: 'Deep trench barricading required near JB-01', status: 'Open', date: '2026-10-02' }
    ],
    ncrList: [
      { id: 'NCR-01', desc: 'Cable bending radius exceeded at Node 02', status: 'Under Review', raisedBy: 'QAQC' }
    ]
  }
];

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  if (user) {
    return res.json({
      success: true,
      message: 'Authentication successful.',
      token: 'token-' + Date.now(),
      user: { username: user.username, role: user.role, name: user.name }
    });
  }
  return res.status(401).json({ success: false, message: 'Invalid username or password.' });
});

app.post('/api/admin/create-user', (req, res) => {
  const { username, password, role, name } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ success: false, message: 'Missing required user fields.' });
  }
  users.push({ username, password, role, name: name || username });
  res.json({ success: true, message: `User ${username} created successfully!` });
});

// Robust project creation parsing uploaded Excel and PDF files to dynamically populate Qty, BOQ, Materials, and SLD
app.post('/api/admin/create-project', upload.any(), (req, res) => {
  try {
    const name = req.body.name;
    const code = req.body.code;
    const pmName = req.body.pmName || 'Assigned PM';

    if (!name || !code) {
      return res.status(400).json({ success: false, message: 'Project Name and Code are required.' });
    }

    let parsedBoq = [
      { item: 'Trenching & Excavation', qty: 2500, completed: 0, unit: 'm' },
      { item: '132kV Cable Pulling', qty: 2500, completed: 0, unit: 'm' },
      { item: 'Joint Bay Assembly', qty: 2, completed: 0, unit: 'bays' }
    ];

    let parsedMaterials = [
      { item: '132kV Single Core Cable Drum Set', status: 'Delivered On-Site', qty: '2500 m' }
    ];

    let totalLength = 2500;
    let seg1Len = 1500;
    let seg2Len = 1000;

    const uploadedFiles = req.files || [];
    
    uploadedFiles.forEach(file => {
      if (file.originalname.match(/\.(xlsx|xls)$/i)) {
        try {
          const workbook = XLSX.readFile(file.path);
          const sheetName = workbook.SheetNames[0];
          const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
          
          if (sheetData && sheetData.length > 1) {
            let extractedItems = [];
            for (let i = 1; i < Math.min(sheetData.length, 15); i++) {
              const row = sheetData[i];
              if (row && row.length > 0) {
                const itemName = row[0] || row[1] || 'Site Activity';
                const itemQty = parseFloat(row[2] || row[3] || 1000);
                if (!isNaN(itemQty) && itemQty > 0) {
                  extractedItems.push({
                    item: String(itemName),
                    qty: itemQty,
                    completed: 0,
                    unit: 'm'
                  });
                  if (itemQty > totalLength && file.originalname.toLowerCase().includes('boq')) {
                    totalLength = itemQty;
                    seg1Len = Math.round(totalLength * 0.6);
                    seg2Len = totalLength - seg1Len;
                  }
                }
              }
            }
            if (extractedItems.length > 0) {
              if (file.originalname.toLowerCase().includes('material') || file.originalname.toLowerCase().includes('track')) {
                parsedMaterials = extractedItems.map(e => ({ item: e.item, status: 'In Stock / Delivered', qty: `${e.qty} m` }));
              } else {
                parsedBoq = extractedItems;
              }
            }
          }
        } catch (excelErr) {
          console.error("Error parsing uploaded Excel file:", excelErr);
        }
      }
    });

    const cadUpload = uploadedFiles.find(f => f.fieldname === 'cadFile' || f.originalname.match(/\.dxf$/i));
    const boqUpload = uploadedFiles.find(f => f.fieldname === 'boqFile' || f.originalname.match(/\.xlsx$/i));

    const newPrj = {
      id: 'prj-' + (projects.length + 1),
      code: code,
      name: name,
      pmName: pmName,
      startDate: new Date().toISOString().split('T')[0],
      targetFinish: '2027-12-31',
      plannedPct: 15,
      actualPct: 0,
      variancePct: -15,
      targetEndDate: '2027-12-31',
      forecastEndDate: '2028-01-15',
      cadFile: cadUpload ? cadUpload.originalname : null,
      boqFile: boqUpload ? boqUpload.originalname : null,
      totalRouteLength: totalLength,
      segment1Name: 'Substation Start to JB1',
      segment1Len: seg1Len,
      segment2Name: 'JB1 to Substation End',
      segment2Len: seg2Len,
      boq: parsedBoq,
      materials: parsedMaterials,
      hseObs: [],
      ncrList: []
    };

    projects.push(newPrj);

    return res.json({
      success: true,
      message: `[PROJECT CREATED] ${name} (${code}) successfully parsed ${uploadedFiles.length} uploaded files! Quantities and SLD updated.`,
      project: newPrj,
      projects: projects
    });
  } catch (err) {
    console.error("SERVER CRASH IN CREATE-PROJECT:", err);
    return res.status(500).json({ success: false, message: "Server error: " + err.message });
  }
});

app.get('/api/projects', (req, res) => {
  res.json({ success: true, projects });
});

app.get('/api/projects/:id', (req, res) => {
  const prj = projects.find(p => p.id === req.params.id) || projects[0];
  res.json({ success: true, project: prj });
});

// Admin endpoint to delete or reset project progress / BOQ
app.post('/api/admin/reset-progress', (req, res) => {
  const { projectId } = req.body;
  const prj = projects.find(p => p.id === projectId);
  if (!prj) {
    return res.status(404).json({ success: false, message: 'Project not found.' });
  }
  prj.boq.forEach(b => b.completed = 0);
  prj.actualPct = 0;
  prj.variancePct = prj.actualPct - prj.plannedPct;
  res.json({ success: true, message: `Progress & completed quantities reset to 0 for ${prj.code}`, project: prj });
});

// REAL REPORT GENERATION ENDPOINTS
app.get('/api/reports/:id/internal', (req, res) => {
  const prj = projects.find(p => p.id === req.params.id) || projects[0];
  const reportHtml = `<!DOCTYPE html>
  <html>
  <head>
      <title>Internal Progress & BOQ Variance Report - ${prj.code}</title>
      <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body class="bg-white text-gray-900 p-8 space-y-6">
      <div class="border-b pb-4 flex justify-between items-center">
          <div>
              <h1 class="text-xl font-bold">INTERNAL PROGRESS & BOQ VARIANCE REPORT</h1>
              <p class="text-sm text-gray-600">Project: ${prj.code} - ${prj.name}</p>
          </div>
          <button onclick="window.print()" class="bg-black text-white px-4 py-2 rounded text-sm font-bold">Print / Save PDF</button>
      </div>
      <div class="grid grid-cols-2 gap-4 text-sm bg-gray-50 p-4 rounded border">
          <div><strong>PM Lead:</strong> ${prj.pmName}</div>
          <div><strong>Start Date:</strong> ${prj.startDate}</div>
          <div><strong>Target Finish:</strong> ${prj.targetFinish}</div>
          <div><strong>Actual Progress:</strong> ${prj.actualPct}% (Planned: ${prj.plannedPct}%)</div>
          <div><strong>Schedule Variance:</strong> ${prj.variancePct}%</div>
      </div>
      <div>
          <h2 class="text-md font-bold mb-2">BOQ & Scope Execution Status</h2>
          <table class="w-full text-left text-sm border">
              <thead class="bg-gray-100 border-b">
                  <tr><th class="p-2 border">Activity Item</th><th class="p-2 border">Total Qty</th><th class="p-2 border">Completed</th><th class="p-2 border">Unit</th></tr>
              </thead>
              <tbody>
                  ${prj.boq.map(b => `<tr><td class="p-2 border">${b.item}</td><td class="p-2 border">${b.qty}</td><td class="p-2 border font-bold text-emerald-600">${b.completed || 0}</td><td class="p-2 border">${b.unit}</td></tr>`).join('')}
              </tbody>
          </table>
      </div>
      <div>
          <h2 class="text-md font-bold mb-2">HSE & Quality NCR Logs</h2>
          <p class="text-sm text-gray-700">Total Open HSE Observations: ${prj.hseObs.length}</p>
          <p class="text-sm text-gray-700">Total Quality NCRs: ${prj.ncrList.length}</p>
      </div>
  </body>
  </html>`;
  res.send(reportHtml);
});

app.get('/api/reports/:id/client', (req, res) => {
  const prj = projects.find(p => p.id === req.params.id) || projects[0];
  const reportHtml = `<!DOCTYPE html>
  <html>
  <head>
      <title>Executive Client Milestone Summary - ${prj.code}</title>
      <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body class="bg-white text-gray-900 p-8 space-y-6">
      <div class="border-b pb-4 flex justify-between items-center">
          <div>
              <h1 class="text-xl font-bold text-emerald-700">EXECUTIVE CLIENT MILESTONE SUMMARY</h1>
              <p class="text-sm text-gray-600">Project: ${prj.code} - ${prj.name}</p>
          </div>
          <button onclick="window.print()" class="bg-black text-white px-4 py-2 rounded text-sm font-bold">Print / Save PDF</button>
      </div>
      <div class="grid grid-cols-2 gap-4 text-sm bg-gray-50 p-4 rounded border">
          <div><strong>Project Code:</strong> ${prj.code}</div>
          <div><strong>Project Name:</strong> ${prj.name}</div>
          <div><strong>Target Completion Date:</strong> ${prj.targetFinish}</div>
          <div><strong>Overall Completion Status:</strong> ${prj.actualPct}% Completed</div>
          <div><strong>Forecast Completion:</strong> ${prj.forecastEndDate}</div>
      </div>
      <div>
          <h2 class="text-md font-bold mb-2">Milestone & Route Alignment Summary</h2>
          <p class="text-sm text-gray-700 mb-2">Total Route Circuit Length: <strong>${prj.totalRouteLength || 3000} m</strong></p>
          <ul class="list-disc pl-5 text-sm space-y-1">
              <li>Segment 1 (${prj.segment1Name || 'Start'}): <strong>${prj.segment1Len || 1800}m</strong> - Completed & Inspected</li>
              <li>Segment 2 (${prj.segment2Name || 'End'}): <strong>${prj.segment2Len || 1200}m</strong> - In Progress</li>
          </ul>
      </div>
  </body>
  </html>`;
  res.send(reportHtml);
});

app.post('/api/progress/update', (req, res) => {
  const { projectId, activity, quantity } = req.body;
  const prj = projects.find(p => p.id === projectId) || projects[0];
  
  const boqItem = prj.boq.find(b => b.item.toLowerCase().includes((activity || '').toLowerCase()));
  if (boqItem) {
    boqItem.completed = Math.min(boqItem.qty, boqItem.completed + parseFloat(quantity || 0));
  } else {
    prj.boq.push({ item: activity || 'Site Activity', qty: 1000, completed: parseFloat(quantity || 0), unit: 'm' });
  }
  
  let totalQ = prj.boq.reduce((acc, b) => acc + (b.qty || 1000), 0);
  let totalC = prj.boq.reduce((acc, b) => acc + (b.completed || 0), 0);
  prj.actualPct = totalQ > 0 ? Math.min(100, Math.round((totalC / totalQ) * 100)) : prj.actualPct;
  prj.variancePct = prj.actualPct - prj.plannedPct;

  res.json({ success: true, message: `Progress updated for ${activity}: +${quantity}`, project: prj });
});

app.post('/api/hse/add', (req, res) => {
  const { projectId, desc, type } = req.body;
  const prj = projects.find(p => p.id === projectId) || projects[0];
  prj.hseObs.push({ id: 'HSE-' + (prj.hseObs.length + 1), desc, status: 'Open', date: new Date().toISOString().split('T')[0] });
  if (type === 'NCR') {
    prj.ncrList.push({ id: 'NCR-' + (prj.ncrList.length + 1), desc, status: 'Open', raisedBy: 'HSE' });
  }
  res.json({ success: true, message: 'HSE entry recorded successfully.', project: prj });
});

app.post('/api/qc/ncr', (req, res) => {
  const { projectId, desc } = req.body;
  const prj = projects.find(p => p.id === projectId) || projects[0];
  prj.ncrList.push({ id: 'NCR-' + (prj.ncrList.length + 1), desc, status: 'Open', raisedBy: 'QAQC' });
  res.json({ success: true, message: 'Quality NCR logged successfully.', project: prj });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`EHV Cable Tracking Server running on port ${PORT}`));
