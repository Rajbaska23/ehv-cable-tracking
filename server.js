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

// Use upload.any() to accept any file field names without unexpected field errors
const upload = multer({
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 }
});

const handleUpload = (multerMiddleware) => (req, res, next) => {
  multerMiddleware(req, res, (err) => {
    if (err) {
      console.error("Multer Error:", err.message);
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
};

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
  },
  {
    id: 'prj-2',
    code: 'EHV-2026-002',
    name: 'Southern Substation Interconnect',
    pmName: 'Project Manager Lead',
    startDate: '2026-03-01',
    targetFinish: '2026-12-20',
    plannedPct: 40,
    actualPct: 42,
    variancePct: 2,
    targetEndDate: '2026-12-20',
    forecastEndDate: '2026-12-18',
    cadFile: null,
    boqFile: null,
    boq: [],
    materials: [],
    hseObs: [],
    ncrList: []
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

// Flexible project creation handling any uploaded files via upload.any()
app.post('/api/admin/create-project', handleUpload(upload.any()), (req, res) => {
  const { name, code, pmName } = req.body;

  if (!name || !code) {
    return res.status(400).json({ success: false, message: 'Project Name and Code are required.' });
  }

  const uploadedFiles = req.files || [];
  const cadUpload = uploadedFiles.find(f => f.fieldname === 'cadFile');
  const boqUpload = uploadedFiles.find(f => f.fieldname === 'boqFile');

  const newPrj = {
    id: 'prj-' + (projects.length + 1),
    code: code,
    name: name,
    pmName: pmName || 'Assigned PM',
    startDate: new Date().toISOString().split('T')[0],
    targetFinish: '2027-12-31',
    plannedPct: 15,
    actualPct: 10,
    variancePct: -5,
    targetEndDate: '2027-12-31',
    forecastEndDate: '2028-01-15',
    cadFile: cadUpload ? cadUpload.originalname : null,
    boqFile: boqUpload ? boqUpload.originalname : null,
    boq: [
      { item: 'Trenching & Excavation', qty: 2500, completed: 300, unit: 'm' },
      { item: '132kV Cable Pulling', qty: 2500, completed: 200, unit: 'm' },
      { item: 'Joint Bay Assembly', qty: 2, completed: 0, unit: 'bays' }
    ],
    materials: [
      { item: '132kV Cable Drum Set', status: 'Delivered On-Site', qty: '2500 m' }
    ],
    hseObs: [],
    ncrList: []
  };

  projects.push(newPrj);

  res.json({
    success: true,
    message: `[PROJECT CREATED] ${name} (${code}) created successfully with ${uploadedFiles.length} files attached!`,
    project: newPrj,
    projects: projects
  });
});

app.get('/api/projects', (req, res) => {
  res.json({ success: true, projects });
});

app.get('/api/projects/:id', (req, res) => {
  const prj = projects.find(p => p.id === req.params.id) || projects[0];
  res.json({ success: true, project: prj });
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
  
  prj.actualPct = Math.min(100, Math.round(prj.actualPct + 5));
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
