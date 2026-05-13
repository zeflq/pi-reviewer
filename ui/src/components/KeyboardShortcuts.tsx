import { useEffect, useRef, useState } from "react";

interface Props {
  onDecide: (idx: number, decision: string, discussText: string) => void;
}

export function KeyboardShortcuts({ onDecide }: Props) {
  const [showCheatsheet, setShowCheatsheet] = useState(false);
  const activeIdxRef = useRef<number | null>(null);

  function setActive(idx: number) {
    const el = document.getElementById(`cmt-${idx}`);
    if (!el) return;

    if (activeIdxRef.current !== null) {
      document.getElementById(`cmt-${activeIdxRef.current}`)?.classList.remove("cc--active");
    }
    activeIdxRef.current = idx;

    const fileBody = el.closest(".file-body");
    const isCollapsed = fileBody?.classList.contains("file-body--collapsed");
    if (isCollapsed) {
      (fileBody?.closest(".fblock")?.querySelector(".fhdr") as HTMLElement | null)?.click();
    }

    const delay = isCollapsed ? 220 : 0;
    setTimeout(() => {
      el.classList.add("cc--active");
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, delay);
  }

  function getOrderedIndices(): number[] {
    return Array.from(document.querySelectorAll<HTMLElement>("[id^='cmt-']"))
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
      .map((el) => parseInt(el.id.replace("cmt-", ""), 10));
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest(".cc")) {
        if (activeIdxRef.current !== null) {
          document.getElementById(`cmt-${activeIdxRef.current}`)?.classList.remove("cc--active");
          activeIdxRef.current = null;
        }
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "?":
          setShowCheatsheet((s) => !s);
          break;
        case "Escape":
          setShowCheatsheet(false);
          break;
        case "j": {
          const ordered = getOrderedIndices();
          if (!ordered.length) break;
          const cur = activeIdxRef.current;
          const pos = cur === null ? -1 : ordered.indexOf(cur);
          const next = ordered[Math.min(pos + 1, ordered.length - 1)];
          setActive(next);
          break;
        }
        case "k": {
          const ordered = getOrderedIndices();
          if (!ordered.length) break;
          const cur = activeIdxRef.current;
          const pos = cur === null ? ordered.length : ordered.indexOf(cur);
          const prev = ordered[Math.max(pos - 1, 0)];
          setActive(prev);
          break;
        }
        case "a": {
          const idx = activeIdxRef.current;
          if (idx !== null) onDecide(idx, "accept", "");
          break;
        }
        case "r": {
          const idx = activeIdxRef.current;
          if (idx !== null) onDecide(idx, "reject", "");
          break;
        }
        case "d": {
          const idx = activeIdxRef.current;
          if (idx !== null) {
            document.getElementById(`cmt-${idx}`)?.querySelector<HTMLButtonElement>(".dbtn-discuss")?.click();
          }
          break;
        }
        case "f":
          document.dispatchEvent(new CustomEvent("pi:open-finish"));
          break;
      }
    }

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onDecide]);

  if (!showCheatsheet) return null;
  return <Cheatsheet onClose={() => setShowCheatsheet(false)} />;
}

function Cheatsheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "?") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const shortcuts = [
    ["j / k", "Next / prev comment"],
    ["a", "Accept"],
    ["r", "Reject"],
    ["d", "Discuss"],
    ["f", "Finish review"],
    ["?", "Close"],
  ];

  return (
    <div className="shortcut-overlay" onClick={onClose}>
      <div className="shortcut-card" onClick={(e) => e.stopPropagation()}>
        <div className="shortcut-title">Keyboard shortcuts</div>
        {shortcuts.map(([key, label]) => (
          <div key={key} className="shortcut-row">
            <kbd>{key}</kbd>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
