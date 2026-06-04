import { PRIORITY_LABELS, movePriority, type PriorityId } from "../priorities";

interface Props {
  priorities: PriorityId[];
  onChange: (p: PriorityId[]) => void;
}

export function PriorityBar({ priorities, onChange }: Props) {
  return (
    <div className="prioritybar">
      <div className="priority-head">
        <span className="priority-title">Your priorities</span>
        <span className="priority-sub">
          rank what matters — advice tilts toward the top, and uses this to spot opportunities when
          the car's clean
        </span>
      </div>
      <ol className="priority-list">
        {priorities.map((id, i) => (
          <li key={id} className={`priority-item ${i === 0 ? "is-top" : ""}`}>
            <span className="priority-rank">{i + 1}</span>
            <span className="priority-label">{PRIORITY_LABELS[id]}</span>
            <span className="priority-moves">
              <button
                aria-label="move up"
                disabled={i === 0}
                onClick={() => onChange(movePriority(priorities, i, -1))}
              >
                ▲
              </button>
              <button
                aria-label="move down"
                disabled={i === priorities.length - 1}
                onClick={() => onChange(movePriority(priorities, i, 1))}
              >
                ▼
              </button>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
