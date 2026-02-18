const noteList = document.getElementById('note-list');
const editor = document.getElementById('editor');
const contentEl = document.getElementById('content');
const imageDisplay = document.getElementById('image-display');
const newBtn = document.getElementById('new-btn');
const imageBtn = document.getElementById('image-btn');
const backBtn = document.getElementById('back-btn');
const deleteBtn = document.getElementById('delete-btn');

function isImageNote(note) {
  return note && note.content && note.content.startsWith('data:image/');
}

let currentNote = null;
let saveTimeout = null;
let notes = [];
let selectedIndex = 0;
let deletedNotesStack = [];

async function loadNotes(selectNoteId = null) {
  notes = await window.api.getNotes();
  noteList.innerHTML = '';

  if (notes.length === 0) {
    noteList.innerHTML = '<div class="empty-state">Press + to create a note</div>';
    selectedIndex = -1;
    return;
  }

  if (selectNoteId !== null) {
    const idx = notes.findIndex((n) => n.id === selectNoteId);
    selectedIndex = idx >= 0 ? idx : 0;
  } else {
    selectedIndex = Math.min(selectedIndex, notes.length - 1);
    if (selectedIndex < 0) selectedIndex = 0;
  }

  notes.forEach((note, index) => {
    const div = document.createElement('div');
    div.className = 'note-item' + (index === selectedIndex ? ' selected' : '');
    div.dataset.index = index;

    const date = new Date(note.updated_at + 'Z').toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    if (isImageNote(note)) {
      div.innerHTML = `
        <div class="note-preview note-preview-image">
          <img src="${note.content}" alt="Image" />
        </div>
        <div class="note-date">${date}</div>
      `;
    } else {
      const preview = note.content.trim() || 'Empty note';
      const firstLine = preview.split('\n')[0].substring(0, 50);
      div.innerHTML = `
        <div class="note-preview">${escapeHtml(firstLine)}</div>
        <div class="note-date">${date}</div>
      `;
    }

    div.addEventListener('click', () => {
      selectedIndex = index;
      openNote(note);
    });
    noteList.appendChild(div);
  });

  const selectedEl = noteList.querySelector('.note-item.selected');
  if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest', behavior: 'auto' });
}

function isListVisible() {
  return editor.classList.contains('hidden');
}

function updateSelectionHighlight() {
  const items = noteList.querySelectorAll('.note-item');
  items.forEach((div, i) => {
    div.classList.toggle('selected', i === selectedIndex);
  });
  const selected = items[selectedIndex];
  if (selected) selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function openNote(note) {
  currentNote = note;
  if (isImageNote(note)) {
    contentEl.classList.add('hidden');
    contentEl.value = '';
    imageDisplay.classList.remove('hidden');
    imageDisplay.innerHTML = `<img src="${note.content}" alt="Image" />`;
  } else {
    contentEl.classList.remove('hidden');
    contentEl.value = note.content;
    imageDisplay.classList.add('hidden');
    imageDisplay.innerHTML = '';
    contentEl.focus();
  }
  noteList.classList.add('hidden');
  editor.classList.remove('hidden');
}

async function showList() {
  const noteIdToSelect = currentNote?.id ?? null;
  if (currentNote) {
    if (isImageNote(currentNote)) {
      // Image notes have no editable content, nothing to save
    } else if (contentEl.value.trim() === '') {
      await window.api.deleteNote(currentNote.id);
    } else {
      autoSave();
    }
  }
  currentNote = null;
  contentEl.classList.remove('hidden');
  imageDisplay.classList.add('hidden');
  imageDisplay.innerHTML = '';
  editor.classList.add('hidden');
  noteList.classList.remove('hidden');
  noteList.style.display = '';
  await loadNotes(noteIdToSelect);
}

function autoSave() {
  if (currentNote && !isImageNote(currentNote) && contentEl.value !== currentNote.content) {
    window.api.updateNote(currentNote.id, contentEl.value);
    currentNote.content = contentEl.value;
  }
}

newBtn.addEventListener('click', async () => {
  const note = await window.api.createNote('');
  openNote(note);
});

imageBtn.addEventListener('click', async () => {
  if (currentNote && currentNote.content.trim() === '') {
    await window.api.deleteNote(currentNote.id);
  }
  const note = await window.api.createNoteFromImage();
  if (note) openNote(note);
});

backBtn.addEventListener('click', showList);

deleteBtn.addEventListener('click', async () => {
  if (currentNote) {
    deletedNotesStack.push({ ...currentNote });
    await window.api.deleteNote(currentNote.id);
    currentNote = null;
    showList();
  }
});

contentEl.addEventListener('input', () => {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(autoSave, 500);
});

window.addEventListener('blur', autoSave);

document.addEventListener('paste', async (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      if (currentNote && isImageNote(currentNote)) {
        await window.api.updateNote(currentNote.id, dataUrl);
        currentNote.content = dataUrl;
        imageDisplay.innerHTML = `<img src="${dataUrl}" alt="Image" />`;
      } else {
        if (currentNote && currentNote.content.trim() === '') {
          await window.api.deleteNote(currentNote.id);
        } else {
          autoSave();
        }
        const note = await window.api.createNote(dataUrl);
        openNote(note);
      }
      return;
    }
  }
});

document.addEventListener('keydown', async (e) => {
  const inList = isListVisible();

  if (inList && notes.length > 0) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(0, selectedIndex - 1);
      updateSelectionHighlight();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(notes.length - 1, selectedIndex + 1);
      updateSelectionHighlight();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      openNote(notes[selectedIndex]);
      return;
    }
    if (e.metaKey && e.key === 'd') {
      e.preventDefault();
      const note = notes[selectedIndex];
      deletedNotesStack.push({ ...note });
      await window.api.deleteNote(note.id);
      notes = notes.filter((n) => n.id !== note.id);
      selectedIndex = Math.min(selectedIndex, notes.length - 1);
      if (notes.length === 0) selectedIndex = -1;
      await loadNotes();
      return;
    }
  }

  if (e.metaKey && e.key === 'z') {
    e.preventDefault();
    if (deletedNotesStack.length > 0) {
      const note = deletedNotesStack.pop();
      await window.api.restoreNote(note);
      await loadNotes();
      selectedIndex = notes.findIndex((n) => n.id === note.id);
      if (selectedIndex < 0) selectedIndex = notes.length - 1;
      updateSelectionHighlight();
    }
    return;
  }

  if (!e.metaKey) return;

  if (e.key === 'n') {
    e.preventDefault();
    const note = await window.api.createNote('');
    openNote(note);
  } else if (e.key === 'i') {
    e.preventDefault();
    const note = await window.api.createNoteFromImage();
    if (note) openNote(note);
  } else if (e.key === 's') {
    e.preventDefault();
    autoSave();
  } else if (e.key === 'e') {
    e.preventDefault();
    if (currentNote) showList();
  }
});

loadNotes();
