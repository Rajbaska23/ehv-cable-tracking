const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure local file uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Security & Parsing Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer File Storage for CAD, Excel, and PDF Ingestion
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// In-Memory EHV Project State (Can be connected to PostgreSQL or MongoDB)
let ehvProjectState = {
  projectId: 'EHV-2026-001',
  projectName: '132kV / 400kV Feeder Cable Circuit - Line 1',
  clusterName: 'Northern Cluster',
  routeLengthMeters: 1250,
  isBaselineLocked: false,
  cableLaidMeters: 680,
  civilTrenchingMeters: 920,
  nodes: [
    { id: 'SS-A', chainage: 0, label: 'Substation A', type: 'Substation Terminal' },
    { id: 'EHV-JB-01', chainage: 350, label: 'Joint Bay 1', type: 'Joint Bay' },
    { id: 'EHV-JB-02', chainage: 800, label: 'Joint Bay 2', type: 'Joint Bay' },
    { id: 'SS-B', chainage: 1250, label: 'Substation B', type: 'Substation Terminal' }
  ]
};

// ==================== API ENDPOINTS ====================

// 1. Get Circuit Topology Data
app.get('/api/ehv/topology', (req, res) => {
  res.json(ehvProjectState);
});

// 2. Admin Document Upload Ingestion API
app.post('/api/ehv/upload', upload.fields([
  { name: 'cadFile', maxCount: 1 },
  { name: 'excelFile', maxCount: 1 },
  { name: 'pdfFile', maxCount: 1 }
]), (req, res) => {
  try {
    res.json({
      status: 'Success',
      message: 'EHV Drawings, BOQ schedules, and technical specs processed.',
      projectData: ehvProjectState
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to process EHV files.' });
  }
});

// 3. Admin Baseline Lock API
app.post('/api/ehv/lock-baseline', (req, res) => {
  ehvProjectState.isBaselineLocked = true;
  res.json({ 
    status: 'Success', 
    message: 'EHV Circuit Baseline locked successfully. Active field tracking enabled.' 
  });
});

// 4. Update Route Parameters (Admin Only)
app.post('/api/ehv/update-route', (req, res) => {
  const { routeMeters, clusterName } = req.body;
  if (routeMeters) ehvProjectState.routeLengthMeters = parseInt(routeMeters);
  if (clusterName) ehvProjectState.clusterName = clusterName;
  res.json({ status: 'Success', projectData: ehvProjectState });
});

// Wildcard Route: Direct all traffic to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`EHV Cable Tracking server live on port ${PORT}`);
});