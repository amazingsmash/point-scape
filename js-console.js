(() => {
  const panel = document.getElementById("js-console");
  const toggle = document.getElementById("js-console-toggle");
  const output = document.getElementById("js-console-output");
  const entries = [];
  let scheduled = false;

  function format(value) {
    try {
      if (value instanceof Error) return value.stack || value.message;
      if (typeof value === "string") return value;
      const seen = new WeakSet();
      return JSON.stringify(value, (key, item) => {
        if (typeof item === "bigint") return `${item}n`;
        if (item && typeof item === "object") {
          if (seen.has(item)) return "[Circular]";
          seen.add(item);
        }
        return item;
      }, 2) ?? String(value);
    } catch {
      return "[No se puede mostrar este valor]";
    }
  }

  function render() {
    scheduled = false;
    if (panel.hidden) return;
    const atBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 40;
    const fragment = document.createDocumentFragment();
    for (const entry of entries) {
      const row = document.createElement("pre");
      row.className = `js-console-entry js-console-${entry.level}`;
      row.textContent = `${entry.time} [${entry.level}] ${entry.message}`;
      fragment.appendChild(row);
    }
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.textContent = "Sin mensajes. Se muestran los últimos 300 registros de esta página.";
      fragment.appendChild(empty);
    }
    output.replaceChildren(fragment);
    if (atBottom) output.scrollTop = output.scrollHeight;
  }

  function record(level, args) {
    entries.push({ level, time: new Date().toLocaleTimeString(), message: args.map(format).join(" ").slice(0, 12000) });
    if (entries.length > 300) entries.shift();
    if (!panel.hidden && !scheduled) {
      scheduled = true;
      requestAnimationFrame(render);
    }
  }

  for (const level of ["log", "info", "warn", "error", "debug", "table"]) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      original(...args);
      record(level, args);
    };
  }
  window.addEventListener("error", (event) => {
    record("error", [event.error || `${event.message} (${event.filename}:${event.lineno})`]);
  });
  window.addEventListener("unhandledrejection", (event) => {
    record("error", ["Promesa rechazada sin manejar:", event.reason]);
  });

  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      render();
      output.scrollTop = output.scrollHeight;
      document.getElementById("js-console-close").focus();
    } else {
      toggle.focus();
    }
  }
  toggle.addEventListener("click", () => setOpen(panel.hidden));
  document.getElementById("js-console-close").addEventListener("click", () => setOpen(false));
  document.getElementById("js-console-clear").addEventListener("click", () => {
    entries.length = 0;
    render();
  });
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
})();
