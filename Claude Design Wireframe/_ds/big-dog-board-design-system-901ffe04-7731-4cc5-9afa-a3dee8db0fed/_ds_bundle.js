/* @ds-bundle: {"format":3,"namespace":"DesignSystem_901ffe","components":[{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Chip","sourcePath":"components/core/Chip.jsx"},{"name":"Field","sourcePath":"components/core/Field.jsx"},{"name":"NavItem","sourcePath":"components/core/NavItem.jsx"},{"name":"Panel","sourcePath":"components/core/Panel.jsx"},{"name":"ToolButton","sourcePath":"components/core/ToolButton.jsx"},{"name":"ToolCard","sourcePath":"components/core/ToolCard.jsx"}],"sourceHashes":{"components/core/Button.jsx":"f5fb8b052be4","components/core/Chip.jsx":"e6819f4a3805","components/core/Field.jsx":"116e5c174fc1","components/core/NavItem.jsx":"5f697ad80325","components/core/Panel.jsx":"96460fc8399a","components/core/ToolButton.jsx":"862cfa961cdf","components/core/ToolCard.jsx":"589c5360e4f7","guidelines/tweaks-panel.jsx":"6591467622ed","ui_kits/big_dog_board/App.jsx":"186c06ce6175","ui_kits/big_dog_board/HomeScreen.jsx":"043fbb66fe8c","ui_kits/big_dog_board/ManipulativesScreen.jsx":"738295fa913e","ui_kits/big_dog_board/NumberLineScreen.jsx":"2d258c31d8de","ui_kits/big_dog_board/Shell.jsx":"b5b01c4df904","ui_kits/big_dog_board/WarmUpScreen.jsx":"9028894d341e","ui_kits/big_dog_board/WhiteboardScreen.jsx":"ee273a6620cc"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.DesignSystem_901ffe = window.DesignSystem_901ffe || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Big Dog Board buttons (warm edition) — rounded, soft, flat-color fills.
   Variants: primary (dark), brand (yellow), action (blue), soft (white card),
   ghost, danger. Hover darkens; press nudges 1px. */
const CSS = `
.bdb-btn{font-family:var(--font-body);font-weight:600;display:inline-flex;align-items:center;
  justify-content:center;gap:8px;border:0;cursor:pointer;border-radius:var(--radius-md);white-space:nowrap;
  line-height:1;transition:background var(--dur-fast) var(--ease-standard),
  box-shadow var(--dur-fast),transform var(--dur-fast),filter var(--dur-fast);text-decoration:none;
  font-size:var(--fs-sm);padding:0 18px;height:42px;}
.bdb-btn:active{transform:translateY(1px);}
.bdb-btn:focus-visible{outline:none;box-shadow:0 0 0 3px var(--focus-ring);}
.bdb-btn--primary{background:var(--ink-900);color:#fff;}
.bdb-btn--primary:hover{background:#000;}
.bdb-btn--brand{background:var(--yellow-500);color:var(--ink-900);font-weight:700;}
.bdb-btn--brand:hover{background:var(--yellow-400);}
.bdb-btn--action{background:var(--blue-500);color:#fff;font-weight:700;}
.bdb-btn--action:hover{background:var(--blue-600);}
.bdb-btn--danger{background:var(--red-500);color:#fff;font-weight:700;}
.bdb-btn--danger:hover{background:var(--red-600);}
.bdb-btn--soft{background:#fff;color:var(--ink-900);box-shadow:inset 0 0 0 1px var(--line);}
.bdb-btn--soft:hover{background:var(--ink-100);}
.bdb-btn--ghost{background:transparent;color:var(--ink-700);}
.bdb-btn--ghost:hover{background:var(--ink-200);}
.bdb-btn--lg{height:52px;font-size:var(--fs-body);padding:0 26px;font-weight:700;border-radius:var(--radius-md);}
.bdb-btn--sm{height:34px;font-size:var(--fs-xs);padding:0 14px;border-radius:var(--radius-sm);}
.bdb-btn--block{width:100%;}
.bdb-btn:disabled{opacity:.45;cursor:not-allowed;transform:none;}
`;
if (typeof document !== 'undefined' && !document.getElementById('bdb-btn-css')) {
  const s = document.createElement('style');
  s.id = 'bdb-btn-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/* Back-compat: map retired variant names to the new set. */
const ALIAS = {
  ink: 'primary',
  outline: 'soft',
  'outline-ink': 'soft'
};
function Button({
  variant = 'action',
  size = 'md',
  block = false,
  disabled = false,
  iconLeft,
  iconRight,
  as = 'button',
  className = '',
  children,
  ...rest
}) {
  const v = ALIAS[variant] || variant;
  const cls = ['bdb-btn', `bdb-btn--${v}`, size !== 'md' && `bdb-btn--${size}`, block && 'bdb-btn--block', className].filter(Boolean).join(' ');
  const Tag = as;
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: cls,
    disabled: Tag === 'button' ? disabled : undefined,
    "aria-disabled": disabled || undefined
  }, rest), iconLeft, children && /*#__PURE__*/React.createElement("span", null, children), iconRight);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Chip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Chip (warm edition) — rounded status pill. Flat-hue tint background with a
   solid colored dot and strong colored label. Not pastel: uses the regular
   flat color family. Set solid for a filled chip. */
const TONES = {
  ink: ['var(--ink-200)', 'var(--ink-700)', 'var(--ink-500)'],
  yellow: ['var(--yellow-100)', 'var(--yellow-700)', 'var(--yellow-500)'],
  blue: ['var(--blue-100)', 'var(--blue-700)', 'var(--blue-500)'],
  green: ['var(--green-100)', 'var(--green-700)', 'var(--green-500)'],
  orange: ['var(--orange-100)', 'var(--orange-700)', 'var(--orange-500)'],
  red: ['var(--red-100)', 'var(--red-700)', 'var(--red-500)'],
  violet: ['var(--violet-100)', 'var(--violet-700)', 'var(--violet-500)'],
  /* legacy aliases */
  amber: ['var(--yellow-100)', 'var(--yellow-700)', 'var(--yellow-500)'],
  cyan: ['var(--blue-100)', 'var(--blue-700)', 'var(--blue-500)']
};
function Chip({
  tone = 'blue',
  dot = false,
  solid = false,
  children,
  className = '',
  style = {},
  ...rest
}) {
  const [bg, fg, accent] = TONES[tone] || TONES.blue;
  return /*#__PURE__*/React.createElement("span", _extends({
    className: className,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height: 24,
      padding: '0 10px',
      background: solid ? accent : bg,
      color: solid ? '#fff' : fg,
      fontFamily: 'var(--font-body)',
      fontWeight: 700,
      fontSize: 'var(--fs-chip)',
      lineHeight: 1,
      borderRadius: 'var(--radius-sm)',
      ...style
    }
  }, rest), dot && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: 999,
      background: solid ? '#fff' : accent
    }
  }), children);
}
Object.assign(__ds_scope, { Chip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Chip.jsx", error: String((e && e.message) || e) }); }

// components/core/Field.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Field (warm edition) — labeled input. Rounded sunk well, soft inset border,
   blue focus ring. Uppercase tracked label above. */
const CSS = `
.bdb-field{font-family:var(--font-body);display:block;}
.bdb-field__lbl{display:block;font-weight:600;font-size:var(--fs-label);letter-spacing:var(--ls-label);
  text-transform:uppercase;color:var(--ink-500);margin-bottom:8px;}
.bdb-field__well{position:relative;height:44px;background:var(--ink-100);border-radius:var(--radius-md);
  box-shadow:inset 0 0 0 1px var(--line);transition:box-shadow var(--dur-fast),background var(--dur-fast);}
.bdb-field__input{width:100%;height:100%;border:0;outline:none;background:transparent;
  font-family:var(--font-body);font-weight:500;font-size:var(--fs-sm);color:var(--ink-900);
  padding:0 16px;border-radius:var(--radius-md);}
.bdb-field__input::placeholder{color:var(--ink-400);}
.bdb-field__well:focus-within{background:#fff;box-shadow:inset 0 0 0 2px var(--blue-500),0 0 0 3px var(--focus-ring);}
.bdb-field--accent .bdb-field__bar{position:absolute;left:0;top:8px;bottom:8px;width:3px;border-radius:999px;}
.bdb-field--accent .bdb-field__input{padding-left:18px;}
`;
if (typeof document !== 'undefined' && !document.getElementById('bdb-field-css')) {
  const s = document.createElement('style');
  s.id = 'bdb-field-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
const TONES = {
  blue: 'var(--blue-500)',
  green: 'var(--green-500)',
  red: 'var(--red-500)',
  violet: 'var(--violet-500)',
  yellow: 'var(--yellow-500)',
  orange: 'var(--orange-500)',
  amber: 'var(--yellow-500)',
  none: null
};
function Field({
  label,
  accent = 'none',
  id,
  className = '',
  style = {},
  ...rest
}) {
  const fid = id || `bdb-${Math.random().toString(36).slice(2, 8)}`;
  const bar = TONES[accent];
  return /*#__PURE__*/React.createElement("label", {
    className: `bdb-field ${bar ? 'bdb-field--accent' : ''} ${className}`,
    htmlFor: fid,
    style: style
  }, label && /*#__PURE__*/React.createElement("span", {
    className: "bdb-field__lbl"
  }, label), /*#__PURE__*/React.createElement("span", {
    className: "bdb-field__well"
  }, bar && /*#__PURE__*/React.createElement("span", {
    className: "bdb-field__bar",
    style: {
      background: bar
    }
  }), /*#__PURE__*/React.createElement("input", _extends({
    id: fid,
    className: "bdb-field__input"
  }, rest))));
}
Object.assign(__ds_scope, { Field });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Field.jsx", error: String((e && e.message) || e) }); }

// components/core/NavItem.jsx
try { (() => {
/* NavItem (warm edition) — rounded left-rail pill. Active = soft yellow fill,
   yellow dot, ink label. Idle = muted label, transparent, warm hover. */
function NavItem({
  label,
  active = false,
  icon,
  onClick,
  className = ''
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    className: className,
    style: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      width: '100%',
      textAlign: 'left',
      border: 0,
      cursor: 'pointer',
      borderRadius: 'var(--radius-md)',
      background: active ? 'var(--yellow-100)' : 'transparent',
      height: 42,
      padding: '0 14px',
      margin: '0 0 4px',
      fontFamily: 'var(--font-body)',
      fontWeight: active ? 700 : 500,
      fontSize: 'var(--fs-sm)',
      color: active ? 'var(--ink-900)' : 'var(--ink-500)',
      transition: 'background var(--dur-fast), color var(--dur-fast)'
    },
    onMouseEnter: e => {
      if (!active) e.currentTarget.style.background = 'var(--ink-100)';
    },
    onMouseLeave: e => {
      if (!active) e.currentTarget.style.background = 'transparent';
    }
  }, icon !== undefined ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      flex: 'none',
      color: active ? 'var(--yellow-600)' : 'var(--ink-400)'
    }
  }, icon) : /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: 999,
      flex: 'none',
      background: active ? 'var(--yellow-500)' : 'var(--ink-300)'
    }
  }), label);
}
Object.assign(__ds_scope, { NavItem });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/NavItem.jsx", error: String((e && e.message) || e) }); }

// components/core/Panel.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Panel (warm edition) — rounded white card with soft elevation. Optional
   colored TOP accent strip (rounded) keyed to a flat hue. The primary
   content container. */
const TONES = {
  none: null,
  yellow: 'var(--yellow-500)',
  blue: 'var(--blue-500)',
  green: 'var(--green-500)',
  orange: 'var(--orange-500)',
  red: 'var(--red-500)',
  violet: 'var(--violet-500)',
  ink: 'var(--ink-900)',
  /* legacy aliases */amber: 'var(--yellow-500)',
  cyan: 'var(--blue-500)'
};
function Panel({
  accent = 'none',
  border = 'none',
  padding = 24,
  title,
  subtitle,
  className = '',
  style = {},
  children,
  ...rest
}) {
  const bar = TONES[accent];
  const ring = border === 'hairline' ? 'inset 0 0 0 1px var(--line)' : border === 'strong' ? 'inset 0 0 0 1px var(--line-strong)' : null;
  const shadow = ['var(--shadow-card)', ring].filter(Boolean).join(', ');
  return /*#__PURE__*/React.createElement("div", _extends({
    className: className,
    style: {
      position: 'relative',
      background: '#fff',
      borderRadius: 'var(--radius-lg)',
      boxShadow: shadow,
      padding,
      paddingTop: bar ? padding + 4 : padding,
      overflow: 'hidden',
      ...style
    }
  }, rest), bar && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 4,
      background: bar
    }
  }), title && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 'var(--fs-title)',
      color: 'var(--ink-900)',
      lineHeight: 1.15,
      letterSpacing: 'var(--ls-tight)'
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-xs)',
      color: 'var(--ink-500)',
      marginTop: 6
    }
  }, subtitle), (title || subtitle) && children ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16
    }
  }, children) : children);
}
Object.assign(__ds_scope, { Panel });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Panel.jsx", error: String((e && e.message) || e) }); }

// components/core/ToolButton.jsx
try { (() => {
/* ToolButton (warm edition) — rounded 40px tool-rail button.
   Active = ink fill, white glyph. Idle = white, soft border, ink glyph. */
function ToolButton({
  active = false,
  label,
  title,
  onClick,
  className = '',
  style = {}
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    title: title || label,
    "aria-label": title || label,
    className: className,
    style: {
      width: 40,
      height: 40,
      borderRadius: 'var(--radius-md)',
      cursor: 'pointer',
      flex: 'none',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: active ? 'var(--ink-900)' : '#fff',
      color: active ? '#fff' : 'var(--ink-700)',
      boxShadow: active ? 'var(--shadow-sm)' : 'inset 0 0 0 1px var(--line)',
      fontFamily: 'var(--font-body)',
      fontWeight: 600,
      fontSize: 'var(--fs-chip)',
      transition: 'background var(--dur-fast), box-shadow var(--dur-fast)',
      ...style
    }
  }, label);
}
Object.assign(__ds_scope, { ToolButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/ToolButton.jsx", error: String((e && e.message) || e) }); }

// components/core/ToolCard.jsx
try { (() => {
/* ToolCard (warm edition) — rounded launcher tile. White card with soft
   elevation, a flat-color icon chip, title + meta, and a colored "Open" link.
   `tone` keys the icon chip + accents to a flat hue. */
const TONES = {
  blue: ['var(--blue-500)', 'var(--blue-100)'],
  green: ['var(--green-500)', 'var(--green-100)'],
  violet: ['var(--violet-500)', 'var(--violet-100)'],
  red: ['var(--red-500)', 'var(--red-100)'],
  orange: ['var(--orange-500)', 'var(--orange-100)'],
  yellow: ['var(--yellow-500)', 'var(--yellow-100)'],
  ink: ['var(--ink-900)', 'var(--ink-200)'],
  amber: ['var(--yellow-500)', 'var(--yellow-100)']
};
function ToolCard({
  tone = 'blue',
  label,
  meta,
  icon,
  onOpen,
  className = '',
  style = {}
}) {
  const [color, tint] = TONES[tone] || TONES.blue;
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    onClick: onOpen,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      position: 'relative',
      background: '#fff',
      height: 156,
      padding: 22,
      borderRadius: 'var(--radius-lg)',
      cursor: onOpen ? 'pointer' : 'default',
      boxShadow: hover ? 'var(--shadow-lg)' : 'var(--shadow-card)',
      transform: hover ? 'translateY(-2px)' : 'none',
      transition: 'box-shadow var(--dur-base), transform var(--dur-base)',
      display: 'flex',
      flexDirection: 'column',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44,
      height: 44,
      borderRadius: 'var(--radius-md)',
      background: tint,
      color,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 'none',
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 20
    }
  }, icon || (label ? label[0] : '')), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 'var(--fs-title)',
      color: 'var(--ink-900)',
      letterSpacing: 'var(--ls-tight)',
      marginTop: 14
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-xs)',
      color: 'var(--ink-500)',
      marginTop: 4,
      lineHeight: 1.4
    }
  }, meta), /*#__PURE__*/React.createElement("span", {
    style: {
      marginTop: 'auto',
      color,
      fontWeight: 700,
      fontSize: 'var(--fs-xs)'
    }
  }, "Open \u2192"));
}
Object.assign(__ds_scope, { ToolCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/ToolCard.jsx", error: String((e && e.message) || e) }); }

// guidelines/tweaks-panel.jsx
try { (() => {
// @ds-adherence-ignore -- omelette starter scaffold (raw elements/hex/px by design)

/* BEGIN USAGE */
// tweaks-panel.jsx
// Reusable Tweaks shell + form-control helpers.
// Exports (to window): useTweaks, TweaksPanel, TweakSection, TweakRow, TweakSlider,
//   TweakToggle, TweakRadio, TweakSelect, TweakText, TweakNumber, TweakColor, TweakButton.
//
// Owns the host protocol (listens for __activate_edit_mode / __deactivate_edit_mode,
// posts __edit_mode_available / __edit_mode_set_keys / __edit_mode_dismissed) so
// individual prototypes don't re-roll it. Ships a consistent set of controls so you
// don't hand-draw <input type="range">, segmented radios, steppers, etc.
//
// Usage (in an HTML file that loads React + Babel):
//
//   const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
//     "primaryColor": "#D97757",
//     "palette": ["#D97757", "#29261b", "#f6f4ef"],
//     "fontSize": 16,
//     "density": "regular",
//     "dark": false
//   }/*EDITMODE-END*/;
//
//   function App() {
//     const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
//     return (
//       <div style={{ fontSize: t.fontSize, color: t.primaryColor }}>
//         Hello
//         <TweaksPanel>
//           <TweakSection label="Typography" />
//           <TweakSlider label="Font size" value={t.fontSize} min={10} max={32} unit="px"
//                        onChange={(v) => setTweak('fontSize', v)} />
//           <TweakRadio  label="Density" value={t.density}
//                        options={['compact', 'regular', 'comfy']}
//                        onChange={(v) => setTweak('density', v)} />
//           <TweakSection label="Theme" />
//           <TweakColor  label="Primary" value={t.primaryColor}
//                        options={['#D97757', '#2A6FDB', '#1F8A5B', '#7A5AE0']}
//                        onChange={(v) => setTweak('primaryColor', v)} />
//           <TweakColor  label="Palette" value={t.palette}
//                        options={[['#D97757', '#29261b', '#f6f4ef'],
//                                  ['#475569', '#0f172a', '#f1f5f9']]}
//                        onChange={(v) => setTweak('palette', v)} />
//           <TweakToggle label="Dark mode" value={t.dark}
//                        onChange={(v) => setTweak('dark', v)} />
//         </TweaksPanel>
//       </div>
//     );
//   }
//
// TweakRadio is the segmented control for 2–3 short options (auto-falls-back to
// TweakSelect past ~16/~10 chars per label); reach for TweakSelect directly when
// options are many or long. For color tweaks always curate 3-4 options rather than
// a free picker; an option can also be a whole 2–5 color palette (the stored value
// is the array). The Tweak* controls are a floor, not a ceiling — build custom
// controls inside the panel if a tweak calls for UI they don't cover.
/* END USAGE */
// ─────────────────────────────────────────────────────────────────────────────

const __TWEAKS_STYLE = `
  .twk-panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:280px;
    max-height:calc(100vh - 32px);display:flex;flex-direction:column;
    transform:scale(var(--dc-inv-zoom,1));transform-origin:bottom right;
    background:rgba(250,249,247,.78);color:#29261b;
    -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
    border:.5px solid rgba(255,255,255,.6);border-radius:14px;
    box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.18);
    font:11.5px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:10px 8px 10px 14px;cursor:move;user-select:none}
  .twk-hd b{font-size:12px;font-weight:600;letter-spacing:.01em}
  .twk-x{appearance:none;border:0;background:transparent;color:rgba(41,38,27,.55);
    width:22px;height:22px;border-radius:6px;cursor:default;font-size:13px;line-height:1}
  .twk-x:hover{background:rgba(0,0,0,.06);color:#29261b}
  .twk-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:10px;
    overflow-y:auto;overflow-x:hidden;min-height:0;
    scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.15) transparent}
  .twk-body::-webkit-scrollbar{width:8px}
  .twk-body::-webkit-scrollbar-track{background:transparent;margin:2px}
  .twk-body::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:4px;
    border:2px solid transparent;background-clip:content-box}
  .twk-body::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,.25);
    border:2px solid transparent;background-clip:content-box}
  .twk-row{display:flex;flex-direction:column;gap:5px}
  .twk-row-h{flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
  .twk-lbl{display:flex;justify-content:space-between;align-items:baseline;
    color:rgba(41,38,27,.72)}
  .twk-lbl>span:first-child{font-weight:500}
  .twk-val{color:rgba(41,38,27,.5);font-variant-numeric:tabular-nums}

  .twk-sect{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
    color:rgba(41,38,27,.45);padding:10px 0 0}
  .twk-sect:first-child{padding-top:0}

  .twk-field{appearance:none;box-sizing:border-box;width:100%;min-width:0;height:26px;padding:0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;
    background:rgba(255,255,255,.6);color:inherit;font:inherit;outline:none}
  .twk-field:focus{border-color:rgba(0,0,0,.25);background:rgba(255,255,255,.85)}
  select.twk-field{padding-right:22px;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='rgba(0,0,0,.5)' d='M0 0h10L5 6z'/></svg>");
    background-repeat:no-repeat;background-position:right 8px center}

  .twk-slider{appearance:none;-webkit-appearance:none;width:100%;height:4px;margin:6px 0;
    border-radius:999px;background:rgba(0,0,0,.12);outline:none}
  .twk-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;
    width:14px;height:14px;border-radius:50%;background:#fff;
    border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}
  .twk-slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;
    background:#fff;border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}

  .twk-seg{position:relative;display:flex;padding:2px;border-radius:8px;
    background:rgba(0,0,0,.06);user-select:none}
  .twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:6px;
    background:rgba(255,255,255,.9);box-shadow:0 1px 2px rgba(0,0,0,.12);
    transition:left .15s cubic-bezier(.3,.7,.4,1),width .15s}
  .twk-seg.dragging .twk-seg-thumb{transition:none}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;
    background:transparent;color:inherit;font:inherit;font-weight:500;min-height:22px;
    border-radius:6px;cursor:default;padding:4px 6px;line-height:1.2;
    overflow-wrap:anywhere}

  .twk-toggle{position:relative;width:32px;height:18px;border:0;border-radius:999px;
    background:rgba(0,0,0,.15);transition:background .15s;cursor:default;padding:0}
  .twk-toggle[data-on="1"]{background:#34c759}
  .twk-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
    background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
  .twk-toggle[data-on="1"] i{transform:translateX(14px)}

  .twk-num{display:flex;align-items:center;box-sizing:border-box;min-width:0;height:26px;padding:0 0 0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;background:rgba(255,255,255,.6)}
  .twk-num-lbl{font-weight:500;color:rgba(41,38,27,.6);cursor:ew-resize;
    user-select:none;padding-right:8px}
  .twk-num input{flex:1;min-width:0;height:100%;border:0;background:transparent;
    font:inherit;font-variant-numeric:tabular-nums;text-align:right;padding:0 8px 0 0;
    outline:none;color:inherit;-moz-appearance:textfield}
  .twk-num input::-webkit-inner-spin-button,.twk-num input::-webkit-outer-spin-button{
    -webkit-appearance:none;margin:0}
  .twk-num-unit{padding-right:8px;color:rgba(41,38,27,.45)}

  .twk-btn{appearance:none;height:26px;padding:0 12px;border:0;border-radius:7px;
    background:rgba(0,0,0,.78);color:#fff;font:inherit;font-weight:500;cursor:default}
  .twk-btn:hover{background:rgba(0,0,0,.88)}
  .twk-btn.secondary{background:rgba(0,0,0,.06);color:inherit}
  .twk-btn.secondary:hover{background:rgba(0,0,0,.1)}

  .twk-swatch{appearance:none;-webkit-appearance:none;width:56px;height:22px;
    border:.5px solid rgba(0,0,0,.1);border-radius:6px;padding:0;cursor:default;
    background:transparent;flex-shrink:0}
  .twk-swatch::-webkit-color-swatch-wrapper{padding:0}
  .twk-swatch::-webkit-color-swatch{border:0;border-radius:5.5px}
  .twk-swatch::-moz-color-swatch{border:0;border-radius:5.5px}

  .twk-chips{display:flex;gap:6px}
  .twk-chip{position:relative;appearance:none;flex:1;min-width:0;height:46px;
    padding:0;border:0;border-radius:6px;overflow:hidden;cursor:default;
    box-shadow:0 0 0 .5px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.06);
    transition:transform .12s cubic-bezier(.3,.7,.4,1),box-shadow .12s}
  .twk-chip:hover{transform:translateY(-1px);
    box-shadow:0 0 0 .5px rgba(0,0,0,.18),0 4px 10px rgba(0,0,0,.12)}
  .twk-chip[data-on="1"]{box-shadow:0 0 0 1.5px rgba(0,0,0,.85),
    0 2px 6px rgba(0,0,0,.15)}
  .twk-chip>span{position:absolute;top:0;bottom:0;right:0;width:34%;
    display:flex;flex-direction:column;box-shadow:-1px 0 0 rgba(0,0,0,.1)}
  .twk-chip>span>i{flex:1;box-shadow:0 -1px 0 rgba(0,0,0,.1)}
  .twk-chip>span>i:first-child{box-shadow:none}
  .twk-chip svg{position:absolute;top:6px;left:6px;width:13px;height:13px;
    filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))}
`;

// ── useTweaks ───────────────────────────────────────────────────────────────
// Single source of truth for tweak values. setTweak persists via the host
// (__edit_mode_set_keys → host rewrites the EDITMODE block on disk).
function useTweaks(defaults) {
  const [values, setValues] = React.useState(defaults);
  // Accepts either setTweak('key', value) or setTweak({ key: value, ... }) so a
  // useState-style call doesn't write a "[object Object]" key into the persisted
  // JSON block.
  const setTweak = React.useCallback((keyOrEdits, val) => {
    const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null ? keyOrEdits : {
      [keyOrEdits]: val
    };
    setValues(prev => ({
      ...prev,
      ...edits
    }));
    window.parent.postMessage({
      type: '__edit_mode_set_keys',
      edits
    }, '*');
    // Same-window signal so in-page listeners (deck-stage rail thumbnails)
    // can react — the parent message only reaches the host, not peers.
    window.dispatchEvent(new CustomEvent('tweakchange', {
      detail: edits
    }));
  }, []);
  return [values, setTweak];
}

// ── TweaksPanel ─────────────────────────────────────────────────────────────
// Floating shell. Registers the protocol listener BEFORE announcing
// availability — if the announce ran first, the host's activate could land
// before our handler exists and the toolbar toggle would silently no-op.
// The close button posts __edit_mode_dismissed so the host's toolbar toggle
// flips off in lockstep; the host echoes __deactivate_edit_mode back which
// is what actually hides the panel.
function TweaksPanel({
  title = 'Tweaks',
  children
}) {
  const [open, setOpen] = React.useState(false);
  const dragRef = React.useRef(null);
  const offsetRef = React.useRef({
    x: 16,
    y: 16
  });
  const PAD = 16;
  const clampToViewport = React.useCallback(() => {
    const panel = dragRef.current;
    if (!panel) return;
    const w = panel.offsetWidth,
      h = panel.offsetHeight;
    const maxRight = Math.max(PAD, window.innerWidth - w - PAD);
    const maxBottom = Math.max(PAD, window.innerHeight - h - PAD);
    offsetRef.current = {
      x: Math.min(maxRight, Math.max(PAD, offsetRef.current.x)),
      y: Math.min(maxBottom, Math.max(PAD, offsetRef.current.y))
    };
    panel.style.right = offsetRef.current.x + 'px';
    panel.style.bottom = offsetRef.current.y + 'px';
  }, []);
  React.useEffect(() => {
    if (!open) return;
    clampToViewport();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', clampToViewport);
      return () => window.removeEventListener('resize', clampToViewport);
    }
    const ro = new ResizeObserver(clampToViewport);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [open, clampToViewport]);
  React.useEffect(() => {
    const onMsg = e => {
      const t = e?.data?.type;
      if (t === '__activate_edit_mode') setOpen(true);else if (t === '__deactivate_edit_mode') setOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({
      type: '__edit_mode_available'
    }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);
  const dismiss = () => {
    setOpen(false);
    window.parent.postMessage({
      type: '__edit_mode_dismissed'
    }, '*');
  };
  const onDragStart = e => {
    const panel = dragRef.current;
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const sx = e.clientX,
      sy = e.clientY;
    const startRight = window.innerWidth - r.right;
    const startBottom = window.innerHeight - r.bottom;
    const move = ev => {
      offsetRef.current = {
        x: startRight - (ev.clientX - sx),
        y: startBottom - (ev.clientY - sy)
      };
      clampToViewport();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  if (!open) return null;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("style", null, __TWEAKS_STYLE), /*#__PURE__*/React.createElement("div", {
    ref: dragRef,
    className: "twk-panel",
    "data-omelette-chrome": "",
    style: {
      right: offsetRef.current.x,
      bottom: offsetRef.current.y
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-hd",
    onMouseDown: onDragStart
  }, /*#__PURE__*/React.createElement("b", null, title), /*#__PURE__*/React.createElement("button", {
    className: "twk-x",
    "aria-label": "Close tweaks",
    onMouseDown: e => e.stopPropagation(),
    onClick: dismiss
  }, "\u2715")), /*#__PURE__*/React.createElement("div", {
    className: "twk-body"
  }, children)));
}

// ── Layout helpers ──────────────────────────────────────────────────────────

function TweakSection({
  label,
  children
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "twk-sect"
  }, label), children);
}
function TweakRow({
  label,
  value,
  children,
  inline = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: inline ? 'twk-row twk-row-h' : 'twk-row'
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-lbl"
  }, /*#__PURE__*/React.createElement("span", null, label), value != null && /*#__PURE__*/React.createElement("span", {
    className: "twk-val"
  }, value)), children);
}

// ── Controls ────────────────────────────────────────────────────────────────

function TweakSlider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
  onChange
}) {
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label,
    value: `${value}${unit}`
  }, /*#__PURE__*/React.createElement("input", {
    type: "range",
    className: "twk-slider",
    min: min,
    max: max,
    step: step,
    value: value,
    onChange: e => onChange(Number(e.target.value))
  }));
}
function TweakToggle({
  label,
  value,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "twk-row twk-row-h"
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-lbl"
  }, /*#__PURE__*/React.createElement("span", null, label)), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "twk-toggle",
    "data-on": value ? '1' : '0',
    role: "switch",
    "aria-checked": !!value,
    onClick: () => onChange(!value)
  }, /*#__PURE__*/React.createElement("i", null)));
}
function TweakRadio({
  label,
  value,
  options,
  onChange
}) {
  const trackRef = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);
  // The active value is read by pointer-move handlers attached for the lifetime
  // of a drag — ref it so a stale closure doesn't fire onChange for every move.
  const valueRef = React.useRef(value);
  valueRef.current = value;

  // Segments wrap mid-word once per-segment width runs out. The track is
  // ~248px (280 panel − 28 body pad − 4 seg pad), each button loses 12px
  // to its own padding, and 11.5px system-ui averages ~6.3px/char — so 2
  // options fit ~16 chars each, 3 fit ~10. Past that (or >3 options), fall
  // back to a dropdown rather than wrap.
  const labelLen = o => String(typeof o === 'object' ? o.label : o).length;
  const maxLen = options.reduce((m, o) => Math.max(m, labelLen(o)), 0);
  const fitsAsSegments = maxLen <= ({
    2: 16,
    3: 10
  }[options.length] ?? 0);
  if (!fitsAsSegments) {
    // <select> emits strings — map back to the original option value so the
    // fallback stays type-preserving (numbers, booleans) like the segment path.
    const resolve = s => {
      const m = options.find(o => String(typeof o === 'object' ? o.value : o) === s);
      return m === undefined ? s : typeof m === 'object' ? m.value : m;
    };
    return /*#__PURE__*/React.createElement(TweakSelect, {
      label: label,
      value: value,
      options: options,
      onChange: s => onChange(resolve(s))
    });
  }
  const opts = options.map(o => typeof o === 'object' ? o : {
    value: o,
    label: o
  });
  const idx = Math.max(0, opts.findIndex(o => o.value === value));
  const n = opts.length;
  const segAt = clientX => {
    const r = trackRef.current.getBoundingClientRect();
    const inner = r.width - 4;
    const i = Math.floor((clientX - r.left - 2) / inner * n);
    return opts[Math.max(0, Math.min(n - 1, i))].value;
  };
  const onPointerDown = e => {
    setDragging(true);
    const v0 = segAt(e.clientX);
    if (v0 !== valueRef.current) onChange(v0);
    const move = ev => {
      if (!trackRef.current) return;
      const v = segAt(ev.clientX);
      if (v !== valueRef.current) onChange(v);
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("div", {
    ref: trackRef,
    role: "radiogroup",
    onPointerDown: onPointerDown,
    className: dragging ? 'twk-seg dragging' : 'twk-seg'
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-seg-thumb",
    style: {
      left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
      width: `calc((100% - 4px) / ${n})`
    }
  }), opts.map(o => /*#__PURE__*/React.createElement("button", {
    key: o.value,
    type: "button",
    role: "radio",
    "aria-checked": o.value === value
  }, o.label))));
}
function TweakSelect({
  label,
  value,
  options,
  onChange
}) {
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("select", {
    className: "twk-field",
    value: value,
    onChange: e => onChange(e.target.value)
  }, options.map(o => {
    const v = typeof o === 'object' ? o.value : o;
    const l = typeof o === 'object' ? o.label : o;
    return /*#__PURE__*/React.createElement("option", {
      key: v,
      value: v
    }, l);
  })));
}
function TweakText({
  label,
  value,
  placeholder,
  onChange
}) {
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("input", {
    className: "twk-field",
    type: "text",
    value: value,
    placeholder: placeholder,
    onChange: e => onChange(e.target.value)
  }));
}
function TweakNumber({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange
}) {
  const clamp = n => {
    if (min != null && n < min) return min;
    if (max != null && n > max) return max;
    return n;
  };
  const startRef = React.useRef({
    x: 0,
    val: 0
  });
  const onScrubStart = e => {
    e.preventDefault();
    startRef.current = {
      x: e.clientX,
      val: value
    };
    const decimals = (String(step).split('.')[1] || '').length;
    const move = ev => {
      const dx = ev.clientX - startRef.current.x;
      const raw = startRef.current.val + dx * step;
      const snapped = Math.round(raw / step) * step;
      onChange(clamp(Number(snapped.toFixed(decimals))));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "twk-num"
  }, /*#__PURE__*/React.createElement("span", {
    className: "twk-num-lbl",
    onPointerDown: onScrubStart
  }, label), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: value,
    min: min,
    max: max,
    step: step,
    onChange: e => onChange(clamp(Number(e.target.value)))
  }), unit && /*#__PURE__*/React.createElement("span", {
    className: "twk-num-unit"
  }, unit));
}

// Relative-luminance contrast pick — checkmarks drawn over a swatch need to
// read on both #111 and #fafafa without per-option configuration. Hex input
// only (#rgb / #rrggbb); named or rgb()/hsl() colors fall through to "light".
function __twkIsLight(hex) {
  const h = String(hex).replace('#', '');
  const x = h.length === 3 ? h.replace(/./g, c => c + c) : h.padEnd(6, '0');
  const n = parseInt(x.slice(0, 6), 16);
  if (Number.isNaN(n)) return true;
  const r = n >> 16 & 255,
    g = n >> 8 & 255,
    b = n & 255;
  return r * 299 + g * 587 + b * 114 > 148000;
}
const __TwkCheck = ({
  light
}) => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 14 14",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M3 7.2 5.8 10 11 4.2",
  fill: "none",
  strokeWidth: "2.2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  stroke: light ? 'rgba(0,0,0,.78)' : '#fff'
}));

// TweakColor — curated color/palette picker. Each option is either a single
// hex string or an array of 1-5 hex strings; the card adapts — a lone color
// renders solid, a palette renders colors[0] as the hero (left ~2/3) with the
// rest stacked in a sharp column on the right. onChange emits the
// option in the shape it was passed (string stays string, array stays array).
// Without options it falls back to the native color input for back-compat.
function TweakColor({
  label,
  value,
  options,
  onChange
}) {
  if (!options || !options.length) {
    return /*#__PURE__*/React.createElement("div", {
      className: "twk-row twk-row-h"
    }, /*#__PURE__*/React.createElement("div", {
      className: "twk-lbl"
    }, /*#__PURE__*/React.createElement("span", null, label)), /*#__PURE__*/React.createElement("input", {
      type: "color",
      className: "twk-swatch",
      value: value,
      onChange: e => onChange(e.target.value)
    }));
  }
  // Native <input type=color> emits lowercase hex per the HTML spec, so
  // compare case-insensitively. String() guards JSON.stringify(undefined),
  // which returns the primitive undefined (no .toLowerCase).
  const key = o => String(JSON.stringify(o)).toLowerCase();
  const cur = key(value);
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-chips",
    role: "radiogroup"
  }, options.map((o, i) => {
    const colors = Array.isArray(o) ? o : [o];
    const [hero, ...rest] = colors;
    const sup = rest.slice(0, 4);
    const on = key(o) === cur;
    return /*#__PURE__*/React.createElement("button", {
      key: i,
      type: "button",
      className: "twk-chip",
      role: "radio",
      "aria-checked": on,
      "data-on": on ? '1' : '0',
      "aria-label": colors.join(', '),
      title: colors.join(' · '),
      style: {
        background: hero
      },
      onClick: () => onChange(o)
    }, sup.length > 0 && /*#__PURE__*/React.createElement("span", null, sup.map((c, j) => /*#__PURE__*/React.createElement("i", {
      key: j,
      style: {
        background: c
      }
    }))), on && /*#__PURE__*/React.createElement(__TwkCheck, {
      light: __twkIsLight(hero)
    }));
  })));
}
function TweakButton({
  label,
  onClick,
  secondary = false
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: secondary ? 'twk-btn secondary' : 'twk-btn',
    onClick: onClick
  }, label);
}
Object.assign(window, {
  useTweaks,
  TweaksPanel,
  TweakSection,
  TweakRow,
  TweakSlider,
  TweakToggle,
  TweakRadio,
  TweakSelect,
  TweakText,
  TweakNumber,
  TweakColor,
  TweakButton
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "guidelines/tweaks-panel.jsx", error: String((e && e.message) || e) }); }

// ui_kits/big_dog_board/App.jsx
try { (() => {
/* global React */
const TITLES = {
  home: 'Home',
  whiteboard: 'Whiteboard',
  manipulatives: 'Manipulatives',
  warmup: 'Warm-Up Builder',
  numberline: 'Number Line + Timer'
};
function BigDogBoard() {
  const [view, setView] = React.useState('home');
  const go = setView;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      width: 1440,
      height: 980,
      background: 'var(--cream)',
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0,
      background: '#fff',
      borderRadius: 'var(--radius-2xl)',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-lg)'
    }
  }, /*#__PURE__*/React.createElement(window.BDBHeader, {
    title: TITLES[view]
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement(window.BDBLeftNav, {
    active: view,
    go: go
  }), /*#__PURE__*/React.createElement("main", {
    style: {
      flex: 1,
      minWidth: 0,
      padding: '32px 36px',
      overflowY: 'auto',
      background: 'var(--ink-100)'
    }
  }, view === 'home' && /*#__PURE__*/React.createElement(window.BDBHomeScreen, {
    go: go
  }), view === 'whiteboard' && /*#__PURE__*/React.createElement(window.BDBWhiteboardScreen, null), view === 'manipulatives' && /*#__PURE__*/React.createElement(window.BDBManipulativesScreen, null), view === 'warmup' && /*#__PURE__*/React.createElement(window.BDBWarmUpScreen, null), view === 'numberline' && /*#__PURE__*/React.createElement(window.BDBNumberLineScreen, null)))));
}
window.BigDogBoard = BigDogBoard;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/big_dog_board/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/big_dog_board/HomeScreen.jsx
try { (() => {
/* global React */
const {
  ToolCard,
  Panel,
  Chip,
  Button
} = window.DesignSystem_901ffe;
const HOME_TOOLS = [['blue', 'Whiteboard', 'Full-screen canvas, pen, eraser, clear', 'whiteboard'], ['green', 'Algebra Tiles', 'Expression builder, drag, group, simplify', 'manipulatives'], ['violet', 'Fraction Bars', 'Compare equivalent fractions by value', 'manipulatives'], ['red', 'Warm-Up Session', 'Build weekly forms and view responses', 'warmup'], ['orange', 'Number Line', 'Single or double number line workspace', 'numberline'], ['ink', 'Timer', 'Large classroom countdown display', 'numberline']];
function HomeScreen({
  go
}) {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(window.BDBPageHead, {
    title: "Good morning, Mr. Alvarez",
    sub: "Pick a board tool, or jump back into this week's warm-ups."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 18,
      marginBottom: 28
    }
  }, HOME_TOOLS.map(([tone, label, meta, view]) => /*#__PURE__*/React.createElement(ToolCard, {
    key: label,
    tone: tone,
    label: label,
    meta: meta,
    onOpen: () => go(view)
  }))), /*#__PURE__*/React.createElement(Panel, {
    accent: "yellow",
    padding: 28,
    style: {
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 'var(--fs-title)',
      color: 'var(--ink-900)',
      letterSpacing: 'var(--ls-tight)'
    }
  }, "Today"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-sm)',
      color: 'var(--ink-500)',
      margin: '10px 0 16px'
    }
  }, "Warm-up forms ready \xB7 Display mode active \xB7 Student response session idle"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Chip, {
    tone: "green",
    dot: true
  }, "Warm-Up Ready"), /*#__PURE__*/React.createElement(Chip, {
    tone: "blue",
    dot: true
  }, "Responses 0"), /*#__PURE__*/React.createElement(Chip, {
    tone: "orange",
    dot: true
  }, "Timer 05:00"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      flex: 'none'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "soft",
    onClick: () => go('whiteboard')
  }, "Open Display"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    onClick: () => go('warmup')
  }, "Start Session"))));
}
window.BDBHomeScreen = HomeScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/big_dog_board/HomeScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/big_dog_board/ManipulativesScreen.jsx
try { (() => {
/* global React */
const {
  Panel
} = window.DesignSystem_901ffe;
const PALETTE = [['+1', 'green', 78], ['-1', 'red', 78], ['+x', 'blue', 116], ['-x', 'red', 116], ['+x²', 'violet', 142], ['-x²', 'red', 142]];
const TONE = {
  green: 'var(--green-500)',
  red: 'var(--red-500)',
  blue: 'var(--blue-500)',
  violet: 'var(--violet-500)'
};
const FRACTIONS = [['1', 'var(--ink-900)', 600], ['1/2', 'var(--blue-500)', 300], ['1/3', 'var(--green-500)', 200], ['1/4', 'var(--violet-500)', 150], ['1/6', 'var(--yellow-500)', 100], ['1/12', 'var(--red-500)', 50]];
function Tile({
  label,
  tone,
  w,
  h = 44,
  onClick,
  fs = 16
}) {
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    style: {
      width: w,
      height: h,
      background: TONE[tone] || tone,
      color: '#fff',
      borderRadius: 'var(--radius-sm)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingLeft: 18,
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: fs,
      cursor: onClick ? 'pointer' : 'default',
      flex: 'none'
    }
  }, label);
}
function ManipulativesScreen() {
  const [placed, setPlaced] = React.useState([{
    label: '+x',
    tone: 'blue',
    w: 120,
    h: 52,
    fs: 20
  }, {
    label: '-x',
    tone: 'red',
    w: 120,
    h: 52,
    fs: 20
  }, {
    eq: true
  }, {
    label: '+1',
    tone: 'green',
    w: 52,
    h: 52
  }, {
    label: '+1',
    tone: 'green',
    w: 52,
    h: 52
  }]);
  const add = (label, tone, w) => setPlaced(p => [...p, {
    label,
    tone,
    w: Math.min(w, 120),
    h: 52,
    fs: 18
  }]);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20,
      height: '100%'
    }
  }, /*#__PURE__*/React.createElement(Panel, {
    padding: 24,
    style: {
      width: 244,
      flex: 'none'
    },
    title: "Tile Palette",
    subtitle: "Drag or add to workspace"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, PALETTE.map(([label, tone, w]) => /*#__PURE__*/React.createElement("div", {
    key: label,
    style: {
      display: 'flex',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Tile, {
    label: label,
    tone: tone,
    w: w
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => add(label, tone, w),
    "aria-label": 'add ' + label,
    style: {
      width: 44,
      height: 44,
      flex: 'none',
      background: 'var(--ink-100)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'inset 0 0 0 1px var(--line)',
      border: 0,
      cursor: 'pointer',
      fontSize: 22,
      fontWeight: 500,
      color: 'var(--ink-700)'
    }
  }, "+"))))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(Panel, {
    padding: 24,
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-xs)',
      fontWeight: 600,
      color: 'var(--ink-500)',
      marginBottom: 20
    }
  }, "Equation workspace"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      flexWrap: 'wrap'
    }
  }, placed.map((t, i) => t.eq ? /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 56,
      color: 'var(--ink-900)',
      margin: '0 8px'
    }
  }, "=") : /*#__PURE__*/React.createElement(Tile, {
    key: i,
    label: t.label,
    tone: t.tone,
    w: t.w,
    h: t.h,
    fs: t.fs
  })))), /*#__PURE__*/React.createElement(Panel, {
    padding: 24,
    title: "Fraction bars"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, FRACTIONS.map(([label, color, w]) => /*#__PURE__*/React.createElement("div", {
    key: label,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 32,
      fontSize: 12,
      fontWeight: 600,
      color: 'var(--ink-500)',
      flex: 'none'
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: 600,
      height: 16,
      background: 'var(--ink-100)',
      borderRadius: 'var(--radius-pill)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: w,
      height: '100%',
      background: color,
      borderRadius: 'var(--radius-pill)'
    }
  }))))))));
}
window.BDBManipulativesScreen = ManipulativesScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/big_dog_board/ManipulativesScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/big_dog_board/NumberLineScreen.jsx
try { (() => {
/* global React */
const {
  Panel,
  Field,
  Button
} = window.DesignSystem_901ffe;
const TOP = ['0', 'x', '2x', '3x', '4x', '5x'];
const BOTTOM = ['0', '2', '4', '6', '8', '10'];
function NumberLineScreen() {
  const [secs, setSecs] = React.useState(300);
  const [running, setRunning] = React.useState(false);
  React.useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSecs(s => s <= 1 ? (clearInterval(id), 0) : s - 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  const X0 = 76,
    GAP = 108;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(window.BDBPageHead, {
    title: "Ratio and number line display",
    sub: "A controlled board view for pacing, ratios, scale, and equations."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 16,
      alignItems: 'stretch'
    }
  }, /*#__PURE__*/React.createElement(Panel, {
    accent: "yellow",
    padding: 32,
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 'var(--fs-title)',
      color: 'var(--ink-900)',
      letterSpacing: 'var(--ls-tight)'
    }
  }, "Number line"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-2xs)',
      color: 'var(--ink-500)',
      margin: '8px 0 22px'
    }
  }, "Edit labels and tick values for the day's lesson."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 40,
      marginBottom: 36
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "TOP LINE",
    defaultValue: "2x",
    accent: "blue",
    style: {
      width: 150
    }
  }), /*#__PURE__*/React.createElement(Field, {
    label: "BOTTOM LINE",
    defaultValue: "4",
    accent: "green",
    style: {
      width: 150
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      height: 230
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: X0,
      right: 20,
      top: 40,
      height: 2,
      background: 'var(--ink-400)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: X0,
      right: 20,
      bottom: 40,
      height: 2,
      background: 'var(--ink-400)'
    }
  }), TOP.map((t, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: X0 + i * GAP,
      top: 18,
      width: 1,
      height: 46,
      background: 'var(--ink-400)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: X0 + i * GAP - 10,
      top: 0,
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--blue-500)',
      fontFeatureSettings: "'tnum' 1"
    }
  }, t), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: X0 + i * GAP,
      bottom: 18,
      width: 1,
      height: 46,
      background: 'var(--ink-400)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: X0 + i * GAP - 10,
      bottom: 0,
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--green-500)',
      fontFeatureSettings: "'tnum' 1"
    }
  }, BOTTOM[i]))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: X0 + 2 * GAP - 22,
      top: 96,
      background: 'var(--ink-900)',
      color: '#fff',
      fontSize: 14,
      fontWeight: 700,
      padding: '8px 12px',
      borderRadius: 'var(--radius-sm)',
      fontFeatureSettings: "'tnum' 1"
    }
  }, "x=2"))), /*#__PURE__*/React.createElement(Panel, {
    accent: "blue",
    padding: 32,
    style: {
      width: 230,
      flex: 'none',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 'var(--fs-title)',
      color: 'var(--ink-900)',
      letterSpacing: 'var(--ls-tight)'
    }
  }, "Timer"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 58,
      color: 'var(--ink-900)',
      fontFeatureSettings: "'tnum' 1",
      margin: '28px 0 36px',
      letterSpacing: '-.02em'
    }
  }, mm, ":", ss), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    block: true,
    onClick: () => setRunning(r => !r)
  }, running ? 'Pause' : 'Start'), /*#__PURE__*/React.createElement(Button, {
    variant: "soft",
    block: true,
    onClick: () => setRunning(false)
  }, "Pause"), /*#__PURE__*/React.createElement(Button, {
    variant: "soft",
    block: true,
    onClick: () => {
      setRunning(false);
      setSecs(300);
    }
  }, "Reset")))));
}
window.BDBNumberLineScreen = NumberLineScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/big_dog_board/NumberLineScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/big_dog_board/Shell.jsx
try { (() => {
/* global React */
const {
  Button,
  NavItem
} = window.DesignSystem_901ffe;
const NAV = ['Home', 'Whiteboard', 'Manipulatives', 'Warm-Ups', 'Number Line', 'Timer'];
const NAV_VIEW = {
  Home: 'home',
  Whiteboard: 'whiteboard',
  Manipulatives: 'manipulatives',
  'Warm-Ups': 'warmup',
  'Number Line': 'numberline',
  Timer: 'numberline'
};
function Header({
  title
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      height: 76,
      flex: 'none',
      display: 'flex',
      alignItems: 'center',
      padding: '0 28px',
      background: '#fff',
      borderBottom: '1px solid var(--line)'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-wordmark.png",
    alt: "Big Dog Math",
    height: "34"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 20,
      paddingLeft: 20,
      borderLeft: '1px solid var(--line)',
      fontFamily: 'var(--font-body)',
      fontWeight: 500,
      fontSize: 'var(--fs-sm)',
      color: 'var(--ink-500)'
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: 28,
      flex: 1,
      maxWidth: 360,
      height: 42,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '0 16px',
      background: 'var(--ink-100)',
      borderRadius: 'var(--radius-pill)',
      color: 'var(--ink-400)',
      fontSize: 'var(--fs-sm)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 14,
      height: 14,
      borderRadius: 999,
      border: '2px solid var(--ink-400)',
      flex: 'none'
    }
  }), "Search lessons, tools, students\u2026"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: 'auto',
      display: 'flex',
      gap: 12,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "brand",
    style: {
      letterSpacing: '.01em'
    }
  }, "JOIN 4821"), /*#__PURE__*/React.createElement(Button, {
    variant: "soft",
    size: "sm",
    style: {
      height: 42
    }
  }, "Teacher")));
}
function LeftNav({
  active,
  go
}) {
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      width: 244,
      flex: 'none',
      background: '#fff',
      borderRight: '1px solid var(--line)',
      padding: '24px 20px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-label)',
      fontWeight: 600,
      letterSpacing: 'var(--ls-label)',
      textTransform: 'uppercase',
      color: 'var(--ink-400)',
      padding: '0 14px 10px'
    }
  }, "Workspace"), NAV.map(label => /*#__PURE__*/React.createElement(NavItem, {
    key: label,
    label: label,
    active: NAV_VIEW[label] === active && label !== 'Timer',
    onClick: () => go(NAV_VIEW[label])
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'auto',
      background: 'var(--ink-100)',
      borderRadius: 'var(--radius-lg)',
      padding: 18,
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      borderRadius: 999,
      background: 'var(--yellow-100)',
      margin: '0 auto 10px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--yellow-600)',
      fontFamily: 'var(--font-display)',
      fontWeight: 800
    }
  }, "?"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 'var(--fs-sm)',
      color: 'var(--ink-900)'
    }
  }, "Need a hand?"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-2xs)',
      color: 'var(--ink-500)',
      marginTop: 4,
      lineHeight: 1.4
    }
  }, "Browse quick guides for every board tool.")));
}
function PageHead({
  title,
  sub
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 'var(--fs-h1)',
      fontWeight: 800,
      color: 'var(--ink-900)',
      letterSpacing: 'var(--ls-tight)'
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-sm)',
      color: 'var(--ink-500)',
      marginTop: 10
    }
  }, sub));
}
window.BDBHeader = Header;
window.BDBLeftNav = LeftNav;
window.BDBPageHead = PageHead;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/big_dog_board/Shell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/big_dog_board/WarmUpScreen.jsx
try { (() => {
/* global React */
const {
  Panel,
  Field,
  Chip,
  Button
} = window.DesignSystem_901ffe;
const DAYS = [['MONDAY TOPIC', 'Multiplication and whole-number operations'], ['TUESDAY TOPIC', 'Fractions'], ['WEDNESDAY TOPIC', 'Decimals'], ['THURSDAY TOPIC', 'Data and statistics'], ['FRIDAY TOPIC', 'Order of operations']];
const STUDENTS = [['A. Rivera', '2', '56', 'green', 'Received'], ['B. Chen', '2', '15', 'green', 'Received'], ['C. Okafor', '3', '11', 'green', 'Received'], ['D. Martins', '4', '54', 'green', 'Received'], ['E. Singh', '5', '35', 'orange', 'Review']];
function WarmUpScreen() {
  const [built, setBuilt] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(window.BDBPageHead, {
    title: "Weekly warm-up builder",
    sub: "Generate forms once, remake a single day only when needed."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '510px 1fr',
      gap: 16,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement(Panel, {
    accent: "yellow",
    padding: 32
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20,
      marginBottom: 22
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "WEEK",
    defaultValue: "28",
    style: {
      width: 120
    }
  }), /*#__PURE__*/React.createElement(Field, {
    label: "START DATE",
    defaultValue: "08-10-26",
    style: {
      width: 160
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, DAYS.map(([label, val]) => /*#__PURE__*/React.createElement(Field, {
    key: label,
    label: label,
    defaultValue: val,
    accent: "green"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 26
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    block: true,
    onClick: () => setBuilt(true)
  }, built ? 'Forms Built' : 'Build All 5 Forms'))), /*#__PURE__*/React.createElement(Panel, {
    accent: "blue",
    padding: 28
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: 999,
      background: 'var(--green-500)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--fs-xs)',
      fontWeight: 600,
      color: 'var(--ink-500)'
    }
  }, "Live session \xB7 join code 4821")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.6fr .6fr .8fr 90px',
      gap: 8,
      fontSize: 'var(--fs-label)',
      fontWeight: 600,
      letterSpacing: '.06em',
      textTransform: 'uppercase',
      color: 'var(--ink-500)',
      paddingBottom: 12
    }
  }, /*#__PURE__*/React.createElement("span", null, "Name"), /*#__PURE__*/React.createElement("span", null, "Period"), /*#__PURE__*/React.createElement("span", null, "Answer"), /*#__PURE__*/React.createElement("span", null, "Status")), STUDENTS.map(([name, period, ans, tone, status]) => /*#__PURE__*/React.createElement("div", {
    key: name,
    style: {
      display: 'grid',
      gridTemplateColumns: '1.6fr .6fr .8fr 90px',
      gap: 8,
      alignItems: 'center',
      padding: '14px 0',
      borderTop: '1px solid var(--line)',
      fontSize: 'var(--fs-xs)',
      color: 'var(--ink-900)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 500
    }
  }, name), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink-500)'
    }
  }, period), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 600,
      fontFeatureSettings: "'tnum' 1"
    }
  }, ans), /*#__PURE__*/React.createElement(Chip, {
    tone: tone,
    dot: true
  }, status))))));
}
window.BDBWarmUpScreen = WarmUpScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/big_dog_board/WarmUpScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/big_dog_board/WhiteboardScreen.jsx
try { (() => {
/* global React */
const {
  ToolButton,
  Chip
} = window.DesignSystem_901ffe;
const WB_TOOLS = [['Pe', 'Pen'], ['Er', 'Eraser'], ['Li', 'Line'], ['Gr', 'Grid'], ['Un', 'Undo'], ['Cl', 'Clear']];
const WB_COLORS = [['Blue', 'var(--blue-500)'], ['Black', 'var(--ink-900)'], ['Red', 'var(--red-500)'], ['Green', 'var(--green-500)']];
const WB_CHIP_TONE = {
  Blue: 'blue',
  Black: 'ink',
  Red: 'red',
  Green: 'green'
};
function WhiteboardScreen() {
  const [tool, setTool] = React.useState('Pe');
  const [color, setColor] = React.useState('Blue');
  const [strokes, setStrokes] = React.useState([]);
  const drawing = React.useRef(false);
  const svgRef = React.useRef(null);
  const pt = e => {
    const r = svgRef.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const down = e => {
    if (tool === 'Cl') {
      setStrokes([]);
      return;
    }
    if (tool === 'Un') {
      setStrokes(s => s.slice(0, -1));
      return;
    }
    drawing.current = true;
    const erase = tool === 'Er';
    setStrokes(s => [...s, {
      color: erase ? '#fff' : WB_COLORS.find(c => c[0] === color)[1],
      w: erase ? 22 : 6,
      pts: [pt(e)]
    }]);
  };
  const move = e => {
    if (!drawing.current) return;
    setStrokes(s => {
      const n = s.slice();
      n[n.length - 1] = {
        ...n[n.length - 1],
        pts: [...n[n.length - 1].pts, pt(e)]
      };
      return n;
    });
  };
  const up = () => {
    drawing.current = false;
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 16,
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      background: '#fff',
      padding: 10,
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-card)',
      height: 'fit-content'
    }
  }, WB_TOOLS.map(([l, t]) => /*#__PURE__*/React.createElement(ToolButton, {
    key: l,
    label: l,
    title: t,
    active: tool === l,
    onClick: () => setTool(l)
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      position: 'relative',
      background: '#fff',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-card)',
      overflow: 'hidden',
      backgroundImage: `repeating-linear-gradient(0deg,transparent,transparent 31px,var(--ink-100) 31px,var(--ink-100) 32px),
          repeating-linear-gradient(90deg,transparent,transparent 31px,var(--ink-100) 31px,var(--ink-100) 32px)`
    }
  }, /*#__PURE__*/React.createElement("svg", {
    ref: svgRef,
    width: "100%",
    height: "100%",
    style: {
      position: 'absolute',
      inset: 0,
      cursor: 'crosshair'
    },
    onMouseDown: down,
    onMouseMove: move,
    onMouseUp: up,
    onMouseLeave: up
  }, strokes.map((s, i) => /*#__PURE__*/React.createElement("polyline", {
    key: i,
    points: s.pts.map(p => p.join(',')).join(' '),
    fill: "none",
    stroke: s.color,
    strokeWidth: s.w,
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), strokes.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--ink-400)',
      fontSize: 'var(--fs-sm)',
      pointerEvents: 'none'
    }
  }, "Draw here \u2014 pen, eraser, line, grid"))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16,
      height: 52,
      display: 'flex',
      alignItems: 'center',
      padding: '0 20px',
      background: '#fff',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-card)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--fs-xs)',
      fontWeight: 500,
      color: 'var(--ink-500)'
    }
  }, "Pen 6px \xB7 Color ", color.toLowerCase(), " \xB7 Touch & stylus ready"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: 'auto',
      display: 'flex',
      gap: 8
    }
  }, WB_COLORS.map(([name]) => /*#__PURE__*/React.createElement("button", {
    key: name,
    onClick: () => setColor(name),
    style: {
      border: 0,
      background: 'none',
      padding: 0,
      cursor: 'pointer',
      opacity: color === name ? 1 : 0.5,
      transform: color === name ? 'scale(1.05)' : 'none',
      transition: 'all .12s'
    }
  }, /*#__PURE__*/React.createElement(Chip, {
    tone: WB_CHIP_TONE[name],
    dot: true
  }, name))))));
}
window.BDBWhiteboardScreen = WhiteboardScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/big_dog_board/WhiteboardScreen.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Chip = __ds_scope.Chip;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.NavItem = __ds_scope.NavItem;

__ds_ns.Panel = __ds_scope.Panel;

__ds_ns.ToolButton = __ds_scope.ToolButton;

__ds_ns.ToolCard = __ds_scope.ToolCard;

})();
