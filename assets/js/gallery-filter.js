document.addEventListener('DOMContentLoaded', function () {
    const buttons = document.querySelectorAll('#filters button');
    const galleryItems = document.querySelectorAll('.gallery a');
  
    buttons.forEach(button => {
      button.addEventListener('click', function () {
        const filter = this.getAttribute('data-filter');
  
        galleryItems.forEach(item => {
          const tags = item.getAttribute('data-tags').split(',');
  
          // Show or hide items based on the selected filter
          if (filter === 'all' || tags.includes(filter)) {
            item.style.display = 'block'; // Show item
          } else {
            item.style.display = 'none'; // Hide item
          }
        });
  
        // Highlight the active button (optional)
        buttons.forEach(btn => btn.classList.remove('active'));
        this.classList.add('active');
      });
    });
  });
  