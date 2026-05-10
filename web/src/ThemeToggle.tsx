import { useTheme, type ThemePreference } from "./themeContext";

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  return (
    <label className="row theme-pref-label" style={{ gap: 8 }}>
      <span className="muted" style={{ fontSize: 13 }}>
        Theme
      </span>
      <select
        className="theme-pref-select"
        value={preference}
        onChange={(e) => setPreference(e.target.value as ThemePreference)}
        title="System follows light/dark mode of your OS"
        aria-label="Theme"
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
