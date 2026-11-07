const storageKey = "todo-list:v1";
const sortKey = "todo-list:sort";
const form = document.querySelector("#task-form");
const input = document.querySelector("#task-input");
const list = document.querySelector("#task-list");
const template = document.querySelector("#task-template");
const sort = document.querySelector("#task-sort");
const filter = document.querySelector("#task-filter");
const count = document.querySelector("#task-count");
const emptyState = document.querySelector("#empty-state");
const warning = document.querySelector("#storage-warning");
const status = document.querySelector("#task-status");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const emptyMessages = {
  all: "Задач пока нет",
  active: "Нет активных задач",
  completed: "Нет выполненных задач",
};

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
  emptyState.textContent = emptyMessages[filter.value];
}

function updateCount() {
  const completed = tasks.filter((task) => task.completed).length;
  count.textContent = `Выполнено ${completed} из ${tasks.length}`;
}

function matchesFilter(task) {
  return filter.value === "all" || task.completed === (filter.value === "completed");
}

function removeRow(row, controlSelector, fallback) {
  if (row.contains(document.activeElement)) {
    const visible = Array.from(list.querySelectorAll(".task-row:not(.task-row--leaving)"));
    const index = visible.indexOf(row);
    const nextRow = visible[index + 1] ?? visible[index - 1];
    const nextControl = nextRow?.querySelector(controlSelector) ?? fallback;
    nextControl.focus({ preventScroll: true });
  }
  row.classList.remove("task-row--entering");
  row.classList.add("task-row--leaving");
  row.inert = true;

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

function removeTask(task, row) {
  const index = tasks.indexOf(task);
  if (index === -1) return;

  tasks.splice(index, 1);
  saveTasks();
  updateCount();
  removeRow(row, ".delete-button", input);
  status.textContent = "Задача удалена.";
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
    updateCount();
    if (!matchesFilter(task)) removeRow(row, ".task-checkbox", filter);
  });
  deleteButton.addEventListener("click", () => removeTask(task, row));

  if (animate && !reducedMotion.matches) {
    row.classList.add("task-row--entering");
    row.addEventListener("animationend", () => row.classList.remove("task-row--entering"), {
      once: true,
    });
  }

  if (sort.value === "newest") list.prepend(row);
  else list.append(row);
}

function renderTasks() {
  list.replaceChildren();
  for (const task of tasks) {
    if (matchesFilter(task)) appendTask(task);
  }
  updateEmptyState();
}

const tasks = loadTasks();
sort.value = "oldest";
filter.value = "all";
try {
  if (localStorage.getItem(sortKey) === "newest") sort.value = "newest";
} catch {
  // Sorting still works for the current page without storage.
}
renderTasks();
updateCount();

sort.addEventListener("change", () => {
  try {
    localStorage.setItem(sortKey, sort.value);
  } catch {
    // The task data and the current view are independent of this preference.
  }
  renderTasks();
});
filter.addEventListener("change", renderTasks);

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
  const visible = matchesFilter(task);
  if (visible) appendTask(task, true);
  updateEmptyState();
  updateCount();
  input.value = "";
  input.setCustomValidity("");
  input.focus({ preventScroll: true });
  status.textContent = visible ? "Задача добавлена." : "Задача добавлена в активные.";
});
