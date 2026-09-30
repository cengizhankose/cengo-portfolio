import { useEffect } from "react";
import { WiMoonAltWaningCrescent4 } from "react-icons/wi";
import {
  applyTheme,
  followSystemTheme,
  getTheme,
  setTheme,
  useTheme,
} from "../../lib/theme";

// Toggle button (DSG-02/FE-02): the name stays fixed and aria-pressed carries
// the state, so a screen reader announces "Dark theme, toggle button, pressed".
//
// The theme comes from src/lib/theme.js (FE-08/DSG-15, K-10). The head script
// in index.html applies it before the first paint. Nothing is stored until
// the visitor clicks, so an untouched visitor keeps following the system.
const Themetoggle = () => {
  const theme = useTheme();

  useEffect(() => {
    // For a page where the head script did not run (e.g. blocked by CSP):
    // put the resolved theme on <html> without persisting it.
    applyTheme(getTheme());
    return followSystemTheme();
  }, []);

  const toggle = () => setTheme(theme === "dark" ? "light" : "dark");

  return (
    <button
      type="button"
      className="nav_ac theme-toggle"
      aria-label="Dark theme"
      aria-pressed={theme === "dark"}
      onClick={toggle}
    >
      <WiMoonAltWaningCrescent4 aria-hidden="true" focusable="false" />
    </button>
  );
};

export default Themetoggle;
