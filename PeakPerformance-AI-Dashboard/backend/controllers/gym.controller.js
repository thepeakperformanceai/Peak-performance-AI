const crypto = require('crypto');
const User = require('../models/User.model');
const Session = require('../models/Session.model');
const { buildMemberObject, shortSport } = require('../services/memberView.service');

const fail = (m, c) => { const e = new Error(m); e.statusCode = c; return e; };

/* ---- provisioning ---- */
const createMember = async (req, res, next) => {
  try {
    const { name, email, password, sex = '', age = null, sport = '' } = req.body;
    if (!name || !email || !password) throw fail('Member name, email and password are required.', 400);
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      throw fail('Password must be at least 8 characters and include a capital letter and a special character.', 400);
    }

    const cleanEmail = email.toLowerCase().trim();
    if (await User.findOne({ email: cleanEmail })) throw fail('An account with this email already exists.', 409);

    const member = new User({
      name: name.trim(), email: cleanEmail, password,      // owner-chosen; hashed by pre-save hook
      role: 'member', gym: req.user.gym, mustChangePassword: false,
      memberProfile: { sex: ['M','F'].includes(sex) ? sex : '', age: age ? Number(age) : null, sport }
    });
    await member.save();

    res.status(201).json({ message: 'Member created.', member: member.toPublic() });
  } catch (e) { next(e); }
};

/* ---- shared loader ---- */

const loadGymMembers = async (gymId) => {
  const members = await User.find({ role: 'member', gym: gymId }).lean();
  const sessions = await Session.find({ gym: gymId }).lean();
  const byMember = {};
  for (const s of sessions) (byMember[String(s.member)] = byMember[String(s.member)] || []).push(s);
  return members.map(mem => buildMemberObject(mem, byMember[String(mem._id)] || []));
};

/* ---- dashboard endpoints (shapes match the frontend) ---- */
const getMembers = async (req, res, next) => {
  try {
    const members = await loadGymMembers(req.user.gym);
    res.json(members.map(m => ({
      id: m.id, name: m.name, sex: m.sex, age: m.age,
      sport: m.sport, sessions: m.sessions, lastTested: m.lastTested
    })));
  } catch (e) { next(e); }
};

const getMemberDetail = async (req, res, next) => {
  try {
    const members = await loadGymMembers(req.user.gym);
    const member = members.find(m => m.id === req.params.id || String(m._id) === req.params.id);
    if (!member) throw fail('Member not found in your gym.', 404);
    res.json(member);
  } catch (e) { next(e); }
};

// Sport-specific test batteries (manual + DynaMo), matching the report engine.
const SPORT_BATTERY = {
  Football: {
    manual: ['30m Sprint (0-30m)', 'Illinois Agility Test', 'Standing Broad Jump', 'Single Leg Stand (Eyes Closed)', 'Ruler Drop Test', 'Beep Test'],
    dynamo: ['Hip Extension', 'Knee Extension', 'Ankle Plantarflexion'],
  },
  Cricket: {
    manual: ['30m Sprint (0-30m)', '5-10-5 Pro Agility Shuttle', 'Medicine Ball Chest Throw', 'Single Leg Stand (Eyes Closed)', 'Ruler Drop Test', 'Yo-Yo Intermittent Recovery Test'],
    dynamo: ['Shoulder External Rotation', 'Shoulder Internal Rotation', 'Elbow Extension', 'Hip Extension'],
  },
  Padel: {
    manual: ['10m Sprint', 'T-Test', 'Medicine Ball Overhead Throw', 'Single Leg Stand (Eyes Closed)', 'Wall Toss Reaction Test', '12-Minute Cooper Run'],
    dynamo: ['Shoulder External Rotation', 'Shoulder Internal Rotation', 'Wrist Flexion', 'Hip Abduction'],
  },
  'Strength & Conditioning': {
    manual: ['30m Sprint (0-30m)', 'Illinois Agility Test', 'Standing Broad Jump', 'Single Leg Stand (Eyes Closed)', 'Ruler Drop Test', 'Beep Test'],
    dynamo: ['Hip Extension', 'Knee Extension', 'Ankle Plantarflexion'],
  },
};
const canonicalSport = (s) => (s === 'S&C' ? 'Strength & Conditioning' : s);
const mean = (arr) => arr.length ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)) : null;

// Build the flat test list for a sport (manual tests + DynaMo joints, tagged).
const testListForSport = (sport) => {
  const b = SPORT_BATTERY[sport] || SPORT_BATTERY.Football;
  return [
    ...b.manual.map(name => ({ name, kind: 'manual' })),
    ...b.dynamo.map(name => ({ name: `${name} (DynaMo)`, joint: name, kind: 'dynamo' })),
  ];
};

// Find a member's comparable value for a test.
// - manual test -> the 0-100 score from manualBattery
// - DynaMo joint -> the LSI % from dynamoStrength (already 0-100-ish)
const testValueFor = (member, testDef) => {
  const rc = member.latestReportContent || {};
  if (testDef.kind === 'dynamo') {
    const hit = (rc.dynamoStrength || []).find(d => (d.joint || '').toLowerCase() === testDef.joint.toLowerCase());
    if (!hit || hit.lsi == null) return null;
    return { score: Math.round(hit.lsi), raw: `${hit.left || ''} / ${hit.right || ''}`.trim() };
  }
  const hit = (rc.manualBattery || []).find(t => (t.test || '').toLowerCase() === testDef.name.toLowerCase());
  if (!hit || typeof hit.score !== 'number') return null;
  return { score: hit.score, raw: hit.raw || '' };
};

const getSquadComparison = async (req, res, next) => {
  try {
    const sportParam = req.query.sport;
    const testParam = req.query.test;   // the display name (may include " (DynaMo)")
    const all = await loadGymMembers(req.user.gym);

    // Always show the full set of supported sports as pills (not only ones that
    // currently have members), so the coach can pick any sport.
    const ALL_SPORTS = ['Football', 'Cricket', 'Padel', 'Strength & Conditioning'];
    const presentSports = ALL_SPORTS;
    const sport = canonicalSport(sportParam) || ALL_SPORTS[0];

    const testDefs = testListForSport(sport);
    const testNames = testDefs.map(t => t.name);
    const activeDef = testDefs.find(t => t.name === testParam) || testDefs[0];

    const inSport = all.filter(m => m.sport === sport);

    const rows = inSport
      .map(m => {
        const v = testValueFor(m, activeDef);
        return v && v.score != null ? { name: m.name, sex: m.sex, age: m.age, score: v.score, raw: v.raw } : null;
      })
      .filter(Boolean);

    const scores = rows.map(r => r.score);
    const males = rows.filter(r => r.sex === 'M').map(r => r.score);
    const females = rows.filter(r => r.sex === 'F').map(r => r.score);
    const sorted = [...rows].sort((a, b) => b.score - a.score);
    const best = sorted[0] || null;
    const worst = sorted[sorted.length - 1] || null;

    const bucket = (age) => age == null ? 'Unknown' : age < 18 ? 'U18' : age <= 23 ? '18-23' : age <= 29 ? '24-29' : '30+';
    const ageGroups = {};
    rows.forEach(r => { const b = bucket(r.age); (ageGroups[b] = ageGroups[b] || []).push(r.score); });
    const ageBreakdown = Object.entries(ageGroups)
      .map(([group, vals]) => ({ group, count: vals.length, avg: mean(vals) }))
      .sort((a, b) => a.group.localeCompare(b.group));

    res.json({
      sports: presentSports,
      sport,
      tests: testNames,          // manual tests + "<joint> (DynaMo)" entries
      test: activeDef.name,
      unit: activeDef.kind === 'dynamo' ? 'LSI %' : '/100',
      totalInSport: inSport.length,
      testedCount: rows.length,
      overallAvg: mean(scores),
      maleAvg: mean(males),
      femaleAvg: mean(females),
      maleCount: males.length,
      femaleCount: females.length,
      best: best ? { name: best.name, score: best.score, raw: best.raw } : null,
      worst: worst ? { name: worst.name, score: worst.score, raw: worst.raw } : null,
      ageBreakdown,
    });
  } catch (e) { next(e); }
};


const isStrongPw = (pw) => pw && pw.length >= 8 && /[A-Z]/.test(pw) && /[^A-Za-z0-9]/.test(pw);

// Resolve a member (by slug id or _id) within the owner's gym.
const findGymMember = async (gymId, idParam) => {
  const members = await loadGymMembers(gymId);
  return members.find(m => m.id === idParam || String(m._id) === idParam) || null;
};

const deleteMember = async (req, res, next) => {
  try {
    const target = await findGymMember(req.user.gym, req.params.id);
    if (!target) throw fail('Member not found in your gym.', 404);

    // Remove the member's sessions, then the member — scoped to this gym.
    await Session.deleteMany({ gym: req.user.gym, member: target._id });
    await User.deleteOne({ _id: target._id, gym: req.user.gym, role: 'member' });

    res.json({ message: 'Member deleted.' });
  } catch (e) { next(e); }
};

const changeMemberPassword = async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!isStrongPw(password)) {
      throw fail('Password must be at least 8 characters and include a capital letter and a special character.', 400);
    }
    const target = await findGymMember(req.user.gym, req.params.id);
    if (!target) throw fail('Member not found in your gym.', 404);

    const member = await User.findOne({ _id: target._id, gym: req.user.gym, role: 'member' });
    if (!member) throw fail('Member not found in your gym.', 404);

    member.password = password;            // hashed by the pre-save hook
    member.mustChangePassword = false;
    await member.save();

    res.json({ message: 'Password updated.' });
  } catch (e) { next(e); }
};

module.exports = { createMember, getMembers, getMemberDetail, getSquadComparison, loadGymMembers, deleteMember, changeMemberPassword };