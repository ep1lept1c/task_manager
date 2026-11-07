const storageKey = "todo-list:v1";
const sortKey = "todo-list:sort";
const form = document.querySelector("#task-form");
const input = document.querySelector("#task-input");
const newDeadline = document.querySelector("#task-deadline");
const list = document.querySelector("#task-list");
const template = document.querySelector("#task-template");
const sort = document.querySelector("#task-sort");
const filter = document.querySelector("#task-filter");
const count = document.querySelector("#task-count");
const emptyState = document.querySelector("#empty-state");
const warning = document.querySelector("#storage-warning");
const status = document.querySelector("#task-status");
const editor = document.querySelector("#task-editor");
const editForm = document.querySelector("#edit-form");
const editTitle = document.querySelector("#edit-title");
const editDeadline = document.querySelector("#edit-deadline");
const undoNotice = document.querySelector("#undo-notice");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const taskRows = new WeakMap();
const layoutAnimations = new WeakMap();
const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const emptyMessages = {
  all: "Задач пока нет",
  active: "Нет активных задач",
  completed: "Нет выполненных задач",
};
let editingTask;
let lastDeleted;

function showWarning(message) {
  warning.textContent = message;
  warning.hidden = false;
}

function isDeadline(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value);
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

    if (Array.isArray(parsed) && parsed.every(isTask)) {
      for (const task of parsed) {
        if (task.deadline !== undefined && !isDeadline(task.deadline)) delete task.deadline;
      }
      return parsed;
    }
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

function compareDeadlines(first, second) {
  if (!first.deadline) return second.deadline ? 1 : 0;
  if (!second.deadline) return -1;
  return first.deadline.localeCompare(second.deadline);
}

function measureRows() {
  if (reducedMotion.matches || typeof list.animate !== "function") return null;
  return new Map(Array.from(list.children, (row) => [row, row.getBoundingClientRect().top]));
}

function animateRowPositions(previous) {
  if (!previous) return;

  const offsets = [];
  for (const row of list.children) {
    if (!previous.has(row)) continue;
    layoutAnimations.get(row)?.cancel();
    offsets.push([row, previous.get(row) - row.getBoundingClientRect().top]);
  }
  for (const [row, distance] of offsets) {
    if (Math.abs(distance) < 1) continue;
    const animation = row.animate(
      [{ transform: `translateY(${distance}px)` }, { transform: "none" }],
      { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
    layoutAnimations.set(row, animation);
  }
}

function removeRow(task, row, controlSelector, fallback) {
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
  taskRows.delete(task);

  const finish = () => {
    if (!row.isConnected) return;
    const previous = measureRows();
    row.remove();
    updateEmptyState();
    animateRowPositions(previous);
  };
  const animation = reducedMotion.matches ? undefined : row.firstElementChild.getAnimations?.()[0];
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
  removeRow(task, row, ".delete-button", input);
  lastDeleted = { task, index };
  undoNotice.hidden = false;
  status.textContent = "Задача удалена. Можно отменить удаление.";
}

function updateTaskRow(task, row) {
  row.querySelector(".task-title").textContent = task.title;
  row.querySelector(".edit-button").setAttribute("aria-label", `Редактировать задачу «${task.title}»`);
  row.querySelector(".delete-button").setAttribute("aria-label", `Удалить задачу «${task.title}»`);

  const deadline = row.querySelector(".task-deadline");
  deadline.hidden = !task.deadline;
  if (task.deadline) {
    deadline.dateTime = task.deadline;
    deadline.textContent = `До ${dateFormat.format(new Date(`${task.deadline}T00:00:00Z`))}`;
  }
}

function createTaskRow(task) {
  const row = template.content.firstElementChild.cloneNode(true);
  const checkbox = row.querySelector(".task-checkbox");
  updateTaskRow(task, row);
  checkbox.checked = task.completed;

  checkbox.addEventListener("change", () => {
    task.completed = checkbox.checked;
    saveTasks();
    updateCount();
    if (!matchesFilter(task)) removeRow(task, row, ".task-checkbox", filter);
  });
  row.querySelector(".edit-button").addEventListener("click", () => openEditor(task));
  row.querySelector(".delete-button").addEventListener("click", () => removeTask(task, row));
  taskRows.set(task, row);
  return row;
}

function renderTasks(enteringTask) {
  const previous = measureRows();
  const visibleTasks = tasks.filter(matchesFilter);
  if (sort.value === "newest") visibleTasks.reverse();
  if (sort.value === "deadline") visibleTasks.sort(compareDeadlines);

  const fragment = document.createDocumentFragment();
  for (const task of visibleTasks) {
    const row = taskRows.get(task) ?? createTaskRow(task);
    if (task === enteringTask && !reducedMotion.matches) {
      row.classList.add("task-row--entering");
      row.firstElementChild.addEventListener("animationend", () => {
        row.classList.remove("task-row--entering");
      }, { once: true });
    }
    fragment.append(row);
  }
  list.replaceChildren(fragment);
  updateEmptyState();
  animateRowPositions(previous);
}

function bindDateInput(field, clearButton) {
  const sync = () => { clearButton.hidden = !field.value; };
  field.addEventListener("input", sync);
  clearButton.addEventListener("click", () => {
    field.value = "";
    field.focus({ preventScroll: true });
    sync();
  });
  return sync;
}

function readTaskFields(titleInput, dateInput) {
  const title = titleInput.value.trim();
  titleInput.setCustomValidity(title ? "" : "Введите название задачи.");
  if (!titleInput.reportValidity() || !dateInput.reportValidity()) return null;

  return { title, deadline: dateInput.value || undefined };
}

function openEditor(task) {
  editingTask = task;
  editTitle.value = task.title;
  editTitle.setCustomValidity("");
  editDeadline.value = task.deadline ?? "";
  syncEditDeadline();
  editor.showModal();
}

function undoDeletion() {
  if (!lastDeleted) return;
  const { task, index } = lastDeleted;
  lastDeleted = undefined;
  tasks.splice(index, 0, task);
  saveTasks();
  renderTasks(task);
  updateCount();
  if (undoNotice.contains(document.activeElement)) {
    const target = matchesFilter(task) ? taskRows.get(task).querySelector(".edit-button") : filter;
    target.focus();
  }
  undoNotice.hidden = true;
  status.textContent = "Задача восстановлена.";
}

const tasks = loadTasks();
const syncNewDeadline = bindDateInput(newDeadline, document.querySelector("#clear-task-deadline"));
const syncEditDeadline = bindDateInput(editDeadline, document.querySelector("#clear-edit-deadline"));
syncNewDeadline();
sort.value = "oldest";
filter.value = "all";
try {
  const savedSort = localStorage.getItem(sortKey);
  if (savedSort === "newest" || savedSort === "deadline") sort.value = savedSort;
} catch {
  // Sorting still works for the current page without storage.
}
renderTasks();
updateCount();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const fields = readTaskFields(input, newDeadline);
  if (!fields) return;

  const task = { ...fields, completed: false };
  tasks.push(task);
  saveTasks();
  renderTasks(task);
  updateCount();
  form.reset();
  syncNewDeadline();
  input.focus({ preventScroll: true });
  status.textContent = matchesFilter(task) ? "Задача добавлена." : "Задача добавлена в активные.";
});

editForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const fields = readTaskFields(editTitle, editDeadline);
  if (!fields || !editingTask) return;

  Object.assign(editingTask, fields);
  updateTaskRow(editingTask, taskRows.get(editingTask));
  saveTasks();
  if (sort.value === "deadline") renderTasks();
  editor.close();
  status.textContent = "Задача обновлена.";
});

document.querySelector("#cancel-edit").addEventListener("click", () => editor.close());
editor.addEventListener("close", () => { editingTask = undefined; });
for (const field of [input, editTitle]) {
  field.addEventListener("input", () => field.setCustomValidity(""));
}

document.querySelector("#undo-delete").addEventListener("click", undoDeletion);
document.querySelector("#dismiss-undo").addEventListener("click", () => {
  lastDeleted = undefined;
  input.focus({ preventScroll: true });
  undoNotice.hidden = true;
});

sort.addEventListener("change", () => {
  try {
    localStorage.setItem(sortKey, sort.value);
  } catch {
    // The task data and the current view are independent of this preference.
  }
  renderTasks();
});
filter.addEventListener("change", () => renderTasks());
