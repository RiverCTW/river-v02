import { useAppStore } from "../store/useAppStore";

export function Toast() {
  const toast = useAppStore((state) => state.toast);
  if (!toast) return null;
  return (
    <div className={`river-toast ${toast.type === "error" ? "error" : ""}`} role="status">
      {toast.message}
    </div>
  );
}
