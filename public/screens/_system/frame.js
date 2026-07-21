// Screen kit runtime. AUTHORED (not generated) - but keep it tiny.
//
// One job today: scale the fixed 1440x810 stage to fill whatever is showing
// it - the projector, a Chromebook, a laptop preview - and keep it centered.
// Screens are authored in plain pixels; this is what makes that safe.
// (Transform, not zoom: zoom desynchronizes scroll coordinates from layout.)
(function () {
  function fit() {
    var stage = document.querySelector(".vmstage");
    if (!stage) return;
    var k = Math.min(window.innerWidth / 1440, window.innerHeight / 810);
    stage.style.transformOrigin = "top left";
    stage.style.transform = "scale(" + k + ")";
    stage.style.position = "absolute";
    stage.style.left = (window.innerWidth - 1440 * k) / 2 + "px";
    stage.style.top = (window.innerHeight - 810 * k) / 2 + "px";
  }
  window.addEventListener("resize", fit);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fit);
  } else {
    fit();
  }
})();
