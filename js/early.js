/* Runs before the page draws. It marks the page as scripted, so start states
   for animations apply from the first frame, and when a talk step opens this
   page (?present) it starts in present mode, hidden until the script has put
   it on the right section, then fades in. Without JavaScript the page shows
   every final state. */
(function () {
  var root = document.documentElement;
  root.className = root.className.replace(/\bno-js\b/, 'js');
  if (/[?&]present(=|&|$)/.test(window.location.search)) root.className += ' present present-loading';
})();
