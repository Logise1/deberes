// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDPEsl_dE1fzYkuxemJRvhDxpfvYZfgGZo",
    authDomain: "calendar-1868c.firebaseapp.com",
    projectId: "calendar-1868c",
    storageBucket: "calendar-1868c.firebasestorage.app",
    messagingSenderId: "872239833100",
    appId: "1:872239833100:web:b9059b5f589825f2950e29",
    measurementId: "G-RRR30MYKXW"
};

try {
    firebase.initializeApp(firebaseConfig);
    console.log("Firebase initialized");
} catch (e) {
    console.error("Firebase init error", e);
}

const db = firebase.firestore();

// Application State
const state = {
    currentView: 'view-subjects',
    selectedSubject: null,
    selectedPage: null,
    subjects: [
        'Matemáticas', 'Física y Química', 'Lengua', 'Geografía',
        'TIC', 'ATE', 'EPVA', 'Project', 'Inglés',
        'Tecnología y Digitalización', 'Otros'
    ],
    englishCategories: ['Student\'s Book', 'Workbook'], // Subcategories for English
    sortOrder: 'date', // 'date' or 'page'
    userName: localStorage.getItem('userName') || null, // User's name

    cameraStream: null,
    unsubscribePages: null,
    pendingUpload: { subject: null, page: null },
    pendingPageView: null, // Page data waiting to be shown after contribution
    contributionPage: null, // The page number to contribute
    allPages: [] // Cache of all pages for finding missing ones
};

// DOM Elements
const views = {
    subjects: document.getElementById('view-subjects'),
    pages: document.getElementById('view-pages'),
    result: document.getElementById('view-result')
};
const headerTitle = document.getElementById('header-title');
const backBtn = document.getElementById('back-btn');
const subjectListEl = document.getElementById('subject-list');
const pageListEl = document.getElementById('page-list');
const resultContent = document.getElementById('result-content');
const fabAdd = document.getElementById('fab-add');
const modalSelect = document.getElementById('modal-select');
const selectSubject = document.getElementById('select-subject');
const inputPage = document.getElementById('input-page');
const btnConfirmSelect = document.getElementById('btn-confirm-select');
const btnCancelSelect = document.getElementById('btn-cancel-select');
const overlayCamera = document.getElementById('overlay-camera');
const videoEl = document.getElementById('camera-feed');
const btnCapture = document.getElementById('btn-capture');
const btnCloseCamera = document.getElementById('btn-close-camera');
const overlayProcessing = document.getElementById('overlay-processing');
const processingText = document.getElementById('processing-text');
const progressBar = document.getElementById('progress-bar'); // NEW
const canvas = document.getElementById('camera-canvas');
const modalContribution = document.getElementById('modal-contribution');
const contributionPageNumber = document.getElementById('contribution-page-number');
const contributionSubject = document.getElementById('contribution-subject');
const btnContributeYes = document.getElementById('btn-contribute-yes');
const btnContributeNo = document.getElementById('btn-contribute-no');
const cameraPageOverlay = document.getElementById('camera-page-overlay');
const cameraPageNumber = document.getElementById('camera-page-number');

const MISTRAL_API_KEY = "evxly62Xv91b752fbnHA2I3HD988C5RT";
const GREENHOST_API_URL = "https://greenbase.arielcapdevila.com";
const WORKER_URL = "https://deberes.logise1123.workers.dev";

// --- Initialization ---

function init() {
    renderSubjects();
    setupEventListeners();
    populateSubjectSelect();
    handleURLParams(); // Check URL parameters and navigate
}

function setupEventListeners() {
    backBtn.addEventListener('click', () => {
        if (state.currentView === 'view-result') {
            navigateTo('view-pages', state.selectedSubject);
        } else if (state.currentView === 'view-pages') {
            navigateTo('view-subjects');
        }
    });

    fabAdd.addEventListener('click', () => {
        if (state.selectedSubject) {
            selectSubject.value = state.selectedSubject;
        }
        inputPage.value = ''; // Reset
        showModal(modalSelect);
    });

    btnCancelSelect.addEventListener('click', () => hideModal(modalSelect));

    btnConfirmSelect.addEventListener('click', () => {
        const subject = selectSubject.value;
        const page = inputPage.value;
        if (!subject) {
            alert("Por favor selecciona asignatura");
            return;
        }
        if (!page) {
            alert("Por favor introduce el número de página");
            return;
        }
        hideModal(modalSelect);
        startCameraFlow(subject, page);
    });

    btnCloseCamera.addEventListener('click', stopCamera);
    btnCapture.addEventListener('click', handleCapture);

    // Contribution modal buttons
    btnContributeYes.addEventListener('click', handleContributeYes);
    btnContributeNo.addEventListener('click', handleContributeNo);

    // Sort selector
    const sortSelector = document.getElementById('sort-selector');
    sortSelector.addEventListener('change', (e) => {
        state.sortOrder = e.target.value;
        if (state.selectedSubject) {
            loadPages(state.selectedSubject); // Reload with new sort
        }
    });
}

// --- Navigation & Rendering (Same as before) ---
function navigateTo(viewId, param = null) {
    Object.values(views).forEach(el => el.classList.remove('active'));
    state.currentView = viewId;
    views[viewId.replace('view-', '')].classList.add('active');

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (viewId === 'view-subjects') {
        headerTitle.textContent = "Asignaturas";
        backBtn.classList.add('hidden');
        fabAdd.classList.remove('hidden');
        state.selectedSubject = null;
        updateURL(viewId); // Update URL to root
    } else if (viewId === 'view-pages') {
        state.selectedSubject = param;
        headerTitle.textContent = param;
        backBtn.classList.remove('hidden');
        fabAdd.classList.remove('hidden');
        loadPages(param);
        updateURL(viewId, param); // Update URL with class parameter
    } else if (viewId === 'view-result') {
        state.selectedPage = param;
        headerTitle.textContent = `Pág ${param.page}`;
        backBtn.classList.remove('hidden');
        fabAdd.classList.add('hidden');
        renderResult(param);
        updateURL(viewId, param.subject, param.page); // Update URL with class and page
    }
}

function renderSubjects() {
    subjectListEl.innerHTML = '';
    state.subjects.forEach(sub => {
        const card = document.createElement('div');
        card.className = 'subject-card';
        const icon = getSubjectIcon(sub);
        card.innerHTML = `<span class="subject-icon">${icon}</span><div class="subject-name">${sub}</div>`;

        // Handle English subcategories
        if (sub === 'Inglés') {
            card.onclick = () => showEnglishSubcategoryModal();
        } else {
            card.onclick = () => navigateTo('view-pages', sub);
        }

        subjectListEl.appendChild(card);
    });
}

function showEnglishSubcategoryModal() {
    const modal = document.getElementById('modal-english-sub');
    showModal(modal);

    const btnStudents = document.getElementById('btn-students-book');
    const btnWorkbook = document.getElementById('btn-workbook');
    const btnCancelEnglish = document.getElementById('btn-cancel-english');

    // Clone to remove old listeners
    const newBtnStudents = btnStudents.cloneNode(true);
    const newBtnWorkbook = btnWorkbook.cloneNode(true);
    const newBtnCancel = btnCancelEnglish.cloneNode(true);

    btnStudents.parentNode.replaceChild(newBtnStudents, btnStudents);
    btnWorkbook.parentNode.replaceChild(newBtnWorkbook, btnWorkbook);
    btnCancelEnglish.parentNode.replaceChild(newBtnCancel, btnCancelEnglish);

    newBtnStudents.onclick = () => {
        hideModal(modal);
        navigateTo('view-pages', 'Inglés - Student\'s Book');
    };

    newBtnWorkbook.onclick = () => {
        hideModal(modal);
        navigateTo('view-pages', 'Inglés - Workbook');
    };

    newBtnCancel.onclick = () => hideModal(modal);
}

function getSubjectIcon(subject) {
    const icons = {
        'Matemáticas': '📐', 'Física y Química': '🧪', 'Lengua': '📚',
        'Geografía': '🌍', 'TIC': '💻', 'ATE': '🧩', 'EPVA': '🎨',
        'Project': '🚀', 'Inglés': '🇬🇧', 'Educación Física': '⚽',
        'Tecnología y Digitalización': '🤖', 'Otros': '📦'
    };
    return icons[subject] || '📝';
}

function populateSubjectSelect() {
    selectSubject.innerHTML = '';
    state.subjects.forEach(sub => {
        if (sub === 'Inglés') {
            // Add subcategories for English
            state.englishCategories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = `Inglés - ${cat}`;
                opt.textContent = `Inglés - ${cat}`;
                selectSubject.appendChild(opt);
            });
        } else {
            const opt = document.createElement('option');
            opt.value = sub;
            opt.textContent = sub;
            selectSubject.appendChild(opt);
        }
    });
}

function loadPages(subject) {
    pageListEl.innerHTML = '<div class="spinner" style="border-color: var(--primary-color); border-top-color: transparent; margin: 2rem auto;"></div>';
    if (state.unsubscribePages) state.unsubscribePages();

    // Build query based on sort order
    let query = db.collection('pages').where('subject', '==', subject);

    if (state.sortOrder === 'date') {
        query = query.orderBy('timestamp', 'desc');
    } else {
        query = query.orderBy('page', 'asc');
    }

    state.unsubscribePages = query.onSnapshot(snapshot => {
        pageListEl.innerHTML = '';
        if (snapshot.empty) {
            pageListEl.innerHTML = '<p style="text-align:center; color: var(--text-muted);">No hay páginas escaneadas aún.</p>';
            return;
        }
        snapshot.forEach(doc => {
            const data = doc.data();
            const item = document.createElement('div');
            item.className = 'page-item';
            item.innerHTML = `
                <div style="flex-grow: 1;">
                    <span class="page-number">Pág ${data.page}</span>
                    ${data.providedBy ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Proporcionado por ${data.providedBy}</div>` : ''}
                </div>
                <span class="page-status">Ver solución ›</span>
            `;
            item.onclick = () => handlePageClick(data);
            pageListEl.appendChild(item);
        });

        // Add footer with "Add page" prompt
        const footer = document.createElement('div');
        footer.style.cssText = 'text-align: center; padding: 2rem 1rem; color: var(--text-muted);';
        footer.innerHTML = `
            <p style="margin-bottom: 0.5rem; font-size: 0.95rem;">¿No está la página que buscas?</p>
            <a href="#" id="add-page-link" style="color: var(--primary-color); font-weight: 600; text-decoration: none; font-size: 0.9rem;">
                Añádela ahora →
            </a>
        `;
        pageListEl.appendChild(footer);

        // Add click handler to the link
        document.getElementById('add-page-link').addEventListener('click', (e) => {
            e.preventDefault();
            fabAdd.click(); // Trigger the FAB click
        });
    }, error => {
        console.error("Error watching pages: ", error);
        pageListEl.innerHTML = `<p style="color:var(--error)">Error al cargar páginas.</p>`;
    });
}

// Handle page click - may trigger contribution request
async function handlePageClick(pageData) {
    // Store all pages for this subject
    const snapshot = await db.collection('pages')
        .where('subject', '==', pageData.subject)
        .get();

    state.allPages = snapshot.docs.map(doc => parseInt(doc.data().page));

    // Find a random missing page nearby
    const missingPage = findRandomMissingPage(pageData.subject, state.allPages);

    if (missingPage !== null) {
        // Show contribution request
        state.pendingPageView = pageData;
        state.contributionPage = missingPage;
        contributionPageNumber.textContent = missingPage;
        contributionSubject.textContent = pageData.subject;
        showModal(modalContribution);
    } else {
        // No missing pages, show directly
        navigateTo('view-result', pageData);
    }
}

// Find a random missing page (preferably +1 or -1 from existing pages)
function findRandomMissingPage(subject, existingPages) {
    if (existingPages.length === 0) return 1; // If no pages, suggest page 1

    const candidates = new Set();

    // Look for gaps around existing pages
    existingPages.forEach(page => {
        if (!existingPages.includes(page - 1)) {
            candidates.add(page - 1);
        }
        if (!existingPages.includes(page + 1)) {
            candidates.add(page + 1);
        }
    });

    // Remove pages <= 0
    const validCandidates = Array.from(candidates).filter(p => p > 0);

    if (validCandidates.length === 0) {
        return null; // No missing pages nearby
    }

    // Return a random candidate
    return validCandidates[Math.floor(Math.random() * validCandidates.length)];
}

// Handle "Yes" button on contribution modal
function handleContributeYes() {
    hideModal(modalContribution);

    // Set up for contribution
    selectSubject.value = state.pendingPageView.subject;
    inputPage.value = state.contributionPage;

    // Start camera flow for contribution
    startCameraFlowForContribution(state.pendingPageView.subject, state.contributionPage);
}

// Handle "No" button on contribution modal
function handleContributeNo() {
    hideModal(modalContribution);

    // Show a countdown overlay
    showCountdownAndProceed();
}

// Show countdown before showing the page
function showCountdownAndProceed() {
    overlayProcessing.classList.remove('hidden');
    progressBar.style.width = '0%';

    let secondsLeft = 10;
    processingText.textContent = `⏱️ Esperando ${secondsLeft} segundos...`;

    const interval = setInterval(() => {
        secondsLeft--;
        processingText.textContent = `⏱️ Esperando ${secondsLeft} segundos...`;
        progressBar.style.width = `${(10 - secondsLeft) * 10}%`;

        if (secondsLeft <= 0) {
            clearInterval(interval);
            overlayProcessing.classList.add('hidden');
            navigateTo('view-result', state.pendingPageView);
            state.pendingPageView = null;
        }
    }, 1000);
}

// Start camera flow specifically for contribution
function startCameraFlowForContribution(subject, page) {
    state.pendingUpload = { subject, page, isContribution: true };
    overlayCamera.classList.remove('hidden');

    // Show page number overlay
    cameraPageNumber.textContent = page;
    cameraPageOverlay.classList.remove('hidden');

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({
            video: { facingMode: { exact: "environment" }, width: { ideal: 4096 }, height: { ideal: 2160 } }
        })
            .then(stream => {
                state.cameraStream = stream;
                videoEl.srcObject = stream;
            })
            .catch(err => {
                navigator.mediaDevices.getUserMedia({ video: true })
                    .then(stream => {
                        state.cameraStream = stream;
                        videoEl.srcObject = stream;
                    });
            });
    } else {
        alert("Sin acceso a cámara");
    }
}

function renderResult(pageData) {
    let solution = [];
    try {
        if (typeof pageData.solution === 'string') {
            const cleanJson = pageData.solution.replace(/```json/g, '').replace(/```/g, '').trim();
            solution = JSON.parse(cleanJson);
        } else {
            solution = pageData.solution;
        }

        // Normalize to fix field name variations (questions→question, etc.)
        if (solution && solution.exercises) {
            solution = normalizeExerciseData(solution);
        }
    } catch (e) {
        console.error("JSON Parse Error", e);
        resultContent.innerHTML = `<div class="exercise-card"><p>Error al procesar la respuesta de la IA.</p></div>`;
        return;
    }

    let html = `
        <div class="result-header">
            <img src="${pageData.imageUrl}" style="width:100%; border-radius: var(--radius); margin-bottom: 1rem;" alt="Foto de la página">
            <h3>Soluciones</h3>
        </div>
    `;

    if (solution.exercises) solution = solution.exercises;

    if (Array.isArray(solution)) {
        // Group exercises by main number (1, 2, 3, etc.)
        const grouped = {};

        solution.forEach((item) => {
            const exNum = item.exercise || '';
            // Extract main exercise number (e.g., "1" from "1.1" or "1")
            const mainNum = exNum.toString().split('.')[0] || exNum;

            if (!grouped[mainNum]) {
                grouped[mainNum] = {
                    mainNumber: mainNum,
                    mainQuestion: '',
                    parts: []
                };
            }

            // Detect if this is a main exercise title or a sub-part
            const hasParts = exNum.toString().includes('.');

            if (!hasParts && item.question && !item.solution) {
                // This is likely the main exercise header
                grouped[mainNum].mainQuestion = item.question;
            } else {
                // This is a solution part
                grouped[mainNum].parts.push({
                    number: exNum,
                    question: item.question || '',
                    solution: item.solution || item.answer || ''
                });
            }
        });

        // Render grouped exercises
        Object.values(grouped).forEach((exercise, index) => {
            const exerciseId = `exercise-${index}`;
            html += `
                <div class="exercise-card collapsible" data-exercise-id="${exerciseId}" style="border-left: 4px solid var(--primary-color); padding: 1.25rem;">
                    <div class="exercise-main-header" style="margin-bottom: 1rem; display: flex; align-items: center; justify-content: space-between; cursor: pointer;" onclick="toggleExercise('${exerciseId}')">
                        <div>
                            <span style="font-weight: 800; color: var(--primary-color); font-size: 1.3em; margin-right: 0.5rem;">${exercise.mainNumber}.</span>
                            <span style="font-weight: 600; color: var(--text-main); font-size: 1.1em;">${exercise.mainQuestion}</span>
                        </div>
                        <button class="collapse-btn" aria-label="Colapsar ejercicio">
                            <svg class="chevron-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M6 9l6 6 6-6"/>
                            </svg>
                        </button>
                    </div>
                    <div class="exercise-parts" id="${exerciseId}" style="display: flex; flex-direction: column; gap: 0.75rem; padding-left: 1rem;">
            `;

            exercise.parts.forEach(part => {
                const renderValue = (val) => {
                    if (val === null || val === undefined) return '';
                    if (Array.isArray(val)) {
                        return `<ul style="padding-left:1.2rem; margin:0.5rem 0; list-style-type: disc;">
                            ${val.map(v => `<li>${renderValue(v)}</li>`).join('')}
                        </ul>`;
                    }
                    if (typeof val === 'object') {
                        return `<div style="margin-left: 0.5rem;">
                            ${Object.entries(val).map(([k, v]) => `<div><strong style="color:var(--secondary-color);">${k}:</strong> ${renderValue(v)}</div>`).join('')}
                        </div>`;
                    }
                    return val;
                };

                html += `
                    <div class="exercise-part" style="background: rgba(37, 99, 235, 0.05); padding: 0.75rem; border-radius: 8px;">
                        ${part.question ? `<div style="font-weight: 500; color: var(--text-main); margin-bottom: 0.25rem;">${part.number}. ${part.question}</div>` : ''}
                        <div style="color: var(--text-muted); font-family: 'Inter', sans-serif; margin-left: ${part.question ? '1rem' : '0'};">
                            ${renderValue(part.solution)}
                        </div>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        });
    } else {
        html += `<pre style="white-space: pre-wrap;">${JSON.stringify(solution, null, 2)}</pre>`;
    }
    resultContent.innerHTML = html;
}

// --- Camera & Overlay ---

function showModal(modal) {
    modal.classList.add('visible');
    requestAnimationFrame(() => modal.style.opacity = '1');
}

function hideModal(modal) {
    modal.style.opacity = '0';
    setTimeout(() => modal.classList.remove('visible'), 300);
}

function startCameraFlow(subject, page) {
    state.pendingUpload = { subject, page };
    overlayCamera.classList.remove('hidden');

    // Hide page number overlay (only show for contributions)
    cameraPageOverlay.classList.add('hidden');

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({
            video: { facingMode: { exact: "environment" }, width: { ideal: 4096 }, height: { ideal: 2160 } }
        })
            .then(stream => {
                state.cameraStream = stream;
                videoEl.srcObject = stream;
            })
            .catch(err => {
                navigator.mediaDevices.getUserMedia({ video: true })
                    .then(stream => {
                        state.cameraStream = stream;
                        videoEl.srcObject = stream;
                    });
            });
    } else {
        alert("Sin acceso a cámara");
    }
}

function stopCamera() {
    if (state.cameraStream) {
        state.cameraStream.getTracks().forEach(track => track.stop());
        state.cameraStream = null;
    }
    overlayCamera.classList.add('hidden');

    // Hide page number overlay
    cameraPageOverlay.classList.add('hidden');
}

async function handleCapture() {
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    canvas.getContext('2d').drawImage(videoEl, 0, 0);
    stopCamera();

    // Check if this is a contribution
    const isContribution = state.pendingUpload.isContribution;

    // Show Progress Overlay
    overlayProcessing.classList.remove('hidden');
    processingText.textContent = isContribution ? "📤 Subiendo contribución..." : "Analizando (20s)...";
    progressBar.style.width = '0%';

    canvas.toBlob(blob => {
        if (blob) processImage(blob, isContribution);
    }, 'image/jpeg', 0.85);
}

// --- Processing with 20s Timer ---

// Normalize exercise data to fix common AI field naming issues
function normalizeExerciseData(data) {
    if (!data || typeof data !== 'object') return data;

    // If it has exercises array, normalize it
    if (Array.isArray(data.exercises)) {
        data.exercises = data.exercises.map(item => {
            const normalized = {};

            // Handle exercise number (various names)
            normalized.exercise = item.exercise || item.exercises || item.number || item.id || '';

            // Handle question (various names)
            normalized.question = item.question || item.questions || item.enunciado || item.prompt || '';

            // Handle solution (various names)
            normalized.solution = item.solution || item.solutions || item.answer || item.respuesta || '';

            return normalized;
        });
    }

    return data;
}

async function processImage(imageBlob, isContribution = false) {
    // Always use local processing
    try {
        // Step 1: Upload (0 -> 25%)
        processingText.textContent = "📤 Subiendo imagen...";
        progressBar.style.width = '0%';
        const imageUrl = await uploadToGreenHost(imageBlob);
        progressBar.style.width = '25%';

        // Step 2: Text extraction (25% -> 50%)
        processingText.textContent = "👁️ Leyendo texto con IA...";
        const transcription = await extractTextWithPixtral(imageUrl);
        progressBar.style.width = '50%';

        // Step 3: Solving (50% -> 75%)
        processingText.textContent = "🧠 Resolviendo ejercicios...";
        const aiJson = await solveWithMistral(transcription);
        progressBar.style.width = '75%';

        let aiData;
        try {
            aiData = JSON.parse(aiJson);
            aiData = normalizeExerciseData(aiData); // Fix field name variations
        } catch (e) {
            aiData = { exercises: [] };
        }

        // Step 4: Check for username
        if (!state.userName) {
            // Hide processing, ask for name
            overlayProcessing.classList.add('hidden');
            const name = await promptForUsername();
            if (!name) {
                throw new Error("Nombre requerido para continuar");
            }
            state.userName = name;
            localStorage.setItem('userName', name);
            // Show processing again
            overlayProcessing.classList.remove('hidden');
        }

        // Step 5: Saving (75% -> 100%)
        processingText.textContent = "💾 Guardando en Firebase...";
        progressBar.style.width = '90%';
        const pageData = {
            subject: state.pendingUpload.subject,
            page: parseInt(state.pendingUpload.page),
            imageUrl: imageUrl,
            solution: aiData.exercises || aiData,
            providedBy: state.userName,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('pages').add(pageData);

        // Complete
        processingText.textContent = "✅ Completado!";
        progressBar.style.width = '100%';

        setTimeout(() => {
            overlayProcessing.classList.add('hidden');

            if (isContribution && state.pendingPageView) {
                // After contribution, show the original page they wanted
                navigateTo('view-result', state.pendingPageView);
                state.pendingPageView = null;
            } else {
                navigateTo('view-result', pageData);
            }
        }, 300);

    } catch (error) {
        console.error(error);
        processingText.textContent = "❌ Error: " + error.message;
        progressBar.style.width = '0%';
        setTimeout(() => {
            overlayProcessing.classList.add('hidden');
            alert("Error: " + error.message);
        }, 2000);
    }
}

function promptForUsername() {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-username');
        const inputUsername = document.getElementById('input-username');
        const btnSave = document.getElementById('btn-save-username');

        // Clone button to remove old listeners
        const newBtnSave = btnSave.cloneNode(true);
        btnSave.parentNode.replaceChild(newBtnSave, btnSave);

        inputUsername.value = '';
        showModal(modal);
        inputUsername.focus();

        newBtnSave.onclick = () => {
            const name = inputUsername.value.trim();
            if (!name) {
                alert("Por favor introduce tu nombre");
                return;
            }
            hideModal(modal);
            resolve(name);
        };

        // Enter key support
        inputUsername.onkeypress = (e) => {
            if (e.key === 'Enter') {
                newBtnSave.click();
            }
        };
    });
}

async function uploadToGreenHost(blob) {
    const formData = new FormData();
    formData.append('file', blob, 'scan.jpg');
    const res = await fetch(`${GREENHOST_API_URL}/upload`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error("Upload failed");
    return `${GREENHOST_API_URL}/file/${(await res.json()).id}`;
}

async function extractTextWithPixtral(imageUrl) {
    const prompt = "Transcribe TODO el texto de los ejercicios. Solo texto.";
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${MISTRAL_API_KEY}` },
        body: JSON.stringify({
            model: "pixtral-12b-latest",
            messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: imageUrl }] }],
            temperature: 0.1
        })
    });
    if (!res.ok) throw new Error("Pixtral failed");
    return (await res.json()).choices[0].message.content;
}

async function solveWithMistral(transcription) {
    const prompt = `Eres un profesor experto. Resuelve TODOS los ejercicios de esta página de deberes.

TEXTO DE LA PÁGINA:
---
${transcription}
---

INSTRUCCIONES IMPORTANTES:
1. Identifica TODOS los ejercicios
2. Resuelve cada ejercicio completamente
3. Devuelve SOLAMENTE un objeto JSON válido
4. NO incluyas ningún texto adicional, comentarios ni explicaciones fuera del JSON

FORMATO JSON OBLIGATORIO (USA EXACTAMENTE ESTOS NOMBRES DE CAMPOS):
{
  "exercises": [
    {
      "exercise": "NÚMERO_DEL_EJERCICIO",
      "question": "ENUNCIADO_DEL_EJERCICIO",
      "solution": "SOLUCIÓN_COMPLETA"
    }
  ]
}

REGLAS ESTRICTAS:
- El campo DEBE llamarse "exercise" (singular, no "exercises")
- El campo DEBE llamarse "question" (singular, no "questions")
- El campo DEBE llamarse "solution" (singular, no "solutions")
- "exercise" es el número o identificador (ej: "1", "1.1", "2a")
- "question" es el enunciado completo del ejercicio
- "solution" es la respuesta o solución completa

EJEMPLO VÁLIDO:
{
  "exercises": [
    {
      "exercise": "1",
      "question": "Calcula 5 + 3",
      "solution": "8"
    },
    {
      "exercise": "2",
      "question": "¿Cuál es la capital de Francia?",
      "solution": "París"
    }
  ]
}

Ahora resuelve los ejercicios y devuelve SOLAMENTE el JSON con el formato exacto especificado arriba.`;

    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${MISTRAL_API_KEY}` },
        body: JSON.stringify({
            model: "mistral-large-latest",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.3
        })
    });
    if (!res.ok) throw new Error("Mistral failed");
    return (await res.json()).choices[0].message.content;
}

// --- URL Parameters Navigation ---

function parseURLParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        class: params.get('class'),
        page: params.get('page')
    };
}

function updateURL(view, subject = null, page = null) {
    const params = new URLSearchParams();

    if (view === 'view-pages' && subject) {
        params.set('class', subject);
    } else if (view === 'view-result' && subject && page) {
        params.set('class', subject);
        params.set('page', page);
    }

    const newURL = params.toString() ? `?${params.toString()}` : window.location.pathname;
    window.history.pushState({}, '', newURL);
}

async function handleURLParams() {
    const params = parseURLParams();

    if (params.class && params.page) {
        // Navigate to specific page
        const pageNumber = parseInt(params.page);
        const snapshot = await db.collection('pages')
            .where('subject', '==', params.class)
            .where('page', '==', pageNumber)
            .limit(1)
            .get();

        if (!snapshot.empty) {
            const pageData = snapshot.docs[0].data();
            navigateTo('view-result', pageData);
        } else {
            // Page not found, just navigate to subject
            navigateTo('view-pages', params.class);
        }
    } else if (params.class) {
        // Navigate to subject
        navigateTo('view-pages', params.class);
    }
    // Otherwise stay on subjects view
}

// --- Collapsible Exercise Cards ---

function toggleExercise(exerciseId) {
    const exerciseParts = document.getElementById(exerciseId);
    const exerciseCard = document.querySelector(`[data-exercise-id="${exerciseId}"]`);
    const chevronIcon = exerciseCard.querySelector('.chevron-icon');

    if (exerciseParts.style.display === 'none') {
        exerciseParts.style.display = 'flex';
        exerciseCard.classList.remove('collapsed');
        chevronIcon.style.transform = 'rotate(0deg)';
    } else {
        exerciseParts.style.display = 'none';
        exerciseCard.classList.add('collapsed');
        chevronIcon.style.transform = 'rotate(-90deg)';
    }
}

document.addEventListener('DOMContentLoaded', init);
