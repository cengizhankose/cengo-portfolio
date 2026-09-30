import { useEffect, useState } from "react";
import { WiMoonAltWaningCrescent4 } from "react-icons/wi";

// Only "light" switches the palette; anything else (a missing key, or the
// "null" string older visits stored) renders the dark :root tokens.
// Normalising here keeps aria-pressed true to what is on screen. The full
// initialiser (system preference, no flash) replaces this in FE-08/DSG-15.
const readStoredTheme = () =>
  localStorage.getItem("theme") === "light" ? "light" : "dark";

// Toggle button (DSG-02/FE-02): the name stays fixed and aria-pressed carries
// the state, so a screen reader announces "Dark theme, toggle button, pressed".
const Themetoggle = () => {
  const [theme, settheme] = useState(readStoredTheme);
  const themetoggle = () => {
    settheme(theme === "dark" ? "light" : "dark");
  };
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);
  return (
    <button
      type="button"
      className="nav_ac theme-toggle"
      aria-label="Dark theme"
      aria-pressed={theme === "dark"}
      onClick={themetoggle}
    >
      <WiMoonAltWaningCrescent4 aria-hidden="true" focusable="false" />
    </button>
  );
};

export default Themetoggle;
