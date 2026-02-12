// ... (Rest of the file remains same until solveWithMistral)

function confirmPageNumber(detectedPage) {
    return new Promise((resolve) => {
        const modalConfirm = document.getElementById('modal-confirm-page');
        const modalEdit = document.getElementById('modal-edit-page');
        const display = document.getElementById('confirm-page-display');
        const btnYes = document.getElementById('btn-page-yes');
        const btnNo = document.getElementById('btn-page-no');
        const btnSave = document.getElementById('btn-save-page');
        const inputCorrect = document.getElementById('input-correct-page');

        // Initial Page Display
        // If detectedPage is null or '?', default to current pending, else use detected
        let currentGuess = (detectedPage && detectedPage !== '?') ? detectedPage : state.pendingUpload.page;
        if (currentGuess === '?') currentGuess = '';

        display.textContent = currentGuess || "--";

        showModal(modalConfirm);

        // Handlers
        const onYes = () => {
            cleanup();
            hideModal(modalConfirm);
            resolve(currentGuess || document.getElementById('input-page').value); // Fallback to initial input
        };

        const onNo = () => {
            hideModal(modalConfirm);
            setTimeout(() => {
                inputCorrect.value = currentGuess;
                showModal(modalEdit);
            }, 300);
        };

        const onSave = () => {
            const val = inputCorrect.value;
            if (val) {
                cleanup();
                hideModal(modalEdit);
                resolve(val);
            } else {
                alert("Introduce un número");
            }
        };

        const cleanup = () => {
            btnYes.removeEventListener('click', onYes);
            btnNo.removeEventListener('click', onNo);
            btnSave.removeEventListener('click', onSave);
        };

        btnYes.addEventListener('click', onYes);
        btnNo.addEventListener('click', onNo);
        btnSave.addEventListener('click', onSave);
    });
}
