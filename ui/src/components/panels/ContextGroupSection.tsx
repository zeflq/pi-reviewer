import { ContextFileItem } from "./ContextFileItem";
import type { ContextFile } from "../../types";

interface Props {
  name: string;
  files: ContextFile[];
}

export function ContextGroupSection({ name, files }: Props) {
  return (
    <div className="ctx-group">
      <div className="ctx-group-name">{name}</div>
      {files.map(f => (
        <ContextFileItem key={f.path} path={f.path} content={f.content} />
      ))}
    </div>
  );
}
