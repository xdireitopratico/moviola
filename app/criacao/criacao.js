window.moviolaRoom = (async () => {
  const sessionId = new URLSearchParams(location.search).get("session");
  if (!sessionId || !window.moviola) return "";
  const session = await window.moviola.read(sessionId);
  document.getElementById("projectName").textContent = session.projectName;
  document.getElementById("sessionTitle").textContent = session.projectName;
  return session.projectName;
})();
