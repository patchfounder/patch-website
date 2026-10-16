(() => {
  const dialog = document.getElementById('email-dialog');
  const previewButton = document.getElementById('preview-email');
  const closeButton = document.getElementById('close-email');
  const trainingLink = dialog.querySelector('.email-training-link');

  previewButton.addEventListener('click', () => {
    dialog.showModal();
    document.body.classList.add('has-modal');
    closeButton.focus();
  });

  closeButton.addEventListener('click', () => dialog.close());

  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    const outside = event.clientX < bounds.left || event.clientX > bounds.right
      || event.clientY < bounds.top || event.clientY > bounds.bottom;
    if (outside) dialog.close();
  });

  dialog.addEventListener('close', () => {
    document.body.classList.remove('has-modal');
    previewButton.focus();
  });

  trainingLink.addEventListener('click', (event) => {
    event.preventDefault();
    dialog.close();
    document.getElementById('top').scrollIntoView({ behavior: 'auto', block: 'start' });
  });
})();
