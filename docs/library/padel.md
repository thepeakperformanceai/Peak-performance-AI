# PeakPerformance Padel Test Library

Oct 18, 2026 · @Faraz

## How to use this library

Every padel test gets one entry, and the athlete's report shows the entry that matches their result. Same four parts as cricket: what we measured, what it means for your game, how we read your result, and how to improve.

**One version for every player.** Players switch sides, so there are no Drive or Revés lines. The report stays personal through the athlete's own numbers, their weaker side and their racket arm.

**Each test explains itself in four short parts:**

1. **A nickname:** what the test is, in a few everyday words.
2. **You'll notice it when…** a moment they've already felt on court.
3. **Why:** one sentence using their number. There's one version per rule, and the engine shows the one that matches their result.
4. **Fix it and…** what changes in their game.

Words in curly brackets, like {score} or {weaker_side}, are filled in by the engine from the athlete's results. Gemini never writes or changes these lines.

The same three rules apply as cricket: the engine picks the entry and the fix, Gemini only narrates, and every threshold marked "proposed" needs DPT sign-off.

This library covers the 9-test padel battery: 10m Sprint, 5-0-5 Agility, Ruler Drop, Overhead Squat, Trunk Rotation, Single Leg Stand (Eyes Closed), Shoulder External Rotation, Hip Abduction, and Hip Adduction.

## 1. 10m Sprint (Speed)

**What we measured.** How fast you cover 10 metres from a standing start, the length of one side of the court.

**Speed: your first three steps**

**You'll notice it when** you see the lob coming but your opponents get back to the net before you do, or you reach balls off the side glass stretching instead of set.

**Why:**

- *Below target:* You covered 10 metres in {time}. {next_tier} starts at {target}, so you're {gap} away.
- *At Gold:* You covered 10 metres in {time}. That's Gold level.

**Fix it and** you'll win more races back to the net, and that's where padel points are won.

**How we read your result.**

- Score below tier target → show **Fix A: first-step power**.
- At or above Gold → show **Fix B: keep it sharp**.

**How to improve.**

*Fix A: first-step power (6 weeks, 2 sessions a week)*

- Falling starts over 5 metres: 6 reps, full rest.
- Split-step then sprint on a partner's call: 6 reps.
- Split squats: 3 sets of 8 each leg.

*Fix B: keep it sharp (once a week)*

- Split-step reaction sprints over 5 metres: 6 reps.

*Court drills (add to either fix)*

- Back-to-net sprints: from the back glass to the net, then split-step. 6 reps.
- Turn and chase: a partner lobs over you; turn and run it down before it reaches the back glass. 8 reps.

**Retest:** 6 weeks.

## 2. 5-0-5 Agility Test (Agility)

**What we measured.** How quickly you sprint, stop, turn 180° and sprint back out.

**Agility: your brakes and turn**

**You'll notice it when** the ball comes off the back glass at an odd angle and you're already moving the wrong way, or you get pulled wide and can't get back in time to cover the middle.

**Why:**

- *Below target:* You turned and came back in {time}. {next_tier} starts at {target}, so you're {gap} away.
- *One side slower:* You turn {gap}% slower off your {weaker_side} foot.

**Fix it and** you'll stop, turn and reach more balls on balance, point after point.

**How we read your result.**

- Time slower than tier target → show **Fix A: brake and turn**.
- Slower turning off one foot than the other (if timed both ways, more than 5%, proposed) → also show **Fix B: even both turns**.

**How to improve.**

*Fix A: brake and turn (6 weeks, 2 sessions a week)*

- Deceleration drills: sprint 5 metres, stop in two steps and hold. 6 reps.
- 5-0-5 practice at 80% effort, focusing on a low turn: 6 reps.
- Lateral lunges: 3 sets of 8 each side.

*Fix B: even both turns*

- Two extra turns off your weaker foot in each session.

*Court drills (add to either fix)*

- Back-glass exits: a partner feeds into the corner; turn and play it out. 10 reps.
- Cover-the-middle shuffle: shuffle wide, plant and return to centre. 3 sets of 6.

**Retest:** 6 weeks.

## 3. Ruler Drop Test (Reaction)

**What we measured.** How far a dropped ruler falls before you catch it. Shorter is faster.

**Reaction: how fast you see and move**

**You'll notice it when** fast exchanges at the net go past you before your racket is ready, or a smash off the glass catches you late.

**Why:**

- *Below target:* You caught the ruler at {distance}. {next_tier} starts at {target}, so you're {gap} away.
- *At Gold:* You caught the ruler at {distance}. That's Gold level.

**Fix it and** you'll win more of the quick-fire volleys at the net, and have time to set your racket against smashes.

**How we read your result.**

- Catch distance worse than tier target → show **Fix A: sharpen reactions**.
- At or above Gold → show **Fix B: keep it sharp**.

**How to improve.**

*Fix A: sharpen reactions (4 weeks, 3 short sessions a week)*

- Reaction ball against a wall: 3 rounds of 60 seconds.
- Partner drops: a partner drops a ball without warning; catch it before the second bounce. 3 sets of 10.

*Fix B: keep it sharp*

- Fast volley rallies at the net once a week.

*Court drills (add to either fix)*

- Quick-fire volleys with a partner, both at the net: 3 rounds of 30 seconds.
- A partner feeds fast balls at your body; volley each one. 20 balls.

**Retest:** 4 weeks. Reaction improves fastest, so it's often the first stat that moves.

## 4. Overhead Squat (HumanTrak)

**What we measured.** How well your ankles, hips, upper back and shoulders work together as you squat with your arms overhead.

**Movement: getting low and reaching high**

**You'll notice it when** your back gets tired in long defensive rallies, or bandejas and smashes feel cramped, like you can't get your arm fully up.

**Why:**

- *Heels lifting or knees caving:* As you squatted, your {fault}. Tight ankles or weak hips stop you getting low while keeping good posture.
- *Arms dropping or back arching:* As you squatted, your {fault}. A stiff upper back or tight shoulders make your lower back do the work on overheads.
- *No fault recorded:* Your coach will go through what they saw and pick the right fix with you.

**Fix it and** you can stay low all rally and hit overheads standing tall, without your lower back paying for it.

**How we read your result.**

- Heels lifting or knees caving → show **Fix A: ankles and hips**.
- Arms dropping forward or the lower back arching → show **Fix B: shoulders and upper back**.
- Clean pattern → show **Fix C: maintain**.

**How to improve.**

*Fix A: ankles and hips (4 weeks, daily, 5–10 minutes)*

- Knee-to-wall ankle stretch: 2 sets of 10 each side.
- Goblet squat holds at the bottom: 3 holds of 30 seconds.
- Banded lateral walks: 2 sets of 12 steps each way.

*Fix B: shoulders and upper back (4 weeks, daily)*

- Foam roller extensions on the upper back: 10 slow reps.
- Wall slides: 2 sets of 10.
- Open book stretch: 2 sets of 10 each side.

*Fix C: maintain*

- Overhead squats with a stick in every warm-up: 1 set of 8.

*Court drills (add to any fix)*

- Low-ball feeds: a partner feeds at your feet; stay low and play them back. 15 balls.
- Shadow bandejas, keeping your chest tall: 2 sets of 10.

**Retest:** 4 weeks.

## 5. Trunk Rotation (HumanTrak)

**What we measured.** How far your upper body turns to each side while your hips stay still.

**Rotation: your power turn**

**You'll notice it when** your víbora and smash lack spin and pace even when you swing hard, or your forehand feels like it's all arm.

**Why:**

- *One side tighter:* Your upper body turns {gap}% less to the {weaker_side} than to the other side.
- *Both sides below target:* Your rotation scored {score}. {next_tier} starts at {target}, so you're {gap} points away.

**Fix it and** you'll get more spin and pace on overheads and drives, without forcing your shoulder.

**How we read your result.**

- One side more than 10% less than the other (proposed) → show **Fix A: even it out**.
- Both sides below tier target → show **Fix B: open up the upper back**.

**How to improve.**

*Fix A: even it out (4 weeks, daily, 5 minutes)*

- Open book stretch toward the tighter side: 2 sets of 10, plus one extra set on that side.
- Seated rotations with a stick across your shoulders: 2 sets of 10 each side.

*Fix B: open up the upper back (4 weeks, daily)*

- Foam roller extensions on the upper back: 10 slow reps.
- Open book: 2 sets of 10 each side.
- Half-kneeling band rotations: 3 sets of 10 each side.

*Court drills (add to either fix)*

- Med ball side throws against a wall: 3 sets of 6 each side.
- Back-glass feeds: let the ball come off the glass, turn and play it out. 10 each side.

**Retest:** 4 weeks.

## 6. Single Leg Stand, Eyes Closed (HumanTrak)

**What we measured.** How steady you stay on one leg with your eyes closed, on each side. This tests the balance system in your ankle and body, not your eyesight.

**Balance: your one-foot control**

**You'll notice it when** you wobble after a wide lunge or after landing from a smash, or you've rolled an ankle before.

**Why:**

- *Below target:* With your eyes closed, you held steady for {seconds} seconds. {next_tier} starts at {target}, so you're {gap} away.
- *One leg weaker:* Your {weaker_side} leg held steady for {gap}% less time than your other leg.

**Fix it and** you'll play controlled shots off wide lunges, recover faster, and protect your ankles against sprains.

**How we read your result.**

- Time held below tier target on either leg → show **Fix A: build balance**.
- One leg holding more than 20% less time than the other (proposed) → also show **Fix B: even it out**. Ask about past ankle sprains on that side.

**How to improve.**

*Fix A: build balance (4 weeks, daily, 5 minutes)*

- Single-leg stands, eyes open then closed: 3 holds of 30 seconds each leg.
- Single-leg stands on a cushion or folded towel: 3 holds of 30 seconds each leg.
- Single-leg reaches in three directions: 2 sets of 6 each leg.

*Fix B: even it out*

- One extra hold on your weaker leg in every exercise.

*Court drills (add to either fix)*

- Wide lunge, then hold on one leg for 2 seconds before recovering: 3 sets of 6 each side.
- Small jump, land on one leg and hold for 3 seconds: 3 sets of 5 each leg.

**Retest:** 4 weeks.

## 7. Shoulder External Rotation Strength (Dynamo)

**What we measured.** The strength of the muscles at the back of each shoulder that rotate your arm outward.

**Shoulder strength: the brakes on your arm**

**You'll notice it when** your smashes and víboras lose pace late in a match, or your shoulder or elbow aches the day after.

**Why:**

- *Below target:* Your racket arm scored {score}. {next_tier} starts at {target}, so you're {gap} points away.
- *Racket arm weaker:* Your racket arm is {gap}% weaker than your other arm. Every overhead is a fast swing and a hard stop, and the back of the shoulder does the stopping.

**Fix it and** you can keep hitting hard overheads all match, and get through a full season without shoulder or elbow pain.

**How we read your result.**

- Strength relative to bodyweight below tier target on your racket arm → show **Fix A: strengthen the back of the shoulder**.
- Racket arm more than 10% weaker than the other arm (proposed) → also show **Fix B: close the gap**.
- Strong and balanced → show **Fix C: maintain**.

**How to improve.**

*Fix A: strengthen the back of the shoulder (6 weeks, 3 sessions a week)*

- Side-lying external rotation with a light dumbbell: 3 sets of 12–15.
- Band external rotation with the arm at shoulder height (90/90): 3 sets of 12.
- Prone Y and T raises: 2 sets of 10 in the warm-up.

*Fix B: close the gap*

- One extra set on your racket arm for each exercise.

*Fix C: maintain*

- Band external rotation, 2 sets of 15, twice a week.

*Court drills (add to any fix)*

- Band external rotation before every match: 1 set of 15.
- Limit full-power smashes in practice to 20–30 per session while you build strength.
- Stop and tell us if you feel pain on the outside of your elbow; don't play through it.

**Retest:** 6 weeks.

## 8. Hip Abduction Strength (Dynamo)

**What we measured.** The strength of the muscles on the outside of each hip that push your leg out to the side.

**Outer-hip strength: your sideways push**

**You'll notice it when** you're a step late to balls through the middle, or your knee drifts inward when you lunge.

**Why:**

- *Below target:* Your outer hips scored {score}. {next_tier} starts at {target}, so you're {gap} points away.
- *One side weaker:* Your {weaker_side} side is {gap}% weaker than your other side.

**Fix it and** you'll get a faster first step sideways and straighter knees on every lunge.

**How we read your result.**

- Strength relative to bodyweight below tier target → show **Fix A: build hip strength**.
- One side more than 10% weaker than the other (proposed) → also show **Fix B: close the gap**.
- Strong and even → show **Fix C: maintain**.

**How to improve.**

*Fix A: build hip strength (6 weeks, 3 sessions a week)*

- Side-lying leg raises: 3 sets of 15 each side, slow on the way down.
- Banded lateral walks: 3 sets of 12 steps each way.
- Side planks with top-leg raise: 3 sets of 8 each side.

*Fix B: close the gap*

- One extra set of each exercise on the weaker side.

*Fix C: maintain*

- Banded lateral walks in every warm-up.

*Court drills (add to any fix)*

- Lateral push-offs: shuffle and push off to the centre line. 3 sets of 6 each way.
- Lunges toward the side glass, knee tracking over the toes: 3 sets of 8 each side.

**Retest:** 6 weeks. Read this alongside Hip Adduction: the balance between the two matters as much as either number.

## 9. Hip Adduction Strength (Dynamo)

**What we measured.** The strength of the inner thigh (groin) muscles that pull your leg back toward the middle, on each side.

**Groin strength: your pull back to the middle**

**You'll notice it when** you reach a wide ball but you're slow getting back, or you feel a pull in your inner thigh after a deep lunge.

**Why:**

- *Weak compared with outer hip:* Your groin is {ratio}% as strong as your outer hip. We want it at 80% or more.
- *One side weaker:* Your {weaker_side} side is {gap}% weaker than your other side.

**Fix it and** you'll recover faster after wide balls, with less risk of a groin strain when you lunge into the corner.

**How we read your result.**

- Adduction less than 80% of abduction on the same side (proposed) → show **Fix A: strengthen the groin**.
- One side more than 10% weaker than the other (proposed) → also show **Fix B: close the gap**.
- Balanced and even → show **Fix C: maintain**.

**How to improve.**

*Fix A: strengthen the groin (6 weeks, 3 sessions a week)*

- Copenhagen plank, short lever (knee on the bench): 3 holds of 15–20 seconds each side.
- Side-lying inner leg raises: 3 sets of 12 each side.
- Ball squeezes between the knees: 3 holds of 10 seconds.

*Fix B: close the gap*

- One extra set on your weaker side for each exercise.

*Fix C: maintain*

- Copenhagen plank twice a week: 2 holds of 20 seconds each side.

*Court drills (add to any fix)*

- Lateral lunge and push back to centre: 3 sets of 8 each side.
- Leg swings side to side before every match: 10 each leg.

**Retest:** 6 weeks.

## DPT review checklist

About an hour of review, ideally before 21 October.

- [ ] Every threshold marked "proposed" is confirmed or changed
- [ ] Exercises are safe for beginners and regular club players
- [ ] Sets, reps and frequency suit players training alongside matches
- [ ] Results that need a physio referral are flagged (pain during testing, past ankle sprains, elbow pain)
- [ ] Retest windows are agreed
- [ ] "You'll notice it when" lines match what club players really feel on court
- [ ] Battery list matches the tests actually run on site
