document.addEventListener('DOMContentLoaded', function() {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

    let selectedFiles = [];
    let selectedIndices = new Set();
    let sortable = null;

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

    // ========== ГАРЯЧІ КЛАВІШІ ==========
    document.addEventListener('keydown', (e) => {
        // Спочатку перевіряємо, чи відкрите модальне вікно підтвердження
        const activeConfirm = document.querySelector('.confirm-overlay');
        if (activeConfirm) {
            if (e.code === 'Escape') {
                e.preventDefault();
                // Закриваємо модальне вікно (імітуємо клік на "Скасувати")
                const cancelBtn = activeConfirm.querySelector('.btn-cancel');
                if (cancelBtn) cancelBtn.click();
                else activeConfirm.remove();
            }
            return; // Ігноруємо інші гарячі клавіші, поки відкрите підтвердження
        }

        // Ігноруємо, якщо фокус у полі вводу або інших елементах
        if (e.target.matches('input, textarea, .loading-overlay')) return;

        const code = e.code;

        // Ctrl + A – вибрати всі
        if (e.ctrlKey && code === 'KeyA') {
            e.preventDefault();
            if (selectedFiles.length > 0) selectAll();
        }
        // Delete – видалити вибрані
        else if (code === 'Delete') {
            e.preventDefault();
            if (selectedIndices.size > 0) deleteSelected();
        }
        // Ctrl + R – обернути вибрані
        else if (e.ctrlKey && code === 'KeyR') {
            e.preventDefault();
            if (selectedIndices.size > 0) rotateSelected();
        }
        // Ctrl + M – об'єднати вибрані
        else if (e.ctrlKey && code === 'KeyM') {
            e.preventDefault();
            if (selectedIndices.size >= 2) mergeSelected();
        }
        // Ctrl + D – об'єднати всі файли (змінено)
        else if (e.ctrlKey && code === 'KeyD') {
            e.preventDefault();
            if (selectedFiles.length >= 2) mergeAll();
        }
        // Escape – очистити вибір (якщо немає модального вікна)
        else if (code === 'Escape') {
            e.preventDefault();
            if (selectedIndices.size > 0) clearSelection();
        }
        // Ctrl + E – додати ще файли
        else if (e.ctrlKey && code === 'KeyE') {
            e.preventDefault();
            if (selectedFiles.length > 0 && addMoreBtn && addMoreBtn.style.display !== 'none') {
                fileInput.click();
                showMessage('➕ Виберіть додаткові PDF файли', 'info', 2000);
            }
        }
    });

    // ========== ІНФОРМАЦІЯ ПРО ГАРЯЧІ КЛАВІШІ ==========
    const hotkeyBtn = document.getElementById('hotkeyInfoBtn');
    if (hotkeyBtn) {
        hotkeyBtn.addEventListener('click', () => {
            // Видаляємо старе модальне вікно, якщо є
            const existingModal = document.querySelector('.hotkey-modal');
            if (existingModal) existingModal.remove();

            const modal = document.createElement('div');
            modal.className = 'hotkey-modal';
            modal.innerHTML = `
                <div class="hotkey-modal-content">
                    <h3><i class="fas fa-keyboard"></i> Гарячі клавіші</h3>
                    <div class="hotkey-list">
                        <div class="hotkey-key">Ctrl + A</div>
                        <div class="hotkey-desc">✅ Вибрати всі файли</div>

                        <div class="hotkey-key">Delete</div>
                        <div class="hotkey-desc">🗑 Видалити вибрані файли</div>

                        <div class="hotkey-key">Ctrl + R</div>
                        <div class="hotkey-desc">🔄 Повернути вибрані файли</div>

                        <div class="hotkey-key">Ctrl + M</div>
                        <div class="hotkey-desc">🔗 Об'єднати вибрані файли</div>

                        <div class="hotkey-key">Ctrl + D</div>
                        <div class="hotkey-desc">🔗 Об'єднати всі файли</div>

                        <div class="hotkey-key">Escape</div>
                        <div class="hotkey-desc">✖️ Очистити вибір / Закрити діалог</div>

                        <div class="hotkey-key">Ctrl + E</div>
                        <div class="hotkey-desc">➕ Додати ще файли</div>
                    </div>
                    <button class="close-hotkey-btn">Зрозуміло</button>
                </div>
            `;
            document.body.appendChild(modal);

            const closeBtn = modal.querySelector('.close-hotkey-btn');
            closeBtn.onclick = () => modal.remove();
            modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        });
    }

    // ========== Функція оновлення статистики ==========
    function updateStats() {
        const statsDiv = document.getElementById('statsInfo');
        if (!statsDiv) return;
        if (selectedFiles.length === 0) {
            statsDiv.style.display = 'none';
            return;
        }
        let totalPages = 0;
        let totalSizeMB = 0;
        for (let file of selectedFiles) {
            totalPages += file.pageCount;
            totalSizeMB += file.size / (1024 * 1024);
        }
        document.getElementById('totalFiles').innerText = selectedFiles.length;
        document.getElementById('totalPages').innerText = totalPages;
        document.getElementById('totalSize').innerText = totalSizeMB.toFixed(2);
        statsDiv.style.display = 'block';
    }

    // ========== Допоміжні функції ==========
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function showMessage(msg, type) {
        const existingToasts = document.querySelectorAll('.toast-notification');
        existingToasts.forEach(toast => toast.remove());
        const toast = document.createElement('div');
        toast.className = `toast-notification toast-${type}`;
        const icon = type === 'error' ? '<i class="fas fa-exclamation-circle"></i>' : '<i class="fas fa-check-circle"></i>';
        toast.innerHTML = `${icon}<span>${msg}</span>`;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 400);
        }, 4000);
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
                } catch (err) { reject(err); }
            };
            reader.onerror = reject;
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

    // ========== Основні функції роботи з файлами ==========
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

        const loadingStatus = document.getElementById('loadingStatus');
        const loadingCounter = document.getElementById('loadingCounter');
        const loadingProgressBar = document.getElementById('loadingProgressBar');

        let added = 0;
        let processed = 0;
        const totalFiles = newFiles.length;

        for (const file of newFiles) {
            processed++;
            const percent = (processed / totalFiles) * 100;
            loadingProgressBar.style.width = `${percent}%`;
            loadingCounter.innerText = `Завантажено ${processed} з ${totalFiles} файлів`;

            if (file.type !== 'application/pdf') {
                showMessage(`Файл "${file.name}" не є PDF`, 'error');
                continue;
            }
            if (selectedFiles.some(f => f.file.name === file.name && f.file.size === file.size)) {
                showMessage(`Файл "${file.name}" вже доданий`, 'error');
                continue;
            }

            loadingStatus.innerText = `Обробка: ${file.name}`;

            try {
                const { thumbnailUrl, pageCount, fileSize } = await generateThumbnail(file);
                selectedFiles.push({
                    file,
                    thumbnailUrl,
                    name: file.name,
                    size: fileSize,
                    pageCount: pageCount
                });
                added++;
            } catch (err) {
                showMessage(`Помилка обробки ${file.name}: ${err.message}`, 'error');
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
            if (added === 1) showMessage(`Додано ${added} файл`, 'success');
            else if (added > 1) showMessage(`Додано ${added} файли`, 'success');
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

        selectedFiles.splice(index, 1);
        const newSelected = new Set();
        for (let idx of selectedIndices) {
            if (idx > index) newSelected.add(idx - 1);
            else if (idx < index) newSelected.add(idx);
        }
        selectedIndices = newSelected;

        if (selectedFiles.length === 0) {
            uploader.style.display = 'block';
            filesContainer.style.display = 'none';
            topSidebar.style.display = 'none';
        }
        renderFilesGrid();
        updateMergeButtons();
        updateStats();
        showMessage(`✅ Видалено файл: ${displayName}`, 'success');
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

            confirmBtn.onclick = () => {
                cleanup();
                resolve(true);
            };
            cancelBtn.onclick = () => {
                cleanup();
                resolve(false);
            };
            overlay.onclick = (e) => {
                if (e.target === overlay) {
                    cleanup();
                    resolve(false);
                }
            };
        });
    }

    async function rotateFileAtIndex(index) {
        const item = selectedFiles[index];
        if (!item) return;
        const displayName = item.name.length > 40 ? item.name.substring(0, 37) + '...' : item.name;

        try {
            const rotatedFile = await rotateFile(item.file, 90);
            const { thumbnailUrl, pageCount, fileSize } = await generateThumbnail(rotatedFile);
            selectedFiles[index] = { ...item, file: rotatedFile, thumbnailUrl, pageCount, size: fileSize };
            renderFilesGrid();
            updateStats();
            showMessage(`🔄 Повернуто: ${displayName}`, 'success');
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
        loadingOverlay.innerHTML = `
            <div class="loading-spinner">
                <div class="loader"></div>
                <div class="progress-text">
                    <p id="rotateStatus">Поворот файлів...</p>
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" id="rotateProgressBar"></div>
                    </div>
                    <p id="rotateCounter">0 / ${fileCount} файлів</p>
                </div>
            </div>
        `;
        document.body.appendChild(loadingOverlay);

        const rotateStatus = document.getElementById('rotateStatus');
        const rotateCounter = document.getElementById('rotateCounter');
        const rotateProgressBar = document.getElementById('rotateProgressBar');

        rotateSelectedBtn.disabled = true;
        const indices = Array.from(selectedIndices).sort((a,b)=>a-b);
        let successCount = 0;
        let processed = 0;

        for (let idx of indices) {
            processed++;
            const percent = (processed / fileCount) * 100;
            rotateProgressBar.style.width = `${percent}%`;
            rotateCounter.innerText = `Оброблено ${processed} з ${fileCount} файлів`;
            const fileName = selectedFiles[idx].name;
            rotateStatus.innerText = `Поворот: ${fileName.length > 40 ? fileName.substring(0, 37) + '...' : fileName}`;

            try {
                const rotatedFile = await rotateFile(selectedFiles[idx].file, 90);
                const { thumbnailUrl, pageCount, fileSize } = await generateThumbnail(rotatedFile);
                selectedFiles[idx] = { ...selectedFiles[idx], file: rotatedFile, thumbnailUrl, pageCount, size: fileSize };
                successCount++;
            } catch (err) {
                showMessage(`❌ Помилка повороту файлу "${selectedFiles[idx].name}": ${err.message}`, 'error');
            }
        }

        loadingOverlay.remove();
        renderFilesGrid();
        updateStats();
        rotateSelectedBtn.disabled = false;

        if (successCount > 0) {
            showMessage(`✅ Повернуто ${successCount} з ${fileCount} файлів`, 'success');
        }
    }

    function toggleFileSelection(index, event) {
        if (event && (event.target.closest('.file__btn') || event.target.closest('.drag-handle'))) return;

        const wasSelected = selectedIndices.has(index);
        if (wasSelected) {
            selectedIndices.delete(index);
        } else {
            selectedIndices.add(index);
        }
        renderFilesGrid();
        updateMergeButtons();

        const fileName = selectedFiles[index]?.name || '';
        if (!wasSelected) {
            showMessage(`✅ Вибрано файл: ${fileName.substring(0, 30)}${fileName.length > 30 ? '...' : ''}`, 'success');
        } else {
            showMessage(`✖️ Знято виділення: ${fileName.substring(0, 30)}${fileName.length > 30 ? '...' : ''}`, 'info');
        }
    }

    function selectAll() {
        for (let i = 0; i < selectedFiles.length; i++) {
            selectedIndices.add(i);
        }
        renderFilesGrid();
        updateMergeButtons();
        const newCount = selectedIndices.size;
        if (newCount > 0) {
            showMessage(`✅ Вибрано ${newCount} з ${selectedFiles.length} файлів`, 'success');
        }
    }

    function clearSelection() {
        const previousCount = selectedIndices.size;
        selectedIndices.clear();
        renderFilesGrid();
        updateMergeButtons();
        if (previousCount > 0) {
            showMessage(`✖️ Знято виділення з ${previousCount} файлів`, 'info');
        }
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
        loadingOverlay.innerHTML = `
            <div class="loading-spinner">
                <div class="loader"></div>
                <div class="progress-text">
                    <p id="deleteStatus">Видалення файлів...</p>
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" id="deleteProgressBar"></div>
                    </div>
                    <p id="deleteCounter">0 / ${fileCount} файлів</p>
                </div>
            </div>
        `;
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
            deleteStatus.innerText = `Видалення: ${fileName.length > 40 ? fileName.substring(0, 37) + '...' : fileName}`;
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
        loadingOverlay.innerHTML = `
            <div class="loading-spinner">
                <div class="loader"></div>
                <div class="progress-text">
                    <p id="mergeStatus">Об'єднання файлів...</p>
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" id="mergeProgressBar"></div>
                    </div>
                    <p id="mergeCounter">0 / ${fileCount} файлів</p>
                </div>
            </div>
        `;
        document.body.appendChild(loadingOverlay);

        const mergeStatus = document.getElementById('mergeStatus');
        const mergeCounter = document.getElementById('mergeCounter');
        const mergeProgressBar = document.getElementById('mergeProgressBar');

        progressContainer.style.display = 'block';
        progressBar.style.width = '0%';

        let processed = 0;
        const totalFiles = fileCount;

        const updateProgress = () => {
            processed++;
            const percent = (processed / totalFiles) * 100;
            if (mergeProgressBar) mergeProgressBar.style.width = `${percent}%`;
            if (mergeCounter) mergeCounter.innerText = `Файлів оброблено: ${processed} з ${totalFiles}`;
            progressBar.style.width = `${percent}%`;
            if (mergeStatus) mergeStatus.innerText = `Об'єднання... ${processed} / ${totalFiles}`;
        };

        const formData = new FormData();
        for (let file of files) {
            formData.append('files', file);
            updateProgress();
            await new Promise(r => setTimeout(r, 50));
        }

        try {
            const response = await fetch('/api/pdf/merge', { method: 'POST', body: formData });

            if (response.ok) {
                mergeProgressBar.style.width = '100%';
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
            } else throw new Error(await response.text() || 'Помилка сервера');
        } catch (err) {
            loadingOverlay.remove();
            showMessage(`❌ Помилка: ${err.message}`, 'error');
        } finally {
            setTimeout(() => {
                progressContainer.style.display = 'none';
                btn.disabled = false;
            }, 1000);
        }
    }

    function initSortable() {
        if (sortable) sortable.destroy();
        if (!filesContainer) return;
        sortable = new Sortable(filesContainer, {
            animation: 200,
            onEnd: function(evt) {
                // Отримуємо перетягнутий елемент
                const draggedItem = evt.item;
                if (draggedItem) {
                    const oldIdx = parseInt(draggedItem.getAttribute('data-index'), 10);
                    // Отримуємо назву файлу
                    const fileName = selectedFiles[oldIdx]?.name || 'файл';
                    const shortName = fileName.length > 40 ? fileName.substring(0, 37) + '...' : fileName;
                    showMessage(`📌 Переміщено: ${shortName}`, 'success', 3000);
                } else {
                    showMessage('📌 Порядок файлів змінено', 'success', 3000);
                }

                // Оновлюємо порядок у масиві selectedFiles та індекси вибраних
                const items = filesContainer.querySelectorAll('.file-card');
                const newOrder = [];
                const oldSelected = new Set(selectedIndices);
                selectedIndices.clear();
                items.forEach((item, newIdx) => {
                    const oldIdx = parseInt(item.getAttribute('data-index'), 10);
                    newOrder.push(selectedFiles[oldIdx]);
                    if (oldSelected.has(oldIdx)) selectedIndices.add(newIdx);
                });
                selectedFiles = newOrder;
                items.forEach((item, newIdx) => {
                    item.setAttribute('data-index', newIdx);
                });
                updateMergeButtons();
            }
        });
    }

    function renderFilesGrid() {
        filesContainer.innerHTML = '';
        if (selectedFiles.length === 0) {
            filesContainer.innerHTML = '<div class="empty-state">Файли не вибрано</div>';
            if (sortable) sortable.destroy();
            sortable = null;
            return;
        }

        for (let i = 0; i < selectedFiles.length; i++) {
            const data = selectedFiles[i];
            const card = document.createElement('div');
            card.className = 'file-card';
            if (selectedIndices.has(i)) card.classList.add('selected');
            card.setAttribute('data-index', i);
            card.addEventListener('click', (e) => toggleFileSelection(i, e));

            const chkDiv = document.createElement('div');
            chkDiv.className = 'file-card-checkbox';
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.checked = selectedIndices.has(i);
            chk.addEventListener('click', (e) => { e.stopPropagation(); toggleFileSelection(i, e); });
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
            const rotateBtn = document.createElement('a');
            rotateBtn.className = 'file__btn rotate';
            rotateBtn.innerHTML = '<i class="fas fa-undo-alt"></i>';
            rotateBtn.href = 'javascript:;';
            rotateBtn.onclick = async (e) => { e.stopPropagation(); await rotateFileAtIndex(i); };
            const removeBtn = document.createElement('a');
            removeBtn.className = 'file__btn remove';
            removeBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
            removeBtn.href = 'javascript:;';
            removeBtn.onclick = async (e) => { e.stopPropagation(); await removeFile(i); };
            actions.appendChild(rotateBtn);
            actions.appendChild(removeBtn);
            card.appendChild(actions);

            const canvas = document.createElement('canvas');
            const img = new Image();
            img.src = data.thumbnailUrl;
            img.onload = () => { canvas.width = img.width; canvas.height = img.height; canvas.getContext('2d').drawImage(img, 0, 0); };
            canvas.style.width = '100%';
            canvas.style.height = 'auto';
            card.appendChild(canvas);

            const nameSpan = document.createElement('div');
            nameSpan.className = 'file__info__name';
            let displayName = data.name;
            if (displayName.length > 25) displayName = displayName.slice(0, 22) + '...';
            nameSpan.innerText = displayName;
            card.appendChild(nameSpan);

            filesContainer.appendChild(card);
        }
        initSortable();
        updateStats();
    }



    function updateMergeButtons() {
        const anySelected = selectedIndices.size > 0;
        const enoughSelected = selectedIndices.size >= 2;
        mergeSelectedBtn.disabled = !enoughSelected;
        mergeAllBtn.disabled = selectedFiles.length < 2;
        deleteSelectedBtn.disabled = !anySelected;
        clearSelectionBtn.disabled = !anySelected;
        selectAllBtn.disabled = (selectedIndices.size === selectedFiles.length);
        rotateSelectedBtn.disabled = !anySelected;
    }

    // Обробники подій
    uploader.addEventListener('click', (e) => {
        if (pickButton && (e.target === pickButton || pickButton.contains(e.target))) return;
        fileInput.click();
    });

    if (pickButton) {
        pickButton.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.click();
        });
    }

    uploader.addEventListener('dragover', (e) => { e.preventDefault(); uploader.classList.add('drag-over'); });
    uploader.addEventListener('dragleave', () => { uploader.classList.remove('drag-over'); });
    uploader.addEventListener('drop', async (e) => { e.preventDefault(); uploader.classList.remove('drag-over'); const files = Array.from(e.dataTransfer.files); if (files.length) await addFiles(files); });
    fileInput.addEventListener('change', async (e) => { const files = Array.from(e.target.files); if (files.length) await addFiles(files); fileInput.value = ''; });
    addMoreBtn.addEventListener('click', () => fileInput.click());
    selectAllBtn.addEventListener('click', selectAll);
    clearSelectionBtn.addEventListener('click', clearSelection);
    deleteSelectedBtn.addEventListener('click', deleteSelected);
    mergeSelectedBtn.addEventListener('click', mergeSelected);
    mergeAllBtn.addEventListener('click', mergeAll);
    rotateSelectedBtn.addEventListener('click', rotateSelected);
});