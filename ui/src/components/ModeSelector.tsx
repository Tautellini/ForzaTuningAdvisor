import { DISCIPLINES, type DisciplineId, type DisciplineProfile } from "../discipline";

interface Props {
  active: DisciplineId;
  onChange: (id: DisciplineId) => void;
  profile: DisciplineProfile;
}

export function ModeSelector({ active, onChange, profile }: Props) {
  return (
    <div className="modebar">
      <div className="modetabs" role="tablist">
        {DISCIPLINES.map((d) => (
          <button
            key={d.id}
            role="tab"
            aria-selected={d.id === active}
            className={`modetab ${d.id === active ? "active" : ""}`}
            onClick={() => onChange(d.id)}
          >
            {d.label}
          </button>
        ))}
      </div>
      <p className="mode-blurb">{profile.blurb}</p>
    </div>
  );
}
