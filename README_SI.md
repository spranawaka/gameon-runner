# GameOn Runner — Webcam + leaderboard

මෙම project එක browser 3-lane runner game එක, local webcam pose controls සහ MongoDB leaderboard server එක එකට run කරයි. Login / register අවශ්‍ය නැත.

## Run කිරීම

Node.js 22 හෝ අලුත් version එකක් භාවිත කරන්න. මෙම folder එකේ **START_GAME.command** double-click කරන්න. Terminal එක open තබා browser එකෙන් **http://localhost:3000** විවෘත කරන්න. පරණ server එකක් port 3000 මත run වෙනවා නම් එය Control+C මඟින් නවත්වා නැවත start කරන්න.

Terminal හරහා:

```sh
npm install
npm start
```

මේ computer එකේ dependencies සහ pose assets සූදානම් කර ඇත. නව computer එකක `npm install` කරන විට local MediaPipe runtime, WASM සහ pose model එක setup වේ. ඒ පළමු setup එකට internet අවශ්‍යය. MongoDB scores save/load කිරීම සඳහා internet අවශ්‍යය. Pose processing සඳහා camera frames පිටතට යවන්නේ නැත.

Development:

```sh
npm run dev
```

`client` හෝ `server` directory එකක සිටත් `npm run dev` / `npm start` අදාළ package scripts අනුව භාවිත කළ හැක. එක server process එකක් client files සහ API දෙකම serve කරන නිසා CORS configuration අවශ්‍ය නැත. `index.html` double-click කිරීමෙන් game එක run නොකරන්න.

## Folder structure

- `client/` — HTML/CSS/Three.js game, mascot, corrected G coin, trails පහ, webcam UI, MediaPipe worker, pose thresholds.
- `server/` — Express API, MongoDB best-score storage, validation, server-only `.env`.
- `scripts/setup-pose.mjs` — local MediaPipe files සහ pose model සකස් කරයි.
- `START_GAME.command` — local launcher.

## Play කිරීම

1. Trail එකක් තෝරා **Body tracking** mode තබා **Start running** එබීමෙන් camera permission ලබා දෙන්න.
2. Shoulders සහ hips පෙනෙන ලෙස කැමරාවට ඉදිරියෙන් සිට තත්පර 1–2ක් නිශ්චලව සිටින්න. Baseline එක calibrate වේ.
3. **5 → 4 → 3 → 2 → 1 → GO!** පසු game එක ඇරඹේ.
4. වමට/දකුණට ඇලවීම හෝ පියවරක් තැබීමෙන් lanes මාරුවේ. මැදට පැමිණීමෙන් middle lane එකට එයි. උඩ පනින්න; slide සඳහා squat කරන්න.
5. Tracking අහිමි වුණොත් game එක pause වේ. නැවත කැමරාවට පෙනෙන ලෙස සිට Resume කරන්න.
6. Game එක අවසානයේ නම/email දී **Save score**, නැත්නම් **Skip & return home** තෝරන්න. Camera එක game-over වෙලාවේ නවතියි.

Camera access සඳහා localhost හෝ HTTPS අවශ්‍යයි. Chrome/Edge වැනි වත්මන් browser එකක් භාවිත කරන්න. Camera permission නොලැබුණොත් setup panel එකේ **Use keyboard instead** තෝරා play කළ හැක. Keyboard mode: ←/→ හෝ A/D, ↑/Space/W jump, ↓/S slide, P/Escape pause.

## Pose logic

`client/src/pose-motion.js` තුළ normalized image coordinates භාවිත වේ:

| Action | Trigger |
| --- | --- |
| Left / Right | mirrored shoulder midpoint X baseline එකෙන් ±0.12; මැදට ඒම සඳහා ±0.08 hysteresis |
| Jump | hip midpoint baseline එකට වඩා 0.08ක් උඩට සහ ඉක්මන් upward movement (>0.35 normalized units/sec) |
| Slide | shoulder midpoint Y baseline එකට වඩා 0.15ක් පහළට; squat එක hold කළ හැක |

MediaPipe Pose Landmarker 33-point model එකෙන් ලැබෙන points අතරින් 11,12,23,24 පමණක් worker එකෙන් game UI එකට ලබාදේ. Visibility 0.55ට අඩු points භාවිත නොකරයි. Calibration, smoothing, jump latch/cooldown සහ neutral hysteresis අඩංගුය. Thresholds සැබෑ player/camera distance අනුව අවශ්‍ය නම් මේ file එකෙන් tune කළ හැක.

## Scores සහ privacy

- `server/.env` තුළ MONGODB_URI සහ MONGODB_DB ඇත. දුන් connection එක මෙම local project එකට configure කර ඇත. Client bundle එකට URI ඇතුළත් නොවේ; static server එකෙන් server folder එක serve නොකරයි.
- MongoDB database: `gameon_runner`; collection: `players`.
- Trim කළ lowercase email එක MongoDB `_id` ලෙස unique වේ. Atomic update එකක් මඟින් email එකකට best score එක විතරක් තබයි. අඩු score එකක් best score එක අඩු නොකරයි.
- Score = floor(distance) + coins × 25. Server එක distance/coins validate කර score derive කරයි. Client-requested arbitrary score field පිළිගන්නේ නැත.
- Public leaderboard එකේ rank/name/score/run stats පමණක් ඇත. Email public response එකට නොයවයි.
- Save එබූ විට පමණක් නම/email/run stats POST වේ. Skip handler එකෙන් request එකක්, beacon එකක් හෝ storage write එකක් නොකර home එකට යයි. Home leaderboard සඳහා app load/explicit refresh/සාර්ථක save පසු read-only GET ඇත.
- Webcam frames local worker එකක process වේ. Audio request නොකරයි. Video, photos හෝ pose coordinates server endpoint එකකට යවන්නේ නැත. Model/runtime files client වෙතින්ම load වේ.
- මේ specification අනුව email ownership verify කරන login/OTP නැත. Public competition සඳහා authenticated anti-cheat system එකක් මෙහි ඇතුළත් නොවේ.

Database connection නැති විට game එක play කළ හැක. Leaderboard සහ Save පැහැදිලි error එකක් පෙන්වයි; fake success හෝ silent memory fallback එකක් නැත. Atlas connection ප්‍රශ්නයක් නම් `.env` සහ Atlas network access පරීක්ෂා කරන්න.

## API

- `GET /api/health` — server/database status.
- `GET /api/leaderboard` — top 10 unique players, emails excluded.
- `POST /api/scores` — `{ name, email, distance, coins, biome }`; `{ saved, bestScore, submittedScore }` result.

JSON size limit, input validation, same-origin save check සහ save rate limit ඇතුළත්ය. All player names render කරන්නේ text ලෙසය.

## Checks

```sh
npm test
npm run test:rules
npm run test:mongodb
```

`test:mongodb` සඳහා configured MongoDB connection අවශ්‍යය. එය production `players` collection එක වෙනස් නොකර, unique `qa_scores_...` temporary collection එකක් create කර test අවසානයේ එය ඉවත් කරයි.

Browser QA: countdown sequence; keyboard game-over; Save → home leaderboard update; Skip → home without a saved player; real MediaPipe model inference; synthetic local video capture → calibration → track/worker cleanup; fixed coin logo and game asset loading.

සැබෑ webcam එකකින් physical jump/squat කිරීම player/camera setup එකේ tune කළ යුතුය. Automated browser check සඳහා local synthetic video stream භාවිත කළා.

## Packaging

ZIP එකේ `node_modules` හෝ සැබෑ `.env` credentials ඇතුළත් නොවේ. වෙනත් computer එකක extract කළොත් `server/.env.example` copy කර `server/.env` හදා URI ලබාදී `npm install` කරන්න. Local original folder එකේ `.env` දැනට configure කර ඇත.

Implementation references: [Google Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js), [MongoDB atomic updates](https://www.mongodb.com/docs/manual/reference/method/db.collection.updateone/).
