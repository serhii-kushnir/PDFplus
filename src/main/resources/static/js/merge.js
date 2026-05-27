pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

let selectedFiles = [];
let selectedIndices = new Set();
let sortable = null;
let wasSizeLimitExceeded = false;
const MAX_FILE_SIZE_MB = 100;
const MAX_TOTAL_SIZE_MB = 100;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// IndexedDB
let db = null;
const DB_NAME = 'PDFMergeSession';
const STORE_NAME = 'files';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
    });
}

async function saveSessionToIndexedDB() {
    if (!db) await openDB();
    // 1. Підготуємо дані за межами транзакції (щоб уникнути асинхронності всередині)
    const itemsToStore = [];
    for (let i = 0; i < selectedFiles.length; i++) {
        const item = selectedFiles[i];
        if (!item.file) continue;
        const blob = await item.file.arrayBuffer().then(buf => new Blob([buf], { type: 'application/pdf' }));
        itemsToStore.push({
            id: i,
            name: item.name,
            size: item.size,
            pageCount: item.pageCount,
            thumbnailUrl: item.thumbnailUrl,
            fileBlob: blob
        });
    }
    if (itemsToStore.length === 0) return;

    // 2. Відкриваємо транзакцію
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // 3. Очищення сховища
    await new Promise((resolve, reject) => {
        const clearReq = store.clear();
        clearReq.onsuccess = () => resolve();
        clearReq.onerror = () => reject(clearReq.error);
    });

    // 4. Запис усіх елементів
    const putPromises = itemsToStore.map(item => {
        return new Promise((resolve, reject) => {
            const putReq = store.put(item);
            putReq.onsuccess = () => resolve();
            putReq.onerror = () => reject(putReq.error);
        });
    });
    await Promise.all(putPromises);

    // 5. Дочекаємося завершення транзакції
    await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}


function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
    });
}

// DOM elements
const uploader = document.getElementById('uploader');
const fileInput = document.getElementById('fileInput');
const pickButton = document.getElementById('pickfilesButton');
const filesContainer = document.getElementById('filesContainer');
const addMoreBtn = document.getElementById('addMoreFilesBtn');
const selectAllBtn = document.getElementById('selectAllBtn');
const clearSelectionBtn = document.getElementById('clearSelectionBtn');
const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
const mergeSelectedBtn = document.getElementById('mergeSelectedBtn');
const mergeAllBtn = document.getElementById('mergeAllBtn');
const rotateSelectedBtn = document.getElementById('rotateSelectedBtn');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const topSidebar = document.querySelector('.tool__sidebar.top-sidebar');
const modal = document.getElementById('pagePreviewModal');
const modalGrid = document.getElementById('modalPagesGrid');
const closeModalBtn = modal ? modal.querySelector('.close-modal-btn') : null;

function closeModal() {
    if (modal) {
        modal.classList.remove('active');
        if (modalGrid) modalGrid.innerHTML = '';
    }
}
if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    const activeConfirm = document.querySelector('.confirm-overlay');
    if (activeConfirm) {
        if (e.code === 'Escape') {
            e.preventDefault();
            const cancelBtn = activeConfirm.querySelector('.btn-cancel');
            if (cancelBtn) cancelBtn.click();
            else activeConfirm.remove();
        }
        return;
    }
    if (modal && modal.classList.contains('active')) {
        if (e.code === 'Escape') {
            e.preventDefault();
            closeModal();
            return;
        }
    }
    if (e.target.matches('input, textarea, .loading-overlay')) return;
    const code = e.code;
    if (e.ctrlKey && code === 'KeyA') { e.preventDefault(); if (selectedFiles.length > 0) selectAll(); }
    else if (code === 'Delete') { e.preventDefault(); if (selectedIndices.size > 0) deleteSelected(); }
    else if (e.ctrlKey && code === 'KeyR') { e.preventDefault(); if (selectedIndices.size > 0) rotateSelected(); }
    else if (e.ctrlKey && code === 'KeyM') { e.preventDefault(); if (selectedIndices.size >= 2) mergeSelected(); }
    else if (e.ctrlKey && code === 'KeyD') { e.preventDefault(); if (selectedFiles.length >= 2) mergeAll(); }
    else if (code === 'Escape') { e.preventDefault(); if (selectedIndices.size > 0) clearSelection(); }
    else if (e.ctrlKey && code === 'KeyE') {
        e.preventDefault();
        if (selectedFiles.length > 0 && addMoreBtn && addMoreBtn.style.display !== 'none') {
            fileInput.click();
            showMessage('➕ Виберіть додаткові PDF файли', 'info', 2000);
        }
    }
    else if (e.ctrlKey && code === 'KeyI') {
        e.preventDefault();
        const hotkeyBtn = document.getElementById('hotkeyInfoBtn');
        if (hotkeyBtn) hotkeyBtn.click();
    }
});

// Hotkey info modal
const hotkeyBtn = document.getElementById('hotkeyInfoBtn');
if (hotkeyBtn) {
    hotkeyBtn.addEventListener('click', () => {
        const existingModal = document.querySelector('.hotkey-modal');
        if (existingModal) existingModal.remove();
        const modalDiv = document.createElement('div');
        modalDiv.className = 'hotkey-modal';
        modalDiv.innerHTML = `
            <div class="hotkey-modal-content">
                <h3><i class="fas fa-keyboard"></i> Гарячі клавіші</h3>
                <div class="hotkey-list">
                    <div class="hotkey-key">Ctrl + I</div><div class="hotkey-desc">ℹ️ Гарячі клавіші</div>
                    <div class="hotkey-key">Ctrl + A</div><div class="hotkey-desc">✅ Вибрати всі файли</div>
                    <div class="hotkey-key">Delete</div><div class="hotkey-desc">🗑 Видалити вибрані файли</div>
                    <div class="hotkey-key">Ctrl + R</div><div class="hotkey-desc">🔄 Повернути вибрані файли</div>
                    <div class="hotkey-key">Ctrl + M</div><div class="hotkey-desc">🔗 Об'єднати вибрані файли</div>
                    <div class="hotkey-key">Ctrl + D</div><div class="hotkey-desc">🔗 Об'єднати всі файли</div>
                    <div class="hotkey-key">Escape</div><div class="hotkey-desc">✖️ Очистити вибір / Закрити діалог / Закрити перегляд</div>
                    <div class="hotkey-key">Ctrl + E</div><div class="hotkey-desc">➕ Додати ще файли</div>
                </div>
                <button class="close-hotkey-btn">Зрозуміло</button>
            </div>
        `;
        document.body.appendChild(modalDiv);
        const closeBtn = modalDiv.querySelector('.close-hotkey-btn');
        closeBtn.onclick = () => modalDiv.remove();
        modalDiv.onclick = (e) => { if (e.target === modalDiv) modalDiv.remove(); };
    });
}

function updateStats() {
    const statsDiv = document.getElementById('statsInfo');
    if (!statsDiv) return;
    if (selectedFiles.length === 0) {
        statsDiv.style.display = 'none';
        wasSizeLimitExceeded = false;
        return;
    }
    let totalPages = 0, totalSizeMB = 0;
    for (let file of selectedFiles) {
        totalPages += file.pageCount;
        totalSizeMB += file.size / (1024 * 1024);
    }
    document.getElementById('totalFiles').innerText = selectedFiles.length;
    document.getElementById('totalPages').innerText = totalPages;
    document.getElementById('totalSize').innerText = totalSizeMB.toFixed(2);
    statsDiv.style.display = 'block';
    const limitExceeded = totalSizeMB > MAX_TOTAL_SIZE_MB;
    if (limitExceeded) {
        statsDiv.classList.add('warning');
        if (!wasSizeLimitExceeded) {
            showMessage(`⚠️ Загальний розмір файлів перевищує ${MAX_TOTAL_SIZE_MB} МБ (${totalSizeMB.toFixed(2)} МБ). Об'єднання заблоковано.`, 'error', 6000);
            wasSizeLimitExceeded = true;
        }
    } else {
        statsDiv.classList.remove('warning');
        if (wasSizeLimitExceeded) {
            showMessage(`✅ Загальний розмір повернувся в межу ${MAX_TOTAL_SIZE_MB} МБ. Об'єднання доступне.`, 'success', 4000);
            wasSizeLimitExceeded = false;
        }
    }
}

function showMessage(msg, type, duration = 4000) {
    const existingToasts = document.querySelectorAll('.toast-notification');
    existingToasts.forEach(toast => toast.remove());
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    const icon = type === 'error' ? '<i class="fas fa-exclamation-circle"></i>' : (type === 'info' ? '<i class="fas fa-info-circle"></i>' : '<i class="fas fa-check-circle"></i>');
    toast.innerHTML = `${icon}<span>${msg}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 400);
    }, duration);
}

async function generateThumbnail(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const pdf = await pdfjsLib.getDocument({ data: e.target.result }).promise;
                const page = await pdf.getPage(1);
                const viewport = page.getViewport({ scale: 0.4 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                resolve({
                    thumbnailUrl: canvas.toDataURL(),
                    pageCount: pdf.numPages,
                    fileSize: file.size
                });
            } catch (err) {
                reject({ message: 'Файл пошкоджений або не є PDF' });
            }
        };
        reader.onerror = () => reject({ message: 'Не вдалося прочитати файл' });
        reader.readAsArrayBuffer(file);
    });
}

async function rotateFile(file, angle) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('angle', angle);
    const res = await fetch('/api/pdf/rotate', { method: 'POST', body: formData });
    if (!res.ok) throw new Error('Помилка повороту');
    const blob = await res.blob();
    return new File([blob], file.name, { type: 'application/pdf' });
}

function updateCardSelectionState(card, isSelected) {
    if (isSelected) card.classList.add('selected');
    else card.classList.remove('selected');
    const checkbox = card.querySelector('.file-card-checkbox input');
    if (checkbox) checkbox.checked = isSelected;
}

async function showPagePreview(index) {
    const fileItem = selectedFiles[index];
    if (!fileItem) return;
    document.getElementById('modalFileName').innerText = fileItem.name;
    const sizeMB = (fileItem.size / (1024 * 1024)).toFixed(2);
    document.getElementById('modalFileStats').innerText = `${fileItem.pageCount} стор. • ${sizeMB} MB`;
    modalGrid.innerHTML = '<div style="text-align:center; padding:40px;">⏳ Завантаження сторінок...</div>';
    modal.classList.add('active');
    if (fileItem.allThumbnails && fileItem.allThumbnails.length === fileItem.pageCount) {
        renderPageThumbnails(fileItem.allThumbnails);
        return;
    }
    try {
        const arrayBuffer = await fileItem.file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const thumbnails = [];
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 0.3 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            thumbnails.push(canvas.toDataURL());
        }
        fileItem.allThumbnails = thumbnails;
        renderPageThumbnails(thumbnails);
    } catch (err) {
        modalGrid.innerHTML = `<div style="text-align:center; padding:40px; color:red;">❌ Помилка завантаження: ${err.message}</div>`;
    }
}

function renderPageThumbnails(thumbnails) {
    modalGrid.innerHTML = '';
    thumbnails.forEach((thumbUrl, idx) => {
        const card = document.createElement('div');
        card.className = 'modal-page-card';
        const canvas = document.createElement('canvas');
        const img = new Image();
        img.src = thumbUrl;
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            canvas.getContext('2d').drawImage(img, 0, 0);
        };
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        const span = document.createElement('span');
        span.innerText = `Стор. ${idx + 1}`;
        card.appendChild(canvas);
        card.appendChild(span);
        modalGrid.appendChild(card);
    });
}

function createCardElement(data, index) {
    const card = document.createElement('div');
    card.className = 'file-card';
    if (selectedIndices.has(index)) card.classList.add('selected');
    card.setAttribute('data-index', index);
    const chkDiv = document.createElement('div');
    chkDiv.className = 'file-card-checkbox';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = selectedIndices.has(index);
    chk.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentCard = e.target.closest('.file-card');
        const idx = parseInt(currentCard.getAttribute('data-index'), 10);
        toggleFileSelection(idx, e);
    });
    const span = document.createElement('span');
    span.className = 'checkmark';
    chkDiv.appendChild(chk);
    chkDiv.appendChild(span);
    card.appendChild(chkDiv);
    const tooltip = document.createElement('div');
    tooltip.className = 'file-tooltip';
    const sizeMB = (data.size / (1024 * 1024)).toFixed(2);
    tooltip.innerText = `${sizeMB} MB • ${data.pageCount} стор.`;
    card.appendChild(tooltip);
    const dragHandle = document.createElement('div');
    dragHandle.className = 'drag-handle';
    dragHandle.innerHTML = '<i class="fas fa-grip-vertical"></i>';
    card.appendChild(dragHandle);
    const actions = document.createElement('div');
    actions.className = 'file__actions';
    const previewBtn = document.createElement('a');
    previewBtn.className = 'file__btn preview';
    previewBtn.innerHTML = '<i class="fas fa-eye"></i>';
    previewBtn.href = 'javascript:;';
    previewBtn.title = 'Попередній перегляд сторінок';
    previewBtn.onclick = async (e) => {
        e.stopPropagation();
        const currentCard = e.target.closest('.file-card');
        const idx = parseInt(currentCard.getAttribute('data-index'), 10);
        await showPagePreview(idx);
    };
    const rotateBtn = document.createElement('a');
    rotateBtn.className = 'file__btn rotate';
    rotateBtn.innerHTML = '<i class="fas fa-undo-alt"></i>';
    rotateBtn.href = 'javascript:;';
    rotateBtn.title = 'Повернути на 90°';
    rotateBtn.onclick = async (e) => {
        e.stopPropagation();
        const currentCard = e.target.closest('.file-card');
        const idx = parseInt(currentCard.getAttribute('data-index'), 10);
        await rotateFileAtIndex(idx);
    };
    const removeBtn = document.createElement('a');
    removeBtn.className = 'file__btn remove';
    removeBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
    removeBtn.href = 'javascript:;';
    removeBtn.title = 'Видалити файл';
    removeBtn.onclick = async (e) => {
        e.stopPropagation();
        const currentCard = e.target.closest('.file-card');
        const idx = parseInt(currentCard.getAttribute('data-index'), 10);
        await removeFile(idx);
    };
    actions.appendChild(previewBtn);
    actions.appendChild(rotateBtn);
    actions.appendChild(removeBtn);
    card.appendChild(actions);
    const canvas = document.createElement('canvas');
    const img = new Image();
    img.src = data.thumbnailUrl;
    img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
    };
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    card.appendChild(canvas);
    const nameSpan = document.createElement('div');
    nameSpan.className = 'file__info__name';
    let displayName = data.name;
    if (displayName.length > 25) displayName = displayName.slice(0, 22) + '...';
    nameSpan.innerText = displayName;
    card.appendChild(nameSpan);
    card.addEventListener('click', (e) => {
        if (e.target.closest('.file__btn') || e.target.closest('.drag-handle') || e.target.closest('.file-card-checkbox')) return;
        const idx = parseInt(card.getAttribute('data-index'), 10);
        toggleFileSelection(idx, e);
    });
    return card;
}

function renderFilesGrid() {
    let scrollPercent = 0;
    if (filesContainer.scrollHeight > filesContainer.clientHeight) {
        scrollPercent = filesContainer.scrollTop / (filesContainer.scrollHeight - filesContainer.clientHeight);
    }
    filesContainer.innerHTML = '';
    if (selectedFiles.length === 0) {
        filesContainer.innerHTML = '<div class="empty-state">Файли не вибрано</div>';
        if (sortable) sortable.destroy();
        sortable = null;
        updateStats();
        return;
    }
    for (let i = 0; i < selectedFiles.length; i++) {
        const card = createCardElement(selectedFiles[i], i);
        filesContainer.appendChild(card);
    }
    initSortable();
    updateStats();
    if (scrollPercent > 0 && filesContainer.scrollHeight > filesContainer.clientHeight) {
        const newScrollTop = scrollPercent * (filesContainer.scrollHeight - filesContainer.clientHeight);
        filesContainer.scrollTop = newScrollTop;
    }
}

function initSortable() {
    if (sortable) sortable.destroy();
    if (!filesContainer) return;
    sortable = new Sortable(filesContainer, {
        animation: 200,
        onEnd: async function() {
            const cards = filesContainer.querySelectorAll('.file-card');
            const newSelectedFiles = [];
            const newSelectedIndices = new Set();
            cards.forEach((card, newIdx) => {
                const oldIdx = parseInt(card.getAttribute('data-index'), 10);
                newSelectedFiles.push(selectedFiles[oldIdx]);
                if (selectedIndices.has(oldIdx)) {
                    newSelectedIndices.add(newIdx);
                }
            });
            selectedFiles = newSelectedFiles;
            selectedIndices = newSelectedIndices;
            cards.forEach((card, newIdx) => {
                card.setAttribute('data-index', newIdx);
            });
            updateMergeButtons();
            showMessage('📌 Порядок файлів змінено', 'success', 3000);
            await saveSessionToIndexedDB();
        }
    });
}

async function addFiles(newFiles) {
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'loading-overlay';
    loadingOverlay.innerHTML = `
        <div class="loading-spinner">
            <div class="loader"></div>
            <div class="progress-text">
                <p id="loadingStatus">Підготовка файлів...</p>
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" id="loadingProgressBar"></div>
                </div>
                <p id="loadingCounter">0 / ${newFiles.length} файлів</p>
            </div>
        </div>
    `;
    document.body.appendChild(loadingOverlay);
    let added = 0, processed = 0;
    const totalFiles = newFiles.length;
    const loadingStatus = document.getElementById('loadingStatus');
    const loadingCounter = document.getElementById('loadingCounter');
    const loadingProgressBar = document.getElementById('loadingProgressBar');
    for (const file of newFiles) {
        processed++;
        const percent = (processed / totalFiles) * 100;
        loadingProgressBar.style.width = `${percent}%`;
        loadingCounter.innerText = `Завантажено ${processed} з ${totalFiles} файлів`;
        if (file.size > MAX_FILE_SIZE_BYTES) {
            showMessage(`❌ Файл "${file.name}" перевищує ліміт ${MAX_FILE_SIZE_MB} МБ (${(file.size / (1024 * 1024)).toFixed(2)} МБ)`, 'error', 5000);
            continue;
        }
        if (file.type !== 'application/pdf') {
            showMessage(`Файл "${file.name}" не є PDF`, 'error');
            continue;
        }
        try {
            const header = await file.slice(0, 4).text();
            if (header !== '%PDF') {
                showMessage(`Файл "${file.name}" не є коректним PDF (невірна сигнатура)`, 'error');
                continue;
            }
        } catch (err) {
            showMessage(`Не вдалося перевірити файл "${file.name}"`, 'error');
            continue;
        }
        if (selectedFiles.some(f => f.file.name === file.name && f.file.size === file.size)) {
            showMessage(`Файл "${file.name}" вже доданий`, 'error');
            continue;
        }
        loadingStatus.innerText = `Обробка: ${file.name}`;
        try {
            const { thumbnailUrl, pageCount, fileSize } = await generateThumbnail(file);
            selectedFiles.push({ file, thumbnailUrl, name: file.name, size: fileSize, pageCount, allThumbnails: null });
            added++;
        } catch (err) {
            showMessage(`❌ ${err.message || 'Помилка обробки'} для файлу "${file.name}"`, 'error');
        }
    }
    loadingOverlay.remove();
    if (added > 0) {
        if (selectedFiles.length > 0) {
            uploader.style.display = 'none';
            filesContainer.style.display = 'flex';
            topSidebar.style.display = 'flex';
        }
        renderFilesGrid();
        updateMergeButtons();
        updateStats();
        showMessage(added === 1 ? `Додано ${added} файл` : `Додано ${added} файли`, 'success');
        await saveSessionToIndexedDB();
    }
}

async function removeFile(index) {
    const fileName = selectedFiles[index]?.name || 'файл';
    const displayName = fileName.length > 50 ? fileName.substring(0, 47) + '...' : fileName;
    const confirmed = await showConfirm({
        title: '🗑 Видалення файлу',
        message: `Ви дійсно хочете видалити файл "${displayName}"?`,
        confirmText: 'Видалити',
        cancelText: 'Скасувати'
    });
    if (!confirmed) return;
    const cardToRemove = document.querySelector(`.file-card[data-index='${index}']`);
    if (cardToRemove) cardToRemove.remove();
    selectedFiles.splice(index, 1);
    const newSelected = new Set();
    for (let idx of selectedIndices) {
        if (idx > index) newSelected.add(idx - 1);
        else if (idx < index) newSelected.add(idx);
    }
    selectedIndices = newSelected;
    const remainingCards = filesContainer.querySelectorAll('.file-card');
    remainingCards.forEach((card, newIdx) => {
        card.setAttribute('data-index', newIdx);
    });
    if (selectedFiles.length === 0) {
        uploader.style.display = 'block';
        filesContainer.style.display = 'none';
        topSidebar.style.display = 'none';
        filesContainer.innerHTML = '<div class="empty-state">Файли не вибрано</div>';
        if (sortable) sortable.destroy();
        sortable = null;
    }
    updateMergeButtons();
    updateStats();
    showMessage(`✅ Видалено файл: ${displayName}`, 'success');
    await saveSessionToIndexedDB();
}

async function deleteSelected() {
    if (selectedIndices.size === 0) {
        showMessage('❌ Не вибрано жодного файлу для видалення', 'error');
        return;
    }
    const fileCount = selectedIndices.size;
    const confirmed = await showConfirm({
        title: '🗑 Видалення вибраних файлів',
        message: `Видалити ${fileCount} вибраних файлів?`,
        confirmText: 'Видалити',
        cancelText: 'Скасувати'
    });
    if (!confirmed) return;
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'loading-overlay';
    loadingOverlay.innerHTML = `<div class="loading-spinner"><div class="loader"></div><div class="progress-text"><p id="deleteStatus">Видалення файлів...</p><div class="progress-bar-container"><div class="progress-bar-fill" id="deleteProgressBar"></div></div><p id="deleteCounter">0 / ${fileCount} файлів</p></div></div>`;
    document.body.appendChild(loadingOverlay);
    const deleteStatus = document.getElementById('deleteStatus');
    const deleteCounter = document.getElementById('deleteCounter');
    const deleteProgressBar = document.getElementById('deleteProgressBar');
    const indices = Array.from(selectedIndices).sort((a,b) => b - a);
    let processed = 0;
    for (let idx of indices) {
        processed++;
        const percent = (processed / fileCount) * 100;
        deleteProgressBar.style.width = `${percent}%`;
        deleteCounter.innerText = `Видалено ${processed} з ${fileCount} файлів`;
        const fileName = selectedFiles[idx]?.name || 'файл';
        deleteStatus.innerText = `Видалення: ${fileName.length > 40 ? fileName.substring(0,37)+'...' : fileName}`;
        selectedFiles.splice(idx, 1);
    }
    selectedIndices.clear();
    loadingOverlay.remove();
    if (selectedFiles.length === 0) {
        uploader.style.display = 'block';
        filesContainer.style.display = 'none';
        topSidebar.style.display = 'none';
    }
    renderFilesGrid();
    updateMergeButtons();
    updateStats();
    showMessage(`✅ Видалено ${fileCount} файлів`, 'success');
    await saveSessionToIndexedDB();
}

function showConfirm(options) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `
            <div class="confirm-dialog">
                <div class="confirm-title">${options.title || 'Підтвердження'}</div>
                <p>${options.message || 'Ви впевнені?'}</p>
                <div class="confirm-buttons">
                    <button class="btn-confirm">${options.confirmText || 'Так'}</button>
                    <button class="btn-cancel">${options.cancelText || 'Скасувати'}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        const confirmBtn = overlay.querySelector('.btn-confirm');
        const cancelBtn = overlay.querySelector('.btn-cancel');
        const cleanup = () => overlay.remove();
        confirmBtn.onclick = () => { cleanup(); resolve(true); };
        cancelBtn.onclick = () => { cleanup(); resolve(false); };
        overlay.onclick = (e) => { if (e.target === overlay) { cleanup(); resolve(false); } };
    });
}

function updateSingleCard(index) {
    const card = document.querySelector(`.file-card[data-index='${index}']`);
    if (!card) return;
    const data = selectedFiles[index];
    if (!data) return;
    const canvas = card.querySelector('canvas');
    const img = new Image();
    img.src = data.thumbnailUrl;
    img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
    };
    const nameSpan = card.querySelector('.file__info__name');
    let displayName = data.name;
    if (displayName.length > 25) displayName = displayName.slice(0, 22) + '...';
    nameSpan.innerText = displayName;
    const tooltip = card.querySelector('.file-tooltip');
    const sizeMB = (data.size / (1024 * 1024)).toFixed(2);
    tooltip.innerText = `${sizeMB} MB • ${data.pageCount} стор.`;
}

async function rotateFileAtIndex(index) {
    const item = selectedFiles[index];
    if (!item) return;
    const displayName = item.name.length > 40 ? item.name.substring(0, 37) + '...' : item.name;
    try {
        const rotatedFile = await rotateFile(item.file, 90);
        const newData = await generateThumbnail(rotatedFile);
        selectedFiles[index] = { ...item, file: rotatedFile, thumbnailUrl: newData.thumbnailUrl, pageCount: newData.pageCount, size: newData.fileSize, allThumbnails: null };
        updateSingleCard(index);
        updateStats();
        showMessage(`🔄 Повернуто: ${displayName}`, 'success');
        await saveSessionToIndexedDB();
    } catch (err) {
        showMessage(`❌ Помилка повороту ${displayName}: ${err.message}`, 'error');
    }
}

async function rotateSelected() {
    if (selectedIndices.size === 0) {
        showMessage('❌ Не вибрано жодного файлу для повороту', 'error');
        return;
    }
    const fileCount = selectedIndices.size;
    const confirmed = await showConfirm({
        title: '🔄 Обертання вибраних файлів',
        message: `Повернути ${fileCount} вибраних файлів на 90°?`,
        confirmText: 'Обернути',
        cancelText: 'Скасувати'
    });
    if (!confirmed) return;
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'loading-overlay';
    loadingOverlay.innerHTML = `<div class="loading-spinner"><div class="loader"></div><div class="progress-text"><p id="rotateStatus">Поворот файлів...</p><div class="progress-bar-container"><div class="progress-bar-fill" id="rotateProgressBar"></div></div><p id="rotateCounter">0 / ${fileCount} файлів</p></div></div>`;
    document.body.appendChild(loadingOverlay);
    const rotateStatus = document.getElementById('rotateStatus');
    const rotateCounter = document.getElementById('rotateCounter');
    const rotateProgressBar = document.getElementById('rotateProgressBar');
    rotateSelectedBtn.disabled = true;
    const indices = Array.from(selectedIndices).sort((a,b)=>a-b);
    let successCount = 0, processed = 0;
    for (let idx of indices) {
        processed++;
        const percent = (processed / fileCount) * 100;
        rotateProgressBar.style.width = `${percent}%`;
        rotateCounter.innerText = `Оброблено ${processed} з ${fileCount} файлів`;
        const fileName = selectedFiles[idx].name;
        rotateStatus.innerText = `Поворот: ${fileName.length > 40 ? fileName.substring(0, 37) + '...' : fileName}`;
        try {
            const rotatedFile = await rotateFile(selectedFiles[idx].file, 90);
            const newData = await generateThumbnail(rotatedFile);
            selectedFiles[idx] = { ...selectedFiles[idx], file: rotatedFile, thumbnailUrl: newData.thumbnailUrl, pageCount: newData.pageCount, size: newData.fileSize, allThumbnails: null };
            updateSingleCard(idx);
            successCount++;
        } catch (err) {
            showMessage(`❌ Помилка повороту файлу "${selectedFiles[idx].name}": ${err.message}`, 'error');
        }
    }
    loadingOverlay.remove();
    updateStats();
    rotateSelectedBtn.disabled = false;
    if (successCount > 0) showMessage(`✅ Повернуто ${successCount} з ${fileCount} файлів`, 'success');
    await saveSessionToIndexedDB();
}

function toggleFileSelection(index, event) {
    if (event && (event.target.closest('.file__btn') || event.target.closest('.drag-handle') || event.target.closest('.file-card-checkbox'))) return;
    const wasSelected = selectedIndices.has(index);
    if (wasSelected) selectedIndices.delete(index);
    else selectedIndices.add(index);
    const card = document.querySelector(`.file-card[data-index='${index}']`);
    if (card) updateCardSelectionState(card, selectedIndices.has(index));
    updateMergeButtons();
    const fileName = selectedFiles[index]?.name || '';
    showMessage(wasSelected ? `✖️ Знято виділення: ${fileName.substring(0,30)}${fileName.length>30?'...':''}` : `✅ Вибрано файл: ${fileName.substring(0,30)}${fileName.length>30?'...':''}`, wasSelected ? 'info' : 'success');
}

function selectAll() {
    for (let i = 0; i < selectedFiles.length; i++) {
        selectedIndices.add(i);
        const card = document.querySelector(`.file-card[data-index='${i}']`);
        if (card) updateCardSelectionState(card, true);
    }
    updateMergeButtons();
    showMessage(`✅ Вибрано ${selectedIndices.size} з ${selectedFiles.length} файлів`, 'success');
}

function clearSelection() {
    const previousCount = selectedIndices.size;
    for (let idx of selectedIndices) {
        const card = document.querySelector(`.file-card[data-index='${idx}']`);
        if (card) updateCardSelectionState(card, false);
    }
    selectedIndices.clear();
    updateMergeButtons();
    if (previousCount > 0) showMessage(`✖️ Знято виділення з ${previousCount} файлів`, 'info');
}

function updateMergeButtons() {
    const anySelected = selectedIndices.size > 0;
    const enoughSelected = selectedIndices.size >= 2;
    const totalSizeMB = selectedFiles.reduce((sum, f) => sum + (f.size || 0), 0) / (1024 * 1024);
    const sizeLimitExceeded = totalSizeMB > MAX_TOTAL_SIZE_MB;
    mergeSelectedBtn.disabled = !enoughSelected || sizeLimitExceeded;
    mergeAllBtn.disabled = selectedFiles.length < 2 || sizeLimitExceeded;
    deleteSelectedBtn.disabled = !anySelected;
    clearSelectionBtn.disabled = !anySelected;
    selectAllBtn.disabled = (selectedIndices.size === selectedFiles.length);
    rotateSelectedBtn.disabled = !anySelected;
    if (sizeLimitExceeded) {
        const msg = `⚠️ Загальний розмір файлів перевищує ${MAX_TOTAL_SIZE_MB} МБ. Об'єднання неможливе.`;
        mergeSelectedBtn.title = msg;
        mergeAllBtn.title = msg;
    } else {
        mergeSelectedBtn.title = enoughSelected ? "" : "Виберіть принаймні 2 файли";
        mergeAllBtn.title = selectedFiles.length >= 2 ? "" : "Додайте принаймні 2 файли";
    }
}

async function mergeSelected() {
    if (selectedIndices.size < 2) {
        showMessage(`❌ Потрібно вибрати принаймні 2 PDF-файли для об'єднання. Вибрано: ${selectedIndices.size}`, 'error');
        return;
    }
    const fileCount = selectedIndices.size;
    const confirmed = await showConfirm({
        title: '🔗 Об\'єднання вибраних файлів',
        message: `Об'єднати ${fileCount} вибраних файлів?`,
        confirmText: 'Об\'єднати',
        cancelText: 'Скасувати'
    });
    if (!confirmed) return;
    const filesToMerge = Array.from(selectedIndices).sort((a,b)=>a-b).map(i => selectedFiles[i].file);
    await performMerge(filesToMerge, 'merged_selected.pdf', mergeSelectedBtn, fileCount);
}

async function mergeAll() {
    if (selectedFiles.length < 2) {
        showMessage(`❌ Додайте принаймні 2 PDF-файли для об'єднання. Зараз: ${selectedFiles.length}`, 'error');
        return;
    }
    const fileCount = selectedFiles.length;
    const confirmed = await showConfirm({
        title: '🔗 Об\'єднання всіх файлів',
        message: `Об'єднати всі ${fileCount} файлів?`,
        confirmText: 'Об\'єднати',
        cancelText: 'Скасувати'
    });
    if (!confirmed) return;
    const allFiles = selectedFiles.map(item => item.file);
    await performMerge(allFiles, 'merged_all.pdf', mergeAllBtn, fileCount);
}

async function performMerge(files, filename, btn, fileCount) {
    btn.disabled = true;
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'loading-overlay';
    loadingOverlay.innerHTML = `<div class="loading-spinner"><div class="loader"></div><div class="progress-text"><p id="mergeStatus">Об'єднання файлів...</p><div class="progress-bar-container"><div class="progress-bar-fill" id="mergeProgressBar"></div></div><p id="mergeCounter">0 / ${fileCount} файлів</p></div></div>`;
    document.body.appendChild(loadingOverlay);
    const mergeStatus = document.getElementById('mergeStatus');
    const mergeCounter = document.getElementById('mergeCounter');
    const mergeProgressBar = document.getElementById('mergeProgressBar');
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    let processed = 0;
    const updateProgress = () => {
        processed++;
        const percent = (processed / fileCount) * 100;
        if (mergeProgressBar) mergeProgressBar.style.width = `${percent}%`;
        if (mergeCounter) mergeCounter.innerText = `Файлів оброблено: ${processed} з ${fileCount}`;
        progressBar.style.width = `${percent}%`;
        if (mergeStatus) mergeStatus.innerText = `Об'єднання... ${processed} / ${fileCount}`;
    };
    const formData = new FormData();
    for (let file of files) { formData.append('files', file); updateProgress(); await new Promise(r => setTimeout(r, 50)); }
    try {
        const response = await fetch('/api/pdf/merge', { method: 'POST', body: formData });
        if (response.ok) {
            if (mergeProgressBar) mergeProgressBar.style.width = '100%';
            progressBar.style.width = '100%';
            mergeStatus.innerText = 'Завантаження результату...';
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
            loadingOverlay.remove();
            showMessage(`✅ Об'єднання виконано! ${fileCount} файлів успішно об'єднано.`, 'success');
            await saveSessionToIndexedDB();
        } else throw new Error(await response.text() || 'Помилка сервера');
    } catch (err) {
        loadingOverlay.remove();
        showMessage(`❌ Помилка: ${err.message}`, 'error');
    } finally {
        setTimeout(() => { progressContainer.style.display = 'none'; btn.disabled = false; }, 1000);
    }
}

async function restoreSessionFromIndexedDB() {
    if (!db) await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const items = await new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    if (items.length === 0) return false;
    const restored = await Promise.all(items.map(async (item) => {
        const file = new File([item.fileBlob], item.name, { type: 'application/pdf' });
        return {
            file: file,
            name: item.name,
            size: item.size,
            pageCount: item.pageCount,
            thumbnailUrl: item.thumbnailUrl,
            allThumbnails: null
        };
    }));
    selectedFiles = restored;
    selectedIndices.clear();
    // Видаляємо сесію після відновлення, щоб уникнути дублювання
    const clearTx = db.transaction(STORE_NAME, 'readwrite');
    const clearStore = clearTx.objectStore(STORE_NAME);
    await new Promise((resolve, reject) => {
        const clearReq = clearStore.clear();
        clearReq.onsuccess = () => resolve();
        clearReq.onerror = () => reject(clearReq.error);
    });
    await new Promise((resolve, reject) => {
        clearTx.oncomplete = resolve;
        clearTx.onerror = () => reject(clearTx.error);
    });
    return true;
}

// Event listeners
if (uploader) {
    uploader.addEventListener('click', (e) => {
        if (pickButton && (e.target === pickButton || pickButton.contains(e.target))) return;
        fileInput.click();
    });
}
if (pickButton) pickButton.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
if (uploader) {
    uploader.addEventListener('dragover', (e) => { e.preventDefault(); uploader.classList.add('drag-over'); });
    uploader.addEventListener('dragleave', () => { uploader.classList.remove('drag-over'); });
    uploader.addEventListener('drop', async (e) => { e.preventDefault(); uploader.classList.remove('drag-over'); const files = Array.from(e.dataTransfer.files); if (files.length) await addFiles(files); });
}
if (fileInput) {
    fileInput.addEventListener('change', async (e) => { const files = Array.from(e.target.files); if (files.length) await addFiles(files); fileInput.value = ''; });
}
if (addMoreBtn) addMoreBtn.addEventListener('click', () => fileInput.click());
if (selectAllBtn) selectAllBtn.addEventListener('click', selectAll);
if (clearSelectionBtn) clearSelectionBtn.addEventListener('click', clearSelection);
if (deleteSelectedBtn) deleteSelectedBtn.addEventListener('click', deleteSelected);
if (mergeSelectedBtn) mergeSelectedBtn.addEventListener('click', mergeSelected);
if (mergeAllBtn) mergeAllBtn.addEventListener('click', mergeAll);
if (rotateSelectedBtn) rotateSelectedBtn.addEventListener('click', rotateSelected);

// Restore session
(async function init() {
    await openDB();
    const restored = await restoreSessionFromIndexedDB();
    if (restored && selectedFiles.length > 0) {
        renderFilesGrid();
        updateMergeButtons();
        updateStats();
        uploader.style.display = 'none';
        filesContainer.style.display = 'flex';
        topSidebar.style.display = 'flex';
        showMessage(`📂 Відновлено ${selectedFiles.length} файл(ів) з попередньої сесії.`, 'info', 5000);
    }
})();