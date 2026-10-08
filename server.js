const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const XLSX = require('xlsx');

const app = express();

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure upload directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

// Multer Instance with 25MB Limit and File Filtering
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

// Multer Error Handling Wrapper
const handleUpload = (multerMiddleware) => (req, res, next) => {
  multerMiddleware(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
};

// Serve Static Frontend Assets
app.use(express.static(path.join(__dirname, 'public')));

// Admin Credentials
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

// In-Memory Portal State
let projectState = {
  totalRouteLength: "3000",
  clusterName: "DIP1",
  voltageRating: "132kV - SINGLE CORE 630 SQ MM",
  jointBays: 2,
  systemPhase: "PHASE 2: ACTIVE TRACKING",
  cadFile: null,
  excelFile: null,
  pdfFile: null,
  nodes: [
    { x: 0, y: 0 },
    { x: 1500, y: 0 },
    { x: 3000, y: 0 }
  ],
  boqItems: []
};

// DXF Polyline Vertex Parser
function parseDxfVertices(dxfContent) {
  const lines = dxfContent.split(/\r?\n/).map(l => l.trim());
  const vertices = [];
  let currentX = null;

  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i] === '10' && currentX === null) {
      currentX = parseFloat(lines[i + 1]);
    } else if (lines[i] === '20' && currentX !== null) {
      const currentY = parseFloat(lines[i + 1]);
      if (!isNaN(currentX) && !isNaN(currentY)) {
        vertices.push({ x: currentX, y: currentY });
      }
      currentX = null;
    }
  }
  return vertices;
}

// Login Endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    return res.json({
      success: true,
      message: "Authentication successful.",
      token: "ehv-session-token-" + Date.now()
    });
  }
  return res.status(401).json({
    success: false,
    message: "Invalid administrator credentials."
  });
});

// GET Parameters Endpoint
app.get('/api/parameters', (req, res) => {
  res.json({ success: true, data: projectState });
});

// POST Save Parameters Endpoint
app.post('/api/save-parameters', (req, res) => {
  const { totalRouteLength, clusterName, voltageRating } = req.body;
  if (totalRouteLength !== undefined) projectState.totalRouteLength = totalRouteLength;
  if (clusterName !== undefined) projectState.clusterName = clusterName;
  if (voltageRating !== undefined) projectState.voltageRating = voltageRating;

  res.json({
    success: true,
    message: "Circuit parameters updated successfully.",
    data: projectState
  });
});

// POST Upload CAD Endpoint
app.post('/api/upload-cad', handleUpload(upload.single('cadFile')), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No CAD file uploaded." });
  }

  try {
    const content = fs.readFileSync(req.file.path, 'utf8');
    const vertices = parseDxfVertices(content);

    let estimatedLength = 3000;
    let detectedJointBays = 2;

    const polylineMatches = (content.match(/LWPOLYLINE|POLYLINE/g) || []).length;
    if (polylineMatches > 0) {
      estimatedLength = polylineMatches * 250;
      detectedJointBays = Math.max(1, Math.floor(estimatedLength / 600));
    }

    const nodes = vertices.length > 0 ? vertices : Array.from({ length: detectedJointBays + 1 }, (_, i) => ({
      x: i * (estimatedLength / detectedJointBays),
      y: 0
    }));

    projectState.cadFile = req.file.originalname;
    projectState.totalRouteLength = String(estimatedLength);
    projectState.jointBays = detectedJointBays;
    projectState.nodes = nodes;

    res.json({
      success: true,
      message: "[ADMIN ACTION] CAD Route Drawing uploaded and parsed successfully.",
      routeLength: projectState.totalRouteLength,
      jointBays: projectState.jointBays,
      nodes: projectState.nodes
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error processing CAD file: " + err.message });
  }
});

// POST Upload Excel Endpoint
app.post('/api/upload-excel', handleUpload(upload.single('excelFile')), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No Excel BOQ file uploaded." });
  }

  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    projectState.excelFile = req.file.originalname;
    projectState.boqItems = jsonData;

    res.json({
      success: true,
      message: "[ADMIN ACTION] Excel BOQ uploaded and parsed successfully.",
      file: req.file.originalname,
      rowCount: jsonData.length
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error parsing Excel file: " + err.message });
  }
});

// POST Upload PDF Endpoint
app.post('/api/upload-pdf', handleUpload(upload.single('pdfFile')), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No PDF file uploaded." });
  }

  projectState.pdfFile = req.file.originalname;
  res.json({
    success: true,
    message: "[ADMIN ACTION] EHV PDF Specs linked successfully.",
    file: req.file.originalname
  });
});

// Single Page Catch-all Route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Dynamic Port for Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`EHV Cable Tracking Server running on port ${PORT}`);
});
