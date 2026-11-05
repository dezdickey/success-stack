/* Runs before the page draws: marks it as scripted so start states for
   animations apply from the first frame. Without JavaScript the page shows
   every final state. */
document.documentElement.className = document.documentElement.className.replace(/\bno-js\b/, 'js');
