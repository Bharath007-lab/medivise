
export interface User {
  username: string;
  passwordHash: string;
}

export interface PatientInfo {
  name: string;
  age: string;
  gender: string;
  weight: string;
  height: string;
  region: string;
  conditions: string;
  scanType: 'MRI' | 'CT' | 'X-ray';
  mode: 'Quick' | 'Detailed';
  optionalNotes?: string;
}

export interface SuspectedRegion {
  location_description: string;
  issue_description: string;
  severity: 'low' | 'medium' | 'high';
  visual_marker: {
    shape: 'circle' | 'rectangle';
    color: 'green' | 'yellow' | 'red';
    meaning: string;
  };
}

export interface Measurement {
  label: string;
  value: string;
}

export interface Reading {
  metric: string;
  value: string;
  unit: string;
  status: 'normal' | 'abnormal' | 'borderline';
}

export interface AnalysisResult {
  patient_summary: string;
  scan_type: string;
  mode: string;
  image_quality: string;
  observations: string[];
  anatomy_identified: string[];
  suspected_regions: SuspectedRegion[];
  risk_level: 'Low' | 'Medium' | 'High';
  confidence_score: string;
  comparison_to_general_normal: string;
  estimated_measurements?: Measurement[];
  readings?: Reading[];
  final_summary: string;
  recommended_next_steps: string[];
  explanations_for_user: string[];
  important_note: string;
}

export interface MedicalReport {
  id: string;
  userId: string;
  timestamp: number;
  fileName: string;
  fileType: string;
  reportFileName?: string;
  reportFileType?: string;
  patientInfo: PatientInfo;
  analysis: AnalysisResult;
}

export enum Page {
  LOGIN = 'LOGIN',
  DASHBOARD = 'DASHBOARD',
  UPLOAD = 'UPLOAD',
  REPORTS = 'REPORTS',
  RESULT = 'RESULT'
}
