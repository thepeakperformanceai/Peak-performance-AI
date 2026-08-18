// services/promptBuilder.service.js
// Produces JSON that the PeakPerformance PDF renderer expects, matching the
// reference report layout exactly (cover • summary • findings • what-this-means •
// training plan • reassessment targets).

const MAX_PDF_CHARS = 5000  // ~1500 tokens per PDF; tune as needed

const trim = (text = '') =>
  text.length > MAX_PDF_CHARS
    ? text.slice(0, MAX_PDF_CHARS) + '\n...[truncated]'
    : text

const SYSTEM_PROMPT = `You are a sports scientist at PeakPerformance.pk producing an ATHLETE TEST BATTERY REPORT — a 4-page performance card (OVR ratings, manual fitness battery, DynaMo strength symmetry, and a football/sport-specific interpretation).

Return ONLY one valid JSON object. No markdown, no code fences, no text before or after, no comments.

You are given an athlete profile and whatever assessment data is available. Where a specific raw value is present, use it. Where a raw value is NOT present, ESTIMATE a reasonable score from the athlete's profile (age, sport, position, training level) and any related data — this is an estimated performance card, not a clinical measurement. Never leave a score blank; always output a full card.

OUTPUT THIS EXACT SHAPE:

{
  "athleteName": "Full Name",
  "age": 18,
  "sport": "Football",
  "position": "Outfield",
  "testDate": "17 Aug 2026",
  "batteryLabel": "Manual + DynaMo Battery",

  "overallOVR": 75,
  "ovrScores": [
    { "name": "Speed", "score": 82 },
    { "name": "Agility", "score": 79 },
    { "name": "Power", "score": 74 },
    { "name": "Endurance", "score": 76 },
    { "name": "Reaction", "score": 68 },
    { "name": "Balance", "score": 71 }
  ],

  "manualBattery": [
    { "test": "30m Sprint (0-30m)", "raw": "4.1 s", "avg": "Avg: 4.2-4.4s", "score": 82 },
    { "test": "Illinois Agility Test", "raw": "15.8 s", "avg": "Avg: 16.0-16.5s", "score": 79 },
    { "test": "Standing Broad Jump", "raw": "215 cm", "avg": "Avg: 200-220cm", "score": 74 },
    { "test": "Beep Test", "raw": "9.7", "avg": "Avg: 8.5-9.5", "score": 76 },
    { "test": "Ruler Drop Test", "raw": "21 cm", "avg": "Avg: 20-24cm", "score": 68 },
    { "test": "Single Leg Stand (Eyes Closed)", "raw": "18 s", "avg": "Avg: 15-20s", "score": 71 }
  ],

  "dynamoStrength": [
    { "joint": "Hip Extension", "left": "320 N", "right": "335 N", "lsi": 95.5, "status": "WITHIN RANGE" },
    { "joint": "Knee Extension", "left": "410 N", "right": "395 N", "lsi": 96.3, "status": "WITHIN RANGE" },
    { "joint": "Ankle Plantarflexion", "left": "280 N", "right": "265 N", "lsi": 94.6, "status": "WITHIN RANGE" }
  ],
  "symmetrySummary": {
    "lowest": "94.6% — Ankle Plantarflexion",
    "flag": "All limbs within acceptable 90%+ symmetry range",
    "recommendation": "Re-test at next session to confirm trend, no intervention required"
  },

  "fieldMeaning": {
    "playerProfile": "Direct, high-speed wide outlet — best used in transition, not slow build-up",
    "developmentPriority": "Reaction Time",
    "stats": [
      { "name": "Speed", "score": 82, "tag": "STRENGTH", "body": "Wins races in behind the defensive line. Effective in transition and counter-attack situations." },
      { "name": "Agility", "score": 79, "tag": "STRENGTH", "body": "Comfortable in tight 1v1 duels. Quick enough to beat a marker with a change of direction." },
      { "name": "Endurance", "score": 76, "tag": "SOLID", "body": "Can sustain high-intensity shifts across a full 90 minutes without significant drop-off." },
      { "name": "Power", "score": 74, "tag": "SOLID", "body": "Adequate strength in duels and jumps for headers. Room to build a bigger power base." },
      { "name": "Balance", "score": 71, "tag": "WATCH", "body": "Generally stable under contact, but control in tight turns is average — worth monitoring under fatigue." },
      { "name": "Reaction", "score": 68, "tag": "PRIORITY", "body": "Slowest stat on the card. May be a beat late to loose balls, rebounds, and second-phase play." }
    ]
  }
}

RULES:
- All scores are 0-100 integers. overallOVR = rounded average of the six ovrScores.
- ovrScores MUST have exactly these six: Speed, Agility, Power, Endurance, Reaction, Balance.
- manualBattery: the six standard tests above. "raw" = the athlete's result (real if in the data, else a realistic estimate for their profile); "avg" = the benchmark band string; "score" = 0-100 mapped to how the raw compares to the band.
- dynamoStrength: if DynaMo/isometric data present use it; else estimate left/right forces and compute lsi = round(min/max * 100, 1). status = "WITHIN RANGE" if lsi >= 90 else "REVIEW".
- symmetrySummary.lowest = the joint with the lowest lsi. flag/recommendation follow the 90% rule.
- fieldMeaning.stats MUST cover all six OVR stats, each with tag one of STRENGTH / SOLID / WATCH / PRIORITY (PRIORITY = lowest, tag the top two as STRENGTH), and a 1-2 sentence sport-specific body written for the athlete's actual sport.
- developmentPriority = the name of the lowest-scoring stat.
- playerProfile = one line describing how this profile shows up in their sport.
- Vary the numbers to the athlete; never copy the example values above verbatim.
- Output JSON only. Double quotes, no trailing commas.`;

/**
 * Builds the system prompt
 */
const getSystemPrompt = () => {
  return SYSTEM_PROMPT;
};

/**
 * Builds the user prompt with athlete profile, VALD data, and exercise list
 */
const buildUserPrompt = (athleteProfile, pdfData, exercises) => {
  let prompt = `ATHLETE PROFILE:\n`;
  prompt += `- Name: ${athleteProfile.name || 'N/A'}\n`;
  prompt += `- DOB: ${athleteProfile.dob || 'extract from VALD data if present'}\n`;
  prompt += `- Age: ${athleteProfile.age || 'N/A'}\n`;
  prompt += `- Weight: ${athleteProfile.weight || 'extract from VALD data if present'}\n`;
  prompt += `- Sport: ${athleteProfile.sport || 'N/A'}\n`;
  prompt += `- Position: ${athleteProfile.position || 'N/A'}\n`;
  prompt += `- Academy / Club: ${athleteProfile.academy || athleteProfile.practitioner || 'N/A'}\n`;
  prompt += `- Training Level: ${athleteProfile.trainingLevel || 'N/A'}\n`;
  prompt += `- Known Injuries: ${athleteProfile.knownInjuries || 'None'}\n`;
  prompt += `- Test Date: ${athleteProfile.testDate || 'N/A'}\n`;

  // Add custom parameters if any
  if (athleteProfile.customParams && Object.keys(athleteProfile.customParams).length > 0) {
    prompt += `- Custom Parameters:\n`;
    Object.entries(athleteProfile.customParams).forEach(([key, value]) => {
      prompt += `  - ${key}: ${value}\n`;
    });
  }

  prompt += `\nASSESSMENT DATA:\n`;

  const humanTrakPdfs = pdfData.filter(p => p.type === 'HumanTrak');
  const dynamoPdfs = pdfData.filter(p => p.type === 'Dynamo');

  if (humanTrakPdfs.length > 0) {
    prompt += `--- HUMANTRAK DATA ---\n`;
    humanTrakPdfs.forEach(pdf => { prompt += trim(pdf.text) + '\n'; });
    prompt += `--- END HUMANTRAK DATA ---\n\n`;
  }

  if (dynamoPdfs.length > 0) {
    prompt += `--- DYNAMO DATA ---\n`;
    dynamoPdfs.forEach(pdf => { prompt += trim(pdf.text) + '\n'; });
    prompt += `--- END DYNAMO DATA ---\n\n`;
  }

  const manualPdfs = pdfData.filter(p => p.type === 'ManualIntake');
  if (manualPdfs.length > 0) {
    prompt += `--- MANUAL INTAKE SCREEN (clinician-administered) ---\n`;
    prompt += `This is a manual physical screen recorded by hand, not a VALD device export. Interpret it accordingly:\n`;
    prompt += `- Joint ranges (Hip IR/ER, Shoulder Flexion/Abduction/Rotation, Trunk Rotation) are in degrees; compare Left vs Right for asymmetry and against normal ROM for the sport.\n`;
    prompt += `- Ankle Dorsiflexion (Knee-to-Wall) is in cm; lower = more restricted; side-to-side difference matters.\n`;
    prompt += `- Overhead Squat and Single-Leg Squat are 0-2 visual screens (0 = clean, 2 = marked fault); treat higher scores as movement-quality flags, not measurements.\n`;
    prompt += `- Single-Leg Balance (Eyes Closed) is seconds to first correction; large L/R gaps indicate a proprioceptive/stability deficit.\n`;
    prompt += `- Push-Up Test is max reps to failure (capacity, not asymmetry).\n`;
    prompt += `- Apply the same clinical-voice, named-structure, sport-specific-moment standards used for VALD findings. Do not invent tests that are blank/illegible.\n`;
    manualPdfs.forEach(pdf => { prompt += trim(pdf.text) + '\n'; });
    prompt += `--- END MANUAL INTAKE SCREEN ---\n\n`;
  }

  // Any PDFs that weren't tagged HumanTrak/Dynamo/ManualIntake — still pass them through
  const otherPdfs = pdfData.filter(p => !['HumanTrak', 'Dynamo', 'ManualIntake'].includes(p.type));
  if (otherPdfs.length > 0) {
    prompt += `--- ADDITIONAL DATA ---\n`;
    otherPdfs.forEach(pdf => { prompt += trim(pdf.text) + '\n'; });
    prompt += `--- END ADDITIONAL DATA ---\n\n`;
  }

  prompt += `EXERCISE LIST (only recommend from this list):\n`;
  exercises.forEach(exercise => {
    prompt += `- ${exercise.name} (targets: ${exercise.targets})\n`;
  });

  prompt += `\nGenerate the report now as a single JSON object following the required shape exactly.`;

  return prompt;
};

module.exports = {
  getSystemPrompt,
  buildUserPrompt
};