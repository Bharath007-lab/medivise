
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, PatientInfo } from "./types";

export async function analyzeMedicalFile(
  scanFile: File,
  scanBase64: string,
  patientInfo: PatientInfo,
  reportFile?: File,
  reportBase64?: string
): Promise<AnalysisResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const analysisPrompt = `
You are an advanced medical imaging assistant designed to generate structured reports, user-friendly summaries, and shareable outputs.

The user will provide:
1. A medical image (MRI / CT / X-ray)
2. Patient details
3. Scan type
4. Mode (Quick / Detailed)
5. Optional previous reports

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
${patientInfo.scanType} (MRI / CT / X-ray)

MODE:
${patientInfo.mode} (Quick / Detailed)

OPTIONAL:
Previous Report / Clinical Notes:
${patientInfo.optionalNotes || "None provided"}

----------------------------------------

TASK:

Analyze the provided medical image carefully and generate a structured response according to the following requirements.

----------------------------------------

MODE RULES:

QUICK MODE:
- Keep outputs concise
- Focus on severity + summary

DETAILED MODE:
- Add explanations
- Expand observations
- Include more structured breakdown
- Compare to general normal expectations
- Use previous report if provided

----------------------------------------

VISUAL MARKER RULES:

- DO NOT draw on image
- Describe marker locations (e.g., "upper right chest")
- Use severity colors:
  Green = low
  Yellow = medium
  Red = high

----------------------------------------

SAFETY RULES:

- DO NOT give diagnosis
- DO NOT claim access to hospital/cloud medical datasets
- If uncertain, say "insufficient information"
- Always include disclaimer: "This is an AI-generated report and not a medical diagnosis."

----------------------------------------

JSON STRUCTURE GUIDELINES (for Section 1):

- observations: Only visible facts (NO guessing)
- anatomy_identified: List visible anatomical structures
- readings: Extract clear metrics, measurements, or labs
- final_summary: Clear, concise conclusion (non-diagnostic)

----------------------------------------

Now analyze the image and populate the JSON response.
  `;

  const contents: any[] = [
    {
      inlineData: {
        mimeType: scanFile.type,
        data: scanBase64,
      }
    }
  ];

  if (reportFile && reportBase64) {
    contents.push({
      inlineData: {
        mimeType: reportFile.type,
        data: reportBase64,
      }
    });
  }

  contents.push({ text: analysisPrompt });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", 
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
          important_note: { type: Type.STRING },
          human_readable_report: { type: Type.STRING },
          email_share_format: { type: Type.STRING },
          downloadable_report_text: { type: Type.STRING }
        },
        required: [
          "patient_summary", "scan_type", "mode", "image_quality", "observations", 
          "anatomy_identified", "suspected_regions", "risk_level", "confidence_score",
          "comparison_to_general_normal", "final_summary", "recommended_next_steps",
          "explanations_for_user", "important_note", "readings",
          "human_readable_report", "email_share_format", "downloadable_report_text"
        ]
      }
    }
  });

    const text = response.text || "{}";
    return JSON.parse(text) as AnalysisResult;
  } catch (e: any) {
    console.error("Failed to parse or fetch Gemini response", e);
    throw new Error(e.message || "Analysis failed. Please ensure the file contains clear medical imaging data.");
  }
}
