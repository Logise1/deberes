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
        'Educación Física', 'Tecnología y Digitalización', 'Otros'
    ],
    cameraStream: null,
    unsubscribePages: null,
    pendingUpload: { subject: null, page: null }
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

const MISTRAL_API_KEY = "evxly62Xv91b752fbnHA2I3HD988C5RT";
const GREENHOST_API_URL = "https://greenbase.arielcapdevila.com";

// --- Initialization ---

function init() {
    renderSubjects();
    setupEventListeners();
    populateSubjectSelect();
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
}

// --- Navigation & Rendering (Same as before) ---
function navigateTo(viewId, param = null) {
    Object.values(views).forEach(el => el.classList.remove('active'));
    state.currentView = viewId;
    views[viewId.replace('view-', '')].classList.add('active');

    if (viewId === 'view-subjects') {
        headerTitle.textContent = "Asignaturas";
        backBtn.classList.add('hidden');
        fabAdd.classList.remove('hidden');
        state.selectedSubject = null;
    } else if (viewId === 'view-pages') {
        state.selectedSubject = param;
        headerTitle.textContent = param;
        backBtn.classList.remove('hidden');
        fabAdd.classList.remove('hidden');
        loadPages(param);
    } else if (viewId === 'view-result') {
        state.selectedPage = param;
        headerTitle.textContent = `Pág ${param.page}`;
        backBtn.classList.remove('hidden');
        fabAdd.classList.add('hidden');
        renderResult(param);
    }
}

function renderSubjects() {
    subjectListEl.innerHTML = '';
    state.subjects.forEach(sub => {
        const card = document.createElement('div');
        card.className = 'subject-card';
        const icon = getSubjectIcon(sub);
        card.innerHTML = `<span class="subject-icon">${icon}</span><div class="subject-name">${sub}</div>`;
        card.onclick = () => navigateTo('view-pages', sub);
        subjectListEl.appendChild(card);
    });
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
        const opt = document.createElement('option');
        opt.value = sub;
        opt.textContent = sub;
        selectSubject.appendChild(opt);
    });
}

function loadPages(subject) {
    pageListEl.innerHTML = '<div class="spinner" style="border-color: var(--primary-color); border-top-color: transparent; margin: 2rem auto;"></div>';
    if (state.unsubscribePages) state.unsubscribePages();

    state.unsubscribePages = db.collection('pages')
        .where('subject', '==', subject)
        .orderBy('timestamp', 'desc')
        .onSnapshot(snapshot => {
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
                    <span class="page-number">Pág ${data.page}</span>
                    <span class="page-status">Ver solución ›</span>
                `;
                item.onclick = () => navigateTo('view-result', data);
                pageListEl.appendChild(item);
            });
        }, error => {
            console.error("Error watching pages: ", error);
            pageListEl.innerHTML = `<p style="color:var(--error)">Error al cargar páginas.</p>`;
        });
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
        Object.values(grouped).forEach(exercise => {
            html += `
                <div class="exercise-card" style="border-left: 4px solid var(--primary-color); padding: 1.25rem;">
                    <div class="exercise-main-header" style="margin-bottom: 1rem;">
                        <span style="font-weight: 800; color: var(--primary-color); font-size: 1.3em; margin-right: 0.5rem;">${exercise.mainNumber}.</span>
                        <span style="font-weight: 600; color: var(--text-main); font-size: 1.1em;">${exercise.mainQuestion}</span>
                    </div>
                    <div class="exercise-parts" style="display: flex; flex-direction: column; gap: 0.75rem; padding-left: 1rem;">
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
}

async function handleCapture() {
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    canvas.getContext('2d').drawImage(videoEl, 0, 0);
    stopCamera();

    // Show Progress Overlay
    overlayProcessing.classList.remove('hidden');
    processingText.textContent = "Analizando (20s)...";
    progressBar.style.width = '0%';

    canvas.toBlob(blob => {
        if (blob) processImage(blob);
    }, 'image/jpeg', 0.85);
}

// --- Processing with 20s Timer ---

async function processImage(imageBlob) {
    const DURATION = 20000; // 20 seconds minimum
    let currentProgress = 0;

    try {
        // Smooth progress animation
        const updateProgress = (target, message) => {
            processingText.textContent = message;
            const increment = (target - currentProgress) / 20;
            const interval = setInterval(() => {
                currentProgress += increment;
                if (currentProgress >= target) {
                    currentProgress = target;
                    clearInterval(interval);
                }
                progressBar.style.width = `${Math.min(currentProgress, 100)}%`;
            }, 50);
        };

        // Step 1: Upload
        updateProgress(25, "📤 Subiendo imagen...");
        const imageUrl = await uploadToGreenHost(imageBlob);
        await new Promise(r => setTimeout(r, 1000));

        // Step 2: Text extraction
        updateProgress(50, "👁️ Leyendo texto con IA...");
        const transcription = await extractTextWithPixtral(imageUrl);
        await new Promise(r => setTimeout(r, 1000));

        // Step 3: Solving
        updateProgress(85, "🧠 Resolviendo ejercicios...");
        const aiJson = await solveWithMistral(transcription);

        let aiData;
        try {
            aiData = JSON.parse(aiJson);
        } catch (e) {
            aiData = { exercises: [] };
        }

        // Step 4: Saving
        updateProgress(95, "💾 Guardando en Firebase...");
        const pageData = {
            subject: state.pendingUpload.subject,
            page: parseInt(state.pendingUpload.page),
            imageUrl: imageUrl,
            solution: aiData.exercises || aiData,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('pages').add(pageData);

        // Wait for minimum duration
        const elapsed = Date.now() - Date.now();
        if (elapsed < DURATION) {
            await new Promise(r => setTimeout(r, DURATION - elapsed));
        }

        // Complete
        updateProgress(100, "✅ Completado!");
        progressBar.style.width = '100%';

        setTimeout(() => {
            overlayProcessing.classList.add('hidden');
            navigateTo('view-result', pageData);
        }, 500);

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
    const prompt = `
        Eres un profesor. Resuelve estos ejercicios escolares:
        ---
        ${transcription}
        ---
        Formato JSON:
        {
          "exercises": [
            { "exercise": "1", "question": "...", "solution": "..." }
          ]
        }
    `;
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${MISTRAL_API_KEY}` },
        body: JSON.stringify({
            model: "mistral-large-latest",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
        })
    });
    if (!res.ok) throw new Error("Mistral failed");
    return (await res.json()).choices[0].message.content;
}

document.addEventListener('DOMContentLoaded', init);
