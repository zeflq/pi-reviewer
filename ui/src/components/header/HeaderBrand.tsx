interface HeaderBrandProps {
  theme: "dark" | "light";
  onThemeToggle: () => void;
}

export function HeaderBrand({ theme, onThemeToggle }: HeaderBrandProps) {
  return (
    <div id="hdr">
      <h1 id="wordmark">
        <svg id="wordmark-pi" width="18" height="17" viewBox="0 0 479.69892 437.48338" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style={{ display: "inline-block", verticalAlign: "middle" }}>
          <g transform="translate(-1798.4221,-369.84875)">
            <path fillRule="evenodd" d="m 1877.3433,369.84874 v 218.73704 109.76229 h -0.5302 -24.985 -53.1131 v 54.19049 54.00032 h 1.0485 v 0.19327 h 51.0166 26.033 1.0485 v -0.18035 h 106.8586 V 704.96317 c -0.043,-0.049 -0.069,-0.10972 -0.069,-0.17622 v -116.20117 -0.29611 c 0,-0.066 0.026,-0.12731 0.069,-0.17621 V 479.22191 478.4416 h 107.3681 v 0.78031 108.58355 0.78032 l -0.2723,0.19275 c 0.1469,-0.1014 0.3411,0.13026 0.3411,0.29146 v 116.49728 c 0,0.065 -0.026,0.1272 -0.069,0.1757 v 101.58915 h 107.3774 v -0.37672 h 0.5571 v 0.19275 h 51.0165 26.0331 0.9012 0.1473 v -53.99722 -54.38635 h -0.1473 -0.9012 -24.9851 -52.6216 V 587.80546 369.84874 Z m -78.9213,105.35688 v 108.38356 h 49.5841 26.033 1.0485 v -53.99722 -54.38634 h -1.0485 -24.985 z m 403.4069,0 v 54.19049 53.9998 h 1.0485 v 0.19327 h 51.0165 24.0797 V 475.20562 h -23.0317 z" />
          </g>
        </svg>
        {" "}
        <span>Review</span>
        <span id="wordmark-version">v{__APP_VERSION__}</span>
      </h1>
      <button
        className="icon-btn"
        onClick={onThemeToggle}
        data-tooltip={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        style={{ color: theme === "dark" ? "#f0b429" : "#79c0ff" }}
      >
        {theme === "dark" ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        )}
      </button>
    </div>
  );
}
