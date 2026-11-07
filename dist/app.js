const storageKey = "todo-list:v1";
const form = document.querySelector("#task-form");
const input = document.querySelector("#task-input");
const list = document.querySelector("#task-list");
const template = document.querySelector("#task-template");
const emptyState = document.querySelector("#empty-state");
const warning = document.querySelector("#storage-warning");
const status = document.querySelector("#task-status");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function showWarning(message) {
  warning.textContent = message;
  warning.hidden = false;
}

function loadTasks() {
  let saved;
  try {
    saved = localStorage.getItem(storageKey);
  } catch {
    showWarning("Хранилище браузера недоступно. Задачи не сохранятся после обновления.");
    return [];
  }

  if (saved === null) return [];

  try {
    const parsed = JSON.parse(saved);
    const isTask = (task) =>
      task &&
      typeof task.title === "string" &&
      task.title.trim() &&
      typeof task.completed === "boolean";

    if (Array.isArray(parsed) && parsed.every(isTask)) return parsed;
  } catch {
    // The next change can replace unreadable saved data.
  }

  showWarning("Не удалось загрузить сохранённые задачи.");
  return [];
}

function saveTasks() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(tasks));
    warning.hidden = true;
  } catch {
    showWarning("Не удалось сохранить задачи. После обновления изменения могут пропасть.");
  }
}

function updateEmptyState() {
  emptyState.hidden = list.childElementCount > 0;
}

function removeTask(task, row) {
  const index = tasks.indexOf(task);
  if (index === -1) return;

  tasks.splice(index, 1);
  saveTasks();
  row.classList.remove("task-row--entering");
  row.classList.add("task-row--leaving");

  if (row.contains(document.activeElement)) {
    const remaining = list.querySelectorAll(".task-row:not(.task-row--leaving)");
    const nextRow = remaining[Math.min(index, remaining.length - 1)];
    const nextControl = nextRow?.querySelector(".delete-button") ?? input;
    nextControl.focus({ preventScroll: true });
  }
  row.inert = true;
  status.textContent = "Задача удалена.";

  const finish = () => {
    row.remove();
    updateEmptyState();
  };
  const animation = reducedMotion.matches ? undefined : row.getAnimations?.()[0];
  if (animation) {
    animation.finished.then(finish, finish);
  } else {
    finish();
  }
}

function appendTask(task, animate = false) {
  const row = template.content.firstElementChild.cloneNode(true);
  const checkbox = row.querySelector(".task-checkbox");
  const deleteButton = row.querySelector(".delete-button");

  row.querySelector(".task-title").textContent = task.title;
  checkbox.checked = task.completed;
  deleteButton.setAttribute("aria-label", "Удалить задачу «" + task.title + "»");

  checkbox.addEventListener("change", () => {
    task.completed = checkbox.checked;
    saveTasks();
  });
  deleteButton.addEventListener("click", () => removeTask(task, row));

  if (animate && !reducedMotion.matches) {
    row.classList.add("task-row--entering");
    row.addEventListener("animationend", () => row.classList.remove("task-row--entering"), {
      once: true,
    });
  }

  list.append(row);
  updateEmptyState();
}

const tasks = loadTasks();
for (const task of tasks) appendTask(task);
updateEmptyState();

input.addEventListener("input", () => input.setCustomValidity(""));
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = input.value.trim();
  if (!title) {
    input.setCustomValidity("Введите название задачи.");
    input.reportValidity();
    return;
  }

  const task = {
    title,
    completed: false,
  };

  tasks.push(task);
  saveTasks();
  appendTask(task, true);
  input.value = "";
  input.setCustomValidity("");
  input.focus({ preventScroll: true });
  status.textContent = "Задача добавлена.";
});
