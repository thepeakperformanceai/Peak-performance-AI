const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  athleteName: {
    type: String,
    required: [true, 'Athlete name is required']
  },
  age: {
    type: Number,
    required: [true, 'Age is required']
  },
  sport: {
    type: String,
    required: [true, 'Sport is required']
  },
  // ── New cover fields ──
  dob: {
    type: String,
    default: ''
  },
  weight: {
    type: String,
    default: ''
  },
  academy: {
    type: String,
    default: ''
  },
  position: {
    type: String,
    default: ''
  },
  trainingLevel: {
    type: String,
    enum: ['Beginner', 'Intermediate', 'Semi-Professional', 'Professional'],
    required: [true, 'Training level is required']
  },
  knownInjuries: {
    type: String,
    default: ''
  },
  customParams: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  testDate: {
    type: String,
    default: () => new Date().toLocaleDateString()
  },
  practitioner: {
    type: String,
    default: 'Not specified'
  },
  reportContent: {
    overallSummary: String,
    areaSummary: [[mongoose.Schema.Types.Mixed]],
    areasToAddress: Number,
    testsCompleted: Number,
    jumpHeight: String,

    findings: [
      {
        title: String,
        status: {
          type: String,
          enum: ['priority', 'needs_work', 'good', 'excellent']
        },
        description: String,
        metrics: [[mongoose.Schema.Types.Mixed]],
        exercises: [String]
      }
    ],

    // ── Section 3: What This Means on Court ──
    onCourt: {
      intro: String,
      sections: [
        {
          title: String,
          body: String,
          example: String
        }
      ]
    },

    // ── Section 4: Training Plan (priority-based) ──
    trainingPlan: {
      intro: String,
      priorities: [
        {
          title: String,
          color: String,
          note: String,
          bullets: [String],
          exercises: [
            {
              name: String,
              sets: String,
              reps: String,
              rest: String,
              cues: String
            }
          ]
        }
      ],
      weeklySchedule: [
        {
          day: String,
          focus: String,
          exercises: String
        }
      ],
      progression: String,

      // Legacy fallback (kept so old reports still render)
      phase1: [
        { name: String, setsReps: String, load: String, instructions: String }
      ],
      phase2: [
        { name: String, setsReps: String, load: String, instructions: String }
      ]
    },

    // ── Section 5: Reassessment Targets ──
    retestNote: String,
    reassessmentTargets: [
      {
        area: String,
        current: String,
        target: String,
        priority: {
          type: String,
          enum: ['Critical', 'High', 'Moderate', 'Monitor']
        }
      }
    ]
  },
  rawAiResponse: {
    type: String,
    default: ''
  },
  // ── Source PDF text, kept so "Regenerate" can re-run against real data
  // instead of just the previous report's finding titles ──
  sourcePdfData: {
    type: [
      {
        type: { type: String },   // 'HumanTrak' | 'Dynamo' | other
        text: String
      }
    ],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Report', reportSchema);