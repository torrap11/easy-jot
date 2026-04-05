const noteList = document.getElementById('note-list');
const editor = document.getElementById('editor');
const contentEl = document.getElementById('content');
const imageDisplay = document.getElementById('image-display');
const newBtn = document.getElementById('new-btn');
const imageBtn = document.getElementById('image-btn');
const backBtn = document.getElementById('back-btn');
const deleteBtn = document.getElementById('delete-btn');
const agentPanel = document.getElementById('agent-panel');
const agentMessages = document.getElementById('agent-messages');
const agentInput = document.getElementById('agent-input');
const agentSendBtn = document.getElementById('agent-send-btn');
const folderBar = document.getElementById('folder-bar');
const newFolderBtn = document.getElementById('new-folder-btn');
const newFolderInput = document.getElementById('new-folder-input');
const folderMove = document.getElementById('folder-move');
const folderBtn = document.getElementById('folder-btn');
const folderOrganizeView = document.getElementById('folder-organize-view');
const folderOrganizeFilter = document.getElementById('folder-organize-filter');
const folderOrganizeContent = document.getElementById('folder-organize-content');
const folderOrganizeNewInput = document.getElementById('folder-organize-new-input');
const folderOrganizeDescInput = document.getElementById('folder-organize-desc-input');
const folderOrganizeNewBtn = document.getElementById('folder-organize-new-btn');

// ── Voice (quick capture) elements ──
const voiceBtn = document.getElementById('voice-btn');
const voiceBar = document.getElementById('voice-bar');
const voiceStateRecording = document.getElementById('voice-state-recording');
const voiceStateProcessing = document.getElementById('voice-state-processing');
const voiceStateReview = document.getElementById('voice-state-review');
const voiceStateSuccess = document.getElementById('voice-state-success');
const voiceStateError = document.getElementById('voice-state-error');
const voiceStopBtn = document.getElementById('voice-stop-btn');
const voiceSaveBtn = document.getElementById('voice-save-btn');
const voiceDismissBtn = document.getElementById('voice-dismiss-btn');
const voiceErrorDismissBtn = document.getElementById('voice-error-dismiss-btn');
const voiceTranscriptText = document.getElementById('voice-transcript-text');
const voiceProcessingLabel = document.getElementById('voice-processing-label');
const voiceErrorText = document.getElementById('voice-error-text');
const triggerNotification = document.getElementById('trigger-notification');
const triggerNotificationIcon = document.getElementById('trigger-notification-icon');
const triggerNotificationLabel = document.getElementById('trigger-notification-label');
const triggerNotificationClose = document.getElementById('trigger-notification-close');
const triggerNotificationMemories = document.getElementById('trigger-notification-memories');
const jotDetailView = document.getElementById('jot-detail-view');
const jotDetailHeader = document.getElementById('jot-detail-header');
const jotDetailBadge = document.getElementById('jot-detail-badge');
const jotDetailMeta = document.getElementById('jot-detail-meta');
const jotDetailBack = document.getElementById('jot-detail-back');
const jotDetailContent = document.getElementById('jot-detail-content');
const jotDetailActions = document.getElementById('jot-detail-actions');

// ── Universal Voice Command elements (Cmd+M) ──
const voiceCmdBar         = document.getElementById('voice-cmd-bar');
const vcmdStateRecording  = document.getElementById('vcmd-state-recording');
const vcmdStateProcessing = document.getElementById('vcmd-state-processing');
const vcmdStateConfirm    = document.getElementById('vcmd-state-confirm');
const vcmdStateSuccess    = document.getElementById('vcmd-state-success');
const vcmdStateError      = document.getElementById('vcmd-state-error');
const vcmdStopBtn         = document.getElementById('vcmd-stop-btn');
const vcmdSendBtn         = document.getElementById('vcmd-send-btn');
const vcmdRedoBtn         = document.getElementById('vcmd-redo-btn');
const vcmdCloseBtn        = document.getElementById('vcmd-close-btn');
const vcmdErrorDismissBtn = document.getElementById('vcmd-error-dismiss-btn');
const vcmdProcessingLabel = document.getElementById('vcmd-processing-label');
const vcmdTranscriptText  = document.getElementById('vcmd-transcript-text');
const vcmdSuccessIcon     = document.getElementById('vcmd-success-icon');
const vcmdSuccessText     = document.getElementById('vcmd-success-text');
const vcmdErrorText       = document.getElementById('vcmd-error-text');

function isImageNote(note) {
  return note && note.content && note.content.startsWith('data:image/');
}

let currentNote = null;
let saveTimeout = null;
let notes = []; // unified list: notes + scheduled reminders (normalized to jot items)
let selectedIndex = 0;
let deletedNotesStack = [];
let agentPanelOpen = true;
let folders = [];
let folderOrganizeOpen = false;
let currentJotDetail = null; // { type: 'scheduled', data } when viewing a reminder jot

// Restore folder filter from previous session
let currentFolderFilter = (() => {
  const v = localStorage.getItem('jot-folder-filter');
  if (v === null || v === 'all') return 'all';
  if (v === 'unfiled') return null;
  return Number(v);
})();

// When set, notes panel shows only this note (e.g. after a reminder that creates a note)
let focusNoteId = null;

function setFolderFilter(val) {
  currentFolderFilter = val;
  localStorage.setItem('jot-folder-filter', val === null ? 'unfiled' : String(val));
}

/** Normalize raw items to unified jot shape: { jotType, id, content, sortAt, ... } */
function toJotNote(n) {
  return { jotType: 'note', id: n.id, content: n.content, folder_id: n.folder_id, created_at: n.created_at, updated_at: n.updated_at, sortAt: n.updated_at, ...n };
}
function toJotScheduled(r) {
  return { jotType: 'scheduled', id: r.id, content: r.content, schedule_type: r.schedule_type, scheduled_time: r.scheduled_time, active: r.active, created_at: r.created_at, sortAt: r.created_at, ...r };
}

async function loadJots(selectId = null, selectJotType = null) {
  let rawNotes = [];
  let rawReminders = [];

  if (focusNoteId != null) {
    // Focus mode: show only this one note (e.g. after reminder fired with note_content)
    rawNotes = await window.api.getNotes();
    rawNotes = rawNotes.filter((n) => n.id === focusNoteId);
  } else {
    rawNotes = (currentFolderFilter === 'all')
      ? await window.api.getNotes()
      : await window.api.getNotesByFolder(currentFolderFilter);
    rawReminders = await window.api.getScheduledReminders();
  }

  const noteJots = rawNotes.map(toJotNote);
  const scheduledJots = rawReminders.map(toJotScheduled);
  notes = [...noteJots, ...scheduledJots].sort((a, b) => new Date(b.sortAt) - new Date(a.sortAt));

  noteList.innerHTML = '';

  // Show "Show all" bar when in focus-note mode
  let focusBar = document.getElementById('focus-note-bar');
  if (focusNoteId != null) {
    if (!focusBar) {
      focusBar = document.createElement('div');
      focusBar.id = 'focus-note-bar';
      focusBar.className = 'focus-note-bar';
      const showAllBtn = document.createElement('button');
      showAllBtn.type = 'button';
      showAllBtn.textContent = 'Show all jots';
      showAllBtn.id = 'focus-note-show-all';
      focusBar.appendChild(showAllBtn);
      noteList.parentElement.insertBefore(focusBar, noteList);
      showAllBtn.addEventListener('click', () => {
        focusNoteId = null;
        loadJots();
      });
    }
    focusBar.classList.remove('hidden');
  } else if (focusBar) {
    focusBar.classList.add('hidden');
  }

  if (notes.length === 0) {
    noteList.innerHTML = '<div class="empty-state">Press + to add a jot. Write a note or a time-based reminder; jots that mention a place (e.g. Netflix) can surface when you are there.</div>';
    selectedIndex = -1;
    return;
  }

  if (selectId != null && selectJotType != null) {
    const idx = notes.findIndex((j) => j.id === selectId && j.jotType === selectJotType);
    selectedIndex = idx >= 0 ? idx : 0;
  } else {
    selectedIndex = Math.min(selectedIndex, notes.length - 1);
    if (selectedIndex < 0) selectedIndex = 0;
  }

  notes.forEach((jot, index) => {
    const div = document.createElement('div');
    div.className = 'note-item' + (index === selectedIndex ? ' selected' : '');
    div.dataset.index = index;
    const date = new Date((jot.updated_at || jot.created_at) + 'Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    if (jot.jotType === 'note') {
      if (isImageNote(jot)) {
        div.innerHTML = `
          <div class="note-preview note-preview-image"><img src="${jot.content}" alt="Image" /></div>
          <div class="note-date">${date}</div>
        `;
      } else {
        const preview = (jot.content || '').trim() || 'Empty note';
        const firstLine = preview.split('\n')[0].substring(0, 50);
        div.innerHTML = `
          <div class="note-preview">${escapeHtml(firstLine)}</div>
          <div class="note-date">${date}</div>
        `;
      }
      div.addEventListener('click', () => { selectedIndex = index; openNote(jot); });
    } else {
      const scheduleLabel = formatScheduleLabel(jot.schedule_type, jot.scheduled_time);
      div.innerHTML = `
        <div class="note-preview">${escapeHtml((jot.content || '').slice(0, 50))}</div>
        <div class="jot-capability">⏰ Jot · ${escapeHtml(scheduleLabel)}${jot.active ? '' : ' · paused'}</div>
        <div class="note-date">${date}</div>
      `;
      div.addEventListener('click', () => { selectedIndex = index; openJotDetail('scheduled', jot); });
    }
    noteList.appendChild(div);
  });

  const selectedEl = noteList.querySelector('.note-item.selected');
  if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest', behavior: 'auto' });
}

function formatScheduleLabel(scheduleType, scheduledTime) {
  if (scheduleType === 'daily') {
    const [hh, mm] = scheduledTime.split(':').map(Number);
    const d = new Date();
    d.setHours(hh, mm, 0, 0);
    return 'Daily at ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  const d = new Date(scheduledTime);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function openJotDetail(type, jot) {
  currentJotDetail = { type, data: jot };
  noteList.classList.add('hidden');
  editor.classList.add('hidden');
  jotDetailView.classList.remove('hidden');
  jotDetailContent.textContent = jot.content || '';

  if (type === 'scheduled') {
    jotDetailBadge.textContent = '⏰ Jot';
    jotDetailMeta.textContent = formatScheduleLabel(jot.schedule_type, jot.scheduled_time) + (jot.active ? '' : ' · Paused');
    jotDetailActions.innerHTML = `
      <button type="button" id="jot-detail-test">▶ Test</button>
      <button type="button" id="jot-detail-toggle">${jot.active ? 'Pause' : 'Resume'}</button>
      <button type="button" id="jot-detail-delete">Delete</button>
    `;
    jotDetailActions.querySelector('#jot-detail-test').onclick = async () => {
      await window.api.fireReminder(jot.id);
    };
    jotDetailActions.querySelector('#jot-detail-toggle').onclick = async () => {
      await window.api.toggleScheduledReminder(jot.id);
      const updated = (await window.api.getScheduledReminders()).find((r) => r.id === jot.id);
      if (updated) openJotDetail('scheduled', toJotScheduled(updated));
    };
    jotDetailActions.querySelector('#jot-detail-delete').onclick = async () => {
      await window.api.deleteScheduledReminder(jot.id);
      currentJotDetail = null;
      jotDetailView.classList.add('hidden');
      noteList.classList.remove('hidden');
      await loadJots();
    };
  }

  jotDetailBack.onclick = () => {
    currentJotDetail = null;
    jotDetailView.classList.add('hidden');
    noteList.classList.remove('hidden');
    loadJots();
  };
}

async function loadNotes(selectNoteId = null) {
  await loadJots(selectNoteId, 'note');
}

function isListVisible() {
  return editor.classList.contains('hidden');
}

noteList.tabIndex = -1;

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
  }
  noteList.classList.add('hidden');
  editor.classList.remove('hidden');
  if (!isImageNote(note)) {
    requestAnimationFrame(() => contentEl.focus());
  }
  updateFolderMoveSelector();
}

async function showList() {
  // BUG-7: disable back button to prevent double-invocation during async parse
  backBtn.disabled = true;
  // BUG-3: capture currentNote now so a new note created while the LLM call is
  // in flight doesn't get orphaned when we null currentNote at the end.
  const savedNote = currentNote;
  try {
  let noteIdToSelect = savedNote?.id ?? null;
  if (savedNote && !isImageNote(savedNote)) {
    const content = contentEl.value.trim();
    if (content === '') {
      await window.api.deleteNote(savedNote.id);
      noteIdToSelect = null;
    } else {
      // Note vs scheduled reminder (context-style lines stay as plain notes)
      const reminderParsed = parseReminderNLClient(content);
      if (reminderParsed) {
        const { error } = await window.api.createScheduledReminder({
          content: reminderParsed.content,
          scheduleType: reminderParsed.scheduleType,
          scheduledTime: reminderParsed.scheduledTime,
        });
        if (!error) {
          await window.api.deleteNote(savedNote.id);
          noteIdToSelect = null;
        } else {
          autoSave();
        }
      } else {
        autoSave();
      }
    }
  } else if (savedNote && isImageNote(savedNote)) {
    // Image note: nothing to parse
  }
  // Only clear currentNote if the user hasn't started editing a new note while
  // the async LLM call was in flight (BUG-3 re-entrancy guard).
  if (currentNote === savedNote) currentNote = null;
  currentJotDetail = null;
  contentEl.classList.remove('hidden');
  imageDisplay.classList.add('hidden');
  imageDisplay.innerHTML = '';
  editor.classList.add('hidden');
  jotDetailView.classList.add('hidden');
  noteList.classList.remove('hidden');
  noteList.style.display = '';
  await loadJots(noteIdToSelect, 'note');
  } finally {
    backBtn.disabled = false;
  }
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
  // Spacebar stops voice recording (only when mic is active and not typing in a field)
  if (e.code === 'Space' && cmdMActive) {
    const tag = document.activeElement?.tagName;
    if (tag !== 'TEXTAREA' && tag !== 'INPUT') {
      e.preventDefault();
      stopVoiceCmd();
      return;
    }
  }

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
      const jot = notes[selectedIndex];
      if (jot.jotType === 'note') {
        openNote(jot);
      } else {
        openJotDetail(jot.jotType, jot);
      }
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const jot = notes[selectedIndex];
      if (jot.jotType === 'scheduled') {
        await window.api.deleteScheduledReminder(jot.id);
      } else {
        deletedNotesStack.push({ ...jot });
        await window.api.deleteNote(jot.id);
      }
      notes = notes.filter((n) => n.id !== jot.id);
      selectedIndex = Math.min(selectedIndex, notes.length - 1);
      if (notes.length === 0) selectedIndex = -1;
      await loadJots();
      return;
    }
  }

  if (e.metaKey && e.key === 'z') {
    e.preventDefault();
    if (deletedNotesStack.length > 0) {
      const note = deletedNotesStack.pop();
      await window.api.restoreNote(note);
      await loadJots();
      selectedIndex = notes.findIndex((n) => n.id === note.id);
      if (selectedIndex < 0) selectedIndex = notes.length - 1;
      updateSelectionHighlight();
    }
    return;
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    if (cmdMActive || !voiceCmdBar.classList.contains('hidden')) {
      dismissVoiceCmd();
      return;
    }
    if (currentNote) {
      await showList();
    } else if (currentJotDetail) {
      currentJotDetail = null;
      jotDetailView.classList.add('hidden');
      noteList.classList.remove('hidden');
      loadJots();
    } else if (folderOrganizeOpen) {
      closeFolderOrganizeView();
    }
    return;
  }

  if (e.metaKey && e.key === 'Tab') {
    e.preventDefault();
    switchPaneFocus();
    return;
  }

  if (e.ctrlKey && e.key === 'Tab') {
    e.preventDefault();
    const filterList = ['all', null, ...folders.map((f) => f.id)];
    const idx = filterList.findIndex(
      (f) =>
        (f === 'all' && currentFolderFilter === 'all') ||
        (f === null && currentFolderFilter === null) ||
        (typeof f === 'number' && currentFolderFilter === f)
    );
    if (idx < 0) return;
    const nextIdx = e.shiftKey
      ? (idx - 1 + filterList.length) % filterList.length
      : (idx + 1) % filterList.length;
    setFolderFilter(filterList[nextIdx]);
    renderFolderBar();
    if (folderOrganizeOpen) {
      renderFolderOrganizeJots();
    } else if (currentNote) {
      showList();
    } else {
      loadJots();
    }
    return;
  }

  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    autoSave();
    if (currentNote) {
      folderMove.classList.remove('hidden');
      folderMove.focus();
      if (typeof folderMove.showPicker === 'function') {
        try {
          folderMove.showPicker();
        } catch (_) {
          folderMove.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        }
      } else {
        folderMove.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      }
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
  } else if (e.key === 'j') {
    e.preventDefault();
    switchPaneFocus();
  } else if (e.key === 'f') {
    e.preventDefault();
    if (folderOrganizeOpen) closeFolderOrganizeView();
    else openFolderOrganizeView();
  }
});

function showAgentPanel() {
  agentPanelOpen = true;
  agentPanel.classList.remove('hidden');
  window.api.resizeWindow(true);
  agentInput.focus();
}

function focusJotPane() {
  if (currentNote && !isImageNote(currentNote)) {
    contentEl.focus();
    return;
  }
  if (folderOrganizeOpen && folderOrganizeNewInput) {
    folderOrganizeNewInput.focus();
    return;
  }
  noteList.focus();
}

function switchPaneFocus() {
  if (agentPanel.contains(document.activeElement)) {
    focusJotPane();
  } else {
    showAgentPanel();
  }
}

function saveAgentChat() {
  sessionStorage.setItem('easy-jot-agent-chat', agentMessages.innerHTML);
}

function restoreAgentChat() {
  const saved = sessionStorage.getItem('easy-jot-agent-chat');
  if (saved) agentMessages.innerHTML = saved;
}

/**
 * @returns {Promise<{ ok: boolean, skipped?: boolean, errorMessage?: string }>}
 */
async function sendAgentMessage() {
  const text = agentInput.value.trim();
  if (!text) return { ok: false, skipped: true };

  // Disable input during request to prevent double-submit
  agentInput.disabled = true;
  agentSendBtn.disabled = true;

  // BUG-9: 30-second timeout so UI never freezes indefinitely
  const AGENT_TIMEOUT_MS = 30_000;
  let agentTimeoutId;
  const agentTimeoutPromise = new Promise((_, reject) => {
    agentTimeoutId = setTimeout(() => reject(new Error('Request timed out after 30 seconds.')), AGENT_TIMEOUT_MS);
  });

  // Remove empty state
  const emptyState = agentMessages.querySelector('.agent-empty-state');
  if (emptyState) emptyState.remove();

  // Append user bubble and clear input immediately
  const userMsg = document.createElement('div');
  userMsg.className = 'agent-message user';
  userMsg.textContent = text;
  agentMessages.appendChild(userMsg);
  agentInput.value = '';
  agentMessages.scrollTop = agentMessages.scrollHeight;

  // Show loading indicator — will be mutated into result/error bubble
  const replyMsg = document.createElement('div');
  replyMsg.className = 'agent-message loading';
  replyMsg.textContent = 'Thinking…';
  agentMessages.appendChild(replyMsg);
  agentMessages.scrollTop = agentMessages.scrollHeight;

  try {
    const helpKeywords = [
      'shortcut', 'shortcuts', 'keybind', 'keybinds', 'keyboard',
      'hotkey', 'hotkeys', 'how do i', 'how to', 'what key', 'what keys',
      'help', 'command', 'keys for', 'key for',
    ];
    const isHelpQuery = helpKeywords.some(kw => text.toLowerCase().includes(kw));

    if (isHelpQuery) {
      const { response, error: helpError } = await Promise.race([
        window.api.intelligenceQueryHelp(text),
        agentTimeoutPromise,
      ]);
      if (helpError) {
        replyMsg.className = 'agent-message error';
        replyMsg.textContent = helpError;
        return { ok: false, errorMessage: helpError };
      }
      replyMsg.className = 'agent-message assistant';
      replyMsg.textContent = response;
      return { ok: true };
    }

    // Notes context: use current filter state; fall back to all notes if list is empty
    const notesContext = notes.length > 0 ? notes : await window.api.getNotes();

    // Step 1: LLM → structured action array
    const { actions, error: llmError } = await Promise.race([
      window.api.intelligenceQueryStructured(text, notesContext),
      agentTimeoutPromise,
    ]);

    if (llmError) {
      replyMsg.className = 'agent-message error';
      replyMsg.textContent = llmError;
      return { ok: false, errorMessage: llmError };
    }

    // Step 2: execute actions
    const execResult = await Promise.race([
      window.api.intelligenceExecute(actions),
      agentTimeoutPromise,
    ]);

    // Debug: log to console
    console.log('[Easy Jot Agent] Actions:', actions);
    console.log('[Easy Jot Agent] Result:', execResult);

    // Step 3: refresh UI
    await loadJots();
    await loadFolders();

    // Step 4: show summary + actions debug
    replyMsg.className = 'agent-message assistant';
    replyMsg.innerHTML = '';
    const summaryEl = document.createElement('div');
    summaryEl.className = 'agent-summary';
    summaryEl.textContent = buildActionSummary(actions, execResult);
    replyMsg.appendChild(summaryEl);
    const debugEl = document.createElement('div');
    debugEl.className = 'agent-actions-debug';
    debugEl.textContent = formatActionsDebug(actions);
    replyMsg.appendChild(debugEl);
    return { ok: true };
  } catch (err) {
    replyMsg.className = 'agent-message error';
    replyMsg.textContent = err.message || 'Something went wrong.';
    return { ok: false, errorMessage: err.message || 'Something went wrong.' };
  } finally {
    clearTimeout(agentTimeoutId);
    agentInput.disabled = false;
    agentSendBtn.disabled = false;
    agentMessages.scrollTop = agentMessages.scrollHeight;
    agentInput.focus();
    saveAgentChat();
  }
}

function buildActionSummary(actions, execResult) {
  if (!execResult.success && execResult.results.length === 0) {
    return `Error: ${execResult.errors.map(e => e.error).join('; ')}`;
  }

  let noteCount = 0, folderCount = 0, movedCount = 0, searchCount = 0, searchRan = false,
      organizeGroups = 0, remindersCount = 0, deletedCount = 0;

  for (const r of execResult.results) {
    switch (r.type) {
      case 'create_note':          noteCount++; break;
      case 'create_folder':        folderCount++; break;
      case 'move_note_to_folder':  movedCount++; break;
      case 'search':               searchRan = true; searchCount += r.result?.count ?? 0; break;
      case 'organize_into_folders':
        organizeGroups += Array.isArray(r.result) ? r.result.length : 1;
        movedCount += (r.result || []).reduce((s, g) => s + (g.movedNoteIds?.length || 0), 0);
        break;
      case 'list_reminders':       remindersCount = r.result?.count ?? 0; break;
      case 'search_reminders':     remindersCount = r.result?.count ?? 0; break;
      case 'toggle_reminder':      break;
      case 'delete_reminder':      deletedCount++; break;
    }
  }

  const parts = [];
  if (noteCount)       parts.push(`Created ${noteCount} note${noteCount > 1 ? 's' : ''}`);
  if (folderCount)     parts.push(`Created ${folderCount} folder${folderCount > 1 ? 's' : ''}`);
  if (organizeGroups)  parts.push(`Organized into ${organizeGroups} folder${organizeGroups > 1 ? 's' : ''}`);
  else if (movedCount) parts.push(`Moved ${movedCount} note${movedCount > 1 ? 's' : ''}`);
  if (searchRan && searchCount > 0) parts.push(`Found ${searchCount} matching note${searchCount !== 1 ? 's' : ''}`);
  if (remindersCount > 0) parts.push(`${remindersCount} reminder${remindersCount !== 1 ? 's' : ''}`);
  if (deletedCount > 0) parts.push(`Deleted ${deletedCount} item${deletedCount !== 1 ? 's' : ''}`);
  if (execResult.errors.length > 0) {
    parts.push(`${execResult.errors.length} action${execResult.errors.length > 1 ? 's' : ''} failed`);
  }

  if (parts.length > 0) return `Done: ${parts.join(', ')}.`;
  // Fallback: list action types when no counts apply
  const types = execResult.results.map(r => r.type).filter(Boolean);
  return types.length > 0 ? `Done: ran ${types.join(', ')}.` : 'Done.';
}

function formatActionsDebug(actions) {
  if (!actions || actions.length === 0) return '';
  return 'Actions: ' + actions.map(a => {
    const p = a.payload;
    switch (a.type) {
      case 'search':               return `search("${(p?.query || '').slice(0, 30)}")`;
      case 'create_note':          return `create_note(${(p?.content || '').slice(0, 40)}…)`;
      case 'create_folder':        return `create_folder("${p?.name || ''}")`;
      case 'move_note_to_folder':  return `move_note(${p?.noteId} → ${p?.folderId})`;
      case 'organize_into_folders': return `organize(${Array.isArray(p) ? p.length : 0} folders)`;
      default:                     return a.type;
    }
  }).join(', ');
}

agentSendBtn.addEventListener('click', sendAgentMessage);

agentInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    sendAgentMessage();
  }
});

// Stop key events in the agent panel from bubbling to the jot editor (fixes Enter inserting into note)
agentPanel.addEventListener('keydown', (e) => {
  if (!e.target.closest('#agent-panel')) return;
  if ((e.metaKey && (e.key === 'j' || e.key === 'Tab')) || e.key === 'Escape') return; // allow pane-switch shortcuts to propagate
  e.stopPropagation();
});

// ── Folder functions ──

function renderFolderBar() {
  folderBar.querySelectorAll('.folder-pill-dynamic').forEach(el => el.remove());

  if (folders.length === 0 && !folderOrganizeOpen) {
    folderBar.classList.add('hidden');
    return;
  }
  if (folderOrganizeOpen) {
    folderBar.classList.add('hidden');
  } else {
    folderBar.classList.remove('hidden');
  }

  folders.forEach(folder => {
    const btn = document.createElement('button');
    btn.className = 'folder-pill folder-pill-dynamic';
    btn.dataset.folder = folder.id;
    btn.textContent = folder.name;
    folderBar.insertBefore(btn, newFolderBtn);
  });

  folderBar.querySelectorAll('.folder-pill').forEach(btn => {
    const val = btn.dataset.folder;
    const isActive =
      (val === 'all'     && currentFolderFilter === 'all') ||
      (val === 'unfiled' && currentFolderFilter === null)  ||
      (Number(val)       === currentFolderFilter);
    btn.classList.toggle('active', isActive);
  });
}

async function loadFolders() {
  folders = await window.api.getFolders();
  renderFolderBar();
  updateFolderMoveSelector();
}

function updateFolderMoveSelector() {
  if (folders.length === 0) {
    folderMove.classList.add('hidden');
    return;
  }
  folderMove.classList.remove('hidden');
  folderMove.innerHTML = '<option value="">Unfiled</option>';
  folders.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.name;
    folderMove.appendChild(opt);
  });
  folderMove.value = currentNote?.folder_id ?? '';
}

folderMove.addEventListener('change', async () => {
  if (!currentNote) return;
  const folderId = folderMove.value === '' ? null : Number(folderMove.value);
  await window.api.updateNoteFolder(currentNote.id, folderId);
  currentNote.folder_id = folderId;
});

folderBar.addEventListener('click', async (e) => {
  const pill = e.target.closest('.folder-pill:not(.folder-pill-add)');
  if (!pill) return;
  const val = pill.dataset.folder;
  setFolderFilter(val === 'all' ? 'all' : val === 'unfiled' ? null : Number(val));
  renderFolderBar();
  if (folderOrganizeOpen) {
    await renderFolderOrganizeJots();
  } else {
    await loadJots();
  }
});

newFolderBtn.addEventListener('click', () => {
  newFolderBtn.classList.add('hidden');
  newFolderInput.classList.remove('hidden');
  newFolderInput.value = '';
  newFolderInput.focus();
});

async function confirmNewFolder() {
  const name = newFolderInput.value.trim();
  newFolderInput.classList.add('hidden');
  newFolderBtn.classList.remove('hidden');
  if (!name) return;
  await window.api.createFolder(name);
  await loadFolders();
}

newFolderInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter')  { e.preventDefault(); confirmNewFolder(); }
  if (e.key === 'Escape') { e.preventDefault(); newFolderInput.classList.add('hidden'); newFolderBtn.classList.remove('hidden'); }
});
newFolderInput.addEventListener('blur', confirmNewFolder);

// ── Folder organize view ──

function renderFolderOrganizeFilter() {
  folderOrganizeFilter.innerHTML = '';
  const filters = [
    { val: 'all', label: 'All' },
    { val: 'unfiled', label: 'Unfiled' },
    ...folders.map(f => ({ val: String(f.id), label: f.name })),
  ];
  filters.forEach(({ val, label }) => {
    const btn = document.createElement('button');
    btn.className = 'folder-pill folder-organize-filter-pill';
    btn.dataset.folder = val;
    btn.textContent = label;
    const isActive =
      (val === 'all'     && currentFolderFilter === 'all') ||
      (val === 'unfiled' && currentFolderFilter === null)  ||
      (Number(val)       === currentFolderFilter);
    btn.classList.toggle('active', isActive);
    btn.addEventListener('click', async () => {
      setFolderFilter(val === 'all' ? 'all' : val === 'unfiled' ? null : Number(val));
      renderFolderOrganizeFilter();
      await renderFolderOrganizeJots();
    });
    folderOrganizeFilter.appendChild(btn);
  });
}

async function openFolderOrganizeView() {
  folderOrganizeOpen = true;
  noteList.classList.add('hidden');
  noteList.style.display = 'none';
  folderBar.classList.add('hidden');
  editor.classList.add('hidden');
  folderOrganizeView.classList.remove('hidden');
  await loadFolders();
  renderFolderOrganizeFilter();
  await renderFolderOrganizeJots();
}

function closeFolderOrganizeView() {
  folderOrganizeOpen = false;
  folderOrganizeView.classList.add('hidden');
  noteList.classList.remove('hidden');
  noteList.style.display = '';
  if (folders.length > 0) folderBar.classList.remove('hidden');
  else folderBar.classList.add('hidden');
  loadJots();
}

async function renderFolderOrganizeJots() {
  const folderNotes = currentFolderFilter === 'all'
    ? await window.api.getNotes()
    : await window.api.getNotesByFolder(currentFolderFilter);

  folderOrganizeContent.innerHTML = '';
  selectedIndex = Math.min(selectedIndex, Math.max(0, folderNotes.length - 1));

  if (folderNotes.length === 0) {
    folderOrganizeContent.innerHTML = '<div class="empty-state">No jots in this folder</div>';
    return;
  }

  folderNotes.forEach((note, index) => {
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
    folderOrganizeContent.appendChild(div);
  });
}

folderBtn.addEventListener('click', () => {
  if (folderOrganizeOpen) {
    closeFolderOrganizeView();
  } else {
    openFolderOrganizeView();
  }
});

folderOrganizeNewBtn.addEventListener('click', async () => {
  const name = folderOrganizeNewInput.value.trim();
  if (!name) return;
  const description = folderOrganizeDescInput.value.trim();
  folderOrganizeNewInput.value = '';
  folderOrganizeDescInput.value = '';
  await window.api.createFolder(name, description);
  await loadFolders();
  if (folderOrganizeOpen) renderFolderOrganizeFilter();
  else renderFolderBar();
  await renderFolderOrganizeJots();
});

folderOrganizeNewInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    folderOrganizeNewBtn.click();
  }
});

folderOrganizeDescInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    folderOrganizeNewBtn.click();
  }
});

restoreAgentChat();
showAgentPanel();
loadFolders();
loadJots();

// ════════════════════════════════════════════════════════════════════════════
// AUDIO PLAYBACK (TTS)
// ════════════════════════════════════════════════════════════════════════════

let _audioCtx = null;
function getAudioContext() {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new AudioContext();
  }
  return _audioCtx;
}

/**
 * Play a WAV ArrayBuffer returned by the TTS IPC handler.
 * Silently skips if audioData is null (TTS not configured).
 */
async function playAudioBuffer(audioData) {
  if (!audioData) return;
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    const decoded = await ctx.decodeAudioData(audioData.slice(0)); // defensive copy
    const source = ctx.createBufferSource();
    source.buffer = decoded;
    source.connect(ctx.destination);
    source.start(0);
  } catch (err) {
    console.warn('[tts playback]', err.message);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// VOICE CAPTURE & INTENT MEMORY
// ════════════════════════════════════════════════════════════════════════════

let mediaRecorder = null;
let audioChunks = [];
let pendingTranscript = null; // transcript awaiting user confirmation
let voiceActive = false;      // true while recording
let cmdMActive  = false;      // true while Cmd+M voice command is recording
let triggerNotifTimeout = null;

// ── Voice bar state machine ──────────────────────────────────────────────

function setVoiceBarState(state) {
  [voiceStateRecording, voiceStateProcessing, voiceStateReview, voiceStateSuccess, voiceStateError]
    .forEach(el => el.classList.remove('active'));

  voiceBar.classList.toggle('hidden', state === 'hidden');
  if (state !== 'hidden') {
    const el = document.getElementById(`voice-state-${state}`);
    if (el) el.classList.add('active');
  }
}

// ── Start / Stop recording ───────────────────────────────────────────────

async function startVoiceRecording() {
  if (voiceActive) return;
  if (cmdMActive) return;

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    showVoiceError('Microphone access denied. Grant access in System Preferences → Privacy → Microphone.');
    return;
  }

  const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg']
    .find(t => MediaRecorder.isTypeSupported(t)) || '';

  audioChunks = [];
  mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
  mediaRecorder.start(100);

  voiceActive = true;
  voiceBtn.classList.add('recording');
  setVoiceBarState('recording');
}

async function stopVoiceRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;

  setVoiceBarState('processing');
  voiceProcessingLabel.textContent = 'Transcribing…';
  voiceBtn.classList.remove('recording');
  voiceActive = false;

  await new Promise((resolve) => {
    mediaRecorder.onstop = resolve;
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
  });

  const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
  const arrayBuffer = await blob.arrayBuffer();

  // Transcribe via Smallest AI Pulse (OpenAI is agent-only, not STT)
  const { transcript, words, provider, error: transcribeError } = await window.api.transcribeAudio(arrayBuffer);
  if (transcribeError) {
    showVoiceError(transcribeError);
    return;
  }
  if (!transcript || !transcript.trim()) {
    showVoiceError('No speech detected. Please speak clearly and try again.');
    return;
  }

  // Show transcript with provider badge
  pendingTranscript = transcript.trim();
  voiceTranscriptText.textContent = `"${pendingTranscript}"`;
  // Show which STT provider was used (subtle indicator)
  const badge = voiceTranscriptText.parentElement.querySelector('.stt-badge');
  if (badge) badge.textContent = provider === 'pulse' ? 'Pulse STT' : 'STT';

  setVoiceBarState('review');
}

function showVoiceError(message) {
  voiceErrorText.textContent = message;
  voiceBtn.classList.remove('recording');
  voiceActive = false;
  setVoiceBarState('error');
}

async function saveVoiceMemory() {
  if (!pendingTranscript) return;

  setVoiceBarState('processing');
  voiceProcessingLabel.textContent = 'Saving your jot…';

  const note = await window.api.createNote(pendingTranscript);
  if (!note || !note.id) {
    showVoiceError('Could not save jot.');
    return;
  }

  pendingTranscript = null;
  setVoiceBarState('success');

  await loadJots();

  // Auto-dismiss success after 2.5s
  setTimeout(() => {
    if (!voiceActive) setVoiceBarState('hidden');
  }, 2500);
}

function dismissVoiceBar() {
  pendingTranscript = null;
  voiceActive = false;
  voiceBtn.classList.remove('recording');
  setVoiceBarState('hidden');
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
    mediaRecorder.stop();
  }
}

// ── Toggle voice (button or global hotkey) ───────────────────────────────

function toggleVoiceCapture() {
  if (voiceActive) {
    stopVoiceRecording();
  } else if (!voiceBar.classList.contains('hidden')) {
    dismissVoiceBar();
  } else {
    startVoiceRecording();
  }
}

// ── Event wiring ─────────────────────────────────────────────────────────

voiceBtn.addEventListener('click', toggleVoiceCommand);
voiceStopBtn.addEventListener('click', stopVoiceRecording);
voiceSaveBtn.addEventListener('click', saveVoiceMemory);
voiceDismissBtn.addEventListener('click', dismissVoiceBar);
voiceErrorDismissBtn.addEventListener('click', dismissVoiceBar);

// ════════════════════════════════════════════════════════════════════════════
// CONTEXT NOTIFICATION (workflow watcher — keyword-matched notes only)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Render the context notification from a result payload (notes whose text matches this screen).
 * appName: frontmost app / tab context for the "why" line.
 */
function showTriggerNotification(result, isAuto = false, appName = null) {
  triggerNotificationIcon.textContent  = result.icon;
  triggerNotificationLabel.textContent = result.label + (isAuto ? ' (auto)' : '');
  triggerNotificationMemories.innerHTML = '';

  result.memories.forEach((mem) => {
    const item = document.createElement('div');
    item.className = 'trigger-memory-item';

    const contentRow = document.createElement('div');
    contentRow.className = 'memory-content-row';
    contentRow.innerHTML = `<div class="memory-category">${escapeHtml(mem.category || 'note')}</div>
      <div class="memory-text">${escapeHtml(mem.content)}</div>`;
    item.appendChild(contentRow);

    if (mem.id) {
      const actions = document.createElement('div');
      actions.className = 'memory-actions';

      const snoozeBtn = document.createElement('button');
      snoozeBtn.className = 'memory-action-btn';
      snoozeBtn.textContent = 'Snooze 30m';
      snoozeBtn.title = 'Hide for 30 minutes';
      snoozeBtn.addEventListener('click', async () => {
        await window.api.snoozeContextNote(mem.id, 30);
        item.remove();
        if (!triggerNotificationMemories.querySelector('.trigger-memory-item')) {
          closeTriggerNotification();
        }
      });
      actions.appendChild(snoozeBtn);

      const doneBtn = document.createElement('button');
      doneBtn.className = 'memory-action-btn';
      doneBtn.textContent = 'Done';
      doneBtn.title = 'Suppress from future auto-surfacing';
      doneBtn.addEventListener('click', async () => {
        await window.api.dismissContextNote(mem.id);
        item.remove();
        if (!triggerNotificationMemories.querySelector('.trigger-memory-item')) {
          closeTriggerNotification();
        }
      });
      actions.appendChild(doneBtn);

      const whyBtn = document.createElement('button');
      whyBtn.className = 'memory-action-btn memory-why-btn';
      whyBtn.textContent = 'Why?';
      whyBtn.title = 'Why did I see this?';
      const whyText = document.createElement('div');
      whyText.className = 'memory-why-text hidden';
      whyText.textContent = isAuto && appName
        ? `Matched a keyword in your note while you were in ${appName}. Note #${mem.id}.`
        : `Surfaced for ${result.label}.`;
      whyBtn.addEventListener('click', () => {
        whyText.classList.toggle('hidden');
      });
      actions.appendChild(whyBtn);
      item.appendChild(whyText);
      item.appendChild(actions);
    }

    triggerNotificationMemories.appendChild(item);
  });

  triggerNotification.classList.remove('hidden');

  playAudioBuffer(result.audioData);

  clearTimeout(triggerNotifTimeout);
  triggerNotifTimeout = setTimeout(closeTriggerNotification, 8000);
}

function closeTriggerNotification() {
  clearTimeout(triggerNotifTimeout);
  triggerNotification.classList.add('hidden');
}

triggerNotificationClose.addEventListener('click', closeTriggerNotification);

// Workflow watcher: auto-surface when main process detects frontmost app change
window.api.onWorkflowTrigger((result) => {
  if (result.error) {
    console.warn('[workflow-trigger] error:', result.error);
    return;
  }
  if (!result.memories || result.memories.length === 0) return; // nothing to show
  showTriggerNotification(result, true, result.appName || null);
});

// ════════════════════════════════════════════════════════════════════════════
// CONFIG STATUS — show setup hint if no API keys configured
// ════════════════════════════════════════════════════════════════════════════

async function checkConfigStatus() {
  const status = await window.api.getConfigStatus().catch(() => null);
  if (!status) return;

  const configBar = document.getElementById('config-bar');
  if (!configBar) return;

  const agentOn = status.hasOpenAI || status.useOllama;
  const voiceOn = status.hasSmallest;

  if (!agentOn && !voiceOn) {
    configBar.textContent = 'No API keys configured — voice and AI features disabled. '
      + 'Copy ~/Library/Application Support/easy-jot/config.json from config.example.json in the repo '
      + 'and add openaiApiKey (or set useOllama:true) and smallestAiKey. '
      + 'Env vars: EASY_JOT_OPENAI_API_KEY, SMALLEST_AI_KEY.';
    configBar.classList.remove('hidden');
  } else if (voiceOn && agentOn) {
    configBar.textContent = `✓ Smallest AI: ${(status.sttProvider || 'pulse').toUpperCase()} + TTS · GPT agent`;
    configBar.classList.remove('hidden');
    setTimeout(() => configBar.classList.add('hidden'), 4500);
  } else if (voiceOn) {
    configBar.textContent = '✓ Smallest AI voice + TTS — add openaiApiKey for GPT agent';
    configBar.classList.remove('hidden');
  } else {
    configBar.textContent = '⚙️ GPT agent — add smallestAiKey for voice (Pulse STT + TTS)';
    configBar.classList.remove('hidden');
  }
}

checkConfigStatus();

// ════════════════════════════════════════════════════════════════════════════
// REMINDER MODAL & NOTIFICATION
// ════════════════════════════════════════════════════════════════════════════

const reminderNotif = document.getElementById('reminder-notification');
const reminderNotifClose = document.getElementById('reminder-notification-close');
const reminderNotifContent = document.getElementById('reminder-notification-content');
let reminderNotifTimeout = null;

// ── NL parsing (client-side regex — mirrors reminderParser.js logic) ──────

function parseTimeString(timeStr) {
  const m = timeStr.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m) return null;
  let hours = parseInt(m[1], 10);
  const minutes = m[2] ? parseInt(m[2], 10) : 0;
  const meridiem = m[3] ? m[3].toUpperCase() : null;
  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

function todayOrTomorrowAt(hours, minutes) {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setHours(hours, minutes);
  if (d <= new Date()) d.setDate(d.getDate() + 1);
  return d;
}

function extractReminderContent(text, patterns) {
  let out = text;
  for (const pat of patterns) out = out.replace(pat, '').trim();
  out = out.replace(/^(to\s+|that\s+|me\s+that\s+|me\s+to\s+)/i, '').trim();
  return out || text.trim();
}

function parseReminderNLClient(input) {
  if (!input.trim()) return null;

  const inRel = input.match(/\bin\s+(\d+)\s+(minute|minutes|mins?|hour|hours|hr|hrs)\b/i);
  if (inRel) {
    const amount = parseInt(inRel[1], 10);
    const d = new Date();
    if (inRel[2].toLowerCase().startsWith('h')) d.setHours(d.getHours() + amount);
    else d.setMinutes(d.getMinutes() + amount);
    return {
      content: extractReminderContent(input, [/\bin\s+\d+\s+(minute|minutes|mins?|hour|hours|hr|hrs)\b/i]),
      scheduleType: 'once',
      scheduledTime: d.toISOString(),
    };
  }

  const daily = input.match(/\b(?:every\s+day|daily)\s+at\s+([\d]{1,2}(?::\d{2})?\s*(?:AM|PM)?)\b/i);
  if (daily) {
    const parsed = parseTimeString(daily[1].trim());
    if (parsed) {
      const hhmm = `${String(parsed.hours).padStart(2,'0')}:${String(parsed.minutes).padStart(2,'0')}`;
      return {
        content: extractReminderContent(input, [
          /\bevery\s+day\s+at\s+[\d]{1,2}(?::\d{2})?\s*(?:AM|PM)?\b/i,
          /\bdaily\s+at\s+[\d]{1,2}(?::\d{2})?\s*(?:AM|PM)?\b/i,
        ]),
        scheduleType: 'daily',
        scheduledTime: hhmm,
      };
    }
  }

  const tomorrow = input.match(/\btomorrow\s+at\s+([\d]{1,2}(?::\d{2})?\s*(?:AM|PM)?)\b/i);
  if (tomorrow) {
    const parsed = parseTimeString(tomorrow[1].trim());
    if (parsed) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(parsed.hours, parsed.minutes, 0, 0);
      return {
        content: extractReminderContent(input, [/\btomorrow\s+at\s+[\d]{1,2}(?::\d{2})?\s*(?:AM|PM)?\b/i]),
        scheduleType: 'once',
        scheduledTime: d.toISOString(),
      };
    }
  }

  const atTime = input.match(/\bat\s+([\d]{1,2}(?::\d{2})?\s*(?:AM|PM)?)\b/i);
  if (atTime) {
    const parsed = parseTimeString(atTime[1].trim());
    if (parsed) {
      const d = todayOrTomorrowAt(parsed.hours, parsed.minutes);
      return {
        content: extractReminderContent(input, [/\bat\s+[\d]{1,2}(?::\d{2})?\s*(?:AM|PM)?\b/i]),
        scheduleType: 'once',
        scheduledTime: d.toISOString(),
      };
    }
  }

  return null; // not parsed
}

// ── Reminder notification ─────────────────────────────────────────────────

function showReminderNotification(content) {
  reminderNotifContent.textContent = content;
  reminderNotif.classList.remove('hidden');
  clearTimeout(reminderNotifTimeout);
  reminderNotifTimeout = setTimeout(closeReminderNotification, 10000);
}

function closeReminderNotification() {
  clearTimeout(reminderNotifTimeout);
  reminderNotif.classList.add('hidden');
}

reminderNotifClose.addEventListener('click', closeReminderNotification);

// ── Push event from scheduler ─────────────────────────────────────────────

window.api.onReminderDue(async ({ content, audioData, noteId, showOnlyThisNote }) => {
  showReminderNotification(content);
  playAudioBuffer(audioData);
  if (noteId != null && showOnlyThisNote) {
    focusNoteId = noteId;
  }
  await loadJots();
  if (noteId != null && showOnlyThisNote && notes.length > 0) {
    const jot = notes.find((j) => j.jotType === 'note' && j.id === noteId);
    if (jot) {
      selectedIndex = notes.indexOf(jot);
      updateSelectionHighlight();
      openNote(jot);
    }
  } else if (focusNoteId == null) {
    updateSelectionHighlight();
  }
});

// ════════════════════════════════════════════════════════════════════════════
// UNIVERSAL VOICE COMMAND (Cmd+M)
// ════════════════════════════════════════════════════════════════════════════

let cmdMediaRecorder     = null;
let cmdAudioChunks       = [];
let cmdPendingTranscript = null;

function setVoiceCmdState(state) {
  voiceCmdBar.classList.toggle('hidden', state === 'hidden');
  vcmdStateRecording.classList.toggle('active',  state === 'recording');
  vcmdStateProcessing.classList.toggle('active', state === 'processing');
  vcmdStateConfirm.classList.toggle('active',    state === 'confirm');
  vcmdStateSuccess.classList.toggle('active',    state === 'success');
  vcmdStateError.classList.toggle('active',      state === 'error');
}

async function startVoiceCmd() {
  if (cmdMActive) { stopVoiceCmd(); return; }
  if (voiceActive) return; // dedicated voice bar recording in progress

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    showVoiceCmdError('Microphone access denied.');
    return;
  }

  cmdAudioChunks = [];
  cmdMediaRecorder = new MediaRecorder(stream);
  cmdMediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) cmdAudioChunks.push(e.data); };
  cmdMediaRecorder.start(100);

  cmdMActive = true;
  setVoiceCmdState('recording');
}

// Stop recording → transcribe → show confirm (Send / Redo / Close)
async function stopVoiceCmd() {
  if (!cmdMActive || !cmdMediaRecorder) return;

  setVoiceCmdState('processing');
  vcmdProcessingLabel.textContent = 'Transcribing…';
  cmdMActive = false;

  await new Promise((resolve) => { cmdMediaRecorder.onstop = resolve; cmdMediaRecorder.stop(); });
  cmdMediaRecorder.stream.getTracks().forEach((t) => t.stop());
  cmdMediaRecorder = null;

  const blob = new Blob(cmdAudioChunks, { type: 'audio/webm' });
  cmdAudioChunks = [];
  const ab = await blob.arrayBuffer();

  const { transcript, error: sttErr } = await window.api.transcribeAudio(ab);
  if (sttErr || !transcript) {
    showVoiceCmdError(sttErr || 'Could not understand audio.');
    return;
  }

  // Show transcript for review before executing
  cmdPendingTranscript = transcript;
  vcmdTranscriptText.textContent = `"${transcript}"`;
  setVoiceCmdState('confirm');
}

// Classify + execute the confirmed transcript
async function sendVoiceCmd() {
  const transcript = cmdPendingTranscript;
  if (!transcript) return;
  cmdPendingTranscript = null;

  setVoiceCmdState('processing');
  vcmdProcessingLabel.textContent = 'Processing…';

  const { classification, error: clsErr } = await window.api.classifyVoiceCommand(transcript);
  if (clsErr || !classification) {
    showVoiceCmdError(clsErr || 'Classification failed.');
    return;
  }

  await executeCmdClassification(transcript, classification);
}

async function executeCmdClassification(rawTranscript, classification) {
  const { mode, payload } = classification;
  if (mode === 'scheduled') {
    await executeCmdScheduled(payload, rawTranscript);
  } else if (mode === 'dictate') {
    await executeCmdDictate(payload.text || rawTranscript);
  } else if (mode === 'app_control') {
    await executeCmdAppControl(payload);
  } else if (mode === 'agent') {
    await executeCmdAgent(payload.query || rawTranscript);
  } else if (mode === 'error') {
    showVoiceCmdError(payload.message || 'Voice command failed.');
  } else {
    showVoiceCmdError(`Unknown voice mode: ${mode}`);
  }
}

async function executeCmdScheduled(payload, rawTranscript) {
  // LLM gives us the structured payload; fall back to client NL parser if time is missing
  let { content, scheduleType, scheduledTime } = payload;
  if (!scheduledTime) {
    const parsed = parseReminderNLClient(rawTranscript);
    if (parsed) { content = parsed.content; scheduleType = parsed.scheduleType; scheduledTime = parsed.scheduledTime; }
  }
  if (!scheduledTime) { showVoiceCmdError('Could not determine the time. Try "at 10 PM remind me to…"'); return; }
  const { reminder, error } = await window.api.createScheduledReminder({ content, scheduleType, scheduledTime });
  if (error) { showVoiceCmdError(error); return; }
  await loadJots();
  showVoiceCmdSuccess('⏰', 'Jot saved');
}

// Strip meta-instruction prefixes the LLM sometimes leaves in dictated text.
// e.g. "make a note saying watch Breaking Bad" → "watch Breaking Bad"
function stripDictatePrefix(text) {
  const prefixes = [
    /^make a note (saying|that says|that|:)\s*/i,
    /^create a note (saying|that says|that|:)\s*/i,
    /^write a note (saying|that says|that|:)\s*/i,
    /^add a note (saying|that says|that|:)\s*/i,
    /^note (that says|saying|that|:)\s*/i,
    /^jot (down|this down|this)(\s+that|\s+saying|\s*:)?\s*/i,
    /^write (down|this down|this)(\s+that|\s+saying|\s*:)?\s*/i,
    /^(write|add|note)\s*:\s*/i,
  ];
  let s = text.trim();
  for (const re of prefixes) {
    const m = s.match(re);
    if (m) { s = s.slice(m[0].length).trim(); break; }
  }
  return s || text.trim();
}

async function executeCmdDictate(text) {
  const cleaned = stripDictatePrefix(text);
  const focused = document.activeElement;
  if (focused && (focused.tagName === 'TEXTAREA' || focused.tagName === 'INPUT') && focused !== agentInput) {
    // Insert at cursor position in active text field
    const start = focused.selectionStart;
    const end   = focused.selectionEnd;
    const before = focused.value.substring(0, start);
    const after  = focused.value.substring(end);
    focused.value = before + cleaned + after;
    focused.selectionStart = focused.selectionEnd = start + cleaned.length;
    focused.dispatchEvent(new Event('input', { bubbles: true }));
    showVoiceCmdSuccess('✏️', 'Inserted');
  } else {
    // Create a new jot with the dictated text
    const note = await window.api.createNote(cleaned);
    await loadJots(note.id, 'note');
    openNote(note);
    showVoiceCmdSuccess('📝', 'Jot created');
  }
}

async function executeCmdAppControl(payload) {
  const action = payload.action;
  const params = payload.params || {};
  switch (action) {
    case 'back':
      if (currentNote) await showList();
      else if (currentJotDetail) { currentJotDetail = null; jotDetailView.classList.add('hidden'); noteList.classList.remove('hidden'); loadJots(); }
      break;
    case 'new_note': {
      const note = await window.api.createNote('');
      openNote(note);
      break;
    }
    case 'delete':
      if (currentNote && !currentNote.jotType) {
        deletedNotesStack.push({ ...currentNote });
        await window.api.deleteNote(currentNote.id);
        currentNote = null;
        await showList();
      }
      break;
    case 'undo':
      if (deletedNotesStack.length > 0) {
        const note = deletedNotesStack.pop();
        await window.api.restoreNote(note);
        await loadJots();
      }
      break;
    case 'focus_agent':
      showAgentPanel();
      break;
    case 'open_folder_view':
      if (!folderOrganizeOpen) openFolderOrganizeView();
      break;
    case 'close_view':
      if (currentNote) await showList();
      else if (folderOrganizeOpen) closeFolderOrganizeView();
      break;
    case 'navigate': {
      const dir   = params.direction === 'up' ? -1 : 1;
      const count = Math.max(1, params.count || 1);
      if (isListVisible()) {
        selectedIndex = Math.max(0, Math.min(notes.length - 1, selectedIndex + dir * count));
        updateSelectionHighlight();
      }
      break;
    }
    default:
      showVoiceCmdError(`Unknown action: ${action}`);
      return;
  }
  showVoiceCmdSuccess('✅', `Done: ${String(action).replace(/_/g, ' ')}`);
}

async function executeCmdAgent(query) {
  showAgentPanel();
  agentInput.value = query;
  agentInput.focus();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const result = await sendAgentMessage();
  if (result.skipped) {
    showVoiceCmdError('Nothing to send to the agent.');
    return;
  }
  if (!result.ok) {
    showVoiceCmdError(result.errorMessage || 'Agent request failed — see agent panel.');
    return;
  }
  showVoiceCmdSuccess('🤖', 'Agent finished');
}

function showVoiceCmdSuccess(icon, text) {
  vcmdSuccessIcon.textContent = icon;
  vcmdSuccessText.textContent = text;
  setVoiceCmdState('success');
  setTimeout(() => {
    if (!cmdMActive) setVoiceCmdState('hidden');
  }, 2000);
}

function showVoiceCmdError(message) {
  vcmdErrorText.textContent = message;
  cmdMActive = false;
  setVoiceCmdState('error');
}

function dismissVoiceCmd() {
  cmdMActive = false;
  cmdPendingTranscript = null;
  if (cmdMediaRecorder && cmdMediaRecorder.state !== 'inactive') {
    cmdMediaRecorder.stop();
    cmdMediaRecorder.stream.getTracks().forEach((t) => t.stop());
  }
  cmdMediaRecorder = null;
  cmdAudioChunks   = [];
  setVoiceCmdState('hidden');
}

function toggleVoiceCommand() {
  if (cmdMActive) {
    stopVoiceCmd();                                        // recording → confirm
  } else if (cmdPendingTranscript) {
    sendVoiceCmd();                                        // confirm → execute
  } else if (!voiceCmdBar.classList.contains('hidden')) {
    dismissVoiceCmd();                                     // dismiss any other state
  } else {
    startVoiceCmd();                                       // start fresh
  }
}

vcmdStopBtn.addEventListener('click', stopVoiceCmd);
vcmdSendBtn.addEventListener('click', sendVoiceCmd);
vcmdRedoBtn.addEventListener('click', () => { cmdPendingTranscript = null; startVoiceCmd(); });
vcmdCloseBtn.addEventListener('click', dismissVoiceCmd);
vcmdErrorDismissBtn.addEventListener('click', dismissVoiceCmd);

window.api.onToggleVoiceCommand(toggleVoiceCommand);
