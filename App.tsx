
import React, { useState, useEffect, useRef } from 'react';
import { Page, User, MedicalReport, AnalysisResult, PatientInfo, SuspectedRegion, Measurement } from './types';
import { authStorage, db, hashPassword } from './storage';
import { analyzeMedicalFile } from './geminiService';
import { 
  ClipboardDocumentCheckIcon, 
  ArrowUpTrayIcon, 
  ClockIcon, 
  ArrowLeftOnRectangleIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  TrashIcon,
  ChevronLeftIcon,
  InformationCircleIcon,
  DocumentMagnifyingGlassIcon,
  XMarkIcon,
  ArrowDownTrayIcon,
  ChartBarIcon,
  ShieldExclamationIcon,
  ShieldCheckIcon,
  BeakerIcon,
  UserIcon
} from '@heroicons/react/24/outline';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>(Page.LOGIN);
  const [currentUser, setCurrentUser] = useState<string | null>(authStorage.getSession());
  const [reports, setReports] = useState<MedicalReport[]>([]);
  const [activeReport, setActiveReport] = useState<MedicalReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auth Handling
  const handleLogin = async (username: string, pass: string) => {
    const users = authStorage.getUsers();
    const hash = await hashPassword(pass);
    const existing = users.find(u => u.username === username);

    if (existing) {
      if (existing.passwordHash === hash) {
        completeLogin(username);
      } else {
        setError('Invalid credentials');
      }
    } else {
      const newUser = { username, passwordHash: hash };
      authStorage.saveUser(newUser);
      completeLogin(username);
    }
  };

  const completeLogin = (username: string) => {
    setCurrentUser(username);
    authStorage.setSession(username);
    setError(null);
    setCurrentPage(Page.DASHBOARD);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    authStorage.setSession(null);
    setCurrentPage(Page.LOGIN);
  };

  useEffect(() => {
    if (currentUser) {
      db.getReports(currentUser).then(setReports);
    }
  }, [currentUser, currentPage]);

  const onFileUpload = async (scanFile: File, patientInfo: PatientInfo, reportFile?: File) => {
    if (!currentUser) return;
    setIsLoading(true);
    setError(null);

    try {
      const readFile = (file: File) => new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });

      const scanBase64 = await readFile(scanFile);
      const reportBase64 = reportFile ? await readFile(reportFile) : undefined;

      const result = await analyzeMedicalFile(scanFile, scanBase64, patientInfo, reportFile, reportBase64);
      
      const newReport: MedicalReport = {
        id: Math.random().toString(36).substr(2, 9),
        userId: currentUser,
        timestamp: Date.now(),
        fileName: scanFile.name,
        fileType: scanFile.type,
        reportFileName: reportFile?.name,
        reportFileType: reportFile?.type,
        patientInfo: patientInfo,
        analysis: result
      };

      await db.saveReport(newReport);
      setActiveReport(newReport);
      setCurrentPage(Page.RESULT);
    } catch (err: any) {
      setError(err.message || "Failed to analyze file");
    } finally {
      setIsLoading(false);
    }
  };

  const deleteReport = async (id: string) => {
    await db.deleteReport(id);
    const updated = reports.filter(r => r.id !== id);
    setReports(updated);
  };

  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} error={error} setError={setError} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-10 no-print">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center space-x-2 cursor-pointer" onClick={() => setCurrentPage(Page.DASHBOARD)}>
              <ClipboardDocumentCheckIcon className="h-8 w-8 text-blue-600" />
              <span className="text-xl font-bold text-slate-900 tracking-tight">Medivise <span className="text-blue-600">AI</span></span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="hidden sm:block text-sm text-slate-500 font-medium">Hello, {currentUser}</span>
              <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-600 transition-colors" title="Logout">
                <ArrowLeftOnRectangleIcon className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-grow max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {currentPage === Page.DASHBOARD && (
          <DashboardView 
            onUpload={() => setCurrentPage(Page.UPLOAD)} 
            onViewHistory={() => setCurrentPage(Page.REPORTS)}
            latestReports={reports.slice(0, 3)}
            onViewReport={(r) => { setActiveReport(r); setCurrentPage(Page.RESULT); }}
          />
        )}
        {currentPage === Page.UPLOAD && (
          <UploadView 
            onBack={() => setCurrentPage(Page.DASHBOARD)} 
            onSubmit={onFileUpload} 
            isLoading={isLoading} 
            error={error}
          />
        )}
        {currentPage === Page.REPORTS && (
          <ReportsListView 
            reports={reports} 
            onBack={() => setCurrentPage(Page.DASHBOARD)} 
            onViewReport={(r) => { setActiveReport(r); setCurrentPage(Page.RESULT); }}
            onDelete={deleteReport}
          />
        )}
        {currentPage === Page.RESULT && activeReport && (
          <ResultView 
            report={activeReport} 
            onBack={() => setCurrentPage(Page.REPORTS)} 
          />
        )}
      </main>

      <footer className="bg-slate-100 border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-500 no-print">
        <p className="max-w-3xl mx-auto">
          <strong>MEDICAL DISCLAIMER:</strong> This tool is for educational purposes only. It uses AI to identify patterns and does not provide professional medical advice, diagnosis, or treatment. Always seek the advice of your physician or other qualified health provider with any questions you may have regarding a medical condition.
        </p>
      </footer>
    </div>
  );
}

const LoginPage: React.FC<{ onLogin: (u: string, p: string) => void; error: string | null; setError: (s: string | null) => void }> = ({ onLogin, error, setError }) => {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-800 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 bg-blue-100 rounded-xl mb-4">
            <ClipboardDocumentCheckIcon className="h-10 w-10 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Medivise AI</h1>
          <p className="text-slate-500 mt-2">Private Medical Analysis Platform</p>
        </div>
        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 text-sm rounded-lg flex items-start space-x-2">
            <XCircleIcon className="h-5 w-5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); onLogin(user, pass); }}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Username</label>
              <input type="text" required value={user} onChange={(e) => setUser(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Enter username" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Password</label>
              <input type="password" required value={pass} onChange={(e) => setPass(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Enter password" />
            </div>
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition-all">Sign In / Register</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const DashboardView: React.FC<{ onUpload: () => void; onViewHistory: () => void; latestReports: MedicalReport[]; onViewReport: (r: MedicalReport) => void }> = ({ onUpload, onViewHistory, latestReports, onViewReport }) => {
  return (
    <div className="space-y-8 animate-fadeIn no-print">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <button onClick={onUpload} className="group relative overflow-hidden bg-white p-8 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-400 transition-all text-left">
          <div className="relative z-10">
            <div className="bg-blue-50 group-hover:bg-blue-600 p-4 rounded-xl inline-block mb-4 transition-colors">
              <ArrowUpTrayIcon className="h-8 w-8 text-blue-600 group-hover:text-white transition-colors" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">New Analysis</h2>
            <p className="text-slate-500">Upload medical files for a high-fidelity AI diagnostic review.</p>
          </div>
        </button>
        <button onClick={onViewHistory} className="group relative overflow-hidden bg-white p-8 rounded-2xl shadow-sm border border-slate-200 hover:border-indigo-400 transition-all text-left">
          <div className="relative z-10">
            <div className="bg-indigo-50 group-hover:bg-indigo-600 p-4 rounded-xl inline-block mb-4 transition-colors">
              <ClockIcon className="h-8 w-8 text-indigo-600 group-hover:text-white transition-colors" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Analysis History</h2>
            <p className="text-slate-500">Securely view your previously generated clinical impressions.</p>
          </div>
        </button>
      </div>
      <div>
        <h3 className="text-xl font-bold text-slate-900 mb-6">Recent Reports</h3>
        {latestReports.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center text-slate-400">No reports yet.</div>
        ) : (
          <div className="grid gap-4">
            {latestReports.map(report => (
              <div key={report.id} className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => onViewReport(report)}>
                <div className="flex items-center space-x-4">
                  <div className="bg-blue-50 p-2.5 rounded-lg"><ClipboardDocumentCheckIcon className="h-6 w-6 text-blue-600" /></div>
                  <div>
                    <h4 className="font-semibold text-slate-900">{report.patientInfo?.name || report.fileName}</h4>
                    <p className="text-xs text-slate-500">{report.patientInfo?.scanType} • {new Date(report.timestamp).toLocaleDateString()}</p>
                  </div>
                </div>
                <ChevronLeftIcon className="h-5 w-5 text-slate-300 rotate-180" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const UploadView: React.FC<{ onBack: () => void; onSubmit: (file: File, info: PatientInfo, report?: File) => void; isLoading: boolean; error: string | null }> = ({ onBack, onSubmit, isLoading, error }) => {
  const [dragActive, setDragActive] = useState<string | null>(null);
  const [selectedScan, setSelectedScan] = useState<File | null>(null);
  const [selectedReport, setSelectedReport] = useState<File | null>(null);
  
  const [patientInfo, setPatientInfo] = useState<PatientInfo>({
    name: "",
    age: "",
    gender: "Male",
    weight: "",
    height: "",
    region: "",
    conditions: "",
    scanType: "X-ray",
    mode: "Detailed",
    optionalNotes: ""
  });

  const handleDrag = (e: React.DragEvent, type: string) => { e.preventDefault(); e.stopPropagation(); setDragActive(e.type === "dragenter" || e.type === "dragover" ? type : null); };
  const handleDrop = (e: React.DragEvent, type: string) => { 
    e.preventDefault(); 
    e.stopPropagation(); 
    setDragActive(null); 
    if (e.dataTransfer.files?.[0]) {
      if (type === 'scan') setSelectedScan(e.dataTransfer.files[0]);
      if (type === 'report') setSelectedReport(e.dataTransfer.files[0]);
    }
  };

  const handleAnalyze = () => {
    if (selectedScan) {
      onSubmit(selectedScan, patientInfo, selectedReport || undefined);
    }
  };

  const updateInfo = (key: keyof PatientInfo, value: any) => {
    setPatientInfo(prev => ({ ...prev, [key]: value }));
  };

  const isButtonDisabled = !selectedScan || !patientInfo.name || (patientInfo.mode === 'Detailed' && !selectedReport);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6">
        <div className="relative">
          <div className="w-24 h-24 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
          <DocumentMagnifyingGlassIcon className="h-10 w-10 text-blue-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900">Analyzing Medical Image...</h2>
          <p className="text-slate-500 mt-2">Gemini 3 Flash is building a structured report.</p>
          <div className="mt-4 flex items-center justify-center space-x-2 text-sm text-blue-600 font-medium">
            <span className="animate-pulse">●</span>
            <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>●</span>
            <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>●</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto animate-fadeIn no-print pb-20">
      <button onClick={onBack} className="flex items-center text-slate-500 hover:text-slate-900 mb-6 transition-colors">
        <ChevronLeftIcon className="h-5 w-5 mr-1" /> Back
      </button>
      
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Diagnostic Scan Analysis</h2>
        <p className="text-slate-500">Provide patient details and upload the scan for clinical review.</p>
      </div>

      {error && (
        <div className="mb-8 p-4 bg-red-50 text-red-700 text-sm rounded-xl flex items-center space-x-3 border border-red-100">
          <ExclamationTriangleIcon className="h-6 w-6 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Patient Details Section */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center space-x-2 border-b border-slate-100 pb-4">
              <UserIcon className="h-5 w-5 text-blue-600" />
              <h3 className="font-bold text-slate-800 uppercase text-xs tracking-widest">Patient Information</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Full Name</label>
                <input 
                  type="text" 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="e.g. John Doe"
                  value={patientInfo.name}
                  onChange={e => updateInfo('name', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Age</label>
                  <input 
                    type="text" 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    placeholder="e.g. 45"
                    value={patientInfo.age}
                    onChange={e => updateInfo('age', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Gender</label>
                  <select 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none"
                    value={patientInfo.gender}
                    onChange={e => updateInfo('gender', e.target.value)}
                  >
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Weight (kg)</label>
                  <input 
                    type="text" 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    placeholder="75"
                    value={patientInfo.weight}
                    onChange={e => updateInfo('weight', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Height (cm)</label>
                  <input 
                    type="text" 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    placeholder="180"
                    value={patientInfo.height}
                    onChange={e => updateInfo('height', e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Scan Region</label>
                <input 
                  type="text" 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="e.g. Chest, Abdomen, Brain"
                  value={patientInfo.region}
                  onChange={e => updateInfo('region', e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Known Conditions (Optional)</label>
              <textarea 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all min-h-[80px]"
                placeholder="List any chronic conditions or allergies..."
                value={patientInfo.conditions}
                onChange={e => updateInfo('conditions', e.target.value)}
              />
            </div>
          </div>

          {/* Scan Settings Section */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center space-x-2 border-b border-slate-100 pb-4">
              <BeakerIcon className="h-5 w-5 text-indigo-600" />
              <h3 className="font-bold text-slate-800 uppercase text-xs tracking-widest">Scan & Analysis Settings</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-4 ml-1">Scan Type</label>
                <div className="flex space-x-2">
                  {['MRI', 'CT', 'X-ray'].map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => updateInfo('scanType', type)}
                      className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${patientInfo.scanType === type ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-indigo-400'}`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-4 ml-1">Analysis Mode</label>
                <div className="flex space-x-2">
                  {['Quick', 'Detailed'].map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => updateInfo('mode', mode)}
                      className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${patientInfo.mode === mode ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-blue-400'}`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Previous Reports / Notes (Optional)</label>
              <textarea 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all min-h-[120px]"
                placeholder="Include previous findings or clinical notes for comparison..."
                value={patientInfo.optionalNotes}
                onChange={e => updateInfo('optionalNotes', e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="space-y-8">
          {/* File Upload Section - Scan */}
          <div 
            onDragEnter={(e) => handleDrag(e, 'scan')} onDragLeave={(e) => handleDrag(e, 'scan')} onDragOver={(e) => handleDrag(e, 'scan')} onDrop={(e) => handleDrop(e, 'scan')}
            className={`border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center transition-all min-h-[220px] ${dragActive === 'scan' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white shadow-sm'}`}
          >
            {selectedScan ? (
              <div className="text-center w-full">
                <div className="bg-blue-100 p-3 rounded-full inline-block mb-3">
                  <ClipboardDocumentCheckIcon className="h-6 w-6 text-blue-600" />
                </div>
                <p className="text-xs font-bold text-slate-900 truncate mb-1 max-w-[200px] mx-auto">{selectedScan.name}</p>
                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Medical Scan</p>
                <button onClick={() => setSelectedScan(null)} className="mt-4 text-[10px] text-red-500 font-black uppercase tracking-tighter hover:underline">Remove Scan</button>
              </div>
            ) : (
              <>
                <ArrowUpTrayIcon className="h-8 w-8 text-slate-300 mb-3" />
                <p className="text-xs font-bold text-slate-900 mb-4 text-center">Upload Medical Scan</p>
                <label className="bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest py-2.5 px-5 rounded-xl cursor-pointer transition-all">
                  Browse Scan <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && setSelectedScan(e.target.files[0])} />
                </label>
              </>
            )}
          </div>

          {/* File Upload Section - Report (Mandatory in Detailed) */}
          <div 
            onDragEnter={(e) => handleDrag(e, 'report')} onDragLeave={(e) => handleDrag(e, 'report')} onDragOver={(e) => handleDrag(e, 'report')} onDrop={(e) => handleDrop(e, 'report')}
            className={`border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center transition-all min-h-[220px] ${dragActive === 'report' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white shadow-sm'} ${patientInfo.mode === 'Detailed' && !selectedReport ? 'border-amber-300' : ''}`}
          >
            {selectedReport ? (
              <div className="text-center w-full">
                <div className="bg-indigo-100 p-3 rounded-full inline-block mb-3">
                  <InformationCircleIcon className="h-6 w-6 text-indigo-600" />
                </div>
                <p className="text-xs font-bold text-slate-900 truncate mb-1 max-w-[200px] mx-auto">{selectedReport.name}</p>
                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Clinical Report</p>
                <button onClick={() => setSelectedReport(null)} className="mt-4 text-[10px] text-red-500 font-black uppercase tracking-tighter hover:underline">Remove Report</button>
              </div>
            ) : (
              <>
                <DocumentMagnifyingGlassIcon className="h-8 w-8 text-slate-300 mb-3" />
                <p className="text-xs font-bold text-slate-900 mb-1 text-center">Upload Clinical Report</p>
                <p className={`text-[9px] font-black uppercase mb-4 ${patientInfo.mode === 'Detailed' ? 'text-amber-500' : 'text-slate-400'}`}>
                  {patientInfo.mode === 'Detailed' ? 'Required for Detailed Mode' : 'Optional Extra Context'}
                </p>
                <label className="bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest py-2.5 px-5 rounded-xl cursor-pointer transition-all">
                  Browse Report <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && setSelectedReport(e.target.files[0])} />
                </label>
              </>
            )}
          </div>

          <button 
            onClick={handleAnalyze} 
            disabled={isButtonDisabled}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-black uppercase tracking-widest py-5 rounded-2xl shadow-xl shadow-blue-200/50 transition-all flex items-center justify-center space-x-2"
          >
            <DocumentMagnifyingGlassIcon className="h-5 w-5" />
            <span>Generate Comparison Report</span>
          </button>
          
          <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex items-start space-x-3">
            <InformationCircleIcon className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-800 leading-tight">
              Privacy: Your data stays local. Files are processed via secure Gemini AI and are never stored on external servers after analysis.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const ReportsListView: React.FC<{ reports: MedicalReport[]; onBack: () => void; onViewReport: (r: MedicalReport) => void; onDelete: (id: string) => void }> = ({ reports, onBack, onViewReport, onDelete }) => {
  return (
    <div className="animate-fadeIn no-print">
      <div className="flex justify-between items-center mb-8">
        <div><button onClick={onBack} className="flex items-center text-slate-500 hover:text-slate-900 mb-2"><ChevronLeftIcon className="h-4 w-4 mr-1" /> Dashboard</button>
        <h2 className="text-3xl font-bold text-slate-900">Analysis History</h2></div>
      </div>
      {reports.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-20 text-center text-slate-400">No history found.</div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs font-bold border-b border-slate-200">
              <tr><th className="px-6 py-4">Report</th><th className="px-6 py-4">Date</th><th className="px-6 py-4">Urgency</th><th className="px-6 py-4 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reports.map(report => (
                <tr key={report.id} className="hover:bg-slate-50/50 group">
                  <td className="px-6 py-5 cursor-pointer" onClick={() => onViewReport(report)}>
                    <div className="font-semibold text-slate-900">{report.patientInfo?.name || report.fileName}</div>
                    <div className="text-[10px] text-slate-400 uppercase font-black">{report.patientInfo?.scanType}</div>
                  </td>
                  <td className="px-6 py-5 text-sm text-slate-500">{new Date(report.timestamp).toLocaleDateString()}</td>
                  <td className="px-6 py-5"><span className="px-2 py-1 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600">{report.analysis.risk_level}</span></td>
                  <td className="px-6 py-5 text-right"><button onClick={() => onDelete(report.id)} className="p-2 text-slate-400 hover:text-red-600"><TrashIcon className="h-5 w-5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const ResultView: React.FC<{ report: MedicalReport; onBack: () => void }> = ({ report, onBack }) => {
  const a = report.analysis;
  const p = report.patientInfo;
  const [isExporting, setIsExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;
    setIsExporting(true);
    try {
      const element = reportRef.current;
      const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Medivise_Report_${p.name.replace(/[^a-z0-9]/gi, '_')}.pdf`);
    } catch (err) { alert("PDF generation failed."); } finally { setIsExporting(false); }
  };

  const getRiskColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'high': return 'bg-red-600';
      case 'medium': return 'bg-amber-500';
      default: return 'bg-emerald-500';
    }
  };

  const getSeverityBadge = (level: string) => {
    switch (level.toLowerCase()) {
      case 'high': return 'bg-red-100 text-red-700 border-red-200';
      case 'medium': return 'bg-amber-100 text-amber-700 border-amber-200';
      default: return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    }
  };

  return (
    <div className="max-w-5xl mx-auto animate-fadeIn pb-12">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-8 no-print space-y-4 sm:space-y-0">
        <div>
          <button onClick={onBack} className="flex items-center text-slate-500 hover:text-slate-900 mb-2 transition-colors">
            <ChevronLeftIcon className="h-4 w-4 mr-1" /> History
          </button>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">AI Master Report</h2>
        </div>
        <div className="flex space-x-3">
          <button onClick={handleDownloadPDF} disabled={isExporting} className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center space-x-2 shadow-lg disabled:opacity-50">
            {isExporting ? <span className="animate-pulse">Exporting...</span> : <><ArrowDownTrayIcon className="h-5 w-5" /><span>Download PDF</span></>}
          </button>
        </div>
      </div>

      <div ref={reportRef} className="space-y-6 pt-4 bg-white p-6 sm:p-10 rounded-3xl shadow-xl border border-slate-200">
        {/* Header Header */}
        <div className="flex flex-col md:flex-row justify-between items-start border-b border-slate-100 pb-8 gap-6">
          <div className="space-y-1">
            <div className="flex items-center space-x-2 text-blue-600 mb-2">
              <ClipboardDocumentCheckIcon className="h-6 w-6" />
              <span className="text-lg font-black tracking-tighter uppercase">Medivise AI Analysis</span>
            </div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tight uppercase leading-none">{p.name || "N/A"}</h1>
            <div className="flex flex-wrap items-center gap-4 text-slate-500 font-bold text-xs uppercase tracking-widest mt-4">
              <span className="bg-slate-100 px-3 py-1 rounded-full">{p.age} Years</span>
              <span className="bg-slate-100 px-3 py-1 rounded-full">{p.gender}</span>
              <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full">{p.scanType}</span>
              {report.reportFileName && (
                <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full flex items-center">
                  <ClipboardDocumentCheckIcon className="h-3 w-3 mr-1" />
                  Report Linked
                </span>
              )}
            </div>
          </div>
          <div className="text-left md:text-right space-y-2">
            <div className="inline-flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Overall Risk Level</span>
              <div className="flex items-center md:justify-end space-x-2 mt-1">
                <span className={`h-4 w-4 rounded-full ${getRiskColor(a.risk_level)}`}></span>
                <span className={`text-2xl font-black uppercase tracking-tighter ${a.risk_level === 'High' ? 'text-red-600' : a.risk_level === 'Medium' ? 'text-amber-500' : 'text-emerald-600'}`}>
                  {a.risk_level}
                </span>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Confidence Score</p>
              <p className="text-lg font-black text-slate-900 tracking-tighter">{a.confidence_score}</p>
            </div>
          </div>
        </div>

        {/* Patient Summary */}
        <div className="pt-4">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Patient Summary</h3>
          <p className="text-lg text-slate-800 leading-relaxed font-medium italic border-l-4 border-slate-200 pl-4 py-1">{a.patient_summary}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
          {/* Findings & Anatomy */}
          <div className="space-y-8">
            <div>
              <h3 className="flex items-center space-x-2 text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">
                <ChartBarIcon className="h-4 w-4 text-slate-400" />
                <span>Primary Observations</span>
              </h3>
              <ul className="space-y-3">
                {a.observations.map((obs, i) => (
                  <li key={i} className="flex items-start space-x-3 text-sm text-slate-700 font-semibold bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-blue-500 mt-0.5">•</span>
                    <span>{obs}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="flex items-center space-x-2 text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">
                <ShieldCheckIcon className="h-4 w-4 text-emerald-500" />
                <span>Identified Anatomy</span>
              </h3>
              <div className="flex flex-wrap gap-2">
                {a.anatomy_identified.map((an, i) => (
                  <span key={i} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-100 uppercase tracking-wider">
                    {an}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Suspected Regions */}
          <div>
            <h3 className="flex items-center space-x-2 text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">
              <ShieldExclamationIcon className="h-4 w-4 text-amber-500" />
              <span>Suspected Regions of Interest</span>
            </h3>
            <div className="space-y-4">
              {a.suspected_regions.map((region, i) => (
                <div key={i} className="bg-white p-5 rounded-2xl border-2 border-slate-100 shadow-sm space-y-3 relative overflow-hidden">
                  <div className={`absolute top-0 right-0 px-3 py-1 text-[10px] font-black uppercase tracking-widest ${getSeverityBadge(region.severity)}`}>
                    {region.severity}
                  </div>
                  <div className="flex items-start space-x-4 pr-12">
                    <div className="shrink-0 flex items-center justify-center h-10 w-10 bg-slate-50 border border-slate-100 rounded-xl">
                      {region.visual_marker.shape === 'circle' ? (
                        <div className={`h-6 w-6 rounded-full border-2 ${region.visual_marker.color === 'red' ? 'border-red-500' : region.visual_marker.color === 'yellow' ? 'border-amber-500' : 'border-emerald-500'}`}></div>
                      ) : (
                        <div className={`h-6 w-6 border-2 ${region.visual_marker.color === 'red' ? 'border-red-500' : region.visual_marker.color === 'yellow' ? 'border-amber-500' : 'border-emerald-500'}`}></div>
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-900 uppercase leading-tight mb-1">{region.location_description}</h4>
                      <p className="text-sm text-slate-600 font-medium leading-relaxed">{region.issue_description}</p>
                      <p className="text-[10px] text-slate-400 font-bold italic mt-2">"{region.visual_marker.meaning}"</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Technical Comparisons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
          <div className="bg-slate-900 p-8 rounded-3xl text-white space-y-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <BeakerIcon className="h-24 w-24" />
            </div>
            <div>
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">General Comparison</h3>
              <p className="text-sm text-white/90 font-medium leading-relaxed italic">{a.comparison_to_general_normal}</p>
            </div>
            {a.estimated_measurements && a.estimated_measurements.length > 0 && (
              <div>
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Visual Measurements (Est.)</h3>
                <div className="grid grid-cols-2 gap-4">
                  {a.estimated_measurements.map((m, i) => (
                    <div key={i} className="bg-white/5 border border-white/10 p-3 rounded-xl">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1">{m.label}</p>
                      <p className="text-lg font-black text-blue-400 tracking-tighter">{m.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <div className="bg-blue-50 p-8 rounded-3xl border border-blue-100 flex flex-col justify-between">
            <div>
              <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-4">Patient Final Summary</h3>
              <p className="text-lg font-bold text-slate-900 leading-snug">{a.final_summary}</p>
            </div>
            <div className="mt-8 space-y-2">
              <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em]">Image Quality</p>
              <p className="text-sm font-bold text-slate-700">{a.image_quality}</p>
            </div>
          </div>
        </div>

        {/* Readings Table */}
        {a.readings && a.readings.length > 0 && (
          <div className="pt-4">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center space-x-2">
                <ChartBarIcon className="h-5 w-5 text-indigo-500" />
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.2em]">Clinical Readings</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 text-[10px] uppercase tracking-widest text-slate-500 border-b border-slate-100">
                      <th className="px-6 py-4 font-black">Metric</th>
                      <th className="px-6 py-4 font-black">Result</th>
                      <th className="px-6 py-4 font-black">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {a.readings.map((reading, i) => (
                      <tr key={i} className="hover:bg-slate-50/30 transition-colors">
                        <td className="px-6 py-4 text-sm font-bold text-slate-800">{reading.metric}</td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-600">
                          {reading.value} <span className="text-xs text-slate-400 ml-1">{reading.unit}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                            reading.status === 'abnormal' ? 'bg-red-100 text-red-700' :
                            reading.status === 'borderline' ? 'bg-amber-100 text-amber-700' :
                            'bg-emerald-100 text-emerald-700'
                          }`}>
                            {reading.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Actionable Steps & Plain Language */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
          <div className="space-y-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Recommended Next Steps</h3>
            {a.recommended_next_steps.map((step, i) => (
              <div key={i} className="flex items-center space-x-3 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <CheckCircleIcon className="h-5 w-5 text-emerald-500 shrink-0" />
                <span className="text-sm font-bold text-slate-800">{step}</span>
              </div>
            ))}
          </div>
          <div className="bg-indigo-50/30 p-6 rounded-3xl border border-indigo-100">
            <h3 className="text-xs font-black text-indigo-400 uppercase tracking-[0.2em] mb-4">Simply Explained</h3>
            <div className="space-y-4">
              {a.explanations_for_user.map((exp, i) => (
                <p key={i} className="text-sm text-slate-700 font-medium leading-relaxed pb-3 border-b border-indigo-100/50 last:border-0 border-dashed">
                  {exp}
                </p>
              ))}
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-12 pt-12 border-t border-slate-100">
          <div className="bg-red-50 p-6 rounded-2xl flex items-start space-x-4 border border-red-100 shadow-md shadow-red-100/30 relative">
            <div className="shrink-0 bg-white p-2 rounded-lg"><ExclamationTriangleIcon className="h-6 w-6 text-red-600" /></div>
            <div>
              <h4 className="text-xs font-black text-red-900 uppercase tracking-widest mb-1">CRITICAL MEDICAL NOTICE</h4>
              <p className="text-sm text-red-800 font-bold leading-relaxed">{a.important_note}</p>
              <p className="text-[10px] text-red-600 font-medium mt-2 leading-tight uppercase tracking-wider">
                Correlate findings with clinical symptoms. Always consult a specialist.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
