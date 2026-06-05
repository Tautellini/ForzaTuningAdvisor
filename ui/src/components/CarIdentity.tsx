import { carName, classLabel } from "../carDb";
import { DRIVETRAIN } from "../types";
import type { BuildIdentity } from "../garage/model";

/** Car name + build chips — used in the live strip and the garage. */
export function CarIdentity({
  ordinal,
  build,
  size = "sm",
}: {
  ordinal: number;
  build?: BuildIdentity | null;
  size?: "sm" | "lg";
}) {
  return (
    <div className={`carid carid-${size}`}>
      <span className="carid-name">{carName(ordinal)}</span>
      {build && <span className="chip chip-class">{classLabel(build.class, build.pi)}</span>}
      {build && <span className="chip">{DRIVETRAIN[build.drivetrain] ?? "?"}</span>}
    </div>
  );
}
