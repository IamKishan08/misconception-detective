/** Groups learners by likely misconception for the teacher overview. Pure: no storage, no I/O. */
import type { AttemptRecord, FamilyStatus, LearnerState } from './progression.js';
import { FAMILY_ORDER, type FamilyId } from './types.js';

export interface TeacherLearner {
  readonly id: string;
  readonly displayName: string;
  readonly sample: boolean;
  readonly state: LearnerState;
}

export interface LearnerEvidence {
  readonly learnerId: string;
  readonly displayName: string;
  readonly sample: boolean;
  readonly status: FamilyStatus;
  /** What was actually observed: every answer in this family, including follow-ups and transfers. */
  readonly observed: readonly AttemptRecord[];
}

export interface FamilyGroup {
  readonly family: FamilyId;
  /** Status 'likely' or 'possible': these learners may need the reteach activity. */
  readonly needsReteach: readonly LearnerEvidence[];
  readonly improving: readonly LearnerEvidence[];
  readonly secureCount: number;
}

const RETEACH: readonly FamilyStatus[] = ['likely', 'possible'];

export function groupByFamily(learners: readonly TeacherLearner[]): FamilyGroup[] {
  return FAMILY_ORDER.map((family) => {
    const evidence = learners.map((l): LearnerEvidence => ({
      learnerId: l.id,
      displayName: l.displayName,
      sample: l.sample,
      status: l.state.families[family].status,
      observed: l.state.families[family].attempts,
    }));
    return {
      family,
      // Strongest evidence first.
      needsReteach: evidence.filter((e) => RETEACH.includes(e.status)).sort((a, b) => RETEACH.indexOf(a.status) - RETEACH.indexOf(b.status)),
      improving: evidence.filter((e) => e.status === 'improving'),
      secureCount: evidence.filter((e) => e.status === 'secure').length,
    };
  });
}
