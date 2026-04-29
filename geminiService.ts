
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, PatientInfo } from "./types";

export async function analyzeMedicalFile(
  file: File,
  base64Data: string,
  patientInfo: PatientInfo
): Promise<AnalysisResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const analysisPrompt = `
You are an advanced medical imaging assistant designed to generate structured, user-friendly medical reports from imaging scans.

The user will provide:
1. A medical image (MRI / CT / X-ray)
2. Patient details
3. Selected scan type
4. Selected mode (Quick or Detailed)
5. Optional previous reports or clinical notes

----------------------------------------

PATIENT DETAILS:
- Name: ${patientInfo.name}
- Age: ${patientInfo.age}
- Gender: ${patientInfo.gender}
- Weight: ${patientInfo.weight}
- Height: ${patientInfo.height}
- Region of Scan: ${patientInfo.region}
- Known Conditions: ${patientInfo.conditions}

SCAN TYPE:
${patientInfo.scanType}  (MRI / CT / X-ray)

MODE:
${patientInfo.mode}  (Quick / Detailed)

OPTIONAL:
Previous Report / Clinical Notes:
${patientInfo.optionalNotes || "None provided"}

----------------------------------------

TASK:

Analyze the provided medical image carefully and generate a structured, easy-to-understand medical-style report.

----------------------------------------

OUTPUT FORMAT (STRICT JSON ONLY):

{
  "patient_summary": "",
  "scan_type": "",
  "mode": "",
  "image_quality": "",
  "observations": [],
  "anatomy_identified": [],
  "suspected_regions": [
    {
      "location_description": "",
      "issue_description": "",
      "severity": "low / medium / high",
      "visual_marker": {
        "shape": "circle / rectangle",
        "color": "green / yellow / red",
        "meaning": ""
      }
    }
  ],
  "risk_level": "",
  "confidence_score": "",
  "comparison_to_general_normal": "",
  "estimated_measurements": [
    { "label": "", "value": "" }
  ],
  "readings": [
    {
      "metric": "",
      "value": "",
      "unit": "",
      "status": "normal / abnormal / borderline"
    }
  ],
  "final_summary": "",
  "recommended_next_steps": [],
  "explanations_for_user": [],
  "important_note": ""
}

----------------------------------------

DETAILED FIELD INSTRUCTIONS:

1. patient_summary:
   - Brief overview combining patient details and scan type

2. image_quality:
   - Mention clarity, blur, noise, resolution

3. observations:
   - Only visible facts (NO guessing)

4. anatomy_identified:
   - List visible anatomical structures

5. suspected_regions:
   For each region:
   - Describe location clearly (e.g., "upper right lung", "central brain region")
   - Describe visible issue (if any)
   - Assign severity:
       low / medium / high
   - Define visual_marker:
       shape: circle or rectangle
       color: green / yellow / red
       meaning: explanation of severity

6. risk_level:
   - Overall: Low / Medium / High

7. confidence_score:
   - Estimate confidence (0–100%)

8. comparison_to_general_normal:
   - Compare to general anatomical expectations
   - DO NOT claim real dataset comparison

9. estimated_measurements:
   - Only include if visually inferable (approximate only)

10. readings:
    - Extract any clear metrics, measurements, or labs into a structured format
    - Define metric, value, unit (if applicable), and clinical status (normal, abnormal, borderline)

11. final_summary:
   - Clear, concise conclusion (non-diagnostic)

12. recommended_next_steps:
   - Safe suggestions (e.g., further imaging, consultation)

13. explanations_for_user:
   - Explain findings in simple language

14. important_note:
   - MUST include:
     "This is an AI-generated report and not a medical diagnosis."

----------------------------------------

MODE BEHAVIOR:

QUICK MODE:
- Focus on:
  - key observations
  - severity
  - short summary
- Keep output concise
- Skip deep explanations

DETAILED MODE:
- Include:
  - deeper explanations
  - more structured breakdown
  - comparison to general normal
  - optional estimated measurements
- If previous report is provided, consider it

----------------------------------------

VISUAL MARKER RULES:

- You CANNOT draw on the image
- Instead, describe marker placement using text
- Example:
  "location_description": "upper left chest region"

Frontend will use this to draw:
- circles / rectangles
- colors based on severity

----------------------------------------

CRITICAL SAFETY RULES:

- DO NOT provide diagnosis
- DO NOT claim certainty beyond visible evidence
- If unsure, say "insufficient information"
- DO NOT claim access to hospital or cloud medical datasets
- Use general medical knowledge only

----------------------------------------

Now analyze the image and generate the report.
  `;

  const contents = {
    parts: [
      {
        inlineData: {
          mimeType: file.type,
          data: base64Data
        }
      },
      {
        text: analysisPrompt
      }
    ]
  };

  const response = await ai.models.generateContent({
    model: "gemini-1.5-flash", 
    contents,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          patient_summary: { type: Type.STRING },
          scan_type: { type: Type.STRING },
          mode: { type: Type.STRING },
          image_quality: { type: Type.STRING },
          observations: { type: Type.ARRAY, items: { type: Type.STRING } },
          anatomy_identified: { type: Type.ARRAY, items: { type: Type.STRING } },
          suspected_regions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                location_description: { type: Type.STRING },
                issue_description: { type: Type.STRING },
                severity: { type: Type.STRING, enum: ["low", "medium", "high"] },
                visual_marker: {
                  type: Type.OBJECT,
                  properties: {
                    shape: { type: Type.STRING, enum: ["circle", "rectangle"] },
                    color: { type: Type.STRING, enum: ["green", "yellow", "red"] },
                    meaning: { type: Type.STRING }
                  },
                  required: ["shape", "color", "meaning"]
                }
              },
              required: ["location_description", "issue_description", "severity", "visual_marker"]
            }
          },
          risk_level: { type: Type.STRING, enum: ["Low", "Medium", "High"] },
          confidence_score: { type: Type.STRING },
          comparison_to_general_normal: { type: Type.STRING },
          estimated_measurements: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                value: { type: Type.STRING }
              }
            }
          },
          readings: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                metric: { type: Type.STRING },
                value: { type: Type.STRING },
                unit: { type: Type.STRING },
                status: { type: Type.STRING, enum: ["normal", "abnormal", "borderline"] }
              },
              required: ["metric", "value", "unit", "status"]
            }
          },
          final_summary: { type: Type.STRING },
          recommended_next_steps: { type: Type.ARRAY, items: { type: Type.STRING } },
          explanations_for_user: { type: Type.ARRAY, items: { type: Type.STRING } },
          important_note: { type: Type.STRING }
        },
        required: [
          "patient_summary", "scan_type", "mode", "image_quality", "observations", 
          "anatomy_identified", "suspected_regions", "risk_level", "confidence_score",
          "comparison_to_general_normal", "final_summary", "recommended_next_steps",
          "explanations_for_user", "important_note", "readings"
        ]
      }
    }
  });

  const text = response.text || "{}";
  try {
    return JSON.parse(text) as AnalysisResult;
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    throw new Error("Analysis failed. Please ensure the file contains clear medical imaging data.");
  }
}
