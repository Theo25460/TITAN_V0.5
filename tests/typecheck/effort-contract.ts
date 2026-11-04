import effort = require('../../js/core/effort.js');
const result = effort.effort({sport:'running',profile:'running',unit:'km',val:5,details:{duration:30,bio:{rpe:6,sleep:8},note:"source metadata",client_event_id:"synthetic"}});
const xp: number = result.xp;
const minutes: number = result.minutes;
const estimated: boolean = result.estimated;
const rpe: number | null = result.rpe;
const level: number = effort.levelFromTotal(3000).level;
const rank: string = effort.rank(level).id;
const next: string | undefined = effort.nextRank(level)?.name;
const browserXp: number = globalThis.TitanEffort.effort().xp;
// These must remain actual type errors: unused expectations fail the check.
// @ts-expect-error XP is a number, never a formatted string or any.
const wrongXp: string = result.xp;
// @ts-expect-error Normalized effort accepts a scalar RPE, not a list.
effort.effort({details:{bio:{rpe:[6]}}});
// @ts-expect-error No invented property on the normalized result.
result.bonusCredits;
// @ts-expect-error A rank lookup returns a rank, never a number or any.
const wrongRank: number = effort.rank(3);
void [xp,minutes,estimated,rpe,rank,next,browserXp,wrongXp,wrongRank];
