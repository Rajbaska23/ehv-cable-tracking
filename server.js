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
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.dxf', '.xlsx', '.xls', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: .dxf, .xlsx, .xls, .pdf'));
    }
  }
});

const handleUpload = (multerMiddleware) => (req, res, next) => {
  multerMiddleware(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
};

app.use(express.static(path.join(__dirname, 'public')));

// Database state simulation
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
    boq: [],
    materials: [],
    hseObs: [],
    ncrList: []
  }
];

// Login endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  if (user) {
    return res.json({
      success: true,
      message: 'Authentication successful',
      token: 'token-' + Date.now(),
      user: { username: user.username, role: user.role, name: user.name }
    });
  }
  return res.status(401).json({ success: false, message: 'Invalid username or password' });
});

// Admin: Create New User
app.post('/api/admin/create-user', (req, res) => {
  const { username, password, role, name } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ success: false, message: 'Missing user fields' });
  }
  users.push({ username, password, role, name: name || username });
  res.json({ success: true, message: `User ${username} created with role ${role}` });
});

// Admin: Create New Project
app.post('/api/admin/create-project', (req, res) => {
  const { name, code, pmName } = req.body;
  const newPrj = {
    id: 'prj-' + (projects.length + 1),
    code: code || 'EHV-NEW',
    name: name || 'New EHV Circuit Project',
    pmName: pmName || 'Assigned PM',
    startDate: '2026-10-01',
    targetFinish: '2027-06-30',
    plannedPct: 0,
    actualPct: 0,
    variancePct: 0,
    targetEndDate: '2027-06-30',
    forecastEndDate: '2027-06-30',
    boq: [],
    materials: [],
    hseObs: [],
    ncrList: []
  };
  projects.push(newPrj);
  res.json({ success: true, message: 'New project created successfully', project: newPrj });
});

// GET All Projects (or for PM)
app.get('/api/projects', (req, res) => {
  res.json({ success: true, projects });
});

// GET Single Project Details
app.get('/api/projects/:id', (req, res) => {
  const prj = projects.find(p => p.id === req.params.id) || projects[0];
  res.json({ success: true, project: prj });
});

// Site Progress Update (Civil, Electrical, QAQC)
app.post('/api/progress/update', (req, res) => {
  const { projectId, activity, quantity } = req.body;
  const prj = projects.find(p => p.id === projectId) || projects[0];
  
  const boqItem = prj.boq.find(b => b.item.toLowerCase().includes((activity || '').toLowerCase()));
  if (boqItem) {
    boqItem.completed = Math.min(boqItem.qty, boqItem.completed + parseFloat(quantity || 0));
  } else {
    prj.boq.push({ item: activity || 'Site Activity', qty: 1000, completed: parseFloat(quantity || 0), unit: 'm' });
  }
  
  res.json({ success: true, message: `Progress updated for ${activity}: +${quantity}`, project: prj });
});

// HSE Upload / Observation
app.post('/api/hse/add', (req, res) => {
  const { projectId, desc, type } = req.body;
  const prj = projects.find(p => p.id === projectId) || projects[0];
  prj.hseObs.push({ id: 'HSE-' + (prj.hseObs.length + 1), desc, status: 'Open', date: new Date().toISOString().split('T')[0] });
  if (type === 'NCR') {
    prj.ncrList.push({ id: 'NCR-' + (prj.ncrList.length + 1), desc, status: 'Open', raisedBy: 'HSE' });
  }
  res.json({ success: true, message: 'HSE Entry recorded successfully', project: prj });
});

// QA/QC NCR
app.post('/api/qc/ncr', (req, res) => {
  const { projectId, desc } = req.body;
  const prj = projects.find(p => p.id === projectId) || projects[0];
  prj.ncrList.push({ id: 'NCR-' + (prj.ncrList.length + 1), desc, status: 'Open', raisedBy: 'QAQC' });
  res.json({ success: true, message: 'QC NCR logged successfully', project: prj });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`EHV Multi-Role Portal live on port ${PORT}`));
